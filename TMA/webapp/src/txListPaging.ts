/** UI page size for wallet / history transaction lists. */
export const TX_UI_PAGE_SIZE = 10;

export function bindTxListScrollLoadMore(
  scrollEl: HTMLElement,
  onLoadMore: () => void,
): () => void {
  const handler = () => {
    if (scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 48) return;
    onLoadMore();
  };
  scrollEl.addEventListener("scroll", handler, { passive: true });
  return () => scrollEl.removeEventListener("scroll", handler);
}
