package com.m2y.crypto.production;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ProductionPairingPacketCodecTest {
  private static final String REQUEST_ID = "2d1f5c1e-9b0a-4d7f-8c3b-1a2b3c4d5e6f";
  private static final String DEVICE_ID = "8a1bf6aa-4a7a-4bed-9a43-835e74bf2241";
  private static final String STABLE_ID = "a73b209e-4866-4c08-a7dd-08a7389d3c46";

  @Test
  public void outgoingPacketRoundTripsWithoutProtocolSecrets() throws Exception {
    ProductionPairingPacketCodec.OutgoingPacket packet =
        new ProductionPairingPacketCodec.OutgoingPacket(
            1_800_000_000_000L,
            1_800_000_600_000L,
            "p".repeat(64),
            REQUEST_ID,
            DEVICE_ID,
            "M2Y-JKLM-NPQR-STUV-WXYZ",
            STABLE_ID);

    String encoded = ProductionPairingPacketCodec.encodeOutgoing(packet);

    assertEquals(packet, ProductionPairingPacketCodec.decodeOutgoing(encoded));
    assertFalse(encoded.contains("private"));
    assertFalse(encoded.contains("session"));
  }

  @Test
  public void handshakeKeepsOptionalDisplayNameInsideEncryptedPayload() throws Exception {
    ProductionPairingPacketCodec.Handshake handshake =
        new ProductionPairingPacketCodec.Handshake(
            REQUEST_ID,
            DEVICE_ID,
            "a".repeat(43),
            "M2Y-2345-6789-ABCD-EFGH",
            STABLE_ID,
            "用户",
            1_800_000_600_000L);
    String encoded =
        ProductionPairingPacketCodec.encodeHandshake(handshake);

    assertTrue(encoded.contains("\"senderDisplayName\":\"用户\""));
    assertEquals(handshake, ProductionPairingPacketCodec.decodeHandshake(encoded));
    assertThrows(
        ProductionIdentityException.class,
        () ->
            ProductionPairingPacketCodec.encodeHandshake(
                new ProductionPairingPacketCodec.Handshake(
                    REQUEST_ID,
                    DEVICE_ID,
                    "a".repeat(43),
                    "M2Y-2345-6789-ABCD-EFGH",
                    STABLE_ID,
                    "\u0000",
                    1_800_000_600_000L)));
    assertThrows(
        ProductionIdentityException.class,
        () ->
            ProductionPairingPacketCodec.decodeHandshake(
                encoded.substring(0, encoded.length() - 1) + ",\"secret\":true}"));
    assertThrows(
        ProductionIdentityException.class,
        () ->
            ProductionPairingPacketCodec.decodeHandshake(
                encoded.replace("\"schemaVersion\":1", "\"schemaVersion\":2")));
  }

  @Test
  public void outgoingPacketRejectsUnknownOrMalformedFields() {
    String valid =
        "{\"createdAtMs\":1800000000000,\"expiresAtMs\":1800000600000,"
            + "\"packet\":\""
            + "p".repeat(64)
            + "\",\"packetType\":\"pair-request\",\"requestId\":\""
            + REQUEST_ID
            + "\",\"schemaVersion\":1,\"targetDeviceId\":\""
            + DEVICE_ID
            + "\",\"targetM2yId\":\"M2Y-JKLM-NPQR-STUV-WXYZ\","
            + "\"targetStableIdentityId\":\""
            + STABLE_ID
            + "\"}";

    assertThrows(
        ProductionIdentityException.class,
        () -> ProductionPairingPacketCodec.decodeOutgoing(valid.replace("\"schemaVersion\":1", "\"schemaVersion\":2")));
    assertThrows(
        ProductionIdentityException.class,
        () -> ProductionPairingPacketCodec.decodeOutgoing(valid.substring(0, valid.length() - 1) + ",\"secret\":true}"));
  }
}
