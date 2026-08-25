import { Platform } from 'react-native';

import type { PublicConfigResult } from '@/application/config/contracts';
import type { IdentityRelationshipController } from '@/application/identity/contracts';
import { DefaultIdentityRelationshipController } from '@/application/identity/controller';
import type { SecureWorkspaceController } from '@/application/secure-workspace/contracts';
import { DefaultSecureWorkspaceController } from '@/application/secure-workspace/controller';
import { ExpoDatabaseKeyStore } from '@/data/secure-store/ExpoDatabaseKeyStore';
import { SqlCipherDatabase } from '@/data/sqlite/SqlCipherDatabase';
import { ExpoPublicConfigReader } from '@/native/config/ExpoPublicConfigReader';
import { M2YCryptoLocalDataResetter } from '@/native/crypto/M2YCryptoLocalDataResetter';
import { M2YCryptoProductionIdentityPort } from '@/native/crypto/M2YCryptoProductionIdentityPort';
import { ExpoSecureRandom } from '@/native/random/ExpoSecureRandom';

export type AppRuntime = Readonly<{
  identityRelationshipController: IdentityRelationshipController;
  publicConfig: PublicConfigResult;
  secureWorkspaceController: SecureWorkspaceController;
}>;

/**
 * The public config is read once here rather than per screen: a binary's pairing endpoint cannot
 * change while it runs, and reading it in one place keeps the "is pairing available at all" decision
 * from being re-derived — differently — somewhere else.
 */
export function createAppRuntime(): AppRuntime {
  const random = new ExpoSecureRandom();
  const databaseManager = new SqlCipherDatabase({
    nowMs: Date.now,
    createId: (scope) => random.createId(scope),
  });
  return {
    identityRelationshipController: new DefaultIdentityRelationshipController({
      identityStore: new M2YCryptoProductionIdentityPort(),
    }),
    publicConfig: new ExpoPublicConfigReader().readPublicConfig(),
    secureWorkspaceController: new DefaultSecureWorkspaceController({
      keyStore: new ExpoDatabaseKeyStore(),
      databaseManager,
      keyGenerator: random,
      localCryptoDataResetter: new M2YCryptoLocalDataResetter(),
      platformSupported: Platform.OS === 'android',
    }),
  };
}
