/** Format on-chain amounts (nanos / wei) as MRS for display. */
const WEI_PER_COIN = 100_000_000;

const TXID_DISPLAY_LEN = 40;
const ADDRESS_EDGE_LEN = 9;

export function formatTxidDisplay(txid: string, maxLen = TXID_DISPLAY_LEN): string {
  const id = txid.trim();
  if (!id) return "—";
  if (id.length <= maxLen) return id;
  return `${id.slice(0, maxLen)}…`;
}

export function shortenMrsAddress(addr: string, miningLabel = "Mining"): string {
  const a = addr.trim();
  if (!a) return "—";
  if (a === "mining_reward") return miningLabel;
  if (a.length <= ADDRESS_EDGE_LEN * 2 + 2) return a;
  return `${a.slice(0, ADDRESS_EDGE_LEN)}...${a.slice(-ADDRESS_EDGE_LEN)}`;
}

export function formatNanosAsMrs(nanos: number): string {
  if (!Number.isFinite(nanos)) return "0";
  const sign = nanos < 0 ? "-" : "";
  const abs = Math.abs(nanos);
  const whole = Math.floor(abs / WEI_PER_COIN);
  const frac = abs % WEI_PER_COIN;
  if (frac === 0) return `${sign}${whole}`;
  const fracStr = String(frac).padStart(8, "0").replace(/0+$/, "");
  return `${sign}${whole}.${fracStr}`;
}
