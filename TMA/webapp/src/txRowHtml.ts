import { formatNanosAsMrs, shortenMrsAddress } from "./txFormat";
import { isStakeTxKind, normalizeTxKind, type TxDisplayKind, type TxRow } from "./txHistory";

export function formatTxTimestamp(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  const dt = new Date(ms);
  return Number.isFinite(dt.getTime()) ? dt.toLocaleString("en-US") : "—";
}

export type TxRowHtmlOpts = {
  escapeAttr: (s: string) => string;
  amountLabel: string;
  blockLabel: string;
  fromLabel: string;
  toLabel: string;
  miningLabel: string;
  hashLabel: string;
  kindLabel: (kind: TxDisplayKind) => string;
};

function txHashLine(txid: string, opts: TxRowHtmlOpts): string {
  const { escapeAttr, hashLabel } = opts;
  return (
    `<div class="wallet-tx-line wallet-tx-hash-line">` +
    `<span class="wallet-tx-hash-lab">${escapeAttr(hashLabel)}</span> ` +
    `<span class="wallet-tx-hash-val mono">${escapeAttr(txid)}</span>` +
    `</div>`
  );
}

function stakeTargetLine(r: TxRow, opts: TxRowHtmlOpts, kind: TxDisplayKind, outbound: boolean): string {
  const { escapeAttr, fromLabel, toLabel, miningLabel, kindLabel } = opts;
  const kindText = kindLabel(kind);
  const lab = "wallet-tx-dir-lab";
  const addrVal = "wallet-tx-addr-val wallet-tx-addr-val--accent";
  const target = "wallet-tx-stake-target";
  if (outbound) {
    const from = shortenMrsAddress(r.fromAddress, miningLabel);
    return (
      `<span class="${lab}">${escapeAttr(fromLabel)}</span> <span class="${addrVal}">${escapeAttr(from)}</span> ` +
      `<span class="${lab}">${escapeAttr(toLabel)}</span> <span class="${target}">${escapeAttr(kindText)}</span>`
    );
  }
  const to = shortenMrsAddress(r.toAddress, miningLabel);
  return (
    `<span class="${lab}">${escapeAttr(fromLabel)}</span> <span class="${target}">${escapeAttr(kindText)}</span> ` +
    `<span class="${lab}">${escapeAttr(toLabel)}</span> <span class="${addrVal}">${escapeAttr(to)}</span>`
  );
}

function txFromToLine(r: TxRow, opts: TxRowHtmlOpts, kind: TxDisplayKind): string {
  const { escapeAttr, fromLabel, toLabel, miningLabel } = opts;
  if (
    kind === "miner_stake" ||
    kind === "miner_pool_stake" ||
    kind === "stake"
  ) {
    return stakeTargetLine(r, opts, kind, true);
  }
  if (
    kind === "miner_unstake" ||
    kind === "miner_pool_unstake" ||
    kind === "unstake"
  ) {
    return stakeTargetLine(r, opts, kind, false);
  }
  const from = shortenMrsAddress(r.fromAddress, miningLabel);
  const to = shortenMrsAddress(r.toAddress, miningLabel);
  const lab = "wallet-tx-dir-lab";
  const val = "wallet-tx-addr-val wallet-tx-addr-val--accent";
  return (
    `<span class="${lab}">${escapeAttr(fromLabel)}</span> <span class="${val}">${escapeAttr(from)}</span> ` +
    `<span class="${lab}">${escapeAttr(toLabel)}</span> <span class="${val}">${escapeAttr(to)}</span>`
  );
}

export function txRowHtml(r: TxRow, opts: TxRowHtmlOpts): string {
  const { escapeAttr, amountLabel, blockLabel, kindLabel } = opts;
  const kind = normalizeTxKind(r);
  const bh = r.blockHeight > 0 ? String(r.blockHeight) : "mempool";
  const amt = formatNanosAsMrs(r.amount);
  const fee = formatNanosAsMrs(r.fee);
  const ds = formatTxTimestamp(r.timestamp);
  const kindText = kindLabel(kind);
  const txid = r.txid.trim() || "—";
  const fromTo = txFromToLine(r, opts, kind);
  const metaLine = isStakeTxKind(kind)
    ? `<div class="wallet-tx-meta">${escapeAttr(blockLabel)} ${escapeAttr(bh)} · ${escapeAttr(ds)}</div>`
    : `<div class="wallet-tx-meta"><span class="wallet-tx-kind wallet-tx-kind--${kind}">${escapeAttr(kindText)}</span> · ${escapeAttr(blockLabel)} ${escapeAttr(bh)} · ${escapeAttr(ds)}</div>`;
  const amountLine =
    kind === "mining" || kind === "validator_reward"
      ? `<div class="wallet-tx-meta">${escapeAttr(amountLabel)}: <span class="wallet-tx-amt">${escapeAttr(amt)}</span> MRS</div>`
      : `<div class="wallet-tx-meta">${escapeAttr(amountLabel)}: <span class="wallet-tx-amt">${escapeAttr(amt)}</span> MRS · fee <span class="wallet-tx-fee-val">${escapeAttr(fee)}</span> MRS</div>`;

  return (
    `<div class="wallet-tx-item wallet-tx-item--${kind}">` +
    `<div class="wallet-tx-addr">${fromTo}</div>` +
    metaLine +
    amountLine +
    txHashLine(txid, opts) +
    `</div>`
  );
}
