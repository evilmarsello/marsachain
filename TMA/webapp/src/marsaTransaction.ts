import { sha256 } from "@noble/hashes/sha2.js";
import { base64DecodeLoose, keyPairFromPrivateKeyB64, type MarsaKeyPair } from "./crypto/marsaKey";
import { sign } from "@noble/ed25519";

export type TransactionInput = {
  address: string;
  amount: number;
  signature: string;
  pubKey: string;
};

export type TransactionOutput = {
  value: number;
  address: string;
};

export type TransactionRequest = {
  txid: string;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  fee: number;
  tx_type: number;
  data: string;
  metadata?: Record<string, string | number>;
};

function bytesToB64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
  return btoa(s);
}

function sha256HexUtf8(text: string): string {
  const hash = sha256(new TextEncoder().encode(text));
  let hex = "";
  for (let i = 0; i < hash.length; i++) hex += hash[i]!.toString(16).padStart(2, "0");
  return hex;
}

/** Android signs UTF-8 bytes of the hex txid string. */
function signTxidHex(privateKeyB64: string, txidHex: string): string | null {
  const pk = keyPairFromPrivateKeyB64(privateKeyB64);
  if (!pk) return null;
  const sk = base64DecodeLoose(privateKeyB64);
  if (!sk || sk.length !== 32) return null;
  try {
    const sig = sign(new TextEncoder().encode(txidHex), sk);
    return bytesToB64(sig);
  } catch {
    return null;
  }
}

function pubKeyB64(kp: MarsaKeyPair): string {
  return bytesToB64(kp.publicKeyBytes);
}

/** REGULAR send — mirrors `WalletFragment.createTransaction`. */
export function buildSendTransaction(
  from: string,
  to: string,
  amountNanos: number,
  feeNanos: number,
  privateKeyB64: string,
): TransactionRequest | null {
  const kp = keyPairFromPrivateKeyB64(privateKeyB64);
  if (!kp) return null;

  const txidData =
    from +
    (amountNanos + feeNanos).toString() +
    to +
    amountNanos.toString() +
    feeNanos.toString() +
    "0";
  const txid = sha256HexUtf8(txidData);
  const signature = signTxidHex(privateKeyB64, txid);
  if (!signature) return null;

  return {
    txid,
    inputs: [
      {
        address: from,
        amount: amountNanos + feeNanos,
        signature,
        pubKey: pubKeyB64(kp),
      },
    ],
    outputs: [{ value: amountNanos, address: to }],
    fee: feeNanos,
    tx_type: 0,
    data: "",
  };
}

/** MINER_STAKE — mirrors `MiningFragment.createMinerStakeTransactionRequest`. */
export function buildMinerStakeTransaction(
  from: string,
  stakeAmountNanos: number,
  feeNanos: number,
  currentHeight: number,
  privateKeyB64: string,
): TransactionRequest | null {
  const kp = keyPairFromPrivateKeyB64(privateKeyB64);
  if (!kp) return null;

  const txidData =
    from +
    feeNanos.toString() +
    from +
    "0" +
    feeNanos.toString() +
    "10" +
    stakeAmountNanos.toString();
  const txid = sha256HexUtf8(txidData);
  const signature = signTxidHex(privateKeyB64, txid);
  if (!signature) return null;

  return {
    txid,
    inputs: [
      {
        address: from,
        amount: stakeAmountNanos + feeNanos,
        signature,
        pubKey: pubKeyB64(kp),
      },
    ],
    outputs: [{ value: 0, address: from }],
    fee: feeNanos,
    tx_type: 10,
    data: stakeAmountNanos.toString(),
    metadata: {
      current_height: currentHeight,
      stake_type: "miner",
    },
  };
}

/** MINER_STAKE_POOL (tx_type 13) — official mining pool join. */
export function buildMinerPoolStakeTransaction(
  from: string,
  poolId: number,
  stakeAmountNanos: number,
  feeNanos: number,
  currentHeight: number,
  privateKeyB64: string,
): TransactionRequest | null {
  const kp = keyPairFromPrivateKeyB64(privateKeyB64);
  if (!kp) return null;

  const txidData =
    from +
    feeNanos.toString() +
    from +
    "0" +
    feeNanos.toString() +
    "13" +
    stakeAmountNanos.toString() +
    poolId.toString();
  const txid = sha256HexUtf8(txidData);
  const signature = signTxidHex(privateKeyB64, txid);
  if (!signature) return null;

  return {
    txid,
    inputs: [
      {
        address: from,
        amount: stakeAmountNanos + feeNanos,
        signature,
        pubKey: pubKeyB64(kp),
      },
    ],
    outputs: [{ value: 0, address: from }],
    fee: feeNanos,
    tx_type: 13,
    data: stakeAmountNanos.toString(),
    metadata: {
      current_height: currentHeight,
      pool_id: poolId,
      stake_amount_wei: stakeAmountNanos,
    },
  };
}

/** MINER_POOL_UNSTAKE (tx_type 14) — leave official mining pool. */
export function buildMinerPoolUnstakeTransaction(
  from: string,
  poolId: number,
  feeNanos: number,
  currentHeight: number,
  privateKeyB64: string,
): TransactionRequest | null {
  const kp = keyPairFromPrivateKeyB64(privateKeyB64);
  if (!kp) return null;
  const fee = feeNanos > 0 ? feeNanos : 100_000_000;

  const txidData =
    from + fee.toString() + from + "0" + fee.toString() + "14" + poolId.toString();
  const txid = sha256HexUtf8(txidData);
  const signature = signTxidHex(privateKeyB64, txid);
  if (!signature) return null;

  return {
    txid,
    inputs: [
      {
        address: from,
        amount: 0,
        signature,
        pubKey: pubKeyB64(kp),
      },
    ],
    outputs: [{ value: 0, address: from }],
    fee,
    tx_type: 14,
    data: "0",
    metadata: {
      current_height: currentHeight,
      pool_id: poolId,
    },
  };
}

/** MINER_UNSTAKE — mirrors `SettingsFragment.buildMinerUnstakeTransactionRequest`. */
export function buildMinerUnstakeTransaction(
  from: string,
  currentHeight: number,
  privateKeyB64: string,
): TransactionRequest | null {
  const kp = keyPairFromPrivateKeyB64(privateKeyB64);
  if (!kp) return null;
  const fee = 0;

  const txidData = from + fee.toString() + from + "0" + fee.toString() + "11" + "0";
  const txid = sha256HexUtf8(txidData);
  const signature = signTxidHex(privateKeyB64, txid);
  if (!signature) return null;

  return {
    txid,
    inputs: [
      {
        address: from,
        amount: 0,
        signature,
        pubKey: pubKeyB64(kp),
      },
    ],
    outputs: [{ value: 0, address: from }],
    fee,
    tx_type: 11,
    data: "0",
    metadata: {
      current_height: currentHeight,
      stake_type: "miner",
    },
  };
}

export async function submitTransaction(
  nodeBase: string,
  tx: TransactionRequest,
): Promise<
  | { ok: true; txid: string }
  | { ok: false; message: string; reason?: string }
> {
  const root = nodeBase.trim().endsWith("/") ? nodeBase.trim() : `${nodeBase.trim()}/`;
  const url = `${root}transaction/submit`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    });
    const j = (await res.json()) as {
      success?: boolean;
      data?: { txid?: string; message?: string; status?: string };
      error?: string;
      reason?: string;
    };
    if (j.success && j.data) {
      return { ok: true, txid: j.data.txid ?? tx.txid };
    }
    return {
      ok: false,
      message: j.error ?? j.data?.message ?? "Transaction failed",
      reason: j.reason,
    };
  } catch (e) {
    return { ok: false, message: (e as Error)?.message ?? "Network error" };
  }
}
