import { attachPullToRefresh, type PullToRefreshHandle } from "./pullToRefresh";
import { mergeCachedHistory } from "./txCache";
import { fetchMergedHistory } from "./txFetch";
import { bindTxListScrollLoadMore, TX_UI_PAGE_SIZE } from "./txListPaging";
import { loadWalletRows } from "./walletStore";
import { txRowHtml } from "./txRowHtml";
import {
  filterTxByHistoryFilter,
  type TxHistoryFilter,
  type TxRow,
} from "./txHistory";

const FILTER_OPTIONS: TxHistoryFilter[] = ["all", "send", "receive", "mining", "stakes"];

export type MountHistoryPageOpts = {
  escapeAttr: (s: string) => string;
  nodeBase: string;
  onClose: () => void;
  labels: {
    title: string;
    back: string;
    all: string;
    sent: string;
    received: string;
    mining: string;
    empty: string;
    loading: string;
    fail: string;
    block: string;
    amount: string;
    from: string;
    to: string;
    miningKind: string;
    stakesKind: string;
    hash: string;
    kindLabel: (kind: import("./txHistory").TxDisplayKind) => string;
    noWallets: string;
    pullRefresh: string;
    pullHint: string;
    scrollMore: string;
  };
};

let pageRootEl: HTMLElement | null = null;
let ptrHandle: PullToRefreshHandle | null = null;
let unbindScroll: (() => void) | null = null;
let filterDocClick: ((e: MouseEvent) => void) | null = null;
let allRows: TxRow[] = [];
let currentFilter: TxHistoryFilter = "all";
let visibleCount = TX_UI_PAGE_SIZE;

export function unmountHistoryPage(): void {
  ptrHandle?.destroy();
  ptrHandle = null;
  unbindScroll?.();
  unbindScroll = null;
  if (filterDocClick) {
    document.removeEventListener("click", filterDocClick);
    filterDocClick = null;
  }
  pageRootEl?.remove();
  pageRootEl = null;
  allRows = [];
  currentFilter = "all";
  visibleCount = TX_UI_PAGE_SIZE;
}

export function mountHistoryPage(opts: MountHistoryPageOpts): void {
  unmountHistoryPage();
  const { escapeAttr, nodeBase, onClose, labels } = opts;

  const shell = document.createElement("div");
  shell.id = "tma-history-page";
  shell.className = "tma-shell-page tma-history-page";
  pageRootEl = shell;

  const listEl = document.createElement("div");
  listEl.className = "wallet-tx-list tma-history-list";
  const statusEl = document.createElement("p");
  statusEl.className = "tma-history-status";

  function walletAddresses(): string[] {
    return [...new Set(loadWalletRows().map((w) => w.address.trim()).filter(Boolean))];
  }

  function filterLabel(f: TxHistoryFilter): string {
    switch (f) {
      case "all":
        return labels.all;
      case "send":
        return labels.sent;
      case "receive":
        return labels.received;
      case "mining":
        return labels.mining;
      case "stakes":
        return labels.stakesKind;
    }
  }

  function updateFilterUi(): void {
    const labelEl = shell.querySelector("#hFilterLabel");
    if (labelEl) labelEl.textContent = filterLabel(currentFilter);
    shell.querySelectorAll<HTMLButtonElement>("[data-hfilter-item]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.hfilterItem === currentFilter);
    });
  }

  function closeFilterMenu(): void {
    const picker = shell.querySelector("#hFilterPicker");
    const trigger = shell.querySelector<HTMLButtonElement>("#hFilterTrigger");
    const menu = shell.querySelector<HTMLElement>("#hFilterMenu");
    if (!picker || !trigger || !menu) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    picker.classList.remove("is-open");
  }

  function openFilterMenu(): void {
    const picker = shell.querySelector("#hFilterPicker");
    const trigger = shell.querySelector<HTMLButtonElement>("#hFilterTrigger");
    const menu = shell.querySelector<HTMLElement>("#hFilterMenu");
    if (!picker || !trigger || !menu) return;
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    picker.classList.add("is-open");
  }

  function bindFilterDropdown(): void {
    const picker = shell.querySelector("#hFilterPicker");
    const trigger = shell.querySelector<HTMLButtonElement>("#hFilterTrigger");
    const menu = shell.querySelector<HTMLElement>("#hFilterMenu");
    if (!picker || !trigger || !menu) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menu.hidden) openFilterMenu();
      else closeFilterMenu();
    });

    menu.querySelectorAll<HTMLButtonElement>("[data-hfilter-item]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const f = btn.dataset.hfilterItem as TxHistoryFilter;
        if (!f || f === currentFilter) {
          closeFilterMenu();
          return;
        }
        currentFilter = f;
        visibleCount = TX_UI_PAGE_SIZE;
        updateFilterUi();
        closeFilterMenu();
        paintList();
      });
    });

    if (filterDocClick) document.removeEventListener("click", filterDocClick);
    filterDocClick = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) closeFilterMenu();
    };
    document.addEventListener("click", filterDocClick);
  }

  function filteredRows(): TxRow[] {
    return filterTxByHistoryFilter(allRows, currentFilter);
  }

  function loadMoreVisible(): void {
    const total = filteredRows().length;
    if (visibleCount >= total) return;
    visibleCount = Math.min(visibleCount + TX_UI_PAGE_SIZE, total);
    paintList();
  }

  function paintList(): void {
    const filtered = filteredRows();
    if (filtered.length === 0) {
      listEl.innerHTML = "";
      statusEl.textContent = allRows.length === 0 ? labels.pullHint : labels.empty;
      statusEl.style.display = "block";
      return;
    }
    statusEl.style.display = "none";
    const slice = filtered.slice(0, visibleCount);
    const more =
      visibleCount < filtered.length
        ? `<p class="wallet-tx-more tma-history-more">${escapeAttr(labels.scrollMore)}</p>`
        : "";
    listEl.innerHTML =
      slice
        .map((r) =>
          txRowHtml(r, {
            escapeAttr,
            amountLabel: labels.amount,
            blockLabel: labels.block,
            fromLabel: labels.from,
            toLabel: labels.to,
            miningLabel: labels.miningKind,
            hashLabel: labels.hash,
            kindLabel: labels.kindLabel,
          }),
        )
        .join("") + more;
  }

  function applyRows(rows: TxRow[]): void {
    allRows = rows;
    visibleCount = TX_UI_PAGE_SIZE;
    paintList();
  }

  function loadFromCache(): boolean {
    const addresses = walletAddresses();
    if (addresses.length === 0) {
      statusEl.textContent = labels.noWallets;
      statusEl.style.display = "block";
      listEl.innerHTML = "";
      return true;
    }
    const cached = mergeCachedHistory(addresses);
    if (!cached || cached.length === 0) return false;
    applyRows(cached);
    return true;
  }

  async function loadFromNetwork(force = false): Promise<void> {
    const addresses = walletAddresses();
    if (addresses.length === 0) {
      allRows = [];
      statusEl.textContent = labels.noWallets;
      statusEl.style.display = "block";
      listEl.innerHTML = "";
      return;
    }
    if (!force) {
      if (loadFromCache()) return;
    }
    const bridge = window.__TMA_SHARED__;
    if (!bridge?.fetchAddressTxJson) {
      statusEl.textContent = labels.fail;
      statusEl.style.display = "block";
      return;
    }
    const showingCache = loadFromCache();
    if (!showingCache) {
      statusEl.textContent = labels.loading;
      statusEl.style.display = "block";
      listEl.innerHTML = "";
    } else {
      statusEl.style.display = "none";
    }
    try {
      applyRows(await fetchMergedHistory(nodeBase, addresses, force));
      statusEl.style.display = "none";
    } catch {
      if (loadFromCache()) {
        statusEl.style.display = "none";
        return;
      }
      statusEl.textContent = labels.fail;
      statusEl.style.display = "block";
      listEl.innerHTML = "";
    }
  }

  const filterItemsHtml = FILTER_OPTIONS.map(
    (f) =>
      `<button type="button" class="tma-history-filter-item${f === "all" ? " is-active" : ""}" data-hfilter-item="${f}" role="option" aria-selected="${f === "all"}">${escapeAttr(filterLabel(f))}</button>`,
  ).join("");

  shell.innerHTML = `
    <div class="tma-shell-inner tma-history-shell">
      <header class="tma-shell-header">
        <button type="button" class="tma-shell-back" id="hBack" aria-label="${escapeAttr(labels.back)}">‹</button>
        <h1 class="tma-shell-title">${escapeAttr(labels.title)}</h1>
        <span class="tma-shell-header-spacer" aria-hidden="true"></span>
      </header>
      <div class="tma-history-filter-picker" id="hFilterPicker">
        <button type="button" class="tma-history-filter-trigger" id="hFilterTrigger" aria-haspopup="listbox" aria-expanded="false">
          <span class="tma-history-filter-label" id="hFilterLabel">${escapeAttr(labels.all)}</span>
          <span class="tma-history-filter-chevron" aria-hidden="true"></span>
        </button>
        <div class="tma-history-filter-menu" id="hFilterMenu" role="listbox" hidden>${filterItemsHtml}</div>
      </div>
    </div>
  `;
  const host = shell.querySelector(".tma-history-shell") ?? shell;
  host.appendChild(statusEl);
  host.appendChild(listEl);

  shell.querySelector("#hBack")?.addEventListener("click", () => {
    unmountHistoryPage();
    onClose();
  });
  bindFilterDropdown();

  document.body.appendChild(shell);
  updateFilterUi();

  unbindScroll = bindTxListScrollLoadMore(listEl, loadMoreVisible);
  ptrHandle = attachPullToRefresh(listEl, () => loadFromNetwork(true), labels.pullRefresh);

  const hadCache = loadFromCache();
  if (!hadCache) {
    void loadFromNetwork(false);
  }
}
