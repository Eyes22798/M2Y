package com.m2y.crypto;

import org.signal.libsignal.protocol.IdentityKeyPair;

final class LibsignalLoadProbe {
  private static final int SERIALIZED_PUBLIC_KEY_LENGTH = 33;

  private LibsignalLoadProbe() {}

  static boolean verify() {
    byte[] publicKey = IdentityKeyPair.generate().getPublicKey().serialize();
    return publicKey.length == SERIALIZED_PUBLIC_KEY_LENGTH;
  }
}
