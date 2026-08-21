package com.m2y.crypto.production;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.UUID;

final class ProductionIdentityIds {
  private static final char[] M2Y_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ".toCharArray();

  private ProductionIdentityIds() {}

  static String newDeviceId() {
    return UUID.randomUUID().toString().toLowerCase(Locale.ROOT);
  }

  static String newM2yId(SecureRandom random) {
    StringBuilder raw = new StringBuilder(16);
    for (int index = 0; index < 16; index++) {
      raw.append(M2Y_ALPHABET[random.nextInt(M2Y_ALPHABET.length)]);
    }
    return "M2Y-"
        + raw.substring(0, 4)
        + "-"
        + raw.substring(4, 8)
        + "-"
        + raw.substring(8, 12)
        + "-"
        + raw.substring(12, 16);
  }

  static String newOperationId() {
    return UUID.randomUUID().toString().toLowerCase(Locale.ROOT);
  }

  static String newStableIdentityId() {
    return UUID.randomUUID().toString().toLowerCase(Locale.ROOT);
  }
}
