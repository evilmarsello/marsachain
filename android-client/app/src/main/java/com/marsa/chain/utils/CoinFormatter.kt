package com.marsa.chain.utils

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat

/**
 * Утилита для форматирования монет.
 * Минимальные единицы (wei): 1 монета = [WEI_PER_COIN] (10^8, как у сатоши).
 */
object CoinFormatter {
    const val COIN_DECIMAL_DIGITS = 8
    const val WEI_PER_COIN = 100_000_000L

    /**
     * Конвертирует wei в монеты (BigDecimal для точности).
     */
    fun nanosToCoins(nanos: Long): BigDecimal {
        return BigDecimal(nanos).divide(BigDecimal(WEI_PER_COIN), COIN_DECIMAL_DIGITS, RoundingMode.HALF_UP)
    }

    /**
     * Конвертирует монеты в wei.
     */
    fun coinsToNanos(coins: Double): Long {
        return (coins * WEI_PER_COIN).toLong()
    }

    /**
     * Форматирует wei для отображения.
     */
    fun format(nanos: Long): String {
        if (nanos == 0L) {
            return "0.00"
        }

        val coins = nanosToCoins(nanos)

        val remainder = nanos % WEI_PER_COIN
        val decimals = when {
            remainder == 0L -> 2
            else -> {
                var trailingZeros = 0
                var temp = remainder
                while (temp % 10 == 0L && temp > 0) {
                    trailingZeros++
                    temp /= 10
                }
                val calculated = COIN_DECIMAL_DIGITS - trailingZeros
                calculated.coerceAtMost(2)
            }
        }

        val format = DecimalFormat("0.${"0".repeat(decimals)}")

        return format.format(coins)
    }

    /**
     * Форматирует wei с указанным количеством знаков после запятой.
     */
    fun format(nanos: Long, decimals: Int): String {
        if (nanos == 0L) {
            return "0.${"0".repeat(decimals.coerceIn(0, COIN_DECIMAL_DIGITS))}"
        }

        val coins = nanosToCoins(nanos)
        val format = DecimalFormat("0.${"0".repeat(decimals.coerceIn(0, COIN_DECIMAL_DIGITS))}")
        return format.format(coins)
    }

    /**
     * @deprecated Используйте format() вместо этого. MRS уже отображается в UI.
     */
    @Deprecated("Use format() instead", ReplaceWith("format(nanos)"))
    fun formatWithSuffix(nanos: Long): String {
        return format(nanos)
    }

    /**
     * Парсит строку с монетами (например, "1.5" или "5000.00") в wei.
     */
    fun parseToNanos(coinsString: String): Long? {
        return try {
            val normalized = coinsString.trim().replace(',', '.')
            val coins = normalized.toDouble()
            val nanos = coinsToNanos(coins)
            android.util.Log.d("CoinFormatter", "parseToNanos: input='$coinsString' -> normalized='$normalized' -> coins=$coins -> wei=$nanos")
            nanos
        } catch (e: Exception) {
            android.util.Log.e("CoinFormatter", "parseToNanos error: input='$coinsString', error=${e.message}")
            null
        }
    }
}
