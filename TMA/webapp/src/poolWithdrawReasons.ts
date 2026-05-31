import type { Messages } from "./i18n/messages.en";

/** Map backend reason codes to short user-facing text. */
export function formatPoolWithdrawReasons(
  reasons: string[] | undefined,
  tr: Messages,
  unlockBlock?: number,
): string {
  if (!reasons?.length) return tr.poolsOwedCannotWithdraw;

  const parts: string[] = [];
  for (const r of reasons) {
    if (r === "below_min_withdraw" || r === "below_min_net_after_fee") {
      parts.push(tr.poolWithdrawReasonMin);
      continue;
    }
    if (r === "lock_not_elapsed") {
      parts.push(
        unlockBlock && unlockBlock > 0
          ? tr.poolWithdrawReasonLock(unlockBlock)
          : tr.poolWithdrawReasonLockGeneric,
      );
      continue;
    }
    if (r === "pending_withdrawal") {
      parts.push(tr.poolWithdrawReasonPending);
      continue;
    }
    if (r === "database_not_configured") {
      parts.push(tr.poolWithdrawReasonGeneric);
      continue;
    }
  }

  if (parts.length === 0) return tr.poolsOwedCannotWithdraw;
  return [...new Set(parts)].join(". ");
}
