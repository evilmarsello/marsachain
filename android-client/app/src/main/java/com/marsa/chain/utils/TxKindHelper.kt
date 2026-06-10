package com.marsa.chain.utils

import com.marsa.chain.data.TransactionEntity

/** Normalizes address-transaction types — mirrors TMA txHistory.ts. */
object TxKindHelper {

    private val stakeKinds = setOf(
        "stake",
        "unstake",
        "miner_stake",
        "miner_unstake",
        "miner_pool_stake",
        "miner_pool_unstake"
    )

    fun normalizeKind(type: String?, fromAddress: String?, txid: String?): String {
        val t = (type ?: "").lowercase().replace('-', '_')
        val from = fromAddress.orEmpty()
        val id = txid.orEmpty()
        return when {
            t == "mining" || from == "mining_reward" || id.endsWith("_cb") -> "mining"
            t == "validator_reward" -> "validator_reward"
            t == "stake" -> "stake"
            t == "unstake" -> "unstake"
            t == "miner_stake" || t == "miner_stake_tx" -> "miner_stake"
            t == "miner_unstake" -> "miner_unstake"
            t == "miner_pool_stake" || t == "miner_stake_pool" -> "miner_pool_stake"
            t == "miner_pool_unstake" -> "miner_pool_unstake"
            t == "send" -> "send"
            t == "receive" -> "receive"
            else -> "receive"
        }
    }

    fun isStakeKind(kind: String): Boolean = kind in stakeKinds

    fun isHistoryAllKind(kind: String): Boolean =
        kind == "send" ||
            kind == "receive" ||
            kind == "internal" ||
            kind == "mining" ||
            kind == "validator_reward" ||
            isStakeKind(kind)

    fun classifyForUser(entity: TransactionEntity, userAddresses: List<String>): String {
        val normalized = normalizeKind(entity.type, entity.fromAddress, entity.txid)
        if (normalized == "mining" || normalized == "validator_reward") return normalized
        if (isStakeKind(normalized)) return normalized
        val isFromUser = userAddresses.contains(entity.fromAddress)
        val isToUser = userAddresses.contains(entity.toAddress)
        return when {
            isFromUser && isToUser -> "internal"
            isFromUser -> "send"
            isToUser -> "receive"
            else -> "unknown"
        }
    }

    fun stakeDebitAmount(entity: TransactionEntity): Long =
        entity.amount + entity.fee
}
