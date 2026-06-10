package com.marsa.chain.manager

import android.content.Context


class WalletPreferences(context: Context) {

    private val sp = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    
    var autoCascadeSend: Boolean
        get() = sp.getBoolean(KEY_AUTO_CASCADE_SEND, false)
        set(value) {
            sp.edit().putBoolean(KEY_AUTO_CASCADE_SEND, value).apply()
        }

    /** Address shown in wallet tab tx list (view wallet, not necessarily active). */
    fun getViewAddress(fallback: String?): String? {
        val v = sp.getString(KEY_VIEW_ADDRESS, null)?.trim()
        return v?.takeIf { it.isNotEmpty() } ?: fallback
    }

    fun setViewAddress(address: String) {
        sp.edit().putString(KEY_VIEW_ADDRESS, address.trim()).apply()
    }

    var balanceHidden: Boolean
        get() = sp.getBoolean(KEY_BALANCE_HIDDEN, false)
        set(value) {
            sp.edit().putBoolean(KEY_BALANCE_HIDDEN, value).apply()
        }

    companion object {
        private const val PREFS_NAME = "wallet_prefs"
        private const val KEY_AUTO_CASCADE_SEND = "auto_cascade_send"
        private const val KEY_VIEW_ADDRESS = "wallet_view_address"
        private const val KEY_BALANCE_HIDDEN = "wallet_balance_hidden"
    }
}
