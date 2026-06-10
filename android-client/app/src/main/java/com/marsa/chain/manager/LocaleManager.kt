package com.marsa.chain.manager

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/** App UI locale — 9 languages (TMA parity). */
object LocaleManager {

    const val LOCALE_EN = "en"
    const val LOCALE_RU = "ru"
    const val LOCALE_ES = "es"
    const val LOCALE_AR = "ar"
    const val LOCALE_FR = "fr"
    const val LOCALE_PT = "pt"
    const val LOCALE_ID = "id"
    const val LOCALE_DE = "de"
    const val LOCALE_JA = "ja"

    private const val PREFS_NAME = "app_locale_prefs"
    private const val KEY_LOCALE = "locale"

    private val SUPPORTED = listOf(
        LOCALE_EN, LOCALE_RU, LOCALE_ES, LOCALE_AR, LOCALE_FR,
        LOCALE_PT, LOCALE_ID, LOCALE_DE, LOCALE_JA
    )

    fun supportedLocales(): List<String> = SUPPORTED

    fun isSupported(code: String): Boolean = code in SUPPORTED

    fun getLocale(context: Context): String {
        val stored = context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_LOCALE, null)
            ?.trim()
        if (!stored.isNullOrEmpty() && isSupported(stored)) return stored
        return pickDefaultLocale()
    }

    fun setLocale(context: Context, code: String) {
        val locale = if (isSupported(code)) code else LOCALE_EN
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LOCALE, locale)
            .apply()
    }

    fun attachBaseContext(base: Context): Context {
        return applyLocale(base, getLocale(base))
    }

    fun applyLocale(context: Context, code: String): Context {
        val locale = Locale(code)
        Locale.setDefault(locale)
        val config = Configuration(context.resources.configuration)
        config.setLocale(locale)
        // Keep LTR layout for all locales (Arabic text only, no mirror flip — wallet-app style).
        config.setLayoutDirection(Locale(LOCALE_EN))
        return context.createConfigurationContext(config)
    }

    private fun pickDefaultLocale(): String {
        val sys = Locale.getDefault().language.lowercase(Locale.ROOT)
        return when {
            sys.startsWith(LOCALE_RU) -> LOCALE_RU
            sys.startsWith(LOCALE_ES) -> LOCALE_ES
            sys.startsWith(LOCALE_AR) -> LOCALE_AR
            sys.startsWith(LOCALE_FR) -> LOCALE_FR
            sys.startsWith(LOCALE_PT) -> LOCALE_PT
            sys.startsWith(LOCALE_ID) -> LOCALE_ID
            sys.startsWith(LOCALE_DE) -> LOCALE_DE
            sys.startsWith(LOCALE_JA) -> LOCALE_JA
            else -> LOCALE_EN
        }
    }
}
