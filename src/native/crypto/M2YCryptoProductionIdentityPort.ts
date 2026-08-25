import type {
  IdentityDraft,
  IdentityInspection,
  ProductionIdentityPort,
} from '@/application/identity/contracts';

import { toIdentityDraft, toIdentityInspection } from './production-identity-mapping';

/**
 * Binds the identity controller to the production native module. Rejections are left to propagate:
 * the adapter already collapses every native failure into `M2YCryptoProductionError`, and the
 * controller turns that into a fail-closed state instead of a partially trusted identity.
 *
 * The adapter is imported lazily, matching `M2YCryptoLocalDataResetter`: `requireNativeModule` runs
 * at module scope, so a static import would make every file that reaches this one unloadable
 * wherever the native module is absent.
 */
export class M2YCryptoProductionIdentityPort implements ProductionIdentityPort {
  async inspectIdentity(): Promise<IdentityInspection> {
    const { inspectM2YProductionIdentity } = await import('./M2YCryptoProductionAdapter');
    return toIdentityInspection(await inspectM2YProductionIdentity());
  }

  async prepareIdentity(displayName: string | null): Promise<IdentityDraft> {
    const { prepareM2YIdentityRegistration } = await import('./M2YCryptoProductionAdapter');
    return toIdentityDraft(await prepareM2YIdentityRegistration(displayName));
  }

  async resetIdentity(): Promise<void> {
    const { resetM2YProductionIdentity } = await import('./M2YCryptoProductionAdapter');
    await resetM2YProductionIdentity();
  }
}
