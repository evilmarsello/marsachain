package com.marsa.chain.manager

import android.content.Context
import com.marsa.chain.data.AppDatabase
import com.marsa.chain.data.TransactionEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

class TransactionManager(private val context: Context) {
    private val database = AppDatabase.get(context)
    private val transactionsDao = database.transactionsDao()

    /**
     * Get all transactions for one address
     */
    fun getTransactionsForAddress(address: String): Flow<List<TransactionEntity>> {
        return transactionsDao.getTransactionsForAddress(address)
    }

    /**
     * Get all transactions for address list (all user wallets)
     */
    fun getTransactionsForAddresses(addresses: List<String>): Flow<List<TransactionEntity>> {
        return transactionsDao.getTransactionsForAddresses(addresses)
    }

    /**
     * Get transaction by ID
     */
    suspend fun getTransactionById(txid: String): TransactionEntity? {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTransactionById(txid)
        }
    }

    /**
     * Add new transaction
     */
    suspend fun addTransaction(transaction: TransactionEntity) {
        withContext(Dispatchers.IO) {
            transactionsDao.insertTransaction(transaction)
        }
    }

    /**
     * Update transaction status
     */
    suspend fun updateTransactionStatus(
        txid: String, 
        status: String, 
        blockHeight: Int? = null, 
        confirmations: Int = 0
    ) {
        withContext(Dispatchers.IO) {
            transactionsDao.updateTransactionStatus(txid, status, blockHeight, confirmations)
        }
    }

    /**
     * Update transaction
     */
    suspend fun updateTransaction(transaction: TransactionEntity) {
        withContext(Dispatchers.IO) {
            transactionsDao.updateTransaction(transaction)
        }
    }

    /**
     * Delete transaction
     */
    suspend fun deleteTransaction(txid: String) {
        withContext(Dispatchers.IO) {
            transactionsDao.deleteTransaction(txid)
        }
    }

    /**
     * Get transaction count for address
     */
    suspend fun getTransactionCount(address: String): Int {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTransactionCount(address)
        }
    }

    /**
     * Get total received amount
     */
    suspend fun getTotalReceived(address: String): Long {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTotalReceived(address) ?: 0L
        }
    }

    /**
     * Get total sent amount
     */
    suspend fun getTotalSent(address: String): Long {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTotalSent(address) ?: 0L
        }
    }

    /**
     * Create send transaction
     */
    fun createSendTransaction(
        txid: String,
        fromAddress: String,
        toAddress: String,
        amount: Long,
        fee: Long
    ): TransactionEntity {
        return TransactionEntity(
            txid = txid,
            fromAddress = fromAddress,
            toAddress = toAddress,
            amount = amount,
            fee = fee,
            timestamp = System.currentTimeMillis(),
            status = "pending",
            type = "send"
        )
    }

    /**
     * Create receive transaction
     */
    fun createReceiveTransaction(
        txid: String,
        fromAddress: String,
        toAddress: String,
        amount: Long,
        fee: Long = 0
    ): TransactionEntity {
        return TransactionEntity(
            txid = txid,
            fromAddress = fromAddress,
            toAddress = toAddress,
            amount = amount,
            fee = fee,
            timestamp = System.currentTimeMillis(),
            status = "confirmed", // Treat received txs as confirmed
            type = "receive"
        )
    }

    /**
     * Create mining transaction
     */
    fun createMiningTransaction(
        txid: String,
        minerAddress: String,
        reward: Long,
        blockHeight: Int
    ): TransactionEntity {
        return TransactionEntity(
            txid = txid,
            fromAddress = "mining_reward",
            toAddress = minerAddress,
            amount = reward,
            fee = 0,
            timestamp = System.currentTimeMillis(),
            status = "confirmed",
            blockHeight = blockHeight,
            confirmations = 0,
            type = "mining"
        )
    }

    /**
     * Clear old demo txs if left in DB
     */
    suspend fun clearDemoTransactions() {
        withContext(Dispatchers.IO) {
            database.openHelper.readableDatabase.execSQL("DELETE FROM transactions WHERE txid LIKE 'demo_%'")
        }
    }

    suspend fun clearAllTransactions() {
        withContext(Dispatchers.IO) {
            database.transactionsDao().clearAll()
        }
    }

    /**
     * Determine user-facing transaction type
     */
    fun getTransactionTypeForUser(transaction: TransactionEntity, userAddresses: List<String>): String {
        val isFromUser = userAddresses.contains(transaction.fromAddress)
        val isToUser = userAddresses.contains(transaction.toAddress)
        
        return when {
            transaction.type == "mining" -> "mining"
            isFromUser && isToUser -> "internal" // Transfer between own wallets
            isFromUser -> "send"
            isToUser -> "receive"
            else -> "unknown"
        }
    }

    /**
     * Get display amount for user
     */
    fun getDisplayAmount(transaction: TransactionEntity, userAddresses: List<String>): Long {
        val isFromUser = userAddresses.contains(transaction.fromAddress)
        val isToUser = userAddresses.contains(transaction.toAddress)
        
        return when {
            transaction.type == "mining" -> transaction.amount
            isFromUser && isToUser -> transaction.amount // Internal transfer — show amount
            isFromUser -> -(transaction.amount + transaction.fee) // Send — negative amount
            isToUser -> transaction.amount // Receive — positive amount
            else -> 0L
        }
    }
}
