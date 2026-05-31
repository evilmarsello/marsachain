package com.marsa.chain.utils

import android.view.MotionEvent
import android.view.View
import android.widget.TextView

/**
 * Shows [secret] while the user holds the pointer down on [view].
 * Finger may leave the view; key stays visible until ACTION_UP / ACTION_CANCEL.
 */
object PressHoldReveal {
    private const val DEFAULT_MASK = "••••••••••••••••••••••••••••••••"

    fun attach(view: TextView, secret: String, masked: String = DEFAULT_MASK) {
        view.text = masked
        var activePointerId = -1
        view.setOnTouchListener { v, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    activePointerId = event.getPointerId(0)
                    view.text = secret
                    v.parent?.requestDisallowInterceptTouchEvent(true)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    val pid = event.getPointerId(0)
                    if (activePointerId == -1 || pid == activePointerId) {
                        view.text = masked
                        activePointerId = -1
                        v.parent?.requestDisallowInterceptTouchEvent(false)
                    }
                    true
                }
                MotionEvent.ACTION_POINTER_UP -> {
                    val upIndex = event.actionIndex
                    val upId = event.getPointerId(upIndex)
                    if (upId == activePointerId) {
                        view.text = masked
                        activePointerId = -1
                        v.parent?.requestDisallowInterceptTouchEvent(false)
                    }
                    true
                }
                else -> true
            }
        }
    }
}
