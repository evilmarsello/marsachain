/**
 * SLIP-0010 Ed25519 hardened derivation (same as Android `Slip0010Ed25519.kt`).
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";

const ED25519_SEED = new TextEncoder().encode("ed25519 seed");

function ser32BE(index: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, index >>> 0, false);
  return b;
}

function hmac512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

export function masterFromSeed(seed: Uint8Array): [Uint8Array, Uint8Array] {
  const i = hmac512(ED25519_SEED, seed);
  return [i.slice(0, 32), i.slice(32, 64)];
}

export function deriveChildHardened(kPar: Uint8Array, cPar: Uint8Array, index: number): [Uint8Array, Uint8Array] {
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0;
  data.set(kPar, 1);
  data.set(ser32BE(index), 33);
  const z = hmac512(cPar, data);
  return [z.slice(0, 32), z.slice(32, 64)];
}

/** Path like `m/44'/78213'/0'/0'/0'` — all segments hardened. */
export function derivePath(seed: Uint8Array, path: string): Uint8Array {
  const segments = path
    .trim()
    .split("/")
    .filter((s) => s.length > 0 && s !== "m");
  if (segments.length === 0) throw new Error("empty path");
  let [k, c] = masterFromSeed(seed);
  for (const seg of segments) {
    if (!seg.endsWith("'")) throw new Error(`ed25519 slip10: only hardened segments allowed: ${seg}`);
    const num = Number(seg.slice(0, -1));
    if (!Number.isFinite(num)) throw new Error(`invalid segment ${seg}`);
    const index = (0x80000000 | num) >>> 0;
    [k, c] = deriveChildHardened(k, c, index);
  }
  return k;
}
