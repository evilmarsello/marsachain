package com.marsa.chain.wallet

import android.content.Context
import android.content.SharedPreferences
import com.marsa.chain.model.WalletInfo
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.*

class WalletStorageManager(private val context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("wallet_storage", Context.MODE_PRIVATE)
    private val gson = Gson()
    
    companion object {
        private const val WALLETS_KEY = "saved_wallets"
        private const val CURRENT_WALLET_KEY = "current_wallet_id"
    }
    
    fun saveWallet(wallet: WalletInfo) {
        val wallets = getAllWallets().toMutableList()
        
        // Remove existing wallet with same ID if it exists
        wallets.removeAll { it.id == wallet.id }
        
        // Add new wallet
        wallets.add(wallet)
        
        // Save to preferences
        val walletsJson = gson.toJson(wallets)
        prefs.edit().putString(WALLETS_KEY, walletsJson).apply()
    }
    
    fun getAllWallets(): List<WalletInfo> {
        val walletsJson = prefs.getString(WALLETS_KEY, null) ?: return emptyList()
        val type = object : TypeToken<List<WalletInfo>>() {}.type
        return gson.fromJson(walletsJson, type) ?: emptyList()
    }
    
    fun getWalletById(id: String): WalletInfo? {
        return getAllWallets().find { it.id == id }
    }
    
    fun deleteWallet(id: String) {
        val wallets = getAllWallets().toMutableList()
        wallets.removeAll { it.id == id }
        
        val walletsJson = gson.toJson(wallets)
        prefs.edit().putString(WALLETS_KEY, walletsJson).apply()
        
        // If deleted wallet was current, clear current wallet
        if (getCurrentWalletId() == id) {
            setCurrentWallet(null)
        }
    }
    
    fun setCurrentWallet(wallet: WalletInfo?) {
        if (wallet != null) {
            prefs.edit().putString(CURRENT_WALLET_KEY, wallet.id).apply()
        } else {
            prefs.edit().remove(CURRENT_WALLET_KEY).apply()
        }
    }
    
    fun getCurrentWallet(): WalletInfo? {
        val currentId = getCurrentWalletId() ?: return null
        return getWalletById(currentId)
    }
    
    fun getCurrentWalletId(): String? {
        return prefs.getString(CURRENT_WALLET_KEY, null)
    }
    
    fun generateWalletId(): String {
        return UUID.randomUUID().toString()
    }
}
