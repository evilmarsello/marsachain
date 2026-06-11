package com.marsa.chain.fragments

import android.app.AlertDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.marsa.chain.MainActivity
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentPoolDetailBinding
import com.marsa.chain.manager.PoolModePreferences
import com.marsa.chain.manager.PoolRepository
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.network.ApiClient
import com.marsa.chain.network.PoolCatalogWithStats
import com.marsa.chain.network.PoolConstants
import com.marsa.chain.network.PoolDashboardMiner
import com.marsa.chain.network.PoolDashboardResponse
import com.marsa.chain.network.PoolTransactionBuilder
import com.marsa.chain.network.PoolWithdrawRequest
import com.marsa.chain.pool.PoolHelper
import com.marsa.chain.utils.CoinFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

class PoolDetailFragment : Fragment() {

    private var _binding: FragmentPoolDetailBinding? = null
    private val binding get() = _binding!!

    private lateinit var poolRepository: PoolRepository
    private lateinit var walletManager: WalletManager
    private lateinit var poolModePrefs: PoolModePreferences
    private lateinit var api: ApiClient

    private var poolId: Int = 0
    private var poolName: String = ""
    private var fallbackPool: PoolCatalogWithStats? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        poolId = arguments?.getInt(ARG_POOL_ID) ?: 0
        poolName = arguments?.getString(ARG_POOL_NAME).orEmpty()
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPoolDetailBinding.inflate(inflater, container, false)
        poolRepository = PoolRepository(requireContext())
        walletManager = WalletManager(requireContext())
        poolModePrefs = PoolModePreferences(requireContext())
        api = ApiClient(requireContext())
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        (requireActivity() as? MainActivity)?.showBackButton(
            poolName.ifBlank { PoolHelper.displayPoolName(poolId, "") }
        )
        fallbackPool = poolRepository.peekCachedPools()?.find { it.pool_id == poolId }
        fallbackPool?.let { paintPoolStats(it) }
        binding.poolJoinButton.setOnClickListener { onJoinPoolClicked() }
        binding.poolLeaveButton.setOnClickListener { showLeaveDialog() }
        binding.poolWithdrawButton.setOnClickListener { requestWithdraw() }
        refresh(showRefreshing = fallbackPool == null)
    }

    private fun refresh(showRefreshing: Boolean) {
        if (showRefreshing) {
            binding.poolDetailStatus.visibility = View.VISIBLE
            binding.poolDetailStatus.text = getString(R.string.common_loading)
        }
        viewLifecycleOwner.lifecycleScope.launch {
            api.updateBaseUrl(requireContext())
            val wallet = withContext(Dispatchers.IO) { walletManager.getActiveWallet() }
            if (wallet == null) {
                if (_binding == null) return@launch
                binding.poolDetailStatus.text = getString(R.string.alert_no_active_wallet)
                binding.poolDetailStatus.visibility = View.VISIBLE
                binding.poolJoinButton.isEnabled = false
                return@launch
            }
            val membership = withContext(Dispatchers.IO) {
                poolRepository.refreshMembership(wallet.address)
            }
            val dashboard = withContext(Dispatchers.IO) {
                poolRepository.fetchDashboard(poolId, wallet.address)
            }
            val currentHeight = withContext(Dispatchers.IO) {
                val status = api.getStatus()
                (status?.get("height") as? Number)?.toInt() ?: 0
            }
            if (_binding == null) return@launch
            binding.poolDetailStatus.visibility = View.GONE
            if (dashboard?.pool != null) {
                applyDashboard(dashboard, wallet.address, membership.poolId, currentHeight)
            } else if (fallbackPool != null) {
                binding.poolDetailStatus.visibility = View.VISIBLE
                binding.poolDetailStatus.text = getString(R.string.pool_detail_refresh_failed)
                paintJoinButton(wallet.address, membership.poolId)
            } else {
                binding.poolDetailStatus.visibility = View.VISIBLE
                binding.poolDetailStatus.text = getString(R.string.pools_load_failed)
            }
        }
    }

    private fun applyDashboard(
        dash: PoolDashboardResponse,
        walletAddress: String,
        activePoolId: Int?,
        currentHeight: Int
    ) {
        val pool = dash.pool ?: return
        paintPoolStats(enrichPoolStats(pool, fallbackPool))
        paintMinerSection(dash.miner, walletAddress)
        paintJoinButton(walletAddress, activePoolId)
        paintFooter(dash.miner, walletAddress, currentHeight)
    }

    /** Prefer non-zero stats from list cache when dashboard omits counts (TMA parity). */
    private fun enrichPoolStats(
        pool: PoolCatalogWithStats,
        fallback: PoolCatalogWithStats?
    ): PoolCatalogWithStats {
        if (fallback == null || fallback.pool_id != pool.pool_id) return pool
        return pool.copy(
            member_count = pool.member_count?.takeIf { it > 0 } ?: fallback.member_count,
            blocks_won_total = pool.blocks_won_total?.takeIf { it > 0 } ?: fallback.blocks_won_total,
            treasury_balance_wei = pool.treasury_balance_wei?.takeIf { it.isNotBlank() && it != "0" }
                ?: fallback.treasury_balance_wei,
            last_pool_block_height = pool.last_pool_block_height?.takeIf { it > 0 }
                ?: fallback.last_pool_block_height,
            pplnc_window_fill_pct = pool.pplnc_window_fill_pct ?: fallback.pplnc_window_fill_pct
        )
    }

    private fun paintPoolStats(pool: PoolCatalogWithStats) {
        binding.poolStatsContainer.removeAllViews()
        addStat(binding.poolStatsContainer, getString(R.string.pool_stat_miners), (pool.member_count ?: 0).toString())
        addStat(binding.poolStatsContainer, getString(R.string.pool_blocks_won_total), (pool.blocks_won_total ?: 0).toString())
        val treasury = pool.treasury_balance_wei?.let { CoinFormatter.format(it.toLongOrNull() ?: 0L) } ?: "0"
        addStat(binding.poolStatsContainer, getString(R.string.pool_treasury_balance), "$treasury MRS")
        val lastBlock = pool.last_pool_block_height?.takeIf { it > 0 }
        val lastBlockText = if (lastBlock != null) {
            getString(R.string.pool_last_round_at, lastBlock)
        } else {
            getString(R.string.pool_last_round_none)
        }
        addStat(binding.poolStatsContainer, getString(R.string.pool_last_round_label), lastBlockText)
        val windowPct = pool.pplnc_window_fill_pct
        if (windowPct != null) {
            binding.poolDetailWindowFill.visibility = View.VISIBLE
            binding.poolDetailWindowFill.text = getString(R.string.pool_window_fill, windowPct)
        } else {
            binding.poolDetailWindowFill.visibility = View.GONE
        }
        binding.poolDetailFinderMeta.text = if (pool.finder_bps > 0) {
            getString(R.string.pools_finder_bonus, PoolHelper.formatFinderBps(pool.finder_bps))
        } else {
            getString(R.string.pools_finder_equal)
        }
    }

    private fun paintMinerSection(miner: PoolDashboardMiner?, walletAddress: String) {
        binding.poolMinerContainer.removeAllViews()
        binding.poolBalanceCard.visibility = View.GONE
        binding.poolMinerShareHint.visibility = View.GONE
        if (miner?.is_this_pool == true) {
            binding.poolMinerNotInPool.visibility = View.GONE
            binding.poolMinerShareHint.visibility = View.VISIBLE
            binding.poolMinerShareHint.text = getString(R.string.pool_share_hint)
            binding.poolMinerShareHint.setTextColor(0xFF8E8E93.toInt())
            addStat(
                binding.poolMinerContainer,
                getString(R.string.pool_your_taps),
                (miner.credit_delta ?: 0).toString()
            )
            addStat(
                binding.poolMinerContainer,
                getString(R.string.pool_blocks_mined_by_you),
                (miner.blocks_mined_by_you_since_join ?: 0).toString()
            )
            val owed = miner.owed_wei?.let { CoinFormatter.format(it.toLongOrNull() ?: 0L) } ?: "0"
            binding.poolBalanceCard.visibility = View.VISIBLE
            binding.poolBalanceValue.text = "$owed MRS"
            binding.poolBalanceSub.text = getString(R.string.pool_balance_simple, owed)
        } else {
            binding.poolMinerNotInPool.visibility = View.GONE
            binding.poolMinerShareHint.visibility = View.VISIBLE
            binding.poolMinerShareHint.text = getString(R.string.pool_not_in_this_pool)
            binding.poolMinerShareHint.setTextColor(0xFF8E8E93.toInt())
        }
    }

    private fun paintJoinButton(walletAddress: String, activePoolId: Int?) {
        val chosen = poolModePrefs.getChosenPoolId(walletAddress) == poolId
        val inOther = activePoolId != null && activePoolId != poolId
        val inThisPool = activePoolId == poolId
        when {
            inThisPool || chosen -> {
                binding.poolJoinButton.visibility = View.GONE
            }
            inOther -> {
                binding.poolJoinButton.visibility = View.VISIBLE
                binding.poolJoinButton.text = getString(R.string.pools_join_mining_pool)
                binding.poolJoinButton.setBackgroundResource(R.drawable.pool_join_button_background)
                binding.poolJoinButton.setTextColor(0xFFFFFFFF.toInt())
                binding.poolJoinButton.isEnabled = false
                binding.poolJoinButton.alpha = 0.5f
            }
            else -> {
                binding.poolJoinButton.visibility = View.VISIBLE
                binding.poolJoinButton.text = getString(R.string.pools_join_mining_pool)
                binding.poolJoinButton.setBackgroundResource(R.drawable.pool_join_button_background)
                binding.poolJoinButton.setTextColor(0xFFFFFFFF.toInt())
                binding.poolJoinButton.isEnabled = true
                binding.poolJoinButton.alpha = 1f
            }
        }
    }

    private fun onJoinPoolClicked() {
        viewLifecycleOwner.lifecycleScope.launch {
            val wallet = withContext(Dispatchers.IO) { walletManager.getActiveWallet() } ?: return@launch
            val membership = withContext(Dispatchers.IO) {
                poolRepository.refreshMembership(wallet.address)
            }
            if (membership.active && membership.poolId != null && membership.poolId != poolId) {
                Toast.makeText(requireContext(), getString(R.string.pools_already_in_other_pool), Toast.LENGTH_LONG).show()
                return@launch
            }
            poolModePrefs.markPoolChosen(wallet.address, poolId)
            poolModePrefs.setMiningMode(PoolModePreferences.MiningMode.POOL)
            Toast.makeText(requireContext(), getString(R.string.pools_selected_pool, poolName), Toast.LENGTH_SHORT).show()
            paintJoinButton(wallet.address, membership.poolId)
        }
    }

    private fun paintFooter(miner: PoolDashboardMiner?, walletAddress: String, currentHeight: Int) {
        if (miner?.is_this_pool != true) {
            binding.poolDetailFooter.visibility = View.GONE
            return
        }
        binding.poolDetailFooter.visibility = View.VISIBLE
        val joinHeight = miner.join_height ?: 0
        val unlockBlock = if (joinHeight > 0) joinHeight + POOL_MIN_LOCK_BLOCKS else 0
        val lockElapsed = unlockBlock > 0 && currentHeight >= unlockBlock
        val owedGross = miner.owed_wei?.toLongOrNull() ?: 0L
        val canWithdraw = lockElapsed && miner.can_withdraw == true && owedGross > 0L

        binding.poolWithdrawButton.isEnabled = canWithdraw
        binding.poolWithdrawButton.alpha = if (canWithdraw) 1f else 0.45f
        binding.poolWithdrawHint.text = when {
            !lockElapsed && unlockBlock > 0 ->
                getString(R.string.pool_withdraw_locked_until, unlockBlock)
            canWithdraw -> {
                val short = if (walletAddress.length > 14) {
                    "${walletAddress.take(8)}…${walletAddress.takeLast(6)}"
                } else walletAddress
                getString(R.string.pool_withdraw_to_active_wallet, short)
            }
            else -> getString(R.string.pools_owed_cannot_withdraw)
        }

        binding.poolLeaveButton.isEnabled = lockElapsed
        binding.poolLeaveButton.alpha = if (lockElapsed) 1f else 0.45f
        binding.poolUnstakeHint.text = if (!lockElapsed && unlockBlock > 0) {
            getString(R.string.pool_unstake_locked_until, unlockBlock)
        } else {
            ""
        }
        binding.poolUnstakeHint.visibility =
            if (binding.poolUnstakeHint.text.isNullOrEmpty()) View.GONE else View.VISIBLE
    }

    private fun addStat(container: LinearLayout, label: String, value: String) {
        val row = layoutInflater.inflate(R.layout.pool_detail_stat_row, container, false)
        row.findViewById<TextView>(R.id.poolStatLabel).text = label
        row.findViewById<TextView>(R.id.poolStatValue).text = value
        container.addView(row)
    }

    private fun showLeaveDialog() {
        AlertDialog.Builder(requireContext())
            .setTitle(getString(R.string.pool_leave_title))
            .setMessage(R.string.pool_leave_hint)
            .setNegativeButton(R.string.common_cancel, null)
            .setPositiveButton(R.string.pool_leave) { _, _ -> submitPoolLeave() }
            .show()
    }

    private fun submitPoolLeave() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val wallet = withContext(Dispatchers.IO) { walletManager.getActiveWallet() } ?: return@launch
                val membership = withContext(Dispatchers.IO) {
                    poolRepository.refreshMembership(wallet.address)
                }
                val pid = membership.poolId ?: poolId
                val status = api.getStatus()
                val height = (status?.get("height") as? Number)?.toInt() ?: 0
                val tx = PoolTransactionBuilder.buildMinerPoolUnstake(
                    from = wallet.address,
                    publicKey = wallet.publicKey,
                    privateKey = wallet.privateKey,
                    poolId = pid,
                    feeWei = PoolConstants.POOL_UNSTAKE_FEE_WEI,
                    currentHeight = height
                )
                Toast.makeText(requireContext(), getString(R.string.pool_leave_sending), Toast.LENGTH_SHORT).show()
                val ok = api.submitTransaction(tx)
                if (ok != null) {
                    poolRepository.resetWalletAfterLeave(wallet.address)
                    Toast.makeText(requireContext(), getString(R.string.pool_leave_sent), Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(requireContext(), getString(R.string.pool_leave_failed), Toast.LENGTH_SHORT).show()
                }
                refresh(showRefreshing = false)
            } catch (e: Exception) {
                Toast.makeText(requireContext(), e.message ?: "Error", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun requestWithdraw() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val wallet = withContext(Dispatchers.IO) { walletManager.getActiveWallet() } ?: return@launch
                val owed = withContext(Dispatchers.IO) { poolRepository.fetchOwed(wallet.address) }
                if (owed?.can_withdraw != true) {
                    val msg = owed?.reasons?.joinToString(", ") ?: getString(R.string.pool_withdraw_blocked)
                    Toast.makeText(requireContext(), msg, Toast.LENGTH_LONG).show()
                    return@launch
                }
                val amountWei = owed.payout_net_wei ?: owed.owed_wei ?: "0"
                val nonce = UUID.randomUUID().toString()
                val message = PoolConstants.withdrawSignMessage(wallet.address, poolId, amountWei, nonce)
                val keyPair = com.marsa.chain.crypto.KeyPair.fromPrivateKey(wallet.privateKey)
                    ?: throw IllegalStateException("No signing key")
                val sigBytes = keyPair.sign(message.toByteArray(Charsets.UTF_8))
                    ?: throw IllegalStateException("Sign failed")
                val signature = android.util.Base64.encodeToString(sigBytes, android.util.Base64.NO_WRAP)
                val resp = withContext(Dispatchers.IO) {
                    poolRepository.requestWithdraw(
                        PoolWithdrawRequest(
                            miner_address = wallet.address,
                            pool_id = poolId,
                            signature = signature,
                            pub_key = wallet.publicKey,
                            nonce = nonce
                        )
                    )
                }
                if (resp.ok) {
                    Toast.makeText(requireContext(), getString(R.string.pool_withdraw_sent), Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(
                        requireContext(),
                        resp.error ?: resp.reasons?.joinToString(", ") ?: "Failed",
                        Toast.LENGTH_LONG
                    ).show()
                }
                refresh(showRefreshing = false)
            } catch (e: Exception) {
                Toast.makeText(requireContext(), e.message ?: "Error", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        private const val ARG_POOL_ID = "pool_id"
        private const val ARG_POOL_NAME = "pool_name"
        private const val POOL_MIN_LOCK_BLOCKS = 10_000

        fun newInstance(poolId: Int, poolName: String): PoolDetailFragment {
            return PoolDetailFragment().apply {
                arguments = Bundle().apply {
                    putInt(ARG_POOL_ID, poolId)
                    putString(ARG_POOL_NAME, poolName)
                }
            }
        }
    }
}
