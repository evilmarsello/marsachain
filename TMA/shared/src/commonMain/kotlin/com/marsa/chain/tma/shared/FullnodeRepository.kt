package com.marsa.chain.tma.shared

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.encodeURLParameter
import kotlinx.serialization.json.Json

private val json = Json {
    isLenient = true
    ignoreUnknownKeys = true
    encodeDefaults = true
}

class FullnodeRepository(private val client: HttpClient) {

    /**
     * @param baseUrl базовый URL ноды, с завершающим / или без
     * @return null если нода недоступна или success=false
     */
    suspend fun fetchStatus(baseUrl: String): StatusDto? {
        val url = normalizeBaseUrl(baseUrl) + "status"
        return try {
            val text = client.get(url).bodyAsText()
            val envelope = json.decodeFromString(StatusResponseEnvelope.serializer(), text)
            if (envelope.success && envelope.data != null) envelope.data else null
        } catch (_: Throwable) {
            null
        }
    }

    suspend fun isNodeHealthy(baseUrl: String): Boolean = fetchStatus(baseUrl) != null

    /**
     * GET /wallet/balance?address=… (как Android `getWalletBalance`).
     * @return null при ошибке сети или success=false
     */
    suspend fun fetchWalletBalance(baseUrl: String, address: String): WalletBalanceDto? {
        val trimmed = address.trim()
        if (trimmed.isEmpty()) return null
        val root = normalizeBaseUrl(baseUrl)
        val q = trimmed.encodeURLParameter()
        val url = "${root}wallet/balance?address=$q"
        return try {
            val text = client.get(url).bodyAsText()
            val envelope = json.decodeFromString(WalletBalanceEnvelope.serializer(), text)
            if (envelope.success && envelope.data != null) envelope.data else null
        } catch (_: Throwable) {
            null
        }
    }

    /**
     * GET /address/transactions?address=&from=&limit=
     */
    suspend fun fetchAddressTransactions(
        baseUrl: String,
        address: String,
        from: Int = 0,
        limit: Int = 50,
    ): List<AddressTxDto>? {
        val trimmed = address.trim()
        if (trimmed.isEmpty()) return null
        val root = normalizeBaseUrl(baseUrl)
        val enc = trimmed.encodeURLParameter()
        val url = "${root}address/transactions?address=$enc&from=$from&limit=$limit"
        return try {
            val text = client.get(url).bodyAsText()
            val envelope = json.decodeFromString(AddressTxListEnvelope.serializer(), text)
            if (envelope.success && envelope.data != null) envelope.data else null
        } catch (_: Throwable) {
            null
        }
    }

    /**
     * GET /mempool — снимок очереди (read-only), как в `ApiServer::handleGetMempool`.
     * @return null при ошибке сети или success=false
     */
    suspend fun fetchMempool(baseUrl: String): MempoolSnapshotDto? {
        val root = normalizeBaseUrl(baseUrl)
        val url = "${root}mempool"
        return try {
            val text = client.get(url).bodyAsText()
            val envelope = json.decodeFromString(MempoolEnvelope.serializer(), text)
            if (envelope.success && envelope.data != null) envelope.data else null
        } catch (_: Throwable) {
            null
        }
    }

    /**
     * GET /account/mining_info?address=… (как Android `getMiningInfo`).
     * @return null при ошибке сети или success=false
     */
    suspend fun fetchMiningInfo(baseUrl: String, address: String): MinerStakeInfoDto? {
        val trimmed = address.trim()
        if (trimmed.isEmpty()) return null
        val root = normalizeBaseUrl(baseUrl)
        val enc = trimmed.encodeURLParameter()
        val url = "${root}account/mining_info?address=$enc"
        return try {
            val text = client.get(url).bodyAsText()
            val envelope = json.decodeFromString(MinerStakeInfoEnvelope.serializer(), text)
            if (envelope.success && envelope.data != null) envelope.data else null
        } catch (_: Throwable) {
            null
        }
    }

    /**
     * GET /validators (как Android `getValidators`).
     * @return null при ошибке сети или success=false
     */
    suspend fun fetchValidators(baseUrl: String): ValidatorsResponseDto? {
        val root = normalizeBaseUrl(baseUrl)
        val url = "${root}validators"
        return try {
            val text = client.get(url).bodyAsText()
            val envelope = json.decodeFromString(ValidatorsEnvelope.serializer(), text)
            if (envelope.success && envelope.data != null) envelope.data else null
        } catch (_: Throwable) {
            null
        }
    }

    /** GET /mining/stats (как Android `getMiningStats`). */
    suspend fun fetchMiningStats(baseUrl: String): MiningStatsDto? {
        val root = normalizeBaseUrl(baseUrl)
        val url = "${root}mining/stats"
        return try {
            val text = client.get(url).bodyAsText()
            val envelope = json.decodeFromString(MiningStatsEnvelope.serializer(), text)
            if (envelope.success && envelope.data != null) envelope.data else null
        } catch (_: Throwable) {
            null
        }
    }

    companion object {
        fun normalizeBaseUrl(baseUrl: String): String {
            val t = baseUrl.trim()
            return if (t.endsWith('/')) t else "$t/"
        }
    }
}
