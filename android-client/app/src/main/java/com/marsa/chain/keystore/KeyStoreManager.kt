package com.marsa.chain.keystore

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class KeyStoreManager(private val context: Context) {
    private val androidKeyStore = "AndroidKeyStore"

    fun generateKey(alias: String): KeyPair {
        val kpg = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            androidKeyStore
        )

        val builder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA384, KeyProperties.DIGEST_SHA512)
            .setUserAuthenticationRequired(false)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                builder.setIsStrongBoxBacked(true)
            } catch (_: Throwable) {
                // device may not support StrongBox, ignore
            }
        }

        kpg.initialize(builder.build())
        return kpg.generateKeyPair()
    }

    fun sign(alias: String, data: ByteArray): ByteArray {
        val privateKey = getPrivateKey(alias)
        val sig = Signature.getInstance("SHA256withECDSA")
        sig.initSign(privateKey)
        sig.update(data)
        return sig.sign()
    }

    fun getPublicKey(alias: String): ByteArray {
        val ks = KeyStore.getInstance(androidKeyStore)
        ks.load(null)
        val cert = ks.getCertificate(alias) ?: throw IllegalStateException("No key for alias: $alias")
        return cert.publicKey.encoded
    }

    private fun getPrivateKey(alias: String): java.security.PrivateKey {
        val ks = KeyStore.getInstance(androidKeyStore)
        ks.load(null)
        val entry = ks.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
            ?: throw IllegalStateException("No private key for alias: $alias")
        return entry.privateKey
    }
}
