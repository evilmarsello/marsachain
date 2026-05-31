import { mergeTxRowsForHistory, type TxRow } from "./txHistory";

const TX_CACHE_PREFIX = "tma_tx_cache_v4:";
const HISTORY_CACHE_PREFIX = "tma_hist_cache_v2:";
const BAL_CACHE_PREFIX = "tma_bal_cache_v2:";

/** Не чаще этого интервала ходим на ноду за балансом (кроме pull / send / import). */
export const BALANCE_STALE_MS = 90_000;

type TxCacheBlob = {
  ts: number;
  rows: TxRow[];
  scannedBlocks?: number;
  chainTip?: number;
  exhausted?: boolean;
};
type BalCacheBlob = { ts: number; balance: string; available?: string; address: string };

export type AddressTxCacheMeta = {
  rows: TxRow[];
  scannedBlocks: number;
  chainTip: number;
  exhausted: boolean;
};

function cacheKeyAddresses(addresses: string[]): string {
  return [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean))].sort().join(",");
}

export function readAddressTxCacheMeta(address: string): AddressTxCacheMeta | null {
  try {
    const k = `${TX_CACHE_PREFIX}${address.trim().toLowerCase()}`;
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const o = JSON.parse(raw) as TxCacheBlob;
    if (!o || !Array.isArray(o.rows)) return null;
    return {
      rows: o.rows,
      scannedBlocks: typeof o.scannedBlocks === "number" ? o.scannedBlocks : 0,
      chainTip: typeof o.chainTip === "number" ? o.chainTip : 0,
      exhausted: o.exhausted === true,
    };
  } catch {
    return null;
  }
}

export function writeAddressTxCacheMeta(address: string, meta: AddressTxCacheMeta): void {
  try {
    const k = `${TX_CACHE_PREFIX}${address.trim().toLowerCase()}`;
    const blob: TxCacheBlob = {
      ts: Date.now(),
      rows: meta.rows,
      scannedBlocks: meta.scannedBlocks,
      chainTip: meta.chainTip,
      exhausted: meta.exhausted,
    };
    localStorage.setItem(k, JSON.stringify(blob));
  } catch {
    /* ignore */
  }
}

export function readAddressTxCache(address: string): TxRow[] | null {
  return readAddressTxCacheMeta(address)?.rows ?? null;
}

export function hasAddressTxCache(address: string): boolean {
  return readAddressTxCacheMeta(address) != null;
}

export function readAddressTxCacheUpdatedAt(address: string): number {
  try {
    const k = `${TX_CACHE_PREFIX}${address.trim().toLowerCase()}`;
    const raw = localStorage.getItem(k);
    if (!raw) return 0;
    const o = JSON.parse(raw) as TxCacheBlob;
    return typeof o.ts === "number" ? o.ts : 0;
  } catch {
    return 0;
  }
}

export function clearAddressTxCache(address: string): void {
  try {
    localStorage.removeItem(`${TX_CACHE_PREFIX}${address.trim().toLowerCase()}`);
  } catch {
    /* ignore */
  }
}

export function readHistoryTxCache(addresses: string[]): TxRow[] | null {
  try {
    const key = cacheKeyAddresses(addresses);
    if (!key) return null;
    const raw = localStorage.getItem(`${HISTORY_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const o = JSON.parse(raw) as TxCacheBlob;
    if (!o || !Array.isArray(o.rows)) return null;
    return o.rows;
  } catch {
    return null;
  }
}

export function writeHistoryTxCache(addresses: string[], rows: TxRow[]): void {
  try {
    const key = cacheKeyAddresses(addresses);
    if (!key) return;
    const blob: TxCacheBlob = { ts: Date.now(), rows };
    localStorage.setItem(`${HISTORY_CACHE_PREFIX}${key}`, JSON.stringify(blob));
  } catch {
    /* ignore */
  }
}

export function writeTxCachesForAddresses(addressRows: Map<string, TxRow[]>, merged: TxRow[]): void {
  for (const [addr, rows] of addressRows) {
    const prev = readAddressTxCacheMeta(addr);
    writeAddressTxCacheMeta(addr, {
      rows,
      scannedBlocks: prev?.scannedBlocks ?? 0,
      chainTip: prev?.chainTip ?? 0,
      exhausted: prev?.exhausted ?? false,
    });
  }
  writeHistoryTxCache([...addressRows.keys()], merged);
}

export function mergeCachedHistory(addresses: string[]): TxRow[] | null {
  const direct = readHistoryTxCache(addresses);
  if (direct && direct.length > 0) return direct;
  const batches: TxRow[][] = [];
  for (const a of addresses) {
    const rows = readAddressTxCache(a);
    if (rows && rows.length > 0) batches.push(rows);
  }
  if (batches.length === 0) return null;
  return mergeTxRowsForHistory(batches);
}

export function readBalanceCache(address: string): BalCacheBlob | null {
  try {
    const raw = localStorage.getItem(`${BAL_CACHE_PREFIX}${address.trim().toLowerCase()}`);
    if (!raw) return null;
    const o = JSON.parse(raw) as BalCacheBlob;
    if (!o || typeof o.balance !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

export function isBalanceCacheStale(
  address: string,
  maxAgeMs: number = BALANCE_STALE_MS,
): boolean {
  const c = readBalanceCache(address);
  if (!c) return true;
  return Date.now() - c.ts > maxAgeMs;
}

export function writeBalanceCache(address: string, balance: string, available?: string): void {
  try {
    const blob: BalCacheBlob = {
      ts: Date.now(),
      balance,
      available,
      address: address.trim(),
    };
    localStorage.setItem(`${BAL_CACHE_PREFIX}${address.trim().toLowerCase()}`, JSON.stringify(blob));
  } catch {
    /* ignore */
  }
}

export function clearBalanceCache(address: string): void {
  try {
    localStorage.removeItem(`${BAL_CACHE_PREFIX}${address.trim().toLowerCase()}`);
  } catch {
    /* ignore */
  }
}

export function clearBalanceCaches(addresses: string[]): void {
  for (const addr of addresses) clearBalanceCache(addr);
}
