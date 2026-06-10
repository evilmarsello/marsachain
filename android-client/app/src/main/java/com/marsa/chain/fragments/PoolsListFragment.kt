package com.marsa.chain.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.marsa.chain.MainActivity
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentPoolsListBinding
import com.marsa.chain.manager.PoolModePreferences
import com.marsa.chain.manager.PoolRepository
import com.marsa.chain.manager.PoolsInfoPrefs
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.network.PoolCatalogWithStats
import com.marsa.chain.pool.PoolHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class PoolsListFragment : Fragment() {

    private var _binding: FragmentPoolsListBinding? = null
    private val binding get() = _binding!!
    private lateinit var poolRepository: PoolRepository
    private lateinit var walletManager: WalletManager
    private lateinit var poolModePrefs: PoolModePreferences

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPoolsListBinding.inflate(inflater, container, false)
        poolRepository = PoolRepository(requireContext())
        walletManager = WalletManager(requireContext())
        poolModePrefs = PoolModePreferences(requireContext())
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.poolsInfoButton.setOnClickListener { showPoolsInfoDialog() }
        loadPools()
        if (!PoolsInfoPrefs.wasSeen(requireContext())) {
            view.post { showPoolsInfoDialog() }
        }
    }

    private fun showPoolsInfoDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_pools_info, null)
        val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.setOnDismissListener { PoolsInfoPrefs.markSeen(requireContext()) }
        dialogView.findViewById<View>(R.id.btnPoolsInfoOk).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    private fun loadPools() {
        binding.poolsErrorText.visibility = View.GONE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val active = withContext(Dispatchers.IO) { walletManager.getActiveWallet() }
                val cached = poolRepository.peekCachedPools()
                if (!cached.isNullOrEmpty() && _binding != null) {
                    binding.poolsLoadingText.visibility = View.GONE
                    val membership = if (active != null) {
                        poolRepository.getCachedMembership(active.address)
                    } else null
                    renderPools(cached, membership?.poolId, active?.address)
                } else {
                    binding.poolsLoadingText.visibility = View.VISIBLE
                    binding.poolsListContainer.removeAllViews()
                }
                val membership = if (active != null) {
                    withContext(Dispatchers.IO) { poolRepository.refreshMembership(active.address) }
                } else null
                val pools = withContext(Dispatchers.IO) {
                    poolRepository.fetchPoolsWithStats(forceNetwork = cached.isNullOrEmpty())
                }
                if (_binding == null) return@launch
                binding.poolsLoadingText.visibility = View.GONE
                if (pools.isEmpty()) {
                    if (cached.isNullOrEmpty()) {
                        binding.poolsErrorText.text = getString(R.string.pools_load_failed)
                        binding.poolsErrorText.visibility = View.VISIBLE
                    }
                    return@launch
                }
                binding.poolsListContainer.removeAllViews()
                renderPools(pools, membership?.poolId, active?.address)
            } catch (e: Exception) {
                if (_binding == null) return@launch
                binding.poolsLoadingText.visibility = View.GONE
                if (poolRepository.peekCachedPools().isNullOrEmpty()) {
                    binding.poolsErrorText.text = e.message ?: getString(R.string.pools_load_failed)
                    binding.poolsErrorText.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun renderPools(
        pools: List<PoolCatalogWithStats>,
        activePoolId: Int?,
        walletAddress: String?
    ) {
        val inflater = LayoutInflater.from(requireContext())
        for (pool in pools.sortedBy { it.pool_id }) {
            val card = inflater.inflate(R.layout.item_pool_card, binding.poolsListContainer, false)
            val root = card.findViewById<View>(R.id.poolCardRoot)
            val title = card.findViewById<TextView>(R.id.poolCardTitle)
            val subtitle = card.findViewById<TextView>(R.id.poolCardSubtitle)
            val badge = card.findViewById<TextView>(R.id.poolCardBadge)
            val minersLabel = card.findViewById<TextView>(R.id.poolCardMiners)
            val openBtn = card.findViewById<android.widget.Button>(R.id.poolCardOpenButton)
            val name = PoolHelper.displayPoolName(pool.pool_id, pool.name)
            title.text = name
            val miners = pool.member_count ?: 0
            minersLabel.text = getString(R.string.pool_total_miners, miners)
            val finderText = if (pool.finder_bps > 0) {
                getString(R.string.pools_finder_bonus, PoolHelper.formatFinderBps(pool.finder_bps))
            } else {
                getString(R.string.pools_finder_equal)
            }
            subtitle.text = finderText
            val chosenId = walletAddress?.let { poolModePrefs.getChosenPoolId(it) }
            val isSelected = activePoolId == pool.pool_id || chosenId == pool.pool_id
            root.setBackgroundResource(
                if (isSelected) R.drawable.pool_card_background_selected
                else R.drawable.pool_card_background
            )
            badge.visibility = View.VISIBLE
            badge.text = when {
                activePoolId == pool.pool_id -> getString(R.string.pool_badge_active)
                chosenId == pool.pool_id -> getString(R.string.pool_badge_chosen)
                else -> ""
            }
            if (badge.text.isNullOrEmpty()) badge.visibility = View.GONE
            val open = {
                (requireActivity() as? MainActivity)?.showPoolDetailFragment(pool.pool_id, name)
            }
            openBtn.setOnClickListener { open() }
            card.setOnClickListener { open() }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = (12 * resources.displayMetrics.density).toInt()
            binding.poolsListContainer.addView(card, lp)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
