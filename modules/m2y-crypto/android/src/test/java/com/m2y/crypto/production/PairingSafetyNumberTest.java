package com.m2y.crypto.production;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.util.Base64;
import java.util.List;
import org.junit.Test;
import org.signal.libsignal.protocol.IdentityKeyPair;

public final class PairingSafetyNumberTest {
  private static final String ALICE_ID = "839c065c-b7ad-43ea-99ba-a3338037178a";
  private static final String BOB_ID = "59e5c303-bba8-46d0-a19c-26a6514938a7";

  @Test
  public void bothPeersDeriveTheSameTwelveGroups() throws Exception {
    IdentityKeyPair alice = IdentityKeyPair.generate();
    IdentityKeyPair bob = IdentityKeyPair.generate();

    String aliceDisplay = PairingSafetyNumber.create(ALICE_ID, alice, BOB_ID, encoded(bob));
    String bobDisplay = PairingSafetyNumber.create(BOB_ID, bob, ALICE_ID, encoded(alice));
    List<String> groups = PairingSafetyNumber.groups(aliceDisplay);

    assertEquals(aliceDisplay, bobDisplay);
    assertEquals(12, groups.size());
    assertTrue(groups.stream().allMatch(group -> group.matches("^[0-9]{5}$")));
  }

  @Test
  public void malformedIdentityOrDisplayFailsClosed() {
    assertThrows(
        ProductionIdentityException.class,
        () -> PairingSafetyNumber.create(ALICE_ID, IdentityKeyPair.generate(), BOB_ID, "invalid"));
    assertThrows(
        ProductionIdentityException.class, () -> PairingSafetyNumber.groups("12345"));
  }

  private static String encoded(IdentityKeyPair keyPair) {
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(keyPair.getPublicKey().serialize());
  }
}
