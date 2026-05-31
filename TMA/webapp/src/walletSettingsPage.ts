import { getAutoCascadeSend, setAutoCascadeSend } from "./walletPrefs";
import { mountWalletTrashPage, unmountWalletTrashPage } from "./walletTrashPage";

export type MountWalletSettingsPageOpts = {
  escapeAttr: (s: string) => string;
  tmaAlert: (msg: string) => void;
  onClose: () => void;
  labels: {
    intro: string;
    multiTitle: string;
    cascadeLabel: string;
    cascadeInfoTitle: string;
    cascadeInfoBody: string;
    deletedTitle: string;
    deletedBody: string;
    openDeleted: string;
    securityTitle: string;
    securityBody: string;
  };
};

let pageRootEl: HTMLElement | null = null;

export function unmountWalletSettingsPage(): void {
  unmountWalletTrashPage();
  pageRootEl?.remove();
  pageRootEl = null;
}

export function mountWalletSettingsPage(opts: MountWalletSettingsPageOpts): void {
  unmountWalletSettingsPage();
  const { escapeAttr, tmaAlert, onClose, labels } = opts;

  const shell = document.createElement("div");
  shell.id = "tma-wallet-settings-page";
  shell.className = "tma-shell-page tma-wallet-settings-page";
  pageRootEl = shell;

  shell.innerHTML = `
    <div class="tma-shell-inner tma-settings-scroll">
      <header class="tma-shell-header">
        <button type="button" class="tma-shell-back" id="wsBack" aria-label="Back">‹</button>
        <h1 class="tma-shell-title">Wallet settings</h1>
        <span class="tma-shell-header-spacer" aria-hidden="true"></span>
      </header>
      <p class="tma-settings-intro">${escapeAttr(labels.intro)}</p>
      <section class="tma-settings-card">
        <h2 class="tma-settings-card-title">${escapeAttr(labels.multiTitle)}</h2>
        <div class="tma-settings-row">
          <span class="tma-settings-row-label">${escapeAttr(labels.cascadeLabel)}</span>
          <button type="button" class="tma-settings-info" id="wsCascadeInfo" aria-label="Info">!</button>
          <span class="tma-settings-row-spacer"></span>
          <label class="tma-switch">
            <input type="checkbox" id="wsCascade" />
            <span class="tma-switch-track"></span>
          </label>
        </div>
      </section>
      <section class="tma-settings-card">
        <h2 class="tma-settings-card-title">${escapeAttr(labels.deletedTitle)}</h2>
        <p class="tma-settings-card-body">${escapeAttr(labels.deletedBody)}</p>
        <button type="button" class="btn btn-secondary tma-settings-open-trash" id="wsOpenTrash">${escapeAttr(labels.openDeleted)}</button>
      </section>
      <section class="tma-settings-card">
        <h2 class="tma-settings-card-title">${escapeAttr(labels.securityTitle)}</h2>
        <p class="tma-settings-card-body">${escapeAttr(labels.securityBody)}</p>
      </section>
    </div>
  `;

  const cascade = shell.querySelector<HTMLInputElement>("#wsCascade");
  if (cascade) cascade.checked = getAutoCascadeSend();
  cascade?.addEventListener("change", () => {
    setAutoCascadeSend(Boolean(cascade.checked));
  });

  shell.querySelector("#wsCascadeInfo")?.addEventListener("click", () => {
    tmaAlert(`${labels.cascadeInfoTitle}\n\n${labels.cascadeInfoBody}`);
  });

  shell.querySelector("#wsBack")?.addEventListener("click", () => {
    unmountWalletSettingsPage();
    onClose();
  });

  shell.querySelector("#wsOpenTrash")?.addEventListener("click", () => {
    mountWalletTrashPage({
      escapeAttr,
      tmaAlert,
      onCloseTrash: () => {
        /* trash overlay closed — stay on settings */
      },
    });
  });

  document.body.appendChild(shell);
}
