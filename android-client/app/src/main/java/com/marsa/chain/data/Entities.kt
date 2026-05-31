package com.marsa.chain.data

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Entity(tableName = "headers")
data class HeaderEntity(
    @PrimaryKey val height: Int,
    val version: Int,
    val prev_hash: String,
    val merkle_root: String,
    val timestamp: Int,
    val bits: Int,
    val nonce: Int
)

@Entity(tableName = "wallet")
data class WalletEntity(
    @PrimaryKey val address: String,
    val balance: Long
)

@Entity(tableName = "wallets")
data class WalletInfo(
    @PrimaryKey
    val address: String,
    val privateKey: String,
    val publicKey: String,
    val name: String = "Wallet ${address.takeLast(8)}",
    val createdAt: Long = System.currentTimeMillis(),
    val isActive: Boolean = false,
    /** `hd` — из мнемоники (SLIP-0010); `imported` — импорт ключа или старые записи. */
    val walletType: String = "imported",
    /** Индекс для `m/44'/78213'/0'/0'/index'`; null для импортированных. */
    val hdIndex: Int? = null
)

/** Кошелёк в корзине после удаления из списка (хранится ограниченное время). */
@Entity(tableName = "deleted_wallets")
data class DeletedWalletInfo(
    @PrimaryKey val address: String,
    val privateKey: String,
    val publicKey: String,
    val name: String,
    val createdAt: Long,
    val deletedAt: Long = System.currentTimeMillis(),
    val walletType: String = "imported",
    val hdIndex: Int? = null
)

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey val txid: String,
    val fromAddress: String,
    val toAddress: String,
    val amount: Long,
    val fee: Long,
    val timestamp: Long = System.currentTimeMillis(),
    val status: String = "pending", // pending, confirmed, failed
    val blockHeight: Int? = null,
    val confirmations: Int = 0,
    val type: String = "send" // send, receive, mining
)

@Dao
interface HeadersDao {
    @Query("SELECT MAX(height) FROM headers")
    fun getMaxHeight(): Int?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insertAll(list: List<HeaderEntity>)

    @Query("SELECT COUNT(*) FROM headers")
    fun count(): Int
}

@Dao
interface WalletDao {
    @Query("SELECT * FROM wallet WHERE address = :addr LIMIT 1")
    fun get(addr: String): WalletEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun put(w: WalletEntity)

    @Query("DELETE FROM wallet")
    suspend fun deleteAllBalances()
}

@Dao
interface WalletsDao {
    @Query("SELECT * FROM wallets ORDER BY createdAt DESC")
    fun getAllWallets(): kotlinx.coroutines.flow.Flow<List<WalletInfo>>
    
    @Query("SELECT * FROM wallets WHERE isActive = 1 LIMIT 1")
    suspend fun getActiveWallet(): WalletInfo?
    
    @Query("SELECT * FROM wallets WHERE address = :address")
    suspend fun getWalletByAddress(address: String): WalletInfo?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWallet(wallet: WalletInfo)
    
    @Update
    suspend fun updateWallet(wallet: WalletInfo)
    
    @Delete
    suspend fun deleteWallet(wallet: WalletInfo)
    
    @Query("UPDATE wallets SET isActive = 0")
    suspend fun deactivateAllWallets()
    
    @Query("UPDATE wallets SET isActive = 1 WHERE address = :address")
    suspend fun setActiveWallet(address: String)

    @Query("SELECT * FROM wallets WHERE walletType = 'hd' AND hdIndex = :idx LIMIT 1")
    suspend fun getHdWalletAtIndex(idx: Int): WalletInfo?

    @Query("SELECT COALESCE(MAX(hdIndex), -1) FROM wallets WHERE walletType = 'hd'")
    suspend fun maxHdIndex(): Int

    @Query("DELETE FROM wallets WHERE walletType = 'hd'")
    suspend fun deleteAllHdWallets()

    @Query("DELETE FROM wallets")
    suspend fun deleteAllWallets()
}

@Dao
interface DeletedWalletsDao {
    @Query("SELECT * FROM deleted_wallets ORDER BY deletedAt DESC")
    fun observeAll(): kotlinx.coroutines.flow.Flow<List<DeletedWalletInfo>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(wallet: DeletedWalletInfo)

    @Query("DELETE FROM deleted_wallets WHERE address = :address")
    suspend fun deleteByAddress(address: String)

    @Query("DELETE FROM deleted_wallets")
    suspend fun deleteAll()

    @Query("DELETE FROM deleted_wallets WHERE deletedAt < :cutoffMillis")
    suspend fun deleteOlderThan(cutoffMillis: Long): Int
}

@Dao
interface TransactionsDao {
    
    @Query("SELECT * FROM transactions WHERE fromAddress = :address OR toAddress = :address ORDER BY timestamp DESC")
    fun getTransactionsForAddress(address: String): kotlinx.coroutines.flow.Flow<List<TransactionEntity>>
    
    @Query("SELECT * FROM transactions WHERE fromAddress IN (:addresses) OR toAddress IN (:addresses) ORDER BY timestamp DESC")
    fun getTransactionsForAddresses(addresses: List<String>): kotlinx.coroutines.flow.Flow<List<TransactionEntity>>
    
    @Query("SELECT * FROM transactions WHERE txid = :txid LIMIT 1")
    suspend fun getTransactionById(txid: String): TransactionEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransaction(transaction: TransactionEntity)
    
    @Update
    suspend fun updateTransaction(transaction: TransactionEntity)
    
    @Query("UPDATE transactions SET status = :status, blockHeight = :blockHeight, confirmations = :confirmations WHERE txid = :txid")
    suspend fun updateTransactionStatus(txid: String, status: String, blockHeight: Int?, confirmations: Int)
    
    @Query("DELETE FROM transactions WHERE txid = :txid")
    suspend fun deleteTransaction(txid: String)
    
    @Query("DELETE FROM transactions")
    suspend fun clearAll()
    
    @Query("SELECT COUNT(*) FROM transactions WHERE fromAddress = :address OR toAddress = :address")
    suspend fun getTransactionCount(address: String): Int
    
    @Query("SELECT SUM(amount) FROM transactions WHERE toAddress = :address AND status = 'confirmed'")
    suspend fun getTotalReceived(address: String): Long?
    
    @Query("SELECT SUM(amount + fee) FROM transactions WHERE fromAddress = :address AND status = 'confirmed'")
    suspend fun getTotalSent(address: String): Long?
}

@Database(
    entities = [
        HeaderEntity::class,
        WalletEntity::class,
        WalletInfo::class,
        DeletedWalletInfo::class,
        TransactionEntity::class
    ],
    version = 5
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun headersDao(): HeadersDao
    abstract fun walletDao(): WalletDao
    abstract fun walletsDao(): WalletsDao
    abstract fun deletedWalletsDao(): DeletedWalletsDao
    abstract fun transactionsDao(): TransactionsDao

    companion object {
        @Volatile private var instance: AppDatabase? = null
        fun get(ctx: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(ctx, AppDatabase::class.java, "spv.db")
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5)
                .build().also { instance = it }
        }
        
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Создаем новую таблицу кошельков
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS wallets (
                        address TEXT NOT NULL PRIMARY KEY,
                        privateKey TEXT NOT NULL,
                        publicKey TEXT NOT NULL,
                        name TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        isActive INTEGER NOT NULL
                    )
                """)
            }
        }
        
        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Создаем таблицу транзакций
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS transactions (
                        txid TEXT NOT NULL PRIMARY KEY,
                        fromAddress TEXT NOT NULL,
                        toAddress TEXT NOT NULL,
                        amount INTEGER NOT NULL,
                        fee INTEGER NOT NULL,
                        timestamp INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        blockHeight INTEGER,
                        confirmations INTEGER NOT NULL,
                        type TEXT NOT NULL
                    )
                """)
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS deleted_wallets (
                        address TEXT NOT NULL PRIMARY KEY,
                        privateKey TEXT NOT NULL,
                        publicKey TEXT NOT NULL,
                        name TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        deletedAt INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
            }
        }

        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE wallets ADD COLUMN walletType TEXT NOT NULL DEFAULT 'imported'")
                database.execSQL("ALTER TABLE wallets ADD COLUMN hdIndex INTEGER")
                database.execSQL("ALTER TABLE deleted_wallets ADD COLUMN walletType TEXT NOT NULL DEFAULT 'imported'")
                database.execSQL("ALTER TABLE deleted_wallets ADD COLUMN hdIndex INTEGER")
            }
        }
    }
}
