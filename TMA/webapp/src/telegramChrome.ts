/** Telegram WebApp viewport + measured app chrome (top/bottom bars). */

import type { TelegramWebApp } from "./telegram";

function tg(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

export function syncTelegramWebApp(): void {
  try {
    const tw = tg();
    if (!tw) return;
    tw.ready();
    tw.expand();
    tw.disableVerticalSwipes?.();
    tw.setHeaderColor?.("#1c1c1e");
    tw.setBackgroundColor?.("#1c1c1e");

    const docEl = document.documentElement;
    const docStyle = docEl.style;
    const sa = tw.safeAreaInset;
    const csa = tw.contentSafeAreaInset;
    const top = csa?.top ?? sa?.top ?? 0;
    const bottom = csa?.bottom ?? sa?.bottom ?? 0;
    docStyle.setProperty("--tg-safe-top", `${top}px`);
    docStyle.setProperty("--tg-safe-bottom", `${bottom}px`);

    if (tw.isExpanded === false) {
      docEl.setAttribute("data-tg-compact", "1");
    } else {
      docEl.removeAttribute("data-tg-compact");
    }
  } catch (e) {
    console.warn("syncTelegramWebApp failed", e);
  }
}

export function syncChromeMetrics(): void {
  requestAnimationFrame(() => {
    try {
      const topBar = document.querySelector<HTMLElement>(".top-bar");
      const bottomNav = document.querySelector<HTMLElement>(".bottom-nav");
      const docStyle = document.documentElement.style;
      if (topBar) {
        docStyle.setProperty(
          "--tma-chrome-top",
          `${Math.round(topBar.getBoundingClientRect().height)}px`,
        );
      }
      if (bottomNav) {
        docStyle.setProperty(
          "--tma-chrome-bottom",
          `${Math.round(bottomNav.getBoundingClientRect().height)}px`,
        );
      }
    } catch (e) {
      console.warn("syncChromeMetrics failed", e);
    }
  });
}

let viewportHookInstalled = false;

export function installTelegramChromeHooks(onViewportChange?: () => void): void {
  syncTelegramWebApp();
  syncChromeMetrics();

  if (viewportHookInstalled) return;
  viewportHookInstalled = true;

  const tw = tg();
  const handler = () => {
    syncTelegramWebApp();
    syncChromeMetrics();
    onViewportChange?.();
  };

  tw?.onEvent?.("viewportChanged", handler);
  window.addEventListener("resize", handler);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") handler();
  });
}
