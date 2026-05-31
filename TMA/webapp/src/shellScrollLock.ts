/** Block main tab panel scroll while full-screen shell overlays (pools, etc.) are open. */
let lockDepth = 0;

export function setShellScrollLock(locked: boolean): void {
  lockDepth += locked ? 1 : -1;
  if (lockDepth < 0) lockDepth = 0;
  document.documentElement.classList.toggle("tma-shell-scroll-lock", lockDepth > 0);
}

export function syncPoolsOverlayScrollLock(): void {
  const poolsVisible = Boolean(
    document.querySelector(".pools-page:not(.pools-page--hidden):not(.pool-detail-page)"),
  );
  const detailVisible = Boolean(
    document.querySelector(".pool-detail-page:not(.pools-page--hidden)"),
  );
  const shouldLock = poolsVisible || detailVisible;
  document.documentElement.classList.toggle("tma-shell-scroll-lock", shouldLock);
  lockDepth = shouldLock ? 1 : 0;
}
