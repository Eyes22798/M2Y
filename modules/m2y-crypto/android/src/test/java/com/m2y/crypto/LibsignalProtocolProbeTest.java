package com.m2y.crypto;

import static org.junit.Assert.assertEquals;

import java.util.List;
import java.util.UUID;
import org.junit.Test;

public final class LibsignalProtocolProbeTest {
  @Test
  public void freshScenarioCoversPqxdhAndFailClosedSemantics() throws Exception {
    M2YCheckpointState state = M2YCheckpointState.createFresh(UUID.randomUUID().toString());

    assertEquals(
        List.of(
            "pqxdh-session-established",
            "pre-key-message-decrypted",
            "ratcheted-reply-decrypted",
            "fingerprint-match",
            "corrupt-ciphertext-rejected",
            "duplicate-message-rejected",
            "identity-change-rejected"),
        LibsignalProtocolProbe.runFreshChecks(state));
  }

  @Test
  public void negativeScenarioRejectsMutationsAndAcceptsWindowedReordering() throws Exception {
    M2YCheckpointState state = M2YCheckpointState.createFresh(UUID.randomUUID().toString());
    LibsignalProtocolProbe.runFreshChecks(state);

    assertEquals(
        List.of(
            "out-of-order-window-accepted",
            "duplicate-message-rejected",
            "corrupt-ciphertext-rejected",
            "identity-change-rejected",
            "fingerprint-change-visible"),
        LibsignalProtocolProbe.runNegativeChecks(state));
  }
}
