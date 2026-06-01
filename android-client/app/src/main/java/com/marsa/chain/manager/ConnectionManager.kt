package com.marsa.chain.manager

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** Validator node with load (pick least loaded). */
data class ValidatorNodeInfo(
    val ip: String,
    val apiPort: Int,
    val activeMinerCount: Int = 0,
    val minerCapacity: Int = 150,
    val minerSlotsFree: Int = 150,
    val isActive: Boolean = true,
    val isOverloaded: Boolean = false,
    val loadPercent: Int = 0
) {
    val url: String get() = "http://$ip:$apiPort/"
    /** Legacy format "host:PORT". */
    val hostPort: String get() = "$ip:$apiPort"
}

class ConnectionManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("connection_prefs", Context.MODE_PRIVATE)
    
    companion object {
        private const val KEY_CONNECTION_MODE = "connection_mode" // "auto" or "manual"
        private const val KEY_MANUAL_IP = "manual_ip"
        private const val KEY_AUTO_IPS = "auto_ips" // JSON array of IPs
        private const val KEY_VALIDATOR_NODES = "validator_nodes" // JSON array of ValidatorNodeInfo
        private const val KEY_SELECTED_AUTO_IP = "selected_auto_ip" // Selected IP in auto mode
        private const val KEY_AUTO_SELECT_ENABLED = "auto_select_enabled" // Auto-select working IP
        
        private val DEFAULT_AUTO_IPS = emptyList<String>()
    }
    
    enum class ConnectionMode {
        AUTO, MANUAL
    }
    
    fun getConnectionMode(): ConnectionMode {
        val mode = prefs.getString(KEY_CONNECTION_MODE, "auto") ?: "auto"
        return if (mode == "manual") ConnectionMode.MANUAL else ConnectionMode.AUTO
    }
    
    fun setConnectionMode(mode: ConnectionMode) {
        prefs.edit().putString(KEY_CONNECTION_MODE, if (mode == ConnectionMode.MANUAL) "manual" else "auto").apply()
    }
    
    fun getManualIp(): String {
        return prefs.getString(KEY_MANUAL_IP, "") ?: ""
    }
    
    fun setManualConnection(ip: String) {
        prefs.edit()
            .putString(KEY_MANUAL_IP, ip)
            .apply()
    }
    
    fun getAutoIps(): List<String> {
        val json = prefs.getString(KEY_AUTO_IPS, null)
        if (json == null || json.isEmpty()) {
            // If none saved, return defaults
            setAutoIps(DEFAULT_AUTO_IPS)
            return DEFAULT_AUTO_IPS
        }
        return try {
            val array = org.json.JSONArray(json)
            (0 until array.length()).map { array.getString(it) }
        } catch (e: Exception) {
            DEFAULT_AUTO_IPS
        }
    }
    
    fun setAutoIps(ips: List<String>) {
        prefs.edit().putString(KEY_AUTO_IPS, JSONArray(ips).toString()).apply()
    }

    /** Validator list with load (fetched from node via Load from node). */
    fun getValidatorNodes(): List<ValidatorNodeInfo> {
        val json = prefs.getString(KEY_VALIDATOR_NODES, null) ?: return emptyList()
        return try {
            val arr = JSONArray(json)
            (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                ValidatorNodeInfo(
                    ip = o.optString("ip", ""),
                    apiPort = o.optInt("api_port", 80),
                    activeMinerCount = o.optInt("active_miner_count", 0),
                    minerCapacity = o.optInt("miner_capacity", 150),
                    minerSlotsFree = o.optInt("miner_slots_free", 150),
                    isActive = o.optBoolean("is_active", true),
                    isOverloaded = o.optBoolean("is_overloaded", false),
                    loadPercent = o.optInt("load_percent", 0)
                )
            }.filter { it.ip.isNotEmpty() }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun setValidatorNodes(nodes: List<ValidatorNodeInfo>) {
        val arr = JSONArray()
        nodes.forEach { n ->
            arr.put(JSONObject().apply {
                put("ip", n.ip)
                put("api_port", n.apiPort)
                put("active_miner_count", n.activeMinerCount)
                put("miner_capacity", n.minerCapacity)
                put("miner_slots_free", n.minerSlotsFree)
                put("is_active", n.isActive)
                put("is_overloaded", n.isOverloaded)
                put("load_percent", n.loadPercent)
            })
        }
        prefs.edit().putString(KEY_VALIDATOR_NODES, arr.toString()).apply()
        // By default external connections use host without explicit port (80/443 via proxy).
        setAutoIps(nodes.map { it.ip })
    }
    
    fun getSelectedAutoIp(): String? {
        return prefs.getString(KEY_SELECTED_AUTO_IP, null)
    }
    
    fun setSelectedAutoIp(ip: String?) {
        if (ip != null) {
            prefs.edit().putString(KEY_SELECTED_AUTO_IP, ip).apply()
        } else {
            prefs.edit().remove(KEY_SELECTED_AUTO_IP).apply()
        }
    }
    
    fun isAutoSelectEnabled(): Boolean {
        return prefs.getBoolean(KEY_AUTO_SELECT_ENABLED, true) // Enabled by default
    }
    
    fun setAutoSelectEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_AUTO_SELECT_ENABLED, enabled).apply()
    }
    
    fun getCurrentBaseUrl(): String {
        fun toBaseUrl(endpoint: String): String {
            val value = endpoint.trim()
            if (value.isEmpty()) return "http://10.0.2.2/"
            val withScheme = if (value.startsWith("http://") || value.startsWith("https://")) value else "http://$value"
            return if (withScheme.endsWith("/")) withScheme else "$withScheme/"
        }
        return when (getConnectionMode()) {
            ConnectionMode.MANUAL -> {
                val ip = getManualIp()
                if (ip.isNotEmpty()) toBaseUrl(ip)
                else getAutoIps().firstOrNull()?.let { toBaseUrl(it) } ?: "http://10.0.2.2/"
            }
            ConnectionMode.AUTO -> {
                if (!isAutoSelectEnabled()) {
                    val selectedIp = getSelectedAutoIp()
                    if (selectedIp != null && getAutoIps().contains(selectedIp)) {
                        return toBaseUrl(selectedIp)
                    }
                }
                val selectedIp = getSelectedAutoIp()
                if (selectedIp != null && getAutoIps().contains(selectedIp)) {
                    return toBaseUrl(selectedIp)
                }
                // Auto-select: when validator list exists pick least loaded (most free slots)
                val nodes = getValidatorNodes()
                if (nodes.isNotEmpty()) {
                    val best = nodes.filter { it.isActive && !it.isOverloaded }.maxByOrNull { it.minerSlotsFree }
                    if (best != null) return toBaseUrl(best.ip)
                    nodes.firstOrNull()?.let { toBaseUrl(it.ip) } ?: getAutoIps().firstOrNull()?.let { toBaseUrl(it) } ?: "http://10.0.2.2/"
                } else {
                    getAutoIps().firstOrNull()?.let { toBaseUrl(it) } ?: "http://10.0.2.2/"
                }
            }
        }
    }

    /** All mining node candidates: manual — one node, auto — all in list. Used to pick a node with an active validator. */
    fun getCandidateBaseUrls(): List<String> {
        fun toBaseUrl(endpoint: String): String {
            val value = endpoint.trim()
            if (value.isEmpty()) return "http://10.0.2.2/"
            val withScheme = if (value.startsWith("http://") || value.startsWith("https://")) value else "http://$value"
            return if (withScheme.endsWith("/")) withScheme else "$withScheme/"
        }
        return when (getConnectionMode()) {
            ConnectionMode.MANUAL -> {
                val ip = getManualIp()
                if (ip.isNotEmpty()) listOf(toBaseUrl(ip)) else getAutoIps().map { toBaseUrl(it) }
            }
            ConnectionMode.AUTO -> getAutoIps().map { toBaseUrl(it) }
        }
    }
}

