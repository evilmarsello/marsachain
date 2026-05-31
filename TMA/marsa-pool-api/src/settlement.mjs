import { query, getIndexerState, setIndexerState, dbEnabled } from "./db.mjs";
import { getPoolBind, getPoolMember, getChainTip } from "./nodeRpc.mjs";
import {
  POOL_EPOCH_BLOCKS,
  FINALITY_BLOCKS,
  OFFICIAL_POOLS,
  POOL_REWARD_MODE,
  POOL_MIN_CREDITS_FOR_SHARE,
  PPLNC_TARGET_WINDOW_SECONDS,
  PPLNC_N_MIN,
  PPLNC_RECALC_INTERVAL_SECONDS,
  PPLNC_RATE_EMA_ALPHA,
  epochStartForHeight,
  epochEndForStart,
} from "./config.mjs";
import { SQL_TREASURY_INFLOW, minerPoolInflowWei } from "./poolEconomics.mjs";
import { creditDeltaSinceJoin } from "./poolShare.mjs";

const KEY_SETTLED_PREFIX = "settled_epoch_end:";
const KEY_PPLNC_LAST_RECALC_PREFIX = "pplnc:last_recalc_ms:";
const KEY_PPLNC_N_ACTIVE_PREFIX = "pplnc:n_active:";
const KEY_PPLNC_RATE_EMA_PREFIX = "pplnc:rate_ema:";

async function alreadySettled(poolId, epochStart) {
  const r = await query(
    "SELECT 1 FROM pool_settlements WHERE pool_id = $1 AND epoch_start = $2",
    [poolId, epochStart],
  );
  return r.rowCount > 0;
}

async function activeMembersInEpoch(poolId, epochStart, epochEnd) {
  const r = await query(
    `SELECT miner_address, join_height, leave_height, count_at_join
     FROM pool_members
     WHERE pool_id = $1
       AND join_height <= $2
       AND (leave_height IS NULL OR leave_height >= $3)`,
    [poolId, epochEnd, epochStart],
  );
  return r.rows;
}

async function sumInflow(poolId, epochStart, epochEnd) {
  const r = await query(
    `SELECT COALESCE(SUM(${SQL_TREASURY_INFLOW}), 0)::bigint AS total
     FROM pool_block_wins
     WHERE pool_id = $1 AND height >= $2 AND height <= $3`,
    [poolId, epochStart, epochEnd],
  );
  return BigInt(r.rows[0]?.total ?? 0);
}

async function winsInEpoch(poolId, epochStart, epochEnd) {
  const r = await query(
    `SELECT miner_address, block_reward_wei, fees_wei
     FROM pool_block_wins
     WHERE pool_id = $1 AND height >= $2 AND height <= $3`,
    [poolId, epochStart, epochEnd],
  );
  return r.rows;
}

async function deltaForMember(miner, poolId, epochStart, epochEnd, countAtJoin, leaveHeight) {
  const bind = await getPoolBind(miner);
  const snapStart =
    (await getPoolMember(miner, epochStart > 0 ? epochStart - 1 : 0))?.challenge_count ??
    countAtJoin ??
    bind?.count_at_join ??
    0;
  let snapEnd =
    (await getPoolMember(miner, epochEnd))?.challenge_count ?? snapStart;
  if (leaveHeight != null && leaveHeight >= epochStart && leaveHeight <= epochEnd) {
    const atLeave = await getPoolMember(miner, leaveHeight);
    if (atLeave?.challenge_count != null) snapEnd = atLeave.challenge_count;
  }
  const d = Number(snapEnd) - Number(snapStart);
  return d > 0 ? d : 0;
}

async function settlePoolEpoch(poolId, epochStart, epochEnd) {
  if (await alreadySettled(poolId, epochStart)) return;

  const inflow = await sumInflow(poolId, epochStart, epochEnd);
  if (inflow === 0n) {
    await query(
      `INSERT INTO pool_settlements (
        pool_id, epoch_start, epoch_end, total_inflow_wei, finder_paid_wei,
        distributed_wei, member_count
      ) VALUES ($1,$2,$3,0,0,0,0)
      ON CONFLICT (pool_id, epoch_start) DO NOTHING`,
      [poolId, epochStart, epochEnd],
    );
    return;
  }

  const members = await activeMembersInEpoch(poolId, epochStart, epochEnd);
  const deltas = new Map();
  let totalW = 0;
  for (const m of members) {
    const totalSinceJoin = await creditDeltaSinceJoin(
      m.miner_address,
      Number(m.count_at_join ?? 0),
    );
    if (totalSinceJoin < POOL_MIN_CREDITS_FOR_SHARE) continue;

    const d = await deltaForMember(
      m.miner_address,
      poolId,
      epochStart,
      epochEnd,
      m.count_at_join,
      m.leave_height,
    );
    if (d > 0) {
      deltas.set(m.miner_address, d);
      totalW += d;
    }
  }

  if (totalW === 0) {
    await query(
      `INSERT INTO pool_settlements (
        pool_id, epoch_start, epoch_end, total_inflow_wei, finder_paid_wei,
        distributed_wei, member_count
      ) VALUES ($1,$2,$3,$4,0,0,0)
      ON CONFLICT (pool_id, epoch_start) DO NOTHING`,
      [poolId, epochStart, epochEnd, inflow.toString()],
    );
    return;
  }

  const finderBonus = new Map();
  let totalFinder = 0n;
  const wins = await winsInEpoch(poolId, epochStart, epochEnd);
  for (const w of wins) {
    const bind = await getPoolBind(w.miner_address);
    const bps = Number(bind?.finder_bps_snapshot ?? 0);
    if (bps <= 0) continue;
    const blockIn = minerPoolInflowWei(w.block_reward_wei);
    const bonus = (blockIn * BigInt(bps)) / 10000n;
    if (bonus > 0n) {
      finderBonus.set(
        w.miner_address,
        (finderBonus.get(w.miner_address) ?? 0n) + bonus,
      );
      totalFinder += bonus;
    }
  }

  const distributable = inflow > totalFinder ? inflow - totalFinder : 0n;
  const shares = new Map();

  for (const [miner, delta] of deltas) {
    const share = (distributable * BigInt(delta)) / BigInt(totalW);
    shares.set(miner, share);
  }

  await query(
    `INSERT INTO pool_settlements (
      pool_id, epoch_start, epoch_end, total_inflow_wei, finder_paid_wei,
      distributed_wei, member_count
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (pool_id, epoch_start) DO NOTHING`,
    [
      poolId,
      epochStart,
      epochEnd,
      inflow.toString(),
      totalFinder.toString(),
      distributable.toString(),
      members.length,
    ],
  );

  for (const [miner, amount] of shares) {
    const finder = finderBonus.get(miner) ?? 0n;
    const total = amount + finder;
    if (total <= 0n) continue;
    await query(
      `INSERT INTO pool_shares (pool_id, epoch_start, miner_address, amount_wei, finder_bonus_wei)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (pool_id, epoch_start, miner_address) DO UPDATE SET
         amount_wei = EXCLUDED.amount_wei,
         finder_bonus_wei = EXCLUDED.finder_bonus_wei`,
      [poolId, epochStart, miner, amount.toString(), finder.toString()],
    );
    await query(
      `INSERT INTO pool_owed (miner_address, pool_id, amount_wei)
       VALUES ($1,$2,$3)
       ON CONFLICT (miner_address) DO UPDATE SET
         pool_id = EXCLUDED.pool_id,
         amount_wei = pool_owed.amount_wei + EXCLUDED.amount_wei,
         updated_at = now()`,
      [miner, poolId, total.toString()],
    );
  }

  for (const [miner, finder] of finderBonus) {
    if (shares.has(miner)) continue;
    if (finder <= 0n) continue;
    await query(
      `INSERT INTO pool_shares (pool_id, epoch_start, miner_address, amount_wei, finder_bonus_wei)
       VALUES ($1,$2,$3,0,$4)
       ON CONFLICT (pool_id, epoch_start, miner_address) DO NOTHING`,
      [poolId, epochStart, miner, finder.toString()],
    );
    await query(
      `INSERT INTO pool_owed (miner_address, pool_id, amount_wei)
       VALUES ($1,$2,$3)
       ON CONFLICT (miner_address) DO UPDATE SET
         pool_id = EXCLUDED.pool_id,
         amount_wei = pool_owed.amount_wei + EXCLUDED.amount_wei,
         updated_at = now()`,
      [miner, poolId, finder.toString()],
    );
  }
}

async function getPoolFinderBps(poolId) {
  return Number(OFFICIAL_POOLS.find((p) => p.pool_id === Number(poolId))?.finder_bps ?? 0);
}

async function recalcAdaptiveN(poolId, nowMs = Date.now()) {
  const pool = Number(poolId);
  const keyLast = `${KEY_PPLNC_LAST_RECALC_PREFIX}${pool}`;
  const keyN = `${KEY_PPLNC_N_ACTIVE_PREFIX}${pool}`;
  const keyRate = `${KEY_PPLNC_RATE_EMA_PREFIX}${pool}`;
  const recalcEveryMs = Math.max(1, Number(PPLNC_RECALC_INTERVAL_SECONDS)) * 1000;

  const [lastRaw, nRaw, rateRaw] = await Promise.all([
    getIndexerState(keyLast),
    getIndexerState(keyN),
    getIndexerState(keyRate),
  ]);

  const last = Number(lastRaw ?? 0);
  if (last > 0 && nowMs - last < recalcEveryMs && Number(nRaw ?? 0) > 0) {
    return Number(nRaw);
  }

  const rateWindowSeconds = Math.max(1, Number(PPLNC_RECALC_INTERVAL_SECONDS));
  const rateRes = await query(
    `SELECT COALESCE(SUM(delta_count), 0)::bigint AS c
       FROM pool_challenge_events
      WHERE pool_id = $1
        AND created_at >= now() - ($2::text || ' seconds')::interval`,
    [pool, String(rateWindowSeconds)],
  );
  const recentChallenges = Number(rateRes.rows[0]?.c ?? 0);
  const instantRate = recentChallenges / rateWindowSeconds;
  const prevRate = Number(rateRaw ?? 0);
  const alpha = Math.max(0, Math.min(1, Number(PPLNC_RATE_EMA_ALPHA)));
  const rateEma = prevRate > 0 ? alpha * instantRate + (1 - alpha) * prevRate : instantRate;
  const nRawCalc = Math.floor(rateEma * Number(PPLNC_TARGET_WINDOW_SECONDS));
  const nActive = Math.max(Number(PPLNC_N_MIN), Number.isFinite(nRawCalc) ? nRawCalc : Number(PPLNC_N_MIN));

  await Promise.all([
    setIndexerState(keyLast, String(nowMs)),
    setIndexerState(keyRate, String(rateEma)),
    setIndexerState(keyN, String(nActive)),
  ]);

  return nActive;
}

async function getWindowWeights(poolId, height, nActive) {
  const r = await query(
    `WITH ranked AS (
       SELECT seq, miner_address, delta_count,
              SUM(delta_count) OVER (ORDER BY seq DESC) AS cum
         FROM pool_challenge_events
        WHERE pool_id = $1 AND height <= $2
     ),
     picked AS (
       SELECT miner_address,
              CASE
                WHEN cum - delta_count >= $3 THEN 0
                WHEN cum <= $3 THEN delta_count
                ELSE $3 - (cum - delta_count)
              END AS used
         FROM ranked
        WHERE cum - delta_count < $3
     )
     SELECT miner_address, SUM(used)::bigint AS weight
       FROM picked
      WHERE used > 0
      GROUP BY miner_address`,
    [poolId, height, nActive],
  );
  return r.rows.map((x) => ({ miner_address: x.miner_address, weight: Number(x.weight ?? 0) }));
}

async function settlePplncRound(win, nActive) {
  const poolId = Number(win.pool_id);
  const height = Number(win.height);
  const finderAddress = String(win.miner_address);
  const blockReward = BigInt(win.block_reward_wei ?? 0);
  const inflow = minerPoolInflowWei(blockReward);
  const finderBps = await getPoolFinderBps(poolId);
  const finderPaid = (inflow * BigInt(finderBps)) / 10000n;
  const distributable = inflow > finderPaid ? inflow - finderPaid : 0n;
  const weights = await getWindowWeights(poolId, height, nActive);
  const totalWeight = weights.reduce((acc, w) => acc + BigInt(w.weight), 0n);
  const windowIncomplete = totalWeight < BigInt(nActive);

  await query("BEGIN");
  try {
    const inserted = await query(
      `INSERT INTO pool_pplnc_rounds (
         pool_id, height, finder_address, block_reward_wei, inflow_wei, finder_paid_wei,
         distributed_wei, window_challenges, total_weight, member_count, window_incomplete
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (pool_id, height) DO NOTHING
       RETURNING id`,
      [
        poolId,
        height,
        finderAddress,
        blockReward.toString(),
        inflow.toString(),
        finderPaid.toString(),
        distributable.toString(),
        String(nActive),
        totalWeight.toString(),
        weights.length,
        windowIncomplete,
      ],
    );
    const roundId = inserted.rows[0]?.id;
    if (!roundId) {
      await query("COMMIT");
      return;
    }

    for (const row of weights) {
      const w = BigInt(row.weight);
      const amount = totalWeight > 0n ? (distributable * w) / totalWeight : 0n;
      const finderBonus = row.miner_address === finderAddress ? finderPaid : 0n;
      const total = amount + finderBonus;
      await query(
        `INSERT INTO pool_pplnc_credits (round_id, miner_address, weight, amount_wei, finder_bonus_wei)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (round_id, miner_address) DO NOTHING`,
        [roundId, row.miner_address, String(w), amount.toString(), finderBonus.toString()],
      );
      if (total <= 0n) continue;
      await query(
        `INSERT INTO pool_owed (miner_address, pool_id, amount_wei)
         VALUES ($1,$2,$3)
         ON CONFLICT (miner_address) DO UPDATE SET
           pool_id = EXCLUDED.pool_id,
           amount_wei = pool_owed.amount_wei + EXCLUDED.amount_wei,
           updated_at = now()`,
        [row.miner_address, poolId, total.toString()],
      );
    }

    if (finderPaid > 0n && !weights.some((w) => w.miner_address === finderAddress)) {
      await query(
        `INSERT INTO pool_pplnc_credits (round_id, miner_address, weight, amount_wei, finder_bonus_wei)
         VALUES ($1,$2,0,0,$3)
         ON CONFLICT (round_id, miner_address) DO NOTHING`,
        [roundId, finderAddress, finderPaid.toString()],
      );
      await query(
        `INSERT INTO pool_owed (miner_address, pool_id, amount_wei)
         VALUES ($1,$2,$3)
         ON CONFLICT (miner_address) DO UPDATE SET
           pool_id = EXCLUDED.pool_id,
           amount_wei = pool_owed.amount_wei + EXCLUDED.amount_wei,
           updated_at = now()`,
        [finderAddress, poolId, finderPaid.toString()],
      );
    }

    await query("COMMIT");
  } catch (e) {
    await query("ROLLBACK");
    throw e;
  }
}

async function tryRunPplncSettlement(tip) {
  const safeTip = Number(tip) - Number(FINALITY_BLOCKS);
  if (safeTip < 1) return;

  const wins = await query(
    `SELECT w.pool_id, w.height, w.miner_address, w.block_reward_wei
       FROM pool_block_wins w
  LEFT JOIN pool_pplnc_rounds r ON r.pool_id = w.pool_id AND r.height = w.height
      WHERE w.height <= $1 AND r.id IS NULL
      ORDER BY w.height ASC
      LIMIT 200`,
    [safeTip],
  );

  for (const win of wins.rows) {
    const nActive = await recalcAdaptiveN(win.pool_id);
    await settlePplncRound(win, nActive);
  }
}

async function tryRunEpochSettlement(tip) {
  if (!dbEnabled()) return;
  const safeTip = tip - FINALITY_BLOCKS;
  if (safeTip < POOL_EPOCH_BLOCKS) return;

  const epochEnd = Math.floor(safeTip / POOL_EPOCH_BLOCKS) * POOL_EPOCH_BLOCKS + POOL_EPOCH_BLOCKS - 1;
  if (epochEnd % POOL_EPOCH_BLOCKS !== POOL_EPOCH_BLOCKS - 1) return;

  const epochStart = epochEnd - POOL_EPOCH_BLOCKS + 1;
  const flagKey = KEY_SETTLED_PREFIX + epochEnd;
  if ((await getIndexerState(flagKey)) === "1") return;

  for (const pool of OFFICIAL_POOLS) {
    await settlePoolEpoch(pool.pool_id, epochStart, epochEnd);
  }
  await setIndexerState(flagKey, "1");
}

export async function tryRunSettlement(tip) {
  if (!dbEnabled()) return;
  if (String(POOL_REWARD_MODE).toLowerCase() === "pplnc") {
    await tryRunPplncSettlement(tip);
    return;
  }
  await tryRunEpochSettlement(tip);
}

export function startSettlementLoop() {
  if (!dbEnabled()) return;
  const interval = Number(process.env.SETTLEMENT_CHECK_MS || "30000");
  setInterval(() => {
    getChainTip()
      .then((tip) => tryRunSettlement(tip))
      .catch((e) => console.error("[settlement]", e));
  }, interval);
}
