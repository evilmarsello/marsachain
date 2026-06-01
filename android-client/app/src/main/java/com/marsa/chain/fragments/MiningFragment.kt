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
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentMiningBinding
import com.marsa.chain.network.ApiClient
import com.marsa.chain.network.ChallengeRequestOutcome
import com.marsa.chain.network.MiningApi
import com.marsa.chain.network.ChallengeResponse
import com.marsa.chain.network.MiningSubmitRequest
import com.marsa.chain.manager.WalletManager
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
    private lateinit var prefs: SharedPreferences
    private var blocksMined = 0
    private var totalRewards = 0L
    private var miningInProgress = false
    /** Last attempt finished (finally) — tap rate limit. */
    private var lastMiningTapCompletedAtMs = 0L
    private var progressRingJob: Job? = null
    
    // MINER_STAKE: mining stake info
    private var minerStakeInfo: com.marsa.chain.network.MinerStakeInfoDTO? = null

    /** nonce, challenge, node baseUrl (challenge lives in this node's memory). Matches MAX_PENDING_CHALLENGES on server. */
    private val pendingMiningSlots = ArrayDeque<Triple<String, ChallengeResponse, String>>()
    private val pendingMiningLock = Any()

    /** Last mining button tap coordinates (screen) so chip appears at press point. -1 = unset. */
    private var lastMiningTapScreenX: Float = -1f
    private var lastMiningTapScreenY: Float = -1f

    /** Current Toast — cancel before new, show at most 1s so messages do not stack. */
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

    /** Hash and mining result: appears at tap point and moves up quickly. */
    private fun showMiningResultFloating(hashHex: String, success: Boolean, rewardMrs: String? = null) {
        if (!isAdded || _binding == null) return
        val content = activity?.window?.decorView?.findViewById<ViewGroup>(android.R.id.content) ?: return
        val miningBtn = binding.miningButton
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
        
        // Start periodic block height refresh every 5 seconds
        startHeightUpdates()
    }
    
    override fun onPause() {
        super.onPause()
        // Stop block height refresh on pause
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
                    // Tap spam at 0 credits — without this UI won't refresh after REFILL_BLOCK until leaving screen
                    // (loadMinerStakeInfo was only called from loadData / mining).
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
        
        // Mining button: tap without hold, press animation
        binding.miningButton.setOnTouchListener { v, event ->
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
        
        // UI setup complete
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
    
    /**
     * Loads MINER_STAKE info for active wallet
     */
    private suspend fun loadMinerStakeInfo() {
        try {
            val activeWallet = withContext(Dispatchers.IO) {
                walletManager.getActiveWallet()
            }
            
            if (activeWallet == null) {
                android.util.Log.w("MiningFragment", "No active wallet, cannot load miner stake info")
                updateMinerStakeUI(null)
                return
            }
            
            val fresh = api.getMiningInfo(activeWallet.address)
            if (_binding == null) return
            if (fresh != null) {
                minerStakeInfo = fresh
                updateMinerStakeUI(minerStakeInfo)
            } else {
                // Cache only for same address — else after wallet switch wrong stake/credits would show,
                // and challenge would go to new address → Challenge failed on server.
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
    
    /** Gray label, white value (number). */
    private fun labelGrayValueWhite(label: String, value: String): CharSequence {
        val full = label + value
        return SpannableStringBuilder(full).apply {
            setSpan(ForegroundColorSpan(Color.parseColor("#8E8E93")), 0, label.length, 0)
            setSpan(ForegroundColorSpan(Color.WHITE), label.length, full.length, 0)
        }
    }

    /**
     * Updates UI from MINER_STAKE info
     */
    private fun updateMinerStakeUI(info: com.marsa.chain.network.MinerStakeInfoDTO?) {
        if (_binding == null) return
        if (info == null || !info.has_stake) {
            binding.minerStakeStatusText?.text = labelGrayValueWhite("Mining Stake: ", "Not Active")
            
            // Hide credits counter
            binding.miningCreditsText?.visibility = View.GONE
            
            // Show MINER_STAKE creation message
            binding.creditsRefillText?.text = "Create MINER_STAKE to start mining"
            binding.creditsRefillText?.visibility = View.VISIBLE
            
            binding.miningButton.isEnabled = false
            
            // Show dark overlay for dimming
            binding.miningButtonDimOverlay?.visibility = View.VISIBLE
            
            // Show MINER_STAKE create overlay button
            binding.createMinerStakeButton?.visibility = View.VISIBLE
            binding.createMinerStakeButton?.setOnClickListener {
                showCreateMinerStakeDialog()
            }
            
            // Hide unlock text and cost per credit
            binding.minerStakeUnlockText?.visibility = View.GONE
            binding.minerStakeCostPerCreditText?.visibility = View.GONE
            
            binding.miningBlockRateText?.visibility = View.GONE
            
        } else {
            // Case B/C: active MINER_STAKE
            val stakedFormatted = info.staked_amount_formatted ?: "0"
            val creditsLeft = info.available_credits ?: 0
            val totalCredits = info.total_credits_per_window ?: 0
            val blocksUntilRefill = info.blocks_until_refill ?: 0
            val secondsUntilRefill = blocksUntilRefill * 15 // ~15 sec per block
            
            binding.minerStakeStatusText?.text = labelGrayValueWhite("Mining Stake: ", "$stakedFormatted MRS")
            
            // Cost of 1 credit (1 hash attempt) — fixed at stake creation
            val costFormatted = info.freeze_cost_formatted ?: "—"
            binding.minerStakeCostPerCreditText?.text = labelGrayValueWhite("1 credit (1 hash): ", "$costFormatted MRS")
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
                    labelGrayValueWhite("MINER_UNSTAKE: ", "available now")
                inferredBlock > 0 ->
                    labelGrayValueWhite("MINER_UNSTAKE available: ", "$inferredBlock")
                else -> null
            }
            if (unlockLabelText != null) {
                binding.minerStakeUnlockText?.text = unlockLabelText
                binding.minerStakeUnlockText?.visibility = View.VISIBLE
            } else {
                binding.minerStakeUnlockText?.visibility = View.GONE
            }
            
            // Show credits below button (same as other fields: gray label, white value)
            if (creditsLeft > 0) {
                // Case B: credits in window
                binding.miningCreditsText?.text =
                    labelGrayValueWhite("Mining Credits: ", "$creditsLeft / $totalCredits")
                binding.miningCreditsText?.visibility = View.VISIBLE

                binding.creditsRefillText?.visibility = View.GONE
                binding.miningButton.isEnabled = true
            } else {
                // Case C: credits exhausted
                binding.miningCreditsText?.text =
                    labelGrayValueWhite("Mining Credits: ", "0 / $totalCredits")
                binding.miningCreditsText?.visibility = View.VISIBLE
                
                // Show refill message only when credits exhausted
                binding.creditsRefillText?.text = "Wait for refill: $blocksUntilRefill blocks (~${secondsUntilRefill}s)"
                binding.creditsRefillText?.visibility = View.VISIBLE
                
                binding.miningButton.isEnabled = false
            }

            binding.miningBlockRateText?.visibility = View.GONE
            
            // Hide dark overlay
            binding.miningButtonDimOverlay?.visibility = View.GONE
            
            // Hide MINER_STAKE create overlay button
            binding.createMinerStakeButton?.visibility = View.GONE
        }
    }

    /** After mining attempt: re-enable button only if credits remain. */
    private fun applyMiningButtonEnabledAfterAttempt() {
        if (_binding == null) return
        val info = minerStakeInfo
        if (info != null && info.has_stake) {
            val creditsLeft = info.available_credits ?: 0
            binding.miningButton.isEnabled = creditsLeft > 0
        }
    }
    
    /**
     * Shows MINER_STAKE transaction dialog
     */
    private fun showCreateMinerStakeDialog() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val activeWallet = withContext(Dispatchers.IO) {
                    walletManager.getActiveWallet()
                }
                if (activeWallet == null) {
                    showShortToast("No active wallet found")
                    return@launch
                }
                val currentBalance = withContext(Dispatchers.IO) {
                    walletManager.getWalletBalance(activeWallet.address)
                }
                if (_binding == null) return@launch
                val balanceFormatted = CoinFormatter.format(currentBalance)
                
                // Read params from mining_info
                val minStakeAmount = minerStakeInfo?.min_stake_amount ?: (100L * CoinFormatter.WEI_PER_COIN) // 100 coins in wei
                // Duration set by node (120 blocks), client cannot change
                val duration = 120 // blocks (matches MINER_STAKE_DURATION on node)
                val unlockBlock = (minerStakeInfo?.current_height ?: 0) + duration
                
                // Create dialog with custom layout
                val dialogView = layoutInflater.inflate(R.layout.dialog_create_miner_stake, null)
                
                val tvBalanceInfo = dialogView.findViewById<android.widget.TextView>(R.id.tvBalanceInfo)
                val etStakeAmount = dialogView.findViewById<android.widget.EditText>(R.id.etStakeAmount)
                
                tvBalanceInfo.text = "Your Balance: $balanceFormatted MRS"
                
                val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
                    .setView(dialogView)
                    .create()
                
                // Remove white corner background
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
                            showShortToast("Invalid amount")
                        }
                    } else {
                        showShortToast("Enter amount")
                    }
                }
                
                dialog.show()
                
            } catch (e: Exception) {
                showShortToast("Error: ${e.message}")
            }
        }
    }
    
    /**
     * Creates and sends MINER_STAKE transaction.
     */
    private fun createMinerStakeTransaction(
        wallet: com.marsa.chain.data.WalletInfo,
        stakeAmount: Long
    ) {
        viewLifecycleOwner.lifecycleScope.launch stakeSend@{
            try {
                val minStakeAmount = minerStakeInfo?.min_stake_amount ?: (100L * CoinFormatter.WEI_PER_COIN)
                if (stakeAmount < minStakeAmount) {
                    showShortToast("Min: ${CoinFormatter.format(minStakeAmount)} MRS")
                    return@stakeSend
                }
                val currentBalance = withContext(Dispatchers.IO) {
                    walletManager.getWalletBalance(wallet.address)
                }
                if (stakeAmount > currentBalance) {
                    showShortToast("Insufficient balance")
                    return@stakeSend
                }
                val status = api.getStatus()
                if (_binding == null) return@stakeSend
                val currentHeight = (status?.get("height") as? Int) ?: 0
                val fee = 0L
                
                // Build transaction (do NOT pass duration — set by node)
                val txRequest = createMinerStakeTransactionRequest(
                    wallet.address,
                    wallet.publicKey,
                    wallet.privateKey,
                    stakeAmount,
                    fee,
                    currentHeight
                )
                
                showShortToast("Sending...")
                
                val result = api.submitTransaction(txRequest)
                
                if (result != null) {
                    showShortToast("Sent. Mining to confirm...")
                    
                    // Refresh balance (fee = 0, subtract only stakeAmount)
                    withContext(Dispatchers.IO) {
                        walletManager.updateWalletBalance(wallet.address, currentBalance - stakeAmount)
                    }
                    
                    // Refresh UI immediately
                    loadBalanceData()
                    
                    viewLifecycleOwner.lifecycleScope.launch confirmStake@{
                        var confirmed = false
                        for (attempt in 1..20) {
                            delay(2000)
                            if (_binding == null) return@confirmStake
                            val info = api.getMiningInfo(wallet.address)
                            if (info?.has_stake == true) {
                                confirmed = true
                                showShortToast("Stake confirmed")
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
                    showShortToast("Tx failed")
                }
                
            } catch (e: Exception) {
                showShortToast("Error: ${e.message}")
                android.util.Log.e("MiningFragment", "Error creating MINER_STAKE", e)
            }
        }
    }
    
    /**
     * Builds TransactionRequest for MINER_STAKE
     */
    private fun createMinerStakeTransactionRequest(
        from: String,
        publicKey: String,
        privateKey: String,
        stakeAmount: Long,
        fee: Long,
        currentHeight: Int
    ): com.marsa.chain.network.TransactionRequest {
        // STEP 1: build txid data
        val txidData = StringBuilder()
        txidData.append(from).append(fee.toString()) // Fee only (value=0 for MINER_STAKE)
        txidData.append(from).append("0") // to=from, value=0
        txidData.append(fee.toString())
        txidData.append("10") // tx_type = 10 for MINER_STAKE
        txidData.append(stakeAmount.toString()) // data = stake amount
        
        // STEP 2: compute txid (SHA256)
        val txidBytes = java.security.MessageDigest.getInstance("SHA-256")
            .digest(txidData.toString().toByteArray())
        val txid = txidBytes.joinToString("") { String.format("%02x", it) }
        
        // STEP 3: sign txid
        val keyPair = com.marsa.chain.crypto.KeyPair.fromPrivateKey(privateKey)
            ?: throw Exception("Failed to create KeyPair")
        
        val signatureBytes = keyPair.sign(txid.toByteArray())
            ?: throw Exception("Failed to sign transaction")
        
        val signature = Base64.encodeToString(signatureBytes, Base64.NO_WRAP)
        
        // STEP 4: build transaction with metadata (same as STAKE transactions)
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
                    value = 0, // For MINER_STAKE value=0 (coins frozen, not transferred)
                    address = from // Owner address
                )
            ),
            fee = fee,
            tx_type = 10, // MINER_STAKE
            data = stakeAmount.toString(), // Stake amount in data (wei)
            metadata = mapOf(
                // Do NOT pass duration — set by node (MINER_STAKE_DURATION)
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
            binding.miningButton.isEnabled = false
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
                    showShortToast("No active wallet")
                    return@miningTap
                }
                val address = activeWallet.address
                val pubKey = activeWallet.publicKey

                // Wallet switch: reset challenge queue (bound to address on node).
                if (minerStakeInfo?.address != address) {
                    synchronized(pendingMiningLock) { pendingMiningSlots.clear() }
                    loadMinerStakeInfo()
                }
                val infoAfter = minerStakeInfo
                if (infoAfter == null || infoAfter.address != address || !infoAfter.has_stake) {
                    showShortToast("Create MINER_STAKE first")
                    return@miningTap
                }
                val creditsAfter = infoAfter.available_credits ?: 0
                if (creditsAfter <= 0) {
                    val blocksUntilRefill = infoAfter.blocks_until_refill ?: 0
                    showShortToast("No credits. Refill in $blocksUntilRefill blocks")
                    return@miningTap
                }
                refreshMiningInfoAfterTap = true

                val miningNodes = api.getMiningNodesOrdered()
                if (miningNodes.isEmpty()) {
                    showShortToast("No validator nodes")
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
                            showShortToast("Challenge failed")
                            return@miningTap
                        }
                        RefillPendingResult.Success -> {
                            loadMinerStakeInfo()
                        }
                    }
                    synchronized(pendingMiningLock) {
                        pendingMiningSlots.removeFirstOrNull()
                    } ?: run {
                        showShortToast("Challenge failed")
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
                    showShortToast("Status failed")
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
                        // One animation per real attempt (one challenge → one verified hash).
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
                    showShortToast("Sign failed")
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
                    // PoW OK locally, block rejected — no flying chip (not failed PoW).
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
    
    /**
     * Computes block reward from height with halving
     * Uses same logic as server (Reward::getBlockReward)
     * 
     * @param height Block height
     * @return Reward in nanos (90% of full reward; 10% to validators)
     */
    private fun calculateBlockReward(height: Int): Long {
        // Constants from server
        val INITIAL_REWARD = CoinFormatter.coinsToNanos(10000.0) // same as Reward::INITIAL_REWARD on the node
        val HALVING_INTERVAL = 1_050_000 // same as Reward::HALVING_INTERVAL on the node
        val MIN_REWARD = INITIAL_REWARD / 10 // Minimum 10% of initial reward
        
        if (height == 0) {
            // Genesis block
            val fullReward = INITIAL_REWARD
            return (fullReward * 0.9).toLong() // Miner gets 90%
        }
        
        // Compute halving count
        val halvingCount = (height - 1) / HALVING_INTERVAL
        
        if (halvingCount == 0) {
            val fullReward = INITIAL_REWARD
            return (fullReward * 0.9).toLong() // Miner gets 90%
        }
        
        // Progressive halving: 50% → 40% → 30% → 20% → 10% (floor)
        var reward = INITIAL_REWARD.toDouble()
        val minReward = MIN_REWARD.toDouble()
        
        // Apply halvings with progressive reduction
        for (i in 1..halvingCount) {
            val reductionPercent = getReductionPercent(i)
            reward = reward * (1.0 - reductionPercent)
            
            // Never go below minimum (10% of initial reward)
            if (reward < minReward) {
                reward = minReward
                break // Hit minimum, stop reducing
            }
        }
        
        // Miner gets 90% of full reward (10% to validators)
        return (reward * 0.9).toLong()
    }
    
    /**
     * Returns reward reduction percent for a given halving
     * 1st halving: 50%, 2nd: 40%, 3rd: 30%, 4th: 20%, 5th+: 10%
     */
    private fun getReductionPercent(halvingNumber: Int): Double {
        return when (halvingNumber) {
            1 -> 0.50 // 50%
            2 -> 0.40 // 40%
            3 -> 0.30 // 30%
            4 -> 0.20 // 20%
            else -> 0.10 // 10% for all later
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
        /** Minimum between attempt end and new tap (ms). */
        private const val MIN_MINING_COOLDOWN_MS = 400L
        /** Flying chip: was 1400ms / 380px Y; +30% time and distance → same speed, goes higher. */
        private const val MINING_FLOAT_DURATION_MS = 1820L
        private const val MINING_FLOAT_TRANSLATE_Y_PX = -494f

        private enum class RefillPendingResult { Success, BlockRateLimited, Failed }
    }

    /**
     * One challenge at a time: POST /mining/challenge/request (node drops previous unused).
     */
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


