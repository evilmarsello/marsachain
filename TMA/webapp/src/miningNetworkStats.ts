/** Network stats derived from compact bits + active miners (tap-mining model). */

const INITIAL_TARGET_COMPACT = 0x207fffff;
const INITIAL_DISPLAY_VALUE = 2;
const TARGET_BLOCK_TIME_SEC = 15;

function compactToTarget(compact: number): number {
  const c = compact >>> 0;
  const nSize = (c >>> 24) & 0xff;
  const mantissa = c & 0x007fffff;
  if (nSize <= 3) {
    return mantissa / Math.pow(2, 8 * (3 - nSize));
  }
  return mantissa * Math.pow(2, 8 * (nSize - 3));
}

/** UI difficulty («2», «×40.00», …) — mirrors Android `DifficultyDisplay.formatCompactBits`. */
export function displayDifficultyFromCompactBits(compact: number): number {
  const target = compactToTarget(compact >>> 0);
  const initialTarget = compactToTarget(INITIAL_TARGET_COMPACT);
  if (!(target > 0) || !(initialTarget > 0)) return INITIAL_DISPLAY_VALUE;
  return INITIAL_DISPLAY_VALUE * (initialTarget / target);
}

export function networkStatsFromBits(
  bits: number | undefined,
  activeMiners: number,
): { averageHashrate: number; blocksPerHour: number } {
  const displayDifficulty = displayDifficultyFromCompactBits((bits ?? INITIAL_TARGET_COMPACT) >>> 0);
  const miners = Math.max(0, Math.floor(activeMiners));
  if (displayDifficulty <= 0 || miners === 0) {
    return { averageHashrate: 0, blocksPerHour: 0 };
  }
  /**
   * Baseline: each active miner ≈ 1 hash/sec on average.
   * Block rate λ (blocks/s) ≈ miners / difficulty → blocks/h ≈ miners × 3600 / difficulty.
   */
  const blocksPerHour = Math.round((miners * 3600) / displayDifficulty);
  /** Hashrate from block rate + difficulty: H = λ × D = blocksPerHour × D / 3600. */
  const averageHashrate = (blocksPerHour * displayDifficulty) / 3600;
  return { averageHashrate, blocksPerHour };
}

export { TARGET_BLOCK_TIME_SEC };
