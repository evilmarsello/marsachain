import { hdKeyPairAtIndex } from "./crypto/hdWallet";
import { clearCloudMirrorKeys, mirrorAllWalletKeys, mirrorLocalStorageKey } from "./cloudStorageMirror";

const LS_SEED = "tma_hd_seed_b64";
const LS_WALLETS = "tma_wallets_v1";
const LS_ACTIVE = "tma_wallet_active_addr";
const LS_ORDER = "tma_wallet_list_order";
const LS_DELETED = "tma_deleted_wallets_v1";

const DELETED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type DeletedWalletRow = {
  address: string;
  name: string;
  createdAt: number;
  deletedAt: number;
  kind: TmaWalletRow["kind"];
  hdIndex: number | null;
  privateKeyB64?: string;
};

export type TmaWalletRow = {
  id: string;
  /** `watch` = address only from older Mini App (no seed in localStorage). */
  kind: "hd" | "import" | "watch";
  hdIndex: number | null;
  address: string;
  name: string;
  /** Creation time for sort (ms). */
  createdAt?: number;
  /** Only for imported wallets (same as Android local DB). */
  privateKeyB64?: string;
};

function b64Encode(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
}

function b64Decode(s: string): Uint8Array | null {
  try {
    const bin = atob(s.trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function readSeedBytes(): Uint8Array | null {
  try {
    const s = localStorage.getItem(LS_SEED);
    if (!s) return null;
    return b64Decode(s);
  } catch {
    return null;
  }
}

/** Writes seed and verifies read with the same code as on load. */
function writeSeedBytesVerified(seed: Uint8Array): { ok: boolean; encoded?: string } {
  try {
    const enc = b64Encode(seed);
    localStorage.setItem(LS_SEED, enc);
    mirrorLocalStorageKey(LS_SEED);
    const back = readSeedBytes();
    if (!back || back.length !== seed.length) return { ok: false };
    for (let i = 0; i < seed.length; i++) if (back[i] !== seed[i]) return { ok: false };
    return { ok: true, encoded: enc };
  } catch {
    return { ok: false };
  }
}

export function clearWalletLocalState(): void {
  try {
    localStorage.removeItem(LS_SEED);
    localStorage.removeItem(LS_WALLETS);
    localStorage.removeItem(LS_ACTIVE);
    localStorage.removeItem(LS_ORDER);
    localStorage.removeItem(LS_DELETED);
  } catch {
    /* ignore */
  }
  void clearCloudMirrorKeys();
}

function loadDeletedWalletRows(): DeletedWalletRow[] {
  try {
    const raw = localStorage.getItem(LS_DELETED);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: DeletedWalletRow[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (typeof o.address !== "string" || !o.address.startsWith("mrs")) continue;
      out.push({
        address: o.address,
        name: typeof o.name === "string" ? o.name : "Wallet",
        createdAt: typeof o.createdAt === "number" ? o.createdAt : Date.now(),
        deletedAt: typeof o.deletedAt === "number" ? o.deletedAt : Date.now(),
        kind: o.kind === "hd" || o.kind === "import" || o.kind === "watch" ? o.kind : "import",
        hdIndex: typeof o.hdIndex === "number" ? o.hdIndex : null,
        privateKeyB64: typeof o.privateKeyB64 === "string" ? o.privateKeyB64 : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function saveDeletedWalletRows(rows: DeletedWalletRow[]): void {
  try {
    localStorage.setItem(LS_DELETED, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

export function purgeExpiredDeletedWallets(): void {
  const cutoff = Date.now() - DELETED_TTL_MS;
  const kept = loadDeletedWalletRows().filter((r) => r.deletedAt >= cutoff);
  saveDeletedWalletRows(kept);
}

export function loadDeletedWallets(): DeletedWalletRow[] {
  purgeExpiredDeletedWallets();
  return loadDeletedWalletRows().sort((a, b) => b.deletedAt - a.deletedAt);
}

export function moveWalletToTrash(row: TmaWalletRow, privateKeyB64: string | null): void {
  const deleted: DeletedWalletRow = {
    address: row.address,
    name: row.name,
    createdAt: row.createdAt ?? Date.now(),
    deletedAt: Date.now(),
    kind: row.kind,
    hdIndex: row.hdIndex,
    privateKeyB64: privateKeyB64 ?? row.privateKeyB64,
  };
  const list = loadDeletedWalletRows().filter((r) => r.address !== row.address);
  list.push(deleted);
  saveDeletedWalletRows(list);
}

export function permanentlyRemoveFromTrash(address: string): void {
  saveDeletedWalletRows(loadDeletedWalletRows().filter((r) => r.address !== address));
}

export function clearDeletedWalletsTrash(): void {
  saveDeletedWalletRows([]);
}

export function restoreWalletFromTrash(deleted: DeletedWalletRow): boolean {
  const rows = loadWalletRows();
  if (rows.some((r) => r.address === deleted.address)) return false;
  const row: TmaWalletRow = {
    id: deleted.kind === "hd" && deleted.hdIndex != null ? `hd-${deleted.hdIndex}` : `restored-${Date.now()}`,
    kind: deleted.kind,
    hdIndex: deleted.hdIndex,
    address: deleted.address,
    name: deleted.name,
    createdAt: deleted.createdAt,
    privateKeyB64: deleted.privateKeyB64,
  };
  rows.push(row);
  if (!saveWalletRows(rows)) return false;
  permanentlyRemoveFromTrash(deleted.address);
  return true;
}

function sanitizeWalletRow(raw: unknown, fallbackIndex: number, now: number): TmaWalletRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.address !== "string" || !o.address.startsWith("mrs") || o.address.length !== 43) return null;
  let kind: TmaWalletRow["kind"];
  if (o.kind === "hd" || o.kind === "import" || o.kind === "watch") {
    kind = o.kind;
  } else if (typeof o.privateKeyB64 === "string" && o.privateKeyB64.length > 0) {
    kind = "import";
  } else if (typeof o.hdIndex === "number" && Number.isFinite(o.hdIndex)) {
    kind = "hd";
  } else {
    kind = "watch";
  }
  const hdIndex =
    kind === "hd"
      ? typeof o.hdIndex === "number" && Number.isFinite(o.hdIndex)
        ? o.hdIndex
        : Number(o.hdIndex) || 0
      : null;
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Wallet";
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `row-${fallbackIndex}`;
  const createdAt =
    typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : now - fallbackIndex * 1000;
  const privateKeyB64 = typeof o.privateKeyB64 === "string" ? o.privateKeyB64 : undefined;
  return { id, kind, hdIndex, address: o.address, name, createdAt, privateKeyB64 };
}

export function loadWalletRows(): TmaWalletRow[] {
  try {
    const raw = localStorage.getItem(LS_WALLETS);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    const out: TmaWalletRow[] = [];
    for (let i = 0; i < arr.length; i++) {
      const row = sanitizeWalletRow(arr[i], i, now);
      if (row) out.push(row);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveWalletRows(rows: TmaWalletRow[]): boolean {
  try {
    const json = JSON.stringify(rows);
    localStorage.setItem(LS_WALLETS, json);
    mirrorLocalStorageKey(LS_WALLETS);
    return localStorage.getItem(LS_WALLETS) === json;
  } catch {
    return false;
  }
}

export function getActiveWalletRow(): TmaWalletRow | null {
  const active = getActiveAddress();
  if (!active) return null;
  return loadWalletRows().find((w) => w.address === active) ?? null;
}

export function getActiveAddress(): string | null {
  try {
    const a = localStorage.getItem(LS_ACTIVE)?.trim();
    return a || null;
  } catch {
    return null;
  }
}

export function setActiveAddress(address: string): void {
  try {
    localStorage.setItem(LS_ACTIVE, address.trim());
    mirrorLocalStorageKey(LS_ACTIVE);
  } catch {
    /* ignore */
  }
}

export function maxHdIndex(rows: TmaWalletRow[]): number {
  let max = -1;
  for (const r of rows) {
    if (r.kind === "hd" && r.hdIndex != null && r.hdIndex > max) max = r.hdIndex;
  }
  return max;
}

/**
 * Rebuilds stored wallets for this seed: always HD#0 ("Main Wallet") + any imported keys.
 * Drops other HD rows and watch-only rows (they are not valid for a new/changed seed).
 */
function rebuildWalletListForSeed(seed: Uint8Array): boolean {
  let kp0;
  try {
    kp0 = hdKeyPairAtIndex(seed, 0);
  } catch (e) {
    console.error("[tma] HD derive at index 0 failed", e);
    return false;
  }
  const sw = writeSeedBytesVerified(seed);
  if (!sw.ok || !sw.encoded) {
    console.error("[tma] verified write of HD seed to localStorage failed");
    return false;
  }
  const rows = loadWalletRows();
  const imports = rows.filter((r) => r.kind === "import" && r.address !== kp0.address);
  const main: TmaWalletRow = {
    id: "hd-0",
    kind: "hd",
    hdIndex: 0,
    address: kp0.address,
    name: "Main Wallet",
    createdAt: Date.now(),
  };
  const nextRows = [main, ...imports];
  if (!saveWalletRows(nextRows)) {
    console.error("[tma] verified write of wallet list to localStorage failed");
    return false;
  }
  try {
    localStorage.removeItem(LS_ORDER);
  } catch {
    /* ignore */
  }
  setActiveAddress(kp0.address);
  mirrorAllWalletKeys();
  return true;
}

/**
 * After onboarding / restore: persist seed and ensure HD#0 exists (same as Android "Main Wallet").
 * @returns false if HD derivation or persistence failed (caller must not mark onboarding complete).
 */
export function persistSeedAndInitHdZero(seed: Uint8Array): boolean {
  return rebuildWalletListForSeed(seed);
}

/** If seed is in localStorage but HD#0 is missing or address mismatches seed derivation — repair list. */
export function ensureHdWalletListFromStoredSeed(): void {
  try {
    const seed = readSeedBytes();
    if (!seed) return;
    let kp0;
    try {
      kp0 = hdKeyPairAtIndex(seed, 0);
    } catch {
      return;
    }
    const rows = loadWalletRows();
    const main = rows.find((r) => r.kind === "hd" && r.hdIndex === 0);
    if (main && main.address === kp0.address) return;
    if (!rebuildWalletListForSeed(seed)) console.warn("[tma] ensureHdWalletListFromStoredSeed: rebuild failed");
  } catch {
    /* never block app boot on wallet repair */
  }
}

const LS_LEGACY_ADDR = "tma_wallet_address";

/**
 * Legacy session: onboarding done, address saved, but seed and `tma_wallets_v1` were not written yet.
 * Add one watch wallet so My Wallets is not empty; HD / New Wallet after re-restoring seed.
 */
export function migrateWatchOnlyFromLegacyAddress(): void {
  if (readSeedBytes()) return;
  if (loadWalletRows().length > 0) return;
  try {
    const a = localStorage.getItem(LS_LEGACY_ADDR)?.trim();
    if (!a || !a.startsWith("mrs") || a.length !== 43) return;
    void saveWalletRows([
      {
        id: "watch-legacy",
        kind: "watch",
        hdIndex: null,
        address: a,
        name: "Saved address",
        createdAt: Date.now(),
      },
    ]);
    if (!getActiveAddress()) setActiveAddress(a);
  } catch {
    /* ignore */
  }
}

export function addHdWalletRow(seed: Uint8Array, index: number, name: string): TmaWalletRow {
  const kp = hdKeyPairAtIndex(seed, index);
  const row: TmaWalletRow = {
    id: `hd-${index}`,
    kind: "hd",
    hdIndex: index,
    address: kp.address,
    name,
    createdAt: Date.now(),
  };
  const rows = loadWalletRows();
  if (rows.some((r) => r.address === row.address)) throw new Error("HD wallet address collision");
  rows.push(row);
  if (!saveWalletRows(rows)) throw new Error("Could not save wallet list to device storage");
  return row;
}

function newImportRowId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `imp-${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  return `imp-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function addImportedWalletRow(kp: { address: string; privateKeyB64: string }, name: string): TmaWalletRow {
  const row: TmaWalletRow = {
    id: newImportRowId(),
    kind: "import",
    hdIndex: null,
    address: kp.address,
    name,
    privateKeyB64: kp.privateKeyB64,
    createdAt: Date.now(),
  };
  const rows = loadWalletRows();
  if (rows.some((r) => r.address === row.address)) throw new Error("Wallet already exists");
  rows.push(row);
  if (!saveWalletRows(rows)) throw new Error("Could not save wallet list to device storage");
  return row;
}

export function applySavedWalletOrder(rows: TmaWalletRow[]): TmaWalletRow[] {
  try {
    const raw = localStorage.getItem(LS_ORDER);
    if (!raw?.trim()) return rows;
    const order = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (order.length === 0) return rows;
    const by = new Map(rows.map((r) => [r.address, r]));
    const seen = new Set<string>();
    const out: TmaWalletRow[] = [];
    for (const a of order) {
      const r = by.get(a);
      if (r) {
        out.push(r);
        seen.add(a);
      }
    }
    for (const r of rows) {
      if (!seen.has(r.address)) out.push(r);
    }
    return out;
  } catch {
    return rows;
  }
}

export function saveWalletListOrder(addresses: string[]): void {
  try {
    localStorage.setItem(LS_ORDER, addresses.join(","));
    mirrorLocalStorageKey(LS_ORDER);
  } catch {
    /* ignore */
  }
}

export function clearWalletListOrder(): void {
  try {
    localStorage.removeItem(LS_ORDER);
    mirrorLocalStorageKey(LS_ORDER);
  } catch {
    /* ignore */
  }
}

export function hasSavedWalletListOrder(): boolean {
  try {
    return Boolean(localStorage.getItem(LS_ORDER)?.trim());
  } catch {
    return false;
  }
}

function removeAddressFromOrder(address: string): void {
  try {
    const raw = localStorage.getItem(LS_ORDER);
    if (!raw) return;
    const parts = raw.split(",").map((s) => s.trim()).filter((s) => s && s !== address);
    if (parts.length === 0) localStorage.removeItem(LS_ORDER);
    else localStorage.setItem(LS_ORDER, parts.join(","));
  } catch {
    /* ignore */
  }
}

export function updateWalletNameByAddress(address: string, name: string): void {
  const rows = loadWalletRows();
  const ix = rows.findIndex((r) => r.address === address);
  if (ix < 0) return;
  const n = name.trim();
  const row = rows[ix]!;
  rows[ix] = { ...row, name: n || row.name };
  if (!saveWalletRows(rows)) console.warn("[tma] updateWalletNameByAddress: save failed");
}

export function deleteWalletByAddress(address: string): { newActive: string | null } {
  const all = loadWalletRows();
  const row = all.find((r) => r.address === address);
  if (row) {
    const pk = getPrivateKeyBase64ForRow(row);
    moveWalletToTrash(row, pk);
  }
  const rows = all.filter((r) => r.address !== address);
  if (!saveWalletRows(rows)) console.warn("[tma] deleteWalletByAddress: save failed");
  removeAddressFromOrder(address);
  const active = getActiveAddress();
  if (active !== address) {
    return { newActive: active };
  }
  if (rows.length === 0) {
    try {
      localStorage.removeItem(LS_ACTIVE);
      localStorage.removeItem(LS_LEGACY_ADDR);
    } catch {
      /* ignore */
    }
    return { newActive: null };
  }
  const next = rows[0]!.address;
  setActiveAddress(next);
  return { newActive: next };
}

export function getPrivateKeyBase64ForRow(row: TmaWalletRow): string | null {
  if (row.kind === "import") return row.privateKeyB64 ?? null;
  if (row.kind === "watch") return null;
  const seed = readSeedBytes();
  if (!seed || row.hdIndex == null) return null;
  try {
    return hdKeyPairAtIndex(seed, row.hdIndex).privateKeyB64;
  } catch {
    return null;
  }
}
