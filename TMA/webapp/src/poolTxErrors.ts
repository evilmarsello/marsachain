import { t } from "./i18n";
import { localizedPoolName } from "./poolI18n";

/** Map fullnode transaction/submit errors to user-facing pool messages. */
export function formatNodeTxError(error?: string, reason?: string): string {
  const combined = `${error ?? ""} ${reason ?? ""}`.trim();
  const low = combined.toLowerCase();
  const tr = t();

  if (low.includes("already in an official pool") || low.includes("already in pool")) {
    return tr.poolStakeAlreadyInPool;
  }
  if (low.includes("active miner_stake") || low.includes("unstake before joining pool")) {
    return tr.poolStakeSoloBlocksJoin;
  }
  if (low.includes("active_pool_bind")) {
    return tr.poolStakeUseLeaveFirst;
  }
  if (reason?.trim()) return reason.trim();
  if (error?.trim()) return error.trim();
  return tr.alertTxSubmitFailed;
}

export function poolAlreadyInPoolMessage(poolId: number, poolName?: string): string {
  const name = localizedPoolName(poolId, poolName ?? `Pool ${poolId + 1}`);
  return t().poolAlreadyMemberInPool(name);
}
