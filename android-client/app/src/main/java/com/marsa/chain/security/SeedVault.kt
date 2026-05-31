package com.marsa.chain.security

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Зашифрованное хранение BIP39 seed (64 байта PBKDF2) по ТЗ §4.8.
 */
class SeedVault(context: Context) {
    private val appContext = context.applicationContext

    private val prefs by lazy {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun hasSeed(): Boolean = prefs.contains(KEY_SEED_B64)

    fun storeSeed(seed: ByteArray) {
        require(seed.size == 64) { "BIP39 seed must be 64 bytes" }
        prefs.edit().putString(KEY_SEED_B64, Base64.encodeToString(seed, Base64.NO_WRAP)).apply()
    }

    fun readSeed(): ByteArray? =
        prefs.getString(KEY_SEED_B64, null)?.let { Base64.decode(it, Base64.NO_WRAP) }

    fun clearSeed() {
        prefs.edit().remove(KEY_SEED_B64).apply()
    }

    companion object {
        private const val PREFS_NAME = "vault_seed_v1"
        private const val KEY_SEED_B64 = "bip39_seed_b64"
    }
}
