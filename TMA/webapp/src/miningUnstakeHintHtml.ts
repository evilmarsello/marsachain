import type { Messages } from "./i18n";

export function miningUnstakeHintBtnHtml(
  escapeAttr: (s: string) => string,
  tr: Pick<Messages, "miningFinishSoloStakeLine1" | "miningFinishSoloStakeLine2">,
): string {
  return `<span class="mining-msg-line">${escapeAttr(tr.miningFinishSoloStakeLine1)}</span><span class="mining-msg-line">${escapeAttr(tr.miningFinishSoloStakeLine2)}</span>`;
}

export function miningOrphanPoolHintBtnHtml(
  escapeAttr: (s: string) => string,
  tr: Pick<Messages, "miningOrphanPoolStakeLine1" | "miningOrphanPoolStakeLine2">,
): string {
  return `<span class="mining-msg-line">${escapeAttr(tr.miningOrphanPoolStakeLine1)}</span><span class="mining-msg-line">${escapeAttr(tr.miningOrphanPoolStakeLine2)}</span>`;
}

export function miningWalletInPoolHintBtnHtml(
  escapeAttr: (s: string) => string,
  tr: Pick<Messages, "miningWalletInPoolLine1" | "miningWalletInPoolLine2">,
  poolName: string,
): string {
  return `<span class="mining-msg-line">${escapeAttr(tr.miningWalletInPoolLine1)}</span><span class="mining-msg-line">${escapeAttr(tr.miningWalletInPoolLine2(poolName))}</span>`;
}
