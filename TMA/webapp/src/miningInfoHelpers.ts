/** Shared parsing / fetch for GET /account/mining_info (Android MinerStakeInfoDTO). */

export type MiningInfoPayload = {
  current_height?: number;
  miner_stake_active?: boolean;
  has_stake?: boolean;
  staked_amount?: number;
  staked_amount_formatted?: string;
  freeze_cost_formatted?: string;
  available_credits?: number;
  used_credits?: number;
  total_credits_per_window?: number;
  can_unstake?: boolean;
  blocks_until_can_unstake?: number;
  blocks_until_refill?: number;
  min_unstake_block?: number;
  min_stake_formatted?: string;
  min_stake_amount?: number;
  min_stake_duration?: number;
  max_stake_duration?: number;
  unlock_block?: number;
  is_pool_stake?: boolean;
  stake_type?: string;
  pool_bind_active?: boolean;
};

export function miningNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function miningBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

function parseMiningInfoData(raw: Record<string, unknown>): MiningInfoPayload {
  const hasStakeRaw = raw.has_stake ?? raw.hasStake;
  const minerActive = raw.miner_stake_active ?? raw.minerStakeActive;
  let has_stake = miningBool(hasStakeRaw);
  if (!has_stake) {
    const staked = miningNum(raw.staked_amount ?? raw.stakedAmount);
    const fmt = String(raw.staked_amount_formatted ?? raw.stakedAmountFormatted ?? "").trim();
    has_stake = staked > 0 || (fmt !== "" && Number.isFinite(Number(fmt)) && Number(fmt) > 0);
  }
  return {
    ...(raw as MiningInfoPayload),
    has_stake,
    miner_stake_active: miningBool(minerActive),
    available_credits: miningNum(raw.available_credits ?? raw.availableCredits),
    total_credits_per_window: miningNum(raw.total_credits_per_window ?? raw.totalCreditsPerWindow),
    blocks_until_refill: miningNum(raw.blocks_until_refill ?? raw.blocksUntilRefill),
    current_height: miningNum(raw.current_height ?? raw.currentHeight),
    unlock_block:
      raw.unlock_block != null || raw.unlockBlock != null
        ? miningNum(raw.unlock_block ?? raw.unlockBlock)
        : undefined,
    is_pool_stake: miningBool(raw.is_pool_stake ?? raw.isPoolStake),
    stake_type: String(raw.stake_type ?? raw.stakeType ?? "").trim() || undefined,
    pool_bind_active: miningBool(raw.pool_bind_active ?? raw.poolBindActive),
  };
}

export function miningInfoIsPoolStake(d: MiningInfoPayload | null | undefined): boolean {
  if (!d) return false;
  if (d.is_pool_stake === true) return true;
  if (d.pool_bind_active === true) return true;
  const t = String(d.stake_type ?? "").toLowerCase();
  return t === "pool";
}

export function parseMiningInfoResponse(json: string): MiningInfoPayload | null {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const d = o.data;
    if (!d || typeof d !== "object") return null;
    if (o.ok === false || o.success === false) return null;
    if (o.ok !== true && o.success !== true) return null;
    return parseMiningInfoData(d as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function fetchMiningInfoDirect(base: string, addr: string): Promise<MiningInfoPayload | null> {
  const trimmed = addr.trim();
  if (!trimmed) return null;
  const root = base.trim().endsWith("/") ? base.trim() : `${base.trim()}/`;
  const url = `${root}account/mining_info?address=${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const o = (await res.json()) as Record<string, unknown>;
    const d = o.data;
    if (!d || typeof d !== "object") return null;
    if (o.success === false || o.ok === false) return null;
    return parseMiningInfoData(d as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function miningInfoHasActiveStake(d: MiningInfoPayload | null | undefined): boolean {
  if (!d) return false;
  let flagged = d.has_stake === true;
  if (!flagged) {
    const staked = miningNum(d.staked_amount);
    const fmt = String(d.staked_amount_formatted ?? "").trim();
    flagged = staked > 0 || (fmt !== "" && Number.isFinite(Number(fmt)) && Number(fmt) > 0);
  }
  if (!flagged) return false;
  const unlock = d.unlock_block;
  const cur = miningNum(d.current_height);
  if (unlock != null && Number.isFinite(unlock) && cur >= unlock) return false;
  return true;
}

export async function fetchMiningInfoForAddress(
  addr: string,
  ...bases: string[]
): Promise<MiningInfoPayload | null> {
  const seen = new Set<string>();
  const bridge = window.__TMA_SHARED__;
  for (const base of bases) {
    const b = base.trim();
    if (!b || seen.has(b)) continue;
    seen.add(b);
    if (bridge?.fetchMiningInfoJson) {
      try {
        const json = await bridge.fetchMiningInfoJson(b, addr);
        const data = parseMiningInfoResponse(json);
        if (data) return data;
      } catch {
        /* try direct fetch */
      }
    }
    const direct = await fetchMiningInfoDirect(b, addr);
    if (direct) return direct;
  }
  return null;
}
