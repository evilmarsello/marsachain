/**
 * Wallet secrets stay in localStorage only (per Telegram WebView / device).
 * Legacy builds mirrored seed and keys to Telegram CloudStorage — we purge those on startup.
 */

/** Keys that must never live in Telegram cloud (legacy mirror list). */
const LEGACY_SENSITIVE_CLOUD_KEYS = [
  "tma_hd_seed_b64",
  "tma_wallets_v1",
  "tma_wallet_active_addr",
  "tma_onboarding_v1_complete",
  "tma_wallet_list_order",
] as const;

function cloudStorage() {
  return window.Telegram?.WebApp?.CloudStorage;
}

function cloudRemove(key: string): Promise<void> {
  const cs = cloudStorage();
  if (!cs?.removeItem) return Promise.resolve();
  return new Promise((resolve) => {
    cs.removeItem(key, () => resolve());
  });
}

/** Remove any wallet-related data previously synced to Telegram CloudStorage. */
export async function purgeLegacyCloudWalletKeys(): Promise<void> {
  await Promise.all(LEGACY_SENSITIVE_CLOUD_KEYS.map((k) => cloudRemove(k)));
}

/** @deprecated use purgeLegacyCloudWalletKeys */
export async function clearCloudMirrorKeys(): Promise<void> {
  await purgeLegacyCloudWalletKeys();
}
