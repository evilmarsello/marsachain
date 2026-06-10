package com.marsa.chain.manager

import android.content.Context
import com.marsa.chain.data.AppDatabase
import com.marsa.chain.data.TransactionEntity
import com.marsa.chain.utils.TxKindHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext

class TransactionManager(private val context: Context) {
    private val database = AppDatabase.get(context)
    private val transactionsDao = database.transactionsDao()

    
    fun getTransactionsForAddress(address: String): Flow<List<TransactionEntity>> {
        return transactionsDao.getTransactionsForAddress(address)
    }

    
    fun getTransactionsForAddresses(addresses: List<String>): Flow<List<TransactionEntity>> {
        return transactionsDao.getTransactionsForAddresses(addresses)
    }

    
    suspend fun getTransactionById(txid: String): TransactionEntity? {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTransactionById(txid)
        }
    }

    
    suspend fun addTransaction(transaction: TransactionEntity) {
        withContext(Dispatchers.IO) {
            transactionsDao.insertTransaction(transaction)
        }
    }

    
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

    
    suspend fun updateTransaction(transaction: TransactionEntity) {
        withContext(Dispatchers.IO) {
            transactionsDao.updateTransaction(transaction)
        }
    }

    
    suspend fun deleteTransaction(txid: String) {
        withContext(Dispatchers.IO) {
            transactionsDao.deleteTransaction(txid)
        }
    }

    
    suspend fun getTransactionCount(address: String): Int {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTransactionCount(address)
        }
    }

    
    suspend fun getTotalReceived(address: String): Long {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTotalReceived(address) ?: 0L
        }
    }

    
    suspend fun getTotalSent(address: String): Long {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTotalSent(address) ?: 0L
        }
    }

    
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
            status = "confirmed",
            type = "receive"
        )
    }

    
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

    
    fun getTransactionTypeForUser(transaction: TransactionEntity, userAddresses: List<String>): String =
        TxKindHelper.classifyForUser(transaction, userAddresses)

    
    fun getDisplayAmount(transaction: TransactionEntity, userAddresses: List<String>): Long {
        val isFromUser = userAddresses.contains(transaction.fromAddress)
        val isToUser = userAddresses.contains(transaction.toAddress)
        
        return when {
            transaction.type == "mining" -> transaction.amount
            isFromUser && isToUser -> transaction.amount
            isFromUser -> -(transaction.amount + transaction.fee)
            isToUser -> transaction.amount
            else -> 0L
        }
    }
}
