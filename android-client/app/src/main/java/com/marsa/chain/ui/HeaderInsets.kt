package com.marsa.chain.ui

import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/** Status-bar padding on the header bar only — no extra spacer row, safe on recreate(). */
object HeaderInsets {

    fun applyTopBar(topBar: View) {
        val padStart = topBar.paddingStart
        val padEnd = topBar.paddingEnd
        val padBottom = topBar.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(topBar) { view, insets ->
            val top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            view.setPaddingRelative(padStart, top, padEnd, padBottom)
            WindowInsetsCompat.CONSUMED
        }
        ViewCompat.requestApplyInsets(topBar)
    }
}
