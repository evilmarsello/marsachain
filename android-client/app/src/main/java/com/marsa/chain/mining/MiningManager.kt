package com.marsa.chain.mining

import android.content.Context
import android.util.Base64
import com.marsa.chain.keystore.KeyStoreManager
import com.marsa.chain.network.Api
import com.marsa.chain.network.ChallengeAbandonRequest
import com.marsa.chain.network.ChallengeRequest
import com.marsa.chain.network.ChallengeResponseWrapper
import com.marsa.chain.network.MiningApi
import com.marsa.chain.network.FullnodeService
import com.marsa.chain.network.MiningSubmitRequest
import com.marsa.chain.utils.DifficultyDisplay
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import retrofit2.HttpException
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import kotlin.random.Random

sealed class MiningStatus {
    object Idle : MiningStatus()
    object Attempting : MiningStatus()
    data class Result(val success: Boolean, val confirmations: Int, val details: String) : MiningStatus()
}

private data class PendingSlot(val nonce: String, val challenge: ChallengeResponseWrapper)

class MiningManager(
    private val context: Context,
    private val address: String,
    private val pubKeyB64: String,
    private val nodes: List<String>, // baseUrls
    private val requiredConfirmations: Int = 2,
    private val parallelSubmissions: Int = 3
) {
    private val ks = KeyStoreManager(context)
    private val lastAttemptMutex = Mutex()
    private var lastAttemptTs = 0L

    /** Queue (nonce, challenge) from first node; credits deducted on issue. */
    private val pendingQueue = ArrayDeque<PendingSlot>()
    private val queueMutex = Mutex()

    private val _status = MutableStateFlow<MiningStatus>(MiningStatus.Idle)
    val status: StateFlow<MiningStatus> = _status

    // stubs
    private suspend fun hasEnoughBalance(): Boolean = true // replace with Room/remote check; >=64
    private fun deviceIntegrityStatus(): Boolean = true // stub or Play Integrity

    suspend fun attempt(scope: CoroutineScope): MiningStatus = withContext(Dispatchers.IO) {
        // cooldown 200ms
        lastAttemptMutex.withLock {
            val now = System.currentTimeMillis()
            if (now - lastAttemptTs < 200) {
                val wait = 200 - (now - lastAttemptTs)
                if (wait > 0) Thread.sleep(wait)
            }
            lastAttemptTs = System.currentTimeMillis()
        }

        if (!hasEnoughBalance()) {
            val res = MiningStatus.Result(false, 0, "Недостаточно баланса (<64)")
            _status.value = res
            return@withContext res
        }
        if (!deviceIntegrityStatus()) {
            val res = MiningStatus.Result(false, 0, "Не пройдена проверка целостности устройства")
            _status.value = res
            return@withContext res
        }

        _status.value = MiningStatus.Attempting

        // Only nodes with active validator (stake) accept mining blocks
        val miningNodes = mutableListOf<String>()
        for (n in nodes) {
            if (hasActiveValidator(n)) miningNodes.add(n)
        }
        if (miningNodes.isEmpty()) {
            val res = MiningStatus.Result(false, 0, "Нет нод с активным валидатором")
            _status.value = res
            return@withContext res
        }

        val primaryBase = miningNodes.first()
        val service0 = Api.serviceFor(primaryBase)

        val slot = queueMutex.withLock {
            if (pendingQueue.isEmpty()) {
                val ok = refillPendingQueue(service0)
                if (!ok) return@withLock null
            }
            pendingQueue.removeFirstOrNull()
        }
        if (slot == null) {
            val res = MiningStatus.Result(false, 0, "Нет кредитов или ошибка выдачи challenge")
            _status.value = res
            return@withContext res
        }

        val nonceStr = slot.nonce
        val challenge = slot.challenge

        val statusResp = service0.getStatus()
        if (!statusResp.success || statusResp.data == null) {
            // Return slot — challenge still usable
            queueMutex.withLock { pendingQueue.addFirst(slot) }
            val res = MiningStatus.Result(false, 0, "Не удалось получить status (height)")
            _status.value = res
            return@withContext res
        }
        val statusData = statusResp.data

        val clientHashHex = sha256Hex((challenge.challenge + nonceStr).toByteArray())

        try {
            ks.generateKey("mining_key")
        } catch (_: Exception) {
        }

        val bitsForPow = challenge.bits ?: statusData.bits
        if (bitsForPow != null) {
            val compact = bitsForPow.toLong() and 0xFFFFFFFFL
            if (!DifficultyDisplay.hashMeetsTarget(clientHashHex, compact)) {
                val abandonMsg = MiningApi.abandonSignMessage(address, challenge.challengeId)
                val abandonSig = ks.sign("mining_key", abandonMsg.toByteArray(StandardCharsets.UTF_8))
                val abandonSigB64 = Base64.encodeToString(abandonSig, Base64.NO_WRAP)
                val abandonBody = ChallengeAbandonRequest(address, challenge.challengeId, pubKeyB64, abandonSigB64)
                var closed = false
                try {
                    val ar = service0.abandonMiningChallenge(abandonBody)
                    closed = ar.success
                } catch (_: Exception) {
                }
                if (!closed) {
                    val signatureFallback = ks.sign("mining_key", clientHashHex.toByteArray())
                    val signatureB64Fb = Base64.encodeToString(signatureFallback, Base64.NO_WRAP)
                    val abandonReq = MiningSubmitRequest(
                        address = address,
                        challengeId = challenge.challengeId,
                        clientHash = clientHashHex,
                        signature = signatureB64Fb,
                        attestation = "stub-attestation",
                        headerHash = clientHashHex,
                        claimedHeight = statusData.height + 1,
                        pubKey = pubKeyB64,
                        nonce = nonceStr
                    )
                    try {
                        service0.miningSubmit(abandonReq)
                    } catch (_: Exception) {
                    }
                }
                val res = MiningStatus.Result(false, 0, "")
                _status.value = res
                return@withContext res
            }
        }

        val signature = ks.sign("mining_key", clientHashHex.toByteArray())
        val signatureB64 = Base64.encodeToString(signature, Base64.NO_WRAP)

        val attestation = "stub-attestation"

        // Prepare request (claimedHeight = next block after current height)
        val submitReq = MiningSubmitRequest(
            address = address,
            challengeId = challenge.challengeId,
            clientHash = clientHashHex,
            signature = signatureB64,
            attestation = attestation,
            headerHash = clientHashHex,
            claimedHeight = statusData.height + 1,
            pubKey = pubKeyB64,
            nonce = nonceStr
        )

        // Submit to N nodes in parallel (only nodes with active validator)
        val selected = miningNodes.take(parallelSubmissions)
        var confirmations = 0
        val tasks = selected.map { base ->
            scope.async(Dispatchers.IO) {
                try {
                    val svc = Api.serviceFor(base)
                    val resp = svc.miningSubmit(submitReq)
                    if (resp.success && resp.data != null && resp.data.accepted) 1 else 0
                } catch (_: Exception) {
                    0
                }
            }
        }
        val results = tasks.awaitAll()
        confirmations = results.sum()
        val success = confirmations >= requiredConfirmations
        val res = MiningStatus.Result(
            success,
            confirmations,
            if (success) "Блок найден" else ""
        )
        _status.value = res
        return@withContext res
    }

    /**
     * Reset queue (e.g. wallet / node change).
     */
    suspend fun clearPendingQueue() {
        queueMutex.withLock { pendingQueue.clear() }
    }

    /**
     * One open challenge per address per node; new request drops previous unused.
     */
    private suspend fun refillPendingQueue(service: FullnodeService): Boolean {
        val available = loadAvailableCredits(service)
        if (available == 0) return false
        val nonce = Random.nextInt(0, Int.MAX_VALUE).toString()
        val commitment = sha256Hex(nonce.toByteArray())
        val resp = try {
            service.requestChallenge(ChallengeRequest(address, pubKeyB64, commitment))
        } catch (e: HttpException) {
            if (e.code() == 429) {
                val body = try {
                    e.response()?.errorBody()?.string().orEmpty()
                } catch (_: Exception) {
                    ""
                }
                if (body.contains("Rate limit", ignoreCase = true)) {
                    return queueMutex.withLock { pendingQueue.isNotEmpty() }
                }
            }
            null
        } catch (_: Exception) {
            null
        }
        if (resp == null || !resp.success || resp.data == null) {
            return pendingQueue.isNotEmpty()
        }
        pendingQueue.addLast(PendingSlot(nonce, resp.data))
        return true
    }

    /**
     * Available credits for batch. If MINER_STAKE not active on node or response missing —
     * use [MAX_PENDING_ON_SERVER] (legacy fallback without active MINER_STAKE on node).
     */
    private suspend fun loadAvailableCredits(service: FullnodeService): Int {
        return try {
            val resp = service.getMiningInfo(address)
            if (resp.success && resp.data != null) {
                val d = resp.data
                if (!d.miner_stake_active) {
                    return MAX_PENDING_ON_SERVER
                }
                if (!d.has_stake) {
                    return 0
                }
                val a = d.available_credits ?: 0L
                a.toInt().coerceAtLeast(0)
            } else {
                MAX_PENDING_ON_SERVER
            }
        } catch (_: Exception) {
            MAX_PENDING_ON_SERVER
        }
    }

    private suspend fun hasActiveValidator(baseUrl: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val resp = Api.serviceFor(baseUrl).getValidators()
            if (!resp.success || resp.data == null) return@withContext false
            resp.data.validators.any { it.is_active }
        } catch (_: Exception) {
            false
        }
    }

    private fun sha256(data: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(data)

    private fun sha256Hex(data: ByteArray): String {
        val bytes = sha256(data)
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            sb.append(String.format("%02x", b))
        }
        return sb.toString()
    }

    companion object {
        /** Matches MiningParams::MAX_PENDING_CHALLENGES_PER_ADDRESS on node. */
        private const val MAX_PENDING_ON_SERVER = 1
    }
}
