package com.marsa.chain.ui

import android.app.Activity
import android.graphics.Color
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.WindowCompat

/**
 * Dark chrome (#1C1C1E). Edge-to-edge off at window level; header uses [HeaderInsets] spacer once.
 */
object UiTheme {

    const val HEADER_BAR_COLOR = 0xFF1C1C1E.toInt()

    fun apply(activity: Activity) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
        activity.window.statusBarColor = HEADER_BAR_COLOR
        activity.window.navigationBarColor = Color.BLACK
        WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
    }
}
