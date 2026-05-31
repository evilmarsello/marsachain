/**
 * Marsa official mining pool API (v1).
 * Official mining pool API — nginx /api/pool/* → :8788
 */
import http from "node:http";
import { loadEnvFile } from "./loadEnv.mjs";
import { OFFICIAL_POOLS, POOL_EPOCH_BLOCKS, POOL_REWARD_MODE } from "./config.mjs";

loadEnvFile();
import { dbEnabled, query } from "./db.mjs";
import { computeOwedStatus } from "./owed.mjs";
import { requestWithdraw } from "./withdraw.mjs";
import { startIndexerLoop } from "./indexer.mjs";
import { startSettlementLoop } from "./settlement.mjs";
import { startWithdrawLoop } from "./withdraw.mjs";
import { initializeTreasuryGuard, getTreasuryGuardStatus } from "./treasuryGuard.mjs";
import { getTreasuryBalance, getPoolMember } from "./nodeRpc.mjs";
import { buildPoolDashboard } from "./poolDashboard.mjs";
import { getLastPplncRound, getPoolWindowFill, getPplncState } from "./pplncStats.mjs";

const PORT = Number.parseInt(process.env.PORT || "8788", 10);
const READ_NODE = (process.env.READ_NODE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function poolStats(poolId) {
  if (!dbEnabled()) return { member_count: 0, blocks_won_epoch: 0 };
  const members = await query(
    `SELECT COUNT(*)::int AS c FROM pool_members WHERE pool_id = $1 AND status = 'active'`,
    [poolId],
  );
  const wins = await query(
    `SELECT COUNT(*)::int AS c FROM pool_block_wins WHERE pool_id = $1`,
    [poolId],
  );
  return {
    member_count: members.rows[0]?.c ?? 0,
    blocks_won_total: wins.rows[0]?.c ?? 0,
  };
}

async function handleList(res) {
  const pools = await Promise.all(
    OFFICIAL_POOLS.map(async (p) => {
      const stats = await poolStats(p.pool_id);
      let treasury_balance_wei = null;
      try {
        treasury_balance_wei = await getTreasuryBalance(p.treasury_address);
      } catch {
        /* ignore */
      }
      return { ...p, ...stats, treasury_balance_wei };
    }),
  );
  json(res, 200, {
    ok: true,
    pools,
    epoch_blocks: POOL_EPOCH_BLOCKS,
    reward_mode: String(POOL_REWARD_MODE).toLowerCase(),
    database: dbEnabled(),
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, {
        ok: true,
        service: "marsa-pool-api",
        read_node: READ_NODE,
        database: dbEnabled(),
        treasury_guard: getTreasuryGuardStatus(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/pool/list") {
      await handleList(res);
      return;
    }

    const dashboardMatch = url.pathname.match(/^\/api\/pool\/(\d+)\/dashboard$/);
    if (req.method === "GET" && dashboardMatch) {
      const poolId = Number(dashboardMatch[1]);
      const address = url.searchParams.get("address")?.trim() || "";
      const data = await buildPoolDashboard(poolId, address);
      if (!data) {
        json(res, 404, { ok: false, error: "pool_not_found" });
        return;
      }
      json(res, 200, { ok: true, ...data });
      return;
    }

    const poolDetail = url.pathname.match(/^\/api\/pool\/(\d+)$/);
    if (req.method === "GET" && poolDetail) {
      const poolId = Number(poolDetail[1]);
      const p = OFFICIAL_POOLS.find((x) => x.pool_id === poolId);
      if (!p) {
        json(res, 404, { ok: false, error: "pool_not_found" });
        return;
      }
      const stats = await poolStats(poolId);
      json(res, 200, { ok: true, pool: { ...p, ...stats } });
      return;
    }

    const pplncLastRound = url.pathname.match(/^\/api\/pool\/(\d+)\/pplnc\/last_round$/);
    if (req.method === "GET" && pplncLastRound) {
      const poolId = Number(pplncLastRound[1]);
      const round = await getLastPplncRound(poolId);
      json(res, 200, { ok: true, pool_id: poolId, round });
      return;
    }

    const poolStatsMatch = url.pathname.match(/^\/api\/pool\/(\d+)\/stats$/);
    if (req.method === "GET" && poolStatsMatch) {
      const poolId = Number(poolStatsMatch[1]);
      const pplnc = await getPplncState(poolId);
      const window = await getPoolWindowFill(poolId, Number(pplnc.pplnc_n_active));
      json(res, 200, {
        ok: true,
        pool_id: poolId,
        reward_mode: pplnc.reward_mode,
        pplnc_n_active: Number(pplnc.pplnc_n_active),
        pplnc_rate_ema: Number(pplnc.pplnc_rate_ema),
        window_fill_pct: window.window_fill_pct,
        window_events: window.window_events,
      });
      return;
    }

    const memberMatch = url.pathname.match(/^\/api\/pool\/(\d+)\/member\/([^/]+)$/);
    if (req.method === "GET" && memberMatch) {
      const address = decodeURIComponent(memberMatch[2]);
      const member = await getPoolMember(address);
      const owed = await computeOwedStatus(address);
      json(res, 200, { ok: true, pool_id: Number(memberMatch[1]), member, owed });
      return;
    }

    const owedMatch = url.pathname.match(/^\/api\/pool\/owed\/([^/]+)$/);
    if (req.method === "GET" && owedMatch) {
      const address = decodeURIComponent(owedMatch[1]);
      const owed = await computeOwedStatus(address);
      json(res, 200, { ok: true, ...owed });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/pool/withdraw/request") {
      const body = await readJsonBody(req);
      const result = await requestWithdraw(body);
      if (!result.ok) {
        json(res, result.status || 400, { ok: false, ...result });
        return;
      }
      json(res, 200, { ok: true, ...result });
      return;
    }

    const wdStatus = url.pathname.match(/^\/api\/pool\/withdraw\/status\/(\d+)$/);
    if (req.method === "GET" && wdStatus) {
      if (!dbEnabled()) {
        json(res, 503, { ok: false, error: "database_not_configured" });
        return;
      }
      const r = await query("SELECT * FROM pool_withdrawals WHERE id = $1", [wdStatus[1]]);
      if (!r.rows[0]) {
        json(res, 404, { ok: false, error: "not_found" });
        return;
      }
      const row = r.rows[0];
      json(res, 200, {
        ok: true,
        status: row.status,
        txid: row.txid,
        error: row.error,
      });
      return;
    }

    const wdHist = url.pathname.match(/^\/api\/pool\/withdraw\/history\/([^/]+)$/);
    if (req.method === "GET" && wdHist) {
      const address = decodeURIComponent(wdHist[1]);
      if (!dbEnabled()) {
        json(res, 200, { ok: true, withdrawals: [] });
        return;
      }
      const r = await query(
        `SELECT id, amount_wei, status, txid, error, requested_at, processed_at
         FROM pool_withdrawals WHERE miner_address = $1 ORDER BY requested_at DESC LIMIT 50`,
        [address],
      );
      json(res, 200, { ok: true, withdrawals: r.rows });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/pool/leave/prepare") {
      const body = await readJsonBody(req);
      json(res, 200, {
        ok: true,
        tx_type: 14,
        fee_wei: "100000000",
        hint: "Sign MINER_POOL_UNSTAKE in wallet; metadata.pool_id required",
        pool_id: body.pool_id,
      });
      return;
    }

    json(res, 404, { ok: false, error: "not_found" });
  } catch (e) {
    console.error("[api]", e);
    json(res, 500, { ok: false, error: "internal_error", message: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  initializeTreasuryGuard();
  console.log(`marsa-pool-api http://127.0.0.1:${PORT} read=${READ_NODE} db=${dbEnabled()}`);
  startIndexerLoop();
  startSettlementLoop();
  startWithdrawLoop();
});
