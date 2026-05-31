package com.marsa.chain.crypto.hd

import org.junit.Assert.assertArrayEquals
import org.junit.Test

class Slip0010Ed25519Test {

    @Test
    fun slip0010_ed25519_vector1_chain_m() {
        val seed = hexToBytes("000102030405060708090a0b0c0d0e0f")
        val (k, c) = Slip0010Ed25519.masterFromSeed(seed)
        assertArrayEquals(
            hexToBytes("2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7"),
            k
        )
        assertArrayEquals(
            hexToBytes("90046a93de5380a72b5e45010748567d5ea02bbf6522f979e05c0d8d8ca9fffb"),
            c
        )
    }

    @Test
    fun slip0010_ed25519_vector1_m_0h() {
        val seed = hexToBytes("000102030405060708090a0b0c0d0e0f")
        val (k0, c0) = Slip0010Ed25519.masterFromSeed(seed)
        val i0 = 0x80000000.toInt() or 0
        val (k1, _) = Slip0010Ed25519.deriveChildHardened(k0, c0, i0)
        assertArrayEquals(
            hexToBytes("68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3"),
            k1
        )
    }

    private fun hexToBytes(s: String): ByteArray {
        require(s.length % 2 == 0)
        return ByteArray(s.length / 2) { i ->
            s.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }
}
