import { query, dbEnabled } from "./db.mjs";
import { getPoolBind, getPoolMember } from "./nodeRpc.mjs";
import {
  POOL_MIN_WITHDRAW,
  POOL_MIN_WITHDRAW_GROSS,
  POOL_WITHDRAW_FEE,
  MINER_POOL_MIN_LOCK_BLOCKS,
  POOL_EPOCH_BLOCKS,
  POOL_REWARD_MODE,
} from "./config.mjs";

export function payoutNetFromGross(grossWei) {
  const gross = typeof grossWei === "bigint" ? grossWei : BigInt(String(grossWei));
  if (gross <= POOL_WITHDRAW_FEE) return 0n;
  return gross - POOL_WITHDRAW_FEE;
}

export async function computeOwedStatus(minerAddress) {
  if (!dbEnabled()) {
    return {
      miner_address: minerAddress,
      owed_wei: "0",
      payout_net_wei: "0",
      withdraw_fee_wei: POOL_WITHDRAW_FEE.toString(),
      can_withdraw: false,
      reasons: ["database_not_configured"],
    };
  }

  const owedRes = await query(
    "SELECT pool_id, amount_wei FROM pool_owed WHERE miner_address = $1",
    [minerAddress],
  );
  const row = owedRes.rows[0];
  const owedWei = row ? BigInt(row.amount_wei) : 0n;
  const poolId = row?.pool_id ?? null;
  const payoutNet = payoutNetFromGross(owedWei);
  const reasons = [];

  if (owedWei < POOL_MIN_WITHDRAW_GROSS) {
    reasons.push("below_min_withdraw");
  }
  if (payoutNet < POOL_MIN_WITHDRAW) {
    reasons.push("below_min_net_after_fee");
  }

  const bind = await getPoolBind(minerAddress);
  const member = await getPoolMember(minerAddress);
  const countAtJoin = Number(bind?.count_at_join ?? member?.count_at_join ?? 0);
  const challengeCount = Number(member?.challenge_count ?? 0);
  const creditDelta = challengeCount - countAtJoin;

  const joinHeight = Number(bind?.join_height ?? member?.join_height ?? 0);
  const currentHeight = Number(member?.current_height ?? 0);
  if (joinHeight > 0 && currentHeight > 0) {
    const lockUntil = joinHeight + MINER_POOL_MIN_LOCK_BLOCKS;
    if (currentHeight < lockUntil) {
      reasons.push("lock_not_elapsed");
    }
  }

  const pending = await query(
    `SELECT 1 FROM pool_withdrawals
     WHERE miner_address = $1 AND status IN ('pending','processing') LIMIT 1`,
    [minerAddress],
  );
  if (pending.rowCount > 0) {
    reasons.push("pending_withdrawal");
  }

  const canWithdraw =
    reasons.length === 0 && owedWei >= POOL_MIN_WITHDRAW_GROSS && payoutNet >= POOL_MIN_WITHDRAW;

  const epochProgress =
    String(POOL_REWARD_MODE).toLowerCase() !== "pplnc" && currentHeight > 0
      ? {
          epoch_blocks: POOL_EPOCH_BLOCKS,
          blocks_until_epoch_end:
            POOL_EPOCH_BLOCKS - (currentHeight % POOL_EPOCH_BLOCKS),
          current_height: currentHeight,
        }
      : null;

  return {
    miner_address: minerAddress,
    pool_id: poolId,
    owed_wei: owedWei.toString(),
    payout_net_wei: payoutNet.toString(),
    withdraw_fee_wei: POOL_WITHDRAW_FEE.toString(),
    can_withdraw: canWithdraw,
    reasons,
    credit_delta: creditDelta,
    credits_required: 0,
    epoch_progress: epochProgress,
  };
}
