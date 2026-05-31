/**
 * Full-screen "My Wallets" (Android WalletsListFragment parity).
 */
import type { Messages } from "./i18n";
import { attachModalEscape, removeTmaModal } from "./modal";
import { attachPressHoldReveal } from "./pressHoldReveal";
import { hapticImpact } from "./haptic";
import {
  fetchMiningInfoForAddress,
  miningInfoHasActiveStake,
  miningInfoIsPoolStake,
} from "./miningInfoHelpers";
import { refreshPoolMembershipForAddress } from "./poolInfoHelpers";
import {
  fetchWalletBalanceMrs,
  formatMrsFromBigIntNanos,
  parseMrsToBigIntNanos,
  PRIVATE_KEY_MASKED,
  privateKeyMaskedText,
} from "./totalBalance";
import { readBalanceCache } from "./txCache";
import {
  applySavedWalletOrder,
  clearWalletListOrder,
  deleteWalletByAddress,
  ensureHdWalletListFromStoredSeed,
  getActiveAddress,
  getPrivateKeyBase64ForRow,
  hasSavedWalletListOrder,
  loadWalletRows,
  migrateWatchOnlyFromLegacyAddress,
  saveWalletListOrder,
  saveWalletRows,
  setActiveAddress,
  type TmaWalletRow,
  updateWalletNameByAddress,
} from "./walletStore";

const IC_COPY_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

const WALLET_ICO_SW = 'stroke-width="2.5"';
const IC_WALLET_IMPORT_BADGE = `<svg class="tma-wallets-card-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ${WALLET_ICO_SW} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 21h16"/></svg>`;

function walletCardIconHtml(row: TmaWalletRow): string {
  if (row.kind === "import") {
    return `<div class="tma-wallets-card-icon tma-wallets-card-icon--import" aria-hidden="true">${IC_WALLET_IMPORT_BADGE}</div>`;
  }
  const id = row.hdIndex ?? 0;
  return `<div class="tma-wallets-card-icon tma-wallets-card-icon--id" aria-hidden="true"><span class="tma-wallets-card-icon-id">${id}</span></div>`;
}

const REORDER_HOLD_MS = 500;
const REORDER_MOVE_CANCEL_PX = 12;
const POPUP_GAP_PX = 8;
const POPUP_EDGE_PAD_PX = 8;

/** Anchor popup below the button; flip above when it would clip at the bottom. */
function positionAnchorPopup(pop: HTMLElement, anchor: HTMLElement, container: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  const pr = container.getBoundingClientRect();
  pop.style.position = "absolute";
  pop.style.right = `${Math.max(POPUP_EDGE_PAD_PX, pr.right - r.right)}px`;
  pop.style.visibility = "hidden";
  pop.style.top = "0px";

  const popH = pop.offsetHeight;
  const belowTop = r.bottom - pr.top + POPUP_GAP_PX;
  const aboveTop = r.top - pr.top - popH - POPUP_GAP_PX;
  const maxBottom = pr.height - POPUP_EDGE_PAD_PX;
  const fitsBelow = belowTop + popH <= maxBottom;

  let top: number;
  if (fitsBelow) {
    pop.classList.remove("tma-wallet-opts-pop--above");
    top = belowTop;
  } else if (aboveTop >= POPUP_EDGE_PAD_PX) {
    pop.classList.add("tma-wallet-opts-pop--above");
    top = aboveTop;
  } else {
    const roomBelow = maxBottom - belowTop;
    const roomAbove = r.top - pr.top - POPUP_EDGE_PAD_PX;
    if (roomAbove > roomBelow) {
      pop.classList.add("tma-wallet-opts-pop--above");
      top = Math.max(POPUP_EDGE_PAD_PX, aboveTop);
    } else {
      pop.classList.remove("tma-wallet-opts-pop--above");
      top = Math.max(POPUP_EDGE_PAD_PX, maxBottom - popH);
    }
  }

  pop.style.top = `${top}px`;
  pop.style.visibility = "";
}

/** Fit popup width to content (sort menu; many WebViews ignore CSS max-content). */
function shrinkWrapPopup(pop: HTMLElement): void {
  pop.style.minWidth = "0";
  pop.style.width = "max-content";
  const w = pop.scrollWidth;
  if (w > 0) pop.style.width = `${w}px`;
}

type ReorderGesture = {
  card: HTMLElement;
  placeholder: HTMLElement | null;
  pointerId: number;
  startX: number;
  startY: number;
  lastY: number;
  offsetX: number;
  offsetY: number;
  holdTimer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  orderBefore: string[];
};

function walletAddressesFromListDom(listEl: HTMLElement, dragAddr?: string): string[] {
  const out: string[] = [];
  for (const el of listEl.children) {
    if (el.classList.contains("tma-wallets-card-placeholder")) {
      if (dragAddr) out.push(dragAddr);
    } else if (el.classList.contains("tma-wallets-card")) {
      const addr = (el as HTMLElement).dataset.address?.trim() ?? "";
      if (addr) out.push(addr);
    }
  }
  return out;
}

function beginDragVisuals(g: ReorderGesture, listEl: HTMLElement): void {
  const card = g.card;
  const rect = card.getBoundingClientRect();
  g.offsetX = g.startX - rect.left;
  g.offsetY = g.startY - rect.top;

  const placeholder = document.createElement("div");
  placeholder.className = "tma-wallets-card-placeholder";
  placeholder.style.height = `${rect.height}px`;
  listEl.insertBefore(placeholder, card);
  g.placeholder = placeholder;

  document.body.appendChild(card);
  card.classList.add("is-reorder-ghost");
  card.style.width = `${rect.width}px`;
  card.style.left = `${rect.left}px`;
  card.style.top = `${rect.top}px`;
}

function updatePlaceholderSlot(g: ReorderGesture, listEl: HTMLElement, clientY: number): void {
  if (!g.placeholder) return;
  const items = [...listEl.children].filter((el) => el !== g.card);
  let insertBefore: Element | null = null;
  for (const el of items) {
    const rect = el.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      insertBefore = el;
      break;
    }
  }
  if (insertBefore) {
    if (g.placeholder.nextElementSibling !== insertBefore) {
      listEl.insertBefore(g.placeholder, insertBefore);
    }
  } else if (listEl.lastElementChild !== g.placeholder) {
    listEl.appendChild(g.placeholder);
  }
}

function updateDragPosition(g: ReorderGesture, listEl: HTMLElement, clientX: number, clientY: number): void {
  g.card.style.left = `${clientX - g.offsetX}px`;
  g.card.style.top = `${clientY - g.offsetY}px`;
  updatePlaceholderSlot(g, listEl, clientY);
}

function teardownDragVisuals(g: ReorderGesture, listEl: HTMLElement): void {
  const { card, placeholder } = g;
  if (placeholder?.parentNode === listEl) {
    listEl.insertBefore(card, placeholder);
    placeholder.remove();
  } else if (card.parentNode === document.body) {
    listEl.appendChild(card);
  }
  card.classList.remove("is-reorder-ghost", "is-reorder-active", "is-dragging");
  card.removeAttribute("style");
  g.placeholder = null;
}

function attachWalletListReorder(
  listEl: HTMLElement,
  onOrderSaved: (addresses: string[]) => void,
): void {
  if (listEl.dataset.reorderBound === "1") return;
  listEl.dataset.reorderBound = "1";

  listEl.addEventListener("selectstart", (e) => e.preventDefault());
  listEl.addEventListener("contextmenu", (e) => e.preventDefault());

  let gesture: ReorderGesture | null = null;

  const endGesture = (save: boolean): void => {
    if (!gesture) return;
    const g = gesture;
    if (g.holdTimer != null) clearTimeout(g.holdTimer);
    const dragAddr = g.card.dataset.address?.trim() ?? "";
    if (save && g.active) {
      const after = walletAddressesFromListDom(listEl, dragAddr || undefined);
      if (after.length > 0 && after.join(",") !== g.orderBefore.join(",")) onOrderSaved(after);
    }
    try {
      g.card.releasePointerCapture(g.pointerId);
    } catch {
      /* ignore */
    }
    if (g.active) teardownDragVisuals(g, listEl);
    else g.card.classList.remove("is-reorder-active", "is-dragging");
    listEl.classList.remove("is-reordering");
    gesture = null;
  };

  const activateReorder = (): void => {
    if (!gesture || gesture.active) return;
    gesture.active = true;
    gesture.orderBefore = walletAddressesFromListDom(listEl);
    gesture.card.classList.add("is-reorder-active", "is-dragging");
    listEl.classList.add("is-reordering");
    hapticImpact("medium");
    beginDragVisuals(gesture, listEl);
    updateDragPosition(gesture, listEl, gesture.startX, gesture.lastY);
    try {
      gesture.card.setPointerCapture(gesture.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleDragMove = (clientX: number, clientY: number): void => {
    if (!gesture?.active) return;
    updateDragPosition(gesture, listEl, clientX, clientY);
  };

  const onDocPointerMove = (e: PointerEvent): void => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    gesture.lastY = e.clientY;
    if (!gesture.active) {
      if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > REORDER_MOVE_CANCEL_PX) {
        endGesture(false);
      }
      return;
    }
    e.preventDefault();
    handleDragMove(e.clientX, e.clientY);
  };

  const onDocPointerEnd = (e: PointerEvent): void => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    endGesture(true);
  };

  const onDocTouchMove = (e: TouchEvent): void => {
    if (!gesture) return;
    let touch: Touch | null = null;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches.item(i);
      if (t && t.identifier === gesture.pointerId) {
        touch = t;
        break;
      }
    }
    if (!touch) return;
    gesture.lastY = touch.clientY;
    if (!gesture.active) {
      if (Math.hypot(touch.clientX - gesture.startX, touch.clientY - gesture.startY) > REORDER_MOVE_CANCEL_PX) {
        endGesture(false);
      }
      return;
    }
    e.preventDefault();
    handleDragMove(touch.clientX, touch.clientY);
  };

  const onDocTouchEnd = (e: TouchEvent): void => {
    if (!gesture) return;
    let ended = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches.item(i);
      if (t && t.identifier === gesture.pointerId) {
        ended = true;
        break;
      }
    }
    if (!ended) return;
    endGesture(true);
  };

  document.addEventListener("pointermove", onDocPointerMove, { passive: false, capture: true });
  document.addEventListener("pointerup", onDocPointerEnd, { capture: true });
  document.addEventListener("pointercancel", onDocPointerEnd, { capture: true });
  document.addEventListener("touchmove", onDocTouchMove, { passive: false, capture: true });
  document.addEventListener("touchend", onDocTouchEnd, { capture: true });
  document.addEventListener("touchcancel", onDocTouchEnd, { capture: true });

  listEl.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      if (gesture) return;
      if (e.button !== 0) return;
      const card = (e.target as HTMLElement).closest<HTMLElement>(".tma-wallets-card");
      if (!card || !listEl.contains(card)) return;
      if ((e.target as HTMLElement).closest(".tma-wallets-more")) return;
      if (!card.dataset.address?.trim()) return;

      gesture = {
        card,
        placeholder: null,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastY: e.clientY,
        offsetX: 0,
        offsetY: 0,
        holdTimer: setTimeout(activateReorder, REORDER_HOLD_MS),
        active: false,
        orderBefore: [],
      };
    },
    { passive: true },
  );
}

export type MountMyWalletsPageOpts = {
  escapeAttr: (s: string) => string;
  tmaAlert: (msg: string) => void;
  tr: Messages;
  readNodeBase: string;
  miningNodeBase: string;
  walletNodeBase: string;
  onClose: () => void;
};

type SortMode = "date" | "balance" | "manual";

let pageRootEl: HTMLElement | null = null;

export function unmountMyWalletsPage(): void {
  pageRootEl?.remove();
  pageRootEl = null;
}

type WalletStakeBadgeKind = "solo" | "pool";

function stakeBadgeKindFromMiningInfo(
  d: Record<string, unknown>,
  cur: number,
): WalletStakeBadgeKind | null {
  const has = Boolean(d.has_stake ?? d.hasStake);
  const staked = Number(d.staked_amount ?? d.stakedAmount ?? 0);
  const fmt = String(d.staked_amount_formatted ?? d.stakedAmountFormatted ?? "").trim();
  const flagged =
    has ||
    (Number.isFinite(staked) && staked > 0) ||
    (fmt !== "" && Number.isFinite(Number(fmt)) && Number(fmt) > 0);
  if (!flagged) return null;
  const unlockRaw = d.unlock_block ?? d.unlockBlock;
  if (unlockRaw != null) {
    const unlock = typeof unlockRaw === "number" ? unlockRaw : Number(unlockRaw);
    if (Number.isFinite(unlock) && cur >= unlock) return null;
  }
  const isPool =
    d.is_pool_stake === true ||
    d.isPoolStake === true ||
    d.pool_bind_active === true ||
    d.poolBindActive === true ||
    String(d.stake_type ?? d.stakeType ?? "")
      .toLowerCase()
      .includes("pool");
  return isPool ? "pool" : "solo";
}

function parseMiningStakeBadgeKind(json: string): WalletStakeBadgeKind | null {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (o.ok === false || o.success === false) return null;
    if (o.ok !== true && o.success !== true) return null;
    const d = o.data as Record<string, unknown> | undefined;
    if (!d || typeof d !== "object") return null;
    const cur =
      typeof d.current_height === "number" && Number.isFinite(d.current_height)
        ? d.current_height
        : Number(d.current_height ?? d.currentHeight) || 0;
    return stakeBadgeKindFromMiningInfo(d, cur);
  } catch {
    return null;
  }
}

function formatWalletBalanceMrs(mrs: string): string {
  return `${formatMrsFromBigIntNanos(parseMrsToBigIntNanos(mrs), 2)} MRS`;
}

function balanceLabelFromCache(address: string): string | null {
  const c = readBalanceCache(address);
  if (!c) return null;
  return formatWalletBalanceMrs(c.balance);
}

function balanceSortNanos(address: string): bigint {
  const c = readBalanceCache(address);
  if (!c) return -1n;
  return parseMrsToBigIntNanos(c.balance);
}

async function fetchBalanceText(nodeBase: string, address: string): Promise<string> {
  const bal = await fetchWalletBalanceMrs(nodeBase, address);
  if (bal == null) return "Error";
  return formatWalletBalanceMrs(bal);
}

async function refreshAllBalances(listEl: HTMLElement, nodeBase: string, addresses: string[]): Promise<void> {
  await Promise.all(
    addresses.map(async (addr) => {
      const el = listEl.querySelector<HTMLElement>(`[data-bal="${CSS.escape(addr)}"]`);
      if (!el) return;
      const t = await fetchBalanceText(nodeBase, addr);
      el.textContent = t;
    }),
  );
}

async function fetchStakeBadgeKind(
  miningNodeBase: string,
  readNodeBase: string,
  address: string,
): Promise<WalletStakeBadgeKind | null> {
  for (const base of [miningNodeBase, readNodeBase]) {
    if (!base?.trim()) continue;
    try {
      const m = await refreshPoolMembershipForAddress(base, address);
      if (m.active) return "pool";
    } catch {
      /* try next base */
    }
  }
  const data = await fetchMiningInfoForAddress(address, miningNodeBase, readNodeBase);
  if (data && miningInfoHasActiveStake(data)) {
    return miningInfoIsPoolStake(data) ? "pool" : "solo";
  }
  const bridge = window.__TMA_SHARED__;
  if (!bridge?.fetchMiningInfoJson) return null;
  for (const nodeBase of [miningNodeBase, readNodeBase]) {
    try {
      const json = await bridge.fetchMiningInfoJson(nodeBase, address);
      const kind = parseMiningStakeBadgeKind(json);
      if (kind) return kind;
    } catch {
      /* try next */
    }
  }
  return null;
}

function openNestedModal(html: string, onMount: (wrap: HTMLElement) => void): void {
  removeTmaModal();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = html;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) removeTmaModal();
  });
  document.body.appendChild(wrap);
  attachModalEscape();
  onMount(wrap);
}

export function mountMyWalletsPage(opts: MountMyWalletsPageOpts): void {
  unmountMyWalletsPage();
  ensureHdWalletListFromStoredSeed();
  migrateWatchOnlyFromLegacyAddress();

  const { escapeAttr, tmaAlert, tr, readNodeBase, miningNodeBase, walletNodeBase, onClose } = opts;

  const shell = document.createElement("div");
  shell.id = "tma-wallets-page";
  shell.className = "tma-shell-page tma-wallets-page";
  pageRootEl = shell;

  let sortMode: SortMode = hasSavedWalletListOrder() ? "manual" : "date";
  /** true = newest / largest balance first; toggled by re-tapping the same sort option */
  let sortDesc = true;
  let wallets: TmaWalletRow[] = [];
  let optionsPopup: HTMLElement | null = null;
  let sortPopup: HTMLElement | null = null;

  function closeOptions(): void {
    optionsPopup?.remove();
    optionsPopup = null;
  }

  function closeSort(): void {
    sortPopup?.remove();
    sortPopup = null;
  }

  function getSortedWallets(): TmaWalletRow[] {
    const active = getActiveAddress();
    const base = [...wallets];
    if (sortMode === "manual") {
      return base.sort((a, b) => {
        const aAct = active && a.address === active ? 0 : 1;
        const bAct = active && b.address === active ? 0 : 1;
        return aAct - bAct;
      });
    }
    if (sortMode === "date") {
      return base.sort((a, b) => {
        const aAct = active && a.address === active ? 0 : 1;
        const bAct = active && b.address === active ? 0 : 1;
        if (aAct !== bAct) return aAct - bAct;
        const cmp = (a.createdAt ?? 0) - (b.createdAt ?? 0);
        return sortDesc ? -cmp : cmp;
      });
    }
    if (sortMode === "balance") {
      return base.sort((a, b) => {
        const aAct = active && a.address === active ? 0 : 1;
        const bAct = active && b.address === active ? 0 : 1;
        if (aAct !== bAct) return aAct - bAct;
        const balA = balanceSortNanos(a.address);
        const balB = balanceSortNanos(b.address);
        if (balA > balB) return sortDesc ? -1 : 1;
        if (balA < balB) return sortDesc ? 1 : -1;
        return a.address.localeCompare(b.address);
      });
    }
    return base;
  }

  function reloadWalletsFromStore(): void {
    wallets = applySavedWalletOrder(loadWalletRows());
  }

  function showOptionsPopup(anchor: HTMLElement, row: TmaWalletRow): void {
    closeOptions();
    closeSort();
    const pop = document.createElement("div");
    pop.className = "tma-wallet-opts-pop";
    pop.innerHTML = `
      <button type="button" class="tma-wallet-opts-row" data-act="copy">${IC_COPY_SVG}<span>${escapeAttr(tr.walletsCopyAddress)}</span></button>
      <button type="button" class="tma-wallet-opts-row" data-act="rename"><span class="tma-wallet-opts-ico">✎</span><span>${escapeAttr(tr.commonRename)}</span></button>
      <button type="button" class="tma-wallet-opts-row" data-act="key"><span class="tma-wallet-opts-ico">🔑</span><span>${escapeAttr(tr.walletsShowPrivateKeyLabel)}</span></button>
      <button type="button" class="tma-wallet-opts-row" data-act="active"><span class="tma-wallet-opts-ico">✓</span><span>${escapeAttr(tr.walletsSetActiveAction)}</span></button>
      <button type="button" class="tma-wallet-opts-row tma-wallet-opts-row--danger" data-act="del"><span class="tma-wallet-opts-ico">🗑</span><span>${escapeAttr(tr.walletsDeleteWalletAction)}</span></button>
    `;
    shell.appendChild(pop);
    optionsPopup = pop;
    positionAnchorPopup(pop, anchor, shell);

    const stop = (e: MouseEvent) => {
      if (!pop.contains(e.target as Node) && e.target !== anchor) {
        closeOptions();
        document.removeEventListener("click", stop, true);
      }
    };
    window.setTimeout(() => document.addEventListener("click", stop, true), 0);

    pop.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const act = (btn as HTMLElement).dataset.act;
        closeOptions();
        document.removeEventListener("click", stop, true);
        if (act === "copy") void copyAddr(row);
        else if (act === "rename") openRename(row);
        else if (act === "key") openPrivateKey(row);
        else if (act === "active") setActive(row);
        else if (act === "del") openDelete(row);
      });
    });
  }

  async function copyAddr(row: TmaWalletRow): Promise<void> {
    try {
      await navigator.clipboard.writeText(row.address);
      tmaAlert(tr.walletsAddressCopied);
    } catch {
      tmaAlert(tr.walletsAddressCopyFail);
    }
  }

  function openRename(row: TmaWalletRow): void {
    openNestedModal(
      `
      <div class="tma-dialog" role="dialog">
        <h2 class="tma-dialog-title">${escapeAttr(tr.walletsRenameTitle)}</h2>
        <label class="tma-dialog-label" for="rwName">${escapeAttr(tr.walletsRenamePlaceholder)}</label>
        <input type="text" class="tma-dialog-inp" id="rwName" value="${escapeAttr(row.name)}" autocomplete="off" />
        <div class="tma-dialog-actions">
          <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="rwCancel">${escapeAttr(tr.commonCancel)}</button>
          <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="rwOk">${escapeAttr(tr.commonOk)}</button>
        </div>
      </div>
    `,
      (wrap) => {
        const inp = wrap.querySelector<HTMLInputElement>("#rwName");
        wrap.querySelector("#rwCancel")?.addEventListener("click", () => removeTmaModal());
        wrap.querySelector("#rwOk")?.addEventListener("click", () => {
          const n = inp?.value.trim() ?? "";
          if (n) updateWalletNameByAddress(row.address, n);
          removeTmaModal();
          if (n) tmaAlert(tr.walletsRenamed);
          reloadWalletsFromStore();
          paintList();
        });
      },
    );
  }

  function openPrivateKey(row: TmaWalletRow): void {
    const pk = getPrivateKeyBase64ForRow(row);
    if (!pk) {
      tmaAlert(tr.walletsNoPkHint);
      return;
    }
    const pkMaskLong = privateKeyMaskedText(pk.length);
    openNestedModal(
      `
      <div class="tma-dialog" role="dialog">
        <div class="tma-dialog-head-row">
          <h2 class="tma-dialog-title">🔐 ${escapeAttr(tr.walletsPkDialogTitle)}</h2>
          <button type="button" class="tma-dialog-x" id="pkX">✕</button>
        </div>
        <div class="tma-pk-wallet-block">
          <div class="tma-pk-name">${escapeAttr(row.name)}</div>
          <div class="tma-pk-addr mono">${escapeAttr(row.address)}</div>
        </div>
        <p class="tma-dialog-label" style="margin-bottom:8px">${escapeAttr(tr.walletsPkSecretLabel)}</p>
        <p class="tma-pk-hold-hint">${escapeAttr(tr.walletsPressHoldReveal)}</p>
        <div class="tma-pk-row">
          <div class="tma-pk-text mono" id="pkTxt">${escapeAttr(pkMaskLong)}</div>
          <button type="button" class="tma-dialog-copy-ico" id="pkCopy" aria-label="${escapeAttr(tr.walletsCopyAddress)}">${IC_COPY_SVG}</button>
        </div>
        <div class="tma-pk-warn"><span>⚠️</span><span>${escapeAttr(tr.walletsPkNeverShare)}</span></div>
      </div>
    `,
      (wrap) => {
        const pkEl = wrap.querySelector<HTMLElement>("#pkTxt");
        if (pkEl) attachPressHoldReveal(pkEl, { maskedText: pkMaskLong, secret: pk });
        wrap.querySelector("#pkX")?.addEventListener("click", () => removeTmaModal());
        wrap.querySelector("#pkCopy")?.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(pk);
            tmaAlert(tr.walletsPkCopied);
          } catch {
            tmaAlert(tr.walletsCopyFail);
          }
        });
      },
    );
  }

  function setActive(row: TmaWalletRow): void {
    setActiveAddress(row.address);
    tmaAlert(tr.walletsSetActive(row.name));
    reloadWalletsFromStore();
    paintList();
  }

  function openDelete(row: TmaWalletRow): void {
    const pkStr = getPrivateKeyBase64ForRow(row) ?? "";
    const pkSection = pkStr
      ? `<div class="tma-del-pk-lab">${escapeAttr(tr.walletsPkDialogTitle)}:</div>
          <p class="tma-pk-hold-hint">${escapeAttr(tr.walletsPressHoldReveal)}</p>
          <div class="tma-del-pk-row">
            <div class="tma-del-pk mono tma-press-hold-reveal" id="delPk">${escapeAttr(PRIVATE_KEY_MASKED)}</div>
            <div class="tma-del-pk-btns">
              <button type="button" class="tma-del-pk-btn tma-del-pk-btn--muted" id="delCopyPk">${escapeAttr(tr.walletsCopyAddress)}</button>
            </div>
          </div>`
      : `<p class="tma-dialog-hint" style="margin-bottom:0">${escapeAttr(tr.walletsWatchOnlyNoPk)}</p>`;
    openNestedModal(
      `
      <div class="tma-dialog tma-dialog--del" role="dialog">
        <h2 class="tma-dialog-title">🗑️ ${escapeAttr(tr.walletsDeleteWalletTitle)}</h2>
        <div class="tma-del-warn-banner">
          <span class="tma-del-warn-ico">⚠️</span>
          <span>${escapeAttr(tr.walletsDeleteCannotUndo)}</span>
        </div>
        <div class="tma-del-info-block">
          <div class="tma-pk-name">${escapeAttr(row.name)}</div>
          <div class="tma-pk-addr mono">${escapeAttr(row.address)}</div>
          <div class="tma-del-bal-row">
            <span>💰</span>
            <span class="tma-del-bal-lab">${escapeAttr(tr.walletsDeleteBalance)}</span>
            <span class="tma-del-bal-val" id="delBal">…</span>
          </div>
          ${pkSection}
        </div>
        <p class="tma-del-confirm-txt">${escapeAttr(tr.walletsDeleteConfirmRemove)}</p>
        <div class="tma-dialog-actions">
          <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="delCancel">${escapeAttr(tr.commonCancel)}</button>
          <button type="button" class="tma-dialog-btn tma-del-go" id="delGo">${escapeAttr(tr.walletsDeleteAction)}</button>
        </div>
      </div>
    `,
      (wrap) => {
        const balEl = wrap.querySelector<HTMLElement>("#delBal");
        void fetchBalanceText(walletNodeBase, row.address).then((t) => {
          if (balEl) balEl.textContent = t;
        });
        const pkEl = wrap.querySelector<HTMLElement>("#delPk");
        const copyBtn = wrap.querySelector<HTMLButtonElement>("#delCopyPk");
        if (pkStr && pkEl) {
          attachPressHoldReveal(pkEl, { maskedText: PRIVATE_KEY_MASKED, secret: pkStr });
        }
        if (pkStr && copyBtn) {
          copyBtn.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(pkStr);
              tmaAlert(tr.walletsPkCopied);
            } catch {
              tmaAlert(tr.walletsCopyFail);
            }
          });
        }
        wrap.querySelector("#delCancel")?.addEventListener("click", () => removeTmaModal());
        wrap.querySelector("#delGo")?.addEventListener("click", () => {
          deleteWalletByAddress(row.address);
          removeTmaModal();
          tmaAlert(tr.walletsMovedToBin(row.name));
          reloadWalletsFromStore();
          paintList();
        });
      },
    );
  }

  function showSortPopup(anchor: HTMLElement): void {
    closeSort();
    closeOptions();
    const pop = document.createElement("div");
    pop.className = "tma-wallet-opts-pop tma-wallet-sort-pop";
    pop.innerHTML = `
      <button type="button" class="tma-wallet-opts-row" data-sort="date">${escapeAttr(tr.walletsSortByDate)}</button>
      <button type="button" class="tma-wallet-opts-row" data-sort="balance">${escapeAttr(tr.walletsSortByBalance)}</button>
    `;
    shell.appendChild(pop);
    sortPopup = pop;
    shrinkWrapPopup(pop);
    positionAnchorPopup(pop, anchor, shell);
    const stop = (e: MouseEvent) => {
      if (!pop.contains(e.target as Node) && e.target !== anchor) {
        closeSort();
        document.removeEventListener("click", stop, true);
      }
    };
    window.setTimeout(() => document.addEventListener("click", stop, true), 0);
    pop.querySelectorAll("[data-sort]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const s = (btn as HTMLElement).dataset.sort;
        const next: SortMode = s === "balance" ? "balance" : "date";
        if (sortMode === next) sortDesc = !sortDesc;
        else {
          sortMode = next;
          sortDesc = true;
        }
        clearWalletListOrder();
        closeSort();
        document.removeEventListener("click", stop, true);
        paintList();
      });
    });
  }

  function persistWalletOrder(addresses: string[]): void {
    const byAddr = new Map(wallets.map((w) => [w.address, w]));
    const reordered: TmaWalletRow[] = [];
    for (const addr of addresses) {
      const row = byAddr.get(addr);
      if (row) reordered.push(row);
    }
    for (const w of wallets) {
      if (!addresses.includes(w.address)) reordered.push(w);
    }
    wallets = reordered;
    sortMode = "manual";
    saveWalletRows(reordered);
    saveWalletListOrder(addresses);
  }

  const listEl = document.createElement("div");
  listEl.className = "tma-wallets-list";
  const emptyEl = document.createElement("div");
  emptyEl.className = "tma-wallets-empty";
  emptyEl.innerHTML = `
    <div class="tma-wallets-empty-ico">💳</div>
    <div class="tma-wallets-empty-title">${escapeAttr(tr.walletsEmptyTitle)}</div>
    <div class="tma-wallets-empty-sub">${escapeAttr(tr.walletsEmptySub)}</div>
  `;

  function paintList(opts?: { balancesReady?: boolean }): void {
    closeOptions();
    closeSort();
    reloadWalletsFromStore();
    const sorted = getSortedWallets();
    const active = getActiveAddress();
    if (sorted.length === 0) {
      listEl.style.display = "none";
      emptyEl.style.display = "flex";
      listEl.innerHTML = "";
      return;
    }
    emptyEl.style.display = "none";
    listEl.style.display = "flex";
    listEl.innerHTML = sorted
      .map((row) => {
        const isAct = Boolean(active && row.address === active);
        const nameHtml = isAct
          ? `<span class="tma-wallets-name-txt">${escapeAttr(row.name)}</span><span class="tma-wallets-active-dot" aria-label="Active"></span>`
          : `<span class="tma-wallets-name-txt">${escapeAttr(row.name)}</span>`;
        return `<div class="tma-wallets-card" data-address="${escapeAttr(row.address)}">
          ${walletCardIconHtml(row)}
          <div class="tma-wallets-card-mid">
            <div class="tma-wallets-card-name">${nameHtml}</div>
            <div class="tma-wallets-card-addr mono">${escapeAttr(row.address)}</div>
            <div class="tma-wallets-card-bal" data-bal="${escapeAttr(row.address)}">…</div>
          </div>
          <div class="tma-wallets-card-right">
            <button type="button" class="tma-wallets-more" data-more="${escapeAttr(row.address)}" aria-label="${escapeAttr(tr.walletsOptionsAria)}">⋮</button>
            <span class="tma-wallets-miner-badge" data-miner="${escapeAttr(row.address)}" style="display:none" aria-hidden="true"></span>
          </div>
        </div>`;
      })
      .join("");

    const balanceAddrs: string[] = [];
    listEl.querySelectorAll<HTMLElement>("[data-bal]").forEach((el) => {
      const addr = el.dataset.bal;
      if (!addr) return;
      balanceAddrs.push(addr);
      const cached = balanceLabelFromCache(addr);
      el.textContent = cached ?? "…";
    });
    if (!opts?.balancesReady) {
      void refreshAllBalances(listEl, walletNodeBase, balanceAddrs).then(() => {
        if (sortMode === "balance") paintList({ balancesReady: true });
      });
    }
    listEl.querySelectorAll<HTMLElement>("[data-miner]").forEach((el) => {
      const addr = el.dataset.miner;
      if (!addr) return;
      void fetchStakeBadgeKind(miningNodeBase, readNodeBase, addr).then((kind) => {
        if (!kind) {
          el.style.display = "none";
          el.removeAttribute("aria-hidden");
          return;
        }
        el.textContent = kind === "pool" ? tr.walletsPoolMinerBadge : tr.walletsMinerBadge;
        el.style.display = "inline-flex";
        el.removeAttribute("aria-hidden");
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>("[data-more]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const addr = btn.dataset.more;
        const row = sorted.find((w) => w.address === addr);
        if (row) showOptionsPopup(btn, row);
      });
    });
  }

  shell.innerHTML = `
    <div class="tma-wallets-inner">
      <header class="tma-wallets-header">
        <button type="button" class="tma-wallets-back" id="wBack" aria-label="${escapeAttr(tr.commonBack)}">‹</button>
        <h1 class="tma-wallets-title">${escapeAttr(tr.walletsTitle)}</h1>
        <button type="button" class="tma-wallets-sort" id="wSort" aria-label="${escapeAttr(tr.walletsSortAria)}">⇅</button>
      </header>
    </div>
  `;
  const inner = shell.querySelector(".tma-wallets-inner")!;
  inner.appendChild(listEl);
  inner.appendChild(emptyEl);

  attachWalletListReorder(listEl, (addresses) => {
    persistWalletOrder(addresses);
  });

  shell.querySelector("#wBack")?.addEventListener("click", () => {
    closeOptions();
    closeSort();
    unmountMyWalletsPage();
    onClose();
  });
  shell.querySelector("#wSort")?.addEventListener("click", (e) => {
    const btn = e.currentTarget as HTMLElement;
    showSortPopup(btn);
  });

  document.body.appendChild(shell);
  reloadWalletsFromStore();
  paintList();
}
