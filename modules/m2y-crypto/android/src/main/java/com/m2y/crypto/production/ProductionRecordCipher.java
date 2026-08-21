package com.m2y.crypto.production;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class ProductionRecordCipher {
  static final String KEY_ALIAS = "m2y.identity.record-key.v1";

  private static final String ANDROID_KEY_STORE = "AndroidKeyStore";
  private static final int ENVELOPE_VERSION = 1;
  private static final int GCM_TAG_BITS = 128;
  private static final int IV_BYTES = 12;
  private static final String TRANSFORMATION = "AES/GCM/NoPadding";

  boolean hasKey() throws ProductionIdentityException {
    try {
      return loadKeyStore().containsAlias(KEY_ALIAS);
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("identity-record-key-unavailable", e);
    }
  }

  void createKey() throws ProductionIdentityException {
    try {
      if (loadKeyStore().containsAlias(KEY_ALIAS)) {
        throw new ProductionIdentityException("identity-record-key-orphaned");
      }
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE);
      generator.init(
          new KeyGenParameterSpec.Builder(
                  KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .setKeySize(256)
              .build());
      generator.generateKey();
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("identity-record-key-unavailable", e);
    }
  }

  byte[] decrypt(String recordKind, String recordKey, long revision, byte[] envelope)
      throws ProductionIdentityException {
    if (envelope.length <= 1 + IV_BYTES || envelope[0] != ENVELOPE_VERSION) {
      throw new ProductionIdentityException("identity-record-corrupt");
    }

    byte[] iv = new byte[IV_BYTES];
    byte[] ciphertext = new byte[envelope.length - 1 - IV_BYTES];
    System.arraycopy(envelope, 1, iv, 0, IV_BYTES);
    System.arraycopy(envelope, 1 + IV_BYTES, ciphertext, 0, ciphertext.length);

    try {
      Cipher cipher = Cipher.getInstance(TRANSFORMATION);
      cipher.init(Cipher.DECRYPT_MODE, loadKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
      cipher.updateAAD(aad(recordKind, recordKey, revision));
      return cipher.doFinal(ciphertext);
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("identity-record-corrupt", e);
    }
  }

  void deleteKey() throws ProductionIdentityException {
    try {
      KeyStore keyStore = loadKeyStore();
      if (keyStore.containsAlias(KEY_ALIAS)) {
        keyStore.deleteEntry(KEY_ALIAS);
      }
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("identity-record-key-delete-failed", e);
    }
  }

  byte[] encrypt(String recordKind, String recordKey, long revision, byte[] plaintext)
      throws ProductionIdentityException {
    try {
      Cipher cipher = Cipher.getInstance(TRANSFORMATION);
      cipher.init(Cipher.ENCRYPT_MODE, loadKey());
      cipher.updateAAD(aad(recordKind, recordKey, revision));
      byte[] iv = cipher.getIV();
      if (iv == null || iv.length != IV_BYTES) {
        throw new ProductionIdentityException("identity-record-encryption-failed");
      }
      byte[] ciphertext = cipher.doFinal(plaintext);
      return ByteBuffer.allocate(1 + iv.length + ciphertext.length)
          .put((byte) ENVELOPE_VERSION)
          .put(iv)
          .put(ciphertext)
          .array();
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("identity-record-encryption-failed", e);
    }
  }

  private static byte[] aad(String recordKind, String recordKey, long revision) {
    return ("m2y-production-record-v1|schema=1|kind="
            + recordKind
            + "|key="
            + recordKey
            + "|revision="
            + revision)
        .getBytes(StandardCharsets.UTF_8);
  }

  private static SecretKey loadKey() throws GeneralSecurityException {
    SecretKey key = (SecretKey) loadKeyStore().getKey(KEY_ALIAS, null);
    if (key == null) {
      throw new GeneralSecurityException("identity-record-key-missing");
    }
    return key;
  }

  private static KeyStore loadKeyStore() throws GeneralSecurityException {
    KeyStore keyStore = KeyStore.getInstance(ANDROID_KEY_STORE);
    try {
      keyStore.load(null);
    } catch (IOException e) {
      throw new GeneralSecurityException("identity-key-store-unavailable", e);
    }
    return keyStore;
  }
}
