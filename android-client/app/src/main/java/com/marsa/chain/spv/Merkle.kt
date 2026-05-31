package com.marsa.chain.spv

import java.security.MessageDigest

object MerkleVerifier {
    fun verify(txidHex: String, merkleRootHex: String, pathHex: List<String>, index: Int): Boolean {
        var hash = hexToBytes(txidHex)
        var idx = index
        for (nodeHex in pathHex) {
            val node = hexToBytes(nodeHex)
            hash = if (idx % 2 == 0) sha256d(hash + node) else sha256d(node + hash)
            idx /= 2
        }
        val root = hexToBytes(merkleRootHex)
        return hash.contentEquals(root)
    }

    private fun sha256d(data: ByteArray): ByteArray {
        val sha = MessageDigest.getInstance("SHA-256")
        val once = sha.digest(data)
        return sha.digest(once)
    }

    private fun hexToBytes(hex: String): ByteArray {
        val clean = if (hex.length % 2 == 0) hex else "0$hex"
        val out = ByteArray(clean.length / 2)
        var i = 0
        while (i < clean.length) {
            out[i / 2] = ((hexChar(clean[i]) shl 4) + hexChar(clean[i + 1])).toByte()
            i += 2
        }
        return out
    }

    private fun hexChar(c: Char): Int {
        return when (c) {
            in '0'..'9' -> c - '0'
            in 'a'..'f' -> c - 'a' + 10
            in 'A'..'F' -> c - 'A' + 10
            else -> 0
        }
    }
}
