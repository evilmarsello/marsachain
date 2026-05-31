package com.marsa.chain.crypto

import org.bouncycastle.crypto.generators.Ed25519KeyPairGenerator
import org.bouncycastle.crypto.params.Ed25519KeyGenerationParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.security.SecureRandom
import android.util.Base64
import android.util.Log

data class KeyPair(
    val privateKey: String,
    val publicKey: String,
    val address: String
) {
    companion object {
        private const val TAG = "KeyPair"
        
        fun fromPrivateKeyBytes(privateKeyBytes: ByteArray): KeyPair? {
            if (privateKeyBytes.size != 32) return null
            val b64 = Base64.encodeToString(privateKeyBytes, Base64.NO_WRAP)
            return fromPrivateKey(b64)
        }

        fun fromPrivateKey(privateKeyB64: String): KeyPair? {
            return try {
                val privateKeyBytes = Base64.decode(privateKeyB64, Base64.NO_WRAP)
                if (privateKeyBytes.size != 32) {
                    Log.e(TAG, "Invalid private key size: ${privateKeyBytes.size}, expected 32")
                    return null
                }
                
                val privateKeyParams = Ed25519PrivateKeyParameters(privateKeyBytes, 0)
                val publicKeyParams = privateKeyParams.generatePublicKey()
                
                val publicKeyBytes = publicKeyParams.encoded
                val publicKeyB64 = Base64.encodeToString(publicKeyBytes, Base64.NO_WRAP)
                
                val address = generateAddress(publicKeyBytes)
                
                KeyPair(
                    privateKey = privateKeyB64,
                    publicKey = publicKeyB64,
                    address = address
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error creating KeyPair from private key: ${e.message}")
                null
            }
        }
        
        fun generate(): KeyPair {
            try {
                // Generate Ed25519 key pair
                val keyGen = Ed25519KeyPairGenerator()
                keyGen.init(Ed25519KeyGenerationParameters(SecureRandom()))
                
                val keyPair = keyGen.generateKeyPair()
                val privateKeyParams = keyPair.private as Ed25519PrivateKeyParameters
                val publicKeyParams = keyPair.public as Ed25519PublicKeyParameters
                
                // Convert to Base64 strings - use raw key bytes
                val privateKeyBytes = privateKeyParams.encoded
                val publicKeyBytes = publicKeyParams.encoded
                
                // Ensure private key is 32 bytes for Ed25519
                if (privateKeyBytes.size != 32) {
                    Log.w(TAG, "Private key size: ${privateKeyBytes.size}, expected 32")
                    return generateFallback()
                }
                
                val privateKey = Base64.encodeToString(privateKeyBytes, Base64.NO_WRAP)
                val publicKey = Base64.encodeToString(publicKeyBytes, Base64.NO_WRAP)
                
                // Generate address from public key
                val address = generateAddress(publicKeyBytes)
                
                Log.d(TAG, "Generated Ed25519 key pair")
                return KeyPair(privateKey, publicKey, address)
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to generate Ed25519 key pair", e)
                // Fallback to simple generation
                return generateFallback()
            }
        }
        
        private fun generateFallback(): KeyPair {
            // Fallback to simple hash-based generation
            val privateKeyBytes = ByteArray(32)
            SecureRandom().nextBytes(privateKeyBytes)
            val privateKey = Base64.encodeToString(privateKeyBytes, Base64.NO_WRAP)
            val publicKey = Base64.encodeToString(privateKeyBytes, Base64.NO_WRAP)
            val address = generateAddress(privateKeyBytes)
            return KeyPair(privateKey, publicKey, address)
        }
        
        private fun generateAddress(publicKeyBytes: ByteArray): String {
            // Generate address from public key using hash
            val hash = java.security.MessageDigest.getInstance("SHA-256").digest(publicKeyBytes)
            val addressHash = hash.joinToString("") { String.format("%02x", it) }
            return "mrs" + addressHash.substring(0, 40) // "mrs" + 40 chars
        }
        
        // Test method to verify address generation
        fun testAddressGeneration(privateKeyB64: String): String? {
            return try {
                val keyPair = fromPrivateKey(privateKeyB64)
                if (keyPair != null) {
                    Log.d(TAG, "Test - Private Key: $privateKeyB64")
                    Log.d(TAG, "Test - Generated Address: ${keyPair.address}")
                    keyPair.address
                } else {
                    Log.e(TAG, "Test - Failed to generate KeyPair from private key")
                    null
                }
            } catch (e: Exception) {
                Log.e(TAG, "Test - Error: ${e.message}")
                null
            }
        }
    }
    
    fun sign(data: ByteArray): ByteArray? {
        return try {
            val privateKeyBytes = Base64.decode(privateKey, Base64.NO_WRAP)
            // Ensure we have exactly 32 bytes for Ed25519
            if (privateKeyBytes.size != 32) {
                Log.e(TAG, "Invalid private key size: ${privateKeyBytes.size}, expected 32")
                return null
            }
            
            val privateKeyParams = Ed25519PrivateKeyParameters(privateKeyBytes, 0)
            
            val signer = Ed25519Signer()
            signer.init(true, privateKeyParams)
            signer.update(data, 0, data.size)
            
            signer.generateSignature()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sign data", e)
            null
        }
    }
    
    fun verify(publicKey: String, data: ByteArray, signature: ByteArray): Boolean {
        return try {
            val publicKeyBytes = Base64.decode(publicKey, Base64.NO_WRAP)
            val publicKeyParams = Ed25519PublicKeyParameters(publicKeyBytes, 0)
            
            val signer = Ed25519Signer()
            signer.init(false, publicKeyParams)
            signer.update(data, 0, data.size)
            
            signer.verifySignature(signature)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to verify signature", e)
            false
        }
    }
}
