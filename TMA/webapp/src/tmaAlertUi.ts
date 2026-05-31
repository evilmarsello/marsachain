import { t } from "./i18n";
import { attachModalEscape, removeTmaModal } from "./modal";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function showTmaAlert(message: string): void {
  const tr = t();
  removeTmaModal();
  const wrap = document.createElement("div");
  wrap.id = "tma-modal-root";
  wrap.className = "tma-modal-overlay";
  wrap.innerHTML = `
    <div class="tma-dialog tma-dialog--alert" role="alertdialog" aria-modal="true" aria-labelledby="tmaAlertMsg">
      <p class="tma-dialog-alert-msg" id="tmaAlertMsg">${escapeHtml(message)}</p>
      <div class="tma-dialog-actions tma-dialog-actions--alert">
        <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="tmaAlertOk">${escapeHtml(tr.commonOk)}</button>
      </div>
    </div>
  `;
  const close = () => removeTmaModal();
  wrap.querySelector("#tmaAlertOk")?.addEventListener("click", close);
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });
  document.body.appendChild(wrap);
  attachModalEscape();
}

export function showTmaConfirm(message: string): Promise<boolean> {
  const tr = t();
  return new Promise((resolve) => {
    removeTmaModal();
    const wrap = document.createElement("div");
    wrap.id = "tma-modal-root";
    wrap.className = "tma-modal-overlay";
    wrap.innerHTML = `
      <div class="tma-dialog tma-dialog--alert" role="alertdialog" aria-modal="true" aria-labelledby="tmaConfirmMsg">
        <p class="tma-dialog-alert-msg" id="tmaConfirmMsg">${escapeHtml(message)}</p>
        <div class="tma-dialog-actions tma-dialog-actions--confirm">
          <button type="button" class="tma-dialog-btn tma-dialog-btn-secondary" id="tmaConfirmCancel">${escapeHtml(tr.commonCancel)}</button>
          <button type="button" class="tma-dialog-btn tma-dialog-btn-primary" id="tmaConfirmOk">${escapeHtml(tr.commonOk)}</button>
        </div>
      </div>
    `;
    const finish = (ok: boolean) => {
      removeTmaModal();
      resolve(ok);
    };
    wrap.querySelector("#tmaConfirmOk")?.addEventListener("click", () => finish(true));
    wrap.querySelector("#tmaConfirmCancel")?.addEventListener("click", () => finish(false));
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) finish(false);
    });
    document.body.appendChild(wrap);
    attachModalEscape();
  });
}

/** Standard in-app notice (replaces Telegram showAlert / window.alert). */
export function tmaAlert(message: string): void {
  showTmaAlert(message);
}
