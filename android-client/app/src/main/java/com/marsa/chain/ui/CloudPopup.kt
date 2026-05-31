package com.marsa.chain.ui

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.View.MeasureSpec
import android.view.ViewGroup
import android.widget.PopupWindow
import android.widget.TextView
import com.marsa.chain.R
import com.google.android.material.button.MaterialButton
import kotlin.math.roundToInt

/**
 * Dark “cloud” popup below an anchor. Uses explicit width + [showAtLocation] so text is not
 * measured at width 0 (common [PopupWindow] + [match_parent] bug) and position is clamped on screen.
 */
object CloudPopup {

    private const val POPUP_WIDTH_DP = 280f
    private const val EDGE_MARGIN_DP = 12f
    private const val BELOW_ANCHOR_OFFSET_DP = 8f

    fun showInfoBelow(anchor: View, title: String?, message: CharSequence) {
        val ctx = anchor.context
        val content = LayoutInflater.from(ctx).inflate(R.layout.popup_cloud_bubble, null, false) as ViewGroup
        bindInfo(content, title, message)
        val popup = createPopup(content)
        positionBelowAnchor(anchor, content, popup)
    }

    fun showConfirmBelow(
        anchor: View,
        title: String?,
        message: CharSequence,
        negativeText: String,
        positiveText: String,
        onPositive: () -> Unit,
        onNegative: (() -> Unit)? = null,
        /** Called when the popup closes without choosing “positive” (Cancel, outside tap, back). */
        onDismissWithoutConfirm: (() -> Unit)? = null
    ) {
        val ctx = anchor.context
        val content = LayoutInflater.from(ctx).inflate(R.layout.popup_cloud_bubble, null, false) as ViewGroup
        bindInfo(content, title, message)
        val btnRow = content.findViewById<View>(R.id.cloudButtonRow)
        val neg = content.findViewById<MaterialButton>(R.id.cloudButtonNegative)
        val pos = content.findViewById<MaterialButton>(R.id.cloudButtonPositive)
        btnRow.visibility = View.VISIBLE
        neg.text = negativeText
        pos.text = positiveText

        val popup = createPopup(content)
        var positiveChosen = false
        popup.setOnDismissListener {
            if (!positiveChosen) {
                onNegative?.invoke()
                onDismissWithoutConfirm?.invoke()
            }
        }
        neg.setOnClickListener {
            popup.dismiss()
        }
        pos.setOnClickListener {
            positiveChosen = true
            popup.dismiss()
            onPositive()
        }
        positionBelowAnchor(anchor, content, popup)
    }

    private fun bindInfo(content: ViewGroup, title: String?, message: CharSequence) {
        val titleView = content.findViewById<TextView>(R.id.cloudTitle)
        val msgView = content.findViewById<TextView>(R.id.cloudMessage)
        val btnRow = content.findViewById<View>(R.id.cloudButtonRow)
        if (title.isNullOrBlank()) {
            titleView.visibility = View.GONE
        } else {
            titleView.visibility = View.VISIBLE
            titleView.text = title
        }
        msgView.text = message
        msgView.visibility = if (message.isBlank()) View.GONE else View.VISIBLE
        btnRow.visibility = View.GONE
    }

    private fun createPopup(content: View): PopupWindow {
        return PopupWindow(
            content,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            true
        ).apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            elevation = 18f
            isOutsideTouchable = true
            isFocusable = true
        }
    }

    private fun dp(view: View, dp: Float): Int =
        (dp * view.resources.displayMetrics.density).roundToInt()

    private fun positionBelowAnchor(anchor: View, content: View, popup: PopupWindow) {
        val dm = anchor.resources.displayMetrics
        val popupWidthPx = dp(anchor, POPUP_WIDTH_DP)
        val widthSpec = MeasureSpec.makeMeasureSpec(popupWidthPx, MeasureSpec.EXACTLY)
        val heightSpec = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)
        content.measure(widthSpec, heightSpec)

        val popupW = content.measuredWidth
        val popupH = content.measuredHeight

        val anchorLoc = IntArray(2)
        anchor.getLocationOnScreen(anchorLoc)

        val margin = dp(anchor, EDGE_MARGIN_DP)
        val screenW = dm.widthPixels

        val centerScreenX = anchorLoc[0] + anchor.width / 2
        var leftScreen = centerScreenX - popupW / 2
        leftScreen = leftScreen.coerceIn(margin, screenW - popupW - margin)

        val topScreen = anchorLoc[1] + anchor.height + dp(anchor, BELOW_ANCHOR_OFFSET_DP)

        val parent = anchor.rootView
        val parentLoc = IntArray(2)
        parent.getLocationOnScreen(parentLoc)

        val relX = leftScreen - parentLoc[0]
        val relY = topScreen - parentLoc[1]

        popup.width = popupW
        popup.height = popupH
        popup.showAtLocation(parent, Gravity.NO_GRAVITY, relX, relY)
    }
}
