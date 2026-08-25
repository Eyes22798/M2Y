package com.m2y.crypto.production;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;

import com.m2y.crypto.production.PairingRecordCodec.PairingIntent;
import com.m2y.crypto.production.PairingRecordCodec.PeerCandidate;
import org.json.JSONObject;
import org.junit.Test;

public final class PairingRecordCodecTest {
  private static final PeerCandidate CANDIDATE =
      new PeerCandidate(
          "1ab9957e-2c7f-4ec6-80b2-26941a506ca4",
          "BXk3ZGVtb0lkZW50aXR5S2V5QmFzZTY0VXJs",
          "M2Y-2345-6789-ABCD-EFGH",
          "839c065c-b7ad-43ea-99ba-a3338037178a",
          1_800_000_000_000L);
  private static final PairingIntent INTENT =
      new PairingIntent(
          "accept", "pair-response", "2f2f6b31-1f4d-4b0b-9d0f-1a7e4c9a55f2", 1_800_000_000_000L);

  @Test
  public void aCandidateSurvivesARoundTrip() throws Exception {
    assertEquals(CANDIDATE, PairingRecordCodec.decodeCandidate(PairingRecordCodec.encodeCandidate(CANDIDATE)));
  }

  @Test
  public void anIntentSurvivesARoundTrip() throws Exception {
    assertEquals(INTENT, PairingRecordCodec.decodeIntent(PairingRecordCodec.encodeIntent(INTENT)));
  }

  @Test
  public void anEncodedCandidateCarriesOnlyTheFieldsTheSchemaDeclares() throws Exception {
    JSONObject encoded = new JSONObject(PairingRecordCodec.encodeCandidate(CANDIDATE));

    assertEquals(6, encoded.length());
    assertFalse(encoded.has("displayName"));
    assertFalse(encoded.has("privateKey"));
    assertEquals(1, encoded.getInt("schemaVersion"));
  }

  @Test
  public void anExtraFieldMakesTheRecordCorruptRatherThanPartiallyTrusted() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () ->
                PairingRecordCodec.decodeCandidate(
                    "{\"peerDeviceId\":\"1ab9957e-2c7f-4ec6-80b2-26941a506ca4\","
                        + "\"peerIdentityKey\":\"BXk3\",\"peerM2yId\":\"M2Y-2345-6789-ABCD-EFGH\","
                        + "\"peerStableIdentityId\":\"839c065c-b7ad-43ea-99ba-a3338037178a\","
                        + "\"receivedAtMs\":1800000000000,\"schemaVersion\":1,"
                        + "\"trustPeerWithoutReview\":true}"));

    assertEquals("pairing-candidate-corrupt", failure.safeCode());
  }

  @Test
  public void aMissingFieldIsCorruptRatherThanADefault() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () ->
                PairingRecordCodec.decodeCandidate(
                    "{\"peerDeviceId\":\"1ab9957e-2c7f-4ec6-80b2-26941a506ca4\","
                        + "\"peerIdentityKey\":\"BXk3\",\"peerM2yId\":\"M2Y-2345-6789-ABCD-EFGH\","
                        + "\"peerStableIdentityId\":\"839c065c-b7ad-43ea-99ba-a3338037178a\","
                        + "\"schemaVersion\":1}"));

    assertEquals("pairing-candidate-corrupt", failure.safeCode());
  }

  @Test
  public void aNewerSchemaVersionIsRefused() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () ->
                PairingRecordCodec.decodeCandidate(
                    "{\"peerDeviceId\":\"1ab9957e-2c7f-4ec6-80b2-26941a506ca4\","
                        + "\"peerIdentityKey\":\"BXk3\",\"peerM2yId\":\"M2Y-2345-6789-ABCD-EFGH\","
                        + "\"peerStableIdentityId\":\"839c065c-b7ad-43ea-99ba-a3338037178a\","
                        + "\"receivedAtMs\":1800000000000,\"schemaVersion\":2}"));

    assertEquals("pairing-candidate-corrupt", failure.safeCode());
  }

  @Test
  public void aPeerSuppliedM2yIdOutsideTheAlphabetIsRefused() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () ->
                PairingRecordCodec.encodeCandidate(
                    new PeerCandidate(
                        CANDIDATE.peerDeviceId(),
                        CANDIDATE.peerIdentityKey(),
                        "M2Y-0011-OOII-ABCD-EFGH",
                        CANDIDATE.peerStableIdentityId(),
                        CANDIDATE.receivedAtMs())));

    assertEquals("pairing-candidate-invalid", failure.safeCode());
  }

  @Test
  public void anUnboundedPeerKeyIsRefusedBeforeItReachesTheDatabase() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () ->
                PairingRecordCodec.encodeCandidate(
                    new PeerCandidate(
                        CANDIDATE.peerDeviceId(),
                        "A".repeat(513),
                        CANDIDATE.peerM2yId(),
                        CANDIDATE.peerStableIdentityId(),
                        CANDIDATE.receivedAtMs())));

    assertEquals("pairing-candidate-invalid", failure.safeCode());
  }

  @Test
  public void anOversizedRecordIsRefusedWithoutParsing() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () -> PairingRecordCodec.decodeIntent("{" + " ".repeat(4_096) + "}"));

    assertEquals("pairing-intent-corrupt", failure.safeCode());
  }

  @Test
  public void anIntentWithAnUnknownRequestShapeIsRefused() {
    ProductionIdentityException failure =
        assertThrows(
            ProductionIdentityException.class,
            () ->
                PairingRecordCodec.encodeIntent(
                    new PairingIntent(
                        INTENT.decision(), INTENT.packetType(), "not-a-uuid", INTENT.createdAtMs())));

    assertEquals("pairing-intent-invalid", failure.safeCode());
  }
}
