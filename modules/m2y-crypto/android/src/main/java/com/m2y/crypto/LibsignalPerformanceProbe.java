package com.m2y.crypto;

import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.signal.libsignal.protocol.SessionCipher;
import org.signal.libsignal.protocol.SignalProtocolAddress;
import org.signal.libsignal.protocol.message.CiphertextMessage;
import org.signal.libsignal.protocol.message.SignalMessage;

/** Measures the acceptance workload without returning plaintext, keys, ciphertext, or hashes. */
final class LibsignalPerformanceProbe {
  private static final int MESSAGE_COUNT = 1_000;
  private static final int ATTACHMENT_KEY_BYTES = 32;
  private static final int FILE_BYTES = 100 * 1024 * 1024;
  private static final int STREAM_BUFFER_BYTES = 1024 * 1024;
  private static final SignalProtocolAddress ALICE_ADDRESS =
      new SignalProtocolAddress("m2y-spike-alice", 1);
  private static final SignalProtocolAddress BOB_ADDRESS =
      new SignalProtocolAddress("m2y-spike-bob", 1);

  private LibsignalPerformanceProbe() {}

  static Result run(Context context, M2YCheckpointState state) throws Exception {
    SessionCipher aliceCipher =
        new SessionCipher(state.aliceStore(), ALICE_ADDRESS, BOB_ADDRESS);
    SessionCipher bobCipher =
        new SessionCipher(state.bobStore(), BOB_ADDRESS, ALICE_ADDRESS);
    long[] latenciesNanos = new long[MESSAGE_COUNT];
    Runtime runtime = Runtime.getRuntime();
    long memoryBefore = usedMemory(runtime);
    long totalStarted = System.nanoTime();

    for (int index = 0; index < MESSAGE_COUNT; index++) {
      byte[] plaintext = messageFor(index);
      long started = System.nanoTime();
      byte[] decrypted;
      if ((index & 1) == 0) {
        CiphertextMessage ciphertext = aliceCipher.encrypt(plaintext);
        decrypted = bobCipher.decrypt(new SignalMessage(ciphertext.serialize()));
      } else {
        CiphertextMessage ciphertext = bobCipher.encrypt(plaintext);
        decrypted = aliceCipher.decrypt(new SignalMessage(ciphertext.serialize()));
      }
      latenciesNanos[index] = System.nanoTime() - started;
      require(MessageDigest.isEqual(plaintext, decrypted), "performance-message-mismatch");
    }
    long totalNanos = System.nanoTime() - totalStarted;
    long memoryAfter = usedMemory(runtime);

    byte[] attachmentKey = new byte[ATTACHMENT_KEY_BYTES];
    new SecureRandom().nextBytes(attachmentKey);
    CiphertextMessage wrappedKey = aliceCipher.encrypt(attachmentKey);
    byte[] unwrappedKey = bobCipher.decrypt(new SignalMessage(wrappedKey.serialize()));
    require(MessageDigest.isEqual(attachmentKey, unwrappedKey), "attachment-key-mismatch");
    Arrays.fill(attachmentKey, (byte) 0);
    Arrays.fill(unwrappedKey, (byte) 0);

    streamFileRoundTrip(context);
    Arrays.sort(latenciesNanos);

    ArrayList<String> checks = new ArrayList<>();
    checks.add("1000-message-roundtrip");
    checks.add("latency-aggregated");
    checks.add("attachment-key-wrapped");
    checks.add("100mb-stream-roundtrip");
    checks.add("temp-file-cleaned");

    LinkedHashMap<String, Object> metrics = new LinkedHashMap<>();
    metrics.put("attachmentBytes", ATTACHMENT_KEY_BYTES);
    metrics.put("fileBytes", FILE_BYTES);
    metrics.put("memoryDeltaBytes", memoryAfter - memoryBefore);
    metrics.put("messageCount", MESSAGE_COUNT);
    metrics.put("p50Ms", nanosToMs(percentile(latenciesNanos, 0.50)));
    metrics.put("p95Ms", nanosToMs(percentile(latenciesNanos, 0.95)));
    metrics.put("totalMs", nanosToMs(totalNanos));
    return new Result(List.copyOf(checks), Map.copyOf(metrics));
  }

  private static void streamFileRoundTrip(Context context) throws Exception {
    File file = File.createTempFile("m2y-e2ee-acceptance-", ".bin", context.getCacheDir());
    boolean deleted;
    try {
      byte[] buffer = new byte[STREAM_BUFFER_BYTES];
      new SecureRandom().nextBytes(buffer);
      MessageDigest writeDigest = MessageDigest.getInstance("SHA-256");
      try (FileOutputStream output = new FileOutputStream(file)) {
        int remaining = FILE_BYTES;
        while (remaining > 0) {
          int count = Math.min(buffer.length, remaining);
          output.write(buffer, 0, count);
          writeDigest.update(buffer, 0, count);
          remaining -= count;
        }
        output.getFD().sync();
      }

      MessageDigest readDigest = MessageDigest.getInstance("SHA-256");
      long bytesRead = 0;
      try (FileInputStream input = new FileInputStream(file)) {
        int count;
        while ((count = input.read(buffer)) != -1) {
          readDigest.update(buffer, 0, count);
          bytesRead += count;
        }
      }
      require(bytesRead == FILE_BYTES, "stream-file-size-mismatch");
      require(
          MessageDigest.isEqual(writeDigest.digest(), readDigest.digest()),
          "stream-file-hash-mismatch");
      Arrays.fill(buffer, (byte) 0);
    } finally {
      deleted = !file.exists() || file.delete();
    }
    require(deleted && !file.exists(), "temp-file-cleanup-failed");
  }

  private static byte[] messageFor(int index) {
    return ByteBuffer.allocate(32)
        .putLong(0x4d32592d45454545L)
        .putInt(index)
        .putInt(index ^ 0x5a5a5a5a)
        .putLong(index * 31L)
        .putLong(~index)
        .array();
  }

  private static long usedMemory(Runtime runtime) {
    return runtime.totalMemory() - runtime.freeMemory();
  }

  private static long percentile(long[] sorted, double percentile) {
    int index = (int) Math.ceil(percentile * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  private static double nanosToMs(long nanos) {
    return nanos / 1_000_000.0;
  }

  private static void require(boolean condition, String code) {
    if (!condition) {
      throw new IllegalStateException(code);
    }
  }

  record Result(List<String> checks, Map<String, Object> metrics) {}
}
