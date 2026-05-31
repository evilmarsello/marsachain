import {
  activePoolIdFromChain,
  fetchPoolBind,
  fetchPoolMember,
  isActivePoolMembership,
  poolBindIsActive,
  type PoolBindInfo,
  type PoolMemberInfo,
} from "./poolApi";
import {
  miningInfoHasActiveStake,
  miningInfoIsPoolStake,
  type MiningInfoPayload,
} from "./miningInfoHelpers";

const poolBindByAddr = new Map<string, PoolBindInfo | null>();
const poolMemberByAddr = new Map<string, PoolMemberInfo | null>();

export type PoolMembership = {
  bind: PoolBindInfo | null;
  member: PoolMemberInfo | null;
  active: boolean;
  poolId: number | null;
};

export function clearPoolBindCache(): void {
  poolBindByAddr.clear();
  poolMemberByAddr.clear();
}

/** Clear cached membership + UI snapshots after leaving a pool. */
export function resetPoolWalletAfterLeave(address: string): void {
  const key = address.trim();
  if (key) {
    poolBindByAddr.delete(key);
    poolMemberByAddr.delete(key);
  } else {
    clearPoolBindCache();
  }
}

export async function refreshPoolMembershipForAddress(
  nodeBase: string,
  address: string,
): Promise<PoolMembership> {
  const key = address.trim();
  if (!key) {
    return { bind: null, member: null, active: false, poolId: null };
  }
  const [bind, member] = await Promise.all([
    fetchPoolBind(nodeBase, key),
    fetchPoolMember(nodeBase, key),
  ]);
  poolBindByAddr.set(key, bind);
  poolMemberByAddr.set(key, member);
  const poolId = activePoolIdFromChain(bind, member);
  return {
    bind,
    member,
    active: poolId != null,
    poolId,
  };
}

/** @deprecated use refreshPoolMembershipForAddress */
export async function refreshPoolBindForAddress(
  nodeBase: string,
  address: string,
): Promise<PoolBindInfo | null> {
  const m = await refreshPoolMembershipForAddress(nodeBase, address);
  return m.bind;
}

export function getCachedPoolBind(address: string): PoolBindInfo | null | undefined {
  return poolBindByAddr.get(address.trim());
}

export function getCachedPoolMember(address: string): PoolMemberInfo | null | undefined {
  return poolMemberByAddr.get(address.trim());
}

export function hasActivePoolBind(bind: PoolBindInfo | null | undefined): boolean {
  return poolBindIsActive(bind);
}

export function resolvePoolMembership(
  bind: PoolBindInfo | null | undefined,
  member: PoolMemberInfo | null | undefined,
  fallbackPoolId?: number | null,
): PoolMembership {
  const poolId = activePoolIdFromChain(bind, member) ?? fallbackPoolId ?? null;
  return {
    bind: bind ?? null,
    member: member ?? null,
    active: poolId != null,
    poolId,
  };
}

/** Active solo MINER_STAKE blocks pool mode (not pool member). */
const EMPTY_POOL_MEMBERSHIP: PoolMembership = {
  bind: null,
  member: null,
  active: false,
  poolId: null,
};

export function normalizePoolMembership(m?: PoolMembership | null): PoolMembership {
  return m ?? EMPTY_POOL_MEMBERSHIP;
}

export function hasSoloMinerStakeOnly(
  miningInfo: MiningInfoPayload | null | undefined,
  membership: PoolMembership | null | undefined,
  poolStakePending: boolean,
): boolean {
  const m = normalizePoolMembership(membership);
  if (poolStakePending) return false;
  if (!miningInfoHasActiveStake(miningInfo)) return false;
  if (miningInfoIsPoolStake(miningInfo)) return false;
  if (m.active) return false;
  return true;
}

/** Pool stake in mining_info but no on-chain membership yet. */
export function hasOrphanPoolStake(
  miningInfo: MiningInfoPayload | null | undefined,
  membership: PoolMembership | null | undefined,
  poolStakePending: boolean,
): boolean {
  const m = normalizePoolMembership(membership);
  if (poolStakePending) return false;
  if (!miningInfoHasActiveStake(miningInfo)) return false;
  if (m.active) return false;
  return miningInfoIsPoolStake(miningInfo);
}

export function canMineInPoolMode(
  miningInfo: MiningInfoPayload | null | undefined,
  membership: PoolMembership | null | undefined,
): boolean {
  const m = normalizePoolMembership(membership);
  if (!m.active) return false;
  if (!miningInfoHasActiveStake(miningInfo)) return false;
  const credits = Number(miningInfo?.available_credits ?? 0);
  return credits > 0;
}

export function canMineInSoloMode(
  miningInfo: MiningInfoPayload | null | undefined,
  membership: PoolMembership | null | undefined,
): boolean {
  const m = normalizePoolMembership(membership);
  if (m.active) return false;
  if (miningInfoIsPoolStake(miningInfo)) return false;
  if (!miningInfoHasActiveStake(miningInfo)) return false;
  const credits = Number(miningInfo?.available_credits ?? 0);
  return credits > 0;
}

export function isOnChainPoolMember(membership: PoolMembership | null | undefined): boolean {
  const m = normalizePoolMembership(membership);
  return m.active || isActivePoolMembership(m.bind, m.member);
}
