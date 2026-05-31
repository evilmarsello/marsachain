package com.marsa.chain.ui

import android.content.Context
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import com.marsa.chain.R
import com.marsa.chain.fragments.SortType

class SortOptionsPopup(
    private val context: Context,
    private val onSortSelected: (SortType) -> Unit
) {
    private var popupWindow: PopupWindow? = null
    private var currentSortType = SortType.BY_DATE

    fun show(anchorView: View, currentSort: SortType) {
        currentSortType = currentSort
        dismiss() // Close any existing popup

        val inflater = LayoutInflater.from(context)
        val popupView = inflater.inflate(R.layout.sort_options_popup, null)

        setupViews(popupView)

        popupWindow = PopupWindow(
            popupView,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            true
        ).apply {
            isOutsideTouchable = true
            isFocusable = true
            elevation = 8f
        }

        // Position the popup below the anchor view
        popupView.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
        val popupWidth = popupView.measuredWidth
        val popupHeight = popupView.measuredHeight

        val location = IntArray(2)
        anchorView.getLocationOnScreen(location)
        val anchorX = location[0]
        val anchorY = location[1]
        val anchorWidth = anchorView.width
        val anchorHeight = anchorView.height

        // Position popup to the right of the anchor view
        val x = anchorX + anchorWidth - popupWidth
        val y = anchorY + anchorHeight / 2 - popupHeight / 2

        popupWindow?.showAtLocation(anchorView, Gravity.NO_GRAVITY, x, y)
    }

    private fun setupViews(popupView: View) {
        val sortByDate = popupView.findViewById<LinearLayout>(R.id.sortByDate)
        val sortByBalance = popupView.findViewById<LinearLayout>(R.id.sortByBalance)
        val dateCheckIcon = popupView.findViewById<ImageView>(R.id.dateCheckIcon)
        val balanceCheckIcon = popupView.findViewById<ImageView>(R.id.balanceCheckIcon)

        // Set current selection
        when (currentSortType) {
            SortType.BY_DATE -> {
                dateCheckIcon.visibility = View.VISIBLE
                balanceCheckIcon.visibility = View.GONE
            }
            SortType.BY_BALANCE -> {
                dateCheckIcon.visibility = View.GONE
                balanceCheckIcon.visibility = View.VISIBLE
            }
        }

        sortByDate.setOnClickListener {
            onSortSelected(SortType.BY_DATE)
            dismiss()
        }

        sortByBalance.setOnClickListener {
            onSortSelected(SortType.BY_BALANCE)
            dismiss()
        }
    }

    fun dismiss() {
        popupWindow?.dismiss()
        popupWindow = null
    }
}
