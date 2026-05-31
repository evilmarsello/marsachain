package com.marsa.chain.crypto.hd

import com.marsa.chain.crypto.KeyPair

object HdWalletFactory {
    fun keyPairAtIndex(seed: ByteArray, index: Int): KeyPair {
        require(index >= 0)
        val path = HdWalletConstants.pathForIndex(index)
        val sk = Slip0010Ed25519.derivePath(seed, path)
        return KeyPair.fromPrivateKeyBytes(sk)
            ?: error("HdWalletFactory: invalid derived private key")
    }
}
