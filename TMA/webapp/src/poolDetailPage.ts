import { t } from "./i18n";
import { fetchPoolBind, formatFinderBps, poolBindIsActive, activePoolIdFromChain } from "./poolApi";
import {
  fetchPoolDashboard,
  formatWeiToMrs,
  type PoolDashboardMiner,
  type PoolDashboardResponse,
} from "./poolBackendApi";
import {
  getPoolDetailSnapshot,
  setPoolDetailSnapshot,
  clearPoolDetailCache,
  poolsWalletKey,
} from "./poolUiCache";
import { localizedPoolName } from "./poolI18n";
import { syncPoolsOverlayScrollLock } from "./shellScrollLock";
import { markPoolChosen, getChosenPoolId } from "./poolMode";
import { openMinerPoolLeaveModal } from "./minerPoolLeaveModal";
import { openMinerPoolWithdrawModal } from "./minerPoolWithdrawModal";
import { formatPoolWithdrawReasons } from "./poolWithdrawReasons";
import { getActiveWalletRow } from "./walletStore";
import type { TmaWalletRow } from "./walletStore";
import type { OfficialPoolCatalogItem } from "./poolApi";
import { hidePoolsPage } from "./poolsPage";

/** Same as fullnode OfficialPoolParams::MINER_POOL_MIN_LOCK_BLOCKS */
const POOL_MIN_LOCK_BLOCKS = 10_000;

export type MountPoolDetailPageOpts = {
  escapeAttr: (s: string) => string;
  miningNodeBase: string;
  readNodeBase: string;
  walletAddress: string;
  poolId: number;
  activePoolIdOnChain: number | null;
  poolFallback?: OfficialPoolCatalogItem & {
    member_count?: number;
    blocks_won_total?: number;
    treasury_balance_wei?: string | number | null;
  };
  tmaAlert: (msg: string) => void;
  onBack: () => void;
  onSelectForMining: () => void;
  onPoolLeft?: () => void;
};

const detailShells = new Map<number, HTMLElement>();
let visiblePoolId: number | null = null;

export function hidePoolDetailPage(): void {
  if (visiblePoolId != null) {
    const el = detailShells.get(visiblePoolId);
    if (el) el.classList.add("pools-page--hidden");
    visiblePoolId = null;
  }
  syncPoolsOverlayScrollLock();
}

export function destroyPoolDetailPages(): void {
  for (const el of detailShells.values()) el.remove();
  detailShells.clear();
  visiblePoolId = null;
  syncPoolsOverlayScrollLock();
}

/** @deprecated use hidePoolDetailPage */
export function unmountPoolDetailPage(): void {
  hidePoolDetailPage();
}

function statRow(escapeAttr: (s: string) => string, label: string, value: string): string {
  return `
    <div class="pool-detail-stat">
      <span class="pool-detail-stat-lab">${escapeAttr(label)}</span>
      <span class="pool-detail-stat-val">${escapeAttr(value)}</span>
    </div>
  `;
}

type PoolUi = {
  pool_id: number;
  name: string;
  finder_bps: number;
  member_count?: number;
  blocks_won_total?: number;
  treasury_balance_wei?: string | number | null;
  last_round_height?: number;
  last_pool_block_height?: number;
  pplnc_window_fill_pct?: number;
};

function paintPoolStats(
  escapeAttr: (s: string) => string,
  poolSection: Element,
  pool: PoolUi,
): void {
  const tr = t();
  poolSection.removeAttribute("hidden");
  const bonus =
    pool.finder_bps > 0
      ? tr.poolsFinderBonus(formatFinderBps(pool.finder_bps))
      : tr.poolsFinderEqual;
  const lastBlock =
    pool.last_pool_block_height && pool.last_pool_block_height > 0
      ? tr.poolLastRoundAt(pool.last_pool_block_height)
      : tr.poolLastRoundNone;
  const windowLine =
    typeof pool.pplnc_window_fill_pct === "number"
      ? tr.poolWindowFill(pool.pplnc_window_fill_pct)
      : "";

  poolSection.innerHTML = `
    <h2 class="pool-detail-h2">${escapeAttr(tr.poolDetailPoolStats)}</h2>
    ${statRow(escapeAttr, tr.poolStatMiners, String(pool.member_count ?? 0))}
    ${statRow(escapeAttr, tr.poolBlocksWonTotal, String(pool.blocks_won_total ?? 0))}
    ${statRow(escapeAttr, tr.poolTreasuryBalance, `${formatWeiToMrs(pool.treasury_balance_wei ?? "0")} MRS`)}
    ${statRow(escapeAttr, tr.poolLastRoundLabel, lastBlock)}
    ${windowLine ? `<p class="pool-detail-meta pool-detail-meta--sub">${escapeAttr(windowLine)}</p>` : ""}
    <p class="pool-detail-meta pool-detail-meta--sub">${escapeAttr(tr.poolMiningParticipationHint)}</p>
    <p class="pool-detail-meta">${escapeAttr(bonus)}</p>
  `;
}

function paintMinerSection(
  escapeAttr: (s: string) => string,
  minerSection: Element,
  addr: string,
  miner: PoolDashboardMiner | null | undefined,
): void {
  const tr = t();
  minerSection.removeAttribute("hidden");
  if (!addr) {
    minerSection.innerHTML = `<p class="pool-detail-hint">${escapeAttr(tr.miningWalletHint)}</p>`;
    return;
  }
  if (miner?.is_this_pool) {
    const owedMrs = formatWeiToMrs(miner.owed_wei ?? "0");
    minerSection.innerHTML = `
      <h2 class="pool-detail-h2">${escapeAttr(tr.poolDetailYourStats)}</h2>
      ${statRow(escapeAttr, tr.poolYourTaps, String(miner.credit_delta ?? 0))}
      ${statRow(escapeAttr, tr.poolBlocksMinedByYou, String(miner.blocks_mined_by_you_since_join ?? 0))}
      <div class="pool-detail-balance-card">
        <p class="pool-detail-balance-lab">${escapeAttr(tr.poolAvailableToWithdraw)}</p>
        <p class="pool-detail-balance-val">${owedMrs} MRS</p>
        <p class="pool-detail-balance-sub">${escapeAttr(tr.poolBalanceSimple(owedMrs))}</p>
        <p class="pool-detail-share-hint">${escapeAttr(tr.poolShareHint)}</p>
      </div>
    `;
    return;
  }
  minerSection.innerHTML = `
    <h2 class="pool-detail-h2">${escapeAttr(tr.poolDetailYourStats)}</h2>
    <p class="pool-detail-hint">${escapeAttr(tr.poolNotInThisPool)}</p>
  `;
}

function paintJoinButton(
  opts: MountPoolDetailPageOpts,
  actionsEl: Element,
  poolId: number,
  activePoolIdOnChain: number | null,
): void {
  const tr = t();
  const addr = opts.walletAddress.trim();
  const chosen = Boolean(addr && getChosenPoolId(addr) === poolId);
  const btn = document.createElement("button");
  btn.type = "button";
  if (chosen) {
    btn.className = "pools-btn pools-btn--chosen";
    btn.textContent = tr.poolYouChoseThisPool;
    btn.disabled = true;
  } else {
    btn.className = "pools-btn pools-btn--join";
    btn.textContent = tr.poolsJoinMiningPool;
    btn.addEventListener("click", () => {
      if (!addr) {
        opts.tmaAlert(tr.alertNoActiveWallet);
        return;
      }
      if (
        activePoolIdOnChain != null &&
        activePoolIdOnChain !== poolId
      ) {
        opts.tmaAlert(tr.poolsAlreadyInOtherPool);
        return;
      }
      markPoolChosen(addr, poolId);
      opts.onSelectForMining();
      const snap = getPoolDetailSnapshot(poolId, opts.walletAddress);
      paintActions(
        opts,
        actionsEl,
        poolId,
        localizedPoolName(poolId, snap?.pool?.name ?? ""),
        snap?.miner,
        activePoolIdOnChain,
      );
    });
  }
  actionsEl.appendChild(btn);
}

function paintActions(
  opts: MountPoolDetailPageOpts,
  actionsEl: Element,
  poolId: number,
  _displayName: string,
  _miner: PoolDashboardMiner | null | undefined,
  activePoolIdOnChain: number | null,
): void {
  actionsEl.innerHTML = "";
  paintJoinButton(opts, actionsEl, poolId, activePoolIdOnChain);
}

async function resolveChainHeight(readNodeBase: string): Promise<number> {
  const bridge = window.__TMA_SHARED__;
  if (bridge?.fetchNodeInfoJson) {
    try {
      const nj = JSON.parse(await bridge.fetchNodeInfoJson(readNodeBase)) as { height?: number };
      if (typeof nj.height === "number" && nj.height > 0) return nj.height;
    } catch {
      /* ignore */
    }
  }
  try {
    const root = readNodeBase.trim().endsWith("/") ? readNodeBase.trim() : `${readNodeBase.trim()}/`;
    const res = await fetch(`${root}status`, { cache: "no-store" });
    if (res.ok) {
      const o = (await res.json()) as { success?: boolean; data?: { height?: number } };
      if (o.success && typeof o.data?.height === "number") return o.data.height;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function paintPoolFooter(
  opts: MountPoolDetailPageOpts,
  footerEl: Element,
  poolId: number,
  displayName: string,
  miner: PoolDashboardMiner | null | undefined,
  currentHeight: number,
): void {
  const tr = t();
  const row = getActiveWalletRow();
  footerEl.innerHTML = "";

  if (!miner?.is_this_pool || !row) {
    footerEl.hidden = true;
    return;
  }

  footerEl.hidden = false;
  const joinHeight = Number(miner.join_height ?? 0);
  const unlockBlock =
    joinHeight > 0 ? joinHeight + POOL_MIN_LOCK_BLOCKS : 0;
  const lockElapsed = unlockBlock > 0 && currentHeight >= unlockBlock;

  const owedGross = BigInt(miner.owed_wei ?? "0");
  const canWithdrawFunds = lockElapsed && miner.can_withdraw && owedGross > 0n;

  const wdBtn = document.createElement("button");
  wdBtn.type = "button";
  wdBtn.className = "pools-btn pools-btn--primary";
  wdBtn.textContent = tr.poolsWithdrawBtn;
  wdBtn.disabled = !canWithdrawFunds;
  if (!lockElapsed && unlockBlock > 0) {
    wdBtn.title = tr.poolActionLockedUntil(unlockBlock);
  } else if (!canWithdrawFunds) {
    wdBtn.title = formatPoolWithdrawReasons(miner.withdraw_reasons, tr, unlockBlock);
  }
  wdBtn.addEventListener("click", () => {
    if (!canWithdrawFunds) {
      if (!lockElapsed && unlockBlock > 0) opts.tmaAlert(tr.poolWithdrawLockedUntil(unlockBlock));
      else opts.tmaAlert(formatPoolWithdrawReasons(miner.withdraw_reasons, tr, unlockBlock));
      return;
    }
    openMinerPoolWithdrawModal({
      escapeAttr: opts.escapeAttr,
      tmaAlert: opts.tmaAlert,
      wallet: row,
      poolId,
      onSuccess: () => void refreshPoolDetailStats(opts, false),
    });
  });
  footerEl.appendChild(wdBtn);

  const wdHint = document.createElement("p");
  wdHint.className = "pool-detail-footer-hint";
  if (!lockElapsed && unlockBlock > 0) {
    wdHint.textContent = tr.poolWithdrawLockedUntil(unlockBlock);
  } else {
    wdHint.textContent = tr.poolWithdrawToActiveWallet(
      row.address.slice(0, 8) + "…" + row.address.slice(-6),
    );
  }
  footerEl.appendChild(wdHint);

  const unstakeBtn = document.createElement("button");
  unstakeBtn.type = "button";
  unstakeBtn.className = "pools-btn pools-btn--ghost";
  unstakeBtn.textContent = tr.poolFinishUnstakeBtn;
  unstakeBtn.disabled = !lockElapsed;
  if (!lockElapsed && unlockBlock > 0) {
    unstakeBtn.title = tr.poolUnstakeLockedUntil(unlockBlock);
  }
  unstakeBtn.addEventListener("click", () => {
    if (!lockElapsed) {
      if (unlockBlock > 0) opts.tmaAlert(tr.poolUnstakeLockedUntil(unlockBlock));
      return;
    }
    void openLeave(row, poolId, displayName, opts, currentHeight);
  });
  footerEl.appendChild(unstakeBtn);

  if (!lockElapsed && unlockBlock > 0) {
    const unHint = document.createElement("p");
    unHint.className = "pool-detail-footer-hint";
    unHint.textContent = tr.poolUnstakeLockedUntil(unlockBlock);
    footerEl.appendChild(unHint);
  }
}

function applyDashboard(
  opts: MountPoolDetailPageOpts,
  shell: HTMLElement,
  dash: PoolDashboardResponse,
  statusEl: Element | null,
  poolSection: Element | null,
  minerSection: Element | null,
  actionsEl: Element | null,
  footerEl: Element | null,
  currentHeight: number,
  activePoolIdOnChain: number | null,
): void {
  const pool = dash.pool!;
  const displayName = localizedPoolName(pool.pool_id, pool.name);
  const titleEl = shell.querySelector("#poolDetailTitle");
  if (titleEl) titleEl.textContent = displayName;

  if (statusEl) statusEl.hidden = true;
  if (poolSection) paintPoolStats(opts.escapeAttr, poolSection, pool);
  if (minerSection) paintMinerSection(opts.escapeAttr, minerSection, opts.walletAddress.trim(), dash.miner);
  if (actionsEl) paintActions(opts, actionsEl, pool.pool_id, displayName, dash.miner, activePoolIdOnChain);
  if (footerEl) paintPoolFooter(opts, footerEl, pool.pool_id, displayName, dash.miner, currentHeight);
  setPoolDetailSnapshot(opts.poolId, opts.walletAddress, dash);
}

async function refreshPoolDetailStats(
  opts: MountPoolDetailPageOpts,
  showRefreshing: boolean,
): Promise<void> {
  const shell = detailShells.get(opts.poolId);
  if (!shell || shell.classList.contains("pools-page--hidden")) return;

  const statusEl = shell.querySelector("#poolDetailStatus");
  const poolSection = shell.querySelector("#poolDetailPoolSection");
  const minerSection = shell.querySelector("#poolDetailMinerSection");
  const actionsEl = shell.querySelector("#poolDetailActions");
  const footerEl = shell.querySelector("#poolDetailFooter");

  if (showRefreshing && statusEl) {
    statusEl.hidden = false;
    statusEl.textContent = t().poolDetailRefreshing;
  }

  try {
    const [dash, currentHeight, bind] = await Promise.all([
      fetchPoolDashboard(opts.poolId, opts.walletAddress.trim()),
      resolveChainHeight(opts.readNodeBase),
      fetchPoolBind(opts.miningNodeBase, opts.walletAddress.trim()),
    ]);
    const activePoolIdOnChain = poolBindIsActive(bind)
      ? activePoolIdFromChain(bind, null)
      : null;
    if (!shell || shell.classList.contains("pools-page--hidden")) return;
    const walletKey = poolsWalletKey(opts.walletAddress);
    if (shell.dataset.walletKey !== walletKey) return;
    if (!dash?.pool) {
      if (statusEl && !poolSection?.innerHTML) statusEl.textContent = t().poolsLoadFail;
      else if (statusEl) statusEl.textContent = t().poolDetailRefreshFailed;
      return;
    }
    applyDashboard(
      opts,
      shell,
      dash,
      statusEl,
      poolSection,
      minerSection,
      actionsEl,
      footerEl,
      currentHeight,
      activePoolIdOnChain,
    );
  } catch {
    if (statusEl && poolSection?.innerHTML) {
      statusEl.hidden = false;
      statusEl.textContent = t().poolDetailRefreshFailed;
    }
  }
}

function bindDetailBack(shell: HTMLElement, opts: MountPoolDetailPageOpts): void {
  const back = shell.querySelector("#poolDetailBack");
  if (!back) return;
  const clone = back.cloneNode(true);
  back.replaceWith(clone);
  clone.addEventListener("click", () => {
    hidePoolDetailPage();
    opts.onBack();
  });
}

function createDetailShell(opts: MountPoolDetailPageOpts): HTMLElement {
  const tr = t();
  const { escapeAttr, poolId, poolFallback } = opts;
  const title =
    poolFallback != null
      ? localizedPoolName(poolId, poolFallback.name)
      : tr.poolDetailTitle(poolId);

  const shell = document.createElement("div");
  shell.className = "tma-shell-page pools-page pool-detail-page";
  shell.id = `tma-pool-detail-page-${poolId}`;
  shell.dataset.poolId = String(poolId);
  shell.innerHTML = `
    <div class="tma-shell-inner pools-page-inner">
      <div class="pools-page-scroll pool-detail-scroll" id="poolDetailScroll">
        <header class="tma-shell-header tma-shell-header--scroll-sticky">
          <button type="button" class="tma-shell-back" id="poolDetailBack" aria-label="${escapeAttr(tr.commonBack)}">‹</button>
          <h1 class="tma-shell-title" id="poolDetailTitle">${escapeAttr(title)}</h1>
          <span class="tma-shell-header-spacer" aria-hidden="true"></span>
        </header>
        <p class="pools-status" id="poolDetailStatus">${escapeAttr(tr.commonLoading)}</p>
        <section class="pool-detail-section" id="poolDetailPoolSection" hidden></section>
        <section class="pool-detail-section pool-detail-section--miner" id="poolDetailMinerSection" hidden></section>
        <div class="pool-detail-actions" id="poolDetailActions"></div>
        <footer class="pool-detail-footer" id="poolDetailFooter" hidden></footer>
      </div>
    </div>
  `;
  document.body.appendChild(shell);
  bindDetailBack(shell, opts);
  return shell;
}

export function mountPoolDetailPage(opts: MountPoolDetailPageOpts): void {
  hidePoolDetailPage();
  hidePoolsPage();

  let shell = detailShells.get(opts.poolId);
  if (!shell) {
    shell = createDetailShell(opts);
    detailShells.set(opts.poolId, shell);
  } else {
    bindDetailBack(shell, opts);
  }

  shell.classList.remove("pools-page--hidden");
  visiblePoolId = opts.poolId;

  const statusEl = shell.querySelector("#poolDetailStatus");
  const poolSection = shell.querySelector("#poolDetailPoolSection");
  const minerSection = shell.querySelector("#poolDetailMinerSection");
  const actionsEl = shell.querySelector("#poolDetailActions");
  const footerEl = shell.querySelector("#poolDetailFooter");

  const walletKey = poolsWalletKey(opts.walletAddress);
  const prevWalletKey = shell.dataset.walletKey ?? "";
  const shellWalletMismatch = Boolean(prevWalletKey && prevWalletKey !== walletKey);
  shell.dataset.walletKey = walletKey;
  if (shellWalletMismatch) {
    poolSection?.setAttribute("hidden", "");
    if (poolSection) poolSection.innerHTML = "";
    minerSection?.setAttribute("hidden", "");
    if (minerSection) minerSection.innerHTML = "";
    if (actionsEl) actionsEl.innerHTML = "";
    if (footerEl) {
      footerEl.hidden = true;
      footerEl.innerHTML = "";
    }
  }

  if (opts.poolFallback && poolSection && !poolSection.innerHTML) {
    paintPoolStats(opts.escapeAttr, poolSection, opts.poolFallback);
    if (actionsEl) {
      const name = opts.poolFallback
        ? localizedPoolName(opts.poolId, opts.poolFallback.name)
        : t().poolDetailTitle(opts.poolId);
      paintActions(opts, actionsEl, opts.poolId, name, null, opts.activePoolIdOnChain);
    }
  }

  void refreshPoolDetailStats(opts, true);
  syncPoolsOverlayScrollLock();
}

async function openLeave(
  row: TmaWalletRow,
  poolId: number,
  _poolName: string,
  opts: MountPoolDetailPageOpts,
  currentHeight?: number,
): Promise<void> {
  const poolName = localizedPoolName(
    poolId,
    getPoolDetailSnapshot(poolId, opts.walletAddress)?.pool?.name ?? `Pool ${poolId + 1}`,
  );
  const height =
    currentHeight && currentHeight > 0
      ? currentHeight
      : await resolveChainHeight(opts.readNodeBase);
  openMinerPoolLeaveModal({
    escapeAttr: opts.escapeAttr,
    tmaAlert: opts.tmaAlert,
    nodeBase: opts.miningNodeBase,
    wallet: row,
    poolId,
    poolName,
    currentHeight: height,
    onSuccess: () => {
      clearPoolDetailCache(poolId, opts.walletAddress);
      opts.onPoolLeft?.();
      hidePoolDetailPage();
      opts.onBack();
    },
  });
}
