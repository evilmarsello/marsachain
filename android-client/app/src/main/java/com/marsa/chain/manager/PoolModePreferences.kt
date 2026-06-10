package com.marsa.chain.manager

import android.content.Context

/** Solo / pool mode and per-wallet pool choice — mirrors TMA poolMode.ts. */
class PoolModePreferences(context: Context) {

    private val sp = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    enum class MiningMode { SOLO, POOL }

    fun getMiningMode(): MiningMode {
        val v = sp.getString(KEY_MINING_MODE, MODE_SOLO) ?: MODE_SOLO
        return if (v == MODE_POOL) MiningMode.POOL else MiningMode.SOLO
    }

    fun setMiningMode(mode: MiningMode) {
        sp.edit().putString(KEY_MINING_MODE, if (mode == MiningMode.POOL) MODE_POOL else MODE_SOLO).apply()
    }

    fun getChosenPoolId(address: String): Int? {
        val key = address.trim()
        if (key.isEmpty()) return null
        if (!sp.contains(chosenKey(key))) return null
        val id = sp.getInt(chosenKey(key), -1)
        return if (id in 0 until 5) id else null
    }

    fun markPoolChosen(address: String, poolId: Int) {
        val key = address.trim()
        if (key.isEmpty()) return
        sp.edit().putInt(chosenKey(key), poolId.coerceIn(0, 4)).apply()
    }

    fun clearPoolChosen(address: String) {
        val key = address.trim()
        if (key.isEmpty()) return
        sp.edit().remove(chosenKey(key)).apply()
    }

    fun setPoolStakePending(address: String) {
        sp.edit().putString(KEY_POOL_STAKE_PENDING, address.trim()).apply()
    }

    fun getPoolStakePendingAddress(): String? {
        val v = sp.getString(KEY_POOL_STAKE_PENDING, null)?.trim()
        return v?.takeIf { it.isNotEmpty() }
    }

    fun clearPoolStakePending() {
        sp.edit().remove(KEY_POOL_STAKE_PENDING).apply()
    }

    fun isPoolStakePending(address: String): Boolean =
        getPoolStakePendingAddress() == address.trim()

    private fun chosenKey(address: String) = "pool_chosen_$address"

    companion object {
        private const val PREFS_NAME = "pool_mode_prefs"
        private const val KEY_MINING_MODE = "mining_mode"
        private const val KEY_POOL_STAKE_PENDING = "pool_stake_pending_addr"
        private const val MODE_SOLO = "solo"
        private const val MODE_POOL = "pool"
    }
}
