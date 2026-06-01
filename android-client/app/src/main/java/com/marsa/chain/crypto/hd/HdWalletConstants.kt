package com.marsa.chain.crypto.hd

/** Constants from spec (docs/TZ_MNEMONIC_24_ONBOARDING.md). Do not change without migration. */
object HdWalletConstants {
    const val PURPOSE = 44
    const val COIN_TYPE = 78213
    const val ACCOUNT = 0
    const val CHANGE = 0
    const val FIRST_WALLET_INDEX = 0

    /** First wallet after onboarding: m/44'/78213'/0'/0'/0' */
    fun pathForIndex(index: Int): String =
        "m/${PURPOSE}'/${COIN_TYPE}'/${ACCOUNT}'/${CHANGE}'/${index}'"
}
