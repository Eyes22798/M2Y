package com.m2y.crypto;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import java.io.FileOutputStream;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.UUID;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class AndroidKeystoreCheckpointInstrumentedTest {
  private static final String KEY_ALIAS = "m2y.e2ee.spike.checkpoint-key.v1";
  private static final String FILE_NAME = "m2y-e2ee-spike-checkpoint-v1.bin";

  private AndroidKeystoreCheckpoint checkpoint;
  private Context context;

  @Before
  public void setUp() throws Exception {
    context = ApplicationProvider.getApplicationContext();
    checkpoint = new AndroidKeystoreCheckpoint(context);
    forceCleanup();
  }

  @After
  public void tearDown() throws Exception {
    forceCleanup();
  }

  @Test
  public void badAuthenticationTagFailsClosed() throws Exception {
    String runId = createCheckpoint();
    File file = checkpointFile();
    byte[] bytes = java.nio.file.Files.readAllBytes(file.toPath());
    bytes[bytes.length - 1] ^= 0x01;
    writeRaw(file, bytes);

    assertCheckpointCode("checkpoint-corrupt", () -> checkpoint.load(runId));
  }

  @Test
  public void truncatedEnvelopeFailsClosed() throws Exception {
    String runId = createCheckpoint();
    File file = checkpointFile();
    byte[] bytes = java.nio.file.Files.readAllBytes(file.toPath());
    writeRaw(file, Arrays.copyOf(bytes, 8));

    assertCheckpointCode("checkpoint-corrupt", () -> checkpoint.load(runId));
  }

  @Test
  public void missingAliasFailsClosed() throws Exception {
    String runId = createCheckpoint();
    deleteKey();

    assertCheckpointCode("checkpoint-key-missing", () -> checkpoint.load(runId));
  }

  @Test
  public void cleanupWithWrongRunIdKeepsCommittedMaterial() throws Exception {
    String runId = createCheckpoint();

    assertCheckpointCode(
        "checkpoint-run-mismatch",
        () -> checkpoint.cleanup(UUID.randomUUID().toString()));
    assertEquals(runId, checkpoint.currentRunId());
    assertEquals(1, checkpoint.load(runId).revision());
  }

  @Test
  public void encryptedAtomicCheckpointSurvivesFailureAndCleansUp() throws Exception {
    String runId = UUID.randomUUID().toString();
    M2YCheckpointState working = M2YCheckpointState.createFresh(runId);
    LibsignalProtocolProbe.runFreshChecks(working);
    M2YCheckpointState revisionOne = working.advanced();
    checkpoint.create(revisionOne);

    assertEquals(runId, checkpoint.currentRunId());
    assertEquals(1, checkpoint.load(runId).revision());

    M2YCheckpointState interrupted = checkpoint.load(runId).workingCopy();
    LibsignalProtocolProbe.runResumeChecks(interrupted);
    try {
      checkpoint.simulateFailedCommit(interrupted.advanced());
      assertFalse("fault injection must fail", true);
    } catch (CheckpointException expected) {
      assertEquals("checkpoint-write-failed", expected.safeCode());
    }
    assertEquals(1, checkpoint.load(runId).revision());

    checkpoint.cleanup(runId);
    assertNull(checkpoint.currentRunId());
  }

  private String createCheckpoint() throws Exception {
    String runId = UUID.randomUUID().toString();
    checkpoint.create(M2YCheckpointState.createFresh(runId).advanced());
    return runId;
  }

  private File checkpointFile() {
    return new File(context.getNoBackupFilesDir(), FILE_NAME);
  }

  private static void writeRaw(File file, byte[] bytes) throws Exception {
    try (FileOutputStream output = new FileOutputStream(file, false)) {
      output.write(bytes);
      output.getFD().sync();
    }
  }

  private static void assertCheckpointCode(String expectedCode, ThrowingOperation operation)
      throws Exception {
    try {
      operation.run();
      assertFalse("operation must fail closed", true);
    } catch (CheckpointException expected) {
      assertEquals(expectedCode, expected.safeCode());
    }
  }

  private void forceCleanup() throws Exception {
    File file = checkpointFile();
    if (file.exists()) {
      assertFalse("checkpoint file must be deletable", !file.delete());
    }
    deleteKey();
  }

  private static void deleteKey() throws Exception {
    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
    keyStore.load(null);
    if (keyStore.containsAlias(KEY_ALIAS)) {
      keyStore.deleteEntry(KEY_ALIAS);
    }
  }

  private interface ThrowingOperation {
    void run() throws Exception;
  }
}
