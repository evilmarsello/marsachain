/** Format MRS balance for UI: at most 2 digits after decimal. */
export function formatMrsBalanceDisplay(raw: string): string {
  const s = raw.trim();
  if (!s || s === "…" || s === "—") return s || "0";
  if (!s.includes(".")) return s;
  const dot = s.indexOf(".");
  const intPart = s.slice(0, dot);
  let frac = s.slice(dot + 1);
  frac = frac.slice(0, 2).replace(/0+$/, "");
  return frac.length > 0 ? `${intPart}.${frac}` : intPart;
}
