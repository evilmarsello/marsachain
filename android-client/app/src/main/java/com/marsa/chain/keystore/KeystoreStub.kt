package com.marsa.chain.keystore

object KeystoreStub {
    fun getAddress(): String = "spv-demo-address"
    fun sign(data: ByteArray): ByteArray = ("signature:" + data.size).toByteArray()
}
