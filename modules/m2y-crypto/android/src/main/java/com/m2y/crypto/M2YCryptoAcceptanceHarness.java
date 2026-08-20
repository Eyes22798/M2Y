package com.m2y.crypto;

import android.content.Context;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;

/** Serializes the development-only acceptance workflow around one encrypted checkpoint. */
final class M2YCryptoAcceptanceHarness {
  private static final ReentrantLock OPERATION_LOCK = new ReentrantLock();

  private final Context context;
  private final AndroidKeystoreCheckpoint checkpoint;

  M2YCryptoAcceptanceHarness(Context context) {
    this.context = context.getApplicationContext();
    checkpoint = new AndroidKeystoreCheckpoint(this.context);
  }

  String findPendingRunId() throws CheckpointException {
    OPERATION_LOCK.lock();
    try {
      return checkpoint.currentRunId();
    } finally {
      OPERATION_LOCK.unlock();
    }
  }

  Map<String, Object> runFresh() throws Exception {
    OPERATION_LOCK.lock();
    String runId = UUID.randomUUID().toString();
    try {
      M2YCheckpointState state = M2YCheckpointState.createFresh(runId);
      ArrayList<String> checks = new ArrayList<>(LibsignalProtocolProbe.runFreshChecks(state));
      M2YCheckpointState committed = state.advanced();
      checkpoint.create(committed);
      checks.add("checkpoint-encrypted-committed");
      return passed("fresh", "fresh-pqxdh-checkpoint-verified", committed, checks);
    } catch (CheckpointException e) {
      return failed("fresh", e.safeCode(), runId);
    } finally {
      OPERATION_LOCK.unlock();
    }
  }

  Map<String, Object> runResume(String runId) throws Exception {
    OPERATION_LOCK.lock();
    try {
      M2YCheckpointState committed = checkpoint.load(runId);
      M2YCheckpointState working = committed.workingCopy();
      ArrayList<String> checks = new ArrayList<>(LibsignalProtocolProbe.runResumeChecks(working));
      M2YCheckpointState next = working.advanced();
      checkpoint.commit(next);
      checks.add("checkpoint-updated-atomically");
      return passed("resume", "resume-checkpoint-verified", next, checks);
    } catch (CheckpointException e) {
      return failed("resume", e.safeCode(), runId);
    } finally {
      OPERATION_LOCK.unlock();
    }
  }

  Map<String, Object> runNegative(String runId) throws Exception {
    OPERATION_LOCK.lock();
    try {
      M2YCheckpointState committed = checkpoint.load(runId);
      int committedRevision = committed.revision();
      M2YCheckpointState interrupted = committed.workingCopy();
      LibsignalProtocolProbe.runResumeChecks(interrupted);

      try {
        checkpoint.simulateFailedCommit(interrupted.advanced());
        throw new IllegalStateException("failure-injection-was-accepted");
      } catch (CheckpointException expected) {
        if (!"checkpoint-write-failed".equals(expected.safeCode())) {
          throw expected;
        }
      }

      M2YCheckpointState restored = checkpoint.load(runId);
      if (restored.revision() != committedRevision) {
        throw new IllegalStateException("checkpoint-rollback-failed");
      }

      ArrayList<String> checks = new ArrayList<>();
      checks.add("checkpoint-write-failure-injected");
      checks.add("checkpoint-write-rollback-verified");
      M2YCheckpointState working = restored.workingCopy();
      checks.addAll(LibsignalProtocolProbe.runNegativeChecks(working));
      M2YCheckpointState next = working.advanced();
      checkpoint.commit(next);
      checks.add("checkpoint-updated-atomically");
      return passed("negative", "negative-cases-verified", next, checks);
    } catch (CheckpointException e) {
      return failed("negative", e.safeCode(), runId);
    } finally {
      OPERATION_LOCK.unlock();
    }
  }

  Map<String, Object> runPerformance(String runId) throws Exception {
    OPERATION_LOCK.lock();
    try {
      M2YCheckpointState committed = checkpoint.load(runId);
      M2YCheckpointState working = committed.workingCopy();
      LibsignalPerformanceProbe.Result performance =
          LibsignalPerformanceProbe.run(context, working);
      ArrayList<String> checks = new ArrayList<>(performance.checks());
      M2YCheckpointState next = working.advanced();
      checkpoint.commit(next);
      checks.add("checkpoint-updated-atomically");

      LinkedHashMap<String, Object> result = new LinkedHashMap<>();
      result.put("checks", List.copyOf(checks));
      result.put("code", "performance-verified");
      result.put("metrics", performance.metrics());
      result.put("revision", next.revision());
      result.put("runId", next.runId());
      result.put("stage", "performance");
      result.put("status", "passed");
      return Map.copyOf(result);
    } catch (CheckpointException e) {
      return failed("performance", e.safeCode(), runId);
    } finally {
      OPERATION_LOCK.unlock();
    }
  }

  Map<String, Object> cleanup(String runId) {
    OPERATION_LOCK.lock();
    try {
      checkpoint.cleanup(runId);
      LinkedHashMap<String, Object> result = new LinkedHashMap<>();
      result.put("checks", List.of("checkpoint-and-key-cleaned"));
      result.put("code", "acceptance-state-cleaned");
      result.put("runId", runId);
      result.put("stage", "cleanup");
      result.put("status", "passed");
      return Map.copyOf(result);
    } catch (CheckpointException e) {
      return failed("cleanup", e.safeCode(), runId);
    } finally {
      OPERATION_LOCK.unlock();
    }
  }

  private static Map<String, Object> passed(
      String stage, String code, M2YCheckpointState state, List<String> checks) {
    LinkedHashMap<String, Object> result = new LinkedHashMap<>();
    result.put("checks", List.copyOf(checks));
    result.put("code", code);
    result.put("revision", state.revision());
    result.put("runId", state.runId());
    result.put("stage", stage);
    result.put("status", "passed");
    return Map.copyOf(result);
  }

  private static Map<String, Object> failed(String stage, String code, String runId) {
    LinkedHashMap<String, Object> result = new LinkedHashMap<>();
    result.put("code", code);
    result.put("runId", runId);
    result.put("stage", stage);
    result.put("status", "failed");
    return Map.copyOf(result);
  }
}
