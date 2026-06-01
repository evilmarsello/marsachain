import { TX_UI_PAGE_SIZE } from "./txListPaging";
import {
  filterWalletListRows,
  mergeTxRowsDeduped,
  parseTxRows,
  sortTxRowsNewestFirst,
  type TxRow,
} from "./txHistory";
import {
  readAddressTxCacheMeta,
  writeAddressTxCacheMeta,
  readBalanceCache,
  type AddressTxCacheMeta,
} from "./txCache";
import { parseMrsToBigIntNanos } from "./totalBalance";

/** Blocks scanned per network step when hunting for the next tx batch (legacy mode). */
const BLOCK_SCAN_STEP = 200;

/** Re-scan this many recent blocks on pull-to-refresh / incremental sync (legacy mode). */
const REFRESH_TIP_BLOCKS = 300;

/** Max rows per request when addr-tx index is ready on the node. */
const INDEX_ROW_STEP = 200;

let knownChainHeight = -1;
let knownAddrTxIndexReady: boolean | null = null;

export function setTxScanChainHeight(height: number): void {
  if (height > 0) knownChainHeight = Math.floor(height);
}

/** Sync with GET /status before first tx load (otherwise legacy block scan). */
export function setAddrTxIndexReady(ready: boolean | null): void {
  knownAddrTxIndexReady = ready;
}

function parseChainHeight(raw: unknown): number {
  if (raw == null) return -1;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw >= 0 ? Math.floor(raw) : -1;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : -1;
  }
  return -1;
}

function parseAddrTxIndexReady(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return null;
}

function indexModeActive(): boolean {
  return knownAddrTxIndexReady === true;
}

async function fetchChainHeight(nodeBase: string): Promise<number> {
  if (knownChainHeight > 0) return knownChainHeight;
  const bridge = window.__TMA_SHARED__;
  if (bridge?.fetchNodeInfoJson) {
    try {
      const nodeJson = JSON.parse(await bridge.fetchNodeInfoJson(nodeBase)) as {
        height?: unknown;
        addr_tx_index_ready?: unknown;
      };
      const height = parseChainHeight(nodeJson.height);
      const indexReady = parseAddrTxIndexReady(nodeJson.addr_tx_index_ready);
      if (indexReady != null) knownAddrTxIndexReady = indexReady;
      if (height > 0) {
        knownChainHeight = height;
        return height;
      }
    } catch {
      /* ignore */
    }
  }
  return knownChainHeight > 0 ? knownChainHeight : 5000;
}

async function fetchRaw(nodeBase: string, address: string, limit: number): Promise<TxRow[]> {
  const bridge = window.__TMA_SHARED__;
  if (!bridge?.fetchAddressTxJson || limit <= 0) return [];
  const json = await bridge.fetchAddressTxJson(nodeBase, address, 0, limit);
  return parseTxRows(json);
}

function coinTransfers(meta: AddressTxCacheMeta): TxRow[] {
  return filterWalletListRows(meta.rows);
}

function saveMeta(address: string, meta: AddressTxCacheMeta): void {
  writeAddressTxCacheMeta(address, meta);
}

/** In index mode `scannedBlocks` stores the last row-limit sent to the API. */
function indexLimitFromMeta(meta: AddressTxCacheMeta | null | undefined): number {
  const prev = meta?.scannedBlocks ?? 0;
  if (prev > 0 && prev <= 10_000) return prev;
  return INDEX_ROW_STEP;
}

function newestTxRank(rows: TxRow[]): number {
  if (rows.length === 0) return 0;
  const sorted = sortTxRowsNewestFirst(rows);
  const top = sorted[0]!;
  const bh = top.blockHeight || 0;
  return bh > 0 ? bh * 1_000_000 + (top.timestamp || 0) : top.timestamp || 0;
}

async function fetchIndexRows(
  nodeBase: string,
  address: string,
  limit: number,
): Promise<{ rows: TxRow[]; exhausted: boolean }> {
  const raw = await fetchRaw(nodeBase, address, limit);
  return { rows: mergeTxRowsDeduped([[], raw]), exhausted: raw.length < limit };
}

/** True when we should hit the node (empty cache, new blocks, or balance without txs). */
export function walletTxNeedsNetworkSync(address: string, chainHeight = knownChainHeight): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  const meta = readAddressTxCacheMeta(trimmed);
  if (!meta) return true;
  const transfers = coinTransfers(meta);
  if (transfers.length === 0) return shouldRefetchWalletTxCache(trimmed);
  if (chainHeight > 0 && chainHeight > meta.chainTip) return true;
  return shouldRefetchWalletTxCache(trimmed);
}

function needsNetworkTxUpdate(
  address: string,
  meta: AddressTxCacheMeta,
  chainHeight: number,
): boolean {
  return walletTxNeedsNetworkSync(address, chainHeight);
}

/** Merge only new tip rows into existing cache (switch wallet / background sync). */
async function syncWalletTxCacheIncremental(
  nodeBase: string,
  address: string,
  prev: AddressTxCacheMeta,
  height: number,
  onProgress?: (rows: TxRow[]) => void,
): Promise<TxRow[]> {
  const prevTransfers = coinTransfers(prev);

  if (indexModeActive()) {
    const limit = Math.max(indexLimitFromMeta(prev), INDEX_ROW_STEP);
    const { rows: fetched, exhausted } = await fetchIndexRows(nodeBase, address, limit);
    const merged = mergeTxRowsDeduped([prev.rows, fetched]);
    const transfers = filterWalletListRows(merged);
    if (
      transfers.length === prevTransfers.length &&
      newestTxRank(transfers) === newestTxRank(prevTransfers) &&
      exhausted === prev.exhausted
    ) {
      saveMeta(address, { ...prev, chainTip: height });
      return prevTransfers;
    }
    saveMeta(address, {
      rows: merged,
      scannedBlocks: limit,
      chainTip: height,
      exhausted,
    });
    onProgress?.(transfers);
    return transfers;
  }

  const tipScan = Math.min(height, REFRESH_TIP_BLOCKS);
  const raw = await fetchRaw(nodeBase, address, tipScan);
  const merged = mergeTxRowsDeduped([prev.rows, raw]);
  const transfers = filterWalletListRows(merged);
  if (transfers.length === prevTransfers.length && newestTxRank(transfers) === newestTxRank(prevTransfers)) {
    saveMeta(address, { ...prev, chainTip: height });
    return prevTransfers;
  }
  const scanned = Math.max(prev.scannedBlocks, tipScan);
  saveMeta(address, {
    rows: merged,
    scannedBlocks: scanned,
    chainTip: height,
    exhausted: prev.exhausted && scanned >= height,
  });
  onProgress?.(transfers);
  return transfers;
}

/** First visit with empty cache — scan until ≥10 coin transfers or chain exhausted. */
export async function fetchWalletTxInitial(
  nodeBase: string,
  address: string,
  onProgress?: (rows: TxRow[]) => void,
): Promise<TxRow[]> {
  const existing = readAddressTxCacheMeta(address);
  const height = await fetchChainHeight(nodeBase);
  const existingTransfers = existing ? coinTransfers(existing) : [];

  if (existing && existingTransfers.length > 0 && !needsNetworkTxUpdate(address, existing, height)) {
    return existingTransfers;
  }

  if (indexModeActive()) {
    let limit = indexLimitFromMeta(existing);
    while (true) {
      const { rows, exhausted } = await fetchIndexRows(nodeBase, address, limit);
      const transfers = filterWalletListRows(rows);
      if (transfers.length > 0) onProgress?.(transfers);
      saveMeta(address, {
        rows,
        scannedBlocks: limit,
        chainTip: height,
        exhausted,
      });
      if (exhausted || transfers.length >= TX_UI_PAGE_SIZE) return transfers;
      limit += INDEX_ROW_STEP;
    }
  }

  if (existing?.exhausted && existingTransfers.length > 0) {
    return existingTransfers;
  }

  let scanned = existing?.scannedBlocks ?? 0;
  let rows: TxRow[] = existing?.rows ?? [];
  let prevCount = existingTransfers.length;

  while (scanned < height) {
    scanned = Math.min(scanned + BLOCK_SCAN_STEP, height);
    const raw = await fetchRaw(nodeBase, address, scanned);
    rows = mergeTxRowsDeduped([rows, raw]);
    const transfers = filterWalletListRows(rows);
    if (transfers.length > prevCount) onProgress?.(transfers);
    if (transfers.length >= TX_UI_PAGE_SIZE) break;
    if (transfers.length === prevCount && scanned >= height) break;
    prevCount = transfers.length;
  }

  saveMeta(address, {
    rows,
    scannedBlocks: scanned,
    chainTip: height,
    exhausted: scanned >= height,
  });
  return filterWalletListRows(rows);
}

/** Pull-to-refresh — merge recent blocks + update chain tip marker. */
export async function refreshWalletTxFromNetwork(nodeBase: string, address: string): Promise<TxRow[]> {
  const height = await fetchChainHeight(nodeBase);
  const prev = readAddressTxCacheMeta(address);

  if (prev && coinTransfers(prev).length > 0) {
    return syncWalletTxCacheIncremental(nodeBase, address, prev, height);
  }

  return fetchWalletTxInitial(nodeBase, address);
}

export type WalletTxNextPageResult = {
  rows: TxRow[];
  added: number;
  hasMore: boolean;
};

/** Scroll to end — scan deeper until +10 coin transfers or chain exhausted. */
export async function fetchWalletTxNextPage(
  nodeBase: string,
  address: string,
): Promise<WalletTxNextPageResult> {
  const height = await fetchChainHeight(nodeBase);
  let meta = readAddressTxCacheMeta(address);
  if (!meta) {
    const rows = await fetchWalletTxInitial(nodeBase, address);
    return { rows, added: rows.length, hasMore: !readAddressTxCacheMeta(address)?.exhausted };
  }

  const before = coinTransfers(meta).length;

  if (indexModeActive()) {
    if (meta.exhausted) return { rows: coinTransfers(meta), added: 0, hasMore: false };

    let limit = Math.max(indexLimitFromMeta(meta) + INDEX_ROW_STEP, INDEX_ROW_STEP);
    let exhausted = false;
    let rows = meta.rows;
    let finalRows = coinTransfers(meta);

    while (!exhausted && finalRows.length < before + TX_UI_PAGE_SIZE) {
      const fetched = await fetchIndexRows(nodeBase, address, limit);
      exhausted = fetched.exhausted;
      rows = fetched.rows;
      finalRows = filterWalletListRows(rows);
      if (!exhausted && finalRows.length < before + TX_UI_PAGE_SIZE) {
        limit += INDEX_ROW_STEP;
      }
    }

    saveMeta(address, {
      rows,
      scannedBlocks: limit,
      chainTip: height,
      exhausted,
    });
    return {
      rows: finalRows,
      added: Math.max(0, finalRows.length - before),
      hasMore: !exhausted,
    };
  }

  if (meta.exhausted && meta.scannedBlocks >= height) {
    return { rows: coinTransfers(meta), added: 0, hasMore: false };
  }

  let scanned = meta.scannedBlocks;
  let rows = meta.rows;
  let transfers = coinTransfers(meta);

  while (transfers.length < before + TX_UI_PAGE_SIZE && scanned < height) {
    scanned = Math.min(scanned + BLOCK_SCAN_STEP, height);
    const raw = await fetchRaw(nodeBase, address, scanned);
    rows = mergeTxRowsDeduped([rows, raw]);
    transfers = filterWalletListRows(rows);
  }

  const exhausted = scanned >= height;
  saveMeta(address, { rows, scannedBlocks: scanned, chainTip: height, exhausted });
  const finalRows = filterWalletListRows(rows);
  return {
    rows: finalRows,
    added: Math.max(0, finalRows.length - before),
    hasMore: !exhausted || finalRows.length > before,
  };
}

/** Load transfers for wallet tab: cache first, network only when needed. */
export async function loadWalletTxForAddress(
  nodeBase: string,
  address: string,
  onProgress?: (rows: TxRow[]) => void,
): Promise<TxRow[]> {
  const trimmed = address.trim();
  if (!trimmed) return [];
  const meta = readAddressTxCacheMeta(trimmed);
  const transfers = meta ? coinTransfers(meta) : [];
  const height = await fetchChainHeight(nodeBase);

  if (meta && transfers.length > 0) {
    if (!needsNetworkTxUpdate(trimmed, meta, height)) {
      return transfers;
    }
    return syncWalletTxCacheIncremental(nodeBase, trimmed, meta, height, onProgress);
  }

  if (meta?.exhausted && transfers.length === 0) {
    const synced = await syncWalletTxCacheIncremental(nodeBase, trimmed, meta, height, onProgress);
    if (synced.length > 0) return synced;
  }

  return fetchWalletTxInitial(nodeBase, trimmed, onProgress);
}

/** Re-fetch when cache is empty but wallet has balance. */
export function shouldRefetchWalletTxCache(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  const meta = readAddressTxCacheMeta(trimmed);
  if (!meta) return true;
  const transfers = filterWalletListRows(meta.rows);
  const bal = readBalanceCache(trimmed);
  return transfers.length === 0 && bal != null && parseMrsToBigIntNanos(bal.balance) > 0n;
}

export function walletTxRowsFromCache(address: string): TxRow[] {
  const meta = readAddressTxCacheMeta(address);
  if (!meta) return [];
  return sortTxRowsNewestFirst(filterWalletListRows(meta.rows));
}

export function walletTxCacheHasMore(address: string): boolean {
  const meta = readAddressTxCacheMeta(address);
  if (!meta) return true;
  if (!meta.exhausted) return true;
  return false;
}
