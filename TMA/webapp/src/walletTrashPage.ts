import { showTmaConfirm } from "./tmaAlertUi";
import {
  clearDeletedWalletsTrash,
  loadDeletedWallets,
  permanentlyRemoveFromTrash,
  purgeExpiredDeletedWallets,
  restoreWalletFromTrash,
  type DeletedWalletRow,
} from "./walletStore";

export type MountWalletTrashPageOpts = {
  escapeAttr: (s: string) => string;
  tmaAlert: (msg: string) => void;
  onCloseTrash: () => void;
};

let pageRootEl: HTMLElement | null = null;

export function unmountWalletTrashPage(): void {
  pageRootEl?.remove();
  pageRootEl = null;
}

function formatDeletedDate(ms: number): string {
  const dt = new Date(ms);
  return Number.isFinite(dt.getTime()) ? dt.toLocaleDateString("en-US") : "—";
}

export function mountWalletTrashPage(opts: MountWalletTrashPageOpts): void {
  unmountWalletTrashPage();
  const { escapeAttr, tmaAlert, onCloseTrash } = opts;

  const shell = document.createElement("div");
  shell.id = "tma-wallet-trash-page";
  shell.className = "tma-shell-page tma-wallet-trash-page";
  pageRootEl = shell;

  const listEl = document.createElement("div");
  listEl.className = "tma-trash-list";

  function paint(): void {
    purgeExpiredDeletedWallets();
    const rows = loadDeletedWallets();
    if (rows.length === 0) {
      listEl.innerHTML = `<p class="tma-trash-empty">No deleted wallets in the bin.</p>`;
      return;
    }
    listEl.innerHTML = rows
      .map(
        (r) => `<article class="tma-trash-card" data-address="${escapeAttr(r.address)}">
        <div class="tma-trash-card-top">
          <span class="tma-trash-name">${escapeAttr(r.name)}</span>
          <span class="tma-trash-date">Deleted ${escapeAttr(formatDeletedDate(r.deletedAt))}</span>
        </div>
        <div class="tma-trash-addr mono">${escapeAttr(r.address)}</div>
        <div class="tma-trash-actions">
          <button type="button" class="btn btn-secondary tma-trash-restore" data-restore="${escapeAttr(r.address)}">Restore</button>
          <button type="button" class="btn btn-secondary tma-trash-remove" data-remove="${escapeAttr(r.address)}">Remove</button>
        </div>
      </article>`,
      )
      .join("");

    listEl.querySelectorAll<HTMLButtonElement>("[data-restore]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const addr = btn.dataset.restore;
        const row = rows.find((w) => w.address === addr);
        if (!row) return;
        if (restoreWalletFromTrash(row)) {
          tmaAlert("Wallet restored to My Wallets");
          paint();
        } else {
          tmaAlert("A wallet with this address already exists in My Wallets");
        }
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const addr = btn.dataset.remove;
        if (!addr) return;
        void showTmaConfirm("Permanently delete this wallet entry from the bin?").then((ok) => {
          if (!ok) return;
          permanentlyRemoveFromTrash(addr);
          paint();
        });
        return;
      });
    });
  }

  shell.innerHTML = `
    <div class="tma-shell-inner">
      <header class="tma-shell-header">
        <button type="button" class="tma-shell-back" id="wtBack" aria-label="Back">‹</button>
        <h1 class="tma-shell-title">Deleted wallets</h1>
        <span class="tma-shell-header-spacer" aria-hidden="true"></span>
      </header>
      <p class="tma-settings-intro">Wallets removed from your list are kept here for about 30 days.</p>
      <button type="button" class="btn btn-secondary tma-trash-clear" id="wtClear">Empty bin</button>
    </div>
  `;
  const inner = shell.querySelector(".tma-shell-inner")!;
  inner.appendChild(listEl);

  shell.querySelector("#wtBack")?.addEventListener("click", () => {
    unmountWalletTrashPage();
    onCloseTrash();
  });

  shell.querySelector("#wtClear")?.addEventListener("click", () => {
    void showTmaConfirm("Remove all entries from the bin permanently? This cannot be undone.").then((ok) => {
      if (!ok) return;
      clearDeletedWalletsTrash();
      paint();
    });
  });

  document.body.appendChild(shell);
  paint();
}
