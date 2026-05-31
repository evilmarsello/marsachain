-- Marsa official mining pools (v1) — run once: psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS official_pools (
  pool_id           SMALLINT PRIMARY KEY,
  name              TEXT NOT NULL,
  finder_bps        INT NOT NULL,
  treasury_address  TEXT NOT NULL,
  is_active         BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS pool_members (
  miner_address     TEXT PRIMARY KEY,
  pool_id           SMALLINT NOT NULL REFERENCES official_pools(pool_id),
  join_height       BIGINT NOT NULL,
  leave_height      BIGINT,
  count_at_join     BIGINT NOT NULL DEFAULT 0,
  finder_bps_snapshot INT NOT NULL,
  treasury_address_snapshot TEXT NOT NULL,
  status            TEXT NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pool_challenge_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  pool_id           SMALLINT NOT NULL,
  epoch_start       BIGINT NOT NULL,
  miner_address     TEXT NOT NULL,
  challenge_count   BIGINT NOT NULL,
  snapshot_at_height BIGINT NOT NULL,
  UNIQUE (pool_id, epoch_start, miner_address)
);

CREATE TABLE IF NOT EXISTS pool_block_wins (
  id                BIGSERIAL PRIMARY KEY,
  pool_id           SMALLINT NOT NULL,
  height            BIGINT NOT NULL UNIQUE,
  miner_address     TEXT NOT NULL,
  block_reward_wei  BIGINT NOT NULL,
  fees_wei          BIGINT DEFAULT 0,
  treasury_address  TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pool_settlements (
  id                BIGSERIAL PRIMARY KEY,
  pool_id           SMALLINT NOT NULL,
  epoch_start       BIGINT NOT NULL,
  epoch_end         BIGINT NOT NULL,
  total_inflow_wei  BIGINT NOT NULL,
  finder_paid_wei   BIGINT NOT NULL,
  distributed_wei   BIGINT NOT NULL,
  member_count      INT NOT NULL,
  settled_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pool_id, epoch_start)
);

CREATE TABLE IF NOT EXISTS pool_shares (
  id                BIGSERIAL PRIMARY KEY,
  pool_id           SMALLINT NOT NULL,
  epoch_start       BIGINT NOT NULL,
  miner_address     TEXT NOT NULL,
  amount_wei        BIGINT NOT NULL,
  finder_bonus_wei  BIGINT DEFAULT 0,
  UNIQUE (pool_id, epoch_start, miner_address)
);

CREATE TABLE IF NOT EXISTS pool_owed (
  miner_address     TEXT PRIMARY KEY,
  pool_id           SMALLINT NOT NULL,
  amount_wei        BIGINT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pool_withdrawals (
  id                BIGSERIAL PRIMARY KEY,
  miner_address     TEXT NOT NULL,
  pool_id           SMALLINT NOT NULL,
  amount_wei        BIGINT NOT NULL,
  withdraw_nonce    TEXT,
  status            TEXT NOT NULL,
  txid              TEXT,
  error             TEXT,
  requested_at        TIMESTAMPTZ DEFAULT now(),
  processed_at      TIMESTAMPTZ
);

ALTER TABLE pool_withdrawals ADD COLUMN IF NOT EXISTS withdraw_nonce TEXT;

CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON pool_withdrawals(status, requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_miner_nonce
  ON pool_withdrawals(miner_address, withdraw_nonce)
  WHERE withdraw_nonce IS NOT NULL;

CREATE TABLE IF NOT EXISTS pool_challenge_events (
  seq               BIGSERIAL PRIMARY KEY,
  pool_id           SMALLINT NOT NULL,
  miner_address     TEXT NOT NULL,
  height            BIGINT NOT NULL,
  delta_count       BIGINT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pool_challenge_events_pool_seq
  ON pool_challenge_events(pool_id, seq DESC);
CREATE INDEX IF NOT EXISTS idx_pool_challenge_events_pool_height
  ON pool_challenge_events(pool_id, height);

CREATE TABLE IF NOT EXISTS pool_member_index_state (
  miner_address        TEXT PRIMARY KEY,
  last_challenge_count BIGINT NOT NULL DEFAULT 0,
  last_seen_height     BIGINT NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pool_pplnc_rounds (
  id                BIGSERIAL PRIMARY KEY,
  pool_id           SMALLINT NOT NULL,
  height            BIGINT NOT NULL,
  finder_address    TEXT NOT NULL,
  block_reward_wei  BIGINT NOT NULL,
  inflow_wei        BIGINT NOT NULL,
  finder_paid_wei   BIGINT NOT NULL,
  distributed_wei   BIGINT NOT NULL,
  window_challenges BIGINT NOT NULL,
  total_weight      BIGINT NOT NULL,
  member_count      INT NOT NULL,
  window_incomplete BOOLEAN NOT NULL DEFAULT false,
  settled_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pool_id, height)
);

CREATE TABLE IF NOT EXISTS pool_pplnc_credits (
  id               BIGSERIAL PRIMARY KEY,
  round_id         BIGINT NOT NULL REFERENCES pool_pplnc_rounds(id),
  miner_address    TEXT NOT NULL,
  weight           BIGINT NOT NULL,
  amount_wei       BIGINT NOT NULL,
  finder_bonus_wei BIGINT NOT NULL DEFAULT 0,
  UNIQUE (round_id, miner_address)
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT now()
);
