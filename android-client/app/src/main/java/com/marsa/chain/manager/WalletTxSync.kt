package com.marsa.chain.manager

import android.content.Context
import com.marsa.chain.data.TransactionEntity
import com.marsa.chain.network.AddressTxDTO
import com.marsa.chain.network.ApiClient
import com.marsa.chain.utils.TxKindHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Incremental tx sync — cache-first, merge new rows only (TMA txCache parity). */
class WalletTxSync(
    context: Context,
    private val transactionManager: TransactionManager,
    private val api: ApiClient
) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    suspend fun syncAddress(address: String, forceNetwork: Boolean = false): Int = withContext(Dispatchers.IO) {
        val key = address.trim()
        if (key.isEmpty()) return@withContext 0
        val lastSync = prefs.getLong(syncKey(key), 0L)
        val now = System.currentTimeMillis()
        if (!forceNetwork && lastSync > 0 && now - lastSync < MIN_SYNC_INTERVAL_MS) {
            return@withContext 0
        }
        var imported = 0
        val remote = api.getAddressTransactions(key, limit = 500)
        for (rtx in remote) {
            val existing = transactionManager.getTransactionById(rtx.txid)
            if (existing == null) {
                transactionManager.addTransaction(entityFromRemoteTx(rtx))
                imported++
            } else if (existing.blockHeight == null && rtx.blockHeight > 0) {
                transactionManager.updateTransaction(
                    existing.copy(blockHeight = rtx.blockHeight, status = "pending")
                )
            }
        }
        prefs.edit().putLong(syncKey(key), now).apply()
        imported
    }

    suspend fun syncAddresses(addresses: List<String>, forceNetwork: Boolean = false): Int =
        withContext(Dispatchers.IO) {
            var total = 0
            for (addr in addresses) {
                total += syncAddress(addr, forceNetwork)
            }
            total
        }

    fun walletTabRows(all: List<TransactionEntity>, viewAddress: String): List<TransactionEntity> {
        val addr = viewAddress.trim()
        return all
            .filter { it.fromAddress == addr || it.toAddress == addr }
            .filter { row ->
                val kind = TxKindHelper.normalizeKind(row.type, row.fromAddress, row.txid)
                kind == "send" || kind == "receive" || TxKindHelper.isStakeKind(kind)
            }
            .sortedByDescending { it.timestamp }
    }

    companion object {
        private const val PREFS_NAME = "wallet_tx_sync"
        private const val MIN_SYNC_INTERVAL_MS = 30_000L

        private fun syncKey(address: String) = "last_sync_$address"

        fun entityFromRemoteTx(rtx: AddressTxDTO): TransactionEntity {
            val kind = TxKindHelper.normalizeKind(rtx.type, rtx.fromAddress, rtx.txid)
            val baseTs = if (rtx.timestamp > 10_000_000_000L) rtx.timestamp else rtx.timestamp * 1000L
            val blockHeight = rtx.blockHeight.takeIf { it > 0 }
            return when (kind) {
                "mining" -> TransactionEntity(
                    txid = rtx.txid,
                    fromAddress = "mining_reward",
                    toAddress = rtx.toAddress,
                    amount = rtx.amount,
                    fee = rtx.fee,
                    timestamp = baseTs,
                    status = "pending",
                    blockHeight = blockHeight,
                    confirmations = 0,
                    type = "mining"
                )
                "send" -> TransactionEntity(
                    txid = rtx.txid,
                    fromAddress = rtx.fromAddress,
                    toAddress = rtx.toAddress,
                    amount = rtx.amount,
                    fee = rtx.fee,
                    timestamp = baseTs,
                    status = "pending",
                    blockHeight = blockHeight,
                    confirmations = 0,
                    type = "send"
                )
                else -> TransactionEntity(
                    txid = rtx.txid,
                    fromAddress = rtx.fromAddress,
                    toAddress = rtx.toAddress,
                    amount = rtx.amount,
                    fee = rtx.fee,
                    timestamp = baseTs,
                    status = "pending",
                    blockHeight = blockHeight,
                    confirmations = 0,
                    type = kind
                )
            }
        }
    }
}
