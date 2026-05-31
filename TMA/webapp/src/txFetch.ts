import {
  mergeTxRowsDeduped,
  mergeTxRowsForHistory,
  type TxRow,
} from "./txHistory";
import {
  fetchWalletTxInitial,
  refreshWalletTxFromNetwork,
  setAddrTxIndexReady,
  setTxScanChainHeight,
} from "./walletTxLoad";
import { readAddressTxCacheMeta, writeTxCachesForAddresses } from "./txCache";

export { setAddrTxIndexReady, setTxScanChainHeight };

/** History page: load cached data or initial batch per wallet (pull = refresh). */
export async function fetchMergedHistory(
  nodeBase: string,
  addresses: string[],
  forceRefresh = false,
): Promise<TxRow[]> {
  const uniq = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  if (uniq.length === 0) return [];

  const byAddr = new Map<string, TxRow[]>();
  await Promise.all(
    uniq.map(async (addr) => {
      const meta = readAddressTxCacheMeta(addr);
      let rows: TxRow[];
      if (forceRefresh) {
        rows = await refreshWalletTxFromNetwork(nodeBase, addr);
      } else if (!meta || meta.rows.length === 0) {
        rows = await fetchWalletTxInitial(nodeBase, addr);
      } else {
        rows = meta.rows;
      }
      byAddr.set(addr, rows);
    }),
  );

  const mergedFromCombined = mergeTxRowsForHistory([...byAddr.values()]);
  writeTxCachesForAddresses(byAddr, mergedFromCombined);
  return mergedFromCombined;
}
