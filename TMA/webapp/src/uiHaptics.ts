import { hapticSelection } from "./haptic";

const TAP_SELECTOR = [
  ".nav-tab",
  ".tma-settings-btn",
  ".tma-settings-btn-secondary",
  ".tma-settings-btn-outline",
  ".tma-shell-back",
  ".wallet-action-btn",
  ".wallet-picker-trigger",
  ".wallet-picker-item",
  ".tma-history-filter-trigger",
  ".tma-history-filter-item",
  ".top-stat-btn",
  ".btn",
].join(",");

let attached = false;

/** Short selection haptic on common menu / button taps (Telegram only). */
export function attachUiHaptics(): void {
  if (attached) return;
  attached = true;
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest) return;
      if (t.closest(TAP_SELECTOR)) hapticSelection();
    },
    { capture: true },
  );
}
