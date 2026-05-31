export type TxRow = {
  txid: string;
  type: string;
  amount: number;
  fee: number;
  blockHeight: number;
  timestamp: number;
  fromAddress: string;
  toAddress: string;
};

export type TxHistoryFilter = "all" | "send" | "receive" | "mining" | "stakes";

export type TxDisplayKind =
  | "send"
  | "receive"
  | "mining"
  | "coinbase"
  | "stake"
  | "unstake"
  | "miner_stake"
  | "miner_unstake"
  | "miner_pool_stake"
  | "miner_pool_unstake"
  | "validator_reward";

export function parseTxRows(json: string): TxRow[] {
  const arr = JSON.parse(json) as unknown;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      const o = x as Record<string, unknown>;
      if (typeof o.txid !== "string") return null;
      return {
        txid: o.txid,
        type: typeof o.type === "string" ? o.type : "",
        amount: typeof o.amount === "number" ? o.amount : Number(o.amount) || 0,
        fee: typeof o.fee === "number" ? o.fee : Number(o.fee) || 0,
        blockHeight:
          o.blockHeight == null ? 0 : typeof o.blockHeight === "number" ? o.blockHeight : Number(o.blockHeight) || 0,
        timestamp: typeof o.timestamp === "number" ? o.timestamp : Number(o.timestamp) || 0,
        fromAddress: typeof o.fromAddress === "string" ? o.fromAddress : "",
        toAddress: typeof o.toAddress === "string" ? o.toAddress : "",
      } satisfies TxRow;
    })
    .filter((x): x is TxRow => x != null);
}

/** Wallet home: transfers + stake ops only (no block mining rewards / validator pool payouts). */
export function isWalletTabTxKind(kind: TxDisplayKind): boolean {
  return kind === "send" || kind === "receive" || isStakeTxKind(kind);
}

/** Rows shown on wallet tab and used for tx cache paging. */
export function filterWalletListRows(rows: TxRow[]): TxRow[] {
  return rows.filter((r) => isWalletTabTxKind(normalizeTxKind(r)));
}

/** @deprecated use filterWalletListRows */
export function filterCoinTransferRows(rows: TxRow[]): TxRow[] {
  return filterWalletListRows(rows);
}

export function isStakeTxKind(kind: TxDisplayKind): boolean {
  return (
    kind === "stake" ||
    kind === "unstake" ||
    kind === "miner_stake" ||
    kind === "miner_unstake" ||
    kind === "miner_pool_stake" ||
    kind === "miner_pool_unstake"
  );
}

/** History page “All” filter — includes mining rewards and validator payouts. */
export function isHistoryAllTxKind(kind: TxDisplayKind): boolean {
  return isWalletTabTxKind(kind) || kind === "mining" || kind === "validator_reward";
}

export function normalizeTxKind(row: TxRow): TxDisplayKind {
  const t = (row.type || "").toLowerCase().replace(/-/g, "_");
  if (t === "mining" || row.fromAddress === "mining_reward" || row.txid.endsWith("_cb")) return "mining";
  if (t === "validator_reward") return "validator_reward";
  if (t === "stake") return "stake";
  if (t === "unstake") return "unstake";
  if (t === "coinbase") return "coinbase";
  if (t === "miner_stake" || t === "miner_stake_tx") return "miner_stake";
  if (t === "miner_unstake") return "miner_unstake";
  if (t === "miner_pool_stake" || t === "miner_stake_pool") return "miner_pool_stake";
  if (t === "miner_pool_unstake") return "miner_pool_unstake";
  if (t === "send") return "send";
  if (t === "receive") return "receive";
  return "receive";
}

export function sortTxRowsNewestFirst(rows: TxRow[]): TxRow[] {
  return [...rows].sort((a, b) => {
    const ta = a.timestamp > 1e12 ? a.timestamp : a.timestamp * 1000;
    const tb = b.timestamp > 1e12 ? b.timestamp : b.timestamp * 1000;
    if (tb !== ta) return tb - ta;
    return (b.blockHeight || 0) - (a.blockHeight || 0);
  });
}

export function filterTxByHistoryFilter(rows: TxRow[], filter: TxHistoryFilter): TxRow[] {
  if (filter === "all") {
    return rows.filter((r) => isHistoryAllTxKind(normalizeTxKind(r)));
  }
  if (filter === "stakes") {
    return rows.filter((r) => isStakeTxKind(normalizeTxKind(r)));
  }
  return rows.filter((r) => normalizeTxKind(r) === filter);
}

function txRowRank(r: TxRow): number {
  const bh = r.blockHeight || 0;
  return bh > 0 ? bh * 1_000_000 + (r.timestamp || 0) : r.timestamp || 0;
}

/** Single-address API rows: one entry per txid (mempool vs confirmed). */
export function mergeTxRowsDeduped(batches: TxRow[][]): TxRow[] {
  const byId = new Map<string, TxRow>();
  for (const batch of batches) {
    for (const r of batch) {
      const prev = byId.get(r.txid);
      if (!prev || txRowRank(r) >= txRowRank(prev)) byId.set(r.txid, r);
    }
  }
  return sortTxRowsNewestFirst([...byId.values()]);
}

/** Multi-wallet history: keep send on A and receive on B for the same txid. */
export function historyRowKey(r: TxRow): string {
  const k = normalizeTxKind(r);
  if (k === "send") return `${r.txid}:send:${r.fromAddress}`;
  if (k === "receive") return `${r.txid}:receive:${r.toAddress}`;
  return `${r.txid}:${k}:${r.toAddress}`;
}

export function mergeTxRowsForHistory(batches: TxRow[][]): TxRow[] {
  const byKey = new Map<string, TxRow>();
  for (const batch of batches) {
    for (const r of batch) {
      const key = historyRowKey(r);
      const prev = byKey.get(key);
      if (!prev || txRowRank(r) >= txRowRank(prev)) byKey.set(key, r);
    }
  }
  return sortTxRowsNewestFirst([...byKey.values()]);
}
