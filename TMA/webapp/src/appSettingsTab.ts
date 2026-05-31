/**
 * Settings tab — mirrors Android `fragment_settings.xml` + `SettingsFragment.kt`.
 */
import { mountAboutAppPage, mountAboutMarsaPage, unmountAboutPage } from "./aboutPages";
import { attachModalEscape, removeTmaModal } from "./modal";
import { mountConnectionsPage, unmountConnectionsPage } from "./connectionsPage";
import { mountNetworkConfigPage, unmountNetworkConfigPage } from "./networkConfigPage";
import { mountSocialMediaPage, unmountSocialMediaPage } from "./socialMediaPage";
import type { Messages } from "./i18n";
import { getLocale, isLocale, localeSelectOptionsHtml, setLocale } from "./i18n";
import { fetchMiningInfoForAddress, miningInfoHasActiveStake } from "./miningInfoHelpers";
import {
  buildMinerUnstakeTransaction,
  submitTransaction,
} from "./marsaTransaction";
import {
  getActiveAddress,
  getActiveWalletRow,
  getPrivateKeyBase64ForRow,
} from "./walletStore";
import { fetchPoolBind, poolBindIsActive } from "./poolApi";

export type SettingsTabOpts = {
  escapeAttr: (s: string) => string;
  tmaAlert: (msg: string) => void;
  tr: Messages;
  readNodeBase: string;
  miningNodeBase: string;
  appVersion: string;
  onWalletReset: () => void;
  onCloseOverlay: () => void;
  onLocaleChange: () => void;
};

export function settingsTabHtml(esc: (s: string) => string, tr: Messages, appVersion: string): string {
  const ver = appVersion.trim();
  const loc = getLocale();
  return `
    <div class="tma-settings-scroll">
      <div class="tma-settings-brand tma-settings-brand--top">
        <img class="tma-settings-logo" src="/logo.png" width="40" height="40" alt="" />
        <img class="tma-settings-logoname" src="/logoname.png" alt="Marsa Chain" />
      </div>

      <section class="tma-settings-card">
        <h2 class="tma-settings-card-title">${esc(tr.settingsNetwork)}</h2>
        <button type="button" class="tma-settings-btn tma-settings-btn-warn" id="tmaSettingsConnections">${esc(tr.settingsConnections)}</button>
      </section>

      <section class="tma-settings-card tma-settings-card--lang">
        <div class="tma-settings-row tma-lang-picker-row">
          <span class="tma-settings-row-label">${esc(tr.languageTitle)}</span>
          <span class="tma-settings-row-spacer"></span>
          <select id="tmaSettingsLocale" class="tma-lang-select" aria-label="${esc(tr.languageTitle)}">
            ${localeSelectOptionsHtml(loc, esc)}
          </select>
        </div>
      </section>

      <section class="tma-settings-card">
        <h2 class="tma-settings-card-title">${esc(tr.settingsMiningStake)}</h2>
        <p class="tma-settings-hint">${esc(tr.settingsMiningStakeHint)}</p>
        <button type="button" class="tma-settings-btn tma-settings-btn-warn" id="tmaSettingsMinerUnstake" disabled>
          ${esc(tr.settingsMinerUnstake)}
        </button>
      </section>

      <section class="tma-settings-card">
        <h2 class="tma-settings-card-title">${esc(tr.settingsInformation)}</h2>
        <div class="tma-settings-info-btns">
          <div class="tma-settings-row-btns">
            <button type="button" class="tma-settings-btn tma-settings-btn-secondary" id="tmaSettingsAboutApp">${esc(tr.settingsInfoAboutApp)}</button>
            <button type="button" class="tma-settings-btn tma-settings-btn-secondary" id="tmaSettingsAboutMarsa">${esc(tr.settingsInfoAboutMarsa)}</button>
          </div>
          <div class="tma-settings-row-btns">
            <button type="button" class="tma-settings-btn tma-settings-btn-secondary" id="tmaSettingsNetworkConfig">${esc(tr.settingsInfoNetworkConfig)}</button>
            <button type="button" class="tma-settings-btn tma-settings-btn-secondary" id="tmaSettingsSocialMedia">${esc(tr.settingsInfoSocialMedia)}</button>
          </div>
        </div>
      </section>

      <section class="tma-settings-card tma-settings-card--exit">
        <button type="button" class="tma-settings-btn tma-settings-btn-outline" id="tmaSettingsResetSeed">
          ${esc(tr.settingsResetSeed)}
        </button>
      </section>

      ${ver ? `<p class="tma-settings-version">${esc(ver)}</p>` : ""}
    </div>
  `;
}


function openMinerUnstakeModal(opts: SettingsTabOpts): void {
  const { tmaAlert, readNodeBase, miningNodeBase, tr } = opts;
  removeTmaModal();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = `
    <div class="tma-dialog" role="dialog" aria-modal="true">
      <div class="tma-dialog-head-row">
        <h2 class="tma-dialog-title" id="dlgUnstakeTitle">${opts.escapeAttr(tr.unstakeTitle)}</h2>
        <button type="button" class="tma-dialog-x" id="dlgUnstakeX" aria-label="${opts.escapeAttr(tr.commonClose)}">✕</button>
      </div>
      <p class="tma-dialog-hint">${opts.escapeAttr(tr.unstakeHint)}</p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="dlgUnstakeCancel">${opts.escapeAttr(tr.commonCancel)}</button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgUnstakeSend">${opts.escapeAttr(tr.commonSend)}</button>
      </div>
    </div>
  `;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) removeTmaModal();
  });
  document.body.appendChild(wrap);
  attachModalEscape();
  wrap.querySelector("#dlgUnstakeX")?.addEventListener("click", () => removeTmaModal());
  wrap.querySelector("#dlgUnstakeCancel")?.addEventListener("click", () => removeTmaModal());
  wrap.querySelector("#dlgUnstakeSend")?.addEventListener("click", () => {
    void (async () => {
      const row = getActiveWalletRow();
      if (!row) {
        tmaAlert(tr.alertNoActiveWallet);
        return;
      }
      const pk = getPrivateKeyBase64ForRow(row);
      if (!pk) {
        tmaAlert(tr.alertNoSigningKey);
        return;
      }
      const bridge = window.__TMA_SHARED__;
      let height = 0;
      if (bridge?.fetchNodeInfoJson) {
        try {
          const nj = JSON.parse(await bridge.fetchNodeInfoJson(readNodeBase)) as { height?: number };
          height = typeof nj.height === "number" ? nj.height : 0;
        } catch {
          /* ignore */
        }
      }
      const tx = buildMinerUnstakeTransaction(row.address, height, pk);
      if (!tx) {
        tmaAlert(tr.alertTxSignFailed);
        return;
      }
      removeTmaModal();
      tmaAlert(tr.alertSendingUnstake);
      const res = await submitTransaction(miningNodeBase, tx);
      if (res.ok) {
        tmaAlert(tr.alertSentWaitConfirm);
      } else {
        tmaAlert(res.message);
      }
      void refreshMinerUnstakeButton(opts);
    })();
  });
}

function attachModalEscapeForReset(onClose: () => void): void {
  removeTmaModalEscape();
  resetModalEscHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  document.addEventListener("keydown", resetModalEscHandler);
}

let resetModalEscHandler: ((e: KeyboardEvent) => void) | null = null;

function removeTmaModalEscape(): void {
  if (resetModalEscHandler) {
    document.removeEventListener("keydown", resetModalEscHandler);
    resetModalEscHandler = null;
  }
}

function openWalletResetModal(opts: SettingsTabOpts): void {
  const { onWalletReset, tr, escapeAttr } = opts;
  removeTmaModal();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = `
    <div class="tma-dialog" role="dialog" aria-modal="true">
      <div class="tma-dialog-head-row">
        <h2 class="tma-dialog-title">${escapeAttr(tr.resetWalletTitle)}</h2>
        <button type="button" class="tma-dialog-x" id="dlgResetX" aria-label="${escapeAttr(tr.commonClose)}">✕</button>
      </div>
      <p class="tma-dialog-hint">${escapeAttr(tr.resetWalletHint).replace(/\n/g, "<br>")}</p>
      <div class="tma-dialog-actions tma-dialog-actions--reset">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="dlgResetContinue">
          ${escapeAttr(tr.resetWalletContinue)} <span id="dlgResetCountdown" class="tma-reset-countdown" hidden></span>
        </button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgResetCancel">${escapeAttr(tr.commonCancel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  const countdownEl = wrap.querySelector<HTMLElement>("#dlgResetCountdown");
  const continueBtn = wrap.querySelector<HTMLButtonElement>("#dlgResetContinue");

  const stopCountdown = () => {
    if (countdownTimer != null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (countdownEl) {
      countdownEl.hidden = true;
      countdownEl.textContent = "";
    }
  };

  const closeModal = () => {
    stopCountdown();
    removeTmaModalEscape();
    removeTmaModal();
  };

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeModal();
  });

  attachModalEscapeForReset(closeModal);

  wrap.querySelector("#dlgResetX")?.addEventListener("click", () => {
    closeModal();
  });
  wrap.querySelector("#dlgResetCancel")?.addEventListener("click", () => {
    closeModal();
  });

  continueBtn?.addEventListener("click", () => {
    if (countdownTimer != null) return;
    if (!countdownEl) return;
    countdownEl.hidden = false;
    let left = 5;
    countdownEl.textContent = String(left);
    countdownTimer = window.setInterval(() => {
      if (!document.getElementById("tma-modal-root")) {
        stopCountdown();
        return;
      }
      left -= 1;
      if (left > 0) {
        countdownEl.textContent = String(left);
        return;
      }
      stopCountdown();
      removeTmaModalEscape();
      removeTmaModal();
      onWalletReset();
    }, 1000);
  });
}

export async function refreshMinerUnstakeButton(opts: SettingsTabOpts): Promise<void> {
  const btn = document.getElementById("tmaSettingsMinerUnstake") as HTMLButtonElement | null;
  if (!btn) return;
  const addr = getActiveAddress()?.trim();
  if (!addr) {
    btn.disabled = true;
    btn.style.opacity = "0.45";
    return;
  }
  const bridge = window.__TMA_SHARED__;
  if (!bridge?.fetchMiningInfoJson) {
    btn.disabled = true;
    btn.style.opacity = "0.45";
    return;
  }
  try {
    const [d, bind] = await Promise.all([
      fetchMiningInfoForAddress(addr, opts.miningNodeBase, opts.readNodeBase),
      fetchPoolBind(opts.miningNodeBase, addr),
    ]);
    if (poolBindIsActive(bind)) {
      btn.disabled = true;
      btn.style.opacity = "0.45";
      btn.title = opts.tr.settingsMinerUnstakePoolBlocked;
      return;
    }
    btn.title = "";
    const hasStake = miningInfoHasActiveStake(d);
    const canUnstake = d?.can_unstake !== false;
    const enabled = hasStake && canUnstake;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? "1" : "0.45";
  } catch {
    btn.disabled = true;
    btn.style.opacity = "0.45";
  }
}

export function bindSettingsTab(opts: SettingsTabOpts): void {
  document.getElementById("tmaSettingsConnections")?.addEventListener("click", () => {
    mountConnectionsPage({ onClose: opts.onCloseOverlay });
  });

  document.getElementById("tmaSettingsLocale")?.addEventListener("change", (e) => {
    const next = (e.target as HTMLSelectElement).value;
    if (!isLocale(next)) return;
    setLocale(next);
    opts.onLocaleChange();
  });

  document.getElementById("tmaSettingsMinerUnstake")?.addEventListener("click", () => {
    const btn = document.getElementById("tmaSettingsMinerUnstake") as HTMLButtonElement | null;
    if (btn?.disabled) return;
    openMinerUnstakeModal(opts);
  });
  document.getElementById("tmaSettingsResetSeed")?.addEventListener("click", () => {
    openWalletResetModal(opts);
  });
  document.getElementById("tmaSettingsAboutApp")?.addEventListener("click", () => {
    mountAboutAppPage({
      escapeAttr: opts.escapeAttr,
      appVersion: opts.appVersion,
      onClose: opts.onCloseOverlay,
    });
  });
  document.getElementById("tmaSettingsAboutMarsa")?.addEventListener("click", () => {
    mountAboutMarsaPage({
      escapeAttr: opts.escapeAttr,
      onClose: opts.onCloseOverlay,
    });
  });
  document.getElementById("tmaSettingsNetworkConfig")?.addEventListener("click", () => {
    mountNetworkConfigPage({
      escapeAttr: opts.escapeAttr,
      onClose: opts.onCloseOverlay,
    });
  });
  document.getElementById("tmaSettingsSocialMedia")?.addEventListener("click", () => {
    mountSocialMediaPage({
      escapeAttr: opts.escapeAttr,
      onClose: opts.onCloseOverlay,
    });
  });
  void refreshMinerUnstakeButton(opts);
}

export function unmountSettingsOverlays(): void {
  unmountAboutPage();
  unmountConnectionsPage();
  unmountNetworkConfigPage();
  unmountSocialMediaPage();
}
