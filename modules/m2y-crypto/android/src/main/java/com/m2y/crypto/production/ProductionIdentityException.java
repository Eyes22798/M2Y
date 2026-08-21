package com.m2y.crypto.production;

public final class ProductionIdentityException extends Exception {
  private final String safeCode;

  public ProductionIdentityException(String safeCode) {
    super(safeCode);
    this.safeCode = safeCode;
  }

  public ProductionIdentityException(String safeCode, Throwable cause) {
    super(safeCode, cause);
    this.safeCode = safeCode;
  }

  public String safeCode() {
    return safeCode;
  }
}
