package com.m2y.crypto.production;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;

final class ProductionDeviceSigner {
  static final String KEY_ALIAS = "m2y.device-auth-signing-key.v1";

  private static final String ANDROID_KEY_STORE = "AndroidKeyStore";
  private static final Base64.Encoder BASE64_URL_ENCODER = Base64.getUrlEncoder().withoutPadding();

  void createKey() throws ProductionIdentityException {
    try {
      if (loadKeyStore().containsAlias(KEY_ALIAS)) {
        throw new ProductionIdentityException("device-signing-key-orphaned");
      }
      KeyPairGenerator generator =
          KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEY_STORE);
      generator.initialize(
          new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
              .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
              .setDigests(KeyProperties.DIGEST_SHA256)
              .build());
      generator.generateKeyPair();
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("device-signing-key-unavailable", e);
    }
  }

  void deleteKey() throws ProductionIdentityException {
    try {
      KeyStore keyStore = loadKeyStore();
      if (keyStore.containsAlias(KEY_ALIAS)) {
        keyStore.deleteEntry(KEY_ALIAS);
      }
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("device-signing-key-delete-failed", e);
    }
  }

  boolean hasKey() throws ProductionIdentityException {
    try {
      return loadKeyStore().containsAlias(KEY_ALIAS);
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("device-signing-key-unavailable", e);
    }
  }

  String publicKey() throws ProductionIdentityException {
    return BASE64_URL_ENCODER.encodeToString(loadKeyPair().getPublic().getEncoded());
  }

  String sign(String canonicalRequest) throws ProductionIdentityException {
    try {
      Signature signature = Signature.getInstance("SHA256withECDSA");
      signature.initSign(loadKeyPair().getPrivate());
      signature.update(canonicalRequest.getBytes(StandardCharsets.UTF_8));
      return BASE64_URL_ENCODER.encodeToString(signature.sign());
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("device-request-signing-failed", e);
    }
  }

  private static KeyPair loadKeyPair() throws ProductionIdentityException {
    try {
      KeyStore.Entry entry = loadKeyStore().getEntry(KEY_ALIAS, null);
      if (!(entry instanceof KeyStore.PrivateKeyEntry privateKeyEntry)) {
        throw new ProductionIdentityException("device-signing-key-missing");
      }
      return new KeyPair(privateKeyEntry.getCertificate().getPublicKey(), privateKeyEntry.getPrivateKey());
    } catch (ProductionIdentityException e) {
      throw e;
    } catch (GeneralSecurityException e) {
      throw new ProductionIdentityException("device-signing-key-unavailable", e);
    }
  }

  private static KeyStore loadKeyStore() throws GeneralSecurityException {
    KeyStore keyStore = KeyStore.getInstance(ANDROID_KEY_STORE);
    try {
      keyStore.load(null);
    } catch (IOException e) {
      throw new GeneralSecurityException("device-key-store-unavailable", e);
    }
    return keyStore;
  }
}
