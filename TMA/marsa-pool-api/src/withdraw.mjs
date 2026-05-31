import { verify } from "@noble/ed25519";
import { query, dbEnabled } from "./db.mjs";
import { computeOwedStatus, payoutNetFromGross } from "./owed.mjs";
import { OFFICIAL_POOLS, POOL_WITHDRAW_FEE } from "./config.mjs";
import { getTreasuryBalance } from "./nodeRpc.mjs";
import {
  buildRegularTransfer,
  submitTransaction,
  keyPairFromPrivateKeyB64,
} from "./treasuryTx.mjs";
import { parseTreasuryKeys } from "./treasuryKeys.mjs";
import { isWithdrawSigningEnabled } from "./treasuryGuard.mjs";

export { parseTreasuryKeys } from "./treasuryKeys.mjs";

export function buildWithdrawMessage(minerAddress, poolId, amountWei, nonce) {
  return `marsa:pool:withdraw:${minerAddress}:${poolId}:${amountWei}:${nonce}`;
}

export async function requestWithdraw(body) {
  const {
    miner_address: miner,
    pool_id: poolId,
    signature,
    pub_key: pubKeyB64,
    nonce: clientNonce,
  } = body;
  if (!miner || poolId == null || !signature || !pubKeyB64 || !clientNonce) {
    return { ok: false, status: 400, error: "missing_fields" };
  }

  const status = await computeOwedStatus(miner);
  if (!status.can_withdraw) {
    return { ok: false, status: 400, error: "cannot_withdraw", reasons: status.reasons };
  }

  if (status.pool_id != null && Number(status.pool_id) !== Number(poolId)) {
    return { ok: false, status: 400, error: "pool_id_mismatch" };
  }

  const grossWei = BigInt(status.owed_wei);
  const netWei = payoutNetFromGross(grossWei);
  const nonce = String(clientNonce).trim();
  if (!nonce || nonce.length > 128) {
    return { ok: false, status: 400, error: "invalid_nonce" };
  }
  const message = buildWithdrawMessage(miner, poolId, grossWei.toString(), nonce);
  const msgBytes = new TextEncoder().encode(message);

  let pubBytes;
  try {
    pubBytes = Buffer.from(pubKeyB64, "base64");
  } catch {
    return { ok: false, status: 400, error: "invalid_pub_key" };
  }
  let sigBytes;
  try {
    sigBytes = Buffer.from(signature, "base64");
  } catch {
    return { ok: false, status: 400, error: "invalid_signature" };
  }

  const valid = await verify(sigBytes, msgBytes, pubBytes);
  if (!valid) {
    return { ok: false, status: 403, error: "signature_invalid" };
  }

  const pending = await query(
    `SELECT 1 FROM pool_withdrawals
     WHERE miner_address = $1 AND status IN ('pending', 'processing')
     LIMIT 1`,
    [miner],
  );
  if (pending.rows.length > 0) {
    return { ok: false, status: 409, error: "withdrawal_already_pending" };
  }

  const nonceUsed = await query(
    `SELECT 1 FROM pool_withdrawals WHERE miner_address = $1 AND withdraw_nonce = $2 LIMIT 1`,
    [miner, nonce],
  );
  if (nonceUsed.rows.length > 0) {
    return { ok: false, status: 409, error: "nonce_already_used" };
  }

  await query("BEGIN");
  let ins;
  try {
    const reserved = await query(
      `UPDATE pool_owed
       SET amount_wei = amount_wei - $2::bigint, updated_at = now()
       WHERE miner_address = $1 AND amount_wei >= $2::bigint
       RETURNING amount_wei`,
      [miner, grossWei.toString()],
    );
    if (reserved.rows.length === 0) {
      await query("ROLLBACK");
      return { ok: false, status: 400, error: "insufficient_owed" };
    }

    ins = await query(
      `INSERT INTO pool_withdrawals (miner_address, pool_id, amount_wei, withdraw_nonce, status)
       VALUES ($1,$2,$3,$4,'pending')
       RETURNING id`,
      [miner, poolId, grossWei.toString(), nonce],
    );
    await query("COMMIT");
  } catch (e) {
    await query("ROLLBACK").catch(() => {});
    throw e;
  }

  const keys = parseTreasuryKeys();
  return {
    ok: true,
    withdrawal_id: ins.rows[0].id,
    amount_wei: grossWei.toString(),
    payout_net_wei: netWei.toString(),
    withdraw_fee_wei: POOL_WITHDRAW_FEE.toString(),
    status: "pending",
    note:
      keys.length >= OFFICIAL_POOLS.length
        ? "queued_for_payout"
        : "treasury_keys_not_configured",
  };
}

export async function processWithdrawBatch() {
  if (!dbEnabled()) return;
  if (!isWithdrawSigningEnabled()) return;
  const keys = parseTreasuryKeys();
  if (keys.length < OFFICIAL_POOLS.length) return;

  const batch = await query(
    `SELECT id, miner_address, pool_id, amount_wei FROM pool_withdrawals
     WHERE status = 'pending'
     ORDER BY requested_at
     LIMIT 5`,
  );

  for (const w of batch.rows) {
    await query(
      `UPDATE pool_withdrawals SET status = 'processing', processed_at = now() WHERE id = $1`,
      [w.id],
    );

    const poolId = Number(w.pool_id);
    const pool = OFFICIAL_POOLS.find((p) => p.pool_id === poolId);
    const keyB64 = keys[poolId];
    if (!pool || !keyB64) {
      await failWithdrawal(w.id, "treasury_key_missing_for_pool");
      continue;
    }

    const kp = keyPairFromPrivateKeyB64(keyB64);
    if (!kp) {
      await failWithdrawal(w.id, "invalid_treasury_private_key");
      continue;
    }
    if (kp.address !== pool.treasury_address) {
      await failWithdrawal(w.id, `treasury_key_mismatch:expected_${pool.treasury_address}`);
      continue;
    }

    const gross = BigInt(w.amount_wei);
    const fee = POOL_WITHDRAW_FEE;
    const net = gross - fee;
    if (net <= 0n) {
      await failWithdrawal(w.id, "amount_too_small_after_fee");
      continue;
    }

    let treasuryBal = 0;
    try {
      treasuryBal = await getTreasuryBalance(pool.treasury_address);
    } catch {
      await failWithdrawal(w.id, "treasury_balance_check_failed");
      continue;
    }
    if (BigInt(treasuryBal) < gross) {
      await failWithdrawal(w.id, "insufficient_treasury_balance");
      continue;
    }

    const tx = buildRegularTransfer(
      pool.treasury_address,
      w.miner_address,
      net,
      fee,
      keyB64,
    );
    if (!tx) {
      await failWithdrawal(w.id, "build_transfer_failed");
      continue;
    }

    const submit = await submitTransaction(tx);
    if (!submit.ok) {
      await failWithdrawal(w.id, submit.message ?? "submit_failed");
      continue;
    }

    await query(
      `UPDATE pool_withdrawals SET status = 'done', txid = $2, processed_at = now(), error = NULL
       WHERE id = $1`,
      [w.id, submit.txid],
    );
  }
}

async function failWithdrawal(id, error) {
  const row = await query(
    `UPDATE pool_withdrawals SET status = 'failed', error = $2, processed_at = now()
     WHERE id = $1 AND status IN ('pending', 'processing')
     RETURNING miner_address, pool_id, amount_wei`,
    [id, error],
  );
  const w = row.rows[0];
  if (!w) return;
  await query(
    `INSERT INTO pool_owed (miner_address, pool_id, amount_wei)
     VALUES ($1, $2, $3::bigint)
     ON CONFLICT (miner_address) DO UPDATE SET
       amount_wei = pool_owed.amount_wei + EXCLUDED.amount_wei,
       updated_at = now()`,
    [w.miner_address, w.pool_id, w.amount_wei],
  );
}

export function startWithdrawLoop() {
  if (!dbEnabled()) return;
  const interval = Number(process.env.WITHDRAW_BATCH_MS || "5000");
  setInterval(() => {
    processWithdrawBatch().catch((e) => console.error("[withdraw]", e));
  }, interval);
}
