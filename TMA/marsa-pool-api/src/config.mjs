export const POOL_EPOCH_BLOCKS = 10_000;
export const FINALITY_BLOCKS = Number(process.env.POOL_FINALITY_BLOCKS ?? 8);
export const REORG_SAFE_DEPTH = 32;
export const POOL_REWARD_MODE = process.env.POOL_REWARD_MODE ?? "pplnc";
export const WEI_PER_COIN = 100_000_000n;
/** Minimum net amount miner receives after network fee. */
export const POOL_MIN_WITHDRAW = 100n * WEI_PER_COIN;
/** Network fee (1 MRS) deducted from owed — paid by withdrawer, not treasury subsidy. */
export const POOL_WITHDRAW_FEE = 1n * WEI_PER_COIN;
/** Gross owed required to withdraw: min net + fee. */
export const POOL_MIN_WITHDRAW_GROSS = POOL_MIN_WITHDRAW + POOL_WITHDRAW_FEE;
export const PPLNC_TARGET_WINDOW_SECONDS = Number(process.env.PPLNC_TARGET_WINDOW_SECONDS ?? 3600);
export const PPLNC_N_MIN = Number(process.env.PPLNC_N_MIN ?? 10_000);
export const PPLNC_RECALC_INTERVAL_SECONDS = Number(process.env.PPLNC_RECALC_INTERVAL_SECONDS ?? 300);
export const PPLNC_RATE_EMA_ALPHA = Number(process.env.PPLNC_RATE_EMA_ALPHA ?? 0.2);
export const POOL_MIN_CREDITS_FOR_WITHDRAW = 500;
/** Min challenge_count since pool join before share estimate / epoch weight (see poolShare.mjs). */
export const POOL_MIN_CREDITS_FOR_SHARE = 1_000;
export const MINER_POOL_MIN_LOCK_BLOCKS = 10_000;
export const MINER_POOL_UNSTAKE_FEE = 100_000_000n;
export const INDEXER_INTERVAL_MS = 8_000;
export const SETTLEMENT_CHECK_MS = 30_000;
export const WITHDRAW_BATCH_MS = 5_000;

export const OFFICIAL_POOLS = [
  { pool_id: 0, name: "Pool Equal", finder_bps: 0, treasury_address: "mrsdcd3ffa78ed42245aec2afee726790db3a4f97a7" },
  { pool_id: 1, name: "Pool 5%", finder_bps: 500, treasury_address: "mrs98d4833cbe07b63acf17f8cc8fae6221968cecd2" },
  { pool_id: 2, name: "Pool 10%", finder_bps: 1000, treasury_address: "mrs23f90cdbb2817a32670f72f7f2bd8e31e8e8fa05" },
  { pool_id: 3, name: "Pool 20%", finder_bps: 2000, treasury_address: "mrs7590e3842541b7fcb4d21fb4a48aa0187a3e78be" },
  { pool_id: 4, name: "Pool 50%", finder_bps: 5000, treasury_address: "mrsf07616955dcc45d84734226200b49215dcc48cfc" },
];

export function epochStartForHeight(height) {
  const h = Number(height);
  return Math.floor(h / POOL_EPOCH_BLOCKS) * POOL_EPOCH_BLOCKS;
}

export function epochEndForStart(epochStart) {
  return epochStart + POOL_EPOCH_BLOCKS - 1;
}
