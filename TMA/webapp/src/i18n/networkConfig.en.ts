import type { AboutSection } from "./about.en";

export const networkConfigSectionsEn: AboutSection[] = [
  {
    title: "Block halvings",
    paragraphs: [
      "Every 1,050,000 blocks the network applies a halving to the block reward and related economic parameters.",
      "Reduction schedule: 1st halving −50%, 2nd −40%, 3rd −30%, 4th −20%, 5th and later −10% each (minimum step).",
      "After each interval the reward is multiplied by the remaining share (for example, the first halving keeps 50% of the previous value).",
    ],
  },
  {
    title: "Block reward (current era)",
    paragraphs: [
      "Total reward per mined block: 10,000 MRS.",
      "9,000 MRS goes to the miner who produced the block; 1,000 MRS is shared equally among validators who voted for that block.",
    ],
  },
  {
    title: "Supply and block time",
    paragraphs: [
      "Maximum supply: 50 billion MRS.",
      "Average time to mine one block: about 12–15 seconds.",
    ],
  },
  {
    title: "Mining credits (hash cost)",
    paragraphs: [
      "The cost of one mining credit (one hash attempt) is currently 10 MRS.",
      "This value decreases with halvings using the same progressive schedule as the block reward.",
    ],
  },
  {
    title: "On-chain constants",
    paragraphs: [
      "MIN_MINER_STAKE_LOCK_BLOCKS = 10,000 — minimum blocks since MINER_STAKE creation before MINER_UNSTAKE is allowed.",
      "MIN_STAKE_DURATION = 250,000 — minimum staking period for network validators.",
      "REFILL_PERIOD = 100 — every 100 blocks from staking, unused credits expire and the credit budget is refilled to its full amount.",
    ],
  },
];
