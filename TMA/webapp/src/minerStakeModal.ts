import { t } from "./i18n";
import { attachModalEscape, removeTmaModal } from "./modal";
import { buildMinerStakeTransaction, submitTransaction } from "./marsaTransaction";
import { getPrivateKeyBase64ForRow, type TmaWalletRow } from "./walletStore";

const WEI_PER_COIN = 100_000_000;

function parseToNanos(coinsString: string): number | null {
  const normalized = coinsString.trim().replace(",", ".");
  if (!normalized) return null;
  const x = Number(normalized);
  if (!Number.isFinite(x) || x < 0) return null;
  return Math.round(x * WEI_PER_COIN);
}

export type OpenCreateMinerStakeOpts = {
  escapeAttr: (s: string) => string;
  tmaAlert: (msg: string) => void;
  nodeBase: string;
  wallet: TmaWalletRow;
  balanceMrs: string;
  minStakeNanos: number;
  currentHeight: number;
  onSuccess: () => void;
};

export function openCreateMinerStakeModal(opts: OpenCreateMinerStakeOpts): void {
  const { escapeAttr, tmaAlert, nodeBase, wallet, balanceMrs, minStakeNanos, currentHeight, onSuccess } =
    opts;
  const tr = t();
  const minMrs = (minStakeNanos / WEI_PER_COIN).toString();

  removeTmaModal();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = `
    <div class="tma-dialog" role="dialog" aria-modal="true" aria-labelledby="dlgStakeTitle">
      <h2 class="tma-dialog-title" id="dlgStakeTitle">${escapeAttr(tr.stakeTitle)}</h2>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.stakeBalance(balanceMrs))}</p>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.stakeMin(minMrs))}</p>
      <label class="tma-dialog-label" for="dlgStakeAmt">${escapeAttr(tr.stakeAmountLabel)}</label>
      <input type="text" class="tma-dialog-inp" id="dlgStakeAmt" inputmode="decimal" placeholder="${escapeAttr(tr.stakeAmountPlaceholder)}" autocomplete="off" />
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.stakeCreditsHint)}</p>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.stakeRefillHint)}</p>
      <p class="tma-dialog-hint tma-dialog-hint--center tma-dialog-hint--tight">${escapeAttr(tr.stakeLockHint)}</p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="dlgStakeCancel">${escapeAttr(tr.commonCancel)}</button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgStakeGo">${escapeAttr(tr.stakeCreateBtn)}</button>
      </div>
    </div>
  `;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) removeTmaModal();
  });
  document.body.appendChild(wrap);
  attachModalEscape();

  const amt = wrap.querySelector<HTMLInputElement>("#dlgStakeAmt");
  wrap.querySelector("#dlgStakeCancel")?.addEventListener("click", () => removeTmaModal());

  wrap.querySelector("#dlgStakeGo")?.addEventListener("click", () => {
    void (async () => {
      const raw = amt?.value.trim() ?? "";
      if (!raw) {
        tmaAlert(tr.stakeEnterAmount);
        return;
      }
      const stakeNanos = parseToNanos(raw);
      if (stakeNanos == null || stakeNanos <= 0) {
        tmaAlert(tr.stakeInvalidAmount);
        return;
      }
      if (stakeNanos < minStakeNanos) {
        tmaAlert(tr.stakeMinAmount(minMrs));
        return;
      }
      const balNanos = parseToNanos(balanceMrs);
      if (balNanos != null && stakeNanos > balNanos) {
        tmaAlert(tr.stakeInsufficient);
        return;
      }
      const pk = getPrivateKeyBase64ForRow(wallet);
      if (!pk) {
        tmaAlert(tr.alertNoSigningKey);
        return;
      }
      const tx = buildMinerStakeTransaction(wallet.address, stakeNanos, 0, currentHeight, pk);
      if (!tx) {
        tmaAlert(tr.alertTxSignFailed);
        return;
      }
      removeTmaModal();
      tmaAlert(tr.stakeSending);
      const res = await submitTransaction(nodeBase, tx);
      if (!res.ok) {
        tmaAlert(res.message);
        return;
      }
      tmaAlert(tr.stakeSent);
      onSuccess();
      void pollStakeConfirmed(nodeBase, wallet.address, tmaAlert, onSuccess);
    })();
  });
}

async function pollStakeConfirmed(
  nodeBase: string,
  address: string,
  tmaAlert: (msg: string) => void,
  onSuccess: () => void,
): Promise<void> {
  const bridge = window.__TMA_SHARED__;
  if (!bridge?.fetchMiningInfoJson) return;
  const tr = t();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => window.setTimeout(r, 2000));
    try {
      const json = await bridge.fetchMiningInfoJson(nodeBase, address);
      const o = JSON.parse(json) as Record<string, unknown>;
      const d = o.data as Record<string, unknown> | undefined;
      if (o.ok && d && d.has_stake === true) {
        tmaAlert(tr.stakeConfirmed);
        onSuccess();
        return;
      }
    } catch {
      /* retry */
    }
  }
  onSuccess();
}
