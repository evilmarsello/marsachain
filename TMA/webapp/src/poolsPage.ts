import { t } from "./i18n";
import {
  fetchOfficialPoolsList,
  fetchPoolBind,
  fetchPoolMember,
  formatFinderBps,
  activePoolIdFromChain,
  type OfficialPoolCatalogItem,
} from "./poolApi";
import { fetchBackendPoolList, type PoolCatalogWithStats } from "./poolBackendApi";
import {
  clearPoolUiCache,
  getPoolsListSnapshot,
  setPoolsListSnapshot,
  poolsWalletKey,
} from "./poolUiCache";
import { poolsCardPoolIconHtml } from "./miningIcons";
import { getChosenPoolId, markPoolChosen } from "./poolMode";
import { localizedPoolName } from "./poolI18n";
import { syncPoolsOverlayScrollLock } from "./shellScrollLock";

const IC_POOL_CARD_ICON = poolsCardPoolIconHtml();
const LS_POOLS_INFO_SEEN = "tma_pools_info_seen_v1";

export type MountPoolsPageOpts = {
  escapeAttr: (s: string) => string;
  miningNodeBase: string;
  readNodeBase: string;
  walletAddress: string;
  tmaAlert: (msg: string) => void;
  onClose: () => void;
  onOpenPool: (poolId: number, pool: PoolCatalogWithStats) => void;
};

let poolsShellEl: HTMLElement | null = null;
let poolsPageOpts: MountPoolsPageOpts | null = null;

function poolsInfoWasSeen(): boolean {
  try {
    return localStorage.getItem(LS_POOLS_INFO_SEEN) === "1";
  } catch {
    return false;
  }
}

function markPoolsInfoSeen(): void {
  try {
    localStorage.setItem(LS_POOLS_INFO_SEEN, "1");
  } catch {
    /* ignore */
  }
}

export function hidePoolsPage(): void {
  if (poolsShellEl) poolsShellEl.classList.add("pools-page--hidden");
  syncPoolsOverlayScrollLock();
}

export function destroyPoolsPage(): void {
  poolsShellEl?.remove();
  poolsShellEl = null;
  poolsPageOpts = null;
  syncPoolsOverlayScrollLock();
}

export function unmountPoolsPage(): void {
  hidePoolsPage();
}

function poolCardHtml(
  escapeAttr: (s: string) => string,
  pool: PoolCatalogWithStats,
  isSelected: boolean,
  yourChallengeCount: number | null,
): string {
  const tr = t();
  const displayName = localizedPoolName(pool.pool_id, pool.name);
  const bonus =
    pool.finder_bps > 0
      ? escapeAttr(tr.poolsFinderBonus(formatFinderBps(pool.finder_bps)))
      : escapeAttr(tr.poolsFinderEqual);
  const miners = typeof pool.member_count === "number" ? pool.member_count : 0;
  const challengeLine =
    yourChallengeCount != null
      ? `<p class="pools-card-meta">${escapeAttr(tr.poolsMembersLabel)}: ${yourChallengeCount}</p>`
      : "";
  return `
    <article class="pools-card${isSelected ? " pools-card--selected" : ""}" data-pool-id="${pool.pool_id}">
      <div class="pools-card-head">
        <span class="pools-card-drop">${IC_POOL_CARD_ICON}</span>
        <h3 class="pools-card-title">${escapeAttr(displayName)}</h3>
        <span class="pools-card-miners" data-pool-miners="${pool.pool_id}">${escapeAttr(tr.poolsTotalMiners(miners))}</span>
      </div>
      <p class="pools-card-meta">${bonus}</p>
      ${challengeLine}
      <div class="pools-card-actions pools-card-actions--single">
        <button type="button" class="pools-btn pools-btn--primary" data-pool-open="${pool.pool_id}">${escapeAttr(tr.poolsOpenPoolBtn)}</button>
      </div>
    </article>
  `;
}

function poolsInfoSheetHtml(escapeAttr: (s: string) => string): string {
  const tr = t();
  return `
    <div class="pools-info-sheet" role="dialog" aria-modal="true" aria-labelledby="poolsInfoTitle">
      <h3 class="pools-info-title" id="poolsInfoTitle">${escapeAttr(tr.miningPoolsTitle)}</h3>
      <p class="pools-info-body">${escapeAttr(tr.miningPoolsBody1)}</p>
      <p class="pools-info-body pools-info-body--muted">${escapeAttr(tr.miningPoolsBody2)}</p>
      <section class="pools-info-how">
        <h4 class="pools-info-how-title">${escapeAttr(tr.poolsHowTitle)}</h4>
        <p class="pools-info-how-body">${escapeAttr(tr.poolsHowBody)}</p>
        <p class="pools-info-how-body pools-info-how-body--muted">${escapeAttr(tr.poolsCustodialNote)}</p>
      </section>
      <button type="button" class="pools-btn pools-btn--primary pools-info-close" id="poolsInfoClose">${escapeAttr(tr.commonOk)}</button>
    </div>
  `;
}

function paintPoolsList(
  opts: MountPoolsPageOpts,
  pools: PoolCatalogWithStats[],
  activePoolId: number | null,
  chosenId: number | null,
  challengeCount: number | null,
): void {
  const { escapeAttr } = opts;
  const listEl = poolsShellEl?.querySelector("#poolsList");
  const statusEl = poolsShellEl?.querySelector("#poolsStatus");
  if (!listEl) return;

  listEl.innerHTML = pools
    .map((p) =>
      poolCardHtml(
        escapeAttr,
        p,
        chosenId === p.pool_id,
        activePoolId === p.pool_id ? challengeCount : null,
      ),
    )
    .join("");

  updatePoolsStatusLine(statusEl, pools, activePoolId, chosenId, t());

  const poolsById = new Map(pools.map((p) => [p.pool_id, p]));
  listEl.querySelectorAll<HTMLButtonElement>("[data-pool-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.poolOpen);
      const pool = poolsById.get(id);
      if (!pool) return;
      hidePoolsPage();
      opts.onOpenPool(pool.pool_id, pool);
    });
  });
}

function bindPoolsChrome(opts: MountPoolsPageOpts): void {
  if (!poolsShellEl) return;
  const back = poolsShellEl.querySelector("#poolsBack");
  if (back) {
    const clone = back.cloneNode(true);
    back.replaceWith(clone);
    clone.addEventListener("click", () => {
      hidePoolsPage();
      opts.onClose();
    });
  }
}

function createPoolsShell(opts: MountPoolsPageOpts): HTMLElement {
  const tr = t();
  const { escapeAttr } = opts;
  const showInfoOnMount = !poolsInfoWasSeen();

  const shell = document.createElement("div");
  shell.className = "tma-shell-page pools-page";
  shell.id = "tma-pools-page";
  shell.innerHTML = `
    <div class="tma-shell-inner pools-page-inner">
      <div class="pools-page-scroll">
        <header class="tma-shell-header tma-shell-header--scroll-sticky">
          <button type="button" class="tma-shell-back" id="poolsBack" aria-label="${escapeAttr(tr.commonBack)}">‹</button>
          <h1 class="tma-shell-title">${escapeAttr(tr.miningPoolsTitle)}</h1>
          <span class="tma-shell-header-spacer" aria-hidden="true"></span>
        </header>
        <p class="pools-status" id="poolsStatus">${escapeAttr(tr.commonLoading)}</p>
        <div class="pools-list" id="poolsList"></div>
        <footer class="pools-page-footer">
          <button type="button" class="pools-btn pools-btn--info" id="poolsInfoBtn">${escapeAttr(tr.poolsInfoBtn)}</button>
        </footer>
      </div>
    </div>
    <div class="pools-info-overlay" id="poolsInfo"${showInfoOnMount ? "" : " hidden"}>
      ${poolsInfoSheetHtml(escapeAttr)}
    </div>
  `;
  document.body.appendChild(shell);

  const infoOverlay = shell.querySelector<HTMLElement>("#poolsInfo");
  const closeInfo = () => {
    markPoolsInfoSeen();
    if (infoOverlay) infoOverlay.hidden = true;
  };
  shell.querySelector("#poolsInfoClose")?.addEventListener("click", closeInfo);
  infoOverlay?.addEventListener("click", (e) => {
    if (e.target === infoOverlay) closeInfo();
  });
  shell.querySelector("#poolsInfoBtn")?.addEventListener("click", () => {
    if (infoOverlay) infoOverlay.hidden = false;
  });

  return shell;
}

async function refreshPoolsListStats(opts: MountPoolsPageOpts): Promise<void> {
  const tr = t();
  const statusEl = poolsShellEl?.querySelector("#poolsStatus");
  const addr = opts.walletAddress.trim();
  const snap = getPoolsListSnapshot();
  const sameWallet = snap && snap.walletKey === poolsWalletKey(addr);

  if (sameWallet && snap && statusEl) {
    paintPoolsList(opts, snap.pools, snap.activePoolId, snap.chosenId, snap.challengeCount);
    statusEl.textContent = tr.poolDetailRefreshing;
  }

  try {
    const [backend, nodeCatalog] = await Promise.all([
      fetchBackendPoolList(6_000),
      fetchOfficialPoolsList(opts.miningNodeBase),
    ]);
    const pools = mergePoolCatalogs(nodeCatalog, backend);
    if (!pools.length) {
      if (statusEl) statusEl.textContent = tr.poolsLoadFail;
      return;
    }

    let activePoolId = snap?.activePoolId ?? null;
    let challengeCount = snap?.challengeCount ?? null;
    let chosenId = addr ? getChosenPoolId(addr) : snap?.chosenId ?? null;

    if (addr) {
      const [bind, member] = await Promise.all([
        fetchPoolBind(opts.miningNodeBase, addr),
        fetchPoolMember(opts.miningNodeBase, addr),
      ]);
      activePoolId = activePoolIdFromChain(bind, member);
      challengeCount =
        activePoolId != null && member && typeof member.challenge_count === "number"
          ? member.challenge_count
          : null;
      if (activePoolId != null) {
        markPoolChosen(addr, activePoolId);
        chosenId = activePoolId;
      }
    }

    setPoolsListSnapshot({
      walletKey: poolsWalletKey(addr),
      pools,
      activePoolId,
      chosenId,
      challengeCount,
    });

    paintPoolsList(opts, pools, activePoolId, chosenId, challengeCount);
    if (statusEl) statusEl.textContent = "";
  } catch {
    if (statusEl && !sameWallet) statusEl.textContent = tr.poolsLoadFail;
    else if (statusEl) statusEl.textContent = "";
  }
}

export function mountPoolsPage(opts: MountPoolsPageOpts): void {
  const walletKey = poolsWalletKey(opts.walletAddress);
  if (poolsPageOpts && poolsWalletKey(poolsPageOpts.walletAddress) !== walletKey) {
    clearPoolUiCache();
  }
  poolsPageOpts = opts;

  if (poolsShellEl) {
    poolsShellEl.classList.remove("pools-page--hidden");
    bindPoolsChrome(opts);
    const snap = getPoolsListSnapshot();
    if (snap && snap.walletKey === poolsWalletKey(opts.walletAddress)) {
      paintPoolsList(opts, snap.pools, snap.activePoolId, snap.chosenId, snap.challengeCount);
      const statusEl = poolsShellEl.querySelector("#poolsStatus");
      if (statusEl) statusEl.textContent = "";
    }
    void refreshPoolsListStats(opts);
    syncPoolsOverlayScrollLock();
    return;
  }

  poolsShellEl = createPoolsShell(opts);
  bindPoolsChrome(opts);

  const snap = getPoolsListSnapshot();
  if (snap && snap.walletKey === poolsWalletKey(opts.walletAddress)) {
    paintPoolsList(opts, snap.pools, snap.activePoolId, snap.chosenId, snap.challengeCount);
    const statusEl = poolsShellEl.querySelector("#poolsStatus");
    if (statusEl) statusEl.textContent = "";
  }

  void refreshPoolsListStats(opts);
  syncPoolsOverlayScrollLock();
}

function mergePoolCatalogs(
  nodeCatalog: { pools: OfficialPoolCatalogItem[] } | null,
  backend: { pools: PoolCatalogWithStats[] } | null,
): PoolCatalogWithStats[] {
  const backendById = new Map((backend?.pools ?? []).map((p) => [p.pool_id, p]));
  if (nodeCatalog?.pools?.length) {
    return nodeCatalog.pools.map((p) => ({
      ...p,
      member_count: backendById.get(p.pool_id)?.member_count ?? 0,
      blocks_won_total: backendById.get(p.pool_id)?.blocks_won_total,
      treasury_balance_wei: backendById.get(p.pool_id)?.treasury_balance_wei ?? null,
    }));
  }
  if (backend?.pools?.length) return backend.pools;
  return [];
}

function updatePoolsStatusLine(
  statusEl: Element | null,
  pools: PoolCatalogWithStats[],
  activePoolId: number | null,
  chosenId: number | null,
  tr: ReturnType<typeof t>,
): void {
  if (!statusEl) return;
  if (activePoolId != null) {
    const p = pools.find((x) => x.pool_id === activePoolId);
    if (p) {
      statusEl.textContent = tr.poolsYourPool(localizedPoolName(p.pool_id, p.name));
      return;
    }
  }
  if (chosenId != null) {
    const p = pools.find((x) => x.pool_id === chosenId);
    if (p) {
      statusEl.textContent = tr.poolsSelectedPool(localizedPoolName(p.pool_id, p.name));
      return;
    }
  }
  statusEl.textContent = tr.poolsChooseMiningPool;
}

/** Active pool from cached list (for pool detail join guard). */
export function getCachedActivePoolId(): number | null {
  return getPoolsListSnapshot()?.activePoolId ?? null;
}
