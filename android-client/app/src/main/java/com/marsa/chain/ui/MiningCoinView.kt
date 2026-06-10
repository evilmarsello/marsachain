package com.marsa.chain.ui

import android.animation.ObjectAnimator
import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.View
import android.widget.FrameLayout
import com.marsa.chain.R

/** 3D coin (MRS / Pool) with flip animation — TMA miningCoinFlip parity. */
class MiningCoinView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : FrameLayout(context, attrs) {

    private val coinInner: View
    private val faceSolo: View
    private val facePool: View
    private val tapTarget: View
    private var showingPool = false
    private var flipAnimator: ObjectAnimator? = null

    init {
        LayoutInflater.from(context).inflate(R.layout.view_mining_coin, this, true)
        coinInner = findViewById(R.id.miningCoinInner)
        faceSolo = findViewById(R.id.miningFaceSolo)
        facePool = findViewById(R.id.miningFacePool)
        tapTarget = findViewById(R.id.miningCoinTap)
        setup3d()
        setPoolFaceImmediate(false)
    }

    private fun setup3d() {
        val density = resources.displayMetrics.density
        val dist = 12000f * density
        coinInner.cameraDistance = dist
        faceSolo.cameraDistance = dist
        facePool.cameraDistance = dist
        setLayerType(LAYER_TYPE_HARDWARE, null)
        coinInner.setLayerType(LAYER_TYPE_HARDWARE, null)
    }

    fun getTapTarget(): View = tapTarget

    fun setPoolFaceImmediate(pool: Boolean) {
        showingPool = pool
        flipAnimator?.cancel()
        coinInner.rotationY = if (pool) 180f else 0f
        updateFaceVisibility(pool)
    }

    fun playFlip(toPool: Boolean, durationMs: Long = 1000, onComplete: (() -> Unit)? = null) {
        if (showingPool == toPool) {
            onComplete?.invoke()
            return
        }
        flipAnimator?.cancel()
        val target = if (toPool) 180f else 0f
        flipAnimator = ObjectAnimator.ofFloat(coinInner, ROTATION_Y, coinInner.rotationY, target).apply {
            duration = durationMs
            addUpdateListener {
                val angle = ((it.animatedValue as Float) % 360f + 360f) % 360f
                updateFaceVisibility(angle >= 90f && angle < 270f)
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    showingPool = toPool
                    updateFaceVisibility(toPool)
                    onComplete?.invoke()
                }
            })
            start()
        }
    }

    private fun updateFaceVisibility(poolVisible: Boolean) {
        faceSolo.alpha = if (poolVisible) 0f else 1f
        facePool.alpha = if (poolVisible) 1f else 0f
    }

    companion object {
        const val FLIP_MS = 1000L
        const val OVERLAY_REVEAL_MS = 1000L
    }
}
