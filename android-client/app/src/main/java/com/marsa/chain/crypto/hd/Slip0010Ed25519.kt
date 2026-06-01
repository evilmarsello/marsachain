package com.marsa.chain.crypto.hd

import org.bouncycastle.crypto.digests.SHA512Digest
import org.bouncycastle.crypto.macs.HMac
import org.bouncycastle.crypto.params.KeyParameter
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * SLIP-0010 derivation for ed25519 curve (hardened-only children).
 * https://github.com/satoshilabs/slips/blob/master/slip-0010.md
 */
object Slip0010Ed25519 {
    private val ED25519_SEED = "ed25519 seed".toByteArray(Charsets.UTF_8)

    private fun hmac512(key: ByteArray, data: ByteArray): ByteArray {
        val mac = HMac(SHA512Digest())
        mac.init(KeyParameter(key))
        mac.update(data, 0, data.size)
        val out = ByteArray(64)
        mac.doFinal(out, 0)
        return out
    }

    private fun ser32Be(i: Int): ByteArray =
        ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(i).array()

    /** Master (k, c) from seed (BIP39 yields 64 bytes; SLIP tests use arbitrary length as in vectors). */
    fun masterFromSeed(seed: ByteArray): Pair<ByteArray, ByteArray> {
        val i = hmac512(ED25519_SEED, seed)
        return i.copyOfRange(0, 32) to i.copyOfRange(32, 64)
    }

    /**
     * Hardened child for ed25519: per SLIP-0010 §118 — child key **is I_L** (first 32 HMAC bytes),
     * without adding k_par (that applies to secp256k1 / NIST).
     */
    fun deriveChildHardened(kPar: ByteArray, cPar: ByteArray, index: Int): Pair<ByteArray, ByteArray> {
        val data = ByteArray(1 + 32 + 4)
        data[0] = 0
        System.arraycopy(kPar, 0, data, 1, 32)
        System.arraycopy(ser32Be(index), 0, data, 33, 4)
        val z = hmac512(cPar, data)
        val ki = z.copyOfRange(0, 32)
        val ci = z.copyOfRange(32, 64)
        return ki to ci
    }

    /**
     * Path like m/44'/78213'/0'/0'/0' — all segments hardened (with ').
     */
    fun derivePath(seed: ByteArray, path: String): ByteArray {
        val segments = path.trim().split("/").filter { it.isNotEmpty() && it != "m" }
        require(segments.isNotEmpty()) { "empty path" }
        var (k, c) = masterFromSeed(seed)
        for (seg in segments) {
            require(seg.endsWith("'")) { "ed25519 slip10: only hardened segments allowed: $seg" }
            val num = seg.dropLast(1).toIntOrNull()
                ?: throw IllegalArgumentException("invalid segment $seg")
            val index = 0x80000000.toInt() or num
            val next = deriveChildHardened(k, c, index)
            k = next.first
            c = next.second
        }
        return k
    }
}
