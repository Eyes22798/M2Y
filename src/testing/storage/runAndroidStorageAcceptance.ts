import { Platform } from 'react-native';

import type { WorkspaceSession } from '@/application/workspace/contracts';
import { SqlCipherDatabase } from '@/data/sqlite/SqlCipherDatabase';
import { ExpoSecureRandom } from '@/native/random/ExpoSecureRandom';

export type StorageAcceptanceCheck = Readonly<{
  code: string;
  passed: boolean;
}>;

export async function runAndroidStorageAcceptance(): Promise<readonly StorageAcceptanceCheck[]> {
  if (Platform.OS !== 'android') return [{ code: 'android-runtime-required', passed: false }];

  const random = new ExpoSecureRandom();
  const databaseName = `m2y-storage-check-${random.createId('installation')}.db`;
  const manager = new SqlCipherDatabase(
    {
      nowMs: Date.now,
      createId: (scope) => random.createId(scope),
    },
    databaseName,
  );
  const checks: StorageAcceptanceCheck[] = [];
  let activeSession: WorkspaceSession | null = null;

  try {
    const key = await random.generateDatabaseKey();
    const firstOpen = await manager.open(key);
    checks.push({ code: 'sqlcipher-create-and-migrate-v1', passed: firstOpen.ok });
    if (!firstOpen.ok) return checks;
    activeSession = firstOpen.session;
    await activeSession.close();
    activeSession = null;

    const reopen = await manager.open(key);
    checks.push({ code: 'correct-key-reopen-and-idempotent-migration', passed: reopen.ok });
    if (!reopen.ok) return checks;
    activeSession = reopen.session;
    await activeSession.close();
    activeSession = null;

    const wrongKey = await random.generateDatabaseKey();
    const wrongOpen = await manager.open(wrongKey);
    checks.push({
      code: 'wrong-key-rejected',
      passed: !wrongOpen.ok && wrongOpen.kind === 'recovery',
    });
    if (wrongOpen.ok) {
      activeSession = wrongOpen.session;
      await activeSession.close();
      activeSession = null;
    }

    const finalReopen = await manager.open(key);
    checks.push({ code: 'database-survives-wrong-key-attempt', passed: finalReopen.ok });
    if (finalReopen.ok) {
      activeSession = finalReopen.session;
      await activeSession.close();
      activeSession = null;
    }
  } catch {
    checks.push({ code: 'unexpected-redacted-failure', passed: false });
  } finally {
    if (activeSession) {
      try {
        await activeSession.close();
      } catch {
        checks.push({ code: 'temporary-session-close', passed: false });
      }
    }
    const deleted = await manager.deleteDatabase();
    const presence = await manager.databaseExists();
    checks.push({
      code: 'temporary-database-cleanup',
      passed: deleted.ok && presence.kind === 'absent',
    });
  }
  return checks;
}
