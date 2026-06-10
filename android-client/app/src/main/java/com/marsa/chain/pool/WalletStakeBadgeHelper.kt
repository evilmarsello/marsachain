package com.marsa.chain.pool

import com.marsa.chain.manager.PoolRepository
import com.marsa.chain.network.ApiClient
import com.marsa.chain.network.MinerStakeInfoDTO

enum class WalletStakeBadgeKind { SOLO, POOL }

object WalletStakeBadgeHelper {

    suspend fun resolveBadgeKind(
        api: ApiClient,
        poolRepository: PoolRepository,
        address: String
    ): WalletStakeBadgeKind? {
        val membership = poolRepository.refreshMembership(address)
        if (membership.active) return WalletStakeBadgeKind.POOL
        val info = api.getMiningInfo(address) ?: return null
        return resolveFromMiningInfo(info)
    }

    fun resolveFromMiningInfo(info: MinerStakeInfoDTO?): WalletStakeBadgeKind? {
        if (info == null || !info.has_stake) return null
        val unlocked = info.unlock_block?.let { info.current_height >= it } == true
        if (unlocked) return null
        return if (PoolHelper.miningInfoIsPoolStake(info)) WalletStakeBadgeKind.POOL else WalletStakeBadgeKind.SOLO
    }
}
