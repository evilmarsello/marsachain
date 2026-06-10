package com.marsa.chain.utils

import java.math.BigDecimal
import java.math.BigInteger
import java.math.RoundingMode


object DifficultyDisplay {
    private const val INITIAL_TARGET_COMPACT = 0x207fffffL
    
    private const val INITIAL_DISPLAY_VALUE = 2.0

    
    fun hashMeetsTarget(hashHex: String, compactBits: Long): Boolean {
        if (hashHex.length != 64) return false
        val target = compactToTarget(compactBits)
        if (target.signum() <= 0) return false
        val hashNum = BigInteger(hashHex, 16)
        return hashNum.compareTo(target) <= 0
    }

    
    fun compactToTarget(compact: Long): BigInteger {
        val nSize = (compact ushr 24).toInt() and 0xFF
        val nWord = compact and 0x7FFFFFL
        return if (nSize <= 3) {
            BigInteger.valueOf(nWord ushr (8 * (3 - nSize)))
        } else {
            BigInteger.valueOf(nWord).shiftLeft(8 * (nSize - 3))
        }
    }

    
    fun formatCompactBits(bits: Int): String {
        val compact = bits.toLong() and 0xFFFFFFFFL
        val target = compactToTarget(compact)
        if (target.signum() <= 0) return "—"
        val initialTarget = compactToTarget(INITIAL_TARGET_COMPACT)
        if (initialTarget.signum() <= 0) return "—"
        val ratio = try {
            BigDecimal(initialTarget).divide(BigDecimal(target), 20, RoundingMode.HALF_UP).toDouble()
        } catch (_: Exception) {
            return "—"
        }
        if (ratio.isNaN() || ratio.isInfinite()) return "—"
        val displayValue = INITIAL_DISPLAY_VALUE * ratio
        return when {
            displayValue >= 1e9 -> "×>1e9"
            displayValue >= 1e6 -> "×%.1fe6".format(displayValue / 1e6)
            displayValue >= 1e3 -> "×%.1fk".format(displayValue / 1e3)
            displayValue in 1.95..2.05 -> "2"
            displayValue >= 1.0 -> "×%.2f".format(displayValue)
            else -> "×%.2f".format(displayValue)
        }
    }
}
