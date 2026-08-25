package com.m2y.crypto.production;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Domain-separated fingerprints over pairing material: an inbound packet's replay key, and the peer
 * identity key that an active relationship is pinned to. Neither fingerprint stores any of the
 * content it identifies.
 *
 * <p>Every field is length-prefixed before hashing, so the encoding is injective: two different
 * inputs can never produce the same hash input by concatenation ambiguity. That property is what
 * makes the packet fingerprint safe to use as the replay key — a peer must not be able to craft a
 * packet whose fingerprint collides with an already-applied one and thereby suppress a later,
 * genuine packet. The separate domain string is why a packet fingerprint can never be mistaken for
 * an identity fingerprint even if the underlying bytes coincide.
 */
final class PairingPacketFingerprint {
  private static final char[] HEX = "0123456789abcdef".toCharArray();
  private static final byte[] PACKET_DOMAIN =
      "m2y-pairing-packet-v1".getBytes(StandardCharsets.UTF_8);
  private static final byte[] PEER_IDENTITY_DOMAIN =
      "m2y-peer-identity-v1".getBytes(StandardCharsets.UTF_8);

  private PairingPacketFingerprint() {}

  static String ofPacket(String requestId, byte[] packet) throws ProductionIdentityException {
    if (requestId == null || requestId.isEmpty() || packet == null || packet.length == 0) {
      throw new ProductionIdentityException("pairing-packet-invalid");
    }
    return digest(PACKET_DOMAIN, requestId.getBytes(StandardCharsets.UTF_8), packet);
  }

  /**
   * Pins a relationship to the peer identity key the local user actually confirmed. The stored
   * fingerprint is what a later activation is compared against, so a changed peer key is detectable
   * without keeping a second copy of the key outside the encrypted candidate record.
   */
  static String ofPeerIdentity(String peerIdentityKey) throws ProductionIdentityException {
    if (peerIdentityKey == null || peerIdentityKey.isEmpty()) {
      throw new ProductionIdentityException("pairing-relationship-invalid");
    }
    return digest(
        PEER_IDENTITY_DOMAIN,
        peerIdentityKey.getBytes(StandardCharsets.UTF_8),
        new byte[] {(byte) 1});
  }

  private static String digest(byte[] domain, byte[] first, byte[] second)
      throws ProductionIdentityException {
    byte[] input =
        ByteBuffer.allocate(12 + domain.length + first.length + second.length)
            .putInt(domain.length)
            .put(domain)
            .putInt(first.length)
            .put(first)
            .putInt(second.length)
            .put(second)
            .array();

    try {
      return hex(MessageDigest.getInstance("SHA-256").digest(input));
    } catch (NoSuchAlgorithmException e) {
      throw new ProductionIdentityException("pairing-fingerprint-unavailable", e);
    }
  }

  private static String hex(byte[] digest) {
    char[] characters = new char[digest.length * 2];
    for (int index = 0; index < digest.length; index++) {
      int value = digest[index] & 0xff;
      characters[index * 2] = HEX[value >>> 4];
      characters[index * 2 + 1] = HEX[value & 0x0f];
    }
    return new String(characters);
  }
}
