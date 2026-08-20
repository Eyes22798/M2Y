package com.m2y.crypto;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Android Keystore AES-GCM envelope with crash-safe AtomicFile replacement. */
final class AndroidKeystoreCheckpoint {
  private static final String KEYSTORE = "AndroidKeyStore";
  private static final String KEY_ALIAS = "m2y.e2ee.spike.checkpoint-key.v1";
  private static final String FILE_NAME = "m2y-e2ee-spike-checkpoint-v1.bin";
  private static final byte[] MAGIC = "M2YE2EE1".getBytes(StandardCharsets.US_ASCII);
  private static final int ENVELOPE_VERSION = 1;
  private static final int GCM_TAG_BITS = 128;
  private static final int MAX_ENVELOPE_BYTES = 32 * 1024 * 1024;
  private static final int MAX_RUN_ID_BYTES = 64;
  private static final int MAX_IV_BYTES = 32;

  private final AtomicFile atomicFile;

  AndroidKeystoreCheckpoint(Context context) {
    this.atomicFile = new AtomicFile(new File(context.getNoBackupFilesDir(), FILE_NAME));
  }

  void create(M2YCheckpointState state) throws CheckpointException {
    if (atomicFile.getBaseFile().exists()) {
      throw new CheckpointException("checkpoint-already-exists");
    }
    if (hasKey()) {
      throw new CheckpointException("checkpoint-key-orphaned");
    }

    generateKey();
    try {
      writeEncrypted(state, false);
    } catch (CheckpointException e) {
      deleteKeyBestEffort();
      throw e;
    }
  }

  M2YCheckpointState load(String expectedRunId) throws CheckpointException {
    if (!atomicFile.getBaseFile().exists()) {
      throw new CheckpointException("checkpoint-missing");
    }
    if (!hasKey()) {
      throw new CheckpointException("checkpoint-key-missing");
    }

    Envelope envelope = readEnvelope();
    if (!envelope.runId().equals(expectedRunId)) {
      throw new CheckpointException("checkpoint-run-mismatch");
    }

    byte[] plaintext = null;
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, requireKey(), new GCMParameterSpec(GCM_TAG_BITS, envelope.iv()));
      cipher.updateAAD(aad(envelope.runId()));
      plaintext = cipher.doFinal(envelope.ciphertext());
      M2YCheckpointState state = M2YCheckpointState.fromBytes(plaintext);
      if (!state.runId().equals(expectedRunId)) {
        throw new CheckpointException("checkpoint-corrupt");
      }
      return state;
    } catch (AEADBadTagException e) {
      throw new CheckpointException("checkpoint-corrupt");
    } catch (GeneralSecurityException | IOException | SnapshotFormatException e) {
      throw new CheckpointException("checkpoint-corrupt");
    } finally {
      if (plaintext != null) {
        Arrays.fill(plaintext, (byte) 0);
      }
    }
  }

  String currentRunId() throws CheckpointException {
    if (!atomicFile.getBaseFile().exists()) {
      return null;
    }
    return readEnvelope().runId();
  }

  void commit(M2YCheckpointState state) throws CheckpointException {
    requireExistingRun(state.runId());
    writeEncrypted(state, false);
  }

  void simulateFailedCommit(M2YCheckpointState state) throws CheckpointException {
    requireExistingRun(state.runId());
    writeEncrypted(state, true);
  }

  void cleanup(String expectedRunId) throws CheckpointException {
    if (atomicFile.getBaseFile().exists()) {
      Envelope envelope = readEnvelope();
      if (!envelope.runId().equals(expectedRunId)) {
        throw new CheckpointException("checkpoint-run-mismatch");
      }
      atomicFile.delete();
      if (atomicFile.getBaseFile().exists()) {
        throw new CheckpointException("checkpoint-cleanup-failed");
      }
    }

    try {
      KeyStore keyStore = loadKeyStore();
      if (keyStore.containsAlias(KEY_ALIAS)) {
        keyStore.deleteEntry(KEY_ALIAS);
      }
    } catch (GeneralSecurityException | IOException e) {
      throw new CheckpointException("checkpoint-cleanup-failed");
    }
  }

  private void writeEncrypted(M2YCheckpointState state, boolean simulateFailure)
      throws CheckpointException {
    if (!hasKey()) {
      throw new CheckpointException("checkpoint-key-missing");
    }

    byte[] plaintext = null;
    try {
      plaintext = state.toBytes();
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, requireKey());
      cipher.updateAAD(aad(state.runId()));
      byte[] ciphertext = cipher.doFinal(plaintext);
      byte[] envelope = encodeEnvelope(state.runId(), cipher.getIV(), ciphertext);
      writeAtomically(envelope, simulateFailure);
    } catch (GeneralSecurityException | IOException | SnapshotFormatException e) {
      throw new CheckpointException("checkpoint-write-failed");
    } finally {
      if (plaintext != null) {
        Arrays.fill(plaintext, (byte) 0);
      }
    }
  }

  private void writeAtomically(byte[] bytes, boolean simulateFailure) throws CheckpointException {
    FileOutputStream stream = null;
    try {
      stream = atomicFile.startWrite();
      if (simulateFailure) {
        stream.write(bytes, 0, Math.max(1, bytes.length / 2));
        atomicFile.failWrite(stream);
        stream = null;
        throw new CheckpointException("checkpoint-write-failed");
      }
      stream.write(bytes);
      atomicFile.finishWrite(stream);
    } catch (CheckpointException e) {
      throw e;
    } catch (IOException e) {
      if (stream != null) {
        atomicFile.failWrite(stream);
      }
      throw new CheckpointException("checkpoint-write-failed");
    }
  }

  private Envelope readEnvelope() throws CheckpointException {
    try {
      byte[] bytes = atomicFile.readFully();
      if (bytes.length == 0 || bytes.length > MAX_ENVELOPE_BYTES) {
        throw new CheckpointException("checkpoint-corrupt");
      }
      DataInputStream input = new DataInputStream(new ByteArrayInputStream(bytes));
      byte[] magic = input.readNBytes(MAGIC.length);
      if (!MessageBytes.equal(magic, MAGIC) || input.readInt() != ENVELOPE_VERSION) {
        throw new CheckpointException("checkpoint-corrupt");
      }

      int runIdLength = input.readInt();
      if (runIdLength <= 0 || runIdLength > MAX_RUN_ID_BYTES) {
        throw new CheckpointException("checkpoint-corrupt");
      }
      String runId = new String(input.readNBytes(runIdLength), StandardCharsets.UTF_8);
      if (
          runId.getBytes(StandardCharsets.UTF_8).length != runIdLength
              || !UUID.fromString(runId).toString().equals(runId)) {
        throw new CheckpointException("checkpoint-corrupt");
      }

      int ivLength = input.readInt();
      if (ivLength <= 0 || ivLength > MAX_IV_BYTES) {
        throw new CheckpointException("checkpoint-corrupt");
      }
      byte[] iv = input.readNBytes(ivLength);

      int ciphertextLength = input.readInt();
      if (ciphertextLength <= GCM_TAG_BITS / 8 || ciphertextLength > MAX_ENVELOPE_BYTES) {
        throw new CheckpointException("checkpoint-corrupt");
      }
      byte[] ciphertext = input.readNBytes(ciphertextLength);
      if (
          magic.length != MAGIC.length
              || iv.length != ivLength
              || ciphertext.length != ciphertextLength
              || input.available() != 0) {
        throw new CheckpointException("checkpoint-corrupt");
      }
      return new Envelope(runId, iv, ciphertext);
    } catch (EOFException | IllegalArgumentException e) {
      throw new CheckpointException("checkpoint-corrupt");
    } catch (IOException e) {
      throw new CheckpointException("checkpoint-read-failed");
    }
  }

  private void requireExistingRun(String runId) throws CheckpointException {
    if (!atomicFile.getBaseFile().exists()) {
      throw new CheckpointException("checkpoint-missing");
    }
    if (!readEnvelope().runId().equals(runId)) {
      throw new CheckpointException("checkpoint-run-mismatch");
    }
  }

  private static byte[] encodeEnvelope(String runId, byte[] iv, byte[] ciphertext)
      throws CheckpointException {
    byte[] runIdBytes = runId.getBytes(StandardCharsets.UTF_8);
    try {
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      DataOutputStream output = new DataOutputStream(bytes);
      output.write(MAGIC);
      output.writeInt(ENVELOPE_VERSION);
      output.writeInt(runIdBytes.length);
      output.write(runIdBytes);
      output.writeInt(iv.length);
      output.write(iv);
      output.writeInt(ciphertext.length);
      output.write(ciphertext);
      output.flush();
      byte[] envelope = bytes.toByteArray();
      if (envelope.length > MAX_ENVELOPE_BYTES) {
        throw new CheckpointException("checkpoint-write-failed");
      }
      return envelope;
    } catch (IOException e) {
      throw new CheckpointException("checkpoint-write-failed");
    }
  }

  private static byte[] aad(String runId) {
    return ("M2YE2EE1|" + ENVELOPE_VERSION + "|" + runId).getBytes(StandardCharsets.UTF_8);
  }

  private static void generateKey() throws CheckpointException {
    try {
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
      generator.init(
          new KeyGenParameterSpec.Builder(
                  KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .setKeySize(256)
              .setRandomizedEncryptionRequired(true)
              .build());
      generator.generateKey();
    } catch (GeneralSecurityException e) {
      throw new CheckpointException("checkpoint-key-unavailable");
    }
  }

  private static SecretKey requireKey() throws GeneralSecurityException, IOException {
    SecretKey key = (SecretKey) loadKeyStore().getKey(KEY_ALIAS, null);
    if (key == null) {
      throw new GeneralSecurityException("checkpoint-key-missing");
    }
    return key;
  }

  private static boolean hasKey() throws CheckpointException {
    try {
      return loadKeyStore().containsAlias(KEY_ALIAS);
    } catch (GeneralSecurityException | IOException e) {
      throw new CheckpointException("checkpoint-key-unavailable");
    }
  }

  private static KeyStore loadKeyStore() throws GeneralSecurityException, IOException {
    KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
    keyStore.load(null);
    return keyStore;
  }

  private static void deleteKeyBestEffort() {
    try {
      KeyStore keyStore = loadKeyStore();
      if (keyStore.containsAlias(KEY_ALIAS)) {
        keyStore.deleteEntry(KEY_ALIAS);
      }
    } catch (GeneralSecurityException | IOException ignored) {
      // The next fresh run reports the orphaned key and requires explicit cleanup.
    }
  }

  private record Envelope(String runId, byte[] iv, byte[] ciphertext) {}
}

final class CheckpointException extends Exception {
  private final String safeCode;

  CheckpointException(String safeCode) {
    super(safeCode);
    this.safeCode = safeCode;
  }

  String safeCode() {
    return safeCode;
  }
}

final class MessageBytes {
  private MessageBytes() {}

  static boolean equal(byte[] first, byte[] second) {
    return java.security.MessageDigest.isEqual(first, second);
  }
}
