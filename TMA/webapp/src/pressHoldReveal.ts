/** Press anywhere, drag off element — secret stays visible until pointer up (global). */
export function attachPressHoldReveal(
  el: HTMLElement,
  opts: { maskedText: string; secret: string },
): () => void {
  let activePointerId: number | null = null;

  const mask = (): void => {
    el.textContent = opts.maskedText;
    el.classList.remove("is-revealed");
    el.setAttribute("aria-label", "Press and hold to reveal private key");
  };

  const reveal = (): void => {
    el.textContent = opts.secret;
    el.classList.add("is-revealed");
    el.setAttribute("aria-label", "Private key visible while held");
  };

  const endHold = (e: PointerEvent): void => {
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    activePointerId = null;
    mask();
  };

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    activePointerId = e.pointerId;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    reveal();
    e.preventDefault();
  };

  el.classList.add("tma-press-hold-reveal");
  mask();
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointerup", endHold);
  el.addEventListener("pointercancel", endHold);

  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointerup", endHold);
    el.removeEventListener("pointercancel", endHold);
    mask();
    el.classList.remove("tma-press-hold-reveal", "is-revealed");
  };
}
