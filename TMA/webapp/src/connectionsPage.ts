import { t } from "./i18n";
import {
  getConnectionMode,
  getManualHost,
  isAutoSelectEnabled,
  hostToBaseUrl,
  setAutoSelectEnabled,
  setConnectionMode,
  setManualHost,
  type ConnectionMode,
} from "./nodeConnection";
import { resolveReadNodeBase } from "./nodeEndpoints";

export type MountConnectionsPageOpts = {
  onClose: () => void;
};

let pageRootEl: HTMLElement | null = null;
let statusTimer: ReturnType<typeof setInterval> | null = null;

export function unmountConnectionsPage(): void {
  if (statusTimer != null) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  pageRootEl?.remove();
  pageRootEl = null;
}

async function probeNodeConnected(base: string): Promise<boolean> {
  const bridge = window.__TMA_SHARED__;
  if (bridge?.fetchNodeInfoJson) {
    try {
      const json = JSON.parse(await bridge.fetchNodeInfoJson(base)) as { success?: boolean };
      return json.success !== false;
    } catch {
      return false;
    }
  }
  const root = base.trim().endsWith("/") ? base.trim() : `${base.trim()}/`;
  try {
    const res = await fetch(`${root}status`, { method: "GET" });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success !== false;
  } catch {
    return false;
  }
}

function setStatusUi(
  shell: HTMLElement,
  state: "checking" | "connected" | "failed",
  text: string,
): void {
  const dot = shell.querySelector("#connStatusDot");
  const txt = shell.querySelector("#connStatusText");
  const spin = shell.querySelector("#connStatusSpin");
  if (txt) txt.textContent = text;
  dot?.classList.remove("is-connected", "is-failed", "is-checking");
  if (state === "connected") {
    dot?.classList.add("is-connected");
    if (txt instanceof HTMLElement) txt.style.color = "#4CAF50";
  } else if (state === "failed") {
    dot?.classList.add("is-failed");
    if (txt instanceof HTMLElement) txt.style.color = "#F44336";
  } else {
    dot?.classList.add("is-checking");
    if (txt instanceof HTMLElement) txt.style.color = "#8E8E93";
  }
  if (spin instanceof HTMLElement) {
    spin.style.display = state === "checking" ? "block" : "none";
  }
}

function setManualStatusUi(
  shell: HTMLElement,
  visible: boolean,
  state: "checking" | "connected" | "failed" | "idle",
  text: string,
): void {
  const layout = shell.querySelector("#manualStatusLayout");
  const dot = shell.querySelector("#manualStatusDot");
  const txt = shell.querySelector("#manualStatusText");
  const spin = shell.querySelector("#manualStatusSpin");
  const connectBtn = shell.querySelector("#connManualConnect") as HTMLButtonElement | null;
  const disconnectBtn = shell.querySelector("#connManualDisconnect") as HTMLButtonElement | null;
  if (layout instanceof HTMLElement) layout.style.display = visible ? "flex" : "none";
  if (txt) txt.textContent = text;
  dot?.classList.remove("is-connected", "is-failed", "is-checking");
  if (state === "connected") {
    dot?.classList.add("is-connected");
    if (txt instanceof HTMLElement) txt.style.color = "#4CAF50";
    if (connectBtn) connectBtn.style.display = "none";
    if (disconnectBtn) disconnectBtn.style.display = "block";
  } else if (state === "failed") {
    dot?.classList.add("is-failed");
    if (txt instanceof HTMLElement) txt.style.color = "#F44336";
    if (connectBtn) connectBtn.style.display = "block";
    if (disconnectBtn) disconnectBtn.style.display = "none";
  } else if (state === "checking") {
    dot?.classList.add("is-checking");
    if (txt instanceof HTMLElement) txt.style.color = "#8E8E93";
    if (connectBtn) connectBtn.style.display = "none";
    if (disconnectBtn) disconnectBtn.style.display = "none";
  } else {
    if (txt instanceof HTMLElement) txt.style.color = "#8E8E93";
    if (connectBtn) connectBtn.style.display = "block";
    if (disconnectBtn) disconnectBtn.style.display = "none";
  }
  if (spin instanceof HTMLElement) spin.style.display = state === "checking" ? "block" : "none";
}

async function refreshAutoStatus(shell: HTMLElement): Promise<void> {
  const tr = t();
  setStatusUi(shell, "checking", tr.commonCheckingConnection);
  const ok = await probeNodeConnected(resolveReadNodeBase());
  setStatusUi(shell, ok ? "connected" : "failed", ok ? tr.commonConnected : tr.commonConnectionFailed);
  const node1 = shell.querySelector("#connNode1");
  const check = shell.querySelector("#connNode1Check");
  if (node1 && check) {
    node1.classList.toggle("tma-conn-node-item--connected", ok);
    check.toggleAttribute("hidden", !ok);
  }
}

async function refreshManualStatus(shell: HTMLElement): Promise<void> {
  const tr = t();
  const ip = (shell.querySelector("#connManualIp") as HTMLInputElement | null)?.value.trim() ?? "";
  if (!ip) {
    setManualStatusUi(shell, false, "idle", tr.commonNotConnected);
    return;
  }
  setManualStatusUi(shell, true, "checking", tr.commonConnecting);
  const ok = await probeNodeConnected(hostToBase(ip));
  setManualStatusUi(
    shell,
    true,
    ok ? "connected" : "failed",
    ok ? tr.commonConnected : tr.commonConnectionFailed,
  );
}

function hostToBase(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return resolveReadNodeBase();
  return hostToBaseUrl(trimmed) || resolveReadNodeBase();
}

function applyModeUi(shell: HTMLElement, mode: ConnectionMode): void {
  const autoSec = shell.querySelector("#connAutoSection");
  const manualSec = shell.querySelector("#connManualSection");
  const autoRadio = shell.querySelector("#connModeAuto") as HTMLInputElement | null;
  const manualRadio = shell.querySelector("#connModeManual") as HTMLInputElement | null;
  if (autoSec instanceof HTMLElement) autoSec.style.display = mode === "auto" ? "block" : "none";
  if (manualSec instanceof HTMLElement) manualSec.style.display = mode === "manual" ? "block" : "none";
  if (autoRadio) autoRadio.checked = mode === "auto";
  if (manualRadio) manualRadio.checked = mode === "manual";
}

export function mountConnectionsPage(opts: MountConnectionsPageOpts): void {
  unmountConnectionsPage();
  const tr = t();
  const mode = getConnectionMode();
  const autoSelect = isAutoSelectEnabled();
  const manualIp = getManualHost();

  const shell = document.createElement("div");
  shell.id = "tma-connections-page";
  shell.className = "tma-shell-page tma-connections-page";
  pageRootEl = shell;

  shell.innerHTML = `
    <div class="tma-shell-inner tma-conn-scroll-wrap">
      <header class="tma-shell-header">
        <button type="button" class="tma-shell-back" id="connBack" aria-label="${tr.commonBack}">‹</button>
        <h1 class="tma-shell-title">${tr.connTitle}</h1>
        <span class="tma-shell-header-spacer" aria-hidden="true"></span>
      </header>
      <div class="tma-conn-scroll">
        <section class="tma-settings-card">
          <h2 class="tma-settings-card-title">${tr.connConnectionMode}</h2>
          <label class="tma-conn-radio">
            <input type="radio" name="connMode" id="connModeAuto" value="auto" ${mode === "auto" ? "checked" : ""} />
            <span>${tr.connAutoConnect}</span>
          </label>
          <label class="tma-conn-radio">
            <input type="radio" name="connMode" id="connModeManual" value="manual" ${mode === "manual" ? "checked" : ""} />
            <span>${tr.connManualConnect}</span>
          </label>
        </section>

        <section class="tma-settings-card" id="connAutoSection" style="display:${mode === "auto" ? "block" : "none"}">
          <h2 class="tma-settings-card-title">${tr.connAutoServers}</h2>
          <p class="tma-conn-hint">${tr.connAutoServersHint}</p>
          <div class="tma-conn-switch-row">
            <span class="tma-settings-row-label">${tr.connAutoSelect}</span>
            <label class="tma-switch">
              <input type="checkbox" id="connAutoSelect" ${autoSelect ? "checked" : ""} />
              <span class="tma-switch-track" aria-hidden="true"></span>
            </label>
          </div>
          <div class="tma-conn-status-row" id="connStatusLayout">
            <span class="tma-conn-status-dot is-checking" id="connStatusDot" aria-hidden="true"></span>
            <span class="tma-conn-status-text" id="connStatusText">${tr.commonCheckingConnection}</span>
            <span class="tma-conn-status-spin" id="connStatusSpin" aria-hidden="true"></span>
          </div>
          <ul class="tma-conn-node-list">
            <li class="tma-conn-node-item" id="connNode1">
              <span class="tma-conn-node-name">${tr.connNode1}</span>
              <span class="tma-conn-node-check" id="connNode1Check" hidden aria-hidden="true">✓</span>
            </li>
          </ul>
          <button type="button" class="tma-conn-action-btn" id="connLoadValidators" disabled title="${tr.connLoadValidatorsTitle}">${tr.connLoadValidators}</button>
          <button type="button" class="tma-conn-action-btn tma-conn-action-btn--muted" id="connAddServer" disabled title="${tr.connAddServerTitle}">${tr.connAddServer}</button>
        </section>

        <section class="tma-settings-card" id="connManualSection" style="display:${mode === "manual" ? "block" : "none"}">
          <h2 class="tma-settings-card-title">${tr.connManualTitle}</h2>
          <label class="tma-conn-field-lab" for="connManualIp">${tr.connManualIpLabel}</label>
          <input type="text" class="tma-conn-inp" id="connManualIp" placeholder="${tr.connManualIpPlaceholder}" value="${manualIp.replace(/"/g, "&quot;")}" autocomplete="off" spellcheck="false" />
          <p class="tma-conn-hint">${tr.connManualHint}</p>
          <div class="tma-conn-status-row" id="manualStatusLayout" style="display:none">
            <span class="tma-conn-status-dot" id="manualStatusDot" aria-hidden="true"></span>
            <span class="tma-conn-status-text" id="manualStatusText">${tr.commonNotConnected}</span>
            <span class="tma-conn-status-spin" id="manualStatusSpin" aria-hidden="true"></span>
          </div>
          <div class="tma-conn-manual-btns">
            <button type="button" class="tma-conn-action-btn" id="connManualConnect">${tr.connConnect}</button>
            <button type="button" class="tma-conn-action-btn tma-conn-action-btn--danger" id="connManualDisconnect" style="display:none">${tr.connDisconnect}</button>
          </div>
        </section>
      </div>
    </div>
  `;

  document.body.appendChild(shell);

  shell.querySelector("#connBack")?.addEventListener("click", () => {
    unmountConnectionsPage();
    opts.onClose();
  });

  const onModeChange = (next: ConnectionMode) => {
    setConnectionMode(next);
    applyModeUi(shell, next);
    if (next === "auto") void refreshAutoStatus(shell);
    else void refreshManualStatus(shell);
  };

  shell.querySelector("#connModeAuto")?.addEventListener("change", () => {
    if ((shell.querySelector("#connModeAuto") as HTMLInputElement).checked) onModeChange("auto");
  });
  shell.querySelector("#connModeManual")?.addEventListener("change", () => {
    if ((shell.querySelector("#connModeManual") as HTMLInputElement).checked) onModeChange("manual");
  });

  shell.querySelector("#connAutoSelect")?.addEventListener("change", (e) => {
    const on = (e.target as HTMLInputElement).checked;
    setAutoSelectEnabled(on);
    void refreshAutoStatus(shell);
  });

  shell.querySelector("#connManualConnect")?.addEventListener("click", () => {
    const ip = (shell.querySelector("#connManualIp") as HTMLInputElement).value.trim();
    if (!ip) return;
    setManualHost(ip);
    void refreshManualStatus(shell);
  });

  shell.querySelector("#connManualDisconnect")?.addEventListener("click", () => {
    const inp = shell.querySelector("#connManualIp") as HTMLInputElement;
    if (inp) inp.value = "";
    setManualHost("");
    setManualStatusUi(shell, false, "idle", t().commonNotConnected);
  });

  applyModeUi(shell, mode);
  if (mode === "auto") void refreshAutoStatus(shell);
  else void refreshManualStatus(shell);

  statusTimer = setInterval(() => {
    if (getConnectionMode() === "auto") void refreshAutoStatus(shell);
  }, 10000);
}
