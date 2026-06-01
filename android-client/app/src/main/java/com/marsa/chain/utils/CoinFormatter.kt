package com.marsa.chain.utils

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat

/**
 * Coin formatting utility.
 * Smallest units (wei): 1 coin = [WEI_PER_COIN] (10^8, like satoshis).
 */
object CoinFormatter {
    const val COIN_DECIMAL_DIGITS = 8
    const val WEI_PER_COIN = 100_000_000L

    /**
     * Converts wei to coins (BigDecimal for precision).
     */
    fun nanosToCoins(nanos: Long): BigDecimal {
        return BigDecimal(nanos).divide(BigDecimal(WEI_PER_COIN), COIN_DECIMAL_DIGITS, RoundingMode.HALF_UP)
    }

    /**
     * Converts coins to wei.
     */
    fun coinsToNanos(coins: Double): Long {
        return (coins * WEI_PER_COIN).toLong()
    }

    /**
     * Formats wei for display.
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
     * Formats wei with given decimal places.
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
     * @deprecated Use format() instead. MRS is shown in UI separately.
     */
    @Deprecated("Use format() instead", ReplaceWith("format(nanos)"))
    fun formatWithSuffix(nanos: Long): String {
        return format(nanos)
    }

    /**
     * Parses coin string (e.g. "1.5" or "5000.00") to wei.
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
