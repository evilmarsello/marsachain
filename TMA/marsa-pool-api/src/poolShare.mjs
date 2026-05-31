import { getPoolMember } from "./nodeRpc.mjs";

export const POOL_MIN_CREDITS_FOR_SHARE = 0;

/** challenge_count earned since fromHeight (inclusive). */
export async function creditDeltaSince(minerAddress, countAtJoin, fromHeight) {
  const now = await getPoolMember(minerAddress);
  if (!now) return 0;
  const cur = Number(now.challenge_count ?? countAtJoin);
  if (fromHeight <= 0) return Math.max(0, cur - Number(countAtJoin ?? 0));
  const snap = await getPoolMember(minerAddress, fromHeight > 0 ? fromHeight - 1 : 0);
  const start = Number(snap?.challenge_count ?? countAtJoin ?? 0);
  return Math.max(0, cur - start);
}

/** Total taps since pool join (count_at_join → now). */
export async function creditDeltaSinceJoin(minerAddress, countAtJoin) {
  return creditDeltaSince(minerAddress, countAtJoin, 0);
}

/**
 * Weights for proportional split: full taps since join (no minimum threshold).
 * Returns { weights: Map<address, number>, minJoinHeight, totalWeight }.
 */
export async function eligibleShareWeights(members) {
  const weights = new Map();
  let minJoinHeight = Number.POSITIVE_INFINITY;
  let totalWeight = 0;
  for (const m of members) {
    const joinH = Number(m.join_height ?? 0);
    const countAtJoin = Number(m.count_at_join ?? 0);
    const totalSinceJoin = await creditDeltaSinceJoin(m.miner_address, countAtJoin);
    if (totalSinceJoin <= 0) continue;
    weights.set(m.miner_address, totalSinceJoin);
    totalWeight += totalSinceJoin;
    if (joinH > 0 && joinH < minJoinHeight) minJoinHeight = joinH;
  }
  if (!Number.isFinite(minJoinHeight)) minJoinHeight = 0;
  return { weights, minJoinHeight, totalWeight };
}
