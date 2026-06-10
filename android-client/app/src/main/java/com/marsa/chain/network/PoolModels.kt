package com.marsa.chain.network

/** Official pool catalog item (GET /pool/official/list). */
data class OfficialPoolCatalogItem(
    val pool_id: Int = 0,
    val name: String = "",
    val finder_bps: Int = 0,
    val treasury_address: String = ""
)

data class OfficialPoolsListDTO(
    val pools: List<OfficialPoolCatalogItem> = emptyList(),
    val epoch_blocks: Int? = null
)

/** GET /pool/bind/{address} */
data class PoolBindInfo(
    val pool_id: Int? = null,
    val join_height: Int? = null,
    val status: String? = null,
    val treasury_address_snapshot: String? = null,
    val finder_bps_snapshot: Int? = null,
    val count_at_join: Int? = null,
    val stake_amount_wei: Long? = null,
    val unlock_block: Int? = null,
    val leave_height: Int? = null
)

/** GET /pool/member/{address} */
data class PoolMemberInfo(
    val address: String? = null,
    val pool_id: Int? = null,
    val join_height: Int? = null,
    val status: String? = null,
    val challenge_count: Int? = null,
    val stake_active: Boolean? = null,
    val current_height: Int? = null
)

data class PoolMembership(
    val bind: PoolBindInfo? = null,
    val member: PoolMemberInfo? = null,
    val active: Boolean = false,
    val poolId: Int? = null
)

/** marsa-pool-api catalog with stats. */
data class PoolCatalogWithStats(
    val pool_id: Int = 0,
    val name: String = "",
    val finder_bps: Int = 0,
    val treasury_address: String = "",
    val member_count: Int? = null,
    val blocks_won_total: Int? = null,
    val treasury_balance_wei: String? = null,
    val reward_mode: String? = null,
    val pplnc_n_active: Int? = null,
    val pplnc_rate_ema: Double? = null,
    val pplnc_window_fill_pct: Double? = null,
    val pplnc_window_events: Int? = null,
    val last_round_height: Int? = null,
    val last_pool_block_height: Int? = null
)

data class PoolBackendListResponse(
    val ok: Boolean = false,
    val pools: List<PoolCatalogWithStats>? = null,
    val epoch_blocks: Int? = null
)

data class PoolDashboardMiner(
    val address: String? = null,
    val is_member: Boolean? = null,
    val is_this_pool: Boolean? = null,
    val join_height: Int? = null,
    val count_at_join: Int? = null,
    val challenge_count: Int? = null,
    val credit_delta: Int? = null,
    val blocks_mined_by_you_since_join: Int? = null,
    val owed_wei: String? = null,
    val payout_net_wei: String? = null,
    val withdraw_fee_wei: String? = null,
    val can_withdraw: Boolean? = null,
    val withdraw_reasons: List<String>? = null,
    val stake_active: Boolean? = null
)

data class PoolDashboardResponse(
    val ok: Boolean = false,
    val pool: PoolCatalogWithStats? = null,
    val miner: PoolDashboardMiner? = null
)

data class PoolOwedInfo(
    val ok: Boolean = false,
    val miner_address: String? = null,
    val pool_id: Int? = null,
    val owed_wei: String? = null,
    val payout_net_wei: String? = null,
    val withdraw_fee_wei: String? = null,
    val can_withdraw: Boolean? = null,
    val reasons: List<String>? = null
)

data class PoolWithdrawRequest(
    val miner_address: String,
    val pool_id: Int,
    val signature: String,
    val pub_key: String,
    val nonce: String
)

data class PoolWithdrawResponse(
    val ok: Boolean = false,
    val withdrawal_id: Int? = null,
    val amount_wei: String? = null,
    val status: String? = null,
    val error: String? = null,
    val reasons: List<String>? = null
)

object PoolConstants {
    const val OFFICIAL_POOL_COUNT = 5
    const val POOL_STAKE_TX_TYPE = 13
    const val POOL_UNSTAKE_TX_TYPE = 14
    const val POOL_STAKE_FEE_WEI = 100_000_000L // 1 MRS
    const val POOL_UNSTAKE_FEE_WEI = 100_000_000L
    const val POOL_LOCK_BLOCKS = 10_000
    const val MIN_POOL_STAKE_WEI = 100L * 100_000_000L // 100 MRS

    fun withdrawSignMessage(address: String, poolId: Int, amountWei: String, nonce: String): String =
        "marsa:pool:withdraw:$address:$poolId:$amountWei:$nonce"
}
