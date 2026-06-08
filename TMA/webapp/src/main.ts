import "./styles/main.css";
import { getLocale, initLocale, onLocaleChange, setLocale, t, type Locale } from "./i18n";
import type { NodeInfo } from "./telegram";
import { attachModalEscape, removeTmaModal } from "./modal";
import {
  clearWalletLocalState,
  ensureHdWalletListFromStoredSeed,
  getActiveAddress,
  getActiveWalletRow,
  getPrivateKeyBase64ForRow,
  loadWalletRows,
  migrateWatchOnlyFromLegacyAddress,
  persistSeedAndInitHdZero,
  repairOnboardingIfNoLocalWallet,
  setActiveAddress,
} from "./walletStore";
import { txRowHtml } from "./txRowHtml";
import {
  bindSettingsTab,
  settingsTabHtml,
  unmountSettingsOverlays,
} from "./appSettingsTab";
import { openImportWalletModal, openNewWalletModal } from "./walletModals";
import { openCreateMinerStakeModal } from "./minerStakeModal";
import { openCreateMinerPoolStakeModal } from "./minerPoolStakeModal";
import { attachMiningTapHandler } from "./miningTap";
import {
  getMiningMode,
  setMiningMode,
  getChosenPoolId,
  hasChosenPoolForStake,
  markPoolChosen,
  isPoolStakePending,
  clearPoolStakePending,
  type MiningMode,
} from "./poolMode";
import { localizedPoolName } from "./poolI18n";
import { poolAlreadyInPoolMessage } from "./poolTxErrors";
import { playMiningCoinFlip, MINING_OVERLAY_REVEAL_MS } from "./miningCoinFlip";
import { installTelegramChromeHooks, syncChromeMetrics, syncTelegramWebApp } from "./telegramChrome";
import {
  miningOrphanPoolHintBtnHtml,
  miningUnstakeHintBtnHtml,
  miningWalletInPoolHintBtnHtml,
} from "./miningUnstakeHintHtml";
import {
  miningCoinPoolIconHtml,
  togglePoolIconHtml,
  toggleSoloIconHtml,
  walletIcoPoolImg,
} from "./miningIcons";
import {
  refreshPoolMembershipForAddress,
  clearPoolBindCache,
  hasActivePoolBind,
  hasOrphanPoolStake,
  hasSoloMinerStakeOnly,
  canMineInPoolMode,
  canMineInSoloMode,
  resetPoolWalletAfterLeave,
  isOnChainPoolMember,
  type PoolMembership,
} from "./poolInfoHelpers";
import type { PoolBindInfo } from "./poolApi";
import type { OfficialPoolCatalogItem } from "./poolApi";
import { activePoolIdFromChain, fetchOfficialPoolsList } from "./poolApi";
import {
  mountPoolsPage,
  unmountPoolsPage,
  hidePoolsPage,
  destroyPoolsPage,
} from "./poolsPage";
import {
  mountPoolDetailPage,
  unmountPoolDetailPage,
  destroyPoolDetailPages,
  hidePoolDetailPage,
} from "./poolDetailPage";
import {
  clearPoolUiCache,
  clearPoolsListActiveMembership,
  getPoolsListSnapshot,
  poolsWalletKey,
  setPoolsListSnapshot,
} from "./poolUiCache";
import type { PoolCatalogWithStats } from "./poolBackendApi";
import {
  fetchMiningInfoForAddress,
  miningInfoHasActiveStake,
  miningInfoIsPoolStake,
  miningNum,
  type MiningInfoPayload,
} from "./miningInfoHelpers";
import { buildSendTransaction, submitTransaction } from "./marsaTransaction";
import { mountHistoryPage, unmountHistoryPage } from "./historyPage";
import { mountStatisticsPage, unmountStatisticsPage } from "./statisticsPage";
import { mountMyWalletsPage, unmountMyWalletsPage } from "./myWalletsPage";
import { mountWalletSettingsPage, unmountWalletSettingsPage } from "./walletSettingsPage";
import { attachPullToRefresh, type PullToRefreshHandle } from "./pullToRefresh";
import {
  clearBalanceCaches,
  hasAddressTxCache,
  isBalanceCacheStale,
  readBalanceCache,
} from "./txCache";
import {
  allWalletAddresses,
  fetchTotalBalanceAllWallets,
  fetchWalletBalanceMrs,
  formatMrsFromBigIntNanos,
  parseMrsToBigIntNanos,
  totalBalanceFromCaches,
} from "./totalBalance";
import { setAddrTxIndexReady, setTxScanChainHeight } from "./txFetch";
import {
  fetchWalletTxNextPage,
  loadWalletTxForAddress,
  refreshWalletTxFromNetwork,
  walletTxNeedsNetworkSync,
  walletTxRowsFromCache,
} from "./walletTxLoad";
import { bindTxListScrollLoadMore, TX_UI_PAGE_SIZE } from "./txListPaging";
import { filterWalletListRows, normalizeTxKind, type TxDisplayKind, type TxRow } from "./txHistory";
import { bindWalletPicker, walletPickerHtml } from "./walletPicker";
import miningIconUrl from "../public/mining_icon.png?url";
import { unmountConnectionsPage } from "./connectionsPage";
import { resolveMiningNodeBase, resolveReadNodeBase, resolveWalletNodeBase } from "./nodeEndpoints";
import { fetchMiningStatsJsonMulti, parseMiningStatsJson } from "./miningStatsFetch";
import { formatMrsBalanceDisplay } from "./formatMrsBalance";
import { purgeLegacyCloudWalletKeys } from "./cloudStorageMirror";
import { attachUiHaptics } from "./uiHaptics";
import { tmaAlert } from "./tmaAlertUi";

const WALLET_LS = "tma_wallet_address";
/** Wallet tab dropdown only — does not change active/mining wallet. */
const WALLET_VIEW_LS = "tma_wallet_view_address";
const TAB_LS = "tma_nav_tab";
const ONBOARDING_LS = "tma_onboarding_v1_complete";
const WALLET_BALANCE_HIDDEN_LS = "tma_wallet_balance_hidden";
const WALLET_BALANCE_MASK = "**********";

function loadWalletBalanceHidden(): boolean {
  try {
    return localStorage.getItem(WALLET_BALANCE_HIDDEN_LS) === "1";
  } catch {
    return false;
  }
}

function saveWalletBalanceHidden(hidden: boolean): void {
  try {
    localStorage.setItem(WALLET_BALANCE_HIDDEN_LS, hidden ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let walletBalanceHidden = loadWalletBalanceHidden();

let walletPtrHandle: PullToRefreshHandle | null = null;

let walletTxVisibleCount = TX_UI_PAGE_SIZE;
let walletTxLoadingMore = false;
let unbindWalletTxScroll: (() => void) | null = null;

type TabId = "mining" | "wallet" | "settings";

function loadActiveTab(): TabId {
  try {
    const s = sessionStorage.getItem(TAB_LS);
    if (s === "mining" || s === "wallet" || s === "settings") return s;
  } catch {
    /* ignore */
  }
  return "mining";
}

function saveActiveTab(tab: TabId): void {
  try {
    sessionStorage.setItem(TAB_LS, tab);
  } catch {
    /* ignore */
  }
}

function readNodeBase(): string {
  return resolveReadNodeBase();
}

function miningNodeBase(): string {
  return resolveMiningNodeBase();
}

/** Wallet balance / tx / send — node 1 (not read replica). */
function walletNodeBase(): string {
  return resolveWalletNodeBase();
}

function devProxyHint(): string {
  return (import.meta.env.VITE_DEV_PROXY_HINT as string | undefined)?.trim() || "";
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function isLikelyWalletStorageError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("wallet") ||
    msg.includes("seed") ||
    msg.includes("mnemonic") ||
    msg.includes("decrypt") ||
    msg.includes("json") ||
    msg.includes("parse") ||
    msg.includes("storage")
  );
}

function renderFatalFallback(root: HTMLElement, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const walletHint = isLikelyWalletStorageError(err);
  const desc = walletHint
    ? "The app could not load saved wallet data. You can reload first; clear storage only if the problem persists."
    : "The app failed to start. Try reloading; clear wallet storage only if you still cannot open the app.";
  root.innerHTML = `
    <div class="tma-boot-err">
      <h1 class="tma-boot-err-title">Marsa Chain</h1>
      <p class="tma-boot-err-desc">${escapeAttr(desc)}</p>
      <pre class="tma-boot-err-pre mono">${escapeAttr(msg)}</pre>
      <div class="tma-boot-err-actions">
        <button type="button" class="btn btn-primary tma-boot-err-btn" id="tmaSoftReload">Reload</button>
        <button type="button" class="btn btn-secondary tma-boot-err-btn tma-boot-err-btn-danger" id="tmaHardReset">Clear wallet data and reload</button>
      </div>
    </div>
  `;
  document.getElementById("tmaSoftReload")?.addEventListener("click", () => {
    location.reload();
  });
  document.getElementById("tmaHardReset")?.addEventListener("click", () => {
    try {
      localStorage.removeItem(ONBOARDING_LS);
      localStorage.removeItem(WALLET_LS);
      localStorage.removeItem(WALLET_VIEW_LS);
    } catch {
      /* ignore */
    }
    clearWalletLocalState();
    location.reload();
  });
}

/** Same as Android `CoinFormatter.WEI_PER_COIN`. */
const WEI_PER_COIN = 100_000_000;

function isValidMrsAddress(address: string): boolean {
  const cleanAddress = address.trim();
  if (!cleanAddress) return false;
  if (!cleanAddress.startsWith("mrs")) return false;
  if (cleanAddress.length !== 43) return false;
  if (!/^[a-zA-Z0-9]+$/.test(cleanAddress)) return false;
  return true;
}

function getMrsAddressErrorMessage(address: string): string {
  const tr = t();
  if (!address.trim()) return tr.addrEnter;
  const cleanAddress = address.trim();
  if (!cleanAddress.startsWith("mrs")) return tr.addrMrsPrefix;
  if (cleanAddress.length !== 43) return tr.addrLength;
  if (!/^[a-zA-Z0-9]+$/.test(cleanAddress)) return tr.addrInvalidChars;
  return tr.addrInvalidFormat;
}

/** Same as Android `WalletFragment.computeMinFeeCoins` / Reward::getMinimumTransactionFee. */
function computeMinFeeCoins(height: number): number {
  const initial = 1.0;
  if (height <= 0) return initial;
  const interval = 1_050_000;
  const halvingCount = Math.floor((height - 1) / interval);
  let fee = initial;
  for (let i = 1; i <= halvingCount; i++) {
    const reduction = i === 1 ? 0.5 : i === 2 ? 0.4 : i === 3 ? 0.3 : i === 4 ? 0.2 : 0.1;
    fee *= 1.0 - reduction;
  }
  return fee;
}

function parseToNanos(coinsString: string): number | null {
  const normalized = coinsString.trim().replace(",", ".");
  if (!normalized) return null;
  const x = Number(normalized);
  if (!Number.isFinite(x) || x < 0) return null;
  const nanos = Math.round(x * WEI_PER_COIN);
  if (!Number.isFinite(nanos)) return null;
  return nanos;
}

function coinsToNanos(coins: number): number {
  return Math.round(coins * WEI_PER_COIN);
}

const IC_COPY_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

const IC_EYE_OPEN = `<svg class="wallet-bal-eye-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const IC_EYE_CLOSED = `<svg class="wallet-bal-eye-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M9.9 14.1a3 3 0 1 0 4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

/** Same filled gear as Android `ic_settings.xml` (Material), not a “sun” stroke icon. */
const IC_GEAR_FILL = `<path fill="currentColor" d="M12,15.5A3.5,3.5 0,0 1,8.5 12A3.5,3.5 0,0 1,12 8.5a3.5,3.5 0,0 1,3.5 3.5A3.5,3.5 0,0 1,12 15.5M19.43,12.97c0.04,-0.32 0.07,-0.64 0.07,-0.97s-0.03,-0.66 -0.07,-0.97l2.11,-1.65c0.19,-0.15 0.24,-0.42 0.12,-0.64l-2,-3.46c-0.12,-0.22 -0.39,-0.3 -0.61,-0.22l-2.49,1c-0.52,-0.4 -1.08,-0.73 -1.69,-0.98l-0.38,-2.65C14.46,2.18 14.25,2 14,2h-4c-0.25,0 -0.46,0.18 -0.49,0.42L9.13,5.07c-0.61,0.25 -1.17,0.59 -1.69,0.98l-2.49,-1c-0.23,-0.09 -0.49,0 -0.61,0.22l-2,3.46c-0.13,0.22 -0.07,0.49 0.12,0.64l2.11,1.65C4.07,11.34 4.07,11.66 4.07,12s0.03,0.66 0.07,0.97L2.96,14.62c-0.19,0.15 -0.24,0.42 -0.12,0.64l2,3.46c0.12,0.22 0.39,0.3 0.61,0.22l2.49,-1c0.52,0.4 1.08,0.73 1.69,0.98l0.38,2.65C9.54,21.82 9.75,22 10,22h4c0.25,0 0.46,-0.18 0.49,-0.42l0.38,-2.65c0.61,-0.25 1.17,-0.59 1.69,-0.98l2.49,1c0.23,0.09 0.49,0 0.61,-0.22l2,-3.46c0.12,-0.22 0.07,-0.49 -0.12,-0.64L19.43,12.97z"/>`;
const IC_NAV_GEAR = `<svg class="nav-ico-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">${IC_GEAR_FILL}</svg>`;

const NAV_MINING_ICON = `<span class="nav-ico-mining" style="--nav-mining-mask:url('${miningIconUrl}')" aria-hidden="true"></span>`;

function openReceiveModal(): void {
  const tr = t();
  removeTmaModal();
  prepareMiningTabContext();
  const addr = activeWalletAddress();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = `
    <div class="tma-dialog" role="dialog" aria-modal="true" aria-labelledby="dlgRecvTitle">
      <h2 class="tma-dialog-title" id="dlgRecvTitle">${escapeAttr(tr.receiveMrsTitle)}</h2>
      <label class="tma-dialog-label">${escapeAttr(tr.receiveYourAddress)}</label>
      <div class="tma-dialog-recv-box">
        <div class="tma-dialog-addr-txt" id="dlgRecvAddr">${escapeAttr(addr || "—")}</div>
        <button type="button" class="tma-dialog-copy-ico" id="dlgRecvCopy" aria-label="Copy address" ${addr ? "" : "disabled"}>${IC_COPY_SVG}</button>
      </div>
      <p class="tma-dialog-hint">${escapeAttr(tr.receiveShareHint)}</p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-close" id="dlgRecvClose">${escapeAttr(tr.commonClose)}</button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgRecvShare" ${addr ? "" : "disabled"}>${escapeAttr(tr.receiveShare)}</button>
      </div>
    </div>
  `;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) removeTmaModal();
  });
  document.body.appendChild(wrap);
  attachModalEscape();

  wrap.querySelector("#dlgRecvClose")?.addEventListener("click", () => removeTmaModal());
  wrap.querySelector("#dlgRecvCopy")?.addEventListener("click", async () => {
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      tmaAlert(tr.receiveCopied);
    } catch {
      tmaAlert(tr.receiveCopyFail);
    }
  });
  wrap.querySelector("#dlgRecvShare")?.addEventListener("click", async () => {
    if (!addr) return;
    const text = `Send MRS to: ${addr}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        removeTmaModal();
      } else {
        await navigator.clipboard.writeText(text);
        tmaAlert("Share not available — message copied to clipboard");
        removeTmaModal();
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        tmaAlert("Message copied to clipboard");
        removeTmaModal();
      } catch {
        tmaAlert("Could not share or copy");
      }
    }
  });
}

function openSendModal(): void {
  removeTmaModal();
  prepareMiningTabContext();
  const tr = t();
  const selfAddr = activeWalletAddress();
  const ownAddresses = new Set(
    loadWalletRows()
      .map((w) => w.address.trim())
      .filter(Boolean),
  );
  const h = lastNodeInfo?.height;
  const height = typeof h === "number" && Number.isFinite(h) ? h : 0;
  const minFeeCoins = computeMinFeeCoins(height);
  const minFeeStr = String(minFeeCoins);
  const minFeeNanos = coinsToNanos(minFeeCoins);

  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = `
    <div class="tma-dialog" role="dialog" aria-modal="true" aria-labelledby="dlgSendTitle">
      <h2 class="tma-dialog-title" id="dlgSendTitle">${escapeAttr(tr.sendMrsTitle)}</h2>
      <label class="tma-dialog-label" for="dlgRecipient">${escapeAttr(tr.sendWalletAddressLabel)}</label>
      <textarea class="tma-dialog-inp tma-dialog-inp-mono tma-dialog-inp--wide" id="dlgRecipient" rows="2" placeholder="${escapeAttr(tr.sendRecipientPlaceholder)}" autocomplete="off" spellcheck="false"></textarea>
      <p class="tma-dialog-warn tma-dialog-warn--hint" id="dlgAddrWarn"></p>
      <label class="tma-dialog-label" for="dlgAmount">${escapeAttr(tr.sendAmountLabel)}</label>
      <input type="text" class="tma-dialog-inp tma-dialog-inp--tall" id="dlgAmount" inputmode="decimal" placeholder="${escapeAttr(tr.sendAmountPlaceholder)}" autocomplete="off" />
      <label class="tma-dialog-label" for="dlgFee" style="margin-top:16px;display:block">${escapeAttr(tr.sendFeeLabelHalving)}</label>
      <input type="text" class="tma-dialog-inp tma-dialog-inp--tall" id="dlgFee" inputmode="decimal" placeholder="${escapeAttr(tr.sendFeePlaceholder(minFeeStr))}" autocomplete="off" />
      <p class="tma-dialog-warn tma-dialog-warn--fee" id="dlgHighFeeWarn" style="display:none">${escapeAttr(tr.sendHighFeeWarn)}</p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="dlgSendCancel">${escapeAttr(tr.commonCancel)}</button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgSendGo" disabled>${escapeAttr(tr.sendTitle)}</button>
      </div>
    </div>
  `;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) removeTmaModal();
  });
  document.body.appendChild(wrap);
  attachModalEscape();

  const rec = wrap.querySelector<HTMLTextAreaElement>("#dlgRecipient");
  const amt = wrap.querySelector<HTMLInputElement>("#dlgAmount");
  const fee = wrap.querySelector<HTMLInputElement>("#dlgFee");
  const addrWarn = wrap.querySelector<HTMLElement>("#dlgAddrWarn");
  const highFee = wrap.querySelector<HTMLElement>("#dlgHighFeeWarn");
  const sendBtn = wrap.querySelector<HTMLButtonElement>("#dlgSendGo");

  function hideAddrWarn(): void {
    if (!addrWarn) return;
    addrWarn.textContent = "";
    addrWarn.classList.remove("is-visible");
  }

  function showAddrWarn(text: string): void {
    if (!addrWarn) return;
    addrWarn.textContent = text;
    addrWarn.classList.add("is-visible");
  }

  function isFormValid(): boolean {
    const recipient = rec?.value.trim() ?? "";
    if (!recipient || !isValidMrsAddress(recipient)) return false;
    const amountNanos = parseToNanos(amt?.value.trim() ?? "") ?? 0;
    if (amountNanos <= 0) return false;
    const feeRaw = fee?.value.trim() ?? "";
    const feeNanos = feeRaw === "" ? minFeeNanos : parseToNanos(feeRaw);
    if (feeNanos == null || feeNanos < minFeeNanos) return false;
    if (!selfAddr) return false;
    return true;
  }

  function syncSendForm(): void {
    if (!addrWarn || !rec) return;

    const address = rec.value.trim();
    if (!address) {
      hideAddrWarn();
    } else if (!isValidMrsAddress(address)) {
      showAddrWarn(tr.sendWarnMrs);
    } else if (ownAddresses.has(address)) {
      showAddrWarn(tr.sendWarnOwnWallet);
    } else {
      hideAddrWarn();
    }

    if (highFee && fee) {
      const raw = fee.value.trim().replace(",", ".");
      const feeMrs = raw === "" ? null : Number(raw);
      const show = feeMrs != null && Number.isFinite(feeMrs) && feeMrs > 1.0;
      highFee.style.display = show ? "block" : "none";
    }

    if (sendBtn) sendBtn.disabled = !isFormValid();
  }

  rec?.addEventListener("input", syncSendForm);
  amt?.addEventListener("input", syncSendForm);
  fee?.addEventListener("input", syncSendForm);
  syncSendForm();

  wrap.querySelector("#dlgSendCancel")?.addEventListener("click", () => removeTmaModal());

  sendBtn?.addEventListener("click", () => {
    if (sendBtn.disabled) return;
    void (async () => {
      const recipient = rec?.value.trim() ?? "";
      const amountNanos = parseToNanos(amt?.value.trim() ?? "") ?? 0;
      const feeRaw = fee?.value.trim() ?? "";
      const feeNanos = feeRaw === "" ? minFeeNanos : parseToNanos(feeRaw);
      if (!recipient || !isValidMrsAddress(recipient) || amountNanos <= 0 || feeNanos == null) return;
      if (!selfAddr) {
        tmaAlert(tr.alertNoActiveWallet);
        return;
      }
      const row = getActiveWalletRow();
      const pk = row ? getPrivateKeyBase64ForRow(row) : null;
      if (!pk) {
        tmaAlert(tr.alertNoSigningKey);
        return;
      }
      let availNanos = parseMrsToBigIntNanos(
        readBalanceCache(selfAddr)?.available ?? "0",
      );
      await fetchWalletBalanceMrs(walletNodeBase(), selfAddr);
      availNanos = parseMrsToBigIntNanos(readBalanceCache(selfAddr)?.available ?? "0");
      const needNanos = BigInt(amountNanos) + BigInt(feeNanos);
      if (availNanos < needNanos) {
        tmaAlert(
          tr.sendInsufficientAvailable(
            formatMrsFromBigIntNanos(availNanos),
            formatMrsFromBigIntNanos(needNanos),
          ),
        );
        return;
      }
      const tx = buildSendTransaction(selfAddr, recipient, amountNanos, feeNanos, pk);
      if (!tx) {
        tmaAlert(tr.alertTxSignFailed);
        return;
      }
      removeTmaModal();
      tmaAlert(tr.sendSending);
      const res = await submitTransaction(walletNodeBase(), tx);
      if (!res.ok && res.reason?.includes("Insufficient available balance")) {
        tmaAlert(tr.sendInsufficientAvailableHint);
        return;
      }
      if (!res.ok) {
        tmaAlert(res.message);
        return;
      }
      tmaAlert(tr.sendSent);
      clearBalanceCaches([selfAddr, recipient].filter(Boolean));
      void refreshBalancesAfterActivity(true);
    })();
  });
}

function cardHead(title: string): string {
  return `<div class="card-head"><span class="card-head-title">${escapeAttr(title)}</span></div>`;
}

const INITIAL_TARGET_COMPACT = 0x207fffffn;

function compactToTarget(compact: bigint): bigint {
  const nSize = Number((compact >> 24n) & 0xffn);
  const nWord = compact & 0x7fffffn;
  if (nSize <= 3) {
    return nWord >> BigInt(8 * (3 - nSize));
  }
  return nWord << BigInt(8 * (nSize - 3));
}

/** Same as Android `DifficultyDisplay.formatCompactBits`. */
function formatCompactBits(bits: number | undefined): string {
  if (bits == null || !Number.isFinite(bits)) return "2";
  const compact = BigInt(bits >>> 0);
  const target = compactToTarget(compact);
  if (target <= 0n) return "—";
  const initialTarget = compactToTarget(INITIAL_TARGET_COMPACT);
  if (initialTarget <= 0n) return "—";
  let ratio: number;
  try {
    ratio = Number(initialTarget * 1000000n / target) / 1e6;
  } catch {
    return "—";
  }
  if (!Number.isFinite(ratio) || ratio === 0) return "—";
  const displayValue = 2.0 * ratio;
  if (displayValue >= 1e9) return "×>1e9";
  if (displayValue >= 1e6) return `×${(displayValue / 1e6).toFixed(1)}e6`;
  if (displayValue >= 1e3) return `×${(displayValue / 1e3).toFixed(1)}k`;
  if (displayValue >= 1.95 && displayValue <= 2.05) return "2";
  if (displayValue >= 1.0) return `×${displayValue.toFixed(2)}`;
  return `×${displayValue.toFixed(2)}`;
}

const HEADER_STATS_SVG = `<svg class="top-stat-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 9.2h3V19H5V9.2zm5.6-4.2h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/></svg>`;
function ensureTelegramMock(): void {
  if (window.Telegram?.WebApp) return;
  window.Telegram = {
    WebApp: {
      ready: () => {},
      expand: () => {},
      showAlert: (msg: string) => {
        tmaAlert(msg);
      },
      initData: "",
      initDataUnsafe: { user: { language_code: "en" } },
      themeParams: {},
    },
  };
}

/** Fixed Marsa palette (Android colors.xml) — do not override from Telegram themeParams. */
function applyMarsaBrandCss(): void {
  const s = document.documentElement.style;
  s.setProperty("--bg", "#000000");
  s.setProperty("--bar", "#1c1c1e");
  s.setProperty("--card", "#1c1c1e");
  s.setProperty("--card-border", "#2c2c2e");
  s.setProperty("--text", "#ffffff");
  s.setProperty("--muted", "#8e8e93");
  s.setProperty("--label-secondary", "#8e8e93");
  s.setProperty("--input-bg", "#0d0d0d");
  s.setProperty("--btn-fill", "#bc5a2b");
  s.setProperty("--accent-text", "#ff9500");
  s.setProperty("--btn-secondary-bg", "#2c2c2e");
  s.setProperty("--btn-secondary-border", "#3a3a3c");
}

function applyTelegramTheme(_loc: Locale): void {
  applyMarsaBrandCss();
  syncTelegramWebApp();
}

function parseAddrTxIndexReadyField(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return undefined;
}

function parseNodeInfo(json: string): NodeInfo {
  const o = JSON.parse(json) as Record<string, unknown>;
  const connected = Boolean(o.connected);
  const height = typeof o.height === "number" ? o.height : undefined;
  const target = typeof o.target === "number" ? o.target : undefined;
  const bitsRaw = o.bits ?? o.difficulty;
  const bits = typeof bitsRaw === "number" ? bitsRaw : bitsRaw != null ? Number(bitsRaw) : undefined;
  const difficulty = typeof o.difficulty === "number" ? o.difficulty : bits;
  const addrTxIndexReady = parseAddrTxIndexReadyField(o.addr_tx_index_ready);
  return {
    connected,
    height,
    target,
    bits: Number.isFinite(bits) ? bits : undefined,
    difficulty: Number.isFinite(difficulty) ? difficulty : undefined,
    addrTxIndexReady,
  };
}

function applyNodeStatusFromInfo(info: NodeInfo | null): void {
  setTxScanChainHeight(info?.height ?? 0);
  if (info?.addrTxIndexReady !== undefined) {
    setAddrTxIndexReady(info.addrTxIndexReady);
  }
}

export type TgGateErrorKey = "tgErrNetwork" | "tgErrHttp" | "tgErrConfig" | "tgErrOrigin" | "tgOnlyRequired";

export type TgGateState =
  | { kind: "skipped" }
  | { kind: "loading" }
  | { kind: "ok"; user?: unknown }
  | { kind: "error"; key: TgGateErrorKey };

type BalState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; balance: string; available?: string; address: string }
  | { kind: "err"; msg: string };

type TxState = { kind: "idle" } | { kind: "loading" } | { kind: "ok"; rows: TxRow[] } | { kind: "err"; msg: string };

type MiningStatsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; activeMiners: number; totalMiners: number }
  | { kind: "err"; msg: string };

let telegramGate: TgGateState = { kind: "skipped" };
let lastNodeInfo: NodeInfo | null = null;
let lastNodeErr: string | null = null;
function readWalletViewAddressFromStorage(): string {
  try {
    const v = localStorage.getItem(WALLET_VIEW_LS)?.trim();
    if (v) return v;
    return localStorage.getItem(WALLET_LS)?.trim() ?? "";
  } catch {
    return "";
  }
}

let walletViewAddress =
  typeof localStorage !== "undefined" ? readWalletViewAddressFromStorage() : "";
let balState: BalState = { kind: "idle" };
let txState: TxState = { kind: "idle" };
/** Address for which `txState` rows are valid (wallet tab). */
let txStateAddress = "";
let miningStatsState: MiningStatsState = { kind: "idle" };

type MiningState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "err"; msg: string }
  | { kind: "ok"; data: MiningInfoPayload };

let miningState: MiningState = { kind: "idle" };
let activePoolBind: PoolBindInfo | null = null;
let activePoolMembership: PoolMembership = {
  bind: null,
  member: null,
  active: false,
  poolId: null,
};

/** Per-wallet mining_info — survives tab switches and refresh. */
const miningInfoByAddr = new Map<string, MiningInfoPayload>();
let cachedMiningInfo: MiningInfoPayload | null = null;
let cachedMiningInfoAddr = "";

function miningInfoCacheKey(addr: string): string {
  return addr.trim().toLowerCase();
}

function syncPoolsListActivePool(addr: string, poolId: number): void {
  const snap = getPoolsListSnapshot();
  const key = poolsWalletKey(addr);
  if (snap && snap.walletKey === key) {
    setPoolsListSnapshot({ ...snap, activePoolId: poolId, chosenId: poolId });
  }
}

function syncPoolsListAfterLeave(addr: string): void {
  resetPoolWalletAfterLeave(addr);
  clearPoolsListActiveMembership(addr);
  clearPoolUiCache();
}

function storeMiningInfoForAddr(addr: string, data: MiningInfoPayload): void {
  const key = miningInfoCacheKey(addr);
  if (!key) return;
  miningInfoByAddr.set(key, data);
  cachedMiningInfo = data;
  cachedMiningInfoAddr = addr.trim();
}

function activeWalletAddress(): string {
  return getActiveAddress()?.trim() ?? "";
}

function currentWalletAddr(): string {
  return activeWalletAddress();
}

function persistWalletViewAddress(): void {
  try {
    const v = walletViewAddress.trim();
    if (v) localStorage.setItem(WALLET_VIEW_LS, v);
  } catch {
    /* ignore */
  }
}

function syncLegacyWalletLsFromActive(): void {
  const active = activeWalletAddress();
  if (!active) return;
  try {
    localStorage.setItem(WALLET_LS, active);
  } catch {
    /* ignore */
  }
}

function getMiningInfoSnapshot(): MiningInfoPayload | null {
  const addr = currentWalletAddr();
  if (!addr) return null;
  const key = miningInfoCacheKey(addr);
  const fromMap = miningInfoByAddr.get(key);
  if (fromMap) return fromMap;
  if (miningState.kind === "ok" && cachedMiningInfoAddr === addr) return miningState.data;
  if (cachedMiningInfo && cachedMiningInfoAddr === addr) return cachedMiningInfo;
  return null;
}

let lastDisplayedBalance: string | null = null;
/** Sum of all wallets (subtitle on wallet tab when multiple wallets). */
let allWalletsTotalMrs: string | null = null;
/** Balance shown on mining tab (selected wallet only). */
let miningBalanceMrs: string | null = null;
let miningBalanceLoading = false;

function formatBalanceForUi(): string {
  const viewAddr = walletViewAddress.trim();
  if (activeTab === "wallet" && viewAddr) {
    const c = readBalanceCache(viewAddr);
    if (c?.balance) {
      lastDisplayedBalance = c.balance;
      return escapeAttr(formatMrsBalanceDisplay(c.balance));
    }
  }
  if (balState.kind === "ok") {
    lastDisplayedBalance = balState.balance;
    return escapeAttr(formatMrsBalanceDisplay(balState.balance));
  }
  if (balState.kind === "loading") return "…";
  if (lastDisplayedBalance != null) {
    return escapeAttr(formatMrsBalanceDisplay(lastDisplayedBalance));
  }
  if (balState.kind === "err") return "—";
  const partial = totalBalanceFromCaches(allWalletAddresses(), false);
  if (partial != null) {
    lastDisplayedBalance = partial;
    return escapeAttr(formatMrsBalanceDisplay(partial));
  }
  if (balState.kind === "idle") return "…";
  return "…";
}

function walletBalanceAmountHtml(raw: string | undefined, loading: boolean): string {
  if (loading && !raw) return "…";
  if (!raw) return "—";
  return escapeAttr(formatMrsBalanceDisplay(raw));
}

function walletBalanceBlockHtml(tr: ReturnType<typeof t>): string {
  const addr = walletViewAddress.trim();
  const c = addr ? readBalanceCache(addr) : null;
  const walletBal =
    c?.balance ??
    (balState.kind === "ok" && balState.address === addr ? balState.balance : undefined);
  const loading =
    balState.kind === "loading" || (Boolean(addr) && !walletBal && balState.kind !== "err");

  const addrs = allWalletAddresses();
  const totalRaw = allWalletsTotalMrs ?? totalBalanceFromCaches(addrs, true) ?? walletBal;
  const totalAmt = walletBalanceHidden ? WALLET_BALANCE_MASK : walletBalanceAmountHtml(totalRaw ?? undefined, loading);

  return `
    <div class="wallet-bal-label-row">
      <div class="wallet-bal-label">${escapeAttr(tr.walletTotalBalanceLab)}</div>
      <button type="button" class="wallet-bal-toggle" id="walletBalanceToggle" aria-pressed="${walletBalanceHidden ? "true" : "false"}" aria-label="${walletBalanceHidden ? "Show balance" : "Hide balance"}">${walletBalanceHidden ? IC_EYE_CLOSED : IC_EYE_OPEN}</button>
    </div>
    <div class="wallet-bal-row">
      <span class="wallet-bal-num">${totalAmt}</span>
      <span class="wallet-bal-unit">MRS</span>
    </div>
  `;
}

let activeTab: TabId = loadActiveTab();
/** After bottom-nav tab change, scroll #tma-panel to top (survives follow-up renders). */
let tabScrollResetsLeft = 0;

function scrollMainTabPanelToTop(): void {
  const panel = document.getElementById("tma-panel");
  if (panel) panel.scrollTop = 0;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function consumeTabScrollReset(): void {
  if (tabScrollResetsLeft <= 0) return;
  scrollMainTabPanelToTop();
  tabScrollResetsLeft--;
}
let pendingMiningCoinFlip: { from: MiningMode; to: MiningMode } | null = null;

const MINING_POOL_FACE_HTML = `<span class="mining-circle-label mining-circle-label--pool">${miningCoinPoolIconHtml()}<span class="mining-circle-mrs">MRS</span></span>`;

let lastKnownChainHeight = 0;
let balanceRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let walletDashSeq = 0;
let walletTxBgSeq = 0;
let miningDashSeq = 0;
/** Last address whose balance was successfully fetched from the node on the Wallet tab. */
let lastWalletFetchedAddr = "";

function walletExistsInRows(address: string, rows: ReturnType<typeof loadWalletRows>): boolean {
  const a = address.trim();
  if (!a) return false;
  return rows.some((r) => r.address === a);
}

function ensureActiveWalletInStore(): void {
  const rows = loadWalletRows();
  const active = activeWalletAddress();
  if (active && walletExistsInRows(active, rows)) {
    syncLegacyWalletLsFromActive();
    return;
  }
  if (rows.length > 0) {
    setActiveAddress(rows[0]!.address);
    syncLegacyWalletLsFromActive();
  }
}

function ensureWalletViewAddress(): void {
  const rows = loadWalletRows();
  const view = walletViewAddress.trim();
  if (view && walletExistsInRows(view, rows)) return;
  const active = activeWalletAddress();
  if (active && walletExistsInRows(active, rows)) {
    walletViewAddress = active;
    persistWalletViewAddress();
    return;
  }
  if (rows.length > 0) {
    walletViewAddress = rows[0]!.address;
    persistWalletViewAddress();
  }
}

function prepareWalletTabContext(): void {
  ensureActiveWalletInStore();
  ensureWalletViewAddress();
}

function prepareMiningTabContext(): void {
  ensureActiveWalletInStore();
}

function resetWalletViewToActive(): void {
  const active = activeWalletAddress();
  if (!active) return;
  walletViewAddress = active;
  persistWalletViewAddress();
}

function teardownPoolsOverlays(): void {
  hidePoolDetailPage();
  hidePoolsPage();
  destroyPoolDetailPages();
  destroyPoolsPage();
}

async function validateInitDataWithServer(): Promise<TgGateState> {
  const initData = (window.Telegram?.WebApp?.initData ?? "").trim();
  if (!initData) return { kind: "skipped" };
  try {
    const r = await fetch("/telegram/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    let j: { ok?: boolean; user?: unknown; error?: string } = {};
    try {
      j = (await r.json()) as typeof j;
    } catch {
      return { kind: "error", key: "tgErrHttp" };
    }
    if (r.status === 403) return { kind: "error", key: "tgErrOrigin" };
    if (r.status === 503) return { kind: "error", key: "tgErrConfig" };
    if (!r.ok || !j.ok) return { kind: "error", key: "tgErrHttp" };
    return { kind: "ok", user: j.user };
  } catch {
    return { kind: "error", key: "tgErrNetwork" };
  }
}

/** Production: require real Telegram Mini App (initData + server validation). */
function isTelegramOnlyEnv(): boolean {
  const v = (import.meta.env.VITE_TELEGRAM_ONLY as string | undefined)?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return import.meta.env.PROD;
}

function hasTelegramInitData(): boolean {
  return Boolean((window.Telegram?.WebApp?.initData ?? "").trim());
}

async function waitForTelegramInitData(root: HTMLElement, maxMs = 12000): Promise<boolean> {
  if (hasTelegramInitData()) return true;

  const started = Date.now();
  renderTelegramAccessDenied(root, { kind: "loading" });
  while (Date.now() - started < maxMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    if (hasTelegramInitData()) return true;
  }
  return hasTelegramInitData();
}

function renderTelegramAccessDenied(root: HTMLElement, gate: TgGateState): void {
  const tr = t();
  const detail =
    gate.kind === "error" && gate.key === "tgOnlyRequired"
      ? tr.tgOnlyBody
      : gate.kind === "error"
        ? tr[gate.key]
        : gate.kind === "loading"
          ? tr.tgLoading
          : tr.tgOnlyBody;
  const title = gate.kind === "error" && gate.key === "tgOnlyRequired" ? tr.tgOnlyTitle : tr.tgTitle;
  root.innerHTML = `
    <div class="tma-boot-err tma-tg-only">
      <img src="/logo.png" width="72" height="72" alt="" decoding="async" />
      <h1 class="tma-boot-err-title">${escapeAttr(title)}</h1>
      <p class="tma-boot-err-desc">${escapeAttr(detail)}</p>
    </div>
  `;
}

async function enforceTelegramAccess(root: HTMLElement): Promise<boolean> {
  if (!isTelegramOnlyEnv()) return true;
  const ready = await waitForTelegramInitData(root);
  if (!ready) {
    renderTelegramAccessDenied(root, { kind: "error", key: "tgOnlyRequired" });
    return false;
  }
  const requireServer =
    (import.meta.env.VITE_TELEGRAM_VALIDATE as string | undefined)?.trim().toLowerCase() === "true";
  if (!requireServer) {
    telegramGate = { kind: "ok" };
    return true;
  }
  renderTelegramAccessDenied(root, { kind: "loading" });
  telegramGate = await validateInitDataWithServer();
  if (telegramGate.kind === "ok") return true;
  if (telegramGate.kind === "error" && telegramGate.key === "tgErrNetwork") {
    telegramGate = { kind: "ok" };
    return true;
  }
  renderTelegramAccessDenied(root, telegramGate);
  return false;
}

function tgSummaryHtml(tr: ReturnType<typeof t>, gate: TgGateState): string {
  if (gate.kind === "skipped") {
    return `<p class="hint hint-tight">${tr.tgSkipped}</p>`;
  }
  if (gate.kind === "loading") {
    return `<p class="hint hint-tight">${tr.tgLoading}</p>`;
  }
  if (gate.kind === "ok") {
    const uid =
      gate.user &&
      typeof gate.user === "object" &&
      "id" in gate.user &&
      typeof (gate.user as { id: unknown }).id === "number"
        ? String((gate.user as { id: number }).id)
        : "—";
    return `
      <div class="row"><span class="label">${tr.tgResultLabel}</span><span class="value ok">${tr.tgOk}</span></div>
      <div class="row"><span class="label">${tr.tgUser}</span><span class="value mono">${escapeAttr(uid)}</span></div>
    `;
  }
  return `<p class="hint hint-tight">${escapeAttr(tr[gate.key])}</p>`;
}

function formatMiningBalanceForUi(): string {
  if (miningBalanceLoading) return "…";
  if (miningBalanceMrs != null) {
    return escapeAttr(formatMrsBalanceDisplay(miningBalanceMrs));
  }
  const addr = activeWalletAddress();
  if (addr) {
    const cached = readBalanceCache(addr);
    if (cached) return escapeAttr(formatMrsBalanceDisplay(cached.balance));
  }
  return addr ? "…" : "0";
}

async function refreshMiningWalletBalance(addr: string, forceNetwork: boolean, soft = false): Promise<void> {
  const trimmed = addr.trim();
  if (!trimmed) {
    miningBalanceMrs = null;
    miningBalanceLoading = false;
    return;
  }
  const cached = readBalanceCache(trimmed);
  if (!forceNetwork && cached && !isBalanceCacheStale(trimmed)) {
    miningBalanceMrs = cached.balance;
    miningBalanceLoading = false;
    return;
  }
  if (!soft) miningBalanceLoading = true;
  const fetched = await fetchWalletBalanceMrs(walletNodeBase(), trimmed);
  miningBalanceLoading = false;
  miningBalanceMrs = fetched ?? cached?.balance ?? null;
}

function miningTopCardHtml(tr: ReturnType<typeof t>): string {
  const balMain = formatMiningBalanceForUi();
  const h =
    lastNodeInfo?.connected && lastNodeInfo.height != null ? String(lastNodeInfo.height) : lastNodeErr ? "—" : "…";
  const miners =
    miningStatsState.kind === "ok"
      ? String(miningStatsState.activeMiners)
      : miningStatsState.kind === "loading"
        ? "…"
        : "—";
  const bits = lastNodeInfo?.bits ?? lastNodeInfo?.difficulty;
  const diffStr = formatCompactBits(bits);
  return `
    <div class="card mining-top-card">
      <div class="mining-top-row">
        <div class="mining-top-left">
          <div class="mining-total-balance-lab">${escapeAttr(tr.miningTotalBalance)}</div>
          <div class="mining-balance-mrs">
            <span class="mining-balance-num">${balMain}</span>
            <span class="mining-balance-unit">MRS</span>
          </div>
        </div>
        <div class="mining-top-right">
          <div class="mining-stat-row">
            <span class="mining-stat-lab">${escapeAttr(tr.miningTotalBlocks)}</span>
            <span class="mining-stat-val">${escapeAttr(h)}</span>
          </div>
          <div class="mining-stat-row">
            <span class="mining-stat-lab">${escapeAttr(tr.miningActiveMiners)}</span>
            <span class="mining-stat-val">${escapeAttr(miners)}</span>
          </div>
          <div class="mining-stat-row">
            <span class="mining-stat-lab">${escapeAttr(tr.miningDifficulty)}</span>
            <span class="mining-stat-val">${escapeAttr(diffStr)}</span>
          </div>
        </div>
      </div>
      ${lastNodeErr ? `<p class="hint hint-tight">${escapeAttr(lastNodeErr)}</p>` : ""}
    </div>
  `;
}

function miningStakeBlockHtml(tr: ReturnType<typeof t>): string {
  if (!activeWalletAddress()) {
    return `<div class="card mining-stake-card"><p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(tr.miningWalletHint)}</span></p></div>`;
  }
  if (miningState.kind === "loading") {
    return `<div class="card mining-stake-card"><p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(tr.miningLoading)}</span></p></div>`;
  }
  const snapshot = getMiningInfoSnapshot();
  const d = miningState.kind === "ok" ? miningState.data : snapshot;
  if (miningState.kind === "err" && !d) {
    return `<div class="card mining-stake-card"><p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(miningState.msg)}</span></p></div>`;
  }
  if (miningState.kind === "idle" && !d) {
    return `<div class="card mining-stake-card"><p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(tr.miningInfoWaiting)}</span></p></div>`;
  }
  if (!d) {
    return `<div class="card mining-stake-card"><p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(tr.miningInfoWaiting)}</span></p></div>`;
  }
  const parts: string[] = [];
  if (miningState.kind === "err") {
    parts.push(
      `<p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(miningState.msg)}</span></p>`,
    );
  }
  const poolMode = getMiningMode() === "pool";
  const hasActiveStake = miningInfoHasActiveStake(d);
  const isPoolStake = miningInfoIsPoolStake(d);
  const poolBindActive =
    activePoolMembership.active ||
    hasActivePoolBind(activePoolMembership.bind ?? activePoolBind) ||
    d.pool_bind_active === true;
  const soloStakeOnly = hasActiveStake && !isPoolStake && !poolBindActive;
  const hasPoolStake = hasActiveStake && (isPoolStake || poolBindActive);

  if ((poolMode && soloStakeOnly) || (!poolMode && hasPoolStake)) {
    parts.push(
      `<p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(tr.miningStakePoolSoloConflict)}</span></p>`,
    );
  } else if (poolMode && !hasPoolStake) {
    parts.push(
      `<p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(tr.miningStakeNoPoolStakeTx)}</span></p>`,
    );
  } else if (!hasActiveStake) {
    parts.push(
      `<p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(tr.miningStakeLab)}</span><span class="mining-stake-val">${escapeAttr(tr.miningStakeNotActive)}</span></p>`,
    );
  } else {
    const staked = d.staked_amount_formatted ?? "0";
    parts.push(
      `<p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(tr.miningStakeLab)}</span><span class="mining-stake-val">${escapeAttr(staked)} MRS</span></p>`,
    );
    if (d.freeze_cost_formatted) {
      parts.push(
        `<p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(tr.miningCreditPerHash)}</span><span class="mining-stake-val">${escapeAttr(d.freeze_cost_formatted)} MRS</span></p>`,
      );
    }
    const minUn = d.min_unstake_block ?? 0;
    const until = d.blocks_until_can_unstake ?? 0;
    const curH = d.current_height ?? 0;
    const inferredBlock = minUn > 0 ? minUn : until > 0 ? curH + until : 0;
    const unstakeLab = poolMode ? tr.miningPoolUnstakeLab : tr.miningUnstakeLab;
    const unstakeAvail = poolMode ? tr.miningPoolUnstakeAvail : tr.miningUnstakeAvail;
    if (d.can_unstake === true) {
      parts.push(
        `<p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(unstakeLab)}</span><span class="mining-stake-val">${escapeAttr(tr.miningUnstakeNow)}</span></p>`,
      );
    } else if (inferredBlock > 0) {
      parts.push(
        `<p class="mining-stake-line"><span class="mining-stake-muted">${escapeAttr(unstakeAvail)}</span><span class="mining-stake-val">${inferredBlock}</span></p>`,
      );
    }
  }
  return `<div class="card mining-stake-card">${parts.join("")}</div>`;
}

function miningModeBarHtml(tr: ReturnType<typeof t>): string {
  const mode = getMiningMode();
  const cls = mode === "pool" ? "mining-mode-switch--pool" : "mining-mode-switch--solo";
  const poolLabActive = mode === "pool" ? " mining-mode-lab--active" : "";
  const soloLabActive = mode === "solo" ? " mining-mode-lab--active" : "";
  return `
    <div class="mining-mode-bar" id="tmaMiningModeBar">
      <div class="mining-mode-row">
        <span class="mining-mode-lab mining-mode-lab--pool${poolLabActive}">${escapeAttr(tr.miningModePool)}</span>
        <button type="button" class="mining-mode-switch ${cls}" id="tmaMiningModeSwitch" role="switch" aria-checked="${mode === "pool" ? "true" : "false"}" aria-label="${escapeAttr(tr.miningModeAria)}">
          <span class="mining-mode-end mining-mode-end--left">${togglePoolIconHtml()}</span>
          <span class="mining-mode-track" aria-hidden="true"><span class="mining-mode-knob"></span></span>
          <span class="mining-mode-end mining-mode-end--right">${toggleSoloIconHtml()}</span>
        </button>
        <span class="mining-mode-lab mining-mode-lab--solo${soloLabActive}">${escapeAttr(tr.miningModeSolo)}</span>
      </div>
    </div>
  `;
}

function miningCircleBlockHtml(tr: ReturnType<typeof t>): string {
  const mode = getMiningMode();
  const hasAddr = Boolean(activeWalletAddress());
  const addr = activeWalletAddress();
  const snapshot = getMiningInfoSnapshot();
  const d = miningState.kind === "ok" ? miningState.data : snapshot;
  const poolMembership =
    activePoolMembership ??
    ({ bind: null, member: null, active: false, poolId: null } satisfies PoolMembership);
  const poolBind = poolMembership.bind ?? activePoolBind;
  const onChainPoolId = activePoolIdFromChain(poolBind, poolMembership.member);
  const poolActive = isOnChainPoolMember(poolMembership) || hasActivePoolBind(poolBind);
  const poolPending = hasAddr && isPoolStakePending(addr);
  const soloBlocksPool = hasSoloMinerStakeOnly(d, poolMembership, poolPending);
  const orphanPoolStake = hasOrphanPoolStake(d, poolMembership, poolPending);
  const poolMemberBlocksSolo = !poolPending && poolActive && onChainPoolId != null;
  const boundPoolDisplayName =
    onChainPoolId != null ? localizedPoolName(onChainPoolId, `Pool ${onChainPoolId + 1}`) : "";
  const hasStake = miningInfoHasActiveStake(d);
  const creditsLeft = d ? miningNum(d.available_credits) : 0;
  const totalCr = d ? miningNum(d.total_credits_per_window) : 0;
  const blocksUntilRefill = d ? miningNum(d.blocks_until_refill) : 0;
  const stakeKnown = Boolean(d);
  const stakeInfoReady = Boolean(snapshot);

  let canMine = false;
  let dim = false;
  let showCreate = false;
  let showBlocked = false;
  let showOrphanPool = false;
  let showWalletInPool = false;
  let showChoosePool = false;
  let showWrongPoolBind = false;
  let wrongPoolBindMsg = "";
  let poolSelectHint = "";
  let createBtnText = tr.miningCreateStakeBtn;
  const poolChosen = hasAddr ? hasChosenPoolForStake(addr) : false;
  const chosenPoolId = hasAddr ? getChosenPoolId(addr) : null;
  const boundPoolId =
    poolActive && onChainPoolId != null ? onChainPoolId : null;
  const poolChoiceMismatch =
    mode === "pool" &&
    poolActive &&
    chosenPoolId != null &&
    boundPoolId != null &&
    chosenPoolId !== boundPoolId;
  const coinDisplayMode = pendingMiningCoinFlip?.from ?? mode;
  const coinPoolClass = coinDisplayMode === "pool" ? " is-pool" : "";
  let refillLine = "";

  if (mode === "pool") {
    if (soloBlocksPool) {
      showBlocked = true;
      dim = true;
      refillLine = "";
    } else if (orphanPoolStake) {
      showOrphanPool = true;
      dim = true;
      showCreate =
        hasAddr &&
        (stakeInfoReady || miningState.kind === "ok" || miningState.kind === "err" || miningState.kind === "idle");
      createBtnText = tr.miningCreatePoolStakeBtn;
      refillLine = "";
    } else if (poolPending && !poolActive) {
      dim = true;
      refillLine = tr.poolStakeSent;
    } else if (!poolActive) {
      dim = hasAddr && stakeKnown;
      if (!poolChosen) {
        showChoosePool =
          hasAddr &&
          (stakeInfoReady || miningState.kind === "ok" || miningState.kind === "err" || miningState.kind === "idle");
        poolSelectHint = showChoosePool ? tr.miningSelectPoolFirst : "";
      } else if (!hasStake && !poolPending) {
        showCreate =
          hasAddr &&
          (stakeInfoReady || miningState.kind === "ok" || miningState.kind === "err" || miningState.kind === "idle");
        createBtnText = tr.miningCreatePoolStakeBtn;
      } else if (poolPending) {
        /* refillLine set above */
      } else if (hasAddr && stakeKnown) {
        refillLine = tr.miningTapNoPoolStake;
      }
    } else if (poolChoiceMismatch) {
      canMine = false;
      dim = true;
      showWrongPoolBind = true;
      const boundName = localizedPoolName(boundPoolId!, `Pool ${boundPoolId! + 1}`);
      wrongPoolBindMsg = tr.miningWalletBoundOtherPool(boundName);
    } else {
      canMine = canMineInPoolMode(d, poolMembership) && hasAddr;
      dim = hasAddr && hasStake && !canMine;
      if (hasStake && creditsLeft <= 0) {
        refillLine = tr.miningWaitRefill(blocksUntilRefill, blocksUntilRefill * 15);
      }
    }
  } else {
    if (poolMemberBlocksSolo) {
      showWalletInPool = true;
      dim = true;
      canMine = false;
      refillLine = "";
    } else if (orphanPoolStake) {
      dim = true;
      canMine = false;
      refillLine = tr.miningOrphanPoolStakeLine1;
    } else if (miningInfoIsPoolStake(d)) {
      dim = true;
      canMine = false;
      refillLine = tr.miningSwitchToPoolMode;
    } else {
      canMine = canMineInSoloMode(d, poolMembership) && hasAddr;
      dim = hasAddr && !hasStake && stakeKnown;
      showCreate =
        hasAddr &&
        !hasStake &&
        !poolActive &&
        (stakeInfoReady || miningState.kind === "ok" || miningState.kind === "err" || miningState.kind === "idle");
      if (hasStake && d && creditsLeft <= 0) {
        refillLine = tr.miningWaitRefill(blocksUntilRefill, blocksUntilRefill * 15);
      } else if (!hasStake && hasAddr && stakeKnown) {
        refillLine = tr.miningCreateStakeHint;
      } else if (!hasAddr) {
        refillLine = tr.miningNoWalletHint;
      } else if (miningState.kind === "err") {
        refillLine = tr.miningCreateStakeHint;
      }
    }
  }

  const creditsLine =
    hasStake && d
      ? `<p class="mining-credits-txt"><span class="mining-stake-muted">${escapeAttr(tr.miningCreditsLab)}</span><span class="mining-stake-val">${creditsLeft} / ${totalCr}</span></p>`
      : "";
  const deferOverlays = Boolean(pendingMiningCoinFlip);
  let overlayDim = dim;
  let overlayBlocked = showBlocked;
  let overlayOrphanPool = showOrphanPool;
  let overlayWalletInPool = showWalletInPool;
  let overlayCreate = showCreate;
  let overlayChoosePool = showChoosePool;
  let overlayWrongPoolBind = showWrongPoolBind;
  let overlayWrongPoolBindMsg = wrongPoolBindMsg;
  let overlayPoolHint = poolSelectHint;
  let overlayRefill = refillLine;
  if (deferOverlays) {
    overlayDim = false;
    overlayBlocked = false;
    overlayOrphanPool = false;
    overlayWalletInPool = false;
    overlayCreate = false;
    overlayChoosePool = false;
    overlayWrongPoolBind = false;
    overlayWrongPoolBindMsg = "";
    overlayPoolHint = "";
    overlayRefill = "";
  }

  const poolHintHtml = overlayPoolHint
    ? `<p class="mining-refill-txt mining-pool-select-hint">${escapeAttr(overlayPoolHint)}</p>`
    : "";
  const refillHtml = overlayRefill ? `<p class="mining-refill-txt">${escapeAttr(overlayRefill)}</p>` : "";
  const wrapFlipClass = deferOverlays ? " mining-glow-wrap--flip-active" : "";

  return `
    ${poolHintHtml}
    <div class="mining-glow-wrap${wrapFlipClass}">
      <div class="mining-glow-ring" aria-hidden="true"></div>
      <div class="mining-coin-scene" id="tmaMiningCoinScene">
        <button type="button" class="mining-circle-btn mining-coin-btn" id="tmaMiningTap" ${canMine ? "" : "disabled"}>
          <div class="mining-coin-inner${coinPoolClass}" id="tmaMiningCoinInner">
            <div class="mining-coin-face mining-coin-face--solo" aria-hidden="${mode === "pool" ? "true" : "false"}">MRS</div>
            <div class="mining-coin-face mining-coin-face--pool" aria-hidden="${mode === "solo" ? "true" : "false"}">${MINING_POOL_FACE_HTML}</div>
          </div>
        </button>
      </div>
      <svg class="mining-progress-ring" id="tmaMiningProgress" viewBox="0 0 100 100" aria-hidden="true" style="display:none">
        <circle class="mining-progress-track" cx="50" cy="50" r="47" fill="none"/>
        <circle id="tmaMiningProgressFill" class="mining-progress-fill" cx="50" cy="50" r="47" fill="none" transform="rotate(-90 50 50)"/>
      </svg>
      <div class="mining-circle-dim" style="display:${overlayDim ? "flex" : "none"}"></div>
      <button type="button" class="mining-create-stake-btn mining-create-stake-btn--message mining-create-stake-btn--locked" id="tmaPoolBlocked" style="display:${overlayBlocked ? "inline-flex" : "none"}">${miningUnstakeHintBtnHtml(escapeAttr, tr)}</button>
      <button type="button" class="mining-create-stake-btn mining-create-stake-btn--message mining-create-stake-btn--locked" id="tmaOrphanPool" style="display:${overlayOrphanPool ? "inline-flex" : "none"}">${miningOrphanPoolHintBtnHtml(escapeAttr, tr)}</button>
      <button type="button" class="mining-create-stake-btn mining-create-stake-btn--message mining-create-stake-btn--locked" id="tmaWalletInPool" style="display:${overlayWalletInPool ? "inline-flex" : "none"}">${poolMemberBlocksSolo && boundPoolDisplayName ? miningWalletInPoolHintBtnHtml(escapeAttr, tr, boundPoolDisplayName) : ""}</button>
      <button type="button" class="mining-create-stake-btn mining-create-stake-btn--message mining-create-stake-btn--locked" id="tmaPoolWrongBind" style="display:${overlayWrongPoolBind ? "inline-flex" : "none"}">${escapeAttr(overlayWrongPoolBindMsg)}</button>
      <button type="button" class="mining-create-stake-btn mining-create-stake-btn--wide" id="tmaChoosePool" style="display:${overlayChoosePool ? "inline-flex" : "none"}">${escapeAttr(tr.miningChoosePoolBtn)}</button>
      <button type="button" class="mining-create-stake-btn mining-create-stake-btn--wide" id="tmaCreateStake" style="display:${overlayCreate ? "inline-flex" : "none"}">${escapeAttr(createBtnText)}</button>
    </div>
    ${creditsLine}
    ${refillHtml}
  `;
}

function openMiningPoolsPage(root: HTMLElement): void {
  void openMiningPoolsPageAsync(root);
}

async function openMiningPoolsPageAsync(root: HTMLElement): Promise<void> {
  prepareMiningTabContext();
  const addr = activeWalletAddress();
  clearPoolBindCache();
  clearPoolUiCache();
  destroyPoolDetailPages();
  destroyPoolsPage();
  if (addr) {
    activePoolMembership = await refreshPoolMembershipForAddress(miningNodeBase(), addr);
    activePoolBind = activePoolMembership.bind;
  } else {
    activePoolMembership = { bind: null, member: null, active: false, poolId: null };
    activePoolBind = null;
  }

  const openList = () => {
    hidePoolDetailPage();
    mountPoolsPage({
      escapeAttr,
      miningNodeBase: miningNodeBase(),
      readNodeBase: readNodeBase(),
      walletAddress: addr,
      tmaAlert,
      onClose: () => {
        hidePoolDetailPage();
        unmountPoolsPage();
        render(root);
      },
      onOpenPool: (poolId, pool) => openPoolDetail(poolId, pool),
    });
  };

  const openPoolDetail = (poolId: number, pool: PoolCatalogWithStats) => {
    const activePoolId = activePoolMembership.active ? activePoolMembership.poolId : null;
    mountPoolDetailPage({
      escapeAttr,
      miningNodeBase: miningNodeBase(),
      readNodeBase: readNodeBase(),
      walletAddress: addr,
      poolId,
      activePoolIdOnChain: activePoolId,
      poolFallback: pool,
      tmaAlert,
      onBack: openList,
      onSelectForMining: () => {
        setMiningMode("pool");
        void refreshMiningDashboard({ background: true });
      },
      onPoolLeft: () => {
        syncPoolsListAfterLeave(addr);
        destroyPoolDetailPages();
        setMiningMode("solo");
        void refreshMiningDashboard();
      },
    });
  };

  openList();
}

function miningScreenHtml(tr: ReturnType<typeof t>): string {
  return `${miningTopCardHtml(tr)}${miningStakeBlockHtml(tr)}${miningCircleBlockHtml(tr)}${miningModeBarHtml(tr)}`;
}

const WALLET_ICO_SW = 'stroke-width="2.5"';
const IC_WALLET_SEND = `<svg class="wallet-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ${WALLET_ICO_SW} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>`;
const IC_WALLET_RECV = `<svg class="wallet-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ${WALLET_ICO_SW} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 7 7 17M17 17H7V7"/></svg>`;
const IC_WALLET_HIST = `<svg class="wallet-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ${WALLET_ICO_SW} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/></svg>`;
const IC_WALLET_IMPORT = `<svg class="wallet-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ${WALLET_ICO_SW} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 21h16"/></svg>`;
const IC_WALLET_MULTI = `<svg class="wallet-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ${WALLET_ICO_SW} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>`;
const IC_WALLET_PLUS = `<svg class="wallet-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ${WALLET_ICO_SW} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`;
const IC_WALLET_SET = `<svg class="wallet-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">${IC_GEAR_FILL}</svg>`;

function walletActionCell(btnId: string, iconSvg: string, label: string): string {
  return `<div class="wallet-action-cell"><button type="button" class="wallet-action-btn" id="${escapeAttr(btnId)}" aria-label="${escapeAttr(label)}">${iconSvg}</button><span class="wallet-action-lab">${escapeAttr(label)}</span></div>`;
}

function walletTxRowsHtml(tr: ReturnType<typeof t>, rows: TxRow[]): string {
  return rows
    .map((r) =>
      txRowHtml(r, {
        escapeAttr,
        amountLabel: tr.txAmount,
        blockLabel: tr.txBlock,
        fromLabel: tr.txFrom,
        toLabel: tr.txTo,
        miningLabel: tr.txKindMining,
        hashLabel: tr.txHash,
        kindLabel: txKindLabelForUi,
      }),
    )
    .join("");
}

function txKindLabelForUi(kind: TxDisplayKind): string {
  const tr = t();
  switch (kind) {
    case "send":
      return tr.txKindSent;
    case "receive":
      return tr.txKindReceived;
    case "mining":
      return tr.txKindMining;
    case "miner_stake":
      return tr.txKindMinerStake;
    case "miner_unstake":
      return tr.txKindMinerUnstake;
    case "miner_pool_stake":
      return tr.txKindMinerPoolStake;
    case "miner_pool_unstake":
      return tr.txKindMinerPoolUnstake;
    case "validator_reward":
      return tr.txKindValidatorReward;
    case "stake":
      return tr.txKindStake;
    case "unstake":
      return tr.txKindUnstake;
    case "coinbase":
      return tr.txKindCoinbase;
    default:
      return tr.txKindReceived;
  }
}

function walletTxBodyHtml(tr: ReturnType<typeof t>): string {
  const addr = walletViewAddress.trim();
  if (!addr) return `<p class="wallet-no-tx">${escapeAttr(tr.txEmpty)}</p>`;
  if (txState.kind === "ok" && txStateAddress !== addr) {
    return `<p class="wallet-no-tx">${escapeAttr(tr.txLoading)}</p>`;
  }
  if (txState.kind === "idle") return `<p class="wallet-no-tx">${escapeAttr(tr.txEmpty)}</p>`;
  if (txState.kind === "loading") return `<p class="wallet-no-tx">${escapeAttr(tr.txLoading)}</p>`;
  if (txState.kind === "err") return `<p class="wallet-no-tx">${escapeAttr(txState.msg)}</p>`;
  if (txState.kind !== "ok" || txState.rows.length === 0) {
    return `<p class="wallet-no-tx">${escapeAttr(tr.walletNoTx)}</p>`;
  }
  const visible = txState.rows.slice(0, walletTxVisibleCount);
  const more =
    walletTxVisibleCount < txState.rows.length
      ? `<p class="wallet-tx-more" id="walletTxMore">${escapeAttr(tr.walletScrollMore)}</p>`
      : "";
  return `<div class="wallet-tx-scroll" id="walletTxScroll"><div class="wallet-tx-list" id="walletTxList">${walletTxRowsHtml(tr, visible)}</div>${more}</div>`;
}

function repaintWalletTxList(tr: ReturnType<typeof t>): void {
  if (txState.kind !== "ok") return;
  const list = document.getElementById("walletTxList");
  if (!list) return;
  const panel = document.getElementById("tma-panel");
  const scrollTop = panel?.scrollTop ?? 0;
  list.innerHTML = walletTxRowsHtml(tr, txState.rows.slice(0, walletTxVisibleCount));
  const moreEl = document.getElementById("walletTxMore");
  if (txState.rows.length > walletTxVisibleCount) {
    if (!moreEl) {
      const scroll = document.getElementById("walletTxScroll");
      const p = document.createElement("p");
      p.id = "walletTxMore";
      p.className = "wallet-tx-more";
      p.textContent = tr.walletScrollMore;
      scroll?.appendChild(p);
    }
  } else {
    moreEl?.remove();
  }
  if (panel && scrollTop > 0) {
    requestAnimationFrame(() => {
      panel.scrollTop = scrollTop;
    });
  }
}

function bindWalletTxInfiniteScroll(tr: ReturnType<typeof t>): void {
  unbindWalletTxScroll?.();
  unbindWalletTxScroll = null;
  const scroll = document.getElementById("tma-panel");
  if (!scroll || !document.getElementById("walletTxList")) return;
  unbindWalletTxScroll = bindTxListScrollLoadMore(scroll, () => {
    void loadMoreWalletTx(tr);
  });
}

async function loadMoreWalletTx(tr: ReturnType<typeof t>): Promise<void> {
  if (txState.kind !== "ok" || walletTxLoadingMore) return;
  if (walletTxVisibleCount < txState.rows.length) {
    walletTxVisibleCount = Math.min(walletTxVisibleCount + TX_UI_PAGE_SIZE, txState.rows.length);
    repaintWalletTxList(tr);
    return;
  }
  const addr = walletViewAddress.trim();
  if (!addr) return;
  walletTxLoadingMore = true;
  const root = document.getElementById("app");
  try {
    const res = await fetchWalletTxNextPage(walletNodeBase(), addr);
    walletTxVisibleCount = Math.min(walletTxVisibleCount + TX_UI_PAGE_SIZE, res.rows.length);
    txState = { kind: "ok", rows: res.rows };
    txStateAddress = addr;
    if (root && activeTab === "wallet") {
      root.querySelector("#walletTxList") ? repaintWalletTxList(tr) : render(root);
    }
  } catch {
    /* keep current list */
  } finally {
    walletTxLoadingMore = false;
  }
}

function balanceCardHtml(tr: ReturnType<typeof t>, hasWalletTx: boolean): string {
  if (!hasWalletTx) {
    return `<p class="hint">${escapeAttr(t().kmpMissing)}</p>`;
  }
  const balBlock = walletBalanceBlockHtml(tr);
  const balErr = balState.kind === "err" ? `<p class="wallet-bal-err">${escapeAttr(balState.msg)}</p>` : "";
  const row1 = [
    walletActionCell("waSend", IC_WALLET_SEND, tr.walletSend),
    walletActionCell("waReceive", IC_WALLET_RECV, tr.walletReceive),
    walletActionCell("waHistory", IC_WALLET_HIST, tr.walletHistory),
    walletActionCell("waImport", IC_WALLET_IMPORT, tr.walletImport),
  ].join("");
  const row2 = [
    walletActionCell("waMyWallets", IC_WALLET_MULTI, tr.walletMyWallets),
    walletActionCell("waNewWallet", IC_WALLET_PLUS, tr.walletNewWallet),
    walletActionCell("waMiningPools", walletIcoPoolImg(), tr.walletMiningPools),
    walletActionCell("waWalletSettings", IC_WALLET_SET, tr.walletWalletSettings),
  ].join("");
  const selectBlock = walletPickerHtml(walletViewAddress, escapeAttr);
  const txBody = walletTxBodyHtml(tr);
  return `
    <div class="wallet-screen">
      <section class="wallet-hero">
        <div class="wallet-balance-block">
          ${balBlock}
          ${balErr}
        </div>
        <div class="wallet-actions-row">${row1}</div>
        <div class="wallet-actions-row">${row2}</div>
      </section>
      <section class="wallet-bottom">
        <h2 class="wallet-recent-title">${escapeAttr(tr.walletCoinTransfersTitle)}</h2>
        ${selectBlock ? `<div class="wallet-addr-row">${selectBlock}</div>` : ""}
        ${txBody}
      </section>
    </div>
  `;
}

const NAV_SVG: Record<TabId, string> = {
  wallet: `<svg class="nav-ico-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M16 14h2"/></svg>`,
  mining: NAV_MINING_ICON,
  settings: IC_NAV_GEAR,
};

function screenTitle(tr: ReturnType<typeof t>, tab: TabId): string {
  switch (tab) {
    case "mining":
      return tr.screenMining;
    case "wallet":
      return tr.screenWallet;
    case "settings":
      return tr.screenSettings;
  }
}

const APP_VERSION = __TMA_BUILD_ID__;

function settingsPanelHtml(): string {
  return settingsTabHtml(escapeAttr, t(), APP_VERSION);
}

function bottomNavHtml(tr: ReturnType<typeof t>, tab: TabId): string {
  const order: TabId[] = ["wallet", "mining", "settings"];
  const labels: Record<TabId, string> = {
    wallet: tr.tabWallet,
    mining: tr.tabMining,
    settings: tr.tabSettings,
  };
  const buttons = order
    .map((id) => {
      const active = id === tab ? " active" : "";
      const cur = id === tab ? "true" : "false";
      return `<button type="button" class="nav-tab${active}" data-tab="${id}" role="tab" aria-selected="${cur}" aria-controls="tma-panel"><span class="nav-ico-wrap">${NAV_SVG[id]}</span><span class="nav-tab-label">${escapeAttr(labels[id])}</span></button>`;
    })
    .join("");
  return `<nav class="bottom-nav" role="tablist" aria-label="Main">${buttons}</nav>`;
}

function tabContentHtml(tr: ReturnType<typeof t>, hasKmp: boolean, hasWalletTx: boolean, tab: TabId): string {
  if (tab === "mining") return miningScreenHtml(tr);
  if (tab === "wallet") return balanceCardHtml(tr, hasWalletTx);
  return settingsPanelHtml();
}

async function openCreateStakeFromMining(): Promise<void> {
  const tr = t();
  const row = getActiveWalletRow();
  if (!row) {
    tmaAlert(tr.alertNoActiveWalletFound);
    return;
  }
  if (row.kind === "watch") {
    tmaAlert(tr.alertWatchOnlyNoStake);
    return;
  }
  let balanceMrs = readBalanceCache(row.address)?.balance;
  if (!balanceMrs) {
    balanceMrs = (await fetchWalletBalanceMrs(walletNodeBase(), row.address)) ?? "0";
  }
  const mi = miningState.kind === "ok" ? miningState.data : getMiningInfoSnapshot();
  const minStake =
    typeof mi?.min_stake_amount === "number" ? mi.min_stake_amount : 100 * WEI_PER_COIN;
  const height =
    typeof mi?.current_height === "number" && mi.current_height > 0
      ? mi.current_height
      : lastNodeInfo?.height ?? 0;
  openCreateMinerStakeModal({
    escapeAttr,
    tmaAlert,
    nodeBase: miningNodeBase(),
    wallet: row,
    balanceMrs,
    minStakeNanos: minStake,
    currentHeight: height,
    onSuccess: () => {
      void refreshBalancesAfterActivity(true);
      void refreshMiningDashboard({ background: true });
    },
  });
}

async function openCreatePoolStakeFromMining(poolFromJoin?: OfficialPoolCatalogItem): Promise<void> {
  const tr = t();
  const row = getActiveWalletRow();
  if (!row) {
    tmaAlert(tr.alertNoActiveWalletFound);
    return;
  }
  if (row.kind === "watch") {
    tmaAlert(tr.alertWatchOnlyNoStake);
    return;
  }
  const membership = await refreshPoolMembershipForAddress(miningNodeBase(), row.address);
  activePoolMembership = membership;
  activePoolBind = membership.bind;
  if (membership.active && membership.poolId != null) {
    const boundId = membership.poolId;
    const catalog = await fetchOfficialPoolsList(miningNodeBase());
    const apiName =
      catalog?.pools?.find((p) => p.pool_id === boundId)?.name ?? `Pool ${boundId + 1}`;
    tmaAlert(poolAlreadyInPoolMessage(boundId, apiName));
    const root = document.getElementById("app");
    if (root) {
      void refreshMiningDashboard({ background: true }).then(() => render(root));
    }
    return;
  }
  let balanceMrs = readBalanceCache(row.address)?.balance;
  if (!balanceMrs) {
    balanceMrs = (await fetchWalletBalanceMrs(walletNodeBase(), row.address)) ?? "0";
  }
  const mi = miningState.kind === "ok" ? miningState.data : getMiningInfoSnapshot();
  const minStake = 100 * WEI_PER_COIN;
  const height =
    typeof mi?.current_height === "number" && mi.current_height > 0
      ? mi.current_height
      : lastNodeInfo?.height ?? 0;
  if (!hasChosenPoolForStake(row.address)) {
    tmaAlert(tr.miningSelectPoolFirst);
    const root = document.getElementById("app");
    if (root) openMiningPoolsPage(root);
    return;
  }
  const chosenId = getChosenPoolId(row.address);
  let poolId = poolFromJoin?.pool_id ?? chosenId;
  if (poolId == null || poolId < 0 || poolId > 4) {
    tmaAlert(tr.miningSelectPoolFirst);
    return;
  }
  let poolName = poolFromJoin?.name ?? "";
  if (!poolName) {
    const catalog = await fetchOfficialPoolsList(miningNodeBase());
    const apiName = catalog?.pools?.find((p) => p.pool_id === poolId)?.name ?? `Pool ${poolId + 1}`;
    poolName = localizedPoolName(poolId, apiName);
  } else {
    poolName = localizedPoolName(poolId, poolName);
  }
  openCreateMinerPoolStakeModal({
    escapeAttr,
    tmaAlert,
    nodeBase: miningNodeBase(),
    wallet: row,
    balanceMrs,
    poolId,
    poolName,
    minStakeNanos: minStake,
    currentHeight: height,
    onSuccess: () => {
      setMiningMode("pool");
      void refreshBalancesAfterActivity(true);
      void refreshMiningDashboard({ background: true });
    },
  });
}

function render(root: HTMLElement): void {
  try {
  const tr = t();
  const bridge = window.__TMA_SHARED__;
  const hasKmp = Boolean(
    bridge?.fetchNodeInfoJson &&
      bridge?.fetchWalletBalanceJson &&
      bridge?.fetchAddressTxJson &&
      bridge?.fetchMiningInfoJson &&
      bridge?.fetchMiningStatsJson,
  );
  const hasWalletTx = Boolean(bridge?.fetchAddressTxJson && bridge?.fetchWalletBalanceJson);

  root.innerHTML = `
    <header class="top-bar">
      <div class="top-bar-row">
        <img class="top-logo" src="/logo.png" width="30" height="30" alt="" decoding="async" />
        <h1 class="top-title">${escapeAttr(screenTitle(tr, activeTab))}</h1>
        <button type="button" class="top-stat-btn" id="headerStats" aria-label="${escapeAttr(tr.headerStatsAria)}">${HEADER_STATS_SVG}</button>
      </div>
    </header>
    <main class="content content-with-nav${activeTab === "wallet" ? " content-with-nav--wallet" : ""}${activeTab === "mining" ? " content-with-nav--mining" : ""}" id="tma-panel" role="tabpanel">
      ${tabContentHtml(tr, hasKmp, hasWalletTx, activeTab)}
    </main>
    ${bottomNavHtml(tr, activeTab)}
  `;

  root.querySelectorAll<HTMLButtonElement>(".nav-tab[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.tab;
      if (id !== "mining" && id !== "wallet" && id !== "settings") return;
      unmountMyWalletsPage();
      unmountHistoryPage();
      unmountConnectionsPage();
      unmountStatisticsPage();
      unmountWalletSettingsPage();
      unmountSettingsOverlays();
      ensureActiveWalletInStore();
      teardownPoolsOverlays();
      activeTab = id;
      saveActiveTab(activeTab);
      tabScrollResetsLeft = 5;
      scrollMainTabPanelToTop();
      render(root);
      if (id === "mining") {
        void refreshMiningDashboard();
      }
      if (id === "wallet") void refreshWalletSurface(false, undefined, { skipNetworkIfCached: true });
      if (id === "settings") {
        bindSettingsTab({
          escapeAttr,
          tmaAlert,
          tr: t(),
          readNodeBase: readNodeBase(),
          miningNodeBase: miningNodeBase(),
          walletNodeBase: walletNodeBase(),
          appVersion: APP_VERSION,
          onWalletReset: () => {
            try {
              localStorage.removeItem(ONBOARDING_LS);
              localStorage.removeItem(WALLET_LS);
      localStorage.removeItem(WALLET_VIEW_LS);
            } catch {
              /* ignore */
            }
            clearWalletLocalState();
            location.reload();
          },
          onCloseOverlay: () => render(root),
          onLocaleChange: () => render(root),
        });
      }
    });
  });

  document.getElementById("headerStats")?.addEventListener("click", () => {
    hidePoolDetailPage();
    hidePoolsPage();
    mountStatisticsPage({
      escapeAttr,
      readNodeBase: readNodeBase(),
      miningNodeBase: miningNodeBase(),
      onClose: () => render(root),
      labels: {
        commonBack: tr.commonBack,
        commonCancel: tr.commonCancel,
        commonReset: tr.commonReset,
        statsTitle: tr.statsTitle,
        statsYourMining: tr.statsYourMining,
        statsBlocksMined: tr.statsBlocksMined,
        statsTotalRewards: tr.statsTotalRewards,
        statsNetwork: tr.statsNetwork,
        statsChainHeight: tr.statsChainHeight,
        statsEmission: tr.statsEmission,
        statsActiveMiners: tr.statsActiveMiners,
        statsStakedMiners: tr.statsStakedMiners,
        statsTotalMiners: tr.statsTotalMiners,
        statsBlocksPerHour: tr.statsBlocksPerHour,
        statsAvgHashrate: tr.statsAvgHashrate,
        statsInfoTitle: tr.statsInfoTitle,
        statsInfoBody: tr.statsInfoBody,
        statsResetTitle: tr.statsResetTitle,
        statsResetHint: tr.statsResetHint,
      },
    });
  });

  if (activeTab === "mining") {
    attachMiningTapHandler({
      nodeBase: miningNodeBase(),
      tmaAlert,
      getActiveWallet: () => getActiveWalletRow(),
      hasActiveStake: () => {
        const d = getMiningInfoSnapshot();
        const mode = getMiningMode();
        const addr = activeWalletAddress();
        if (mode === "pool") {
          return canMineInPoolMode(d, activePoolMembership);
        }
        return canMineInSoloMode(d, activePoolMembership);
      },
      noStakeMessage: () =>
        getMiningMode() === "pool" ? t().miningTapNoPoolStake : t().miningTapNoStake,
      getAvailableCredits: () => {
        const d = getMiningInfoSnapshot();
        return d ? miningNum(d.available_credits) : 0;
      },
      onRefreshMining: () => {
        void refreshMiningDashboard({ background: true });
      },
      onRefreshBalance: () => {
        void refreshBalancesAfterActivity(true);
      },
    });

    document.getElementById("tmaMiningModeSwitch")?.addEventListener("click", () => {
      const prev = getMiningMode();
      const next: MiningMode = prev === "solo" ? "pool" : "solo";
      pendingMiningCoinFlip = { from: prev, to: next };
      setMiningMode(next);
      render(root);
    });

    if (pendingMiningCoinFlip) {
      const flip = pendingMiningCoinFlip;
      pendingMiningCoinFlip = null;
      requestAnimationFrame(() =>
        playMiningCoinFlip(flip.from, flip.to, () => {
          window.setTimeout(() => render(root), MINING_OVERLAY_REVEAL_MS);
        }),
      );
    }
  }

  document.getElementById("tmaCreateStake")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (getMiningMode() === "pool") void openCreatePoolStakeFromMining();
    else void openCreateStakeFromMining();
  });

  document.getElementById("tmaChoosePool")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMiningPoolsPage(root);
  });

  if (activeTab === "settings") {
    bindSettingsTab({
      escapeAttr,
      tmaAlert,
      tr: t(),
      readNodeBase: readNodeBase(),
      miningNodeBase: miningNodeBase(),
      appVersion: APP_VERSION,
      onWalletReset: () => {
        try {
          localStorage.removeItem(ONBOARDING_LS);
          localStorage.removeItem(WALLET_LS);
      localStorage.removeItem(WALLET_VIEW_LS);
        } catch {
          /* ignore */
        }
        clearWalletLocalState();
        location.reload();
      },
      onCloseOverlay: () => render(root),
      onLocaleChange: () => render(root),
    });
  }

  document.getElementById("waSend")?.addEventListener("click", () => {
    openSendModal();
  });
  document.getElementById("walletBalanceToggle")?.addEventListener("click", () => {
    walletBalanceHidden = !walletBalanceHidden;
    saveWalletBalanceHidden(walletBalanceHidden);
    render(root);
  });
  document.getElementById("waReceive")?.addEventListener("click", () => {
    openReceiveModal();
  });
  document.getElementById("waMyWallets")?.addEventListener("click", () => {
    mountMyWalletsPage({
      escapeAttr,
      tmaAlert,
      tr,
      readNodeBase: readNodeBase(),
      miningNodeBase: miningNodeBase(),
      walletNodeBase: walletNodeBase(),
      onClose: () => {
        ensureActiveWalletInStore();
        resetWalletViewToActive();
        lastWalletFetchedAddr = "";
        if (cachedMiningInfoAddr !== activeWalletAddress()) {
          miningState = { kind: "idle" };
        }
        render(root);
        void refreshBalancesAfterActivity(true);
      },
    });
  });
  document.getElementById("waNewWallet")?.addEventListener("click", () => {
    openNewWalletModal(escapeAttr, tmaAlert, () => {
      ensureActiveWalletInStore();
      resetWalletViewToActive();
      applyBalanceCacheOnly();
      const root = document.getElementById("app");
      if (root) render(root);
      void refreshBalancesAfterActivity(true);
    });
  });
  document.getElementById("waMiningPools")?.addEventListener("click", () => {
    openMiningPoolsPage(root);
  });
  document.getElementById("waImport")?.addEventListener("click", () => {
    openImportWalletModal(escapeAttr, tmaAlert, () => {
      render(root);
    });
  });
  document.getElementById("waHistory")?.addEventListener("click", () => {
    mountHistoryPage({
      escapeAttr,
      nodeBase: walletNodeBase(),
      onClose: () => render(root),
      labels: {
        title: tr.historyTitle,
        back: tr.commonBack,
        all: tr.historyFilterAll,
        sent: tr.historyFilterSent,
        received: tr.historyFilterReceived,
        mining: tr.historyFilterMining,
        empty: tr.historyEmpty,
        loading: tr.historyLoading,
        fail: tr.historyFail,
        block: tr.txBlock,
        amount: tr.txAmount,
        from: tr.txFrom,
        to: tr.txTo,
        miningKind: tr.txKindMining,
        stakesKind: tr.historyFilterStakes,
        hash: tr.txHash,
        kindLabel: txKindLabelForUi,
        noWallets: tr.historyNoWallets,
        pullRefresh: tr.pullRefresh,
        pullHint: tr.walletPullHint,
        scrollMore: tr.walletScrollMore,
      },
    });
  });
  document.getElementById("waWalletSettings")?.addEventListener("click", () => {
    mountWalletSettingsPage({
      escapeAttr,
      tmaAlert,
      onClose: () => render(root),
      labels: {
        intro: tr.wsIntro,
        multiTitle: tr.wsMultiTitle,
        cascadeLabel: tr.wsCascadeLabel,
        cascadeInfoTitle: tr.wsCascadeInfoTitle,
        cascadeInfoBody: tr.wsCascadeInfoBody,
        deletedTitle: tr.wsDeletedTitle,
        deletedBody: tr.wsDeletedBody,
        openDeleted: tr.wsOpenDeleted,
        securityTitle: tr.wsSecurityTitle,
        securityBody: tr.wsSecurityBody,
      },
    });
  });

  if (activeTab === "wallet") {
    bindWalletPicker((address) => {
      const trimmed = address.trim();
      walletViewAddress = trimmed;
      persistWalletViewAddress();
      walletTxVisibleCount = TX_UI_PAGE_SIZE;
      const cached = walletTxRowsFromCache(trimmed);
      if (cached.length > 0) {
        txState = { kind: "ok", rows: cached };
        txStateAddress = trimmed;
      } else {
        txStateAddress = "";
      }
      const root = document.getElementById("app");
      if (root) render(root);
      void refreshWalletSurface(false, trimmed, { skipNetworkIfCached: true });
    });
    bindWalletTxInfiniteScroll(tr);
    walletPtrHandle?.destroy();
    const panel = document.getElementById("tma-panel");
    if (panel) {
      walletPtrHandle = attachPullToRefresh(panel, () => refreshWalletSurface(true), tr.pullRefresh);
    }
  } else {
    walletPtrHandle?.destroy();
    walletPtrHandle = null;
  }

  if (tabScrollResetsLeft > 0) {
    consumeTabScrollReset();
    requestAnimationFrame(() => consumeTabScrollReset());
  }
  syncChromeMetrics();
  } catch (e) {
    console.error("render failed", e);
    renderFatalFallback(root, e);
  }
}

async function refreshNode(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  const tr = t();
  const bridge = window.__TMA_SHARED__;
  if (!bridge?.fetchNodeInfoJson) {
    lastNodeInfo = null;
    lastNodeErr = tr.kmpMissing;
    render(root);
    return;
  }
  try {
    const json = await bridge.fetchNodeInfoJson(walletNodeBase());
    lastNodeInfo = parseNodeInfo(json);
    lastNodeErr = null;
    applyNodeStatusFromInfo(lastNodeInfo);
    scheduleBalanceRefreshOnNewBlock(lastNodeInfo?.height ?? 0);
    render(root);
  } catch {
    lastNodeInfo = null;
    lastNodeErr = tr.parseError;
    render(root);
  }
}

async function fetchBalance(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  const tr = t();
  prepareWalletTabContext();
  const viewAddr = walletViewAddress.trim();
  if (!viewAddr) {
    balState = { kind: "err", msg: tr.balanceEmpty };
    render(root);
    return;
  }
  const bridge = window.__TMA_SHARED__;
  if (!bridge?.fetchWalletBalanceJson) return;
  try {
    const json = await bridge.fetchWalletBalanceJson(walletNodeBase(), viewAddr);
    const o = JSON.parse(json) as Record<string, unknown>;
    if (!o.ok || typeof o.balance !== "string") {
      balState = { kind: "err", msg: tr.balanceFail };
    } else {
      balState = {
        kind: "ok",
        address: String(o.address ?? viewAddr),
        balance: String(o.balance),
        available: typeof o.available_balance === "string" ? o.available_balance : undefined,
      };
      lastDisplayedBalance = balState.balance;
    }
    render(root);
  } catch {
    balState = { kind: "err", msg: tr.balanceFail };
    render(root);
  }
}

async function fetchTxs(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  const tr = t();
  prepareWalletTabContext();
  const viewAddr = walletViewAddress.trim();
  if (!viewAddr) {
    txState = { kind: "err", msg: tr.txEmpty };
    txStateAddress = "";
    render(root);
    return;
  }
  const bridge = window.__TMA_SHARED__;
  if (!bridge?.fetchAddressTxJson) return;
  txState = { kind: "loading" };
  txStateAddress = "";
  render(root);
  try {
    const json = await bridge.fetchAddressTxJson(walletNodeBase(), viewAddr, 0, 20);
    const rows = parseTxRows(json);
    txState = { kind: "ok", rows: filterWalletListRows(rows) };
    txStateAddress = viewAddr;
    render(root);
  } catch {
    txState = { kind: "err", msg: tr.txFail };
    txStateAddress = "";
    render(root);
  }
}


function applyBalanceCacheOnly(): void {
  const addresses = allWalletAddresses();
  if (addresses.length === 0) {
    balState = { kind: "idle" };
    allWalletsTotalMrs = null;
    return;
  }
  allWalletsTotalMrs = totalBalanceFromCaches(addresses, true);
  const viewAddr = walletViewAddress.trim();
  if (activeTab === "wallet" && viewAddr) {
    const c = readBalanceCache(viewAddr);
    if (c?.balance) {
      lastDisplayedBalance = c.balance;
      balState = {
        kind: "ok",
        address: viewAddr,
        balance: c.balance,
        available: c.available,
      };
      return;
    }
  }
  const cachedTotal = totalBalanceFromCaches(addresses, false);
  if (cachedTotal != null) {
    lastDisplayedBalance = cachedTotal;
    balState = { kind: "ok", address: "", balance: cachedTotal };
  } else {
    balState = { kind: "idle" };
  }
}

function anyWalletBalanceStale(): boolean {
  return allWalletAddresses().some((a) => isBalanceCacheStale(a));
}

/** Refresh total balance on wallet/mining tabs (works regardless of active tab). */
async function refreshAppBalances(forceNetwork = false): Promise<void> {
  const root = document.getElementById("app");
  const addresses = allWalletAddresses();
  if (addresses.length === 0) {
    balState = { kind: "idle" };
    if (root && (activeTab === "wallet" || activeTab === "mining")) render(root);
    return;
  }
  const cachedTotal = totalBalanceFromCaches(addresses, false);
  if (cachedTotal != null && !forceNetwork && !anyWalletBalanceStale()) {
    allWalletsTotalMrs = cachedTotal;
    if (activeTab === "wallet" && walletViewAddress.trim()) {
      await refreshActiveWalletBalance(false, walletViewAddress.trim());
    } else {
      lastDisplayedBalance = cachedTotal;
      balState = { kind: "ok", address: "", balance: cachedTotal };
    }
    if (root && (activeTab === "wallet" || activeTab === "mining")) render(root);
    return;
  }
  if (!cachedTotal || forceNetwork) {
    balState = { kind: "loading" };
    if (root && (activeTab === "wallet" || activeTab === "mining")) render(root);
  }
  const res = await fetchTotalBalanceAllWallets(walletNodeBase(), {
    forceNetwork: forceNetwork || anyWalletBalanceStale(),
  });
  const cachedAfter = totalBalanceFromCaches(addresses, false);
  allWalletsTotalMrs = res.ok ? res.balance : cachedAfter ?? allWalletsTotalMrs;
  if (res.ok) {
    if (activeTab !== "wallet" || !walletViewAddress.trim()) {
      lastDisplayedBalance = res.balance;
      balState = { kind: "ok", address: "", balance: res.balance };
    }
  } else if (cachedAfter != null) {
    lastDisplayedBalance = cachedAfter;
    balState = { kind: "ok", address: "", balance: cachedAfter };
  } else if (lastDisplayedBalance != null) {
    balState = { kind: "ok", address: "", balance: lastDisplayedBalance };
  } else {
    balState = { kind: "err", msg: t().balanceFail };
  }
  if (root && (activeTab === "wallet" || activeTab === "mining")) render(root);
}

async function refreshBalancesAfterActivity(forceNetwork = true): Promise<void> {
  await refreshAppBalances(forceNetwork);
  if (activeTab === "wallet") {
    await refreshWalletSurface(forceNetwork, undefined, {
      skipNetworkIfCached: !forceNetwork,
    });
  }
  if (activeTab === "mining") {
    void refreshMiningDashboard({ forceBalance: forceNetwork, background: true });
  }
  if (forceNetwork) {
    window.setTimeout(() => {
      void refreshAppBalances(true);
      if (activeTab === "wallet") void refreshWalletSurface(true);
    }, 4000);
  }
}

function scheduleBalanceRefreshOnNewBlock(height: number): void {
  if (height <= 0 || height <= lastKnownChainHeight) return;
  lastKnownChainHeight = height;
  if (balanceRefreshTimer != null) window.clearTimeout(balanceRefreshTimer);
  balanceRefreshTimer = window.setTimeout(() => {
    balanceRefreshTimer = null;
    void refreshAppBalances(true);
    if (activeTab === "wallet") {
      void refreshWalletSurface(false, undefined, { skipNetworkIfCached: true });
    }
  }, 1500);
}

function applyWalletCacheOnly(addr: string): { hasTxCache: boolean; cachedRowCount: number } {
  applyBalanceCacheOnly();
  if (hasAddressTxCache(addr)) {
    walletTxVisibleCount = TX_UI_PAGE_SIZE;
    const rows = walletTxRowsFromCache(addr) ?? [];
    txState = { kind: "ok", rows };
    txStateAddress = addr;
    return { hasTxCache: true, cachedRowCount: rows.length };
  }
  txState = { kind: "idle" };
  txStateAddress = "";
  return { hasTxCache: false, cachedRowCount: 0 };
}

async function refreshActiveWalletBalance(
  forceNetwork: boolean,
  addr: string,
): Promise<void> {
  if (!addr.trim()) return;
  if (!forceNetwork) {
    const c = readBalanceCache(addr);
    if (c?.balance) {
      balState = {
        kind: "ok",
        address: addr,
        balance: c.balance,
        available: c.available,
      };
      lastDisplayedBalance = c.balance;
      return;
    }
  }
  const bal = await fetchWalletBalanceMrs(walletNodeBase(), addr);
  if (bal == null) return;
  const c = readBalanceCache(addr);
  balState = {
    kind: "ok",
    address: addr,
    balance: bal,
    available: c?.available,
  };
  lastDisplayedBalance = bal;
}

async function refreshTotalBalanceDisplay(forceNetwork = false): Promise<void> {
  const addrs = allWalletAddresses();
  if (addrs.length > 0) {
    const res = await fetchTotalBalanceAllWallets(walletNodeBase(), { forceNetwork });
    allWalletsTotalMrs = res.ok ? res.balance : totalBalanceFromCaches(addrs, true);
  }
  if (activeTab === "wallet" && walletViewAddress.trim()) {
    await refreshActiveWalletBalance(forceNetwork, walletViewAddress.trim());
  } else {
    await refreshAppBalances(forceNetwork);
  }
}

function queueWalletTxBackgroundSync(addr: string, parentSeq: number): void {
  const bgSeq = ++walletTxBgSeq;
  void loadWalletTxForAddress(walletNodeBase(), addr)
    .then((rows) => {
      const root = document.getElementById("app");
      if (!root || activeTab !== "wallet") return;
      if (bgSeq !== walletTxBgSeq || parentSeq !== walletDashSeq) return;
      if (walletViewAddress.trim() !== addr) return;
      walletTxVisibleCount = TX_UI_PAGE_SIZE;
      txState = { kind: "ok", rows };
      txStateAddress = addr;
      lastWalletFetchedAddr = addr;
      render(root);
    })
    .catch(() => {
      /* keep cache on screen */
    });
}

async function refreshWalletSurface(
  forceNetwork = false,
  selectedAddr?: string,
  opts?: { skipNetworkIfCached?: boolean },
): Promise<void> {
  const root = document.getElementById("app");
  if (!root || activeTab !== "wallet") return;
  const seq = ++walletDashSeq;
  const tr = t();
  if (selectedAddr?.trim()) {
    walletViewAddress = selectedAddr.trim();
    persistWalletViewAddress();
  } else {
    prepareWalletTabContext();
  }
  const addr = walletViewAddress.trim();
  if (!addr) {
    balState = { kind: "idle" };
    txState = { kind: "idle" };
    if (seq === walletDashSeq) render(root);
    return;
  }
  const bridge = window.__TMA_SHARED__;
  if (!bridge?.fetchAddressTxJson || !bridge?.fetchWalletBalanceJson) return;

  const { cachedRowCount } = applyWalletCacheOnly(addr);
  if (seq === walletDashSeq) render(root);

  const preferCache =
    !forceNetwork && cachedRowCount > 0 && opts?.skipNetworkIfCached !== false;

  if (preferCache) {
    lastWalletFetchedAddr = addr;
    void refreshActiveWalletBalance(false, addr);
    const chainH = lastNodeInfo?.height ?? 0;
    if (walletTxNeedsNetworkSync(addr, chainH)) {
      queueWalletTxBackgroundSync(addr, seq);
    }
    return;
  }

  if (forceNetwork) {
    if (seq === walletDashSeq) {
      txState = cachedRowCount > 0 ? txState : { kind: "loading" };
      if (txState.kind === "loading") txStateAddress = "";
      render(root);
    }
    try {
      await Promise.all([
        refreshTotalBalanceDisplay(true),
        refreshWalletTxFromNetwork(walletNodeBase(), addr).then((rows) => {
          if (seq !== walletDashSeq) return;
          walletTxVisibleCount = TX_UI_PAGE_SIZE;
          txState = { kind: "ok", rows };
          txStateAddress = addr;
          lastWalletFetchedAddr = addr;
        }),
      ]);
    } catch {
      if (seq !== walletDashSeq) return;
      const cached = walletTxRowsFromCache(addr);
      if (cached.length > 0) {
        txState = { kind: "ok", rows: cached };
        txStateAddress = addr;
      } else if (txState.kind === "loading") txState = { kind: "err", msg: tr.txFail };
    }
    if (seq === walletDashSeq) render(root);
    return;
  }

  if (seq === walletDashSeq) {
    txState = { kind: "loading" };
    txStateAddress = "";
    render(root);
  }
  const showProgress = cachedRowCount === 0;
  try {
    const rows = await loadWalletTxForAddress(
      walletNodeBase(),
      addr,
      showProgress
        ? (partial) => {
            if (seq !== walletDashSeq) return;
            walletTxVisibleCount = TX_UI_PAGE_SIZE;
            txState = { kind: "ok", rows: partial };
            txStateAddress = addr;
            render(root);
          }
        : undefined,
    );
    if (seq !== walletDashSeq) return;
    walletTxVisibleCount = TX_UI_PAGE_SIZE;
    txState = { kind: "ok", rows };
    txStateAddress = addr;
    lastWalletFetchedAddr = addr;
  } catch {
    if (seq !== walletDashSeq) return;
    const cached = walletTxRowsFromCache(addr);
    if (cached.length > 0) {
      txState = { kind: "ok", rows: cached };
      txStateAddress = addr;
    } else {
      txState = { kind: "err", msg: tr.txFail };
      txStateAddress = "";
    }
  }
  if (seq === walletDashSeq) render(root);
}

function parseMiningStatsPayload(json: string): { activeMiners: number; totalMiners: number } | null {
  const parsed = parseMiningStatsJson(json);
  if (!parsed) return null;
  return { activeMiners: parsed.activeMiners, totalMiners: parsed.totalMiners };
}

async function fetchMiningStatsJsonForDashboard(): Promise<string | null> {
  return fetchMiningStatsJsonMulti([miningNodeBase(), readNodeBase()]);
}

let miningDashboardLoaded = false;

async function refreshMiningDashboard(opts?: { forceBalance?: boolean; background?: boolean }): Promise<void> {
  const root = document.getElementById("app");
  if (!root || activeTab !== "mining") return;
  const seq = ++miningDashSeq;
  const tr = t();
  const bridge = window.__TMA_SHARED__;
  const soft = opts?.background === true && miningDashboardLoaded;
  prepareMiningTabContext();
  const addr = activeWalletAddress();
  if (!soft) {
    if (addr && miningState.kind !== "ok") miningState = { kind: "loading" };
    if (miningStatsState.kind !== "ok") miningStatsState = { kind: "loading" };
    if (seq === miningDashSeq) render(root);
  }

  try {
    const statusBase = miningNodeBase();
    if (bridge?.fetchNodeInfoJson) {
      try {
        const nodeJson = await bridge.fetchNodeInfoJson(statusBase);
        if (seq !== miningDashSeq) return;
        lastNodeInfo = parseNodeInfo(nodeJson);
        lastNodeErr = null;
        applyNodeStatusFromInfo(lastNodeInfo);
      } catch {
        lastNodeInfo = null;
        lastNodeErr = tr.parseError;
      }
    } else {
      try {
        const res = await fetch(`${statusBase}status`, { cache: "no-store" });
        if (seq !== miningDashSeq) return;
        if (res.ok) {
          const o = (await res.json()) as { success?: boolean; data?: Record<string, unknown> };
          if (o.success && o.data) {
            lastNodeInfo = parseNodeInfo(
              JSON.stringify({
                connected: true,
                height: o.data.height,
                target: o.data.target,
                bits: o.data.bits ?? o.data.difficulty,
                difficulty: o.data.difficulty,
                addr_tx_index_ready: o.data.addr_tx_index_ready,
              }),
            );
            lastNodeErr = null;
            applyNodeStatusFromInfo(lastNodeInfo);
          }
        }
      } catch {
        lastNodeInfo = null;
        lastNodeErr = tr.parseError;
      }
    }

    let statsJson: string | null = await fetchMiningStatsJsonForDashboard();
    if (seq !== miningDashSeq) return;
    const sp = statsJson ? parseMiningStatsPayload(statsJson) : null;
    if (sp) {
      miningStatsState = { kind: "ok", ...sp };
    } else if (!soft) {
      miningStatsState = { kind: "err", msg: tr.miningStatsFail };
    }

    if (!addr) {
      miningState = { kind: "idle" };
      cachedMiningInfo = null;
      cachedMiningInfoAddr = "";
      activePoolBind = null;
      activePoolMembership = { bind: null, member: null, active: false, poolId: null };
      miningBalanceMrs = null;
      miningBalanceLoading = false;
    } else {
      if (!soft && miningState.kind !== "ok") miningState = { kind: "loading" };
      const [data, , membership] = await Promise.all([
        fetchMiningInfoForAddress(addr, miningNodeBase(), readNodeBase()),
        refreshMiningWalletBalance(addr, opts?.forceBalance ?? !miningDashboardLoaded, soft),
        refreshPoolMembershipForAddress(miningNodeBase(), addr),
      ]);
      if (seq !== miningDashSeq) return;
      activePoolMembership = membership;
      activePoolBind = membership.bind;
      if (membership.active && membership.poolId != null) {
        clearPoolStakePending();
        markPoolChosen(addr, membership.poolId);
        syncPoolsListActivePool(addr, membership.poolId);
      } else {
        clearPoolsListActiveMembership(addr);
      }
      if (data) {
        storeMiningInfoForAddr(addr, data);
        miningState = { kind: "ok", data };
      } else if (!soft || miningState.kind !== "ok") {
        miningState = { kind: "err", msg: tr.miningFail };
      }
    }
    miningDashboardLoaded = true;
    if (seq !== miningDashSeq) return;
    render(root);
  } catch {
    if (seq !== miningDashSeq) return;
    if (!soft) {
      lastNodeErr = tr.parseError;
      miningStatsState = { kind: "err", msg: tr.miningStatsFail };
    }
    if (addr) {
      if (!soft && miningState.kind !== "ok") miningState = { kind: "loading" };
      const [data, , membership] = await Promise.all([
        fetchMiningInfoForAddress(addr, miningNodeBase(), readNodeBase()),
        refreshMiningWalletBalance(addr, opts?.forceBalance ?? !miningDashboardLoaded, soft),
        refreshPoolMembershipForAddress(miningNodeBase(), addr),
      ]);
      if (seq !== miningDashSeq) return;
      activePoolMembership = membership;
      activePoolBind = membership.bind;
      if (membership.active && membership.poolId != null) {
        clearPoolStakePending();
        markPoolChosen(addr, membership.poolId);
        syncPoolsListActivePool(addr, membership.poolId);
      } else {
        clearPoolsListActiveMembership(addr);
      }
      if (data) {
        storeMiningInfoForAddr(addr, data);
        miningState = { kind: "ok", data };
      } else if (!soft || miningState.kind !== "ok") {
        miningState = { kind: "err", msg: tr.miningFail };
      }
      miningDashboardLoaded = true;
    }
    render(root);
  }
}

async function runMainApp(root: HTMLElement): Promise<void> {
  try {
    ensureHdWalletListFromStoredSeed();
    migrateWatchOnlyFromLegacyAddress();
    ensureActiveWalletInStore();
  } catch (e) {
    console.warn("wallet bootstrap skipped", e);
  }
  onLocaleChange(() => {
    applyTelegramTheme(getLocale());
    render(root);
  });
  ensureActiveWalletInStore();
  if (activeTab === "wallet") {
    prepareWalletTabContext();
    const addr = walletViewAddress.trim() || activeWalletAddress();
    if (addr) applyWalletCacheOnly(addr);
  }
  render(root);
  if (!isTelegramOnlyEnv()) {
    telegramGate = { kind: "loading" };
    render(root);
    telegramGate = await validateInitDataWithServer();
    render(root);
  }
  void refreshNode().then(async () => {
    await refreshBalancesAfterActivity(false);
    if (activeTab === "wallet") {
      void refreshWalletSurface(false, undefined, { skipNetworkIfCached: true });
    }
  });
  window.setInterval(() => {
    if (activeTab === "mining") void refreshMiningDashboard({ background: true });
  }, 12000);
}

async function main(): Promise<void> {
  initLocale();
  attachUiHaptics();

  const root = document.getElementById("app");
  if (!root) return;

  if (!isTelegramOnlyEnv()) {
    ensureTelegramMock();
  }
  window.Telegram?.WebApp?.ready();
  applyTelegramTheme(getLocale());
  installTelegramChromeHooks(() => {
    const appRoot = document.getElementById("app");
    if (appRoot) syncChromeMetrics();
  });

  if (!(await enforceTelegramAccess(root))) return;

  await purgeLegacyCloudWalletKeys();
  repairOnboardingIfNoLocalWallet(ONBOARDING_LS);

  try {
    if (localStorage.getItem(ONBOARDING_LS) !== "1") {
      const { mountOnboarding } = await import("./onboarding");
      mountOnboarding(root, (seed) => {
        try {
          if (!persistSeedAndInitHdZero(seed)) {
            throw new Error(t().onbPersistFail);
          }
          ensureActiveWalletInStore();
          resetWalletViewToActive();
        } catch (e) {
          console.error("onboarding persist failed", e);
          renderFatalFallback(root, e);
          return;
        }
        try {
          localStorage.setItem(ONBOARDING_LS, "1");
        } catch {
          /* ignore */
        }
        void runMainApp(root).catch((e) => {
          console.error("runMainApp failed", e);
          renderFatalFallback(root, e);
        });
      });
      return;
    }
  } catch {
    /* storage blocked — continue into app */
  }
  try {
    await runMainApp(root);
  } catch (e) {
    console.error("runMainApp failed", e);
    renderFatalFallback(root, e);
  }
}

void main().catch((e) => {
  console.error("main failed", e);
  const root = document.getElementById("app");
  if (root) renderFatalFallback(root, e);
});
