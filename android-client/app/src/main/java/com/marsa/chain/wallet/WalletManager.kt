package com.marsa.chain.wallet

import android.content.Context
import android.content.SharedPreferences

class WalletManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("wallet", Context.MODE_PRIVATE)

    fun getBalance(): Long = prefs.getLong("balance", 0L)

    fun setBalance(value: Long) { prefs.edit().putLong("balance", value).apply() }

    fun add(amount: Long) { setBalance(getBalance() + amount) }

    fun canMine(): Boolean = getBalance() >= 64
}
