/**
 * Mirror critical wallet keys to Telegram CloudStorage so data survives WebView restarts.
 * localStorage remains primary; cloud is backup / restore when local is empty.
 */

const MIRROR_KEYS = [
  "tma_hd_seed_b64",
  "tma_wallets_v1",
  "tma_wallet_active_addr",
  "tma_onboarding_v1_complete",
  "tma_wallet_list_order",
] as const;

type MirrorKey = (typeof MIRROR_KEYS)[number];

function cloudStorage() {
  return window.Telegram?.WebApp?.CloudStorage;
}

function cloudSet(key: string, value: string): Promise<void> {
  const cs = cloudStorage();
  if (!cs?.setItem) return Promise.resolve();
  return new Promise((resolve) => {
    cs.setItem(key, value, () => resolve());
  });
}

function cloudRemove(key: string): Promise<void> {
  const cs = cloudStorage();
  if (!cs?.removeItem) return Promise.resolve();
  return new Promise((resolve) => {
    cs.removeItem(key, () => resolve());
  });
}

function cloudGetItems(keys: string[]): Promise<Record<string, string>> {
  const cs = cloudStorage();
  if (!cs?.getItems) return Promise.resolve({});
  return new Promise((resolve) => {
    cs.getItems(keys, (_err, values) => resolve(values ?? {}));
  });
}

export function mirrorLocalStorageKey(key: string): void {
  try {
    const v = localStorage.getItem(key);
    if (v == null) void cloudRemove(key);
    else void cloudSet(key, v);
  } catch {
    /* ignore */
  }
}

export function mirrorAllWalletKeys(): void {
  for (const k of MIRROR_KEYS) mirrorLocalStorageKey(k);
}

export async function clearCloudMirrorKeys(): Promise<void> {
  await Promise.all(MIRROR_KEYS.map((k) => cloudRemove(k)));
}

function shouldRestoreKey(key: MirrorKey, localVal: string | null, cloudVal: string): boolean {
  if (!cloudVal) return false;
  if (!localVal) return true;
  if (key === "tma_wallets_v1" && (localVal === "[]" || localVal.trim() === "")) return true;
  return false;
}

/** Pull wallet seed/list from Telegram cloud when local storage was cleared. */
export async function restoreWalletKeysFromCloud(): Promise<void> {
  const values = await cloudGetItems([...MIRROR_KEYS]);
  try {
    for (const key of MIRROR_KEYS) {
      const cloudVal = values[key];
      if (typeof cloudVal !== "string" || !cloudVal) continue;
      const localVal = localStorage.getItem(key);
      if (shouldRestoreKey(key, localVal, cloudVal)) {
        localStorage.setItem(key, cloudVal);
      }
    }
  } catch {
    /* ignore */
  }
}
