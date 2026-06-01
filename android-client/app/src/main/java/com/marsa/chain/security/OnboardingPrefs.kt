package com.marsa.chain.security

import android.content.Context

object OnboardingPrefs {
    private const val PREFS = "onboarding_state_v1"
    private const val KEY_DONE = "onboarding_completed"

    fun isComplete(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_DONE, false)

    fun markComplete(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_DONE, true)
            .apply()
    }

    /** Reset for debugging / re-run (use with care). */
    fun reset(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
}
