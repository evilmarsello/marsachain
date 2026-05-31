package com.marsa.chain.model

import java.io.Serializable

data class WalletInfo(
    val id: String,
    val name: String,
    val address: String,
    val privateKey: String,
    val publicKey: String,
    val createdAt: Long = System.currentTimeMillis()
) : Serializable
