import { Platform } from 'react-native';

import type { SecureWorkspaceController } from '@/application/secure-workspace/contracts';
import { DefaultSecureWorkspaceController } from '@/application/secure-workspace/controller';
import { ExpoDatabaseKeyStore } from '@/data/secure-store/ExpoDatabaseKeyStore';
import { SqlCipherDatabase } from '@/data/sqlite/SqlCipherDatabase';
import { ExpoSecureRandom } from '@/native/random/ExpoSecureRandom';

export type AppRuntime = Readonly<{
  secureWorkspaceController: SecureWorkspaceController;
}>;

export function createAppRuntime(): AppRuntime {
  const random = new ExpoSecureRandom();
  const databaseManager = new SqlCipherDatabase({
    nowMs: Date.now,
    createId: (scope) => random.createId(scope),
  });
  return {
    secureWorkspaceController: new DefaultSecureWorkspaceController({
      keyStore: new ExpoDatabaseKeyStore(),
      databaseManager,
      keyGenerator: random,
      platformSupported: Platform.OS === 'android',
    }),
  };
}
