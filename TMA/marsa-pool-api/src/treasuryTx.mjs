import { sign, getPublicKey } from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { hashes as edHashes } from "@noble/ed25519";

edHashes.sha512 = sha512;

const MINING_NODE = () => (process.env.MINING_NODE_URL || process.env.READ_NODE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

function bytesToB64(u) {
  return Buffer.from(u).toString("base64");
}

function base64DecodeLoose(s) {
  try {
    return Buffer.from(s.trim().replace(/\s/g, ""), "base64");
  } catch {
    return null;
  }
}

export function addressFromPublicKey(publicKeyBytes) {
  const hash = sha256(publicKeyBytes);
  let hex = "";
  for (let i = 0; i < hash.length; i++) hex += hash[i].toString(16).padStart(2, "0");
  return `mrs${hex.slice(0, 40)}`;
}

export function keyPairFromPrivateKeyB64(privateKeyB64) {
  const sk = base64DecodeLoose(privateKeyB64);
  if (!sk || sk.length !== 32) return null;
  try {
    const publicKeyBytes = getPublicKey(sk);
    return {
      privateKeyB64,
      publicKeyBytes,
      address: addressFromPublicKey(publicKeyBytes),
    };
  } catch {
    return null;
  }
}

function sha256HexUtf8(text) {
  const hash = sha256(new TextEncoder().encode(text));
  let hex = "";
  for (let i = 0; i < hash.length; i++) hex += hash[i].toString(16).padStart(2, "0");
  return hex;
}

function signTxidHex(privateKeyB64, txidHex) {
  const sk = base64DecodeLoose(privateKeyB64);
  if (!sk || sk.length !== 32) return null;
  try {
    const sig = sign(new TextEncoder().encode(txidHex), sk);
    return bytesToB64(sig);
  } catch {
    return null;
  }
}

/** REGULAR transfer — same txid layout as TMA buildSendTransaction. */
export function buildRegularTransfer(from, to, amountWei, feeWei, privateKeyB64) {
  const kp = keyPairFromPrivateKeyB64(privateKeyB64);
  if (!kp) return null;

  const amount = Number(amountWei);
  const fee = Number(feeWei);
  const txidData =
    from + (amount + fee).toString() + to + amount.toString() + fee.toString() + "0";
  const txid = sha256HexUtf8(txidData);
  const signature = signTxidHex(privateKeyB64, txid);
  if (!signature) return null;

  return {
    txid,
    inputs: [
      {
        address: from,
        amount: amount + fee,
        signature,
        pubKey: bytesToB64(kp.publicKeyBytes),
      },
    ],
    outputs: [{ value: amount, address: to }],
    fee,
    tx_type: 0,
    data: "",
  };
}

export async function submitTransaction(tx) {
  const url = `${MINING_NODE()}/transaction/submit`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tx),
  });
  const j = await res.json();
  if (j.success && j.data) {
    return { ok: true, txid: j.data.txid ?? tx.txid };
  }
  return {
    ok: false,
    message: j.error ?? j.reason ?? j.data?.message ?? "submit_failed",
  };
}
