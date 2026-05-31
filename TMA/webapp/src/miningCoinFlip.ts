import type { MiningMode } from "./poolMode";

export const MINING_COIN_FLIP_MS = 1000;
/** Pause after flip before dim / stake overlays appear. */
export const MINING_OVERLAY_REVEAL_MS = 1000;

function setPoolFace(inner: HTMLElement, pool: boolean): void {
  inner.classList.toggle("is-pool", pool);
}

/** 3D coin flip after Pool/Solo toggle. */
export function playMiningCoinFlip(
  from: MiningMode,
  to: MiningMode,
  onComplete?: () => void,
): void {
  if (from === to) {
    onComplete?.();
    return;
  }
  const inner = document.getElementById("tmaMiningCoinInner");
  if (!inner) {
    onComplete?.();
    return;
  }

  const wrap = document.querySelector(".mining-glow-wrap");
  wrap?.classList.add("mining-glow-wrap--flip-active");

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const finish = () => {
    inner.classList.remove("is-flipping");
    wrap?.classList.remove("mining-glow-wrap--flip-active");
    onComplete?.();
  };

  if (reduced) {
    setPoolFace(inner, to === "pool");
    finish();
    return;
  }

  inner.classList.add("is-flipping");
  inner.style.transition = "none";
  setPoolFace(inner, from === "pool");
  void inner.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      inner.style.transition = "";
      setPoolFace(inner, to === "pool");
      window.setTimeout(finish, MINING_COIN_FLIP_MS);
    });
  });
}
