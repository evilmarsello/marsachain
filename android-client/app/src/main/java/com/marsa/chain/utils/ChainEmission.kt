package com.marsa.chain.utils

import java.math.BigInteger


object ChainEmission {
    const val MAX_SUPPLY_COINS = 50_000_000_000L
    private val MAX_SUPPLY_NANOS: Long = MAX_SUPPLY_COINS * CoinFormatter.WEI_PER_COIN
    private val INITIAL_NANOS: Long = 10_000L * CoinFormatter.WEI_PER_COIN
    private const val HALVING_INTERVAL = 1_050_000

    private fun reductionPercent(halvingNumber: Int): Double = when (halvingNumber) {
        1 -> 0.50
        2 -> 0.40
        3 -> 0.30
        4 -> 0.20
        else -> 0.10
    }

    private fun rewardNanosForHalvingCount(halvingCount: Int): Long {
        if (halvingCount <= 0) return INITIAL_NANOS
        var reward = INITIAL_NANOS.toDouble()
        val minReward = INITIAL_NANOS / 10
        for (i in 1..halvingCount) {
            reward *= (1.0 - reductionPercent(i))
            if (reward < minReward) {
                reward = minReward.toDouble()
                break
            }
        }
        return reward.toLong()
    }

    
    fun blockRewardFullNanos(height: Int): Long {
        if (height <= 0) return INITIAL_NANOS
        val halvingCount = (height - 1) / HALVING_INTERVAL
        return rewardNanosForHalvingCount(halvingCount)
    }

    
    fun totalEmittedNanos(upToHeightInclusive: Int): Long {
        if (upToHeightInclusive < 0) return 0L
        var total = blockRewardFullNanos(0)
        if (total >= MAX_SUPPLY_NANOS) return MAX_SUPPLY_NANOS
        if (upToHeightInclusive == 0) return total.coerceAtMost(MAX_SUPPLY_NANOS)

        var start = 1L
        val maxH = upToHeightInclusive.toLong()
        while (start <= maxH) {
            val hc = ((start - 1) / HALVING_INTERVAL).toInt()
            val endOfEra = minOf(maxH, (hc + 1L) * HALVING_INTERVAL)
            val r = rewardNanosForHalvingCount(hc)
            val count = endOfEra - start + 1
            val add = BigInteger.valueOf(count)
                .multiply(BigInteger.valueOf(r))
                .min(BigInteger.valueOf(Long.MAX_VALUE))
                .toLong()
                .coerceAtMost(MAX_SUPPLY_NANOS - total)
            total += add
            if (total >= MAX_SUPPLY_NANOS) return MAX_SUPPLY_NANOS
            start = endOfEra + 1
        }
        return total.coerceAtMost(MAX_SUPPLY_NANOS)
    }

    fun emittedWholeCoins(upToHeightInclusive: Int): Long =
        totalEmittedNanos(upToHeightInclusive) / CoinFormatter.WEI_PER_COIN

    
    fun abbrevWholeMrs(coins: Long): String {
        if (coins <= 0) return "0"
        val v = coins.toDouble()
        return when {
            v >= 1_000_000_000_000.0 -> "${(coins / 1_000_000_000_000L)}T"
            v >= 1_000_000_000.0 -> "${coins / 1_000_000_000L}B"
            v >= 1_000_000.0 -> "${coins / 1_000_000L}M"
            v >= 1_000.0 -> "${coins / 1000L}K"
            else -> coins.toString()
        }
    }

    fun emissionProgressLabel(upToHeightInclusive: Int): String {
        val mined = emittedWholeCoins(upToHeightInclusive)
        return "${abbrevWholeMrs(mined)}/${abbrevWholeMrs(MAX_SUPPLY_COINS)}"
    }
}
