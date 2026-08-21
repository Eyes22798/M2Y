package com.m2y.crypto.production;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.security.SecureRandom;
import org.junit.Test;

public final class ProductionIdentityIdsTest {
  @Test
  public void m2yIdIsHumanReadableAndCarriesEightyBitsOfRandomChoice() {
    String id = ProductionIdentityIds.newM2yId(new SecureRandom());

    assertTrue(id.matches("^M2Y-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$"));
    assertEquals(23, id.length());
  }

  @Test
  public void generatedIdentifiersDoNotReusePersonaOrRunIdentifiers() {
    assertNotEquals(ProductionIdentityIds.newDeviceId(), ProductionIdentityIds.newDeviceId());
    assertNotEquals(
        ProductionIdentityIds.newStableIdentityId(), ProductionIdentityIds.newStableIdentityId());
    assertNotEquals(ProductionIdentityIds.newOperationId(), ProductionIdentityIds.newOperationId());
  }
}
