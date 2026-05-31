package com.marsa.chain.network

import com.google.gson.Gson
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

object Api {
    private const val DEFAULT_BASE_URL = "http://10.0.2.2/" // emulator/proxy endpoint

    private val gson = Gson()

    // BODY засоряет логи при опросе /status каждые 5–10 сек; NONE оставляет только логи приложения
    private val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.NONE
    }

    private val defaultClient = OkHttpClient.Builder()
        .addInterceptor(logging)
        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS) // Увеличено для mining submit
        .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    private fun retrofit(baseUrl: String, client: OkHttpClient = defaultClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()

    val service: FullnodeService = retrofit(DEFAULT_BASE_URL).create(FullnodeService::class.java)

    fun serviceFor(baseUrl: String): FullnodeService = retrofit(baseUrl).create(FullnodeService::class.java)
}

data class HeaderDTO(
    val version: Int,
    val prev_hash: String,
    val merkle_root: String,
    val timestamp: Int,
    val bits: Int,
    val nonce: Int
)

/** commitment = H(nonce) hex (64 символа), опционально — для защиты от перебора nonce. */
data class ChallengeRequest(val address: String, val pubKey: String, val commitment: String? = null)

/** bits — compact target на момент выдачи (как на ноде); для локального PoW до submit. */
data class ChallengeResponse(val challengeId: String, val challenge: String, val expiresAt: Long, val bits: Int? = null)

/**
 * Ответ ноды: при success=false поля error/reason есть, data может отсутствовать в JSON.
 * Не использовать non-null data — иначе Gson падает на теле ошибки и клиент видит лишь generic catch.
 */
data class ApiResponse<T>(
    val success: Boolean = false,
    val data: T? = null,
    val error: String? = null,
    val reason: String? = null
)

data class ChallengeResponseWrapper(val challengeId: String, val challenge: String, val expiresAt: Long, val bits: Int? = null)

data class MiningSubmitRequest(
    val address: String,
    val challengeId: String,
    val clientHash: String,
    val signature: String,
    val attestation: String,
    val headerHash: String,
    val claimedHeight: Int,
    val pubKey: String,
    val nonce: String
)

/** POST /mining/challenge/abandon — закрыть challenge без блока (не прошёл локальный PoW). */
data class ChallengeAbandonRequest(
    val address: String,
    val challengeId: String,
    val pubKey: String,
    val signature: String
)

data class ChallengeAbandonResult(val abandoned: Boolean? = null)

/** Константы майнинг-API (синхронно с fullnode). */
object MiningApi {
    /** UTF-8 строка для Ed25519; нода проверяет Crypto::verify(pubKey, message, signature). */
    fun abandonSignMessage(address: String, challengeId: String): String =
        "marsa:mining:abandon:v1:$challengeId:$address"
}

data class MiningSubmitResponse(val accepted: Boolean, val reason: String?)

// Merkle proof
data class MerkleProof(
    val txid: String,
    val merkle_root: String,
    val path: List<String>,
    val index: Int,
    val height: Int
)

/** height, target, bits/difficulty — для отображения сложности на клиенте (майнинг не использует bits для фильтрации). */
data class StatusDTO(val height: Int, val target: Int, val difficulty: Int? = null, val bits: Int? = null)

// Старый формат (для обратной совместимости)
data class BalanceDTO(val address: String, val balance: Long)

// Новый формат с поддержкой дробных монет
data class WalletBalanceDTO(
    val address: String,
    val balance: String, // Форматированная строка (например, "5000.00")
    val balance_wei: String? = null, // минимальные единицы (wei), 1 монета = 10^8 wei
    val frozen_balance: String? = null,
    val frozen_balance_wei: String? = null,
    val available_balance: String? = null,
    val available_balance_wei: String? = null
)

data class TransactionSubmitResponse(
    val message: String?,
    val status: String?,
    val txid: String?
)

data class TransactionInput(
    val address: String,
    val amount: Long,
    val signature: String,
    val pubKey: String
)

data class TransactionOutput(
    val value: Long,
    val address: String
)

data class TransactionRequest(
    val txid: String,
    val inputs: List<TransactionInput>,
    val outputs: List<TransactionOutput>,
    val fee: Long,
    val tx_type: Int = 0,  // 0 = REGULAR, 10 = MINER_STAKE, 11 = MINER_UNSTAKE
    val data: String = "",  // JSON data for special transactions
    val metadata: Map<String, Any>? = null  // Metadata for STAKE/MINER_STAKE transactions
)

data class MiningStatsDTO(
    val activeMiners: Int,
    val totalMiners: Int,
    val blocksPerHour: Int,
    val averageHashrate: Double
)

data class ConfirmationsDTO(
    val txid: String,
    val confirmations: Int,
    val required: Int,
    val blockHeight: Int?,
    val status: String,
    val found: Boolean? = null
)

data class AddressTxDTO(
    val txid: String,
    val fromAddress: String,
    val toAddress: String,
    val amount: Long,
    val fee: Long,
    val blockHeight: Int,
    val timestamp: Long,
    val type: String
)

/** Ответ GET /validators: список валидаторов ноды (для проверки «есть ли активный стейк» и выбора ноды по загрузке). */
data class ValidatorDTO(
    val node_id: String?,
    val wallet_address: String?,
    val ip: String?,
    val port: Int?,
    val frozen_balance: Long,
    val is_active: Boolean,
    val last_heartbeat: Long?,
    val api_port: Int? = null,
    val active_miner_count: Int? = null,
    val miner_capacity: Int? = null,
    val miner_slots_free: Int? = null,
    val is_overloaded: Boolean? = null,
    val load_percent: Int? = null
)

data class ValidatorsResponseDTO(
    val total: Int,
    val validators: List<ValidatorDTO>
)

// ========================================================================
// MINER_STAKE: Информация о майнинговом стейке
// ========================================================================

/** Информация о MINER_STAKE для адреса (соответствует API ноды) */
data class MinerStakeInfoDTO(
    val address: String,
    val current_height: Int,
    val miner_stake_active: Boolean,
    val has_stake: Boolean,
    // Если есть stake:
    val staked_amount: Long? = null,  // wei
    val staked_amount_formatted: String? = null,
    val unlock_block: Int? = null,
    val blocks_until_unlock: Int? = null,
    val freeze_cost_per_hash: Long? = null,
    val freeze_cost_formatted: String? = null,
    val total_credits_per_window: Long? = null,
    val used_credits: Long? = null,
    val available_credits: Long? = null,
    val refill_period_blocks: Int? = null,
    val last_refill_height: Int? = null,
    val next_refill_height: Int? = null,
    val blocks_until_refill: Int? = null,
    val min_unstake_block: Int? = null,
    val can_unstake: Boolean? = null,
    val blocks_until_can_unstake: Int? = null,
    val min_miner_stake_lock_blocks: Int? = null,
    // Если нет stake:
    val min_stake_amount: Long? = null,
    val min_stake_formatted: String? = null,
    val min_stake_duration: Int? = null,
    val max_stake_duration: Int? = null
)

interface FullnodeService {
    @GET("headers")
    suspend fun getHeaders(@Query("from") from: Int): List<HeaderDTO>

    @POST("challenge/request")
    suspend fun requestChallenge(@Body req: ChallengeRequest): ApiResponse<ChallengeResponseWrapper>

    @POST("mining/challenge/abandon")
    suspend fun abandonMiningChallenge(@Body req: ChallengeAbandonRequest): ApiResponse<ChallengeAbandonResult>

    @POST("mining/submit")
    suspend fun miningSubmit(@Body req: MiningSubmitRequest): ApiResponse<MiningSubmitResponse>

    @GET("tx/proof")
    suspend fun getTxProof(@Query("txid") txid: String, @Query("address") address: String): MerkleProof

    @GET("status")
    suspend fun getStatus(): ApiResponse<StatusDTO>

    @GET("balance")
    suspend fun getBalance(@Query("address") address: String): ApiResponse<BalanceDTO>
    
    @GET("wallet/balance")
    suspend fun getWalletBalance(@Query("address") address: String): ApiResponse<WalletBalanceDTO>
    
    @POST("transaction/submit")
    suspend fun submitTransaction(@Body transaction: TransactionRequest): ApiResponse<TransactionSubmitResponse>
    
    @GET("mining/stats")
    suspend fun getMiningStats(): ApiResponse<MiningStatsDTO>

    @GET("tx/confirmations")
    suspend fun getConfirmations(@Query("txid") txid: String): ApiResponse<ConfirmationsDTO>

    @GET("address/transactions")
    suspend fun getAddressTransactions(
        @Query("address") address: String,
        @Query("from") from: Int? = null,
        @Query("limit") limit: Int? = null
    ): ApiResponse<List<AddressTxDTO>>

    /** Список валидаторов ноды. Нода подходит для майнинга, если есть хотя бы один валидатор с is_active. */
    @GET("validators")
    suspend fun getValidators(): ApiResponse<ValidatorsResponseDTO>
    
    /** Получить информацию о MINER_STAKE для адреса */
    @GET("account/mining_info")
    suspend fun getMiningInfo(@Query("address") address: String): ApiResponse<MinerStakeInfoDTO>
}
