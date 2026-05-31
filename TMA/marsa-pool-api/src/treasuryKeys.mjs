/**
 * Treasury signing material — read ONLY from process.env.POOL_TREASURY_KEYS.
 * Never loaded from repo files, HTTP, or database.
 */
export function parseTreasuryKeys() {
  const raw = process.env.POOL_TREASURY_KEYS || "";
  if (!raw.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
