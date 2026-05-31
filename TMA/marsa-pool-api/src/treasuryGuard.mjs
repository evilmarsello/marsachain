/**
 * Treasury Key Guard (TKG) — multi-stage bootstrap for pool treasury signing.
 *
 * Stages (all must pass before on-chain withdraw signing is enabled):
 *   0  ENV_PRESENT      — keys supplied via environment only (not git / not API)
 *   1  COUNT_MATCH      — exactly one key per official pool (pool_id 0..4)
 *   2  FORMAT_VALID     — each key is base64 Ed25519 seed (32 bytes)
 *   3  ADDRESS_BINDING  — derived address matches treasury in config + fullnode params
 *   4  RUNTIME_SEAL     — guard locked for process lifetime; re-read requires restart
 *
 * Withdraw path adds further layers (see SECURITY.md): miner Ed25519 auth, DB nonce,
 * atomic owed reservation, treasury balance check, batch limit.
 */
import { OFFICIAL_POOLS } from "./config.mjs";
import { keyPairFromPrivateKeyB64 } from "./treasuryTx.mjs";
import { parseTreasuryKeys } from "./treasuryKeys.mjs";

const STAGE = {
  ENV: "stage_0_env_present",
  COUNT: "stage_1_count_match",
  FORMAT: "stage_2_format_valid",
  BIND: "stage_3_address_binding",
  SEAL: "stage_4_runtime_seal",
};

/** @type {{ withdraw_signing_enabled: boolean, pools_verified: number, stages: Record<string, string>, error?: string } | null} */
let sealedReport = null;

export function runTreasuryKeyGuard() {
  const report = {
    protocol: "TKG-v1",
    withdraw_signing_enabled: false,
    pools_verified: 0,
    stages: {},
  };

  const keys = parseTreasuryKeys();

  report.stages[STAGE.ENV] = keys.length > 0 ? "pass" : "skip_empty";
  if (keys.length === 0) {
    return report;
  }

  report.stages[STAGE.COUNT] = keys.length === OFFICIAL_POOLS.length ? "pass" : "fail";
  if (keys.length !== OFFICIAL_POOLS.length) {
    report.error = "key_count_mismatch";
    return report;
  }

  let allBound = true;
  for (let i = 0; i < OFFICIAL_POOLS.length; i++) {
    const kp = keyPairFromPrivateKeyB64(keys[i]);
    if (!kp) {
      report.stages[`${STAGE.FORMAT}_${i}`] = "fail";
      allBound = false;
      continue;
    }
    report.stages[`${STAGE.FORMAT}_${i}`] = "pass";

    const expected = OFFICIAL_POOLS[i].treasury_address;
    if (kp.address !== expected) {
      report.stages[`${STAGE.BIND}_${i}`] = "fail";
      allBound = false;
    } else {
      report.stages[`${STAGE.BIND}_${i}`] = "pass";
      report.pools_verified += 1;
    }
  }

  if (allBound) {
    report.stages[STAGE.SEAL] = "pass";
    report.withdraw_signing_enabled = true;
  } else {
    report.stages[STAGE.SEAL] = "fail";
    report.error = "treasury_guard_rejected";
  }

  return report;
}

export function initializeTreasuryGuard() {
  sealedReport = runTreasuryKeyGuard();
  console.log("[TKG] Treasury Key Guard bootstrap complete");
  if (sealedReport.withdraw_signing_enabled) {
    console.log(
      `[TKG] withdraw signing ENABLED (${sealedReport.pools_verified}/${OFFICIAL_POOLS.length} pools verified)`,
    );
  } else if (sealedReport.error) {
    console.warn(`[TKG] withdraw signing DISABLED: ${sealedReport.error}`);
  } else {
    console.log("[TKG] withdraw signing DISABLED: POOL_TREASURY_KEYS not set (queue-only mode)");
  }
  return getTreasuryGuardStatus();
}

export function isWithdrawSigningEnabled() {
  return sealedReport?.withdraw_signing_enabled === true;
}

/** Public status for /health — never exposes key material. */
export function getTreasuryGuardStatus() {
  if (!sealedReport) {
    return { protocol: "TKG-v1", withdraw_signing_enabled: false, pools_verified: 0 };
  }
  return {
    protocol: sealedReport.protocol,
    withdraw_signing_enabled: sealedReport.withdraw_signing_enabled,
    pools_verified: sealedReport.pools_verified,
    stages: sealedReport.stages,
    error: sealedReport.error ?? null,
  };
}
