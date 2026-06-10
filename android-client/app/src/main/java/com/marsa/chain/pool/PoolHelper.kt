package com.marsa.chain.pool

import com.marsa.chain.network.MinerStakeInfoDTO
import com.marsa.chain.network.PoolBindInfo
import com.marsa.chain.network.PoolMemberInfo
import com.marsa.chain.network.PoolMembership

object PoolHelper {

    val officialPoolNames = mapOf(
        0 to "Pool Equal",
        1 to "Pool 5%",
        2 to "Pool 10%",
        3 to "Pool 20%",
        4 to "Pool 50%"
    )

    fun poolBindIsActive(bind: PoolBindInfo?): Boolean {
        if (bind == null || bind.status != "active") return false
        return (bind.join_height ?: 0) > 0
    }

    fun isActivePoolMembership(bind: PoolBindInfo?, member: PoolMemberInfo?): Boolean {
        if (poolBindIsActive(bind)) return true
        if (member?.status == "active" && (member.join_height ?: 0) > 0) return true
        return false
    }

    fun activePoolIdFromChain(bind: PoolBindInfo?, member: PoolMemberInfo?): Int? {
        if (!isActivePoolMembership(bind, member)) return null
        val id = bind?.pool_id ?: member?.pool_id ?: return null
        return if (id in 0 until 5) id else null
    }

    fun resolveMembership(
        bind: PoolBindInfo?,
        member: PoolMemberInfo?,
        fallbackPoolId: Int? = null
    ): PoolMembership {
        val poolId = activePoolIdFromChain(bind, member) ?: fallbackPoolId
        return PoolMembership(
            bind = bind,
            member = member,
            active = poolId != null,
            poolId = poolId
        )
    }

    fun miningInfoIsPoolStake(info: MinerStakeInfoDTO?): Boolean {
        if (info == null) return false
        if (info.is_pool_stake == true) return true
        if (info.pool_bind_active == true) return true
        return info.stake_type?.equals("pool", ignoreCase = true) == true
    }

    fun hasSoloMinerStakeOnly(
        info: MinerStakeInfoDTO?,
        membership: PoolMembership? = null,
        poolStakePending: Boolean = false
    ): Boolean {
        if (poolStakePending) return false
        if (info == null || !info.has_stake) return false
        if (miningInfoIsPoolStake(info)) return false
        if (membership?.active == true) return false
        return true
    }

    fun hasOrphanPoolStake(
        info: MinerStakeInfoDTO?,
        membership: PoolMembership? = null,
        poolStakePending: Boolean = false
    ): Boolean {
        if (poolStakePending) return false
        if (info == null || !info.has_stake) return false
        if (membership?.active == true) return false
        return miningInfoIsPoolStake(info)
    }

    fun canMineInPoolMode(info: MinerStakeInfoDTO?, membership: PoolMembership?): Boolean {
        if (membership?.active != true) return false
        if (info == null || !info.has_stake) return false
        return (info.available_credits ?: 0) > 0
    }

    fun canMineInSoloMode(info: MinerStakeInfoDTO?, membership: PoolMembership?): Boolean {
        if (membership?.active == true) return false
        if (miningInfoIsPoolStake(info)) return false
        if (info == null || !info.has_stake) return false
        return (info.available_credits ?: 0) > 0
    }

    fun formatFinderBps(bps: Int): String {
        if (bps <= 0) return "0%"
        return if (bps % 100 == 0) "${bps / 100}%" else "${bps / 100.0}%"
    }

    fun displayPoolName(poolId: Int, apiName: String): String =
        officialPoolNames[poolId] ?: apiName.ifBlank { "Pool $poolId" }
}
