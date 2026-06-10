package com.marsa.chain.crypto.hd

import android.content.Context
import com.marsa.chain.R
import java.io.BufferedReader
import java.io.InputStreamReader
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec


object Bip39 {

    fun loadEnglishWordList(context: Context): List<String> {
        val list = context.resources.openRawResource(R.raw.bip39_english).use { ins ->
            BufferedReader(InputStreamReader(ins, Charsets.UTF_8))
                .readLines()
                .map { it.trim().lowercase() }
                .filter { it.isNotEmpty() }
        }
        require(list.size == 2048) { "word list size ${list.size}" }
        return list
    }

    
    fun loadWordListFromLines(lines: List<String>): List<String> =
        lines.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
            .also { require(it.size == 2048) }

    fun generateMnemonic(wordList: List<String>): String {
        require(wordList.size == 2048)
        val entropy = ByteArray(32).also { SecureRandom().nextBytes(it) }
        return mnemonicFromEntropy(entropy, wordList)
    }

    fun mnemonicFromEntropy(entropy: ByteArray, wordList: List<String>): String {
        require(entropy.size == 32) { "256-bit entropy only for 24 words" }
        require(wordList.size == 2048)
        val hash = MessageDigest.getInstance("SHA-256").digest(entropy)
        val checksumBits = entropy.size / 4 // 8 bits
        val totalBits = entropy.size * 8 + checksumBits
        val bits = BooleanArray(totalBits)
        // entropy bits big-endian per byte? BIP39 uses first byte MSB first
        for (i in entropy.indices) {
            for (bit in 0 until 8) {
                bits[i * 8 + bit] = (entropy[i].toInt() shr (7 - bit) and 1) == 1
            }
        }
        for (bit in 0 until checksumBits) {
            bits[entropy.size * 8 + bit] = (hash[0].toInt() shr (7 - bit) and 1) == 1
        }
        val words = ArrayList<String>(24)
        var i = 0
        while (i < totalBits) {
            var idx = 0
            for (b in 0 until 11) {
                idx = idx shl 1
                if (i + b < totalBits && bits[i + b]) idx = idx or 1
            }
            words.add(wordList[idx])
            i += 11
        }
        return words.joinToString(" ")
    }

    fun validateMnemonicPhrase(mnemonic: String, wordList: List<String>): Boolean {
        val words = mnemonic.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.map { it.lowercase() }
        if (words.size != 24) return false
        val indices = IntArray(24)
        for (w in words.withIndex()) {
            val idx = wordList.indexOf(w.value)
            if (idx < 0) return false
            indices[w.index] = idx
        }
        val concatBits = BooleanArray(24 * 11)
        for (wi in 0 until 24) {
            val wordIndex = indices[wi]
            for (bit in 0 until 11) {
                concatBits[wi * 11 + bit] = (wordIndex shr (10 - bit) and 1) == 1
            }
        }
        val entropyBits = 256
        val entropy = ByteArray(entropyBits / 8)
        for (i in 0 until entropyBits) {
            if (concatBits[i]) {
                entropy[i / 8] = (entropy[i / 8].toInt() or (1 shl (7 - (i % 8)))).toByte()
            }
        }
        val hash = MessageDigest.getInstance("SHA-256").digest(entropy)
        for (bit in 0 until 8) {
            val expected = (hash[0].toInt() shr (7 - bit) and 1) == 1
            if (concatBits[entropyBits + bit] != expected) return false
        }
        return true
    }

    fun mnemonicToSeedBytes(mnemonic: String, passphrase: String = ""): ByteArray {
        val norm = mnemonic.trim().split(Regex("\\s+")).joinToString(" ")
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA512")
        val spec = PBEKeySpec(
            norm.toCharArray(),
            ("mnemonic$passphrase").toByteArray(Charsets.UTF_8),
            2048,
            64 * 8
        )
        return factory.generateSecret(spec).encoded
    }
}
