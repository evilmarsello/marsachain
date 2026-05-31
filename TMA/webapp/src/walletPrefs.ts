const LS_AUTO_CASCADE = "tma_wallet_auto_cascade_send";

/** Same as Android `WalletPreferences.autoCascadeSend`. */
export function getAutoCascadeSend(): boolean {
  try {
    return localStorage.getItem(LS_AUTO_CASCADE) === "1";
  } catch {
    return false;
  }
}

export function setAutoCascadeSend(enabled: boolean): void {
  try {
    localStorage.setItem(LS_AUTO_CASCADE, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
