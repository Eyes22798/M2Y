package com.m2y.crypto;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.Test;

public final class M2YCheckpointStateTest {
  @Test
  public void serializedSessionReopensAndContinues() throws Exception {
    M2YCheckpointState fresh = M2YCheckpointState.createFresh(UUID.randomUUID().toString());
    LibsignalProtocolProbe.runFreshChecks(fresh);

    M2YCheckpointState reopened = M2YCheckpointState.fromBytes(fresh.toBytes());

    assertEquals(
        List.of(
            "checkpoint-reopened",
            "resumed-alice-to-bob",
            "resumed-bob-to-alice",
            "fingerprint-stable"),
        LibsignalProtocolProbe.runResumeChecks(reopened));
  }

  @Test
  public void workingCopyMutationDoesNotChangeCommittedState() throws Exception {
    M2YCheckpointState committed = M2YCheckpointState.createFresh(UUID.randomUUID().toString());
    LibsignalProtocolProbe.runFreshChecks(committed);
    byte[] before = committed.toBytes();

    M2YCheckpointState working = committed.workingCopy();
    LibsignalProtocolProbe.runResumeChecks(working);

    assertArrayEquals(before, committed.toBytes());
  }

  @Test(expected = SnapshotFormatException.class)
  public void unknownSnapshotVersionFailsClosed() throws Exception {
    M2YCheckpointState state = M2YCheckpointState.createFresh(UUID.randomUUID().toString());
    String json = new String(state.toBytes(), StandardCharsets.UTF_8);
    M2YCheckpointState.fromBytes(
        json.replace("\"schemaVersion\":1", "\"schemaVersion\":2")
            .getBytes(StandardCharsets.UTF_8));
  }

  @Test(expected = SnapshotFormatException.class)
  public void unknownSnapshotFieldFailsClosed() throws Exception {
    M2YCheckpointState state = M2YCheckpointState.createFresh(UUID.randomUUID().toString());
    String json = new String(state.toBytes(), StandardCharsets.UTF_8);
    M2YCheckpointState.fromBytes(
        (json.substring(0, json.length() - 1) + ",\"privateKey\":\"forbidden\"}")
            .getBytes(StandardCharsets.UTF_8));
  }
}
