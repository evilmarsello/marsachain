/** Official pools — fullnode GET /pool/* (via mining node proxy). */

import { fetchWithTimeout } from "./fetchTimeout";

export type OfficialPoolCatalogItem = {
  pool_id: number;
  name: string;
  finder_bps: number;
  treasury_address: string;
};

export type PoolBindInfo = {
  pool_id?: number;
  join_height?: number;
  status?: string;
  treasury_address_snapshot?: string;
  finder_bps_snapshot?: number;
  count_at_join?: number;
  stake_amount_wei?: number;
  unlock_block?: number;
  leave_height?: number;
};

export type PoolMemberInfo = {
  address?: string;
  pool_id?: number;
  join_height?: number;
  status?: string;
  challenge_count?: number;
  stake_active?: boolean;
  current_height?: number;
};

function root(base: string): string {
  const t = base.trim();
  return t.endsWith("/") ? t : `${t}/`;
}

export async function fetchOfficialPoolsList(
  nodeBase: string,
): Promise<{ pools: OfficialPoolCatalogItem[]; epoch_blocks?: number } | null> {
  const url = `${root(nodeBase)}pool/official/list`;
  try {
    const res = await fetchWithTimeout(url, {}, 8_000);
    const j = (await res.json()) as {
      success?: boolean;
      data?: { pools?: OfficialPoolCatalogItem[]; epoch_blocks?: number };
    };
    if (!j.success || !j.data?.pools) return null;
    return { pools: j.data.pools, epoch_blocks: j.data.epoch_blocks };
  } catch {
    return null;
  }
}

/** True only for a real on-chain pool_bind (not empty defaults from node). */
export function poolBindIsActive(bind: PoolBindInfo | null | undefined): boolean {
  if (!bind || bind.status !== "active") return false;
  const joinH = Number(bind.join_height ?? 0);
  return joinH > 0;
}

export async function fetchPoolBind(nodeBase: string, address: string): Promise<PoolBindInfo | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const url = `${root(nodeBase)}pool/bind/${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetchWithTimeout(url, {}, 6_000);
    if (res.status === 404) return null;
    const j = (await res.json()) as { success?: boolean; data?: PoolBindInfo };
    if (!j.success || !j.data) return null;
    const joinH = Number(j.data.join_height ?? 0);
    if (joinH <= 0 && (j.data.status ?? "") !== "left") return null;
    return j.data;
  } catch {
    return null;
  }
}

export async function fetchPoolMember(
  nodeBase: string,
  address: string,
): Promise<PoolMemberInfo | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const url = `${root(nodeBase)}pool/member/${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetchWithTimeout(url, {}, 6_000);
    const j = (await res.json()) as { success?: boolean; data?: PoolMemberInfo };
    if (!j.success || !j.data) return null;
    return j.data;
  } catch {
    return null;
  }
}

/** On-chain active pool membership (bind authoritative; member is fallback). */
export function isActivePoolMembership(
  bind: PoolBindInfo | null | undefined,
  member: PoolMemberInfo | null | undefined,
): boolean {
  if (bind && poolBindIsActive(bind)) return true;
  if (member?.status === "active" && (member.join_height ?? 0) > 0) return true;
  return false;
}

export function activePoolIdFromChain(
  bind: PoolBindInfo | null | undefined,
  member: PoolMemberInfo | null | undefined,
): number | null {
  if (!isActivePoolMembership(bind, member)) return null;
  const id = bind?.pool_id ?? member?.pool_id;
  return typeof id === "number" && id >= 0 && id < 5 ? id : null;
}

export function formatFinderBps(bps: number): string {
  if (bps <= 0) return "0%";
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
