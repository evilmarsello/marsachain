import { t } from "./i18n";
import { attachModalEscape, removeTmaModal } from "./modal";
import { buildMinerPoolStakeTransaction, submitTransaction } from "./marsaTransaction";
import { getPrivateKeyBase64ForRow, type TmaWalletRow } from "./walletStore";
import { fetchPoolBind, poolBindIsActive } from "./poolApi";
import { formatNodeTxError } from "./poolTxErrors";
import { setPoolStakePending, clearPoolStakePending } from "./poolMode";

const WEI_PER_COIN = 100_000_000;
const POOL_STAKE_FEE_NANOS = WEI_PER_COIN;

function parseToNanos(coinsString: string): number | null {
  const normalized = coinsString.trim().replace(",", ".");
  if (!normalized) return null;
  const x = Number(normalized);
  if (!Number.isFinite(x) || x < 0) return null;
  return Math.round(x * WEI_PER_COIN);
}

export type OpenCreateMinerPoolStakeOpts = {
  escapeAttr: (s: string) => string;
  tmaAlert: (msg: string) => void;
  nodeBase: string;
  wallet: TmaWalletRow;
  balanceMrs: string;
  poolId: number;
  poolName: string;
  minStakeNanos: number;
  currentHeight: number;
  onSuccess: () => void;
};

export function openCreateMinerPoolStakeModal(opts: OpenCreateMinerPoolStakeOpts): void {
  const {
    escapeAttr,
    tmaAlert,
    nodeBase,
    wallet,
    balanceMrs,
    poolId,
    poolName,
    minStakeNanos,
    currentHeight,
    onSuccess,
  } = opts;
  const tr = t();
  const minMrs = (minStakeNanos / WEI_PER_COIN).toString();

  removeTmaModal();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = `
    <div class="tma-dialog" role="dialog" aria-modal="true" aria-labelledby="dlgPoolStakeTitle">
      <h2 class="tma-dialog-title" id="dlgPoolStakeTitle">${escapeAttr(tr.poolStakeTitle(poolName))}</h2>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolStakeBalance(balanceMrs))}</p>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolStakeMin(minMrs))}</p>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolStakeFeeHint)}</p>
      <label class="tma-dialog-label" for="dlgPoolStakeAmt">${escapeAttr(tr.stakeAmountLabel)}</label>
      <input type="text" class="tma-dialog-inp" id="dlgPoolStakeAmt" inputmode="decimal" placeholder="${escapeAttr(tr.poolStakeAmountPlaceholder)}" autocomplete="off" />
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.stakeRefillHint)}</p>
      <p class="tma-dialog-hint tma-dialog-hint--center tma-dialog-hint--tight">${escapeAttr(tr.poolStakeLockHint)}</p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="dlgPoolStakeCancel">${escapeAttr(tr.commonCancel)}</button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgPoolStakeGo">${escapeAttr(tr.poolStakeCreateBtn)}</button>
      </div>
    </div>
  `;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) removeTmaModal();
  });
  document.body.appendChild(wrap);
  attachModalEscape();

  const amt = wrap.querySelector<HTMLInputElement>("#dlgPoolStakeAmt");
  wrap.querySelector("#dlgPoolStakeCancel")?.addEventListener("click", () => removeTmaModal());

  wrap.querySelector("#dlgPoolStakeGo")?.addEventListener("click", () => {
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
      if (balNanos != null && stakeNanos + POOL_STAKE_FEE_NANOS > balNanos) {
        tmaAlert(tr.stakeInsufficient);
        return;
      }
      const pk = getPrivateKeyBase64ForRow(wallet);
      if (!pk) {
        tmaAlert(tr.alertNoSigningKey);
        return;
      }
      const tx = buildMinerPoolStakeTransaction(
        wallet.address,
        poolId,
        stakeNanos,
        POOL_STAKE_FEE_NANOS,
        currentHeight,
        pk,
      );
      if (!tx) {
        tmaAlert(tr.alertTxSignFailed);
        return;
      }
      removeTmaModal();
      tmaAlert(tr.poolStakeSending);
      const res = await submitTransaction(nodeBase, tx);
      if (!res.ok) {
        tmaAlert(formatNodeTxError(res.message, res.reason));
        return;
      }
      setPoolStakePending(wallet.address);
      tmaAlert(tr.poolStakeSent);
      onSuccess();
      void pollPoolStakeConfirmed(nodeBase, wallet.address, tmaAlert, onSuccess);
    })();
  });
}

async function pollPoolStakeConfirmed(
  nodeBase: string,
  address: string,
  tmaAlert: (msg: string) => void,
  onSuccess: () => void,
): Promise<void> {
  const tr = t();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => window.setTimeout(r, 2000));
    try {
      const bind = await fetchPoolBind(nodeBase, address);
      if (poolBindIsActive(bind)) {
        clearPoolStakePending();
        tmaAlert(tr.poolStakeConfirmed);
        onSuccess();
        return;
      }
    } catch {
      /* retry */
    }
  }
  onSuccess();
}
