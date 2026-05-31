import { loadWalletRows } from "./walletStore";
import {
  isBalanceCacheStale,
  readBalanceCache,
  readAddressTxCache,
  hasAddressTxCache,
  writeBalanceCache,
} from "./txCache";

const WEI_PER_COIN = 100_000_000n;

/** Short mask for narrow delete-wallet dialog. */
export const PRIVATE_KEY_MASKED = "••••••••••";

/** Mask length matches secret so wide PK dialog looks filled before reveal. */
export function privateKeyMaskedText(secretLength = 44): string {
  const len = Math.max(10, Math.min(secretLength, 128));
  return "•".repeat(len);
}

export function parseMrsToBigIntNanos(mrs: string): bigint {
  const normalized = mrs.trim().replace(/,/g, ".");
  if (!normalized) return 0n;
  const [wholeRaw, fracRaw = ""] = normalized.split(".");
  const whole = wholeRaw?.replace(/[^\d]/g, "") || "0";
  const frac = (fracRaw.replace(/[^\d]/g, "") + "00000000").slice(0, 8);
  try {
    return BigInt(whole) * WEI_PER_COIN + BigInt(frac || "0");
  } catch {
    return 0n;
  }
}

/** Format MRS with at most `maxFracDigits` fractional digits (rounded). */
export function formatMrsFromBigIntNanos(nanos: bigint, maxFracDigits = 2): string {
  if (nanos <= 0n) return "0";
  let whole = nanos / WEI_PER_COIN;
  const frac = nanos % WEI_PER_COIN;
  if (frac === 0n || maxFracDigits <= 0) {
    if (maxFracDigits <= 0 && frac >= WEI_PER_COIN / 2n) whole += 1n;
    return whole.toString();
  }
  const scale = 8 - maxFracDigits;
  const roundUnit = 10n ** BigInt(scale);
  const rounded = (frac + roundUnit / 2n) / roundUnit;
  const maxFrac = 10n ** BigInt(maxFracDigits);
  let fracOut = rounded;
  if (fracOut >= maxFrac) {
    whole += 1n;
    fracOut = 0n;
  }
  if (fracOut === 0n) return whole.toString();
  return `${whole}.${fracOut.toString().padStart(maxFracDigits, "0")}`;
}

export function sumMrsBalances(balances: string[]): string {
  let total = 0n;
  for (const b of balances) total += parseMrsToBigIntNanos(b);
  return formatMrsFromBigIntNanos(total);
}

export function allWalletAddresses(): string[] {
  return [...new Set(loadWalletRows().map((w) => w.address.trim()).filter(Boolean))];
}

/**
 * Sum cached per-wallet balances.
 * With allowPartial, missing entries count as 0 (keeps total stable when a new wallet has no cache yet).
 */
export function totalBalanceFromCaches(addresses: string[], allowPartial = false): string | null {
  if (addresses.length === 0) return null;
  const parts: string[] = [];
  for (const addr of addresses) {
    const c = readBalanceCache(addr);
    if (!c) {
      if (!allowPartial) return null;
      parts.push("0");
    } else {
      parts.push(c.balance);
    }
  }
  return sumMrsBalances(parts);
}

function parseWalletBalanceResponse(json: string, address: string): string | null {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (o.ok === true && typeof o.balance === "string") {
      const balance = String(o.balance);
      const available = typeof o.available_balance === "string" ? o.available_balance : undefined;
      writeBalanceCache(address, balance, available);
      return balance;
    }
    const d = o.data;
    if ((o.success === true || o.ok === true) && d && typeof d === "object") {
      const raw = d as Record<string, unknown>;
      const balance = typeof raw.balance === "string" ? raw.balance : null;
      if (!balance) return null;
      const available =
        typeof raw.available_balance === "string" ? raw.available_balance : undefined;
      writeBalanceCache(address, balance, available);
      return balance;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchWalletBalanceDirect(
  nodeBase: string,
  address: string,
): Promise<string | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const root = nodeBase.trim().endsWith("/") ? nodeBase.trim() : `${nodeBase.trim()}/`;
  const url = `${root}wallet/balance?address=${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return parseWalletBalanceResponse(await res.text(), trimmed);
  } catch {
    return null;
  }
}

export async function fetchWalletBalanceMrs(
  nodeBase: string,
  address: string,
): Promise<string | null> {
  const bridge = window.__TMA_SHARED__;
  if (bridge?.fetchWalletBalanceJson) {
    try {
      const json = await bridge.fetchWalletBalanceJson(nodeBase, address);
      const balance = parseWalletBalanceResponse(json, address);
      if (balance) return balance;
    } catch {
      /* try direct fetch */
    }
  }
  return fetchWalletBalanceDirect(nodeBase, address);
}

/**
 * Total balance across all wallets — mirrors Android `WalletManager.getTotalBalance()`.
 */
export async function fetchTotalBalanceAllWallets(
  nodeBase: string,
  opts?: { forceNetwork?: boolean },
): Promise<{ ok: true; balance: string } | { ok: false }> {
  const addresses = allWalletAddresses();
  if (addresses.length === 0) return { ok: false };

  const force = opts?.forceNetwork === true;
  const balances: string[] = [];
  const needFetch: string[] = [];

  for (const addr of addresses) {
    const cached = readBalanceCache(addr);
    if (!force && cached && !isBalanceCacheStale(addr)) {
      balances.push(cached.balance);
    } else {
      needFetch.push(addr);
    }
  }

  if (needFetch.length > 0) {
    const fetched = await Promise.all(needFetch.map((a) => fetchWalletBalanceMrs(nodeBase, a)));
    for (const b of fetched) {
      if (b == null) return { ok: false };
      balances.push(b);
    }
  }

  if (balances.length !== addresses.length) return { ok: false };
  return { ok: true, balance: sumMrsBalances(balances) };
}
