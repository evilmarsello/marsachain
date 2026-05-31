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
     * Получить все транзакции для одного адреса
     */
    fun getTransactionsForAddress(address: String): Flow<List<TransactionEntity>> {
        return transactionsDao.getTransactionsForAddress(address)
    }

    /**
     * Получить все транзакции для списка адресов (всех кошельков пользователя)
     */
    fun getTransactionsForAddresses(addresses: List<String>): Flow<List<TransactionEntity>> {
        return transactionsDao.getTransactionsForAddresses(addresses)
    }

    /**
     * Получить транзакцию по ID
     */
    suspend fun getTransactionById(txid: String): TransactionEntity? {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTransactionById(txid)
        }
    }

    /**
     * Добавить новую транзакцию
     */
    suspend fun addTransaction(transaction: TransactionEntity) {
        withContext(Dispatchers.IO) {
            transactionsDao.insertTransaction(transaction)
        }
    }

    /**
     * Обновить статус транзакции
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
     * Обновить транзакцию
     */
    suspend fun updateTransaction(transaction: TransactionEntity) {
        withContext(Dispatchers.IO) {
            transactionsDao.updateTransaction(transaction)
        }
    }

    /**
     * Удалить транзакцию
     */
    suspend fun deleteTransaction(txid: String) {
        withContext(Dispatchers.IO) {
            transactionsDao.deleteTransaction(txid)
        }
    }

    /**
     * Получить количество транзакций для адреса
     */
    suspend fun getTransactionCount(address: String): Int {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTransactionCount(address)
        }
    }

    /**
     * Получить общую сумму полученных средств
     */
    suspend fun getTotalReceived(address: String): Long {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTotalReceived(address) ?: 0L
        }
    }

    /**
     * Получить общую сумму отправленных средств
     */
    suspend fun getTotalSent(address: String): Long {
        return withContext(Dispatchers.IO) {
            transactionsDao.getTotalSent(address) ?: 0L
        }
    }

    /**
     * Создать транзакцию отправки
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
     * Создать транзакцию получения
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
            status = "confirmed", // Полученные транзакции считаем подтвержденными
            type = "receive"
        )
    }

    /**
     * Создать транзакцию майнинга
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
     * Очистить старые демо-транзакции, если они остались в БД
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
     * Определить тип транзакции для пользователя
     */
    fun getTransactionTypeForUser(transaction: TransactionEntity, userAddresses: List<String>): String {
        val isFromUser = userAddresses.contains(transaction.fromAddress)
        val isToUser = userAddresses.contains(transaction.toAddress)
        
        return when {
            transaction.type == "mining" -> "mining"
            isFromUser && isToUser -> "internal" // Перевод между своими кошельками
            isFromUser -> "send"
            isToUser -> "receive"
            else -> "unknown"
        }
    }

    /**
     * Получить отображаемую сумму для пользователя
     */
    fun getDisplayAmount(transaction: TransactionEntity, userAddresses: List<String>): Long {
        val isFromUser = userAddresses.contains(transaction.fromAddress)
        val isToUser = userAddresses.contains(transaction.toAddress)
        
        return when {
            transaction.type == "mining" -> transaction.amount
            isFromUser && isToUser -> transaction.amount // Внутренний перевод - показываем сумму
            isFromUser -> -(transaction.amount + transaction.fee) // Отправка - отрицательная сумма
            isToUser -> transaction.amount // Получение - положительная сумма
            else -> 0L
        }
    }
}
