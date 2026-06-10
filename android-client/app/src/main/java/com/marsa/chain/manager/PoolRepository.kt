package com.marsa.chain.manager

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.marsa.chain.network.ApiClient
import com.marsa.chain.network.OfficialPoolsListDTO
import com.marsa.chain.network.PoolBackendClient
import com.marsa.chain.network.PoolBindInfo
import com.marsa.chain.network.PoolCatalogWithStats
import com.marsa.chain.network.PoolDashboardResponse
import com.marsa.chain.network.PoolMemberInfo
import com.marsa.chain.network.PoolMembership
import com.marsa.chain.network.PoolOwedInfo
import com.marsa.chain.network.PoolWithdrawRequest
import com.marsa.chain.network.PoolWithdrawResponse
import com.marsa.chain.pool.PoolHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PoolRepository(context: Context) {

    private val appContext = context.applicationContext
    private val connectionManager = ConnectionManager(appContext)
    private val apiClient = ApiClient(appContext)
    private val diskPrefs = appContext.getSharedPreferences("pool_repository_cache", Context.MODE_PRIVATE)
    private val gson = Gson()

    private val bindCache = mutableMapOf<String, PoolBindInfo?>()
    private val memberCache = mutableMapOf<String, PoolMemberInfo?>()

    /** Instant list for UI — memory or disk cache, may be slightly stale. */
    fun peekCachedPools(): List<PoolCatalogWithStats>? {
        val memory = poolsCache?.takeIf { it.isNotEmpty() }
        if (memory != null) return memory
        val disk = loadDiskCache()
        if (disk != null) {
            poolsCache = disk
            poolsCacheTime = diskPrefs.getLong(KEY_POOLS_DISK_CACHE_TIME, System.currentTimeMillis())
        }
        return disk
    }

    fun clearMembershipCache(address: String? = null) {
        if (address.isNullOrBlank()) {
            bindCache.clear()
            memberCache.clear()
        } else {
            val key = address.trim()
            bindCache.remove(key)
            memberCache.remove(key)
        }
    }

    suspend fun refreshMembership(address: String): PoolMembership = withContext(Dispatchers.IO) {
        val key = address.trim()
        val bind = apiClient.getPoolBind(key)
        val member = apiClient.getPoolMember(key)
        bindCache[key] = bind
        memberCache[key] = member
        PoolHelper.resolveMembership(bind, member)
    }

    fun getCachedMembership(address: String, fallbackPoolId: Int? = null): PoolMembership {
        val key = address.trim()
        return PoolHelper.resolveMembership(
            bindCache[key],
            memberCache[key],
            fallbackPoolId
        )
    }

    suspend fun fetchPoolsWithStats(forceNetwork: Boolean = false): List<PoolCatalogWithStats> =
        withContext(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            val cached = poolsCache
            if (!forceNetwork && cached != null && now - poolsCacheTime < STATS_TTL_MS) {
                return@withContext cached
            }
            val nodeCatalog = apiClient.getOfficialPoolsList()
            val backend = fetchBackendPoolStats()
            val merged = mergePoolCatalogs(nodeCatalog, backend)
            if (merged.isNotEmpty()) {
                poolsCache = merged
                poolsCacheTime = now
                if (backendHasStats(backend)) {
                    saveDiskCache(merged, now)
                }
            } else if (cached != null) {
                return@withContext cached
            }
            merged
        }

    private fun poolApiUrls(): List<String> {
        val custom = connectionManager.getPoolApiBaseUrl()?.trim()?.takeIf { it.isNotEmpty() }
            ?.trimEnd('/')
        return buildList {
            if (custom != null) add(custom)
            add(ConnectionManager.DEFAULT_OFFICIAL_POOL_API_BASE)
        }.distinct()
    }

    /** Stats from marsa-pool-api — official VPS first (same as TMA `/api/pool/list`). */
    private suspend fun fetchBackendPoolStats(): List<PoolCatalogWithStats>? {
        val official = PoolBackendClient(ConnectionManager.DEFAULT_OFFICIAL_POOL_API_BASE).fetchPoolList()
        if (!official.isNullOrEmpty()) return official
        for (url in poolApiUrls()) {
            if (url == ConnectionManager.DEFAULT_OFFICIAL_POOL_API_BASE) continue
            val pools = PoolBackendClient(url).fetchPoolList()
            if (!pools.isNullOrEmpty()) return pools
        }
        return null
    }

    private fun backendHasStats(backend: List<PoolCatalogWithStats>?): Boolean {
        if (backend.isNullOrEmpty()) return false
        return backend.any { (it.member_count ?: 0) > 0 || (it.blocks_won_total ?: 0) > 0 }
    }

    /** Node catalog + backend stats overlay — mirrors TMA `mergePoolCatalogs`. */
    private fun mergePoolCatalogs(
        nodeCatalog: OfficialPoolsListDTO?,
        backend: List<PoolCatalogWithStats>?
    ): List<PoolCatalogWithStats> {
        val backendById = (backend ?: emptyList()).associateBy { it.pool_id }
        if (!nodeCatalog?.pools.isNullOrEmpty()) {
            return nodeCatalog!!.pools.map { p ->
                val b = backendById[p.pool_id]
                PoolCatalogWithStats(
                    pool_id = p.pool_id,
                    name = p.name,
                    finder_bps = p.finder_bps,
                    treasury_address = p.treasury_address,
                    member_count = b?.member_count ?: 0,
                    blocks_won_total = b?.blocks_won_total,
                    treasury_balance_wei = b?.treasury_balance_wei,
                    reward_mode = b?.reward_mode,
                    pplnc_n_active = b?.pplnc_n_active,
                    pplnc_rate_ema = b?.pplnc_rate_ema,
                    pplnc_window_fill_pct = b?.pplnc_window_fill_pct,
                    pplnc_window_events = b?.pplnc_window_events,
                    last_round_height = b?.last_round_height,
                    last_pool_block_height = b?.last_pool_block_height
                )
            }
        }
        if (!backend.isNullOrEmpty()) return backend
        return emptyList()
    }

    private fun loadDiskCache(): List<PoolCatalogWithStats>? {
        val json = diskPrefs.getString(KEY_POOLS_DISK_CACHE, null) ?: return null
        val savedAt = diskPrefs.getLong(KEY_POOLS_DISK_CACHE_TIME, 0L)
        if (savedAt <= 0L || System.currentTimeMillis() - savedAt > DISK_CACHE_TTL_MS) return null
        return try {
            val type = object : TypeToken<List<PoolCatalogWithStats>>() {}.type
            gson.fromJson<List<PoolCatalogWithStats>>(json, type)?.takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            null
        }
    }

    private fun saveDiskCache(pools: List<PoolCatalogWithStats>, savedAt: Long) {
        diskPrefs.edit()
            .putString(KEY_POOLS_DISK_CACHE, gson.toJson(pools))
            .putLong(KEY_POOLS_DISK_CACHE_TIME, savedAt)
            .apply()
    }

    suspend fun fetchDashboard(poolId: Int, address: String): PoolDashboardResponse? =
        withContext(Dispatchers.IO) {
            for (url in poolApiUrls()) {
                val dash = PoolBackendClient(url).fetchDashboard(poolId, address)
                if (dash?.pool != null) return@withContext dash
            }
            null
        }

    suspend fun fetchOwed(address: String): PoolOwedInfo? = withContext(Dispatchers.IO) {
        for (url in poolApiUrls()) {
            val owed = PoolBackendClient(url).fetchOwed(address)
            if (owed != null) return@withContext owed
        }
        null
    }

    suspend fun requestWithdraw(req: PoolWithdrawRequest): PoolWithdrawResponse =
        withContext(Dispatchers.IO) {
            val url = poolApiUrls().firstOrNull()
                ?: return@withContext PoolWithdrawResponse(ok = false, error = "Pool API not configured")
            PoolBackendClient(url).requestWithdraw(req)
        }

    fun resetWalletAfterLeave(address: String) {
        PoolModePreferences(appContext).clearPoolChosen(address)
        PoolModePreferences(appContext).clearPoolStakePending()
        clearMembershipCache(address)
    }

    companion object {
        @Volatile
        private var poolsCache: List<PoolCatalogWithStats>? = null

        @Volatile
        private var poolsCacheTime: Long = 0L

        /** Stats refresh interval — catalog is stable, only counts change. */
        private const val STATS_TTL_MS = 3 * 60 * 1000L

        /** Disk cache for instant list on cold start (catalog rarely changes). */
        private const val DISK_CACHE_TTL_MS = 24 * 60 * 60 * 1000L

        private const val KEY_POOLS_DISK_CACHE = "pools_list_json"
        private const val KEY_POOLS_DISK_CACHE_TIME = "pools_list_saved_at"
    }
}
