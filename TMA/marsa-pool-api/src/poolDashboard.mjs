import { query, dbEnabled } from "./db.mjs";
import { OFFICIAL_POOLS, PPLNC_N_MIN } from "./config.mjs";
import { getPoolBind, getPoolMember, getTreasuryBalance } from "./nodeRpc.mjs";
import { computeOwedStatus, payoutNetFromGross } from "./owed.mjs";
import { SQL_TREASURY_INFLOW } from "./poolEconomics.mjs";
import {
  getPplncState,
  getPoolWindowFill,
  getLastPplncRound,
  getMemberLastRoundCredit,
} from "./pplncStats.mjs";

async function sumPoolInflow(poolId, fromHeight, toHeight = null) {
  if (!dbEnabled()) return 0n;
  let sql = `SELECT COALESCE(SUM(${SQL_TREASURY_INFLOW}), 0)::text AS total
     FROM pool_block_wins
     WHERE pool_id = $1 AND height >= $2`;
  const params = [poolId, fromHeight];
  if (toHeight != null) {
    sql += " AND height <= $3";
    params.push(toHeight);
  }
  const r = await query(sql, params);
  return BigInt(r.rows[0]?.total ?? "0");
}

async function countPoolBlocks(poolId, fromHeight = 0) {
  if (!dbEnabled()) return 0;
  const r = await query(
    `SELECT COUNT(*)::int AS c FROM pool_block_wins WHERE pool_id = $1 AND height >= $2`,
    [poolId, fromHeight],
  );
  return r.rows[0]?.c ?? 0;
}


async function latestPoolBlockHeight(poolId) {
  if (!dbEnabled()) return 0;
  const r = await query(
    `SELECT COALESCE(MAX(height), 0)::bigint AS h FROM pool_block_wins WHERE pool_id = $1`,
    [poolId],
  );
  return Number(r.rows[0]?.h ?? 0);
}

async function countBlocksMinedBy(poolId, minerAddress, fromHeight = 0) {
  if (!dbEnabled() || !minerAddress?.trim()) return 0;
  const r = await query(
    `SELECT COUNT(*)::int AS c FROM pool_block_wins
     WHERE pool_id = $1 AND height >= $2 AND miner_address = $3`,
    [poolId, fromHeight, minerAddress.trim()],
  );
  return r.rows[0]?.c ?? 0;
}

async function activeMembers(poolId) {
  if (!dbEnabled()) return [];
  const r = await query(
    `SELECT miner_address, join_height, count_at_join
     FROM pool_members
     WHERE pool_id = $1 AND status = 'active'`,
    [poolId],
  );
  return r.rows;
}

export async function buildPoolDashboard(poolId, minerAddress) {
  const pool = OFFICIAL_POOLS.find((p) => p.pool_id === poolId);
  if (!pool) return null;

  let treasuryBalanceWei = 0n;
  try {
    treasuryBalanceWei = BigInt(await getTreasuryBalance(pool.treasury_address));
  } catch {
    treasuryBalanceWei = 0n;
  }

  const members = await activeMembers(poolId);
  const memberCount = members.length;
  const [blocksWonTotal, lastPoolBlockHeight] = await Promise.all([
    countPoolBlocks(poolId, 0),
    latestPoolBlockHeight(poolId),
  ]);

  const base = {
    pool_id: pool.pool_id,
    name: pool.name,
    finder_bps: pool.finder_bps,
    treasury_address: pool.treasury_address,
    member_count: memberCount,
    blocks_won_total: blocksWonTotal,
    treasury_balance_wei: treasuryBalanceWei.toString(),
    min_credits_for_share: 0,
  };

  if (!minerAddress?.trim()) {
    return { pool: base, miner: null };
  }

  const addr = minerAddress.trim();
  const [bind, member, owed] = await Promise.all([
    getPoolBind(addr),
    getPoolMember(addr),
    computeOwedStatus(addr),
  ]);

  const isMember = bind?.status === "active" && (bind.join_height ?? 0) > 0;
  const isThisPool = isMember && Number(bind.pool_id) === poolId;
  const joinHeight = isThisPool ? Number(bind.join_height ?? 0) : 0;
  const countAtJoin = isThisPool ? Number(bind.count_at_join ?? 0) : 0;
  const challengeCount = isThisPool ? Number(member?.challenge_count ?? countAtJoin) : 0;
  const creditDelta = isThisPool ? Math.max(0, challengeCount - countAtJoin) : 0;
  const shareEligible = isThisPool;
  const creditsUntilShare = 0;

  const blocksMinedByYou = isThisPool
    ? await countBlocksMinedBy(poolId, addr, joinHeight)
    : 0;

  const pplnc = await getPplncState(poolId);
  const nActive = Number(pplnc.pplnc_n_active ?? PPLNC_N_MIN);
  const window = await getPoolWindowFill(poolId, nActive);
  const lastRound = await getLastPplncRound(poolId);
  const lastRoundCredit = isThisPool && lastRound
    ? await getMemberLastRoundCredit(lastRound.id, addr)
    : null;

  const estimatedShareWei = BigInt(lastRoundCredit?.amount_wei ?? "0");
  const poolInflowForShareWei = BigInt(lastRound?.distributed_wei ?? "0");
  const poolTotalShareWeight = Number(lastRound?.total_weight ?? 0);
  const myLastRoundWeight = Number(lastRoundCredit?.weight ?? 0);

  const owedWei = isThisPool && owed?.pool_id === poolId ? BigInt(owed.owed_wei ?? "0") : 0n;
  const estimatedPending =
    estimatedShareWei > owedWei ? estimatedShareWei - owedWei : 0n;
  const totalMinerBalanceWei = owedWei + estimatedPending;

  return {
    pool: {
      ...base,
      reward_mode: pplnc.reward_mode,
      pplnc_n_active: nActive,
      pplnc_rate_ema: pplnc.pplnc_rate_ema,
      pplnc_window_fill_pct: window.window_fill_pct,
      pplnc_window_events: window.window_events,
      last_round_height: Number(lastRound?.height ?? 0),
      last_pool_block_height: lastPoolBlockHeight,
      pool_inflow_for_share_wei: poolInflowForShareWei.toString(),
    },
    miner: {
      address: addr,
      is_member: isMember,
      is_this_pool: isThisPool,
      join_height: joinHeight,
      count_at_join: countAtJoin,
      challenge_count: challengeCount,
      credit_delta: creditDelta,
      share_eligible: shareEligible,
      credits_until_share: creditsUntilShare,
      share_weight: myLastRoundWeight,
      pool_total_share_weight: poolTotalShareWeight,
      blocks_mined_by_you_since_join: blocksMinedByYou,
      estimated_share_wei: estimatedShareWei.toString(),
      estimated_pending_wei: estimatedPending.toString(),
      total_balance_wei: totalMinerBalanceWei.toString(),
      owed_wei: owedWei.toString(),
      payout_net_wei: isThisPool && owed ? payoutNetFromGross(owedWei).toString() : "0",
      withdraw_fee_wei: owed?.withdraw_fee_wei ?? "100000000",
      can_withdraw: isThisPool && Boolean(owed?.can_withdraw),
      withdraw_reasons: owed?.reasons ?? [],
      stake_active: Boolean(member?.stake_active),
    },
  };
}
