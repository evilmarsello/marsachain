import { t } from "./i18n";
import { attachModalEscape, removeTmaModal } from "./modal";
import { buildMinerPoolUnstakeTransaction, submitTransaction } from "./marsaTransaction";
import { getPrivateKeyBase64ForRow, type TmaWalletRow } from "./walletStore";
import { fetchPoolBind, poolBindIsActive } from "./poolApi";
import { clearPoolChosen, clearPoolStakePending } from "./poolMode";
import { resetPoolWalletAfterLeave } from "./poolInfoHelpers";
import { clearPoolsListActiveMembership } from "./poolUiCache";

const POOL_UNSTAKE_FEE_NANOS = 100_000_000;

export type OpenMinerPoolLeaveOpts = {
  escapeAttr: (s: string) => string;
  tmaAlert: (msg: string) => void;
  nodeBase: string;
  wallet: TmaWalletRow;
  poolId: number;
  poolName: string;
  currentHeight: number;
  onSuccess: () => void;
};

export function openMinerPoolLeaveModal(opts: OpenMinerPoolLeaveOpts): void {
  const { escapeAttr, tmaAlert, nodeBase, wallet, poolId, poolName, currentHeight, onSuccess } =
    opts;
  const tr = t();

  removeTmaModal();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = `
    <div class="tma-dialog" role="dialog" aria-modal="true">
      <h2 class="tma-dialog-title">${escapeAttr(tr.poolLeaveTitle(poolName))}</h2>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolLeaveHint)}</p>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolLeaveOwedNote)}</p>
      <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolStakeFeeHint)}</p>
      <div class="tma-dialog-actions">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="dlgPoolLeaveCancel">${escapeAttr(tr.commonCancel)}</button>
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgPoolLeaveGo">${escapeAttr(tr.poolFinishUnstakeBtn)}</button>
      </div>
    </div>
  `;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) removeTmaModal();
  });
  document.body.appendChild(wrap);
  attachModalEscape();

  wrap.querySelector("#dlgPoolLeaveCancel")?.addEventListener("click", () => removeTmaModal());
  wrap.querySelector("#dlgPoolLeaveGo")?.addEventListener("click", () => {
    void (async () => {
      const pk = getPrivateKeyBase64ForRow(wallet);
      if (!pk) {
        tmaAlert(tr.alertNoSigningKey);
        return;
      }
      const bind = await fetchPoolBind(nodeBase, wallet.address);
      if (!poolBindIsActive(bind)) {
        tmaAlert(tr.poolLeaveNotActive);
        return;
      }
      const tx = buildMinerPoolUnstakeTransaction(
        wallet.address,
        poolId,
        POOL_UNSTAKE_FEE_NANOS,
        currentHeight,
        pk,
      );
      if (!tx) {
        tmaAlert(tr.alertTxSignFailed);
        return;
      }
      removeTmaModal();
      tmaAlert(tr.poolLeaveSending);
      const res = await submitTransaction(nodeBase, tx);
      if (res.ok) {
        clearPoolStakePending();
        clearPoolChosen(wallet.address);
        resetPoolWalletAfterLeave(wallet.address);
        clearPoolsListActiveMembership(wallet.address);
        tmaAlert(tr.poolLeaveSent);
        onSuccess();
      } else {
        tmaAlert(res.message);
      }
    })();
  });
}
