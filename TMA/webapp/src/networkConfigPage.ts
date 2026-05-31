/** Network Config — chain economics and constants. */

import { getNetworkConfigSections, t } from "./i18n";

export type MountNetworkConfigPageOpts = {
  escapeAttr: (s: string) => string;
  onClose: () => void;
};

let pageRoot: HTMLElement | null = null;

export function unmountNetworkConfigPage(): void {
  pageRoot?.remove();
  pageRoot = null;
}

function card(title: string, paragraphs: string[], esc: (s: string) => string): string {
  const body = paragraphs.map((p) => `<p class="tma-about-p">${esc(p)}</p>`).join("");
  return `<section class="tma-settings-card"><h2 class="tma-settings-card-title">${esc(title)}</h2>${body}</section>`;
}

export function mountNetworkConfigPage(opts: MountNetworkConfigPageOpts): void {
  unmountNetworkConfigPage();
  const { escapeAttr, onClose } = opts;
  const tr = t();
  const esc = escapeAttr;
  const bodyHtml = getNetworkConfigSections().map((s) => card(s.title, s.paragraphs, esc)).join("");

  const el = document.createElement("div");
  el.className = "tma-shell-page tma-about-page tma-network-config-page";
  el.innerHTML = `
    <div class="tma-shell-inner">
      <header class="tma-shell-header">
        <button type="button" class="tma-shell-back" id="tmaNetworkConfigBack" aria-label="${esc(tr.commonBack)}">‹</button>
        <h1 class="tma-shell-title">${esc(tr.networkConfigTitle)}</h1>
        <span class="tma-shell-header-spacer" aria-hidden="true"></span>
      </header>
      <div class="tma-about-scroll">${bodyHtml}</div>
    </div>
  `;

  el.querySelector("#tmaNetworkConfigBack")?.addEventListener("click", () => {
    unmountNetworkConfigPage();
    onClose();
  });
  document.body.appendChild(el);
  pageRoot = el;
}
