/** Device-local mining counters — same keys as Android SharedPreferences `mining_stats`. */
const LS_KEY = "mining_stats";

export type LocalMiningStats = {
  blocksMined: number;
  totalRewardsNanos: number;
};

export function readLocalMiningStats(): LocalMiningStats {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { blocksMined: 0, totalRewardsNanos: 0 };
    const o = JSON.parse(raw) as { blocks_mined?: number; total_rewards?: number };
    return {
      blocksMined: typeof o.blocks_mined === "number" ? o.blocks_mined : 0,
      totalRewardsNanos: typeof o.total_rewards === "number" ? o.total_rewards : 0,
    };
  } catch {
    return { blocksMined: 0, totalRewardsNanos: 0 };
  }
}

export function writeLocalMiningStats(stats: LocalMiningStats): void {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        blocks_mined: stats.blocksMined,
        total_rewards: stats.totalRewardsNanos,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function resetLocalMiningStats(): void {
  writeLocalMiningStats({ blocksMined: 0, totalRewardsNanos: 0 });
}

/** Called when a block is accepted — mirrors MiningFragment counters. */
export function recordMiningSuccess(rewardNanos: number): LocalMiningStats {
  const cur = readLocalMiningStats();
  const next: LocalMiningStats = {
    blocksMined: cur.blocksMined + 1,
    totalRewardsNanos: cur.totalRewardsNanos + rewardNanos,
  };
  writeLocalMiningStats(next);
  return next;
}
