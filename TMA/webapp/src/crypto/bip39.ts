/**
 * BIP39 (24 words, English, SHA-256 checksum, PBKDF2 seed).
 * Logic aligned with Android `com.marsa.chain.crypto.hd.Bip39`.
 */

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(buf);
}

export async function loadEnglishWordList(): Promise<string[]> {
  const r = await fetch("/bip39_english.txt");
  if (!r.ok) throw new Error("Failed to load BIP39 word list");
  const list = (await r.text())
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (list.length !== 2048) throw new Error(`BIP39 list size ${list.length}, expected 2048`);
  return list;
}

function entropyToBits(entropy: Uint8Array, hashFirst: Uint8Array): boolean[] {
  const checksumBits = entropy.length / 4;
  const totalBits = entropy.length * 8 + checksumBits;
  const bits = new Array<boolean>(totalBits);
  for (let i = 0; i < entropy.length; i++) {
    for (let bit = 0; bit < 8; bit++) {
      bits[i * 8 + bit] = ((entropy[i]! >> (7 - bit)) & 1) === 1;
    }
  }
  for (let bit = 0; bit < checksumBits; bit++) {
    bits[entropy.length * 8 + bit] = ((hashFirst[0]! >> (7 - bit)) & 1) === 1;
  }
  return bits;
}

function bitsToMnemonic(bits: boolean[], wordList: string[]): string {
  const words: string[] = [];
  let i = 0;
  while (i < bits.length) {
    let idx = 0;
    for (let b = 0; b < 11; b++) {
      idx <<= 1;
      if (i + b < bits.length && bits[i + b]) idx |= 1;
    }
    words.push(wordList[idx] ?? "");
    i += 11;
  }
  return words.join(" ");
}

export async function generateMnemonic(wordList: string[]): Promise<string> {
  if (wordList.length !== 2048) throw new Error("Invalid word list");
  const entropy = new Uint8Array(32);
  crypto.getRandomValues(entropy);
  const hash = await sha256(entropy);
  const bits = entropyToBits(entropy, hash);
  return bitsToMnemonic(bits, wordList);
}

export async function validateMnemonicPhrase(mnemonic: string, wordList: string[]): Promise<boolean> {
  const words = mnemonic
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
  if (words.length !== 24) return false;
  const indices = new Int32Array(24);
  for (let wi = 0; wi < 24; wi++) {
    const idx = wordList.indexOf(words[wi]!);
    if (idx < 0) return false;
    indices[wi] = idx;
  }
  const concatBits = new Array<boolean>(24 * 11);
  for (let wi = 0; wi < 24; wi++) {
    const wordIndex = indices[wi]!;
    for (let bit = 0; bit < 11; bit++) {
      concatBits[wi * 11 + bit] = ((wordIndex >> (10 - bit)) & 1) === 1;
    }
  }
  const entropyBits = 256;
  const entropy = new Uint8Array(entropyBits / 8);
  for (let i = 0; i < entropyBits; i++) {
    if (concatBits[i]) {
      const bi = i >>> 3;
      entropy[bi] = (entropy[bi]! | (1 << (7 - (i % 8)))) >>> 0;
    }
  }
  const hash = await sha256(entropy);
  for (let bit = 0; bit < 8; bit++) {
    const expected = ((hash[0]! >> (7 - bit)) & 1) === 1;
    if (concatBits[entropyBits + bit] !== expected) return false;
  }
  return true;
}

export async function mnemonicToSeedBytes(mnemonic: string, passphrase = ""): Promise<Uint8Array> {
  const norm = mnemonic
    .trim()
    .split(/\s+/)
    .join(" ");
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(norm.normalize("NFKD")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const salt = enc.encode(`mnemonic${passphrase}`.normalize("NFKD"));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 2048, hash: "SHA-512" },
    keyMaterial,
    512,
  );
  return new Uint8Array(bits);
}
