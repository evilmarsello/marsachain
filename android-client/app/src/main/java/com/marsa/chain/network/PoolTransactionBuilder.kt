package com.marsa.chain.network

import android.util.Base64
import com.marsa.chain.crypto.KeyPair

/**
 * Builds pool transactions (tx_type 13/14) — mirrors TMA marsaTransaction.ts.
 */
object PoolTransactionBuilder {

    fun buildMinerPoolStake(
        from: String,
        publicKey: String,
        privateKey: String,
        poolId: Int,
        stakeAmountWei: Long,
        feeWei: Long,
        currentHeight: Int
    ): TransactionRequest {
        val txidData = StringBuilder()
            .append(from)
            .append(feeWei)
            .append(from)
            .append("0")
            .append(feeWei)
            .append(PoolConstants.POOL_STAKE_TX_TYPE)
            .append(stakeAmountWei)
            .append(poolId)
        val txid = sha256Hex(txidData.toString())
        val signature = signTxid(privateKey, txid)
        return TransactionRequest(
            txid = txid,
            inputs = listOf(
                TransactionInput(
                    address = from,
                    amount = stakeAmountWei + feeWei,
                    signature = signature,
                    pubKey = publicKey
                )
            ),
            outputs = listOf(TransactionOutput(value = 0, address = from)),
            fee = feeWei,
            tx_type = PoolConstants.POOL_STAKE_TX_TYPE,
            data = stakeAmountWei.toString(),
            metadata = mapOf(
                "current_height" to currentHeight,
                "pool_id" to poolId,
                "stake_amount_wei" to stakeAmountWei
            )
        )
    }

    fun buildMinerPoolUnstake(
        from: String,
        publicKey: String,
        privateKey: String,
        poolId: Int,
        feeWei: Long,
        currentHeight: Int
    ): TransactionRequest {
        val fee = if (feeWei > 0) feeWei else PoolConstants.POOL_UNSTAKE_FEE_WEI
        val txidData = StringBuilder()
            .append(from)
            .append(fee)
            .append(from)
            .append("0")
            .append(fee)
            .append(PoolConstants.POOL_UNSTAKE_TX_TYPE)
            .append(poolId)
        val txid = sha256Hex(txidData.toString())
        val signature = signTxid(privateKey, txid)
        return TransactionRequest(
            txid = txid,
            inputs = listOf(
                TransactionInput(
                    address = from,
                    amount = 0,
                    signature = signature,
                    pubKey = publicKey
                )
            ),
            outputs = listOf(TransactionOutput(value = 0, address = from)),
            fee = fee,
            tx_type = PoolConstants.POOL_UNSTAKE_TX_TYPE,
            data = "0",
            metadata = mapOf(
                "current_height" to currentHeight,
                "pool_id" to poolId
            )
        )
    }

    private fun sha256Hex(text: String): String {
        val bytes = java.security.MessageDigest.getInstance("SHA-256")
            .digest(text.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { String.format("%02x", it) }
    }

    private fun signTxid(privateKey: String, txidHex: String): String {
        val keyPair = KeyPair.fromPrivateKey(privateKey)
            ?: throw IllegalStateException("Failed to create KeyPair")
        val signatureBytes = keyPair.sign(txidHex.toByteArray(Charsets.UTF_8))
            ?: throw IllegalStateException("Failed to sign transaction")
        return Base64.encodeToString(signatureBytes, Base64.NO_WRAP)
    }
}
