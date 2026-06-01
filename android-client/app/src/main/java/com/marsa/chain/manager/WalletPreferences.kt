package com.marsa.chain.manager

import android.content.Context

/**
 * Local wallet settings (not in Room).
 */
class WalletPreferences(context: Context) {

    private val sp = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** If active wallet lacks funds — top up from others via separate txs. */
    var autoCascadeSend: Boolean
        get() = sp.getBoolean(KEY_AUTO_CASCADE_SEND, false)
        set(value) {
            sp.edit().putBoolean(KEY_AUTO_CASCADE_SEND, value).apply()
        }

    companion object {
        private const val PREFS_NAME = "wallet_prefs"
        private const val KEY_AUTO_CASCADE_SEND = "auto_cascade_send"
    }
}
