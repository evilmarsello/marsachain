package com.marsa.chain.fragments

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.marsa.chain.MainActivity
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentMiningBinding
import com.marsa.chain.manager.PoolModePreferences
import com.marsa.chain.manager.PoolRepository
import com.marsa.chain.network.ApiClient
import com.marsa.chain.network.PoolMembership
import com.marsa.chain.pool.PoolHelper
import com.marsa.chain.network.ChallengeRequestOutcome
import com.marsa.chain.network.MiningApi
import com.marsa.chain.network.ChallengeResponse
import com.marsa.chain.network.MiningSubmitRequest
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.ui.MiningCoinView
import com.marsa.chain.utils.CoinFormatter
import com.marsa.chain.utils.DifficultyDisplay
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.isActive
import kotlin.math.min
import kotlin.random.Random
import android.graphics.Color
import android.text.SpannableStringBuilder
import android.text.style.ForegroundColorSpan
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

class MiningFragment : Fragment() {
    private var _binding: FragmentMiningBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var api: ApiClient
    private lateinit var walletManager: WalletManager
    private lateinit var poolModePrefs: PoolModePreferences
    private lateinit var poolRepository: PoolRepository
    private lateinit var prefs: SharedPreferences
    private var poolMembership: PoolMembership = PoolMembership()
    private var activeWalletAddress: String? = null
    private var blocksMined = 0
    private var totalRewards = 0L
    private var miningInProgress = false
    
    private var lastMiningTapCompletedAtMs = 0L
    private var progressRingJob: Job? = null
    
    private var minerStakeInfo: com.marsa.chain.network.MinerStakeInfoDTO? = null
    private var deferMiningOverlays = false

    private val miningTapButton: View
        get() = binding.miningCoinView!!.getTapTarget()

    
    private val pendingMiningSlots = ArrayDeque<Triple<String, ChallengeResponse, String>>()
    private val pendingMiningLock = Any()

    
    private var lastMiningTapScreenX: Float = -1f
    private var lastMiningTapScreenY: Float = -1f

    
    private var currentToast: Toast? = null

    private fun showShortToast(message: CharSequence) {
        if (!isAdded) return
        val ctx = context?.applicationContext ?: return
        currentToast?.cancel()
        val toast = Toast.makeText(ctx, message, Toast.LENGTH_SHORT)
        currentToast = toast
        toast.show()
        Handler(Looper.getMainLooper()).postDelayed({
            toast.cancel()
            if (currentToast == toast) currentToast = null
        }, 1500)
    }

    
    private fun showMiningResultFloating(hashHex: String, success: Boolean, rewardMrs: String? = null) {
        if (!isAdded || _binding == null) return
        val content = activity?.window?.decorView?.findViewById<ViewGroup>(android.R.id.content) ?: return
        val miningBtn = binding.miningCoinView ?: return
        val chip = layoutInflater.inflate(R.layout.mining_floating_result, content, false)
        val iconView = chip.findViewById<android.widget.TextView>(R.id.miningFloatingIcon)
        val textView = chip.findViewById<android.widget.TextView>(R.id.miningFloatingText)
        iconView.text = if (success) "✓" else "✗"
        iconView.setTextColor(if (success) 0xFF4CAF50.toInt() else 0xFFF44336.toInt())
        textView.text = if (success && rewardMrs != null) "${hashHex.take(10)}...  +$rewardMrs MRS" else "${hashHex.take(10)}..."
        chip.measure(
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        )
        val cw = chip.measuredWidth.coerceAtLeast(1)
        val ch = chip.measuredHeight.coerceAtLeast(1)
        val contentLoc = IntArray(2).also { content.getLocationOnScreen(it) }
        val buttonLoc = IntArray(2).also { miningBtn.getLocationOnScreen(it) }
        val centerX = if (lastMiningTapScreenX >= 0f) lastMiningTapScreenX else buttonLoc[0] + miningBtn.width / 2f
        val centerY = if (lastMiningTapScreenY >= 0f) lastMiningTapScreenY else buttonLoc[1] + miningBtn.height / 2f
        content.addView(chip, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            leftMargin = (centerX - contentLoc[0] - cw / 2).toInt()
            topMargin = (centerY - contentLoc[1] - ch / 2).toInt()
        })
        chip.alpha = 0f
        chip.viewTreeObserver.addOnPreDrawListener(object : android.view.ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                chip.viewTreeObserver.removeOnPreDrawListener(this)
                chip.alpha = 1f
                chip.animate()
                    .translationY(MINING_FLOAT_TRANSLATE_Y_PX)
                    .alpha(0f)
                    .setDuration(MINING_FLOAT_DURATION_MS)
                    .setInterpolator(LinearInterpolator())
                    .withEndAction { (chip.parent as? ViewGroup)?.removeView(chip) }
                    .start()
                return true
            }
        })
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMiningBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        // Initialize components
        api = ApiClient(requireContext())
        walletManager = WalletManager(requireContext())
        poolModePrefs = PoolModePreferences(requireContext())
        poolRepository = PoolRepository(requireContext())
        prefs = requireContext().getSharedPreferences("mining_stats", Context.MODE_PRIVATE)
        
        // Load saved stats
        blocksMined = prefs.getInt("blocks_mined", 0)
        totalRewards = prefs.getLong("total_rewards", 0L)
        
        setupUI()
        loadData()
    }
    
    private var heightUpdateJob: kotlinx.coroutines.Job? = null
    
    override fun onResume() {
        super.onResume()
        // Update API client with latest connection settings
        api.updateBaseUrl(requireContext())

        // Sync with prefs (e.g. after Statistics → Reset) so in-memory counters match storage
        blocksMined = prefs.getInt("blocks_mined", 0)
        totalRewards = prefs.getLong("total_rewards", 0L)
        
        // Refresh data when fragment becomes visible
        loadData()
        
        startHeightUpdates()
    }
    
    override fun onPause() {
        super.onPause()
        stopHeightUpdates()
    }
    
    private fun startHeightUpdates() {
        stopHeightUpdates()
        heightUpdateJob = viewLifecycleOwner.lifecycleScope.launch {
            while (isActive && _binding != null) {
                try {
                    val status = api.getStatus()
                    if (_binding == null) return@launch
                    if (status != null) {
                        binding.networkHeightText?.text = status["height"].toString()
                        val bits = (status["bits"] as? Number)?.toInt() ?: (status["difficulty"] as? Number)?.toInt()
                        binding.difficultyText?.text = bits?.let { DifficultyDisplay.formatCompactBits(it) } ?: "2"
                        val statusH = (status["height"] as? Number)?.toInt()
                        val stakeSnap = minerStakeInfo
                        if (statusH != null && stakeSnap?.has_stake == true && statusH != stakeSnap.current_height) {
                            loadMinerStakeInfo()
                        }
                    }
                    val waitingRefill = minerStakeInfo?.has_stake == true &&
                        (minerStakeInfo?.available_credits ?: 1L) <= 0L
                    if (waitingRefill) {
                        loadMinerStakeInfo()
                    }
                } catch (e: Exception) { }
                val pauseMs = if (minerStakeInfo?.has_stake == true) 5_000L else 10_000L
                delay(pauseMs)
            }
        }
    }
    
    private fun stopHeightUpdates() {
        heightUpdateJob?.cancel()
        heightUpdateJob = null
    }

    private fun setupUI() {
        // Load initial balance
        loadData()
        
        val isPool = poolModePrefs.getMiningMode() == PoolModePreferences.MiningMode.POOL
        binding.miningCoinView?.setPoolFaceImmediate(isPool)

        miningTapButton.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    if (!v.isEnabled) return@setOnTouchListener false
                    v.animate().scaleX(0.95f).scaleY(0.95f).setDuration(100).start()
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (event.action == MotionEvent.ACTION_UP && v.isEnabled) {
                        lastMiningTapScreenX = event.rawX
                        lastMiningTapScreenY = event.rawY
                        onTapMine()
                    }
                    v.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start()
                    true
                }
                else -> false
            }
        }
        
        setupMiningModeSwitch()
    }

    private fun setupMiningModeSwitch() {
        val switch = binding.miningModeSwitch ?: return
        val isPool = poolModePrefs.getMiningMode() == PoolModePreferences.MiningMode.POOL
        applyMiningModeUi(isPool)
        switch.setOnClickListener {
            val prevPool = poolModePrefs.getMiningMode() == PoolModePreferences.MiningMode.POOL
            val nextPool = !prevPool
            val mode = if (nextPool) PoolModePreferences.MiningMode.POOL else PoolModePreferences.MiningMode.SOLO
            poolModePrefs.setMiningMode(mode)
            applyMiningModeUi(nextPool)
            deferMiningOverlays = true
            hideAllCoinOverlays()
            binding.miningButtonDimOverlay?.visibility = View.GONE
            binding.miningCoinView?.playFlip(nextPool, MiningCoinView.FLIP_MS) {
                Handler(Looper.getMainLooper()).postDelayed({
                    if (_binding == null || !isAdded) return@postDelayed
                    deferMiningOverlays = false
                    binding.miningCoinView?.setPoolFaceImmediate(nextPool)
                    updateMinerStakeUI(minerStakeInfo)
                }, MiningCoinView.OVERLAY_REVEAL_MS)
            }
        }
    }

    private fun applyMiningModeUi(poolMode: Boolean) {
        updateMiningModeLabels(poolMode)
        binding.miningModePoolIcon?.alpha = if (poolMode) 1f else 0.45f
        binding.miningModeSoloIcon?.alpha = if (poolMode) 0.45f else 1f
        val knob = binding.miningModeKnob ?: return
        val travelPx = 24f * resources.displayMetrics.density
        knob.translationX = if (poolMode) 0f else travelPx
        if (!deferMiningOverlays) {
            binding.miningCoinView?.setPoolFaceImmediate(poolMode)
        }
    }

    private fun updateMiningModeLabels(poolMode: Boolean) {
        val active = ContextCompat.getColor(requireContext(), R.color.primary_color)
        val inactive = Color.parseColor("#8E8E93")
        binding.miningModePoolLabel?.setTextColor(if (poolMode) active else inactive)
        binding.miningModeSoloLabel?.setTextColor(if (poolMode) inactive else active)
    }

    private fun hideAllCoinOverlays() {
        binding.miningOverlayMessage?.visibility = View.GONE
        binding.createMinerStakeButton?.visibility = View.GONE
        binding.creditsRefillText?.visibility = View.GONE
    }

    private fun showCoinMessage(text: String) {
        if (deferMiningOverlays) return
        val accent = ContextCompat.getColor(requireContext(), R.color.primary_color)
        binding.miningOverlayMessage?.apply {
            this.text = text
            setTextColor(accent)
            visibility = View.VISIBLE
            isEnabled = false
        }
        binding.createMinerStakeButton?.visibility = View.GONE
        binding.miningButtonDimOverlay?.visibility = View.VISIBLE
        miningTapButton.isEnabled = false
    }

    private fun showCoinAction(text: String, onClick: () -> Unit) {
        if (deferMiningOverlays) return
        val accent = ContextCompat.getColor(requireContext(), R.color.primary_color)
        binding.createMinerStakeButton?.apply {
            this.text = text
            setTextColor(accent)
            visibility = View.VISIBLE
            setOnClickListener { onClick() }
        }
        binding.miningOverlayMessage?.visibility = View.GONE
        binding.miningButtonDimOverlay?.visibility = View.VISIBLE
        miningTapButton.isEnabled = false
    }

    private fun loadData() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val status = api.getStatus()
                if (_binding == null) return@launch
                if (status != null) {
                    binding.networkHeightText?.text = status["height"].toString()
                    val bits = (status["bits"] as? Number)?.toInt() ?: (status["difficulty"] as? Number)?.toInt()
                    binding.difficultyText?.text = bits?.let { DifficultyDisplay.formatCompactBits(it) } ?: "2"
                } else {
                    binding.difficultyText?.text = "2"
                }
                val miningStats = api.getMiningStats()
                if (_binding == null) return@launch
                if (miningStats != null) {
                    binding.activeMininersText?.text = miningStats.activeMiners.toString()
                }
                loadBalanceData()
                loadMinerStakeInfo()
            } catch (e: Exception) { }
        }
    }
    
    
    private suspend fun loadMinerStakeInfo() {
        try {
            val activeWallet = withContext(Dispatchers.IO) {
                walletManager.getActiveWallet()
            }
            
            if (activeWallet == null) {
                android.util.Log.w("MiningFragment", "No active wallet, cannot load miner stake info")
                activeWalletAddress = null
                poolMembership = PoolMembership()
                updateMinerStakeUI(null)
                return
            }
            activeWalletAddress = activeWallet.address
            poolMembership = poolRepository.refreshMembership(activeWallet.address)
            if (poolMembership.active && poolMembership.poolId != null) {
                poolModePrefs.markPoolChosen(activeWallet.address, poolMembership.poolId!!)
            }
            val pendingAddr = poolModePrefs.getPoolStakePendingAddress()
            if (pendingAddr != null && poolMembership.active) {
                poolModePrefs.clearPoolStakePending()
            }

            val fresh = api.getMiningInfo(activeWallet.address)
            if (_binding == null) return
            if (fresh != null) {
                minerStakeInfo = fresh
                updateMinerStakeUI(minerStakeInfo)
            } else {
                val cached = minerStakeInfo
                if (cached != null && cached.address == activeWallet.address) {
                    updateMinerStakeUI(cached)
                } else {
                    minerStakeInfo = null
                    updateMinerStakeUI(null)
                }
            }
            
        } catch (e: Exception) {
            android.util.Log.e("MiningFragment", "Error loading miner stake info: ${e.message}")
            if (_binding == null) return
            val activeWallet = withContext(Dispatchers.IO) { walletManager.getActiveWallet() }
            val cached = minerStakeInfo
            if (activeWallet != null && cached != null && cached.address == activeWallet.address) {
                updateMinerStakeUI(cached)
            } else {
                minerStakeInfo = null
                updateMinerStakeUI(null)
            }
        }
    }
    
    
    private fun labelGrayValueWhite(label: String, value: String): CharSequence {
        val full = label + value
        return SpannableStringBuilder(full).apply {
            setSpan(ForegroundColorSpan(Color.parseColor("#8E8E93")), 0, label.length, 0)
            setSpan(ForegroundColorSpan(Color.WHITE), label.length, full.length, 0)
        }
    }

    
    private fun updateMinerStakeUI(info: com.marsa.chain.network.MinerStakeInfoDTO?) {
        if (_binding == null) return
        if (!deferMiningOverlays) {
            binding.miningOverlayMessage?.visibility = View.GONE
        }
        if (info == null || !info.has_stake) {
            binding.minerStakeStatusText?.text = labelGrayValueWhite(
                getString(R.string.mining_stake_lab),
                getString(R.string.mining_stake_not_active)
            )
            binding.miningCreditsText?.visibility = View.GONE
            binding.creditsRefillText?.visibility = View.GONE
            binding.minerStakeUnlockText?.visibility = View.GONE
            binding.minerStakeCostPerCreditText?.visibility = View.GONE
            binding.miningBlockRateText?.visibility = View.GONE
            showCoinAction(getString(R.string.mining_create_stake_btn)) { showCreateMinerStakeDialog() }
        } else {
            val stakedFormatted = info.staked_amount_formatted ?: "0"
            val creditsLeft = info.available_credits ?: 0
            val totalCredits = info.total_credits_per_window ?: 0
            val blocksUntilRefill = info.blocks_until_refill ?: 0
            val secondsUntilRefill = blocksUntilRefill * 15 // ~15 sec per block
            
            binding.minerStakeStatusText?.text = labelGrayValueWhite(
                getString(R.string.mining_stake_lab),
                "$stakedFormatted MRS"
            )
            
            val costFormatted = info.freeze_cost_formatted ?: "—"
            binding.minerStakeCostPerCreditText?.text = labelGrayValueWhite(
                getString(R.string.mining_credit_per_hash),
                "$costFormatted MRS"
            )
            binding.minerStakeCostPerCreditText?.visibility = View.VISIBLE
            
            val minUn = info.min_unstake_block ?: 0
            val until = info.blocks_until_can_unstake ?: 0
            val inferredBlock = when {
                minUn > 0 -> minUn
                until > 0 -> info.current_height + until
                else -> 0
            }
            val unlockLabelText = when {
                info.can_unstake == true ->
                    labelGrayValueWhite(
                        getString(R.string.mining_unstake_lab),
                        getString(R.string.mining_unstake_now)
                    )
                inferredBlock > 0 ->
                    labelGrayValueWhite(
                        getString(R.string.mining_unstake_avail),
                        inferredBlock.toString()
                    )
                else -> null
            }
            if (unlockLabelText != null) {
                binding.minerStakeUnlockText?.text = unlockLabelText
                binding.minerStakeUnlockText?.visibility = View.VISIBLE
            } else {
                binding.minerStakeUnlockText?.visibility = View.GONE
            }
            
            if (creditsLeft > 0) {
                binding.miningCreditsText?.text =
                    labelGrayValueWhite(
                        getString(R.string.mining_credits_lab),
                        "$creditsLeft / $totalCredits"
                    )
                binding.miningCreditsText?.visibility = View.VISIBLE
                binding.creditsRefillText?.visibility = View.GONE
                binding.miningButtonDimOverlay?.visibility = View.GONE
                binding.createMinerStakeButton?.visibility = View.GONE
                miningTapButton.isEnabled = true
            } else {
                binding.miningCreditsText?.text =
                    labelGrayValueWhite(
                        getString(R.string.mining_credits_lab),
                        "0 / $totalCredits"
                    )
                binding.miningCreditsText?.visibility = View.VISIBLE
                binding.creditsRefillText?.visibility = View.GONE
                showCoinMessage(
                    getString(R.string.mining_wait_refill, blocksUntilRefill, secondsUntilRefill)
                )
            }

            binding.miningBlockRateText?.visibility = View.GONE
        }
        applyPoolModeGating(info)
    }

    private fun applyPoolModeGating(info: com.marsa.chain.network.MinerStakeInfoDTO?) {
        if (_binding == null) return
        val addr = activeWalletAddress
        val poolMode = poolModePrefs.getMiningMode() == PoolModePreferences.MiningMode.POOL
        val pending = addr != null && poolModePrefs.isPoolStakePending(addr)
        val membership = poolMembership
        val soloBlocksPool = PoolHelper.hasSoloMinerStakeOnly(info, membership, pending)
        val orphanPool = PoolHelper.hasOrphanPoolStake(info, membership, pending)
        val poolMember = membership.active

        if (poolMode) {
            when {
                soloBlocksPool -> showCoinMessage(getString(R.string.mining_finish_solo_first))
                orphanPool -> showCoinAction(getString(R.string.mining_create_pool_stake)) { openChosenPoolDetail() }
                pending && !poolMember -> showCoinMessage(getString(R.string.mining_pool_stake_sent))
                !poolMember -> {
                    val chosenId = addr?.let { poolModePrefs.getChosenPoolId(it) }
                    when {
                        chosenId == null -> showCoinAction(getString(R.string.pools_title)) {
                            (requireActivity() as? MainActivity)?.showPoolsListFragment()
                        }
                        info == null || !info.has_stake -> showCoinAction(getString(R.string.mining_create_pool_stake)) {
                            openChosenPoolDetail()
                        }
                        else -> {
                            val canMine = PoolHelper.canMineInPoolMode(info, membership)
                            miningTapButton.isEnabled = canMine
                            if (!canMine && !deferMiningOverlays) {
                                binding.miningButtonDimOverlay?.visibility = View.VISIBLE
                            }
                        }
                    }
                }
                else -> {
                    val canMine = PoolHelper.canMineInPoolMode(info, membership)
                    miningTapButton.isEnabled = canMine
                    if (!canMine && !deferMiningOverlays) {
                        binding.miningButtonDimOverlay?.visibility = View.VISIBLE
                    }
                }
            }
        } else {
            when {
                poolMember -> showCoinMessage(getString(R.string.mining_wallet_in_pool))
                orphanPool || PoolHelper.miningInfoIsPoolStake(info) ->
                    showCoinMessage(getString(R.string.mining_switch_to_pool))
                info != null && info.has_stake -> {
                    miningTapButton.isEnabled = PoolHelper.canMineInSoloMode(info, membership)
                }
            }
        }
        if (miningTapButton.isEnabled && !deferMiningOverlays) {
            binding.miningButtonDimOverlay?.visibility = View.GONE
            binding.miningOverlayMessage?.visibility = View.GONE
            binding.createMinerStakeButton?.visibility = View.GONE
        }
    }

    private fun openChosenPoolDetail() {
        val addr = activeWalletAddress ?: return
        val poolId = poolModePrefs.getChosenPoolId(addr) ?: return
        val name = PoolHelper.displayPoolName(poolId, "")
        (requireActivity() as? MainActivity)?.showPoolDetailFragment(poolId, name)
    }

    
    private fun applyMiningButtonEnabledAfterAttempt() {
        if (_binding == null) return
        applyPoolModeGating(minerStakeInfo)
    }
    
    
    private fun showCreateMinerStakeDialog() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val activeWallet = withContext(Dispatchers.IO) {
                    walletManager.getActiveWallet()
                }
                if (activeWallet == null) {
                    showShortToast(getString(R.string.alert_no_active_wallet))
                    return@launch
                }
                val currentBalance = withContext(Dispatchers.IO) {
                    walletManager.getWalletBalance(activeWallet.address)
                }
                if (_binding == null) return@launch
                val balanceFormatted = CoinFormatter.format(currentBalance)
                
                val minStakeAmount = minerStakeInfo?.min_stake_amount ?: (100L * CoinFormatter.WEI_PER_COIN)
                val duration = 120
                val unlockBlock = (minerStakeInfo?.current_height ?: 0) + duration
                
                val dialogView = layoutInflater.inflate(R.layout.dialog_create_miner_stake, null)
                
                val tvBalanceInfo = dialogView.findViewById<android.widget.TextView>(R.id.tvBalanceInfo)
                val tvStakeMinHint = dialogView.findViewById<android.widget.TextView>(R.id.tvStakeMinHint)
                val etStakeAmount = dialogView.findViewById<android.widget.EditText>(R.id.etStakeAmount)
                
                tvBalanceInfo.text = getString(R.string.stake_balance, balanceFormatted)
                tvStakeMinHint.text = getString(R.string.stake_min, CoinFormatter.format(minStakeAmount))
                
                val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
                    .setView(dialogView)
                    .create()
                
                dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
                
                dialogView.findViewById<android.view.View>(R.id.btnCancel).setOnClickListener {
                    dialog.dismiss()
                }
                
                dialogView.findViewById<android.view.View>(R.id.btnCreateStake).setOnClickListener {
                    val amountStr = etStakeAmount.text.toString()
                    if (amountStr.isNotEmpty()) {
                        try {
                            val amountCoins = amountStr.toDouble()
                            val amountWei = CoinFormatter.coinsToNanos(amountCoins)
                            dialog.dismiss()
                            createMinerStakeTransaction(activeWallet, amountWei)
                        } catch (e: Exception) {
                            showShortToast(getString(R.string.stake_invalid_amount))
                        }
                    } else {
                        showShortToast(getString(R.string.stake_enter_amount))
                    }
                }
                
                dialog.show()
                
            } catch (e: Exception) {
                showShortToast("Error: ${e.message}")
            }
        }
    }
    
    
    private fun createMinerStakeTransaction(
        wallet: com.marsa.chain.data.WalletInfo,
        stakeAmount: Long
    ) {
        viewLifecycleOwner.lifecycleScope.launch stakeSend@{
            try {
                val minStakeAmount = minerStakeInfo?.min_stake_amount ?: (100L * CoinFormatter.WEI_PER_COIN)
                if (stakeAmount < minStakeAmount) {
                    showShortToast(getString(R.string.stake_min_amount, CoinFormatter.format(minStakeAmount)))
                    return@stakeSend
                }
                val currentBalance = withContext(Dispatchers.IO) {
                    walletManager.getWalletBalance(wallet.address)
                }
                if (stakeAmount > currentBalance) {
                    showShortToast(getString(R.string.stake_insufficient))
                    return@stakeSend
                }
                val status = api.getStatus()
                if (_binding == null) return@stakeSend
                val currentHeight = (status?.get("height") as? Int) ?: 0
                val fee = 0L
                
                val txRequest = createMinerStakeTransactionRequest(
                    wallet.address,
                    wallet.publicKey,
                    wallet.privateKey,
                    stakeAmount,
                    fee,
                    currentHeight
                )
                
                showShortToast(getString(R.string.stake_sending))
                
                val result = api.submitTransaction(txRequest)
                
                if (result != null) {
                    showShortToast(getString(R.string.stake_sent))
                    
                    withContext(Dispatchers.IO) {
                        walletManager.updateWalletBalance(wallet.address, currentBalance - stakeAmount)
                    }
                    
                    loadBalanceData()
                    
                    viewLifecycleOwner.lifecycleScope.launch confirmStake@{
                        var confirmed = false
                        for (attempt in 1..20) {
                            delay(2000)
                            if (_binding == null) return@confirmStake
                            val info = api.getMiningInfo(wallet.address)
                            if (info?.has_stake == true) {
                                confirmed = true
                                showShortToast(getString(R.string.stake_confirmed))
                                if (_binding == null) return@confirmStake
                                loadMinerStakeInfo()
                                break
                            }
                        }
                        if (!confirmed && _binding != null) {
                            loadMinerStakeInfo()
                        }
                    }
                } else {
                    showShortToast(getString(R.string.mining_tx_failed))
                }
                
            } catch (e: Exception) {
                showShortToast("Error: ${e.message}")
                android.util.Log.e("MiningFragment", "Error creating MINER_STAKE", e)
            }
        }
    }
    
    
    private fun createMinerStakeTransactionRequest(
        from: String,
        publicKey: String,
        privateKey: String,
        stakeAmount: Long,
        fee: Long,
        currentHeight: Int
    ): com.marsa.chain.network.TransactionRequest {
        val txidData = StringBuilder()
        txidData.append(from).append(fee.toString())
        txidData.append(from).append("0") // to=from, value=0
        txidData.append(fee.toString())
        txidData.append("10")
        txidData.append(stakeAmount.toString())
        
        val txidBytes = java.security.MessageDigest.getInstance("SHA-256")
            .digest(txidData.toString().toByteArray())
        val txid = txidBytes.joinToString("") { String.format("%02x", it) }
        
        val keyPair = com.marsa.chain.crypto.KeyPair.fromPrivateKey(privateKey)
            ?: throw Exception("Failed to create KeyPair")
        
        val signatureBytes = keyPair.sign(txid.toByteArray())
            ?: throw Exception("Failed to sign transaction")
        
        val signature = Base64.encodeToString(signatureBytes, Base64.NO_WRAP)
        
        return com.marsa.chain.network.TransactionRequest(
            txid = txid,
            inputs = listOf(
                com.marsa.chain.network.TransactionInput(
                    address = from,
                    amount = stakeAmount + fee,
                    signature = signature,
                    pubKey = publicKey
                )
            ),
            outputs = listOf(
                com.marsa.chain.network.TransactionOutput(
                    value = 0,
                    address = from
                )
            ),
            fee = fee,
            tx_type = 10, // MINER_STAKE
            data = stakeAmount.toString(),
            metadata = mapOf(
                "current_height" to currentHeight,
                "stake_type" to "miner"
            )
        )
    }
    
    private suspend fun loadBalanceData() {
        try {
            val totalBalance = withContext(Dispatchers.IO) {
                walletManager.getTotalBalance()
            }
            if (_binding == null) return
            binding.balanceText.text = CoinFormatter.format(totalBalance)
            val wallets = withContext(Dispatchers.IO) {
                walletManager.getAllWallets().first()
            }
            if (_binding == null) return
            for (wallet in wallets) {
                val balanceResp = api.getBalance(wallet.address)
                if (balanceResp != null) {
                    withContext(Dispatchers.IO) {
                        walletManager.updateWalletBalance(wallet.address, balanceResp.balance)
                    }
                } else {
                    android.util.Log.e("MiningFragment", "Failed to get balance for ${wallet.address}")
                }
            }
            
            val updatedTotalBalance = withContext(Dispatchers.IO) {
                walletManager.getTotalBalance()
            }
            if (_binding == null) return
            binding.balanceText.text = CoinFormatter.formatWithSuffix(updatedTotalBalance)
        } catch (e: Exception) {
            android.util.Log.e("MiningFragment", "Error loading balance: ${e.message}")
        }
    }

    private fun onTapMine() {
        if (miningInProgress) return
        val nowTap = SystemClock.elapsedRealtime()
        if (lastMiningTapCompletedAtMs != 0L && nowTap - lastMiningTapCompletedAtMs < MIN_MINING_COOLDOWN_MS) {
            return
        }

        viewLifecycleOwner.lifecycleScope.launch miningTap@{
            if (_binding == null) return@miningTap
            miningInProgress = true
            binding.miningProgressRing.visibility = View.VISIBLE
            binding.miningProgressRing.progress = 0f
            miningTapButton.isEnabled = false
            val startTime = SystemClock.elapsedRealtime()
            val maxFillTimeMs = 4000L
            progressRingJob = launch {
                while (miningInProgress && isActive && _binding != null) {
                    delay(80)
                    if (_binding == null) break
                    val elapsed = SystemClock.elapsedRealtime() - startTime
                    val p = (elapsed.toFloat() / maxFillTimeMs).coerceAtMost(0.92f)
                    binding.miningProgressRing.progress = p
                }
            }
            var refreshMiningInfoAfterTap = false
            try {
                val activeWallet = withContext(Dispatchers.IO) { walletManager.getActiveWallet() }
                if (activeWallet == null) {
                    showShortToast(getString(R.string.mining_tap_no_wallet))
                    return@miningTap
                }
                val address = activeWallet.address
                val pubKey = activeWallet.publicKey

                if (minerStakeInfo?.address != address) {
                    synchronized(pendingMiningLock) { pendingMiningSlots.clear() }
                    loadMinerStakeInfo()
                }
                val infoAfter = minerStakeInfo
                if (infoAfter == null || infoAfter.address != address || !infoAfter.has_stake) {
                    showShortToast(getString(R.string.mining_tap_no_stake))
                    return@miningTap
                }
                val poolMode = poolModePrefs.getMiningMode() == PoolModePreferences.MiningMode.POOL
                val canMine = if (poolMode) {
                    PoolHelper.canMineInPoolMode(infoAfter, poolMembership)
                } else {
                    PoolHelper.canMineInSoloMode(infoAfter, poolMembership)
                }
                if (!canMine) {
                    showShortToast(
                        if (poolMode) getString(R.string.mining_tap_join_pool_first)
                        else getString(R.string.mining_tap_switch_pool_or_unstake)
                    )
                    return@miningTap
                }
                val creditsAfter = infoAfter.available_credits ?: 0
                if (creditsAfter <= 0) {
                    val blocksUntilRefill = infoAfter.blocks_until_refill ?: 0
                    showShortToast(getString(R.string.mining_tap_no_credits, blocksUntilRefill))
                    return@miningTap
                }
                refreshMiningInfoAfterTap = true

                val miningNodes = api.getMiningNodesOrdered()
                if (miningNodes.isEmpty()) {
                    showShortToast(getString(R.string.mining_tap_no_validators))
                    return@miningTap
                }
                if (_binding == null) return@miningTap

                val batchN = min(MAX_PENDING_ON_SERVER, creditsAfter.toInt().coerceAtLeast(1))
                val slot = synchronized(pendingMiningLock) {
                    if (pendingMiningSlots.isEmpty()) {
                        null
                    } else {
                        pendingMiningSlots.removeFirst()
                    }
                } ?: run {
                    when (refillPendingMiningSlots(miningNodes, address, pubKey, batchN)) {
                        RefillPendingResult.BlockRateLimited -> return@miningTap
                        RefillPendingResult.Failed -> {
                            showShortToast(getString(R.string.mining_tap_challenge_failed))
                            return@miningTap
                        }
                        RefillPendingResult.Success -> {
                            loadMinerStakeInfo()
                        }
                    }
                    synchronized(pendingMiningLock) {
                        pendingMiningSlots.removeFirstOrNull()
                    } ?: run {
                        showShortToast(getString(R.string.mining_tap_challenge_failed))
                        return@miningTap
                    }
                }

                val nonceStr = slot.first
                val challengeResp = slot.second
                val miningUrl = slot.third

                if (_binding == null) return@miningTap
                val status = api.getStatus()
                if (status == null) {
                    synchronized(pendingMiningLock) { pendingMiningSlots.addFirst(slot) }
                    showShortToast(getString(R.string.mining_tap_status_failed))
                    return@miningTap
                }
                val clientHashHex = sha256Hex((challengeResp.challenge + nonceStr).toByteArray())

                val bitsForPow = challengeResp.bits
                    ?: (status["bits"] as? Number)?.toInt()
                val keyPair = com.marsa.chain.crypto.KeyPair.fromPrivateKey(activeWallet.privateKey)
                val signatureEarly = keyPair?.sign(clientHashHex.toByteArray())
                val signatureB64Early = signatureEarly?.let { Base64.encodeToString(it, Base64.NO_WRAP) }

                if (bitsForPow != null) {
                    val compact = bitsForPow.toLong() and 0xFFFFFFFFL
                    if (!DifficultyDisplay.hashMeetsTarget(clientHashHex, compact)) {
                        showMiningResultFloating(clientHashHex, false)
                        val abandonMsg = MiningApi.abandonSignMessage(address, challengeResp.challengeId)
                        val abandonSig = keyPair?.sign(abandonMsg.toByteArray(StandardCharsets.UTF_8))
                        val abandonSigB64 = abandonSig?.let { Base64.encodeToString(it, Base64.NO_WRAP) }
                        if (abandonSigB64 != null) {
                            withContext(Dispatchers.IO) {
                                val ok = api.abandonChallengeTo(
                                    miningUrl, address, challengeResp.challengeId, pubKey, abandonSigB64
                                )
                                if (!ok && signatureB64Early != null) {
                                    val claimedH = ((status["height"] as? Number)?.toInt() ?: 0) + 1
                                    val abandonReq = MiningSubmitRequest(
                                        address = address,
                                        challengeId = challengeResp.challengeId,
                                        clientHash = clientHashHex,
                                        signature = signatureB64Early,
                                        attestation = "stub",
                                        headerHash = clientHashHex,
                                        claimedHeight = claimedH,
                                        pubKey = pubKey,
                                        nonce = nonceStr
                                    )
                                    try {
                                        api.submitMiningResultTo(miningUrl, abandonReq)
                                    } catch (_: Exception) {
                                    }
                                }
                            }
                        }
                        return@miningTap
                    }
                }

                if (signatureEarly == null || signatureB64Early == null) {
                    showShortToast(getString(R.string.mining_tap_sign_failed))
                    return@miningTap
                }
                val submitReq = MiningSubmitRequest(
                    address = address,
                    challengeId = challengeResp.challengeId,
                    clientHash = clientHashHex,
                    signature = signatureB64Early,
                    attestation = "stub",
                    headerHash = clientHashHex,
                    claimedHeight = ((status["height"] as? Number)?.toInt() ?: 0) + 1,
                    pubKey = pubKey,
                    nonce = nonceStr
                )
                val result = api.submitMiningResultTo(miningUrl, submitReq)
                if (result?.accepted == true) {
                    blocksMined++
                    val blockHeight = submitReq.claimedHeight
                    val blockRewardNanos = calculateBlockReward(blockHeight)
                    totalRewards += blockRewardNanos
                    prefs.edit()
                        .putInt("blocks_mined", blocksMined)
                        .putLong("total_rewards", totalRewards)
                        .apply()
                    showMiningResultFloating(clientHashHex, true, CoinFormatter.format(blockRewardNanos))
                    launch {
                        delay(150)
                        if (_binding == null) return@launch
                        val balanceResp = api.getBalance(address)
                        if (balanceResp != null) {
                            withContext(Dispatchers.IO) {
                                walletManager.updateWalletBalance(address, balanceResp.balance)
                            }
                        }
                        if (_binding == null) return@launch
                        val updatedBalance = withContext(Dispatchers.IO) { walletManager.getTotalBalance() }
                        if (_binding == null) return@launch
                        binding.balanceText.text = CoinFormatter.formatWithSuffix(updatedBalance)
                        loadBalanceData()
                    }
                } else {
                }
                
            } catch (e: Exception) {
                if (isAdded && e.message?.contains("database") != true) {
                    showShortToast("Error: ${e.message}")
                }
            } finally {
                miningInProgress = false
                progressRingJob?.cancel()
                progressRingJob = null
                if (_binding != null) {
                    binding.miningProgressRing.progress = 1f
                    binding.miningProgressRing.visibility = View.GONE
                    binding.miningProgressRing.progress = 0f
                    if (refreshMiningInfoAfterTap) {
                        launch {
                            try {
                                loadMinerStakeInfo()
                            } catch (_: Exception) {
                            }
                            if (_binding != null) {
                                applyMiningButtonEnabledAfterAttempt()
                            }
                        }
                    } else {
                        applyMiningButtonEnabledAfterAttempt()
                    }
                }
                lastMiningTapCompletedAtMs = SystemClock.elapsedRealtime()
            }
        }
    }

    private fun sha256(data: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(data)

    private fun sha256Hex(data: ByteArray): String {
        val bytes = sha256(data)
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            sb.append(String.format("%02x", b))
        }
        return sb.toString()
    }
    
    
    private fun calculateBlockReward(height: Int): Long {
        val INITIAL_REWARD = CoinFormatter.coinsToNanos(10000.0)
        val HALVING_INTERVAL = 1_050_000
        val MIN_REWARD = INITIAL_REWARD / 10
        
        if (height == 0) {
            // Genesis block
            val fullReward = INITIAL_REWARD
            return (fullReward * 0.9).toLong()
        }
        
        val halvingCount = (height - 1) / HALVING_INTERVAL
        
        if (halvingCount == 0) {
            val fullReward = INITIAL_REWARD
            return (fullReward * 0.9).toLong()
        }
        
        var reward = INITIAL_REWARD.toDouble()
        val minReward = MIN_REWARD.toDouble()
        
        for (i in 1..halvingCount) {
            val reductionPercent = getReductionPercent(i)
            reward = reward * (1.0 - reductionPercent)
            
            if (reward < minReward) {
                reward = minReward
                break
            }
        }
        
        return (reward * 0.9).toLong()
    }
    
    
    private fun getReductionPercent(halvingNumber: Int): Double {
        return when (halvingNumber) {
            1 -> 0.50 // 50%
            2 -> 0.40 // 40%
            3 -> 0.30 // 30%
            4 -> 0.20 // 20%
            else -> 0.10
        }
    }

    // Statistics are now handled in separate StatisticsFragment
    fun getBlocksMined(): Int = blocksMined
    fun getTotalRewards(): Long = totalRewards

    override fun onDestroyView() {
        synchronized(pendingMiningLock) { pendingMiningSlots.clear() }
        super.onDestroyView()
        _binding = null
    }

    companion object {
        private const val MAX_PENDING_ON_SERVER = 1
        
        private const val MIN_MINING_COOLDOWN_MS = 400L
        
        private const val MINING_FLOAT_DURATION_MS = 1820L
        private const val MINING_FLOAT_TRANSLATE_Y_PX = -494f

        private enum class RefillPendingResult { Success, BlockRateLimited, Failed }
    }

    
    private suspend fun refillPendingMiningSlots(
        miningNodes: List<String>,
        address: String,
        pubKey: String,
        @Suppress("UNUSED_PARAMETER") batchSize: Int
    ): RefillPendingResult = withContext(Dispatchers.IO) {
        val nonce = Random.nextInt(0, Int.MAX_VALUE).toString()
        val commitment = sha256Hex(nonce.toByteArray())
        for (url in miningNodes) {
            when (val o = api.requestChallengeFrom(url, address, pubKey, commitment)) {
                is ChallengeRequestOutcome.Success -> {
                    val ch = o.challenge
                    synchronized(pendingMiningLock) {
                        pendingMiningSlots.addLast(Triple(nonce, ch, url))
                    }
                    return@withContext RefillPendingResult.Success
                }
                ChallengeRequestOutcome.BlockRateLimited ->
                    return@withContext RefillPendingResult.BlockRateLimited
                ChallengeRequestOutcome.Failed -> { }
            }
        }
        return@withContext if (synchronized(pendingMiningLock) { pendingMiningSlots.isNotEmpty() }) {
            RefillPendingResult.Success
        } else {
            RefillPendingResult.Failed
        }
    }
}


