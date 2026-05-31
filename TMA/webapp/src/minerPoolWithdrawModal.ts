import { sign } from "@noble/ed25519";
import { base64DecodeLoose, keyPairFromPrivateKeyB64 } from "./crypto/marsaKey";
import { t } from "./i18n";
import { attachModalEscape, removeTmaModal } from "./modal";
import { fetchPoolOwed, formatWeiToMrs, requestPoolWithdraw } from "./poolBackendApi";
import { formatPoolWithdrawReasons } from "./poolWithdrawReasons";
import { getPrivateKeyBase64ForRow, type TmaWalletRow } from "./walletStore";

function bytesToB64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
}

function buildWithdrawMessage(
  miner: string,
  poolId: number,
  amountWei: string,
  nonce: string,
): string {
  return `marsa:pool:withdraw:${miner}:${poolId}:${amountWei}:${nonce}`;
}

export type OpenPoolWithdrawOpts = {
  escapeAttr: (s: string) => string;
  tmaAlert: (msg: string) => void;
  wallet: TmaWalletRow;
  poolId: number;
  onSuccess: () => void;
};

export function openMinerPoolWithdrawModal(opts: OpenPoolWithdrawOpts): void {
  const { escapeAttr, tmaAlert, wallet, poolId, onSuccess } = opts;
  const tr = t();

  void (async () => {
    const owed = await fetchPoolOwed(wallet.address);
    if (!owed?.can_withdraw || !owed.owed_wei) {
      tmaAlert(formatPoolWithdrawReasons(owed?.reasons, tr));
      return;
    }

    const grossMrs = formatWeiToMrs(owed.owed_wei ?? "0");
    const netMrs = formatWeiToMrs(owed.payout_net_wei ?? owed.owed_wei ?? "0");
    const feeMrs = formatWeiToMrs(owed.withdraw_fee_wei ?? "100000000");
    removeTmaModal();
    const wrap = document.createElement("div");
    wrap.id = "tma-modal-root";
    wrap.className = "tma-modal-overlay";
    wrap.innerHTML = `
      <div class="tma-dialog" role="dialog" aria-modal="true">
        <h2 class="tma-dialog-title">${escapeAttr(tr.poolWithdrawTitle)}</h2>
        <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolsOwedGrossLabel(grossMrs))}</p>
        <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolWithdrawNetReceive(netMrs))}</p>
        <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolWithdrawFeeDeducted(feeMrs))}</p>
        <p class="tma-dialog-hint tma-dialog-hint--center">${escapeAttr(tr.poolWithdrawHint)}</p>
        <div class="tma-dialog-actions">
          <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="dlgWdCancel">${escapeAttr(tr.commonCancel)}</button>
          <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="dlgWdGo">${escapeAttr(tr.commonSend)}</button>
        </div>
      </div>
    `;
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) removeTmaModal();
    });
    document.body.appendChild(wrap);
    attachModalEscape();

    wrap.querySelector("#dlgWdCancel")?.addEventListener("click", () => removeTmaModal());
    wrap.querySelector("#dlgWdGo")?.addEventListener("click", () => {
      void (async () => {
        const pk = getPrivateKeyBase64ForRow(wallet);
        if (!pk) {
          tmaAlert(tr.alertNoSigningKey);
          return;
        }
        const sk = base64DecodeLoose(pk);
        if (!sk || sk.length !== 32) {
          tmaAlert(tr.alertTxSignFailed);
          return;
        }
        const nonce = `${Date.now()}`;
        const msg = buildWithdrawMessage(wallet.address, poolId, owed.owed_wei!, nonce);
        let signature: string;
        try {
          const sig = await sign(new TextEncoder().encode(msg), sk);
          signature = bytesToB64(sig);
        } catch {
          tmaAlert(tr.alertTxSignFailed);
          return;
        }
        const kp = keyPairFromPrivateKeyB64(pk);
        if (!kp) {
          tmaAlert(tr.alertNoSigningKey);
          return;
        }
        const pubKey = bytesToB64(kp.publicKeyBytes);
        removeTmaModal();
        tmaAlert(tr.poolWithdrawSending);
        const res = await requestPoolWithdraw({
          miner_address: wallet.address,
          pool_id: poolId,
          signature,
          pub_key: pubKey,
          nonce,
        });
        if (res.ok) {
          tmaAlert(tr.poolWithdrawSent);
          onSuccess();
        } else {
          tmaAlert(res.message);
        }
      })();
    });
  })();
}
