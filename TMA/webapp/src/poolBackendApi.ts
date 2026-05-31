/** Official pool backend — GET/POST /api/pool/* (marsa-pool-api on VPS). */

import type { OfficialPoolCatalogItem } from "./poolApi";
import { fetchWithTimeout } from "./fetchTimeout";
import { formatMrsFromBigIntNanos } from "./totalBalance";

export type PoolCatalogWithStats = OfficialPoolCatalogItem & {
  member_count?: number;
  blocks_won_total?: number;
  treasury_balance_wei?: string | null;
  reward_mode?: string;
  pplnc_n_active?: number;
  pplnc_rate_ema?: number;
  pplnc_window_fill_pct?: number;
  pplnc_window_events?: number;
  last_round_height?: number;
  last_pool_block_height?: number;
};

export type PoolDashboardMiner = {
  address?: string;
  is_member?: boolean;
  is_this_pool?: boolean;
  join_height?: number;
  count_at_join?: number;
  challenge_count?: number;
  credit_delta?: number;
  share_eligible?: boolean;
  credits_until_share?: number;
  share_weight?: number;
  pool_total_share_weight?: number;
  blocks_mined_by_you_since_join?: number;
  estimated_share_wei?: string;
  estimated_pending_wei?: string;
  total_balance_wei?: string;
  owed_wei?: string;
  payout_net_wei?: string;
  withdraw_fee_wei?: string;
  can_withdraw?: boolean;
  withdraw_reasons?: string[];
  stake_active?: boolean;
};

export type PoolDashboardResponse = {
  pool?: PoolCatalogWithStats & {
    treasury_balance_wei?: string;
    pool_inflow_since_join_wei?: string;
    pool_inflow_for_share_wei?: string;
  };
  miner?: PoolDashboardMiner | null;
};

export type PoolOwedInfo = {
  miner_address?: string;
  pool_id?: number | null;
  owed_wei?: string;
  payout_net_wei?: string;
  withdraw_fee_wei?: string;
  can_withdraw?: boolean;
  reasons?: string[];
  credit_delta?: number;
  credits_required?: number;
  epoch_progress?: {
    epoch_blocks?: number;
    blocks_until_epoch_end?: number;
    current_height?: number;
  };
};

function apiRoot(): string {
  const base = (import.meta.env.VITE_POOL_API_BASE as string | undefined)?.trim() || "/api/pool";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export async function fetchBackendPoolList(timeoutMs = 6_000): Promise<{
  pools: PoolCatalogWithStats[];
  epoch_blocks?: number;
} | null> {
  const url = `${apiRoot()}/list`;
  try {
    const res = await fetchWithTimeout(url, {}, timeoutMs);
    const j = (await res.json()) as {
      ok?: boolean;
      pools?: PoolCatalogWithStats[];
      epoch_blocks?: number;
    };
    if (!j.ok || !j.pools?.length) return null;
    return { pools: j.pools, epoch_blocks: j.epoch_blocks };
  } catch {
    return null;
  }
}

export async function fetchPoolDashboard(
  poolId: number,
  address: string,
  timeoutMs = 12_000,
): Promise<PoolDashboardResponse | null> {
  const trimmed = address.trim();
  const q = trimmed ? `?address=${encodeURIComponent(trimmed)}` : "";
  const url = `${apiRoot()}/${poolId}/dashboard${q}`;
  try {
    const res = await fetchWithTimeout(url, { cache: "no-store" }, timeoutMs);
    const j = (await res.json()) as { ok?: boolean; error?: string } & PoolDashboardResponse;
    if (res.ok && j.ok && j.pool) {
      return { pool: j.pool, miner: j.miner ?? null };
    }
  } catch {
    /* fall through to basic pool endpoint */
  }
  return fetchPoolDetailFallback(poolId, address, timeoutMs);
}

async function fetchPoolDetailFallback(
  poolId: number,
  address: string,
  timeoutMs: number,
): Promise<PoolDashboardResponse | null> {
  try {
    const res = await fetchWithTimeout(`${apiRoot()}/${poolId}`, { cache: "no-store" }, timeoutMs);
    const j = (await res.json()) as {
      ok?: boolean;
      pool?: PoolCatalogWithStats & { treasury_balance_wei?: string | null };
    };
    if (!res.ok || !j.ok || !j.pool) return null;
    return { pool: { ...j.pool, treasury_balance_wei: j.pool.treasury_balance_wei ?? "0" }, miner: null };
  } catch {
    return null;
  }
}

export async function fetchPoolOwed(address: string): Promise<PoolOwedInfo | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const url = `${apiRoot()}/owed/${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean } & PoolOwedInfo;
    if (!j.ok) return null;
    return j;
  } catch {
    return null;
  }
}

export async function requestPoolWithdraw(params: {
  miner_address: string;
  pool_id: number;
  signature: string;
  pub_key: string;
  nonce: string;
}): Promise<
  | { ok: true; withdrawal_id: number; amount_wei: string; status: string }
  | { ok: false; message: string }
> {
  const url = `${apiRoot()}/withdraw/request`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const j = (await res.json()) as {
      ok?: boolean;
      withdrawal_id?: number;
      amount_wei?: string;
      status?: string;
      error?: string;
      reasons?: string[];
    };
    if (j.ok && j.withdrawal_id != null) {
      return {
        ok: true,
        withdrawal_id: j.withdrawal_id,
        amount_wei: j.amount_wei ?? "0",
        status: j.status ?? "pending",
      };
    }
    const msg =
      j.error ??
      (j.reasons?.length ? j.reasons.join(", ") : undefined) ??
      "Withdraw request failed";
    return { ok: false, message: msg };
  } catch (e) {
    return { ok: false, message: (e as Error)?.message ?? "Network error" };
  }
}

export function formatWeiToMrs(wei: string | number | bigint): string {
  const n = typeof wei === "bigint" ? wei : BigInt(String(wei));
  return formatMrsFromBigIntNanos(n, 2);
}
