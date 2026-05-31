/** About App / About Marsa Chain — content from Android `fragment_about*.xml`. */

import { getAboutAppSections, getAboutMarsaSections, t } from "./i18n";

export type MountAboutPageOpts = {
  escapeAttr: (s: string) => string;
  onClose: () => void;
  appVersion?: string;
};

let aboutRoot: HTMLElement | null = null;

export function unmountAboutPage(): void {
  aboutRoot?.remove();
  aboutRoot = null;
}

function card(title: string, paragraphs: string[], esc: (s: string) => string): string {
  const body = paragraphs.map((p) => `<p class="tma-about-p">${esc(p)}</p>`).join("");
  return `<section class="tma-settings-card"><h2 class="tma-settings-card-title">${esc(title)}</h2>${body}</section>`;
}

function mountScrollPage(title: string, bodyHtml: string, opts: MountAboutPageOpts): void {
  unmountAboutPage();
  const { escapeAttr, onClose } = opts;
  const tr = t();
  const el = document.createElement("div");
  el.className = "tma-shell-page tma-about-page";
  el.innerHTML = `
    <div class="tma-shell-inner">
      <header class="tma-shell-header">
        <button type="button" class="tma-shell-back" id="tmaAboutBack" aria-label="${escapeAttr(tr.commonBack)}">‹</button>
        <h1 class="tma-shell-title">${escapeAttr(title)}</h1>
        <span class="tma-shell-header-spacer" aria-hidden="true"></span>
      </header>
      <div class="tma-about-scroll">${bodyHtml}</div>
    </div>
  `;

  el.querySelector("#tmaAboutBack")?.addEventListener("click", () => {
    unmountAboutPage();
    onClose();
  });
  document.body.appendChild(el);
  aboutRoot = el;
}

export function mountAboutAppPage(opts: MountAboutPageOpts): void {
  const esc = opts.escapeAttr;
  const tr = t();
  const ver = opts.appVersion?.trim();
  const html = [
    ...getAboutAppSections().map((s) => card(s.title, s.paragraphs, esc)),
    ver ? `<p class="tma-about-version">${tr.commonVersion} ${esc(ver)}</p>` : "",
  ].join("");
  mountScrollPage(tr.aboutAppTitle, html, opts);
}

export function mountAboutMarsaPage(opts: MountAboutPageOpts): void {
  const esc = opts.escapeAttr;
  const tr = t();
  const html = getAboutMarsaSections().map((s) => card(s.title, s.paragraphs, esc)).join("");
  mountScrollPage(tr.aboutMarsaTitle, html, opts);
}
