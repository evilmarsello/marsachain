package com.marsa.chain.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat
import com.marsa.chain.R

/**
 * Кольцо прогресса вдоль окружности (для кнопки майнинга).
 * progress 0f..1f — заполнение по часовой стрелке от верхней точки.
 * Когда progress == 0, ничего не рисуется.
 */
class CircularProgressRingView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val rect = RectF()
    private var strokeWidthPx = 8f
    private var progressColor = 0
    private var trackColor = 0

    var progress: Float = 0f
        set(value) {
            val v = value.coerceIn(0f, 1f)
            if (field != v) {
                field = v
                invalidate()
            }
        }

    init {
        strokeWidthPx = resources.getDimension(R.dimen.mining_ring_stroke)
        progressColor = ContextCompat.getColor(context, R.color.mining_ring_progress)
        trackColor = ContextCompat.getColor(context, R.color.mining_ring_track)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (progress <= 0f) return
        val w = width.toFloat()
        val h = height.toFloat()
        val r = (minOf(w, h) - strokeWidthPx) / 2f
        val cx = w / 2f
        val cy = h / 2f
        rect.set(cx - r, cy - r, cx + r, cy + r)
        // Фоновое кольцо (тонкое, полупрозрачное)
        ringPaint.color = trackColor
        ringPaint.strokeWidth = strokeWidthPx * 0.6f
        canvas.drawArc(rect, startAngle, 360f, false, ringPaint)
        // Заполняемая дуга
        ringPaint.color = progressColor
        ringPaint.strokeWidth = strokeWidthPx
        val sweep = 360f * progress.coerceIn(0f, 1f)
        canvas.drawArc(rect, startAngle, sweep, false, ringPaint)
    }

    companion object {
        private const val startAngle = -90f // верх
    }
}
