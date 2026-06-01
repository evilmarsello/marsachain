package com.marsa.chain.tma.shared

import kotlinx.browser.window
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.promise
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement

private val scope = MainScope()

private val outJson = Json {
    isLenient = true
    ignoreUnknownKeys = true
    encodeDefaults = true
}

@Suppress("unused")
fun main() {
    // Empty JS object; dynamic type — avoids .asDynamic() on every assignment (otherwise bundle crashes).
    val bridge: dynamic = js("({})")
    bridge.fetchNodeInfoJson = { baseUrl: String ->
        scope.promise {
            val client = createFullnodeHttpClient()
            try {
                val repo = FullnodeRepository(client)
                val st = repo.fetchStatus(baseUrl)
                val obj: JsonObject = if (st == null) {
                    buildJsonObject {
                        put("connected", JsonPrimitive(false))
                    }
                } else {
                    buildJsonObject {
                        put("connected", JsonPrimitive(true))
                        put("height", JsonPrimitive(st.height))
                        put("target", JsonPrimitive(st.target))
                        st.bits?.let { put("bits", JsonPrimitive(it)) }
                        st.difficulty?.let { put("difficulty", JsonPrimitive(it)) }
                        st.addrTxIndexReady?.let { put("addr_tx_index_ready", JsonPrimitive(it)) }
                    }
                }
                outJson.encodeToString(JsonObject.serializer(), obj)
            } finally {
                client.close()
            }
        }
    }
    bridge.fetchWalletBalanceJson = { baseUrl: String, address: String ->
        scope.promise {
            val client = createFullnodeHttpClient()
            try {
                val repo = FullnodeRepository(client)
                val b = repo.fetchWalletBalance(baseUrl, address)
                val obj: JsonObject = if (b == null) {
                    buildJsonObject {
                        put("ok", JsonPrimitive(false))
                    }
                } else {
                    buildJsonObject {
                        put("ok", JsonPrimitive(true))
                        put("address", JsonPrimitive(b.address))
                        put("balance", JsonPrimitive(b.balance))
                        b.available_balance?.let { put("available_balance", JsonPrimitive(it)) }
                        b.frozen_balance?.let { put("frozen_balance", JsonPrimitive(it)) }
                    }
                }
                outJson.encodeToString(JsonObject.serializer(), obj)
            } finally {
                client.close()
            }
        }
    }
    bridge.fetchAddressTxJson = { baseUrl: String, address: String, from: dynamic, limit: dynamic ->
        scope.promise {
            val client = createFullnodeHttpClient()
            try {
                val repo = FullnodeRepository(client)
                val f = (from as? Number)?.toInt() ?: 0
                val l = (limit as? Number)?.toInt() ?: 50
                val list = repo.fetchAddressTransactions(baseUrl, address, f, l) ?: emptyList()
                outJson.encodeToString(ListSerializer(AddressTxDto.serializer()), list)
            } finally {
                client.close()
            }
        }
    }
    bridge.fetchMempoolJson = { baseUrl: String ->
        scope.promise {
            val client = createFullnodeHttpClient()
            try {
                val repo = FullnodeRepository(client)
                val snap = repo.fetchMempool(baseUrl)
                val obj: JsonObject =
                    if (snap == null) {
                        buildJsonObject { put("ok", JsonPrimitive(false)) }
                    } else {
                        buildJsonObject {
                            put("ok", JsonPrimitive(true))
                            put("count", JsonPrimitive(snap.count))
                            put("totalFees", JsonPrimitive(snap.totalFees))
                            put(
                                "transactions",
                                outJson.encodeToJsonElement(
                                    ListSerializer(MempoolTxDto.serializer()),
                                    snap.transactions,
                                ),
                            )
                        }
                    }
                outJson.encodeToString(JsonObject.serializer(), obj)
            } finally {
                client.close()
            }
        }
    }
    bridge.fetchMiningInfoJson = { baseUrl: String, address: String ->
        scope.promise {
            val client = createFullnodeHttpClient()
            try {
                val repo = FullnodeRepository(client)
                val info = repo.fetchMiningInfo(baseUrl, address)
                val obj: JsonObject =
                    if (info == null) {
                        buildJsonObject { put("ok", JsonPrimitive(false)) }
                    } else {
                        buildJsonObject {
                            put("ok", JsonPrimitive(true))
                            put("data", outJson.encodeToJsonElement(MinerStakeInfoDto.serializer(), info))
                        }
                    }
                outJson.encodeToString(JsonObject.serializer(), obj)
            } finally {
                client.close()
            }
        }
    }
    bridge.fetchValidatorsJson = { baseUrl: String ->
        scope.promise {
            val client = createFullnodeHttpClient()
            try {
                val repo = FullnodeRepository(client)
                val resp = repo.fetchValidators(baseUrl)
                val obj: JsonObject =
                    if (resp == null) {
                        buildJsonObject { put("ok", JsonPrimitive(false)) }
                    } else {
                        buildJsonObject {
                            put("ok", JsonPrimitive(true))
                            put("total", JsonPrimitive(resp.total))
                            put(
                                "validators",
                                outJson.encodeToJsonElement(
                                    ListSerializer(ValidatorDto.serializer()),
                                    resp.validators,
                                ),
                            )
                        }
                    }
                outJson.encodeToString(JsonObject.serializer(), obj)
            } finally {
                client.close()
            }
        }
    }
    bridge.fetchMiningStatsJson = { baseUrl: String ->
        scope.promise {
            val client = createFullnodeHttpClient()
            try {
                val repo = FullnodeRepository(client)
                val stats = repo.fetchMiningStats(baseUrl)
                val obj: JsonObject =
                    if (stats == null) {
                        buildJsonObject { put("ok", JsonPrimitive(false)) }
                    } else {
                        buildJsonObject {
                            put("ok", JsonPrimitive(true))
                            put("activeMiners", JsonPrimitive(stats.activeMiners))
                            put("stakedMiners", JsonPrimitive(stats.stakedMiners))
                            put("totalMiners", JsonPrimitive(stats.totalMiners))
                            put("blocksPerHour", JsonPrimitive(stats.blocksPerHour))
                            put("averageHashrate", JsonPrimitive(stats.averageHashrate))
                        }
                    }
                outJson.encodeToString(JsonObject.serializer(), obj)
            } finally {
                client.close()
            }
        }
    }
    val w: dynamic = window.asDynamic()
    w.__TMA_SHARED__ = bridge
}
