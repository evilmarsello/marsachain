const READ_NODE = () => (process.env.READ_NODE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const MINING_NODE = () => (process.env.MINING_NODE_URL || READ_NODE()).replace(/\/$/, "");

export async function fetchNodeJson(path, useMining = false) {
  const base = useMining ? MINING_NODE() : READ_NODE();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetch(url, { cache: "no-store" });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, status: r.status, json: null, text };
  }
  return { ok: r.ok, status: r.status, json };
}

export async function getChainTip() {
  const res = await fetchNodeJson("/status");
  const h = res.json?.data?.height ?? res.json?.data?.chain_height;
  return typeof h === "number" ? h : Number(h) || 0;
}

export async function getBlockAtHeight(height) {
  const res = await fetchNodeJson(`/block/at/${height}`, true);
  if (!res.ok || !res.json?.success) return null;
  return res.json.data;
}

export async function getPoolBind(address) {
  const res = await fetchNodeJson(`/pool/bind/${encodeURIComponent(address)}`, true);
  if (!res.ok || !res.json?.success) return null;
  return res.json.data;
}

export async function getPoolMember(address, atHeight) {
  let path = `/pool/member/${encodeURIComponent(address)}`;
  if (atHeight != null) path += `?at_height=${atHeight}`;
  const res = await fetchNodeJson(path, true);
  if (!res.ok || !res.json?.success) return null;
  return res.json.data;
}

export async function getTreasuryBalance(address) {
  let res = await fetchNodeJson(`/balance?address=${encodeURIComponent(address)}`, true);
  if (!res.ok || !res.json?.success) {
    res = await fetchNodeJson(`/balance?address=${encodeURIComponent(address)}`, false);
  }
  const bal = res.json?.data?.balance ?? res.json?.data?.available;
  return typeof bal === "number" ? bal : Number(bal) || 0;
}
