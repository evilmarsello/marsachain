package com.marsa.chain.crypto

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import com.marsa.chain.wallet.WalletStorageManager

class KeyManager(private val context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("keys", Context.MODE_PRIVATE)
    private val walletStorage = WalletStorageManager(context)
    private val tag = "KeyManager"
    
    fun generateNewKeyPair(): KeyPair {
        val keyPair = KeyPair.generate()
        saveKeyPair(keyPair)
        Log.d(tag, "Generated new Ed25519 key pair: ${keyPair.address}")
        return keyPair
    }
    
    fun getCurrentKeyPair(): KeyPair? {
        val privateKey = prefs.getString("private_key", null)
        val publicKey = prefs.getString("public_key", null)
        val address = prefs.getString("address", null)
        
        return if (privateKey != null && publicKey != null && address != null) {
            try {
                KeyPair(privateKey, publicKey, address)
            } catch (e: Exception) {
                Log.w(tag, "Invalid key format, clearing keys: ${e.message}")
                clearKeys()
                null
            }
        } else {
            null
        }
    }
    
    fun clearKeys() {
        prefs.edit().clear().apply()
        Log.d(tag, "Cleared all keys")
    }
    
    fun getOrCreateKeyPair(): KeyPair {
        // First try to get current wallet from storage
        val currentWallet = walletStorage.getCurrentWallet()
        if (currentWallet != null) {
            return KeyPair(currentWallet.privateKey, currentWallet.publicKey, currentWallet.address)
        }
        
        // Fallback to legacy method
        return getCurrentKeyPair() ?: generateNewKeyPair()
    }
    
    private fun saveKeyPair(keyPair: KeyPair) {
        prefs.edit()
            .putString("private_key", keyPair.privateKey)
            .putString("public_key", keyPair.publicKey)
            .putString("address", keyPair.address)
            .apply()
    }
    
    fun getPrivateKey(): String? {
        return prefs.getString("private_key", null)
    }
    
    fun getPublicKey(): String? {
        return prefs.getString("public_key", null)
    }
    
    fun getAddress(): String? {
        return prefs.getString("address", null)
    }
    
    fun hasKeys(): Boolean {
        return getCurrentKeyPair() != null
    }
    
    fun signData(data: ByteArray): ByteArray? {
        val keyPair = getCurrentKeyPair() ?: return null
        return keyPair.sign(data)
    }
    
    fun signData(data: String): String? {
        val signature = signData(data.toByteArray()) ?: return null
        return Base64.encodeToString(signature, Base64.NO_WRAP)
    }
    
    fun verifySignature(data: ByteArray, signature: ByteArray): Boolean {
        val keyPair = getCurrentKeyPair() ?: return false
        return keyPair.verify(keyPair.publicKey, data, signature)
    }
    
    fun verifySignature(data: String, signature: String): Boolean {
        val dataBytes = data.toByteArray()
        val signatureBytes = Base64.decode(signature, Base64.NO_WRAP)
        return verifySignature(dataBytes, signatureBytes)
    }
}
