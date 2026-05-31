import { t } from "./i18n";
import { attachModalEscape, removeTmaModal } from "./modal";
import {
  addHdWalletRow,
  addImportedWalletRow,
  ensureHdWalletListFromStoredSeed,
  loadWalletRows,
  maxHdIndex,
  readSeedBytes,
  type TmaWalletRow,
} from "./walletStore";
import { keyPairFromPrivateKeyB64 } from "./crypto/marsaKey";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function mountOverlay(innerHtml: string): HTMLElement {
  removeTmaModal();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = innerHtml;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) removeTmaModal();
  });
  document.body.appendChild(wrap);
  attachModalEscape();
  return wrap;
}

export function openMiningPoolsModal(_escapeAttr?: (s: string) => string): void {
  const tr = t();
  mountOverlay(`
    <div class="tma-dialog" role="dialog" aria-modal="true">
      <h2 class="tma-dialog-title">${esc(tr.miningPoolsTitle)}</h2>
      <p class="tma-dialog-hint">${esc(tr.miningPoolsBody1)}</p>
      <p class="tma-dialog-hint">${esc(tr.miningPoolsBody2)}</p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-close" id="dlgMpOk">${esc(tr.commonOk)}</button>
      </div>
    </div>
  `).querySelector("#dlgMpOk")?.addEventListener("click", () => removeTmaModal());
}

export function openImportWalletModal(
  _escapeAttr: (s: string) => string,
  alertFn: (msg: string) => void,
  onImported: (row: TmaWalletRow) => void,
): void {
  const tr = t();
  const wrap = mountOverlay(`
    <div class="tma-dialog" role="dialog" aria-modal="true" aria-labelledby="dlgImpTitle">
      <div class="tma-dialog-head-row">
        <h2 class="tma-dialog-title" id="dlgImpTitle">${esc(tr.importTitle)}</h2>
        <button type="button" class="tma-dialog-x" id="dlgImpX" aria-label="${esc(tr.commonClose)}">✕</button>
      </div>
      <p class="tma-dialog-hint">${esc(tr.importHint)}</p>
      <label class="tma-dialog-label" for="dlgImpPk">${esc(tr.importPkLabel)}</label>
      <textarea class="tma-dialog-inp tma-dialog-inp-mono tma-dialog-inp--wide tma-dialog-inp--import-pk" id="dlgImpPk" rows="3" placeholder="${esc(tr.importPkPlaceholder)}" autocomplete="off" spellcheck="false"></textarea>
      <label class="tma-dialog-label" for="dlgImpName">${esc(tr.importNameLabel)}</label>
      <input type="text" class="tma-dialog-inp tma-dialog-inp--import-name" id="dlgImpName" placeholder="${esc(tr.importNamePlaceholder)}" autocomplete="off" />
      <p class="tma-dialog-warn tma-dialog-warn--seed">${esc(tr.importWarnSeed)}</p>
      <p class="tma-dialog-warn" id="dlgImpStatus" style="display:none"></p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="dlgImpCancel">${esc(tr.commonCancel)}</button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgImpGo">${esc(tr.walletImport)}</button>
      </div>
    </div>
  `);

  const close = () => removeTmaModal();
  wrap.querySelector("#dlgImpX")?.addEventListener("click", close);
  wrap.querySelector("#dlgImpCancel")?.addEventListener("click", close);

  const pkEl = wrap.querySelector<HTMLTextAreaElement>("#dlgImpPk");
  const nameEl = wrap.querySelector<HTMLInputElement>("#dlgImpName");
  const st = wrap.querySelector<HTMLElement>("#dlgImpStatus");

  function showStatus(msg: string, ok: boolean): void {
    if (!st) return;
    st.textContent = msg;
    st.style.display = "block";
    st.style.color = ok ? "var(--ok, #4caf50)" : "#ff453a";
  }

  wrap.querySelector("#dlgImpGo")?.addEventListener("click", () => {
    const rawPk = pkEl?.value.trim() ?? "";
    const nameInp = nameEl?.value.trim() ?? "";
    if (!rawPk) {
      showStatus(tr.importEnterPk, false);
      return;
    }
    const kp = keyPairFromPrivateKeyB64(rawPk);
    if (!kp) {
      showStatus(tr.importInvalidPkFormat, false);
      return;
    }
    const displayName = nameInp || `Wallet ${kp.address.slice(-8)}`;
    try {
      const row = addImportedWalletRow(kp, displayName);
      removeTmaModal();
      alertFn(tr.importSuccess(row.name, row.address));
      onImported(row);
    } catch (e) {
      const m = (e as Error)?.message ?? String(e);
      showStatus(m === "Wallet already exists" ? tr.importExists : m, false);
    }
  });
}

export function openNewWalletModal(
  _escapeAttr: (s: string) => string,
  alertFn: (msg: string) => void,
  onCreated: (row: TmaWalletRow) => void,
): void {
  const tr = t();
  ensureHdWalletListFromStoredSeed();
  const seed = readSeedBytes();
  if (!seed) {
    alertFn(tr.newWalletNoSeed);
    return;
  }

  const rows = loadWalletRows();
  const next = maxHdIndex(rows) + 1;
  const defaultName = `Wallet ${next}`;

  const wrap = mountOverlay(`
    <div class="tma-dialog" role="dialog" aria-modal="true" aria-labelledby="dlgNwTitle">
      <div class="tma-dialog-head-row">
        <h2 class="tma-dialog-title" id="dlgNwTitle">${esc(tr.newWalletTitle)}</h2>
        <button type="button" class="tma-dialog-x" id="dlgNwX" aria-label="${esc(tr.commonClose)}">✕</button>
      </div>
      <p class="tma-dialog-hint">${esc(tr.newWalletHint)}</p>
      <label class="tma-dialog-label" for="dlgNwName">${esc(tr.newWalletNameLabel)}</label>
      <input type="text" class="tma-dialog-inp tma-dialog-inp--tall" id="dlgNwName" placeholder="${esc(tr.newWalletNamePlaceholder)}" value="${esc(defaultName)}" autocomplete="off" />
      <p class="tma-dialog-hint tma-dialog-hint--tight">${esc(tr.newWalletHdIndex(String(next)))}</p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="dlgNwCancel">${esc(tr.commonCancel)}</button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgNwGo">${esc(tr.newWalletBtn)}</button>
      </div>
    </div>
  `);

  const close = () => removeTmaModal();
  wrap.querySelector("#dlgNwX")?.addEventListener("click", close);
  wrap.querySelector("#dlgNwCancel")?.addEventListener("click", close);

  wrap.querySelector("#dlgNwGo")?.addEventListener("click", () => {
    const nameEl = wrap.querySelector<HTMLInputElement>("#dlgNwName");
    const name = (nameEl?.value.trim() || defaultName).trim();
    try {
      const row = addHdWalletRow(seed, next, name);
      removeTmaModal();
      alertFn(tr.newWalletCreated(row.name));
      onCreated(row);
    } catch (e) {
      alertFn(String((e as Error)?.message ?? tr.newWalletFailed));
    }
  });
}
