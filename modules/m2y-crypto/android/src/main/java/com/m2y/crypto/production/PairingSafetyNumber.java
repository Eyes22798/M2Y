package com.m2y.crypto.production;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import org.signal.libsignal.protocol.IdentityKey;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.InvalidKeyException;
import org.signal.libsignal.protocol.fingerprint.Fingerprint;
import org.signal.libsignal.protocol.fingerprint.NumericFingerprintGenerator;

/** 只在原生边界内生成、校验和格式化 libsignal 数字安全号码。 */
final class PairingSafetyNumber {
  private static final int FINGERPRINT_ITERATIONS = 5_200;
  private static final int FINGERPRINT_VERSION = 1;
  private static final int GROUP_LENGTH = 5;
  private static final int GROUP_COUNT = 12;
  private static final String DISPLAY_PATTERN = "^[0-9]{60}$";

  private PairingSafetyNumber() {}

  static String create(
      String localStableIdentityId,
      IdentityKeyPair localIdentity,
      String peerStableIdentityId,
      String encodedPeerIdentity)
      throws ProductionIdentityException {
    if (localStableIdentityId == null
        || localIdentity == null
        || peerStableIdentityId == null
        || encodedPeerIdentity == null) {
      throw new ProductionIdentityException("pairing-safety-number-invalid");
    }

    byte[] peerIdentityBytes;
    try {
      peerIdentityBytes = Base64.getUrlDecoder().decode(encodedPeerIdentity);
    } catch (IllegalArgumentException error) {
      throw new ProductionIdentityException("pairing-safety-number-invalid", error);
    }
    try {
      IdentityKey peerIdentity = new IdentityKey(peerIdentityBytes);
      Fingerprint fingerprint =
          new NumericFingerprintGenerator(FINGERPRINT_ITERATIONS)
              .createFor(
                  FINGERPRINT_VERSION,
                  localStableIdentityId.getBytes(StandardCharsets.UTF_8),
                  localIdentity.getPublicKey(),
                  peerStableIdentityId.getBytes(StandardCharsets.UTF_8),
                  peerIdentity);
      String display = fingerprint.getDisplayableFingerprint().getDisplayText();
      validate(display);
      return display;
    } catch (InvalidKeyException error) {
      throw new ProductionIdentityException("pairing-safety-number-invalid", error);
    } finally {
      java.util.Arrays.fill(peerIdentityBytes, (byte) 0);
    }
  }

  static List<String> groups(String display) throws ProductionIdentityException {
    validate(display);
    List<String> groups = new ArrayList<>(GROUP_COUNT);
    for (int index = 0; index < display.length(); index += GROUP_LENGTH) {
      groups.add(display.substring(index, index + GROUP_LENGTH));
    }
    return Collections.unmodifiableList(groups);
  }

  static void validate(String display) throws ProductionIdentityException {
    if (display == null || !display.matches(DISPLAY_PATTERN)) {
      throw new ProductionIdentityException("pairing-safety-number-corrupt");
    }
  }
}
