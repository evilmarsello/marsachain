/** Social media links — Settings → Information */

import { t } from "./i18n";

const SOCIAL_X_URL = "https://x.com/marsachain";
const SOCIAL_TELEGRAM_URL = "https://t.me/marsachain";

export type MountSocialMediaPageOpts = {
  escapeAttr: (s: string) => string;
  onClose: () => void;
};

let pageRoot: HTMLElement | null = null;

export function unmountSocialMediaPage(): void {
  pageRoot?.remove();
  pageRoot = null;
}

function iconTelegram(): string {
  return `<svg class="tma-social-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.78 15.28 9.55 19.1c.39 0 .56-.17.76-.37l1.83-1.75 3.8 2.79c.7.39 1.2.18 1.38-.64l2.5-11.72h.01c.22-1.03-.37-1.43-1.04-1.18L2.6 10.03c-1 .39-1 .95-.17 1.2l4.58 1.43 10.64-6.7c.5-.31.96-.14.58.19"/></svg>`;
}

function iconX(): string {
  return `<svg class="tma-social-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>`;
}

function openSocialUrl(url: string, isTelegram: boolean): void {
  const tw = window.Telegram?.WebApp;
  if (isTelegram && tw?.openTelegramLink) {
    tw.openTelegramLink(url);
    return;
  }
  if (tw?.openLink) {
    tw.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function tile(label: string, url: string, icon: string, esc: (s: string) => string, isTelegram: boolean): string {
  return `
    <a class="tma-social-tile" href="${esc(url)}" data-social-url="${esc(url)}" data-social-tg="${isTelegram ? "1" : "0"}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}">
      <span class="tma-social-tile-icon">${icon}</span>
      <span class="tma-social-tile-label">${esc(label)}</span>
    </a>
  `;
}

export function mountSocialMediaPage(opts: MountSocialMediaPageOpts): void {
  unmountSocialMediaPage();
  const { escapeAttr, onClose } = opts;
  const tr = t();
  const esc = escapeAttr;

  const el = document.createElement("div");
  el.className = "tma-shell-page tma-social-media-page";
  el.innerHTML = `
    <div class="tma-shell-inner">
      <header class="tma-shell-header">
        <button type="button" class="tma-shell-back" id="tmaSocialBack" aria-label="${esc(tr.commonBack)}">‹</button>
        <h1 class="tma-shell-title">${esc(tr.socialMediaTitle)}</h1>
        <span class="tma-shell-header-spacer" aria-hidden="true"></span>
      </header>
      <div class="tma-social-grid-wrap">
        <div class="tma-social-grid">
          ${tile(tr.socialTelegram, SOCIAL_TELEGRAM_URL, iconTelegram(), esc, true)}
          ${tile(tr.socialX, SOCIAL_X_URL, iconX(), esc, false)}
        </div>
      </div>
    </div>
  `;

  el.querySelectorAll<HTMLAnchorElement>(".tma-social-tile").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const url = a.dataset.socialUrl?.trim();
      if (!url) return;
      openSocialUrl(url, a.dataset.socialTg === "1");
    });
  });

  el.querySelector("#tmaSocialBack")?.addEventListener("click", () => {
    unmountSocialMediaPage();
    onClose();
  });
  document.body.appendChild(el);
  pageRoot = el;
}
