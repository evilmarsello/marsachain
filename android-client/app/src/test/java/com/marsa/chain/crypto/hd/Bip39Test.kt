package com.marsa.chain.crypto.hd

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader

class Bip39Test {

    @Test
    fun generate_validate_roundtrip() {
        val words = loadWords()
        val m = Bip39.generateMnemonic(words)
        assertTrue(Bip39.validateMnemonicPhrase(m, words))
        val seed = Bip39.mnemonicToSeedBytes(m)
        assertTrue(seed.size == 64)
    }

    private fun loadWords(): List<String> {
        val stream = javaClass.classLoader!!.getResourceAsStream("bip39_english.txt")
            ?: error("missing test resource bip39_english.txt")
        return BufferedReader(InputStreamReader(stream, Charsets.UTF_8))
            .readLines()
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
    }
}
