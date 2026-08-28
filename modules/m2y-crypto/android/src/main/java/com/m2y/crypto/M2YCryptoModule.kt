package com.m2y.crypto

import android.os.Build
import com.m2y.crypto.production.ProductionIdentityException
import com.m2y.crypto.production.ProductionIdentityManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val LIBSIGNAL_VERSION = "0.101.0"
private const val PROTOCOL_ID = "signal-pqxdh-double-ratchet"

class M2YCryptoModule : Module() {
  private val productionManager: ProductionIdentityManager by lazy {
    ProductionIdentityManager(
      appContext.reactContext ?: throw Exceptions.AppContextLost(),
    )
  }

  override fun definition() =
    ModuleDefinition {
      Name("M2YCrypto")

      Function("getSpikeInfo") {
        val nativeLoadVerified = verifyNativeLoad()

        mapOf(
          "abi" to (Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown"),
          "libraryVersion" to LIBSIGNAL_VERSION,
          "nativeLoadVerified" to nativeLoadVerified,
          "platform" to "android",
          "protocol" to PROTOCOL_ID,
        )
      }

      AsyncFunction("runFreshAcceptance") {
        try {
          acceptanceHarness().runFresh()
        } catch (_: LinkageError) {
          throw LibsignalProtocolException()
        } catch (_: Exception) {
          throw LibsignalProtocolException()
        }
      }

      AsyncFunction("getPendingAcceptanceRunId") {
        try {
          acceptanceHarness().findPendingRunId()
        } catch (_: Exception) {
          throw LibsignalProtocolException()
        }
      }

      AsyncFunction("runResumeAcceptance") { runId: String ->
        runAcceptance { it.runResume(runId) }
      }

      AsyncFunction("runNegativeAcceptance") { runId: String ->
        runAcceptance { it.runNegative(runId) }
      }

      AsyncFunction("runPerformanceAcceptance") { runId: String ->
        runAcceptance { it.runPerformance(runId) }
      }

      AsyncFunction("cleanupAcceptance") { runId: String ->
        runAcceptance { it.cleanup(runId) }
      }

      AsyncFunction("inspectProductionIdentity") {
        runProduction { it.inspectProductionIdentity() }
      }

      AsyncFunction("prepareIdentityRegistration") { displayName: String? ->
        runProduction { it.prepareIdentityRegistration(displayName) }
      }

      AsyncFunction("preparePairingPacket") {
          requestId: String,
          expiresAtMs: Long,
          targetBundleJson: String,
        ->
        runProduction { it.preparePairingPacket(requestId, expiresAtMs, targetBundleJson) }
      }

      AsyncFunction("commitIdentityRegistration") { operationId: String, receiptId: String ->
        runProduction { it.commitIdentityRegistration(operationId, receiptId) }
      }

      AsyncFunction("signDeviceRequest") { canonicalRequest: String ->
        runProduction { it.signDeviceRequest(canonicalRequest) }
      }

      AsyncFunction("respondToPairingRequest") { requestId: String, action: String ->
        runProduction { it.respondToPairingRequest(requestId, action) }
      }

      AsyncFunction("confirmPairingSafetyNumber") { requestId: String ->
        runProduction { it.confirmPairingSafetyNumber(requestId) }
      }

      AsyncFunction("activatePairedRelationship") { requestId: String, pairId: String ->
        runProduction { it.activatePairedRelationship(requestId, pairId) }
      }

      AsyncFunction("listPairingOutbox") {
        runProduction { it.listPairingOutbox() }
      }

      AsyncFunction("ackPairingOutbox") { operationId: String, receiptId: String ->
        runProduction { it.ackPairingOutbox(operationId, receiptId) }
      }

      AsyncFunction("sweepPairingState") {
        runProduction { it.sweepPairingState() }
      }

      AsyncFunction("resetProductionIdentity") {
        try {
          productionIdentityManager().resetProductionIdentity()
          mapOf("schemaVersion" to 1, "status" to "reset")
        } catch (error: ProductionIdentityException) {
          throw ProductionIdentityCodedException(error.safeCode())
        }
      }
    }

  private fun acceptanceHarness(): M2YCryptoAcceptanceHarness =
    M2YCryptoAcceptanceHarness(
      appContext.reactContext ?: throw Exceptions.AppContextLost(),
    )

  private fun productionIdentityManager(): ProductionIdentityManager = productionManager

  private fun runProduction(
    operation: (ProductionIdentityManager) -> Map<String, Any>,
  ): Map<String, Any> =
    try {
      operation(productionIdentityManager())
    } catch (error: ProductionIdentityException) {
      throw ProductionIdentityCodedException(error.safeCode())
    } catch (_: LinkageError) {
      throw ProductionIdentityCodedException("identity-native-runtime-unavailable")
    } catch (_: Exception) {
      throw ProductionIdentityCodedException("identity-operation-failed")
    }

  private fun runAcceptance(
    operation: (M2YCryptoAcceptanceHarness) -> Map<String, Any>,
  ): Map<String, Any> =
    try {
      operation(acceptanceHarness())
    } catch (_: LinkageError) {
      throw LibsignalProtocolException()
    } catch (_: Exception) {
      throw LibsignalProtocolException()
    }

  private fun verifyNativeLoad(): Boolean =
    try {
      if (!LibsignalLoadProbe.verify()) {
        throw LibsignalNativeLoadException()
      }
      true
    } catch (_: LinkageError) {
      throw LibsignalNativeLoadException()
    } catch (_: RuntimeException) {
      throw LibsignalNativeLoadException()
    }
}

private class LibsignalNativeLoadException :
  CodedException(
    "E_M2Y_CRYPTO_NATIVE_LOAD",
    "Native cryptography runtime is unavailable.",
    null,
  )

private class LibsignalProtocolException :
  CodedException(
    "E_M2Y_CRYPTO_PROTOCOL",
    "Native protocol acceptance failed.",
    null,
  )

private class ProductionIdentityCodedException(safeCode: String) :
  CodedException(
    "E_M2Y_PRODUCTION_IDENTITY",
    safeCode,
    null,
  )
