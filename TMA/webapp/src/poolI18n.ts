import { t } from "./i18n";

/** Localized official pool names (catalog ids 0–4). */
export function localizedPoolName(poolId: number, apiFallback: string): string {
  const tr = t();
  const names: Record<number, string> = {
    0: tr.poolsNameEqual,
    1: tr.poolsName5,
    2: tr.poolsName10,
    3: tr.poolsName20,
    4: tr.poolsName50,
  };
  return names[poolId] ?? apiFallback;
}
