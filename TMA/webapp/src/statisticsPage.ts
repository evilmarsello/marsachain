import { emissionProgressLabel } from "./chainEmission";
import type { Messages } from "./i18n";
import { formatMrsFromNanos } from "./miningPow";
import {
  fetchMiningStatsJsonMulti,
  miningStatsDisplayValues,
  parseMiningStatsJson,
} from "./miningStatsFetch";
import {
  readLocalMiningStats,
  resetLocalMiningStats,
  type LocalMiningStats,
} from "./miningLocalStats";
import { attachModalEscape, removeTmaModal } from "./modal";

export type StatisticsLabels = Pick<
  Messages,
  | "commonBack"
  | "commonCancel"
  | "commonReset"
  | "statsTitle"
  | "statsYourMining"
  | "statsBlocksMined"
  | "statsTotalRewards"
  | "statsNetwork"
  | "statsChainHeight"
  | "statsEmission"
  | "statsActiveMiners"
  | "statsStakedMiners"
  | "statsTotalMiners"
  | "statsBlocksPerHour"
  | "statsAvgHashrate"
  | "statsInfoTitle"
  | "statsInfoBody"
  | "statsResetTitle"
  | "statsResetHint"
>;

export type MountStatisticsPageOpts = {
  escapeAttr: (s: string) => string;
  labels: StatisticsLabels;
  readNodeBase: string;
  miningNodeBase: string;
  onClose: () => void;
};

let pageRootEl: HTMLElement | null = null;

export function unmountStatisticsPage(): void {
  pageRootEl?.remove();
  pageRootEl = null;
}

function formatHashrate(hashrate: number): string {
  if (hashrate >= 1e18) return `${Math.floor(hashrate / 1e18)} EH/s`;
  if (hashrate >= 1e15) return `${Math.floor(hashrate / 1e15)} PH/s`;
  if (hashrate >= 1e12) return `${Math.floor(hashrate / 1e12)} TH/s`;
  if (hashrate >= 1e9) return `${Math.floor(hashrate / 1e9)} GH/s`;
  if (hashrate >= 1e6) return `${Math.floor(hashrate / 1e6)} MH/s`;
  if (hashrate >= 1e3) return `${Math.floor(hashrate / 1e3)} KH/s`;
  return `${Math.floor(hashrate)} H/s`;
}

function statsRow(escapeAttr: (s: string) => string, label: string, valueId: string, initial: string): string {
  return `<div class="tma-stats-row"><span class="tma-stats-label">${escapeAttr(label)}</span><span class="tma-stats-value" id="${valueId}">${escapeAttr(initial)}</span></div>`;
}

function paintLocalStats(shell: HTMLElement, local: LocalMiningStats): void {
  const blocksEl = shell.querySelector("#statsBlocksMined");
  const rewardsEl = shell.querySelector("#statsTotalRewards");
  if (blocksEl) blocksEl.textContent = String(local.blocksMined);
  if (rewardsEl) rewardsEl.textContent = formatMrsFromNanos(local.totalRewardsNanos);
}

function parseChainHeight(raw: unknown): number {
  if (raw == null) return -1;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw >= 0 ? Math.floor(raw) : -1;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : -1;
  }
  return -1;
}

function showResetDialog(shell: HTMLElement, labels: StatisticsLabels, escapeAttr: (s: string) => string): void {
  removeTmaModal();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = `
    <div class="tma-dialog" role="dialog" aria-modal="true">
      <h2 class="tma-dialog-title">${escapeAttr(labels.statsResetTitle)}</h2>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(labels.statsResetHint)}</p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="statsResetCancel">${escapeAttr(labels.commonCancel)}</button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="statsResetConfirm">${escapeAttr(labels.commonReset)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  attachModalEscape(wrap, () => removeTmaModal());
  wrap.querySelector("#statsResetCancel")?.addEventListener("click", () => removeTmaModal());
  wrap.querySelector("#statsResetConfirm")?.addEventListener("click", () => {
    resetLocalMiningStats();
    paintLocalStats(shell, readLocalMiningStats());
    removeTmaModal();
  });
}

async function loadNetworkStats(
  shell: HTMLElement,
  readNodeBase: string,
  miningNodeBase: string,
): Promise<void> {
  const bridge = window.__TMA_SHARED__;
  const heightEl = shell.querySelector("#statsNetworkHeight");
  const emissionEl = shell.querySelector("#statsEmission");
  const activeEl = shell.querySelector("#statsActiveMiners");
  const stakedEl = shell.querySelector("#statsStakedMiners");
  const totalEl = shell.querySelector("#statsTotalMiners");
  const bphEl = shell.querySelector("#statsBlocksPerHour");
  const hashEl = shell.querySelector("#statsAvgHashrate");

  let chainBits: number | undefined;

  try {
    if (bridge?.fetchNodeInfoJson) {
      const nodeJson = JSON.parse(await bridge.fetchNodeInfoJson(readNodeBase)) as {
        height?: unknown;
        bits?: unknown;
        difficulty?: unknown;
      };
      const height = parseChainHeight(nodeJson.height);
      if (heightEl) heightEl.textContent = height >= 0 ? String(height) : "—";
      if (emissionEl) emissionEl.textContent = height >= 0 ? emissionProgressLabel(height) : "—";
      const bitsRaw = nodeJson.bits ?? nodeJson.difficulty;
      if (typeof bitsRaw === "number" && Number.isFinite(bitsRaw)) chainBits = bitsRaw;
    }
  } catch {
    if (emissionEl) emissionEl.textContent = "—";
  }

  try {
    const statsJson = await fetchMiningStatsJsonMulti([miningNodeBase, readNodeBase]);
    if (!statsJson) return;
    const parsed = parseMiningStatsJson(statsJson);
    if (!parsed) return;
    if (activeEl) activeEl.textContent = String(parsed.activeMiners);
    if (stakedEl) stakedEl.textContent = String(parsed.stakedMiners);
    if (totalEl) totalEl.textContent = String(parsed.totalMiners);
    const display = miningStatsDisplayValues(parsed, chainBits);
    if (bphEl) bphEl.textContent = String(display.blocksPerHour);
    if (hashEl) hashEl.textContent = formatHashrate(display.averageHashrate);
  } catch {
    /* silent — same as Android StatisticsFragment */
  }
}

export function mountStatisticsPage(opts: MountStatisticsPageOpts): void {
  unmountStatisticsPage();
  const { escapeAttr, labels, readNodeBase, miningNodeBase, onClose } = opts;
  const local = readLocalMiningStats();

  const shell = document.createElement("div");
  shell.id = "tma-statistics-page";
  shell.className = "tma-shell-page tma-statistics-page";
  pageRootEl = shell;

  shell.innerHTML = `
    <div class="tma-shell-inner tma-stats-inner">
      <header class="tma-shell-header">
        <button type="button" class="tma-shell-back" id="statsBack" aria-label="${escapeAttr(labels.commonBack)}">‹</button>
        <h1 class="tma-shell-title">${escapeAttr(labels.statsTitle)}</h1>
        <span class="tma-shell-header-spacer" aria-hidden="true"></span>
      </header>
      <div class="tma-stats-scroll">
        <section class="card tma-stats-card">
          <h2 class="tma-stats-card-title">${escapeAttr(labels.statsYourMining)}</h2>
          ${statsRow(escapeAttr, labels.statsBlocksMined, "statsBlocksMined", String(local.blocksMined))}
          ${statsRow(escapeAttr, labels.statsTotalRewards, "statsTotalRewards", formatMrsFromNanos(local.totalRewardsNanos))}
          <div class="tma-stats-reset-wrap">
            <button type="button" class="tma-stats-reset-btn" id="statsResetBtn">${escapeAttr(labels.commonReset)}</button>
          </div>
        </section>
        <section class="card tma-stats-card">
          <h2 class="tma-stats-card-title">${escapeAttr(labels.statsNetwork)}</h2>
          ${statsRow(escapeAttr, labels.statsChainHeight, "statsNetworkHeight", "0")}
          ${statsRow(escapeAttr, labels.statsEmission, "statsEmission", "—")}
          ${statsRow(escapeAttr, labels.statsActiveMiners, "statsActiveMiners", "0")}
          ${statsRow(escapeAttr, labels.statsStakedMiners, "statsStakedMiners", "0")}
          ${statsRow(escapeAttr, labels.statsTotalMiners, "statsTotalMiners", "0")}
          ${statsRow(escapeAttr, labels.statsBlocksPerHour, "statsBlocksPerHour", "0")}
          ${statsRow(escapeAttr, labels.statsAvgHashrate, "statsAvgHashrate", "0")}
        </section>
        <section class="card tma-stats-card">
          <h2 class="tma-stats-card-title tma-stats-info-title">${escapeAttr(labels.statsInfoTitle)}</h2>
          <p class="tma-stats-info-body">${escapeAttr(labels.statsInfoBody)}</p>
        </section>
      </div>
    </div>
  `;

  shell.querySelector("#statsBack")?.addEventListener("click", () => {
    unmountStatisticsPage();
    onClose();
  });
  shell.querySelector("#statsResetBtn")?.addEventListener("click", () => {
    showResetDialog(shell, labels, escapeAttr);
  });

  document.body.appendChild(shell);
  void loadNetworkStats(shell, readNodeBase, miningNodeBase);
}
