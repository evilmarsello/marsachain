import { sha256 } from "@noble/hashes/sha2.js";

const INITIAL_TARGET_COMPACT = 0x207fffffn;

export function sha256HexUtf8(text: string): string {
  const hash = sha256(new TextEncoder().encode(text));
  let hex = "";
  for (let i = 0; i < hash.length; i++) hex += hash[i]!.toString(16).padStart(2, "0");
  return hex;
}

export function compactToTarget(compact: bigint): bigint {
  const nSize = Number((compact >> 24n) & 0xffn);
  const nWord = compact & 0x7fffffn;
  if (nSize <= 3) return nWord >> BigInt(8 * (3 - nSize));
  return nWord << BigInt(8 * (nSize - 3));
}

/** Mirrors Android `DifficultyDisplay.hashMeetsTarget`. */
export function hashMeetsTarget(hashHex: string, compactBits: number): boolean {
  if (hashHex.length !== 64) return false;
  const target = compactToTarget(BigInt(compactBits >>> 0));
  if (target <= 0n) return false;
  const hashNum = BigInt(`0x${hashHex}`);
  return hashNum <= target;
}

const WEI_PER_COIN = 100_000_000;
const INITIAL_REWARD = Math.round(10000 * WEI_PER_COIN);
const HALVING_INTERVAL = 1_050_000;
const MIN_REWARD = Math.floor(INITIAL_REWARD / 10);

function reductionPercent(halvingNumber: number): number {
  if (halvingNumber === 1) return 0.5;
  if (halvingNumber === 2) return 0.4;
  if (halvingNumber === 3) return 0.3;
  if (halvingNumber === 4) return 0.2;
  return 0.1;
}

/** Mirrors Android `MiningFragment.calculateBlockReward` (miner gets 90%). */
export function calculateBlockRewardNanos(height: number): number {
  if (height === 0) return Math.floor(INITIAL_REWARD * 0.9);
  const halvingCount = Math.floor((height - 1) / HALVING_INTERVAL);
  if (halvingCount === 0) return Math.floor(INITIAL_REWARD * 0.9);
  let reward = INITIAL_REWARD;
  for (let i = 1; i <= halvingCount; i++) {
    reward *= 1 - reductionPercent(i);
    if (reward < MIN_REWARD) {
      reward = MIN_REWARD;
      break;
    }
  }
  return Math.floor(reward * 0.9);
}

export function formatMrsFromNanos(nanos: number): string {
  const coins = nanos / WEI_PER_COIN;
  if (coins >= 1000) return coins.toFixed(2);
  if (coins >= 1) return coins.toFixed(4).replace(/\.?0+$/, "");
  return coins.toFixed(8).replace(/\.?0+$/, "");
}
