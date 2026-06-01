/** Pool share of block reward — 90%, same as solo MINER_STAKE (10% to validators). Block fees go to validators, not treasury. */
export const POOL_MINER_REWARD_NUM = 9n;
export const POOL_MINER_REWARD_DEN = 10n;

export function minerPoolInflowWei(blockRewardWei) {
  const br = BigInt(blockRewardWei ?? 0);
  return (br * POOL_MINER_REWARD_NUM) / POOL_MINER_REWARD_DEN;
}

/** SQL fragment: net block reward credited to pool treasury per win row. */
export const SQL_TREASURY_INFLOW = "(block_reward_wei * 9 / 10)";
