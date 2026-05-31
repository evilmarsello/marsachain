package com.marsa.chain

import com.marsa.chain.spv.MerkleVerifier
import org.junit.Assert.assertTrue
import org.junit.Test

class MerkleProofTest {
    @Test
    fun verifySingleTxBlock() {
        // For single tx block, merkle root equals txid, empty path
        val txid = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7aadf4c4c4"
        val root = txid
        val ok = MerkleVerifier.verify(txid, root, emptyList(), 0)
        assertTrue(ok)
    }
}
