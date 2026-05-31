/** Mirrors Android `ChainEmission` for statistics emission label. */
const WEI_PER_COIN = 100_000_000;
const MAX_SUPPLY_COINS = 50_000_000_000;
const MAX_SUPPLY_NANOS = MAX_SUPPLY_COINS * WEI_PER_COIN;
const INITIAL_NANOS = 10_000 * WEI_PER_COIN;
const HALVING_INTERVAL = 1_050_000;

function reductionPercent(halvingNumber: number): number {
  if (halvingNumber === 1) return 0.5;
  if (halvingNumber === 2) return 0.4;
  if (halvingNumber === 3) return 0.3;
  if (halvingNumber === 4) return 0.2;
  return 0.1;
}

function rewardNanosForHalvingCount(halvingCount: number): number {
  if (halvingCount <= 0) return INITIAL_NANOS;
  let reward = INITIAL_NANOS;
  const minReward = INITIAL_NANOS / 10;
  for (let i = 1; i <= halvingCount; i++) {
    reward *= 1.0 - reductionPercent(i);
    if (reward < minReward) {
      reward = minReward;
      break;
    }
  }
  return Math.floor(reward);
}

function blockRewardFullNanos(height: number): number {
  if (height <= 0) return INITIAL_NANOS;
  const halvingCount = Math.floor((height - 1) / HALVING_INTERVAL);
  return rewardNanosForHalvingCount(halvingCount);
}

function totalEmittedNanos(upToHeightInclusive: number): number {
  if (upToHeightInclusive < 0) return 0;
  let total = blockRewardFullNanos(0);
  if (total >= MAX_SUPPLY_NANOS) return MAX_SUPPLY_NANOS;
  if (upToHeightInclusive === 0) return Math.min(total, MAX_SUPPLY_NANOS);

  let start = 1;
  const maxH = upToHeightInclusive;
  while (start <= maxH) {
    const hc = Math.floor((start - 1) / HALVING_INTERVAL);
    const endOfEra = Math.min(maxH, (hc + 1) * HALVING_INTERVAL);
    const r = rewardNanosForHalvingCount(hc);
    const count = endOfEra - start + 1;
    const add = Math.min(count * r, MAX_SUPPLY_NANOS - total);
    total += add;
    if (total >= MAX_SUPPLY_NANOS) return MAX_SUPPLY_NANOS;
    start = endOfEra + 1;
  }
  return Math.min(total, MAX_SUPPLY_NANOS);
}

function emittedWholeCoins(upToHeightInclusive: number): number {
  return Math.floor(totalEmittedNanos(upToHeightInclusive) / WEI_PER_COIN);
}

function abbrevWholeMrs(coins: number): string {
  if (coins <= 0) return "0";
  if (coins >= 1_000_000_000_000) return `${Math.floor(coins / 1_000_000_000_000)}T`;
  if (coins >= 1_000_000_000) return `${Math.floor(coins / 1_000_000_000)}B`;
  if (coins >= 1_000_000) return `${Math.floor(coins / 1_000_000)}M`;
  if (coins >= 1_000) return `${Math.floor(coins / 1_000)}K`;
  return String(coins);
}

export function emissionProgressLabel(upToHeightInclusive: number): string {
  const mined = emittedWholeCoins(upToHeightInclusive);
  return `${abbrevWholeMrs(mined)}/${abbrevWholeMrs(MAX_SUPPLY_COINS)}`;
}
