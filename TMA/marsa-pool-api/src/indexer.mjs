import { query, getIndexerState, setIndexerState, dbEnabled } from "./db.mjs";
import { getChainTip, getBlockAtHeight, getPoolBind, getPoolMember } from "./nodeRpc.mjs";
import { OFFICIAL_POOLS } from "./config.mjs";
import { tryRunSettlement } from "./settlement.mjs";

const KEY_LAST_HEIGHT = "last_indexed_height";
const KEY_LAST_TIP = "last_seen_tip";

const treasurySet = new Set(OFFICIAL_POOLS.map((p) => p.treasury_address));

function poolIdForTreasury(addr) {
  const p = OFFICIAL_POOLS.find((x) => x.treasury_address === addr);
  return p ? p.pool_id : null;
}

async function upsertMemberFromBind(bind, minerAddress) {
  if (!bind || bind.status !== "active") return;
  await query(
    `INSERT INTO pool_members (
      miner_address, pool_id, join_height, count_at_join,
      finder_bps_snapshot, treasury_address_snapshot, status
    ) VALUES ($1,$2,$3,$4,$5,$6,'active')
    ON CONFLICT (miner_address) DO UPDATE SET
      pool_id = EXCLUDED.pool_id,
      join_height = EXCLUDED.join_height,
      count_at_join = EXCLUDED.count_at_join,
      finder_bps_snapshot = EXCLUDED.finder_bps_snapshot,
      treasury_address_snapshot = EXCLUDED.treasury_address_snapshot,
      status = 'active',
      leave_height = NULL,
      updated_at = now()`,
    [
      minerAddress,
      bind.pool_id,
      bind.join_height ?? 0,
      bind.count_at_join ?? 0,
      bind.finder_bps_snapshot ?? 0,
      bind.treasury_address_snapshot ?? "",
    ],
  );
}

async function markMemberLeft(minerAddress, leaveHeight) {
  await query(
    `UPDATE pool_members SET status = 'left', leave_height = $2, updated_at = now()
     WHERE miner_address = $1`,
    [minerAddress, leaveHeight],
  );
}

async function syncChallengeEvents(tipHeight) {
  const active = await query(
    `SELECT miner_address, pool_id FROM pool_members WHERE status = 'active'`,
  );
  for (const row of active.rows) {
    const minerAddress = row.miner_address;
    const poolId = Number(row.pool_id);
    const member = await getPoolMember(minerAddress);
    if (!member) continue;

    const challengeCount = Number(member.challenge_count ?? 0);
    const currentHeight = Number(member.current_height ?? tipHeight);
    const st = await query(
      `SELECT last_challenge_count FROM pool_member_index_state WHERE miner_address = $1`,
      [minerAddress],
    );
    const prevCount = Number(st.rows[0]?.last_challenge_count ?? challengeCount);
    const delta = challengeCount - prevCount;

    if (delta > 0) {
      await query(
        `INSERT INTO pool_challenge_events (pool_id, miner_address, height, delta_count)
         VALUES ($1,$2,$3,$4)`,
        [poolId, minerAddress, currentHeight, delta],
      );
    }

    await query(
      `INSERT INTO pool_member_index_state (miner_address, last_challenge_count, last_seen_height)
       VALUES ($1,$2,$3)
       ON CONFLICT (miner_address) DO UPDATE SET
         last_challenge_count = EXCLUDED.last_challenge_count,
         last_seen_height = EXCLUDED.last_seen_height,
         updated_at = now()`,
      [minerAddress, challengeCount, currentHeight],
    );
  }
}

async function indexBlock(height) {
  const block = await getBlockAtHeight(height);
  if (!block) return;

  const creator = block.block_creator;
  const coinbaseTo = block.coinbase_to;

  if (creator && coinbaseTo && treasurySet.has(coinbaseTo)) {
    const bind = await getPoolBind(creator);
    if (
      bind?.status === "active" &&
      bind.treasury_address_snapshot === coinbaseTo
    ) {
      const poolId = bind.pool_id ?? poolIdForTreasury(coinbaseTo);
      if (poolId != null) {
        const reward = Number(block.block_reward_wei) || 0;
        const fees = Number(block.fees_wei) || 0;
        await query(
          `INSERT INTO pool_block_wins (
            pool_id, height, miner_address, block_reward_wei, fees_wei, treasury_address
          ) VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (height) DO NOTHING`,
          [poolId, height, creator, reward, fees, coinbaseTo],
        );
      }
    }
  }

  for (const tx of block.txs || []) {
    const from = tx.from;
    if (!from) continue;
    if (tx.tx_type === 13) {
      const bind = await getPoolBind(from);
      if (bind) await upsertMemberFromBind(bind, from);
    }
    if (tx.tx_type === 14) {
      await markMemberLeft(from, height);
    }
  }
}

export async function runIndexerTick() {
  if (!dbEnabled()) return;
  const tip = await getChainTip();
  if (tip < 1) return;

  const lastTipStr = await getIndexerState(KEY_LAST_TIP);
  const lastIndexedStr = await getIndexerState(KEY_LAST_HEIGHT);
  let lastIndexed = lastIndexedStr ? Number(lastIndexedStr) : 0;
  const lastTip = lastTipStr ? Number(lastTipStr) : 0;

  if (lastTip > 0 && tip < lastTip - 1) {
    const rollbackFrom = Math.max(1, tip - 32);
    await query("DELETE FROM pool_block_wins WHERE height >= $1", [rollbackFrom]);
    await query("DELETE FROM pool_challenge_events WHERE height >= $1", [rollbackFrom]);
    await query(
      `DELETE FROM pool_pplnc_rounds WHERE height >= $1`,
      [rollbackFrom],
    );
    lastIndexed = Math.min(lastIndexed, rollbackFrom - 1);
  }

  const start = lastIndexed > 0 ? lastIndexed + 1 : 1;
  for (let h = start; h <= tip; h++) {
    await indexBlock(h);
    await setIndexerState(KEY_LAST_HEIGHT, h);
  }
  await setIndexerState(KEY_LAST_TIP, tip);

  await syncChallengeEvents(tip);
  await tryRunSettlement(tip);
}

export function startIndexerLoop() {
  if (!dbEnabled()) {
    console.warn("[marsa-pool-api] indexer disabled — no DATABASE_URL");
    return;
  }
  const interval = Number(process.env.INDEXER_INTERVAL_MS || "8000");
  void runIndexerTick();
  setInterval(() => {
    runIndexerTick().catch((e) => console.error("[indexer]", e));
  }, interval);
}
