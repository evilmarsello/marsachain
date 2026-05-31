/** Telegram Mini App haptic feedback (no-op outside Telegram). */

type ImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";

function haptic() {
  return window.Telegram?.WebApp?.HapticFeedback;
}

export function hapticSelection(): void {
  try {
    haptic()?.selectionChanged?.();
  } catch {
    /* ignore */
  }
}

export function hapticImpact(style: ImpactStyle = "light"): void {
  try {
    haptic()?.impactOccurred?.(style);
  } catch {
    /* ignore */
  }
}

/** Five quick pulses when a block is accepted. */
export function hapticMiningBlockSuccess(): void {
  const fb = haptic();
  if (!fb) return;
  try {
    fb.notificationOccurred?.("success");
  } catch {
    /* ignore */
  }
  for (let i = 0; i < 4; i++) {
    window.setTimeout(() => {
      try {
        fb.impactOccurred?.("medium");
      } catch {
        /* ignore */
      }
    }, 40 + i * 48);
  }
}
