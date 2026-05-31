package com.marsa.chain.fragments

import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentStatisticsBinding
import com.marsa.chain.network.ApiClient
import com.marsa.chain.utils.ChainEmission
import com.marsa.chain.utils.CoinFormatter
import kotlinx.coroutines.launch

class StatisticsFragment : Fragment() {
    private var _binding: FragmentStatisticsBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var api: ApiClient
    private lateinit var prefs: SharedPreferences
    private var blocksMined = 0
    private var totalRewards = 0L

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentStatisticsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        // Initialize components
        api = ApiClient(requireContext())
        prefs = requireContext().getSharedPreferences("mining_stats", Context.MODE_PRIVATE)
        
        setupUI()
        loadData()

        binding.btnResetLocalMiningStats.setOnClickListener {
            showResetLocalMiningStatsConfirmDialog()
        }
    }
    
    override fun onResume() {
        super.onResume()
        // Update API client with latest connection settings
        api.updateBaseUrl(requireContext())
        blocksMined = prefs.getInt("blocks_mined", 0)
        totalRewards = prefs.getLong("total_rewards", 0L)
        updateStats()
        // Refresh data when fragment becomes visible
        loadData()
    }

    private fun setupUI() {
        // Load saved stats
        blocksMined = prefs.getInt("blocks_mined", 0)
        totalRewards = prefs.getLong("total_rewards", 0L)
        
        // Update stats display
        updateStats()
    }

    private fun loadData() {
        lifecycleScope.launch {
            try {
                val status = api.getStatus()
                if (status != null) {
                    binding.networkHeightText.text = status["height"].toString()
                    val height = parseChainHeight(status["height"])
                    binding.emissionProgressText.text =
                        if (height >= 0) ChainEmission.emissionProgressLabel(height) else "—"
                } else {
                    binding.emissionProgressText.text = "—"
                }
                
                // Load mining stats
                val miningStats = api.getMiningStats()
                if (miningStats != null) {
                    binding.activeMinersText.text = miningStats.activeMiners.toString()
                    binding.totalMinersText.text = miningStats.totalMiners.toString()
                    binding.blocksPerHourText.text = miningStats.blocksPerHour.toString()
                    binding.averageHashrateText.text = formatHashrate(miningStats.averageHashrate)
                }
            } catch (e: Exception) {
                // Handle error silently
            }
        }
    }

    private fun parseChainHeight(raw: Any?): Int {
        if (raw == null) return -1
        val h = when (raw) {
            is Int -> raw
            is Long -> raw.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
            is Double -> raw.toLong().coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
            is String -> raw.toIntOrNull() ?: return -1
            else -> return -1
        }
        return if (h >= 0) h else -1
    }

    private fun updateStats() {
        binding.blocksMinedText.text = blocksMined.toString()
        binding.totalRewardsText.text = CoinFormatter.format(totalRewards)
    }

    private fun showResetLocalMiningStatsConfirmDialog() {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_reset_local_mining_stats, null, false)
        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.setCanceledOnTouchOutside(true)
        dialogView.findViewById<TextView>(R.id.btnStatsResetClose).setOnClickListener { dialog.dismiss() }
        dialogView.findViewById<TextView>(R.id.btnStatsResetCancel).setOnClickListener { dialog.dismiss() }
        dialogView.findViewById<TextView>(R.id.btnStatsResetConfirm).setOnClickListener {
            resetLocalMiningStats()
            dialog.dismiss()
        }
        dialog.show()
    }

    /** Clears device-local counters in SharedPreferences; does not change the network. */
    private fun resetLocalMiningStats() {
        blocksMined = 0
        totalRewards = 0L
        prefs.edit()
            .putInt("blocks_mined", 0)
            .putLong("total_rewards", 0L)
            .apply()
        updateStats()
    }

    // Methods to update stats from MiningFragment
    fun updateMiningStats(blocks: Int, rewards: Long) {
        blocksMined = blocks
        totalRewards = rewards
        
        // Save to SharedPreferences
        prefs.edit()
            .putInt("blocks_mined", blocksMined)
            .putLong("total_rewards", totalRewards)
            .apply()
            
        updateStats()
    }

    private fun formatHashrate(hashrate: Double): String {
        return when {
            hashrate >= 1e18 -> "${(hashrate / 1e18).toInt()} EH/s"
            hashrate >= 1e15 -> "${(hashrate / 1e15).toInt()} PH/s"
            hashrate >= 1e12 -> "${(hashrate / 1e12).toInt()} TH/s"
            hashrate >= 1e9 -> "${(hashrate / 1e9).toInt()} GH/s"
            hashrate >= 1e6 -> "${(hashrate / 1e6).toInt()} MH/s"
            hashrate >= 1e3 -> "${(hashrate / 1e3).toInt()} KH/s"
            else -> "${hashrate.toInt()} H/s"
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
