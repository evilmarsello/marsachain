/** Floating hash chip — Android `mining_floating_result.xml` + `showMiningResultFloating`. */

/** 30% slower than original (duration × 1.3). */
const FLOAT_DURATION_MS = 2366;
const FLOAT_TRANSLATE_Y_PX = -494;

export function showMiningResultFloating(
  clientX: number,
  clientY: number,
  hashHex: string,
  success: boolean,
  rewardMrs?: string,
): void {
  const chip = document.createElement("div");
  chip.className = "mining-floating-chip";
  const icon = success ? "✓" : "✗";
  const iconClass = success ? "mining-floating-icon--ok" : "mining-floating-icon--fail";
  const short = `${hashHex.slice(0, 10)}...`;
  const text =
    success && rewardMrs != null ? `${short}  +${rewardMrs} MRS` : short;
  chip.innerHTML = `
    <span class="mining-floating-icon ${iconClass}">${icon}</span>
    <span class="mining-floating-text">${text}</span>
  `;
  document.body.appendChild(chip);
  const rect = chip.getBoundingClientRect();
  const left = clientX - rect.width / 2;
  const top = clientY - rect.height / 2;
  chip.style.left = `${left}px`;
  chip.style.top = `${top}px`;

  requestAnimationFrame(() => {
    chip.style.transition = `transform ${FLOAT_DURATION_MS}ms linear, opacity ${FLOAT_DURATION_MS}ms linear`;
    chip.style.transform = `translateY(${FLOAT_TRANSLATE_Y_PX}px)`;
    chip.style.opacity = "0";
    window.setTimeout(() => chip.remove(), FLOAT_DURATION_MS + 40);
  });
}
