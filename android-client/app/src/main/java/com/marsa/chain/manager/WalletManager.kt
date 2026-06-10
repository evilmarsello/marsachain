package com.marsa.chain.manager

import android.content.Context
import com.marsa.chain.data.AppDatabase
import com.marsa.chain.data.DeletedWalletInfo
import com.marsa.chain.data.WalletInfo
import com.marsa.chain.crypto.KeyPair
import com.marsa.chain.crypto.hd.Bip39
import com.marsa.chain.crypto.hd.HdWalletFactory
import com.marsa.chain.security.OnboardingPrefs
import com.marsa.chain.security.SeedVault
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlin.math.min

data class CascadeLeg(
    val wallet: WalletInfo,
    
    val amountToRecipient: Long,
    val fee: Long
)

class WalletManager(private val context: Context) {
    private val database = AppDatabase.get(context)
    private val walletsDao = database.walletsDao()
    private val walletDao = database.walletDao()
    private val deletedWalletsDao = database.deletedWalletsDao()

    companion object {
        private const val TRASH_RETENTION_MS = 30L * 24 * 60 * 60 * 1000
    }

    suspend fun createNewWallet(name: String? = null): WalletInfo {
        val seed = SeedVault(context).readSeed()
        if (seed != null) {
            val next = walletsDao.maxHdIndex() + 1
            return insertHdWallet(seed, next, name ?: "Wallet $next", makeActive = false)
        }
        val keyPair = KeyPair.generate() ?: throw Exception("Failed to generate key pair")
        val wallet = WalletInfo(
            address = keyPair.address,
            privateKey = keyPair.privateKey,
            publicKey = keyPair.publicKey,
            name = name ?: "Wallet ${keyPair.address.takeLast(8)}",
            isActive = false,
            walletType = "imported",
            hdIndex = null
        )
        walletsDao.insertWallet(wallet)
        walletDao.put(com.marsa.chain.data.WalletEntity(wallet.address, 0L))
        return wallet
    }
    
    suspend fun createFirstWallet(name: String = "Main Wallet"): WalletInfo {
        val seed = SeedVault(context).readSeed()
        if (seed != null) {
            val existing = walletsDao.getHdWalletAtIndex(0)
            if (existing != null) return existing
            return insertHdWallet(seed, 0, name, makeActive = true)
        }
        val keyPair = KeyPair.generate() ?: throw Exception("Failed to generate key pair")
        val wallet = WalletInfo(
            address = keyPair.address,
            privateKey = keyPair.privateKey,
            publicKey = keyPair.publicKey,
            name = name,
            isActive = true,
            walletType = "imported",
            hdIndex = null
        )
        walletsDao.deactivateAllWallets()
        walletsDao.insertWallet(wallet)
        walletDao.put(com.marsa.chain.data.WalletEntity(wallet.address, 0L))
        walletsDao.setActiveWallet(wallet.address)
        return wallet
    }

    suspend fun getAllWallets(): Flow<List<WalletInfo>> {
        return walletsDao.getAllWallets()
    }

    suspend fun getActiveWallet(): WalletInfo? {
        return walletsDao.getActiveWallet()
    }
    
    suspend fun getActiveWalletOrCreateDefault(): WalletInfo? {
        var activeWallet = walletsDao.getActiveWallet()
        if (activeWallet == null) {
            try {
                val allWallets = walletsDao.getAllWallets().first()
                val seed = SeedVault(context).readSeed()
                when {
                    allWallets.isEmpty() && seed != null ->
                        activeWallet = insertHdWallet(seed, 0, "Main Wallet", makeActive = true)
                    allWallets.isEmpty() -> {
                        activeWallet = null
                    }
                    else -> {
                        walletsDao.deactivateAllWallets()
                        walletsDao.setActiveWallet(allWallets.first().address)
                        activeWallet = walletsDao.getActiveWallet()
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("WalletManager", "Failed to create default wallet: ${e.message}")
            }
        }
        return activeWallet
    }

    
    suspend fun setupHdWalletAfterOnboarding(seed: ByteArray) = withContext(Dispatchers.IO) {
        SeedVault(context).storeSeed(seed)
        if (walletsDao.getHdWalletAtIndex(0) != null) return@withContext
        insertHdWallet(seed, 0, "Main Wallet", makeActive = true)
    }

    
    suspend fun restoreFromMnemonicTwentyFourWords(mnemonic: String, wordList: List<String>) =
        withContext(Dispatchers.IO) {
            require(Bip39.validateMnemonicPhrase(mnemonic, wordList)) { "invalid mnemonic" }
            val seed = Bip39.mnemonicToSeedBytes(mnemonic)
            walletsDao.deleteAllHdWallets()
            SeedVault(context).clearSeed()
            SeedVault(context).storeSeed(seed)
            insertHdWallet(seed, 0, "Main Wallet", makeActive = true)
        }

    private suspend fun insertHdWallet(
        seed: ByteArray,
        index: Int,
        name: String,
        makeActive: Boolean
    ): WalletInfo {
        val kp = HdWalletFactory.keyPairAtIndex(seed, index)
        if (walletsDao.getWalletByAddress(kp.address) != null) {
            throw IllegalStateException("HD wallet address collision at index $index")
        }
        val wallet = WalletInfo(
            address = kp.address,
            privateKey = kp.privateKey,
            publicKey = kp.publicKey,
            name = name,
            isActive = makeActive,
            walletType = "hd",
            hdIndex = index
        )
        if (makeActive) walletsDao.deactivateAllWallets()
        walletsDao.insertWallet(wallet)
        walletDao.put(com.marsa.chain.data.WalletEntity(wallet.address, 0L))
        if (makeActive) walletsDao.setActiveWallet(wallet.address)
        return wallet
    }

    suspend fun setActiveWallet(address: String) {
        walletsDao.deactivateAllWallets()
        walletsDao.setActiveWallet(address)
    }

    suspend fun getTotalBalance(): Long {
        val wallets = walletsDao.getAllWallets().first()
        var totalBalance = 0L
        
        for (wallet in wallets) {
            val walletEntity = walletDao.get(wallet.address)
            totalBalance += walletEntity?.balance ?: 0L
        }
        
        return totalBalance
    }

    suspend fun getWalletBalance(address: String): Long {
        val walletEntity = walletDao.get(address)
        return walletEntity?.balance ?: 0L
    }

    suspend fun updateWalletBalance(address: String, balance: Long) {
        walletDao.put(com.marsa.chain.data.WalletEntity(address, balance))
    }

    
    suspend fun moveWalletToTrash(wallet: WalletInfo) = withContext(Dispatchers.IO) {
        purgeExpiredDeletedWallets()
        val fresh = walletsDao.getWalletByAddress(wallet.address) ?: return@withContext
        val wasActive = fresh.isActive
        deletedWalletsDao.insert(
            DeletedWalletInfo(
                address = fresh.address,
                privateKey = fresh.privateKey,
                publicKey = fresh.publicKey,
                name = fresh.name,
                createdAt = fresh.createdAt,
                deletedAt = System.currentTimeMillis(),
                walletType = fresh.walletType,
                hdIndex = fresh.hdIndex
            )
        )
        walletsDao.deleteWallet(fresh)
        if (wasActive) {
            val remaining = walletsDao.getAllWallets().first()
            if (remaining.isNotEmpty()) {
                walletsDao.deactivateAllWallets()
                walletsDao.setActiveWallet(remaining.first().address)
            }
        }
    }

    fun observeDeletedWallets(): Flow<List<DeletedWalletInfo>> = deletedWalletsDao.observeAll()

    suspend fun purgeExpiredDeletedWallets() = withContext(Dispatchers.IO) {
        val cutoff = System.currentTimeMillis() - TRASH_RETENTION_MS
        deletedWalletsDao.deleteOlderThan(cutoff)
    }

    suspend fun permanentlyRemoveFromTrash(address: String) = withContext(Dispatchers.IO) {
        deletedWalletsDao.deleteByAddress(address)
    }

    
    suspend fun restoreWalletFromTrash(deleted: DeletedWalletInfo): Boolean = withContext(Dispatchers.IO) {
        if (walletsDao.getWalletByAddress(deleted.address) != null) {
            return@withContext false
        }
        val hadNoWallets = walletsDao.getAllWallets().first().isEmpty()
        val wallet = WalletInfo(
            address = deleted.address,
            privateKey = deleted.privateKey,
            publicKey = deleted.publicKey,
            name = deleted.name,
            createdAt = deleted.createdAt,
            isActive = hadNoWallets,
            walletType = deleted.walletType,
            hdIndex = deleted.hdIndex
        )
        if (hadNoWallets) {
            walletsDao.deactivateAllWallets()
        }
        walletsDao.insertWallet(wallet)
        if (hadNoWallets) {
            walletsDao.setActiveWallet(wallet.address)
        }
        deletedWalletsDao.deleteByAddress(deleted.address)
        if (walletDao.get(deleted.address) == null) {
            walletDao.put(com.marsa.chain.data.WalletEntity(deleted.address, 0L))
        }
        true
    }

    suspend fun clearDeletedWalletsTrash() = withContext(Dispatchers.IO) {
        deletedWalletsDao.deleteAll()
    }

    
    suspend fun planCascadeLegs(
        active: WalletInfo,
        allWallets: List<WalletInfo>,
        totalAmount: Long,
        feePerTx: Long
    ): List<CascadeLeg>? {
        val others = allWallets
            .filter { it.address != active.address }
            .sortedWith(compareByDescending<WalletInfo> { it.createdAt })
        val ordered = listOf(active) + others
        val legs = mutableListOf<CascadeLeg>()
        var remaining = totalAmount
        for (w in ordered) {
            if (remaining <= 0) break
            val bal = getWalletBalance(w.address)
            val maxSend = bal - feePerTx
            if (maxSend <= 0) continue
            val chunk = min(remaining, maxSend)
            legs.add(CascadeLeg(w, chunk, feePerTx))
            remaining -= chunk
        }
        return if (remaining <= 0 && legs.isNotEmpty()) legs else null
    }

    suspend fun updateWalletName(address: String, newName: String) {
        val wallet = walletsDao.getWalletByAddress(address) ?: return
        val updated = wallet.copy(name = newName.trim().ifEmpty { wallet.name })
        walletsDao.updateWallet(updated)
    }
    
    suspend fun importWallet(privateKey: String, name: String? = null): WalletInfo? {
        return try {
            android.util.Log.d("WalletManager", "🔑 Attempting to import wallet with private key")
            
            val keyPair = com.marsa.chain.crypto.KeyPair.fromPrivateKey(privateKey)
            if (keyPair == null) {
                android.util.Log.e("WalletManager", "❌ Failed to create KeyPair from private key")
                return null
            }
            
            android.util.Log.d("WalletManager", "✅ KeyPair created successfully")
            android.util.Log.d("WalletManager", "📍 Address: ${keyPair.address}")
            
            val existingWallet = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                walletsDao.getWalletByAddress(keyPair.address)
            }
            if (existingWallet != null) {
                android.util.Log.w("WalletManager", "⚠️ Wallet with this address already exists")
                return null
            }
            
            val wallet = WalletInfo(
                address = keyPair.address,
                privateKey = keyPair.privateKey,
                publicKey = keyPair.publicKey,
                name = name ?: "Imported Wallet ${keyPair.address.takeLast(8)}",
                isActive = false,
                walletType = "imported",
                hdIndex = null
            )
            
            android.util.Log.d("WalletManager", "💾 Saving imported wallet to database")
            
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                walletsDao.insertWallet(wallet)
                walletDao.put(com.marsa.chain.data.WalletEntity(wallet.address, 0L))
            }
            
            android.util.Log.d("WalletManager", "✅ Wallet imported successfully: ${wallet.address}")
            
            wallet
            
        } catch (e: Exception) {
            android.util.Log.e("WalletManager", "❌ Error importing wallet: ${e.message}")
            null
        }
    }
    
    suspend fun validatePrivateKey(privateKey: String): Boolean {
        return try {
            val keyPair = com.marsa.chain.crypto.KeyPair.fromPrivateKey(privateKey)
            keyPair != null
        } catch (e: Exception) {
            android.util.Log.e("WalletManager", "❌ Private key validation failed: ${e.message}")
            false
        }
    }
    
    suspend fun validatePrivateKeyForAddress(privateKey: String, expectedAddress: String): Boolean {
        return try {
            val keyPair = com.marsa.chain.crypto.KeyPair.fromPrivateKey(privateKey)
            if (keyPair == null) {
                android.util.Log.e("WalletManager", "❌ Failed to create KeyPair from private key")
                return false
            }
            
            val actualAddress = keyPair.address
            android.util.Log.d("WalletManager", "🔍 Expected address: $expectedAddress")
            android.util.Log.d("WalletManager", "🔍 Actual address: $actualAddress")
            
            val isValid = actualAddress == expectedAddress
            if (!isValid) {
                android.util.Log.w("WalletManager", "⚠️ Address mismatch! Private key does not correspond to expected address")
            }
            
            isValid
        } catch (e: Exception) {
            android.util.Log.e("WalletManager", "❌ Private key validation failed: ${e.message}")
            false
        }
    }

    suspend fun migrateOldWallet() {
        try {
            val prefs = context.getSharedPreferences("wallet", android.content.Context.MODE_PRIVATE)
            val oldAddress = prefs.getString("address", null)
            val oldPrivateKey = prefs.getString("privateKey", null)
            val oldPublicKey = prefs.getString("publicKey", null)
            
            if (oldAddress != null && oldPrivateKey != null && oldPublicKey != null) {
                val wallet = WalletInfo(
                    address = oldAddress,
                    privateKey = oldPrivateKey,
                    publicKey = oldPublicKey,
                    name = "Migrated Wallet",
                    isActive = true,
                    walletType = "imported",
                    hdIndex = null
                )
                
                walletsDao.deactivateAllWallets()
                walletsDao.insertWallet(wallet)
                
                prefs.edit().clear().apply()
                
                android.util.Log.d("WalletManager", "Successfully migrated old wallet: $oldAddress")
            }
        } catch (e: Exception) {
            android.util.Log.e("WalletManager", "Failed to migrate old wallet: ${e.message}")
        }
    }

    /**
     * Clears HD + imported wallets, balance rows, trash, local tx cache, encrypted seed,
     * and onboarding flag. Used before re-onboarding from Settings (new task, no stale session).
     */
    suspend fun wipeAllLocalWalletDataForFullReset() = withContext(Dispatchers.IO) {
        walletsDao.deleteAllWallets()
        walletDao.deleteAllBalances()
        deletedWalletsDao.deleteAll()
        database.transactionsDao().clearAll()
        SeedVault(context).clearSeed()
        OnboardingPrefs.reset(context)
    }
}
