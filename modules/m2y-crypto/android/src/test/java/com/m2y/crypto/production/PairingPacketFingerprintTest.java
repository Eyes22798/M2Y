package com.m2y.crypto.production;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import org.junit.Test;

public final class PairingPacketFingerprintTest {
  private static final String REQUEST_ID = "2f2f6b31-1f4d-4b0b-9d0f-1a7e4c9a55f2";

  @Test
  public void fingerprintIsStableLowercaseHexForTheSamePacket() throws Exception {
    byte[] packet = "packet".getBytes(StandardCharsets.UTF_8);

    String first = PairingPacketFingerprint.ofPacket(REQUEST_ID, packet);
    String second = PairingPacketFingerprint.ofPacket(REQUEST_ID, packet);

    assertEquals(first, second);
    assertEquals(64, first.length());
    assertTrue(first.matches("^[0-9a-f]{64}$"));
  }

  @Test
  public void samePacketUnderADifferentRequestIsADifferentFingerprint() throws Exception {
    byte[] packet = "packet".getBytes(StandardCharsets.UTF_8);

    assertNotEquals(
        PairingPacketFingerprint.ofPacket(REQUEST_ID, packet),
        PairingPacketFingerprint.ofPacket("11111111-1111-4111-8111-111111111111", packet));
  }

  /**
   * Length prefixing is the reason this holds: without it, moving a byte from the end of the request
   * id to the front of the packet would hash the same input and let a peer suppress a later packet.
   */
  @Test
  public void movingBytesBetweenTheRequestAndThePacketChangesTheFingerprint() throws Exception {
    assertNotEquals(
        PairingPacketFingerprint.ofPacket("ab", "cd".getBytes(StandardCharsets.UTF_8)),
        PairingPacketFingerprint.ofPacket("a", "bcd".getBytes(StandardCharsets.UTF_8)));
  }

  @Test
  public void emptyInputIsRejectedWithASafeCode() {
    ProductionIdentityException missingPacket =
        assertThrows(
            ProductionIdentityException.class,
            () -> PairingPacketFingerprint.ofPacket(REQUEST_ID, new byte[0]));
    ProductionIdentityException missingRequest =
        assertThrows(
            ProductionIdentityException.class,
            () -> PairingPacketFingerprint.ofPacket(null, "packet".getBytes(StandardCharsets.UTF_8)));

    assertEquals("pairing-packet-invalid", missingPacket.safeCode());
    assertEquals("pairing-packet-invalid", missingRequest.safeCode());
  }

  @Test
  public void aPeerIdentityFingerprintIsStableAndBoundedForRelationshipStorage() throws Exception {
    String key = "BXk3ZGVtb0lkZW50aXR5S2V5QmFzZTY0VXJs";

    String fingerprint = PairingPacketFingerprint.ofPeerIdentity(key);

    assertEquals(fingerprint, PairingPacketFingerprint.ofPeerIdentity(key));
    assertTrue(fingerprint.matches("^[0-9a-f]{64}$"));
    assertNotEquals(fingerprint, PairingPacketFingerprint.ofPeerIdentity(key + "A"));
  }

  /**
   * The domain string is what keeps the two fingerprint spaces apart. Without it a peer identity key
   * that happened to equal a request id could produce a value usable in the other table.
   */
  @Test
  public void packetAndPeerIdentityFingerprintsLiveInSeparateDomains() throws Exception {
    assertNotEquals(
        PairingPacketFingerprint.ofPeerIdentity("shared"),
        PairingPacketFingerprint.ofPacket("shared", new byte[] {(byte) 1}));
  }

  @Test
  public void anEmptyPeerIdentityKeyCannotProduceARelationshipFingerprint() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class, () -> PairingPacketFingerprint.ofPeerIdentity(""));

    assertEquals("pairing-relationship-invalid", failure.safeCode());
  }
}
