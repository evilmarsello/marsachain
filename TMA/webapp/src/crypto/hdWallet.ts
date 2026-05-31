import { derivePath } from "./slip0010";
import { keyPairFromPrivateKeyBytes, type MarsaKeyPair } from "./marsaKey";

export const HD_PURPOSE = 44;
export const HD_COIN_TYPE = 78213;
export const HD_ACCOUNT = 0;
export const HD_CHANGE = 0;

/** `m/44'/78213'/0'/0'/index'` — same as Android `HdWalletConstants.pathForIndex`. */
export function pathForIndex(index: number): string {
  return `m/${HD_PURPOSE}'/${HD_COIN_TYPE}'/${HD_ACCOUNT}'/${HD_CHANGE}'/${index}'`;
}

export function hdKeyPairAtIndex(seed: Uint8Array, index: number): MarsaKeyPair & { hdIndex: number } {
  if (index < 0) throw new Error("hd index must be >= 0");
  const sk = derivePath(seed, pathForIndex(index));
  const kp = keyPairFromPrivateKeyBytes(sk);
  if (!kp) throw new Error("invalid derived private key");
  return { ...kp, hdIndex: index };
}
