export type PullToRefreshHandle = { destroy: () => void };

const SCROLL_IDLE_MS = 220;
const PULL_ARM_PX = 14;
const THRESHOLD = 56;
const MAX_PULL = 96;

/**
 * Pull-down to refresh. Only when the list is already at scrollTop 0, scroll has
 * been idle, and the user pulls down — not when scrolling up through the list.
 */
export function attachPullToRefresh(
  scrollEl: HTMLElement,
  onRefresh: () => Promise<void>,
  label = "Pull to refresh",
): PullToRefreshHandle {
  const wrap =
    scrollEl.parentElement?.classList.contains("tma-ptr-wrap")
      ? scrollEl.parentElement
      : (() => {
          const w = document.createElement("div");
          w.className = "tma-ptr-wrap";
          scrollEl.parentNode?.insertBefore(w, scrollEl);
          w.appendChild(scrollEl);
          return w;
        })();

  let indicator = wrap.querySelector<HTMLElement>(".tma-ptr-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "tma-ptr-indicator";
    indicator.setAttribute("aria-hidden", "true");
    wrap.insertBefore(indicator, scrollEl);
  }
  indicator.textContent = label;

  let startY = 0;
  let pullPx = 0;
  let refreshing = false;
  let touchActive = false;
  let pullArmed = false;
  let scrollDuringTouch = false;
  let lastScrollAt = 0;
  let moveBound = false;

  function atScrollTop(): boolean {
    return scrollEl.scrollTop <= 0;
  }

  function scrollIdle(): boolean {
    return Date.now() - lastScrollAt >= SCROLL_IDLE_MS;
  }

  function setPull(px: number, state: "idle" | "pull" | "ready" | "loading"): void {
    pullPx = px;
    const y = Math.min(px, MAX_PULL);
    indicator!.style.transform = `translateY(${y}px)`;
    indicator!.classList.toggle("is-visible", px > 8 || state === "loading");
    indicator!.classList.toggle("is-ready", state === "ready");
    indicator!.classList.toggle("is-loading", state === "loading");
    if (state === "loading") indicator!.textContent = "Updating…";
    else if (state === "ready") indicator!.textContent = "Release to refresh";
    else indicator!.textContent = label;
  }

  function resetGesture(): void {
    startY = 0;
    pullArmed = false;
    setPull(0, "idle");
    detachMove();
  }

  function endTouch(): void {
    touchActive = false;
    if (pullPx >= THRESHOLD && pullArmed && !scrollDuringTouch && atScrollTop() && !refreshing) {
      void runRefresh();
    } else {
      resetGesture();
    }
  }

  async function runRefresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    setPull(THRESHOLD, "loading");
    try {
      await onRefresh();
    } finally {
      refreshing = false;
      resetGesture();
    }
  }

  const onScroll = (): void => {
    lastScrollAt = Date.now();
    if (touchActive) scrollDuringTouch = true;
    if (!atScrollTop()) resetGesture();
  };

  const onTouchMove = (e: TouchEvent): void => {
    if (!touchActive || startY === 0 || refreshing) return;

    if (!atScrollTop() || scrollDuringTouch || !scrollIdle()) {
      resetGesture();
      return;
    }

    const y = e.touches[0]?.clientY ?? 0;
    const dy = y - startY;

    if (dy <= 0) {
      if (pullArmed) resetGesture();
      return;
    }

    if (dy < PULL_ARM_PX) return;

    pullArmed = true;
    e.preventDefault();
    const px = Math.min(dy * 0.45, MAX_PULL);
    setPull(px, px >= THRESHOLD ? "ready" : "pull");
  };

  function attachMove(): void {
    if (moveBound) return;
    scrollEl.addEventListener("touchmove", onTouchMove, { passive: false });
    moveBound = true;
  }

  function detachMove(): void {
    if (!moveBound) return;
    scrollEl.removeEventListener("touchmove", onTouchMove);
    moveBound = false;
  }

  const onTouchStart = (e: TouchEvent): void => {
    touchActive = true;
    scrollDuringTouch = false;
    pullArmed = false;
    startY = 0;
    detachMove();

    if (refreshing || !atScrollTop() || !scrollIdle()) return;

    startY = e.touches[0]?.clientY ?? 0;
    attachMove();
  };

  const onTouchEnd = (): void => {
    endTouch();
  };

  scrollEl.addEventListener("scroll", onScroll, { passive: true });
  scrollEl.addEventListener("touchstart", onTouchStart, { passive: true });
  scrollEl.addEventListener("touchend", onTouchEnd);
  scrollEl.addEventListener("touchcancel", onTouchEnd);

  return {
    destroy: () => {
      scrollEl.removeEventListener("scroll", onScroll);
      scrollEl.removeEventListener("touchstart", onTouchStart);
      scrollEl.removeEventListener("touchend", onTouchEnd);
      scrollEl.removeEventListener("touchcancel", onTouchEnd);
      detachMove();
      indicator?.remove();
    },
  };
}
