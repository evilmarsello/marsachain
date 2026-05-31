import { dbEnabled, getIndexerState, query } from "./db.mjs";
import { PPLNC_N_MIN, POOL_REWARD_MODE } from "./config.mjs";

const KEY_PPLNC_N_ACTIVE_PREFIX = "pplnc:n_active:";
const KEY_PPLNC_RATE_EMA_PREFIX = "pplnc:rate_ema:";

export async function getPplncState(poolId) {
  const pool = Number(poolId);
  if (!dbEnabled()) {
    return {
      reward_mode: String(POOL_REWARD_MODE).toLowerCase(),
      pplnc_n_active: Number(PPLNC_N_MIN),
      pplnc_rate_ema: 0,
    };
  }
  const [nRaw, rateRaw] = await Promise.all([
    getIndexerState(`${KEY_PPLNC_N_ACTIVE_PREFIX}${pool}`),
    getIndexerState(`${KEY_PPLNC_RATE_EMA_PREFIX}${pool}`),
  ]);
  return {
    reward_mode: String(POOL_REWARD_MODE).toLowerCase(),
    pplnc_n_active: Math.max(Number(PPLNC_N_MIN), Number(nRaw ?? 0) || Number(PPLNC_N_MIN)),
    pplnc_rate_ema: Number(rateRaw ?? 0),
  };
}

export async function getPoolWindowFill(poolId, nActive) {
  if (!dbEnabled()) return { window_events: 0, window_fill_pct: 0 };
  const r = await query(
    `WITH ranked AS (
       SELECT delta_count,
              SUM(delta_count) OVER (ORDER BY seq DESC) AS cum
         FROM pool_challenge_events
        WHERE pool_id = $1
     )
     SELECT COALESCE(SUM(
       CASE
         WHEN cum - delta_count >= $2 THEN 0
         WHEN cum <= $2 THEN delta_count
         ELSE $2 - (cum - delta_count)
       END
     ), 0)::bigint AS c
       FROM ranked
      WHERE cum - delta_count < $2`,
    [poolId, nActive],
  );
  const events = Number(r.rows[0]?.c ?? 0);
  const fill = nActive > 0 ? Math.min(100, Math.floor((events * 100) / nActive)) : 0;
  return { window_events: events, window_fill_pct: fill };
}

export async function getLastPplncRound(poolId) {
  if (!dbEnabled()) return null;
  const r = await query(
    `SELECT id, pool_id, height, finder_address, block_reward_wei, inflow_wei,
            finder_paid_wei, distributed_wei, window_challenges, total_weight,
            member_count, window_incomplete, settled_at
       FROM pool_pplnc_rounds
      WHERE pool_id = $1
      ORDER BY height DESC
      LIMIT 1`,
    [poolId],
  );
  return r.rows[0] ?? null;
}

export async function getMemberLastRoundCredit(roundId, minerAddress) {
  if (!dbEnabled() || !roundId || !minerAddress) return null;
  const r = await query(
    `SELECT weight, amount_wei, finder_bonus_wei
       FROM pool_pplnc_credits
      WHERE round_id = $1 AND miner_address = $2
      LIMIT 1`,
    [roundId, minerAddress],
  );
  return r.rows[0] ?? null;
}

