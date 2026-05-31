import { networkStatsFromBits } from "./miningNetworkStats";

export type ParsedMiningStats = {
  activeMiners: number;
  stakedMiners: number;
  totalMiners: number;
  blocksPerHour?: number;
  averageHashrate?: number;
};

export function parseMiningStatsJson(json: string): ParsedMiningStats | null {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    let raw: Record<string, unknown> | null = null;
    if (o.ok === true && (o.activeMiners != null || o.totalMiners != null)) {
      raw = o;
    } else if ((o.success === true || o.ok === true) && o.data && typeof o.data === "object") {
      raw = o.data as Record<string, unknown>;
    }
    if (!raw) return null;
    const activeMiners =
      Number(
        raw.activeMiners ??
          raw.liveActiveMiners ??
          raw.activeMinersLive ??
          raw.activeMiners10m ??
          raw.activeMinersLast10m ??
          raw.realtimeActiveMiners,
      ) || 0;
    const stakedMiners =
      Number(
        raw.stakedMiners ??
          raw.minersWithStake ??
          raw.minerStakedMiners ??
          raw.activeStakedMiners ??
          raw.currentStakedMiners,
      ) || 0;
    const totalMiners = Number(raw.totalMiners) || 0;
    const blocksPerHour = raw.blocksPerHour != null ? Number(raw.blocksPerHour) : undefined;
    const averageHashrate = raw.averageHashrate != null ? Number(raw.averageHashrate) : undefined;
    return { activeMiners, stakedMiners, totalMiners, blocksPerHour, averageHashrate };
  } catch {
    return null;
  }
}

export function miningStatsDisplayValues(
  stats: ParsedMiningStats,
  chainBits: number | undefined,
): { blocksPerHour: number; averageHashrate: number } {
  if (stats.blocksPerHour != null && stats.averageHashrate != null) {
    return {
      blocksPerHour: stats.blocksPerHour,
      averageHashrate: stats.averageHashrate,
    };
  }
  const derived = networkStatsFromBits(chainBits, stats.activeMiners);
  return {
    blocksPerHour: stats.blocksPerHour ?? derived.blocksPerHour,
    averageHashrate: stats.averageHashrate ?? derived.averageHashrate,
  };
}

/** Try mining + read node bases (mining first — read replica often has empty tracker). */
export async function fetchMiningStatsJsonMulti(bases: string[]): Promise<string | null> {
  const bridge = window.__TMA_SHARED__;
  const seen = new Set<string>();
  let fallback: string | null = null;
  for (const base of bases) {
    const b = base.trim();
    if (!b || seen.has(b)) continue;
    seen.add(b);
    const tryJson = async (json: string): Promise<boolean> => {
      const parsed = parseMiningStatsJson(json);
      if (!parsed) return false;
      fallback = json;
      return parsed.activeMiners > 0 || parsed.stakedMiners > 0 || parsed.totalMiners > 0;
    };
    if (bridge?.fetchMiningStatsJson) {
      try {
        const json = await bridge.fetchMiningStatsJson(b);
        if (await tryJson(json)) return json;
      } catch {
        /* next */
      }
    }
    const root = b.endsWith("/") ? b : `${b}/`;
    try {
      const res = await fetch(`${root}mining/stats`, { cache: "no-store" });
      if (res.ok) {
        const text = await res.text();
        if (await tryJson(text)) return text;
      }
    } catch {
      /* next */
    }
  }
  return fallback;
}
