package com.marsa.chain.ui

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.TextView
import com.marsa.chain.R
import com.marsa.chain.manager.LocaleManager

/** Dark-themed language dropdown — matches wallet picker style (TMA). */
class LocalePickerHelper(
    private val context: Context,
    private val anchor: View,
    private val valueView: TextView,
    private val chevronView: ImageView?,
    private val onLocaleChanged: (() -> Unit)? = null
) {
    private var popup: PopupWindow? = null
    private val codes = LocaleManager.supportedLocales()

    fun bind() {
        anchor.layoutDirection = View.LAYOUT_DIRECTION_LTR
        valueView.layoutDirection = View.LAYOUT_DIRECTION_LTR
        valueView.textAlignment = View.TEXT_ALIGNMENT_VIEW_START
        valueView.textDirection = View.TEXT_DIRECTION_LTR
        refreshValue()
        anchor.setOnClickListener { toggleMenu() }
    }

    fun refreshValue() {
        valueView.text = labelFor(LocaleManager.getLocale(context))
    }

    /** Native language labels — same in every UI locale (TMA LOCALE_LABELS). */
    private fun labelFor(code: String): String = context.getString(
        when (code) {
            LocaleManager.LOCALE_RU -> R.string.language_russian
            LocaleManager.LOCALE_ES -> R.string.language_spanish
            LocaleManager.LOCALE_AR -> R.string.language_arabic
            LocaleManager.LOCALE_FR -> R.string.language_french
            LocaleManager.LOCALE_PT -> R.string.language_portuguese
            LocaleManager.LOCALE_ID -> R.string.language_indonesian
            LocaleManager.LOCALE_DE -> R.string.language_german
            LocaleManager.LOCALE_JA -> R.string.language_japanese
            else -> R.string.language_english
        }
    )

    private fun toggleMenu() {
        if (popup?.isShowing == true) {
            dismiss()
            return
        }
        showMenu()
    }

    private fun showMenu() {
        dismiss()
        val inflater = LayoutInflater.from(context)
        val menu = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_LTR
            setBackgroundResource(R.drawable.wallet_picker_menu_bg)
            val pad = (4 * context.resources.displayMetrics.density).toInt()
            setPadding(0, pad, 0, pad)
        }
        codes.forEachIndexed { index, code ->
            val item = inflater.inflate(R.layout.item_wallet_picker_option, menu, false)
            item.layoutDirection = View.LAYOUT_DIRECTION_LTR
            item.findViewById<TextView>(R.id.walletPickerOptionText).apply {
                text = labelFor(code)
                setTextColor(0xFFFFFFFF.toInt())
                layoutDirection = View.LAYOUT_DIRECTION_LTR
                textAlignment = View.TEXT_ALIGNMENT_VIEW_START
                textDirection = View.TEXT_DIRECTION_LTR
            }
            item.findViewById<View>(R.id.walletPickerOptionDot).visibility = View.GONE
            item.setOnClickListener {
                if (code != LocaleManager.getLocale(context)) {
                    LocaleManager.setLocale(context, code)
                    refreshValue()
                    onLocaleChanged?.invoke()
                }
                dismiss()
            }
            menu.addView(item)
            if (index < codes.lastIndex) {
                val divider = View(context).apply {
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        (1 * context.resources.displayMetrics.density).toInt()
                    )
                    setBackgroundColor(0xFF2C2C2E.toInt())
                }
                menu.addView(divider)
            }
        }
        popup = PopupWindow(
            menu,
            anchor.width,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            true
        ).apply {
            isOutsideTouchable = true
            elevation = 12f
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setOnDismissListener {
                popup = null
                chevronView?.rotation = 0f
            }
        }
        popup?.showAsDropDown(anchor, 0, (4 * context.resources.displayMetrics.density).toInt(), Gravity.START)
        chevronView?.rotation = 180f
    }

    fun dismiss() {
        popup?.dismiss()
        popup = null
        chevronView?.rotation = 0f
    }
}
