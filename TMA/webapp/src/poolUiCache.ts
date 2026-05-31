import type { PoolDashboardResponse } from "./poolBackendApi";
import type { PoolCatalogWithStats } from "./poolBackendApi";

export type PoolsListSnapshot = {
  walletKey: string;
  pools: PoolCatalogWithStats[];
  activePoolId: number | null;
  chosenId: number | null;
  challengeCount: number | null;
};

type PoolDetailCacheEntry = {
  walletKey: string;
  dash: PoolDashboardResponse;
};

let listSnapshot: PoolsListSnapshot | null = null;
const detailByKey = new Map<string, PoolDetailCacheEntry>();

export function poolsWalletKey(address: string): string {
  return address.trim().toLowerCase();
}

function detailCacheKey(poolId: number, walletKey: string): string {
  return `${poolId}:${walletKey}`;
}

export function getPoolsListSnapshot(): PoolsListSnapshot | null {
  return listSnapshot;
}

export function setPoolsListSnapshot(s: PoolsListSnapshot): void {
  listSnapshot = s;
}

export function getPoolDetailSnapshot(
  poolId: number,
  walletAddress: string,
): PoolDashboardResponse | null {
  const key = detailCacheKey(poolId, poolsWalletKey(walletAddress));
  const entry = detailByKey.get(key);
  return entry?.dash ?? null;
}

export function setPoolDetailSnapshot(
  poolId: number,
  walletAddress: string,
  dash: PoolDashboardResponse,
): void {
  const walletKey = poolsWalletKey(walletAddress);
  detailByKey.set(detailCacheKey(poolId, walletKey), { walletKey, dash });
}

export function clearPoolUiCache(): void {
  listSnapshot = null;
  detailByKey.clear();
}

/** After MINER_POOL_UNSTAKE — drop stale on-chain pool id from list snapshot. */
export function clearPoolsListActiveMembership(walletAddress: string): void {
  if (!listSnapshot) return;
  const key = poolsWalletKey(walletAddress);
  if (listSnapshot.walletKey !== key) return;
  listSnapshot = {
    ...listSnapshot,
    activePoolId: null,
    challengeCount: null,
  };
}

export function clearPoolDetailCache(poolId?: number, walletAddress?: string): void {
  if (poolId == null) {
    detailByKey.clear();
    return;
  }
  if (walletAddress?.trim()) {
    detailByKey.delete(detailCacheKey(poolId, poolsWalletKey(walletAddress)));
    return;
  }
  const prefix = `${poolId}:`;
  for (const k of [...detailByKey.keys()]) {
    if (k.startsWith(prefix)) detailByKey.delete(k);
  }
}
