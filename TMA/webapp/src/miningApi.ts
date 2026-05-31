import { base64DecodeLoose, keyPairFromPrivateKeyB64 } from "./crypto/marsaKey";
import { sign } from "@noble/ed25519";
import { sha256HexUtf8 } from "./miningPow";

export type ChallengeResponse = {
  challengeId: string;
  challenge: string;
  expiresAt: number;
  bits?: number;
};

export type MiningSubmitResult = {
  accepted: boolean;
  reason?: string;
};

function bytesToB64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
}

function signUtf8Message(privateKeyB64: string, message: string): string | null {
  const sk = base64DecodeLoose(privateKeyB64);
  if (!sk || sk.length !== 32) return null;
  try {
    const sig = sign(new TextEncoder().encode(message), sk);
    return bytesToB64(sig);
  } catch {
    return null;
  }
}

/** Sign UTF-8 bytes of hex hash string (same as Android mining submit). */
export function signHashHex(privateKeyB64: string, hashHex: string): string | null {
  return signUtf8Message(privateKeyB64, hashHex);
}

export function publicKeyB64FromPrivate(privateKeyB64: string): string | null {
  const kp = keyPairFromPrivateKeyB64(privateKeyB64);
  if (!kp) return null;
  return bytesToB64(kp.publicKeyBytes);
}

export function abandonSignMessage(address: string, challengeId: string): string {
  return `marsa:mining:abandon:v1:${challengeId}:${address}`;
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let j: { success?: boolean; data?: T; error?: string; reason?: string } = {};
  try {
    j = JSON.parse(text) as typeof j;
  } catch {
    return { ok: false, status: res.status, text };
  }
  if (res.status === 429) return { ok: false, status: 429, text };
  if (j.success && j.data != null) return { ok: true, data: j.data };
  return { ok: false, status: res.status, text: j.error ?? j.reason ?? text };
}

export async function requestMiningChallenge(
  nodeBase: string,
  address: string,
  pubKeyB64: string,
  commitment: string,
): Promise<ChallengeResponse | "rate_limited" | null> {
  const root = nodeBase.trim().endsWith("/") ? nodeBase.trim() : `${nodeBase.trim()}/`;
  const res = await postJson<ChallengeResponse>(`${root}challenge/request`, {
    address,
    pubKey: pubKeyB64,
    commitment,
  });
  if (!res.ok) {
    if (res.status === 429 || res.text.toLowerCase().includes("rate limit")) return "rate_limited";
    return null;
  }
  return res.data;
}

export async function submitMiningResult(
  nodeBase: string,
  req: {
    address: string;
    challengeId: string;
    clientHash: string;
    signature: string;
    headerHash: string;
    claimedHeight: number;
    pubKey: string;
    nonce: string;
  },
): Promise<MiningSubmitResult | null> {
  const root = nodeBase.trim().endsWith("/") ? nodeBase.trim() : `${nodeBase.trim()}/`;
  const res = await postJson<MiningSubmitResult>(`${root}mining/submit`, {
    ...req,
    attestation: "stub",
  });
  if (!res.ok) return null;
  return res.data;
}

export async function abandonMiningChallenge(
  nodeBase: string,
  address: string,
  challengeId: string,
  pubKeyB64: string,
  signatureB64: string,
): Promise<boolean> {
  const root = nodeBase.trim().endsWith("/") ? nodeBase.trim() : `${nodeBase.trim()}/`;
  const res = await postJson<{ abandoned?: boolean }>(`${root}mining/challenge/abandon`, {
    address,
    challengeId,
    pubKey: pubKeyB64,
    signature: signatureB64,
  });
  return res.ok;
}

export function randomNonceString(): string {
  const n = Math.floor(Math.random() * 0x7fffffff);
  return String(n);
}

export function commitmentForNonce(nonce: string): string {
  return sha256HexUtf8(nonce);
}

export function clientHashForChallenge(challenge: string, nonce: string): string {
  return sha256HexUtf8(challenge + nonce);
}
