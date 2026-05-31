package com.marsa.chain.tma.shared

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class StatusDto(
    val height: Int,
    val target: Int,
    val difficulty: Int? = null,
    val bits: Int? = null,
    @SerialName("addr_tx_index_ready")
    val addrTxIndexReady: Boolean? = null,
)

/** Ответ ноды: при success=false поле data может отсутствовать (как в Android / Gson). */
@Serializable
data class StatusResponseEnvelope(
    val success: Boolean = false,
    val data: StatusDto? = null,
    val error: String? = null,
    val reason: String? = null,
)

/** Как в Android `WalletBalanceDTO` (GET /wallet/balance). */
@Serializable
data class WalletBalanceDto(
    val address: String,
    val balance: String,
    val balance_wei: String? = null,
    val frozen_balance: String? = null,
    val frozen_balance_wei: String? = null,
    val available_balance: String? = null,
    val available_balance_wei: String? = null,
)

@Serializable
data class WalletBalanceEnvelope(
    val success: Boolean = false,
    val data: WalletBalanceDto? = null,
    val error: String? = null,
    val reason: String? = null,
)

/** Как в Android `AddressTxDTO` (GET /address/transactions). */
@Serializable
data class AddressTxDto(
    val txid: String,
    val fromAddress: String,
    val toAddress: String,
    val amount: Long,
    val fee: Long,
    /** null for mempool-only rows (see fullnode `GET /address/transactions`). */
    val blockHeight: Int? = null,
    val timestamp: Long,
    val type: String,
)

@Serializable
data class AddressTxListEnvelope(
    val success: Boolean = false,
    val data: List<AddressTxDto>? = null,
    val error: String? = null,
    val reason: String? = null,
)

/** Элемент `inputs[]` в JSON транзакции из `GET /mempool` (см. `TxInput::toJson`). */
@Serializable
data class MempoolInputDto(
    val address: String = "",
    val amount: Long = 0,
)

/** Элемент `outputs[]` в JSON транзакции из `GET /mempool` (см. `TxOutput::toJson`). */
@Serializable
data class MempoolOutputDto(
    val address: String = "",
    val value: Long = 0,
)

/** Транзакция в mempool (`Transaction::toJson`), для UI достаточно подмножества полей. */
@Serializable
data class MempoolTxDto(
    val txid: String,
    val fee: Long = 0,
    @SerialName("tx_type") val txType: Int = 0,
    val inputs: List<MempoolInputDto> = emptyList(),
    val outputs: List<MempoolOutputDto> = emptyList(),
)

/** Тело `data` ответа `GET /mempool` (см. `ApiServer::handleGetMempool`). */
@Serializable
data class MempoolSnapshotDto(
    val count: Int,
    val totalFees: Long,
    val transactions: List<MempoolTxDto> = emptyList(),
)

@Serializable
data class MempoolEnvelope(
    val success: Boolean = false,
    val data: MempoolSnapshotDto? = null,
    val error: String? = null,
    val reason: String? = null,
)

/** Как Android `MinerStakeInfoDTO` (GET /account/mining_info). Поля опциональны — зависят от has_stake. */
@Serializable
data class MinerStakeInfoDto(
    val address: String = "",
    @SerialName("current_height") val currentHeight: Int = 0,
    @SerialName("miner_stake_active") val minerStakeActive: Boolean = false,
    @SerialName("has_stake") val hasStake: Boolean = false,
    @SerialName("is_pool_stake") val isPoolStake: Boolean? = null,
    @SerialName("stake_type") val stakeType: String? = null,
    @SerialName("pool_bind_active") val poolBindActive: Boolean? = null,
    @SerialName("staked_amount") val stakedAmount: Long? = null,
    @SerialName("staked_amount_formatted") val stakedAmountFormatted: String? = null,
    @SerialName("unlock_block") val unlockBlock: Int? = null,
    @SerialName("blocks_until_unlock") val blocksUntilUnlock: Int? = null,
    @SerialName("freeze_cost_per_hash") val freezeCostPerHash: Long? = null,
    @SerialName("freeze_cost_formatted") val freezeCostFormatted: String? = null,
    @SerialName("total_credits_per_window") val totalCreditsPerWindow: Long? = null,
    @SerialName("used_credits") val usedCredits: Long? = null,
    @SerialName("available_credits") val availableCredits: Long? = null,
    @SerialName("refill_period_blocks") val refillPeriodBlocks: Int? = null,
    @SerialName("last_refill_height") val lastRefillHeight: Int? = null,
    @SerialName("next_refill_height") val nextRefillHeight: Int? = null,
    @SerialName("blocks_until_refill") val blocksUntilRefill: Int? = null,
    @SerialName("min_unstake_block") val minUnstakeBlock: Int? = null,
    @SerialName("can_unstake") val canUnstake: Boolean? = null,
    @SerialName("blocks_until_can_unstake") val blocksUntilCanUnstake: Int? = null,
    @SerialName("min_miner_stake_lock_blocks") val minMinerStakeLockBlocks: Int? = null,
    @SerialName("min_stake_amount") val minStakeAmount: Long? = null,
    @SerialName("min_stake_formatted") val minStakeFormatted: String? = null,
    @SerialName("min_stake_duration") val minStakeDuration: Int? = null,
    @SerialName("max_stake_duration") val maxStakeDuration: Int? = null,
)

@Serializable
data class MinerStakeInfoEnvelope(
    val success: Boolean = false,
    val data: MinerStakeInfoDto? = null,
    val error: String? = null,
    val reason: String? = null,
)

/** Элемент списка GET /validators (ядро полей — как в `ApiServer::handleGetValidators`; остальное опционально). */
@Serializable
data class ValidatorDto(
    @SerialName("node_id") val nodeId: String? = null,
    @SerialName("wallet_address") val walletAddress: String? = null,
    @SerialName("ip") val ip: String? = null,
    @SerialName("port") val port: Int? = null,
    @SerialName("frozen_balance") val frozenBalance: Long = 0L,
    @SerialName("is_active") val isActive: Boolean = false,
    @SerialName("last_heartbeat") val lastHeartbeat: Long? = null,
    @SerialName("api_port") val apiPort: Int? = null,
    @SerialName("active_miner_count") val activeMinerCount: Int? = null,
    @SerialName("miner_capacity") val minerCapacity: Int? = null,
    @SerialName("miner_slots_free") val minerSlotsFree: Int? = null,
    @SerialName("is_overloaded") val isOverloaded: Boolean? = null,
    @SerialName("load_percent") val loadPercent: Int? = null,
)

/** Тело `data` ответа GET /validators (как Android `ValidatorsResponseDTO`). */
@Serializable
data class ValidatorsResponseDto(
    val total: Int,
    val validators: List<ValidatorDto> = emptyList(),
)

@Serializable
data class ValidatorsEnvelope(
    val success: Boolean = false,
    val data: ValidatorsResponseDto? = null,
    val error: String? = null,
    val reason: String? = null,
)

/** GET /mining/stats (как Android `MiningStatsDTO`). */
@Serializable
data class MiningStatsDto(
    val activeMiners: Int = 0,
    val stakedMiners: Int = 0,
    val totalMiners: Int = 0,
    val blocksPerHour: Int = 0,
    val averageHashrate: Double = 0.0,
)

@Serializable
data class MiningStatsEnvelope(
    val success: Boolean = false,
    val data: MiningStatsDto? = null,
    val error: String? = null,
    val reason: String? = null,
)
