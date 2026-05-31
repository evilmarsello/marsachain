const LS_MINING_MODE = "tma_mining_mode_v1";
const LS_POOL_STAKE_PENDING = "tma_pool_stake_pending_addr_v1";

function chosenPoolKey(address: string): string {
  return `tma_pool_chosen_${address.trim()}`;
}

export type MiningMode = "solo" | "pool";

export function getMiningMode(): MiningMode {
  try {
    const v = localStorage.getItem(LS_MINING_MODE);
    if (v === "pool") return "pool";
  } catch {
    /* ignore */
  }
  return "solo";
}

export function setMiningMode(mode: MiningMode): void {
  try {
    localStorage.setItem(LS_MINING_MODE, mode);
  } catch {
    /* ignore */
  }
}

/** Pool id chosen on Mining Pools page for this wallet (null = not chosen yet). */
export function getChosenPoolId(address: string): number | null {
  const key = address.trim();
  if (!key) return null;
  try {
    const v = localStorage.getItem(chosenPoolKey(key));
    if (v == null || v === "") return null;
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0 && n < 5) return n;
  } catch {
    /* ignore */
  }
  return null;
}

export function hasChosenPoolForStake(address: string): boolean {
  return getChosenPoolId(address) != null;
}

export function markPoolChosen(address: string, poolId: number): void {
  const key = address.trim();
  if (!key) return;
  try {
    localStorage.setItem(chosenPoolKey(key), String(Math.max(0, Math.min(4, poolId))));
  } catch {
    /* ignore */
  }
}

export function clearPoolChosen(address: string): void {
  const key = address.trim();
  if (!key) return;
  try {
    localStorage.removeItem(chosenPoolKey(key));
  } catch {
    /* ignore */
  }
}

export function setPoolStakePending(address: string): void {
  try {
    localStorage.setItem(LS_POOL_STAKE_PENDING, address.trim());
  } catch {
    /* ignore */
  }
}

export function clearPoolStakePending(): void {
  try {
    localStorage.removeItem(LS_POOL_STAKE_PENDING);
  } catch {
    /* ignore */
  }
}

export function isPoolStakePending(address: string): boolean {
  try {
    return localStorage.getItem(LS_POOL_STAKE_PENDING) === address.trim();
  } catch {
    return false;
  }
}
