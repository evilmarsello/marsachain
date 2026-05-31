import { getActiveAddress, loadWalletRows } from "./walletStore";

export type WalletPickerRow = { address: string; name: string };

function shortWalletAddress(addr: string): string {
  const a = addr.trim();
  if (a.length <= 16) return a;
  return `${a.slice(0, 10)}…${a.slice(-6)}`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function pickerLabel(row: WalletPickerRow | undefined): string {
  if (!row) return "—";
  return `${row.name} — ${shortWalletAddress(row.address)}`;
}

function isActiveWalletAddress(address: string): boolean {
  const active = getActiveAddress()?.trim() ?? "";
  return Boolean(active && address.trim() === active);
}

export function walletPickerHtml(currentAddress: string, esc: (s: string) => string = escapeAttr): string {
  const rows = loadWalletRows();
  if (rows.length === 0) return "";
  const cur = currentAddress.trim() || getActiveAddress()?.trim() || "";
  const activeRow = rows.find((w) => w.address === cur) ?? rows[0];
  const triggerDot =
    activeRow && isActiveWalletAddress(activeRow.address)
      ? `<span class="wallet-picker-trigger-dot wallet-picker-dot" aria-hidden="true"></span>`
      : "";
  const items = rows
    .map((w) => {
      const active = isActiveWalletAddress(w.address);
      const selected = w.address === (activeRow?.address ?? "");
      const dot = active ? `<span class="wallet-picker-dot" aria-hidden="true"></span>` : "";
      return (
        `<button type="button" class="wallet-picker-item${active ? " is-active-wallet" : ""}" data-address="${esc(w.address)}" role="option" aria-selected="${selected}">` +
        `<span class="wallet-picker-item-text">${escapeText(w.name)} — <span class="mono">${escapeText(shortWalletAddress(w.address))}</span></span>` +
        dot +
        `</button>`
      );
    })
    .join("");
  return (
    `<div class="wallet-picker" id="walletPicker" data-value="${esc(activeRow?.address ?? "")}">` +
    `<button type="button" class="wallet-picker-trigger" id="walletPickerTrigger" aria-haspopup="listbox" aria-expanded="false">` +
    `<span class="wallet-picker-trigger-text" id="walletPickerLabel">${escapeText(pickerLabel(activeRow))}</span>` +
    triggerDot +
    `<span class="wallet-picker-chevron" aria-hidden="true"></span>` +
    `</button>` +
    `<div class="wallet-picker-menu" id="walletPickerMenu" role="listbox" hidden>${items}</div>` +
    `</div>`
  );
}


let walletPickerDocClick: ((e: MouseEvent) => void) | null = null;

function chromeBottomInsetPx(): number {
  const nav = document.querySelector<HTMLElement>(".bottom-nav");
  if (nav) {
    const top = nav.getBoundingClientRect().top;
    if (top > 0 && top < window.innerHeight) return window.innerHeight - top;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--tma-chrome-bottom").trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 58;
}

function chromeTopInsetPx(): number {
  const bar = document.querySelector<HTMLElement>(".top-bar");
  if (bar) return bar.getBoundingClientRect().bottom;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--tma-chrome-top").trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 62;
}

function layoutWalletPickerMenu(
  root: HTMLElement,
  trigger: HTMLElement,
  menu: HTMLElement,
): void {
  const triggerRect = trigger.getBoundingClientRect();
  const bottomInset = chromeBottomInsetPx();
  const topInset = chromeTopInsetPx();
  const gap = 4;
  const spaceBelow = window.innerHeight - bottomInset - triggerRect.bottom - gap;
  const spaceAbove = triggerRect.top - topInset - gap;
  const minHeight = 120;
  const preferBelow = spaceBelow >= minHeight || spaceBelow >= spaceAbove;

  menu.style.position = "fixed";
  menu.style.left = `${Math.max(8, triggerRect.left)}px`;
  menu.style.width = `${Math.max(160, triggerRect.width)}px`;
  menu.style.right = "auto";
  menu.style.zIndex = "2200";

  if (preferBelow) {
    menu.classList.remove("wallet-picker-menu--above");
    menu.style.top = `${triggerRect.bottom + gap}px`;
    menu.style.bottom = "auto";
    menu.style.maxHeight = `${Math.max(minHeight, spaceBelow)}px`;
  } else {
    menu.classList.add("wallet-picker-menu--above");
    menu.style.bottom = `${window.innerHeight - triggerRect.top + gap}px`;
    menu.style.top = "auto";
    menu.style.maxHeight = `${Math.max(minHeight, spaceAbove)}px`;
  }
}

function resetWalletPickerMenuLayout(menu: HTMLElement): void {
  menu.style.position = "";
  menu.style.left = "";
  menu.style.right = "";
  menu.style.top = "";
  menu.style.bottom = "";
  menu.style.width = "";
  menu.style.maxHeight = "";
  menu.style.zIndex = "";
  menu.classList.remove("wallet-picker-menu--above");
}

export function bindWalletPicker(onSelect: (address: string) => void): void {
  const root = document.getElementById("walletPicker");
  const trigger = document.getElementById("walletPickerTrigger");
  const menu = document.getElementById("walletPickerMenu");
  const label = document.getElementById("walletPickerLabel");
  if (!root || !trigger || !menu || !label) return;

  const syncTriggerDot = (addr: string) => {
    const on = isActiveWalletAddress(addr);
    let dot = trigger.querySelector(".wallet-picker-trigger-dot");
    if (on && !dot) {
      dot = document.createElement("span");
      dot.className = "wallet-picker-trigger-dot wallet-picker-dot";
      dot.setAttribute("aria-hidden", "true");
      const chevron = trigger.querySelector(".wallet-picker-chevron");
      if (chevron) trigger.insertBefore(dot, chevron);
      else trigger.appendChild(dot);
    } else if (!on) {
      dot?.remove();
    }
  };

  const close = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    root.classList.remove("is-open");
    resetWalletPickerMenuLayout(menu);
  };

  const open = () => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    root.classList.add("is-open");
    layoutWalletPickerMenu(root, trigger, menu);
  };

  const stopTouchBubble = (e: Event) => {
    e.stopPropagation();
  };
  menu.addEventListener("touchstart", stopTouchBubble, { passive: true });

  trigger.onclick = (e) => {
    e.stopPropagation();
    if (menu.hidden) open();
    else close();
  };

  menu.querySelectorAll<HTMLButtonElement>(".wallet-picker-item").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const addr = btn.dataset.address?.trim() ?? "";
      if (!addr) return;
      root.dataset.value = addr;
      const row = loadWalletRows().find((w) => w.address === addr);
      label.textContent = pickerLabel(row);
      syncTriggerDot(addr);
      menu.querySelectorAll(".wallet-picker-item").forEach((el) => {
        const item = el as HTMLButtonElement;
        const itemAddr = item.dataset.address?.trim() ?? "";
        const on = isActiveWalletAddress(itemAddr);
        item.classList.toggle("is-active-wallet", on);
        item.setAttribute("aria-selected", itemAddr === addr ? "true" : "false");
        const dot = item.querySelector(".wallet-picker-dot");
        if (on && !dot) {
          const span = document.createElement("span");
          span.className = "wallet-picker-dot";
          span.setAttribute("aria-hidden", "true");
          item.appendChild(span);
        } else if (!on) {
          dot?.remove();
        }
      });
      close();
      onSelect(addr);
    };
  });

  if (walletPickerDocClick) {
    document.removeEventListener("click", walletPickerDocClick);
  }
  walletPickerDocClick = (e: MouseEvent) => {
    if (!root.contains(e.target as Node)) close();
  };
  document.addEventListener("click", walletPickerDocClick);
}

export function walletPickerAddress(): string {
  const root = document.getElementById("walletPicker");
  return root?.dataset.value?.trim() ?? "";
}
