package com.marsa.chain.manager

import android.content.Context

object PoolsInfoPrefs {
    private const val PREFS = "pools_info_prefs"
    private const val KEY_SEEN = "info_seen_v1"

    fun wasSeen(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_SEEN, false)

    fun markSeen(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_SEEN, true)
            .apply()
    }
}
