import { getConnectionMode, getManualHost, hostToBaseUrl } from "./nodeConnection";

function normalizeBase(raw: string, fallback: string): string {
  const trimmed = (raw || fallback).trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/** Read-only / wallet UI: balances, txs, chain status, send tx. */
export function resolveReadNodeBase(): string {
  if (getConnectionMode() === "manual") {
    const manual = getManualHost();
    if (manual) {
      const url = hostToBaseUrl(manual);
      if (url) return url;
    }
  }
  return normalizeBase(import.meta.env.VITE_READ_NODE_BASE as string | undefined, "/fullnode");
}

/** Mining PoW + stake: challenge/submit, mining_info, MINER_STAKE / MINER_UNSTAKE (mining VPS). */
export function resolveMiningNodeBase(): string {
  return normalizeBase(import.meta.env.VITE_MINING_NODE_BASE as string | undefined, "/mining");
}

/** Balances, txs, send — authoritative node (node 1). Node 2 read replica may lag on block bodies. */
export function resolveWalletNodeBase(): string {
  return resolveMiningNodeBase();
}

/** @deprecated use resolveReadNodeBase or resolveMiningNodeBase */
export function resolveNodeBase(): string {
  return resolveReadNodeBase();
}
