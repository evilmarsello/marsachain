import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { getPublicKey, hashes as ed25519Hashes } from "@noble/ed25519";

/** @noble/ed25519 v3: sync API requires wiring SHA-512 (same as README). */
ed25519Hashes.sha512 = sha512;

/** Same as Android `KeyPair.generateAddress` — `mrs` + first 40 hex chars of SHA-256(pub). */
export function addressFromPublicKey(publicKeyBytes: Uint8Array): string {
  const hash = sha256(publicKeyBytes);
  let hex = "";
  for (let i = 0; i < hash.length; i++) hex += hash[i]!.toString(16).padStart(2, "0");
  return `mrs${hex.slice(0, 40)}`;
}

function bytesToB64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
}

export function base64DecodeLoose(s: string): Uint8Array | null {
  try {
    const t = s.trim().replace(/\s/g, "");
    const bin = atob(t);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export type MarsaKeyPair = {
  privateKeyB64: string;
  publicKeyBytes: Uint8Array;
  address: string;
};

/** Same as Android `KeyPair.fromPrivateKeyBytes` / `fromPrivateKey` (Ed25519, pub 32 bytes). */
export function keyPairFromPrivateKeyBytes(privateKeyBytes: Uint8Array): MarsaKeyPair | null {
  if (privateKeyBytes.length !== 32) return null;
  try {
    const publicKeyBytes = getPublicKey(privateKeyBytes);
    return {
      privateKeyB64: bytesToB64(privateKeyBytes),
      publicKeyBytes,
      address: addressFromPublicKey(publicKeyBytes),
    };
  } catch {
    return null;
  }
}

export function keyPairFromPrivateKeyB64(privateKeyB64: string): MarsaKeyPair | null {
  const bytes = base64DecodeLoose(privateKeyB64);
  if (!bytes) return null;
  return keyPairFromPrivateKeyBytes(bytes);
}
