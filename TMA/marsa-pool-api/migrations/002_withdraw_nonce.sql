-- Run once on existing DB: psql $DATABASE_URL -f migrations/002_withdraw_nonce.sql
ALTER TABLE pool_withdrawals ADD COLUMN IF NOT EXISTS withdraw_nonce TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_miner_nonce
  ON pool_withdrawals(miner_address, withdraw_nonce)
  WHERE withdraw_nonce IS NOT NULL;
