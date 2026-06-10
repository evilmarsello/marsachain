package com.marsa.chain.network

import android.content.Context
import android.util.Log
import com.marsa.chain.manager.ConnectionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import com.marsa.chain.utils.CoinFormatter
import retrofit2.HttpException


sealed class ChallengeRequestOutcome {
    data class Success(val challenge: ChallengeResponse) : ChallengeRequestOutcome()
    object BlockRateLimited : ChallengeRequestOutcome()
    object Failed : ChallengeRequestOutcome()
}

class ApiClient(context: Context? = null) {
    private val tag = "ApiClient"
    private val connectionManager: ConnectionManager? = context?.let { ConnectionManager(it) }
    private var baseUrl: String = connectionManager?.getCurrentBaseUrl() ?: "http://10.0.2.2/"
    private var service = Api.serviceFor(baseUrl)

    
    @Volatile
    private var miningNodesCache: List<String>? = null
    
    @Volatile
    private var miningNodesCacheTimeMs: Long = 0L
    
    private val miningNodesCacheTtlMs = 15_000L
    private val checkTimeoutMs = 2500L

    
    private fun logMiningChallengeHttpError(where: String, e: Exception) {
        if (e is HttpException && e.code() == 429) {
            val body = try {
                e.response()?.errorBody()?.string().orEmpty()
            } catch (_: Exception) {
                ""
            }
            if (body.contains("Rate limit", ignoreCase = true)) {
                Log.d(tag, "$where: HTTP 429 — per-block credit limit (rate limit)")
            } else {
                Log.d(tag, "$where: HTTP 429 — pending challenge queue full (see MAX_PENDING_CHALLENGES on node)")
            }
        } else {
            Log.e(tag, "$where error: ${e.message}", e)
        }
    }

    // Method to update base URL when connection settings change
    fun updateBaseUrl(context: Context) {
        val newBaseUrl = ConnectionManager(context).getCurrentBaseUrl()
        if (newBaseUrl != baseUrl) {
            Log.d(tag, "Base URL changed: $baseUrl -> $newBaseUrl")
            baseUrl = newBaseUrl
            service = Api.serviceFor(baseUrl)
        }
    }
    
    // Get current base URL
    fun getBaseUrl(): String = baseUrl

    suspend fun getHealth(): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            val response = service.getStatus()
            if (response.success) {
                true
            } else {
                Log.e(tag, "getHealth() server returned success=false")
                false
            }
        } catch (e: Exception) {
            Log.e(tag, "getHealth() error: ${e.message}", e)
            Log.e(tag, "getHealth() error type: ${e.javaClass.simpleName}")
            if (e is java.net.ConnectException) {
                Log.e(tag, "Connection failed - check network/firewall")
            }
            false
        }
    }

    suspend fun requestChallenge(address: String, pubKey: String): ChallengeResponse? = withContext(Dispatchers.IO) {
        when (val o = requestChallengeFrom(baseUrl, address, pubKey, null)) {
            is ChallengeRequestOutcome.Success -> o.challenge
            else -> null
        }
    }

    
    suspend fun requestChallengeFrom(
        baseUrl: String,
        address: String,
        pubKey: String,
        commitment: String? = null
    ): ChallengeRequestOutcome = withContext(Dispatchers.IO) {
        return@withContext try {
            val svc = Api.serviceFor(baseUrl)
            val response = svc.requestChallenge(ChallengeRequest(address, pubKey, commitment))
            if (response.success && response.data != null) {
                ChallengeRequestOutcome.Success(
                    ChallengeResponse(
                        challengeId = response.data.challengeId,
                        challenge = response.data.challenge,
                        expiresAt = response.data.expiresAt,
                        bits = response.data.bits
                    )
                )
            } else {
                Log.w(
                    tag,
                    "requestChallengeFrom($baseUrl): success=${response.success} error=${response.error} reason=${response.reason}"
                )
                ChallengeRequestOutcome.Failed
            }
        } catch (e: HttpException) {
            if (e.code() == 429) {
                val body = try {
                    e.response()?.errorBody()?.string().orEmpty()
                } catch (_: Exception) {
                    ""
                }
                if (body.contains("Rate limit", ignoreCase = true)) {
                    return@withContext ChallengeRequestOutcome.BlockRateLimited
                }
            }
            logMiningChallengeHttpError("requestChallengeFrom()", e)
            ChallengeRequestOutcome.Failed
        } catch (e: Exception) {
            logMiningChallengeHttpError("requestChallengeFrom()", e)
            ChallengeRequestOutcome.Failed
        }
    }

    suspend fun submitMiningResult(req: MiningSubmitRequest): MiningSubmitResponse? = withContext(Dispatchers.IO) {
        submitMiningResultTo(baseUrl, req)
    }

    
    suspend fun submitMiningResultTo(baseUrl: String, req: MiningSubmitRequest): MiningSubmitResponse? = withContext(Dispatchers.IO) {
        return@withContext try {
            val svc = Api.serviceFor(baseUrl)
            val response = svc.miningSubmit(req)
            if (response.success && response.data != null) response.data else null
        } catch (e: Exception) {
            Log.e(tag, "submitMiningResultTo() error: ${e.message}", e)
            null
        }
    }

    
    suspend fun abandonChallengeTo(
        baseUrl: String,
        address: String,
        challengeId: String,
        pubKey: String,
        signatureB64: String
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val svc = Api.serviceFor(baseUrl)
            val body = ChallengeAbandonRequest(address, challengeId, pubKey, signatureB64)
            val response = svc.abandonMiningChallenge(body)
            response.success
        } catch (e: Exception) {
            Log.d(tag, "abandonChallengeTo() fallback candidate: ${e.message}")
            false
        }
    }

    suspend fun getHeaders(from: Int = 0): List<HeaderDTO> = withContext(Dispatchers.IO) {
        return@withContext try {
            val list = service.getHeaders(from)
            list
        } catch (e: Exception) {
            Log.e(tag, "getHeaders() error: ${e.message}", e)
            emptyList()
        }
    }

    suspend fun getStatus(): Map<String, Any?>? = withContext(Dispatchers.IO) {
        return@withContext try {
            val response = service.getStatus()
            val d = response.data
            if (response.success && d != null) {
                mapOf(
                    "height" to d.height,
                    "target" to d.target,
                    "difficulty" to (d.difficulty ?: d.bits),
                    "bits" to (d.bits ?: d.difficulty)
                )
            } else {
                Log.e(tag, "getStatus() server returned success=false")
                null
            }
        } catch (e: Exception) {
            Log.e(tag, "getStatus() error: ${e.message}", e)
            null
        }
    }

    suspend fun getBalance(address: String): BalanceDTO? = withContext(Dispatchers.IO) {
        return@withContext try {
            try {
                val walletResp = service.getWalletBalance(address)
                if (walletResp.success && walletResp.data != null) {
                    val balanceNanos = walletResp.data.balance_wei?.toLongOrNull() 
                        ?: (walletResp.data.balance.toDoubleOrNull()?.let { (it * CoinFormatter.WEI_PER_COIN).toLong() } ?: 0L)
                    return@withContext BalanceDTO(walletResp.data.address, balanceNanos)
                }
            } catch (_: Exception) { }
            
            val resp = service.getBalance(address)
            if (resp.success && resp.data != null) {
                resp.data
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(tag, "getBalance() error: ${e.message}", e)
            null
        }
    }
    
    suspend fun submitTransaction(transaction: TransactionRequest): TransactionSubmitResponse? = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = service.submitTransaction(transaction)
            if (resp.success && resp.data != null) {
                resp.data
            } else {
                Log.e(tag, "submitTransaction() server returned success=false or data=null")
                null
            }
        } catch (e: Exception) {
            Log.e(tag, "submitTransaction() error: ${e.message}", e)
            null
        }
    }
    
    suspend fun getMiningStats(): MiningStatsDTO? = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = service.getMiningStats()
            if (resp.success && resp.data != null) resp.data else null
        } catch (e: Exception) {
            Log.e(tag, "getMiningStats() error: ${e.message}", e)
            null
        }
    }

    suspend fun getConfirmations(txid: String): ConfirmationsDTO? = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = service.getConfirmations(txid)
            if (resp.success && resp.data != null) resp.data else null
        } catch (e: Exception) {
            Log.e(tag, "getConfirmations() error: ${e.message}", e)
            null
        }
    }

    suspend fun getAddressTransactions(address: String, from: Int? = null, limit: Int? = 200): List<AddressTxDTO> = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = service.getAddressTransactions(address, from, limit)
            if (resp.success && resp.data != null) resp.data else emptyList()
        } catch (e: Exception) {
            Log.e(tag, "getAddressTransactions() error: ${e.message}", e)
            emptyList()
        }
    }

    
    suspend fun hasActiveValidator(baseUrl: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val svc = Api.serviceFor(baseUrl)
            val resp = svc.getValidators()
            if (!resp.success || resp.data == null) return@withContext false
            resp.data.validators.any { it.is_active }
        } catch (_: Exception) {
            false
        }
    }

    
    suspend fun getMiningNodesOrdered(): List<String> = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        val cached = miningNodesCache
        if (!cached.isNullOrEmpty() && (now - miningNodesCacheTimeMs) < miningNodesCacheTtlMs) {
            return@withContext cached
        }
        val cm = connectionManager ?: return@withContext emptyList()
        val current = baseUrl
        val candidates = cm.getCandidateBaseUrls()
        val others = candidates.filter { it != current }
        if (hasActiveValidator(current)) {
            val fallback = miningNodesCache?.filter { it != current } ?: emptyList()
            miningNodesCache = listOf(current) + fallback
            miningNodesCacheTimeMs = now
            CoroutineScope(Dispatchers.IO).launch {
                val rest = getOtherValidNodesParallel(others)
                miningNodesCache = listOf(current) + rest
            }
            return@withContext listOf(current) + fallback
        }
        val validOthers = getOtherValidNodesParallel(others)
        miningNodesCache = validOthers
        miningNodesCacheTimeMs = if (validOthers.isNotEmpty()) now else 0L
        if (validOthers.isEmpty()) {
            Log.w(tag, "getMiningNodesOrdered() no node with active validator")
            return@withContext emptyList()
        }
        validOthers
    }

    private suspend fun getOtherValidNodesParallel(urls: List<String>): List<String> = coroutineScope {
        if (urls.isEmpty()) return@coroutineScope emptyList()
        val results = urls.map { url ->
            async {
                val ok = withTimeoutOrNull(checkTimeoutMs) { hasActiveValidator(url) } ?: false
                if (ok) url else null
            }
        }.awaitAll()
        results.filterNotNull()
    }

    
    suspend fun getBaseUrlForMining(): String? = getMiningNodesOrdered().firstOrNull()

    
    fun getCachedMiningFallbackUrls(): List<String> = miningNodesCache?.drop(1) ?: emptyList()
    
    
    suspend fun getMiningInfo(address: String): MinerStakeInfoDTO? = withContext(Dispatchers.IO) {
        return@withContext try {
            val resp = service.getMiningInfo(address)
            if (resp.success && resp.data != null) resp.data else null
        } catch (e: Exception) {
            Log.e(tag, "getMiningInfo() error: ${e.message}", e)
            null
        }
    }

    suspend fun getOfficialPoolsList(): OfficialPoolsListDTO? = withContext(Dispatchers.IO) {
        try {
            val resp = service.getOfficialPoolsList()
            if (resp.success && resp.data != null) resp.data else null
        } catch (e: Exception) {
            Log.e(tag, "getOfficialPoolsList() error: ${e.message}", e)
            null
        }
    }

    suspend fun getPoolBind(address: String): PoolBindInfo? = withContext(Dispatchers.IO) {
        try {
            val resp = service.getPoolBind(address)
            if (!resp.success || resp.data == null) return@withContext null
            val data = resp.data
            val joinH = data.join_height ?: 0
            if (joinH <= 0 && data.status != "left") return@withContext null
            data
        } catch (e: Exception) {
            Log.e(tag, "getPoolBind() error: ${e.message}", e)
            null
        }
    }

    suspend fun getPoolMember(address: String): PoolMemberInfo? = withContext(Dispatchers.IO) {
        try {
            val resp = service.getPoolMember(address)
            if (resp.success && resp.data != null) resp.data else null
        } catch (e: Exception) {
            Log.e(tag, "getPoolMember() error: ${e.message}", e)
            null
        }
    }

    
    suspend fun getValidatorsFrom(baseUrl: String): ValidatorsResponseDTO? = withContext(Dispatchers.IO) {
        try {
            val resp = Api.serviceFor(baseUrl).getValidators()
            if (resp.success && resp.data != null) resp.data else null
        } catch (e: Exception) {
            Log.e(tag, "getValidatorsFrom($baseUrl) error: ${e.message}", e)
            null
        }
    }
}
