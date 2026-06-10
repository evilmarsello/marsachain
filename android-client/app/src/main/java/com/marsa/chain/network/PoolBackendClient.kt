package com.marsa.chain.network

import android.util.Log
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** HTTP client for marsa-pool-api (pool REST endpoints). */
class PoolBackendClient(private val baseUrl: String?) {

    private val tag = "PoolBackendClient"
    private val gson = Gson()
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private fun root(): String? {
        val raw = baseUrl?.trim().orEmpty()
        if (raw.isEmpty()) return null
        return if (raw.endsWith("/")) raw.dropLast(1) else raw
    }

    suspend fun fetchPoolList(): List<PoolCatalogWithStats>? = withContext(Dispatchers.IO) {
        val base = root() ?: return@withContext null
        val resp = getJson("$base/list", PoolBackendListResponse::class.java) ?: return@withContext null
        if (!resp.ok) return@withContext null
        resp.pools?.takeIf { it.isNotEmpty() }
    }

    suspend fun fetchDashboard(poolId: Int, address: String): PoolDashboardResponse? = withContext(Dispatchers.IO) {
        val base = root() ?: return@withContext null
        val trimmed = address.trim()
        val q = if (trimmed.isNotEmpty()) "?address=${java.net.URLEncoder.encode(trimmed, "UTF-8")}" else ""
        getJson("$base/$poolId/dashboard$q", PoolDashboardResponse::class.java)
            ?.takeIf { it.pool != null }
            ?: getJson("$base/$poolId", PoolDashboardResponse::class.java)?.takeIf { it.pool != null }
    }

    suspend fun fetchOwed(address: String): PoolOwedInfo? = withContext(Dispatchers.IO) {
        val base = root() ?: return@withContext null
        val trimmed = address.trim()
        if (trimmed.isEmpty()) return@withContext null
        getJson(
            "$base/owed/${java.net.URLEncoder.encode(trimmed, "UTF-8")}",
            PoolOwedInfo::class.java
        )?.takeIf { it.ok }
    }

    suspend fun requestWithdraw(req: PoolWithdrawRequest): PoolWithdrawResponse = withContext(Dispatchers.IO) {
        val base = root() ?: return@withContext PoolWithdrawResponse(ok = false, error = "Pool API not configured")
        try {
            val body = gson.toJson(req).toRequestBody(jsonType)
            val request = Request.Builder().url("$base/withdraw/request").post(body).build()
            client.newCall(request).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                val parsed = gson.fromJson(text, PoolWithdrawResponse::class.java)
                parsed ?: PoolWithdrawResponse(ok = false, error = "Invalid response")
            }
        } catch (e: Exception) {
            Log.e(tag, "requestWithdraw error: ${e.message}", e)
            PoolWithdrawResponse(ok = false, error = e.message ?: "Network error")
        }
    }

    private fun <T> getJson(url: String, clazz: Class<T>): T? {
        return try {
            val request = Request.Builder().url(url).get().build()
            client.newCall(request).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful || text.isEmpty()) return null
                gson.fromJson(text, clazz)
            }
        } catch (e: Exception) {
            Log.e(tag, "GET $url error: ${e.message}", e)
            null
        }
    }
}
