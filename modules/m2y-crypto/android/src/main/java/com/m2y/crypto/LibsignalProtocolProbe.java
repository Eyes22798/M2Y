package com.m2y.crypto;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.signal.libsignal.protocol.DuplicateMessageException;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.InvalidKeyException;
import org.signal.libsignal.protocol.InvalidMessageException;
import org.signal.libsignal.protocol.SessionBuilder;
import org.signal.libsignal.protocol.SessionCipher;
import org.signal.libsignal.protocol.SignalProtocolAddress;
import org.signal.libsignal.protocol.UntrustedIdentityException;
import org.signal.libsignal.protocol.ecc.ECKeyPair;
import org.signal.libsignal.protocol.fingerprint.Fingerprint;
import org.signal.libsignal.protocol.fingerprint.NumericFingerprintGenerator;
import org.signal.libsignal.protocol.kem.KEMKeyPair;
import org.signal.libsignal.protocol.kem.KEMKeyType;
import org.signal.libsignal.protocol.message.CiphertextMessage;
import org.signal.libsignal.protocol.message.PreKeySignalMessage;
import org.signal.libsignal.protocol.message.SignalMessage;
import org.signal.libsignal.protocol.state.KyberPreKeyRecord;
import org.signal.libsignal.protocol.state.PreKeyBundle;
import org.signal.libsignal.protocol.state.PreKeyRecord;
import org.signal.libsignal.protocol.state.SignalProtocolStore;
import org.signal.libsignal.protocol.state.SignedPreKeyRecord;
import org.signal.libsignal.protocol.util.KeyHelper;

/** Runs an isolated protocol scenario and exposes only redacted check identifiers. */
final class LibsignalProtocolProbe {
  private static final SignalProtocolAddress ALICE_ADDRESS =
      new SignalProtocolAddress("m2y-spike-alice", 1);
  private static final SignalProtocolAddress BOB_ADDRESS =
      new SignalProtocolAddress("m2y-spike-bob", 1);
  private static final byte[] ALICE_STABLE_ID =
      "m2y-spike-alice".getBytes(StandardCharsets.UTF_8);
  private static final byte[] BOB_STABLE_ID =
      "m2y-spike-bob".getBytes(StandardCharsets.UTF_8);
  private static final byte[] FIRST_MESSAGE =
      "m2y-spike-first-message".getBytes(StandardCharsets.UTF_8);
  private static final byte[] REPLY_MESSAGE =
      "m2y-spike-ratcheted-reply".getBytes(StandardCharsets.UTF_8);
  private static final byte[] NEGATIVE_MESSAGE =
      "m2y-spike-negative-case".getBytes(StandardCharsets.UTF_8);

  private LibsignalProtocolProbe() {}

  static List<String> runChecks() throws Exception {
    M2YCheckpointState state = M2YCheckpointState.createFresh(java.util.UUID.randomUUID().toString());
    return runFreshChecks(state);
  }

  static List<String> runFreshChecks(M2YCheckpointState state) throws Exception {
    SignalProtocolStore aliceStore = state.aliceStore();
    SignalProtocolStore bobStore = state.bobStore();
    SessionBuilder aliceSessionBuilder =
        new SessionBuilder(aliceStore, BOB_ADDRESS, ALICE_ADDRESS);

    PreKeyBundle bobBundle = createPqxdhBundle(bobStore);
    aliceSessionBuilder.process(bobBundle);

    ArrayList<String> checks = new ArrayList<>();
    require(
        aliceStore.containsSession(BOB_ADDRESS)
            && aliceStore.loadSession(BOB_ADDRESS).getSessionVersion() == 4,
        "session-not-established");
    checks.add("pqxdh-session-established");

    SessionCipher aliceCipher = new SessionCipher(aliceStore, ALICE_ADDRESS, BOB_ADDRESS);
    SessionCipher bobCipher = new SessionCipher(bobStore, BOB_ADDRESS, ALICE_ADDRESS);

    CiphertextMessage firstCiphertext = aliceCipher.encrypt(FIRST_MESSAGE);
    require(firstCiphertext.getType() == CiphertextMessage.PREKEY_TYPE, "first-message-not-prekey");
    byte[] firstPlaintext =
        bobCipher.decrypt(new PreKeySignalMessage(firstCiphertext.serialize()));
    require(MessageDigest.isEqual(firstPlaintext, FIRST_MESSAGE), "first-message-mismatch");
    checks.add("pre-key-message-decrypted");

    CiphertextMessage replyCiphertext = bobCipher.encrypt(REPLY_MESSAGE);
    require(replyCiphertext.getType() == CiphertextMessage.WHISPER_TYPE, "reply-not-ratcheted");
    byte[] replyPlaintext = aliceCipher.decrypt(new SignalMessage(replyCiphertext.serialize()));
    require(MessageDigest.isEqual(replyPlaintext, REPLY_MESSAGE), "reply-message-mismatch");
    checks.add("ratcheted-reply-decrypted");

    require(fingerprintsMatch(aliceStore, bobStore), "fingerprint-mismatch");
    checks.add("fingerprint-match");

    CiphertextMessage corruptCandidate = aliceCipher.encrypt(NEGATIVE_MESSAGE);
    byte[] corruptBytes = corruptCandidate.serialize();
    corruptBytes[corruptBytes.length - 1] ^= 0x01;
    try {
      bobCipher.decrypt(new SignalMessage(corruptBytes));
      throw new ProtocolProbeException("corrupt-ciphertext-accepted");
    } catch (InvalidMessageException expected) {
      // Expected: authentication failure must not advance the committed session.
    }
    byte[] recoveredPlaintext =
        bobCipher.decrypt(new SignalMessage(corruptCandidate.serialize()));
    require(MessageDigest.isEqual(recoveredPlaintext, NEGATIVE_MESSAGE), "corrupt-recovery-failed");
    checks.add("corrupt-ciphertext-rejected");

    CiphertextMessage duplicateCandidate = aliceCipher.encrypt(NEGATIVE_MESSAGE);
    SignalMessage duplicateMessage = new SignalMessage(duplicateCandidate.serialize());
    bobCipher.decrypt(duplicateMessage);
    try {
      bobCipher.decrypt(new SignalMessage(duplicateCandidate.serialize()));
      throw new ProtocolProbeException("duplicate-message-accepted");
    } catch (DuplicateMessageException expected) {
      // Expected: the second delivery is outside the ratchet's valid receive state.
    }
    checks.add("duplicate-message-rejected");

    SignalProtocolStore replacementBobStore = newStore();
    PreKeyBundle replacementBundle = createPqxdhBundle(replacementBobStore);
    try {
      aliceSessionBuilder.process(replacementBundle);
      throw new ProtocolProbeException("identity-change-accepted");
    } catch (UntrustedIdentityException expected) {
      // Expected: TOFU must reject a different identity for the same address.
    }
    checks.add("identity-change-rejected");

    return List.copyOf(checks);
  }

  static List<String> runResumeChecks(M2YCheckpointState state) throws Exception {
    SignalProtocolStore aliceStore = state.aliceStore();
    SignalProtocolStore bobStore = state.bobStore();
    SessionCipher aliceCipher = new SessionCipher(aliceStore, ALICE_ADDRESS, BOB_ADDRESS);
    SessionCipher bobCipher = new SessionCipher(bobStore, BOB_ADDRESS, ALICE_ADDRESS);
    ArrayList<String> checks = new ArrayList<>();

    require(
        aliceStore.containsSession(BOB_ADDRESS) && bobStore.containsSession(ALICE_ADDRESS),
        "checkpoint-session-missing");
    checks.add("checkpoint-reopened");

    CiphertextMessage aliceMessage = aliceCipher.encrypt(FIRST_MESSAGE);
    require(
        aliceMessage.getType() == CiphertextMessage.WHISPER_TYPE,
        "resume-message-not-ratcheted");
    require(
        MessageDigest.isEqual(
            bobCipher.decrypt(new SignalMessage(aliceMessage.serialize())), FIRST_MESSAGE),
        "resume-alice-message-mismatch");
    checks.add("resumed-alice-to-bob");

    CiphertextMessage bobMessage = bobCipher.encrypt(REPLY_MESSAGE);
    require(
        MessageDigest.isEqual(
            aliceCipher.decrypt(new SignalMessage(bobMessage.serialize())), REPLY_MESSAGE),
        "resume-bob-message-mismatch");
    checks.add("resumed-bob-to-alice");

    require(fingerprintsMatch(aliceStore, bobStore), "resume-fingerprint-mismatch");
    checks.add("fingerprint-stable");
    return List.copyOf(checks);
  }

  static List<String> runNegativeChecks(M2YCheckpointState state) throws Exception {
    SignalProtocolStore aliceStore = state.aliceStore();
    SignalProtocolStore bobStore = state.bobStore();
    SessionCipher aliceCipher = new SessionCipher(aliceStore, ALICE_ADDRESS, BOB_ADDRESS);
    SessionCipher bobCipher = new SessionCipher(bobStore, BOB_ADDRESS, ALICE_ADDRESS);
    ArrayList<String> checks = new ArrayList<>();

    ArrayList<CiphertextMessage> delayed = new ArrayList<>();
    for (int index = 0; index < 3; index++) {
      delayed.add(aliceCipher.encrypt(NEGATIVE_MESSAGE));
    }
    for (int index = delayed.size() - 1; index >= 0; index--) {
      byte[] plaintext =
          bobCipher.decrypt(new SignalMessage(delayed.get(index).serialize()));
      require(MessageDigest.isEqual(plaintext, NEGATIVE_MESSAGE), "out-of-order-mismatch");
    }
    checks.add("out-of-order-window-accepted");

    CiphertextMessage duplicateCandidate = aliceCipher.encrypt(NEGATIVE_MESSAGE);
    bobCipher.decrypt(new SignalMessage(duplicateCandidate.serialize()));
    try {
      bobCipher.decrypt(new SignalMessage(duplicateCandidate.serialize()));
      throw new ProtocolProbeException("duplicate-message-accepted");
    } catch (DuplicateMessageException expected) {
      // Expected.
    }
    checks.add("duplicate-message-rejected");

    CiphertextMessage corruptCandidate = aliceCipher.encrypt(NEGATIVE_MESSAGE);
    byte[] corruptBytes = corruptCandidate.serialize();
    corruptBytes[corruptBytes.length - 1] ^= 0x01;
    try {
      bobCipher.decrypt(new SignalMessage(corruptBytes));
      throw new ProtocolProbeException("corrupt-ciphertext-accepted");
    } catch (InvalidMessageException expected) {
      // Expected.
    }
    require(
        MessageDigest.isEqual(
            bobCipher.decrypt(new SignalMessage(corruptCandidate.serialize())), NEGATIVE_MESSAGE),
        "corrupt-recovery-failed");
    checks.add("corrupt-ciphertext-rejected");

    M2YSignalProtocolStore replacementBobStore = newStore();
    PreKeyBundle replacementBundle = createPqxdhBundle(replacementBobStore);
    try {
      new SessionBuilder(aliceStore, BOB_ADDRESS, ALICE_ADDRESS).process(replacementBundle);
      throw new ProtocolProbeException("identity-change-accepted");
    } catch (UntrustedIdentityException expected) {
      // Expected.
    }
    checks.add("identity-change-rejected");

    require(
        fingerprintChangesWithReplacement(aliceStore, bobStore, replacementBobStore),
        "fingerprint-change-not-visible");
    checks.add("fingerprint-change-visible");
    return List.copyOf(checks);
  }

  static M2YSignalProtocolStore newStore() {
    return new M2YSignalProtocolStore(
        IdentityKeyPair.generate(), KeyHelper.generateRegistrationId(false));
  }

  static PreKeyBundle createPqxdhBundle(SignalProtocolStore store)
      throws InvalidKeyException {
    int preKeyId = KeyHelper.generateRegistrationId(true);
    int signedPreKeyId = KeyHelper.generateRegistrationId(true);
    int kyberPreKeyId = KeyHelper.generateRegistrationId(true);

    ECKeyPair preKeyPair = ECKeyPair.generate();
    ECKeyPair signedPreKeyPair = ECKeyPair.generate();
    byte[] signedPreKeySignature =
        store
            .getIdentityKeyPair()
            .getPrivateKey()
            .calculateSignature(signedPreKeyPair.getPublicKey().serialize());

    KEMKeyPair kyberPreKeyPair = KEMKeyPair.generate(KEMKeyType.KYBER_1024);
    byte[] kyberPreKeySignature =
        store
            .getIdentityKeyPair()
            .getPrivateKey()
            .calculateSignature(kyberPreKeyPair.getPublicKey().serialize());

    store.storePreKey(preKeyId, new PreKeyRecord(preKeyId, preKeyPair));
    store.storeSignedPreKey(
        signedPreKeyId,
        new SignedPreKeyRecord(
            signedPreKeyId,
            System.currentTimeMillis(),
            signedPreKeyPair,
            signedPreKeySignature));
    store.storeKyberPreKey(
        kyberPreKeyId,
        new KyberPreKeyRecord(
            kyberPreKeyId,
            System.currentTimeMillis(),
            kyberPreKeyPair,
            kyberPreKeySignature));

    return new PreKeyBundle(
        store.getLocalRegistrationId(),
        1,
        preKeyId,
        preKeyPair.getPublicKey(),
        signedPreKeyId,
        signedPreKeyPair.getPublicKey(),
        signedPreKeySignature,
        store.getIdentityKeyPair().getPublicKey(),
        kyberPreKeyId,
        kyberPreKeyPair.getPublicKey(),
        kyberPreKeySignature);
  }

  private static boolean fingerprintsMatch(
      SignalProtocolStore aliceStore, SignalProtocolStore bobStore) throws Exception {
    NumericFingerprintGenerator generator = new NumericFingerprintGenerator(1024);
    Fingerprint aliceFingerprint =
        generator.createFor(
            1,
            ALICE_STABLE_ID,
            aliceStore.getIdentityKeyPair().getPublicKey(),
            BOB_STABLE_ID,
            bobStore.getIdentityKeyPair().getPublicKey());
    Fingerprint bobFingerprint =
        generator.createFor(
            1,
            BOB_STABLE_ID,
            bobStore.getIdentityKeyPair().getPublicKey(),
            ALICE_STABLE_ID,
            aliceStore.getIdentityKeyPair().getPublicKey());

    return aliceFingerprint
            .getDisplayableFingerprint()
            .getDisplayText()
            .equals(bobFingerprint.getDisplayableFingerprint().getDisplayText())
        && aliceFingerprint
            .getScannableFingerprint()
            .compareTo(bobFingerprint.getScannableFingerprint().getSerialized())
        && bobFingerprint
            .getScannableFingerprint()
            .compareTo(aliceFingerprint.getScannableFingerprint().getSerialized());
  }

  private static boolean fingerprintChangesWithReplacement(
      SignalProtocolStore aliceStore,
      SignalProtocolStore bobStore,
      SignalProtocolStore replacementBobStore)
      throws Exception {
    NumericFingerprintGenerator generator = new NumericFingerprintGenerator(1024);
    Fingerprint original =
        generator.createFor(
            1,
            ALICE_STABLE_ID,
            aliceStore.getIdentityKeyPair().getPublicKey(),
            BOB_STABLE_ID,
            bobStore.getIdentityKeyPair().getPublicKey());
    Fingerprint replacement =
        generator.createFor(
            1,
            ALICE_STABLE_ID,
            aliceStore.getIdentityKeyPair().getPublicKey(),
            BOB_STABLE_ID,
            replacementBobStore.getIdentityKeyPair().getPublicKey());
    return !original
        .getDisplayableFingerprint()
        .getDisplayText()
        .equals(replacement.getDisplayableFingerprint().getDisplayText());
  }

  private static void require(boolean condition, String code) throws ProtocolProbeException {
    if (!condition) {
      throw new ProtocolProbeException(code);
    }
  }

  private static final class ProtocolProbeException extends Exception {
    ProtocolProbeException(String code) {
      super(code);
    }
  }
}
