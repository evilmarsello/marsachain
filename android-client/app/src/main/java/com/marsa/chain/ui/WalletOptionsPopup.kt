package com.marsa.chain.ui

import android.content.Context
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.widget.PopupWindow
import com.marsa.chain.R
import com.marsa.chain.data.WalletInfo

class WalletOptionsPopup(
    private val context: Context,
    private val onCopyAddress: (WalletInfo) -> Unit,
    private val onRename: (WalletInfo) -> Unit,
    private val onShowPrivateKey: (WalletInfo) -> Unit,
    private val onSetActive: (WalletInfo) -> Unit,
    private val onDelete: (WalletInfo) -> Unit
) {
    
    private var popupWindow: PopupWindow? = null
    
    fun show(anchorView: View, wallet: WalletInfo) {
        dismiss() // Dismiss previous popup if any
        
        val inflater = LayoutInflater.from(context)
        val popupView = inflater.inflate(R.layout.wallet_options_popup, null)
        
        // Configure popup window
        popupWindow = PopupWindow(
            popupView,
            android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
            android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
            true
        ).apply {
            isOutsideTouchable = true
            isFocusable = true
            setBackgroundDrawable(context.getDrawable(android.R.color.transparent))
        }
        
        // Configure buttons
        setupButtons(popupView, wallet)
        
        // Show popup near button
        showPopup(anchorView, popupView)
    }
    
    private fun setupButtons(popupView: View, wallet: WalletInfo) {
        popupView.findViewById<View>(R.id.optionCopyAddress).setOnClickListener {
            onCopyAddress(wallet)
            dismiss()
        }
        popupView.findViewById<View>(R.id.optionRename).setOnClickListener {
            onRename(wallet)
            dismiss()
        }
        popupView.findViewById<View>(R.id.optionShowPrivateKey).setOnClickListener {
            onShowPrivateKey(wallet)
            dismiss()
        }
        popupView.findViewById<View>(R.id.optionSetActive).setOnClickListener {
            onSetActive(wallet)
            dismiss()
        }
        
        popupView.findViewById<View>(R.id.optionDelete).setOnClickListener {
            onDelete(wallet)
            dismiss()
        }
    }
    
    private fun showPopup(anchorView: View, popupView: View) {
        // Measure sizes
        popupView.measure(
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        )
        
        val popupWidth = popupView.measuredWidth
        val popupHeight = popupView.measuredHeight
        
        // Get anchor view coordinates
        val location = IntArray(2)
        anchorView.getLocationOnScreen(location)
        val anchorX = location[0]
        val anchorY = location[1]
        val anchorWidth = anchorView.width
        val anchorHeight = anchorView.height
        
        // Compute popup position
        val popupX = anchorX + anchorWidth - popupWidth
        val popupY = anchorY + anchorHeight + 8 // 8dp bottom offset
        
        // Show popup
        popupWindow?.showAtLocation(anchorView, Gravity.NO_GRAVITY, popupX, popupY)
    }
    
    fun dismiss() {
        popupWindow?.dismiss()
        popupWindow = null
    }
    
    fun isShowing(): Boolean {
        return popupWindow?.isShowing ?: false
    }
}
