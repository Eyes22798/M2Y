import type { PublicConfigCode, PublicConfigResult } from '@/application/config/contracts';
import type { IdentityRelationshipState } from '@/domain/identity/types';

export type WorkspaceAccess =
  | Readonly<{ kind: 'granted'; reason: 'active-relationship' }>
  | Readonly<{
      kind: 'granted';
      reason: 'pairing-transport-unavailable';
      code: PublicConfigCode | 'placeholder-host';
    }>
  | Readonly<{ kind: 'blocked' }>;

/**
 * Decides whether the private workspace screens may mount.
 *
 * The target rule is the strict one: only an `active` relationship opens the workspace. It cannot be
 * the only rule yet, because registration needs a server-issued receipt and no pairing service is
 * reachable in any shipped variant — a strict gate would strand every install in `registering` and
 * destroy the one working local loop.
 *
 * So the transitional allowance is tied to a fact the binary can check at runtime rather than to a
 * build flag: if there is no usable pairing endpoint, pairing is not a feature this build has, and
 * the local workspace stays reachable. Configure a real HTTPS endpoint and the strict rule engages
 * on its own, with no code change here.
 *
 * A broken `extra` block also counts as "no endpoint" instead of blocking: the public config governs
 * pairing only, so a malformed URL must not cost the user access to data already on the device. The
 * reason code is carried out of this function so the condition stays reportable rather than silent.
 */
export function decideWorkspaceAccess(
  state: IdentityRelationshipState,
  config: PublicConfigResult,
): WorkspaceAccess {
  if (state.status === 'active') {
    return { kind: 'granted', reason: 'active-relationship' };
  }
  if (!config.ok) {
    return { kind: 'granted', reason: 'pairing-transport-unavailable', code: config.code };
  }
  if (config.config.pairingEndpoint.kind === 'placeholder') {
    return { kind: 'granted', reason: 'pairing-transport-unavailable', code: 'placeholder-host' };
  }
  return { kind: 'blocked' };
}
