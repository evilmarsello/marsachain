package com.marsa.chain.fragments

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import android.text.TextWatcher
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentWalletBinding
import com.marsa.chain.network.ApiClient
import com.marsa.chain.network.TransactionRequest
import com.marsa.chain.network.TransactionInput
import com.marsa.chain.utils.AddressValidator
import com.marsa.chain.network.TransactionOutput
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.manager.WalletPreferences
import com.marsa.chain.manager.TransactionManager
import com.marsa.chain.data.TransactionEntity
import com.marsa.chain.data.WalletInfo
import com.marsa.chain.MainActivity
import com.marsa.chain.ui.CloudPopup
import com.marsa.chain.utils.CoinFormatter
import com.marsa.chain.crypto.KeyPair
import android.util.Base64

class WalletFragment : Fragment() {
    private var _binding: FragmentWalletBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var api: ApiClient
    private lateinit var walletManager: WalletManager
    private lateinit var walletPreferences: WalletPreferences
    private lateinit var transactionManager: TransactionManager
    
    // Minimum fee: same logic as Reward::getMinimumTransactionFee (fullnode/include/Reward.h).
    private fun computeMinFeeCoins(height: Int): Double {
        val initial = 1.0 // 1 coin; on node INITIAL_MIN_FEE = 1 * WEI_PER_COIN
        if (height <= 0) return initial
        // Must match Reward::HALVING_INTERVAL (1_050_000), else empty fee field
        // client sends too-low min (e.g. 0.21 at height 92 with wrong interval=30).
        val interval = 1_050_000
        val halvingCount = (height - 1) / interval
        var fee = initial
        for (i in 1..halvingCount) {
            val reduction = when (i) {
                1 -> 0.50
                2 -> 0.40
                3 -> 0.30
                4 -> 0.20
                else -> 0.10
            }
            fee *= (1.0 - reduction)
        }
        return fee
    }
    
    // Safe function to show Toast (Room/network often on Dispatchers.IO — Toast only on main thread)
    private fun showToast(message: String) {
        if (!isAdded || context == null) return
        val appCtx = requireContext().applicationContext
        val show = {
            if (isAdded) Toast.makeText(appCtx, message, Toast.LENGTH_SHORT).show()
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            show()
        } else {
            Handler(Looper.getMainLooper()).post(show)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentWalletBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        // Initialize components
        api = ApiClient(requireContext())
        walletManager = WalletManager(requireContext())
        walletPreferences = WalletPreferences(requireContext())
        transactionManager = TransactionManager(requireContext())
        
        setupUI()
        loadBalance()
    }

    private fun setupUI() {
        // Load initial balance
        loadBalance()
        
        // Button listeners
        binding.sendButton.setOnClickListener {
            showSendMoneyDialog()
        }
        
        binding.receiveButton.setOnClickListener {
            if (isAdded && !isDetached) {
            showReceiveDialog()
            }
        }
        
        
        binding.transactionHistoryButton.setOnClickListener {
            // Open History via MainActivity for correct navigation
            val mainActivity = requireActivity() as? MainActivity
            mainActivity?.showHistoryFragment()
        }
        
        binding.importWalletButton.setOnClickListener {
            importWallet()
        }

        binding.buttonCreateWalletRow.setOnClickListener {
            createNewWalletFromWalletTab()
        }
        binding.buttonViewAllWalletsRow.setOnClickListener {
            showAllWalletsFromWalletTab()
        }
        binding.buttonWalletMiningPoolsRow.setOnClickListener { v ->
            CloudPopup.showInfoBelow(
                v,
                "Mining pools",
                "Pooling hash power with other miners will be added in a future release.\n\n" +
                    "For now you mine against the node directly (solo mining; rewards are credited per address)."
            )
        }
        binding.buttonWalletSettingsRow.setOnClickListener {
            (requireActivity() as? MainActivity)?.showWalletSettingsFragment()
        }
        
        // Remove demo txs; use real history data
    }

    override fun onResume() {
        super.onResume()
        // Update API client with latest connection settings
        api.updateBaseUrl(requireContext())
        loadBalance()
    }

    private fun loadBalance() {
        lifecycleScope.launch {
            loadBalanceData(updateFromServer = true)
        }
    }

    
    private suspend fun loadBalanceData(updateFromServer: Boolean = true) {
        try {
            // Get total balance from all wallets (database operation) - run in IO dispatcher
            val totalBalance = withContext(Dispatchers.IO) {
                walletManager.getTotalBalance()
            }
            android.util.Log.d("WalletFragment", "Initial total balance: $totalBalance nanos")
            binding.walletBalanceText.text = CoinFormatter.format(totalBalance)
            
            if (updateFromServer) {
                // Update individual wallet balances from server
                val wallets = withContext(Dispatchers.IO) {
                    walletManager.getAllWallets().first()
                }
                android.util.Log.d("WalletFragment", "Found ${wallets.size} wallets")
                
                for (wallet in wallets) {
                    android.util.Log.d("WalletFragment", "Checking balance for wallet: ${wallet.address}")
                    val balanceResp = api.getBalance(wallet.address)
                if (balanceResp != null) {
                        android.util.Log.d("WalletFragment", "Server balance for ${wallet.address}: ${balanceResp.balance}")
                        withContext(Dispatchers.IO) {
                            walletManager.updateWalletBalance(wallet.address, balanceResp.balance)
                        }
                    } else {
                        // If wallet not on server, set balance 0
                        android.util.Log.w("WalletFragment", "Wallet ${wallet.address} not found on server, setting balance to 0")
                        withContext(Dispatchers.IO) {
                            walletManager.updateWalletBalance(wallet.address, 0L)
                        }
                    }
                }
                
                // Refresh total balance after updating individual balances
                val updatedTotalBalance = withContext(Dispatchers.IO) {
                    walletManager.getTotalBalance()
                }
                android.util.Log.d("WalletFragment", "Updated total balance: $updatedTotalBalance nanos")
                binding.walletBalanceText.text = CoinFormatter.formatWithSuffix(updatedTotalBalance)
            }
            
        } catch (e: Exception) {
            android.util.Log.e("WalletFragment", "Error loading balance: ${e.message}")
        }
    }

    /** Paste first text clip from clipboard into field. */
    private fun pasteClipboardPlainTextInto(target: EditText) {
        val cm = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = cm.primaryClip ?: return
        if (clip.itemCount <= 0) return
        val text = clip.getItemAt(0).coerceToText(requireContext())?.toString()?.trim() ?: return
        if (text.isEmpty()) return
        target.setText(text)
        try {
            target.setSelection(text.length)
        } catch (_: IndexOutOfBoundsException) {
        }
    }

    private fun showSendMoneyDialog() {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_send_money, null)

        val etRecipient = dialogView.findViewById<EditText>(R.id.etRecipientAddress)
        val etAmount = dialogView.findViewById<EditText>(R.id.etAmount)
        val etFee = dialogView.findViewById<EditText>(R.id.etFee)
        val tvOwnWalletWarning = dialogView.findViewById<TextView>(R.id.tvOwnWalletWarning)
        val tvHighFeeWarning = dialogView.findViewById<TextView>(R.id.tvHighFeeWarning)
        val btnPasteRecipientAddress = dialogView.findViewById<TextView>(R.id.btnPastePrivateKey)

        btnPasteRecipientAddress.setOnClickListener {
            pasteClipboardPlainTextInto(etRecipient)
        }

        etFee.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                val raw = s?.toString()?.trim()?.replace(',', '.') ?: ""
                val feeMrs = raw.toDoubleOrNull()
                tvHighFeeWarning.visibility =
                    if (feeMrs != null && feeMrs > 1.0) View.VISIBLE else View.GONE
            }
        })
        
        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        
        // ✅ Remove white corner background
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        // Add real-time warning for own wallets
        lifecycleScope.launch {
            try {
                val userWallets = withContext(Dispatchers.IO) {
                    walletManager.getAllWallets().first().map { it.address }
                }
                
                etRecipient.addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                    override fun afterTextChanged(s: android.text.Editable?) {
                        val address = s?.toString()?.trim() ?: ""
                        
                        if (address.isEmpty()) {
                            // Empty field — hide all warnings
                            tvOwnWalletWarning.visibility = View.GONE
                        } else if (!AddressValidator.isValidAddress(address)) {
                            // Invalid address — show validation error
                            tvOwnWalletWarning.text = "Address must start with 'mrs' and be 43 characters long"
                            tvOwnWalletWarning.visibility = View.VISIBLE
                        } else if (AddressValidator.isOwnWallet(address, userWallets)) {
                            // Valid address but yours — show warning
                            tvOwnWalletWarning.text = "This is one of your own wallets"
                            tvOwnWalletWarning.visibility = View.VISIBLE
                        } else {
                            // Valid foreign address — hide warnings
                            tvOwnWalletWarning.visibility = View.GONE
                        }
                    }
                })
            } catch (e: Exception) {
                // Handle error silently
            }
        }

        dialogView.findViewById<View>(R.id.btnCancel).setOnClickListener {
            dialog.dismiss()
        }

        dialogView.findViewById<View>(R.id.btnSend).setOnClickListener {
            lifecycleScope.launch {
            val recipient = etRecipient.text.toString().trim()
            // Parse coins and convert to nanos
            val amountNanos = CoinFormatter.parseToNanos(etAmount.text.toString().trim()) ?: 0L
            val feeInput = etFee.text.toString().trim()
                // Get current height for minimum fee (same as on the node)
                val status = runCatching { api.getStatus() }.getOrNull()
                val height = (status?.get("height") as? Int) ?: 0
                val minFeeCoins = computeMinFeeCoins(height)
                val minFeeNanos = CoinFormatter.coinsToNanos(minFeeCoins.toDouble())
                val feeNanos = CoinFormatter.parseToNanos(feeInput) ?: minFeeNanos // Default minFee
            
            // Log for debugging (can remove later)
            android.util.Log.d("WalletFragment", "Fee input: '$feeInput' -> feeWei: $feeNanos (${feeNanos / CoinFormatter.WEI_PER_COIN.toDouble()} coins)")
            
            if (recipient.isEmpty()) {
                showToast("Please enter wallet address")
                    return@launch
            }

            // Validate address format
            if (!AddressValidator.isValidAddress(recipient)) {
                val errorMessage = AddressValidator.getAddressErrorMessage(recipient)
                showToast(errorMessage)
                    return@launch
            }

            // Check if it's one of user's own wallets (warning only)
                try {
                    val userWallets = withContext(Dispatchers.IO) {
                        walletManager.getAllWallets().first().map { it.address }
                    }
                    if (AddressValidator.isOwnWallet(recipient, userWallets)) {
                        tvOwnWalletWarning.visibility = View.VISIBLE
                        showToast( "This is one of your own wallets")
                    } else {
                        tvOwnWalletWarning.visibility = View.GONE
                    }
                } catch (e: Exception) {
                    // Handle error silently
            }
            
            if (amountNanos <= 0) {
                showToast( "Please enter valid amount")
                    return@launch
            }
            
                if (feeNanos < minFeeNanos) {
                    showToast( "Fee must be at least ${minFeeCoins} MRS (halving-based)")
                    return@launch
            }
            
            dialog.dismiss()
            sendTransaction(recipient, amountNanos, feeNanos)
            }
        }
        
        dialog.show()
    }


    private fun showReceiveDialog() {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_receive_money, null)

        val addressText = dialogView.findViewById<TextView>(R.id.addressText)
        val copyButton = dialogView.findViewById<ImageView>(R.id.copyButton)
        var currentAddress = "..."
        
        lifecycleScope.launch {
            val activeWallet = walletManager.getActiveWallet()
            val address = activeWallet?.address ?: "No active wallet"
            
            currentAddress = address
            addressText.text = address
        }

        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()

        // ✅ Remove white corner background
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<View>(R.id.btnCancel).setOnClickListener {
            dialog.dismiss()
        }

        copyButton.setOnClickListener {
            val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Address", currentAddress)
                clipboard.setPrimaryClip(clip)
            showToast( "Address copied to clipboard")
        }

        dialogView.findViewById<View>(R.id.btnShare).setOnClickListener {
            val shareIntent = Intent().apply {
                action = Intent.ACTION_SEND
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, "Send MRS to: $currentAddress")
            }
            startActivity(Intent.createChooser(shareIntent, "Share Address"))
            dialog.dismiss()
        }

        dialog.show()
    }

    private fun refreshBalance() {
        lifecycleScope.launch {
            try {
                val activeWallet = walletManager.getActiveWallet()
                if (activeWallet != null) {
                    val balanceResp = api.getBalance(activeWallet.address)
                if (balanceResp != null) {
                        withContext(Dispatchers.IO) {
                            walletManager.updateWalletBalance(activeWallet.address, balanceResp.balance)
                        }
                        
                        // Update total balance display
                        val totalBalance = withContext(Dispatchers.IO) {
                            walletManager.getTotalBalance()
                        }
                        binding.walletBalanceText.text = CoinFormatter.format(totalBalance)
                        showToast( "Balance refreshed: ${CoinFormatter.format(totalBalance)} MRS")
                    } else {
                        showToast( "Failed to refresh balance")
                    }
                } else {
                    showToast( "No active wallet found")
                }
            } catch (e: Exception) {
                showToast( "Error: ${e.message}")
            }
        }
    }
    
    private fun updateBalanceAfterTransaction() {
        lifecycleScope.launch {
            loadBalanceData(updateFromServer = false)
        }
    }


    private fun showTransactionDetails(transaction: TransactionEntity) {
        val message = buildString {
            appendLine("Transaction ID: ${transaction.txid}")
            appendLine("Type: ${transaction.type}")
            appendLine("Amount: ${CoinFormatter.format(transaction.amount)} MRS")
            appendLine("Fee: ${CoinFormatter.format(transaction.fee)} MRS")
            appendLine("From: ${transaction.fromAddress}")
            appendLine("To: ${transaction.toAddress}")
            appendLine("Status: ${transaction.status}")
            appendLine("Confirmations: ${transaction.confirmations}")
            appendLine("Time: ${java.text.SimpleDateFormat("MMM dd, yyyy HH:mm", java.util.Locale.getDefault()).format(java.util.Date(transaction.timestamp))}")
        }
        
        AlertDialog.Builder(requireContext())
            .setTitle("Transaction Details")
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show()
    }

    private fun sendTransaction(recipient: String, amount: Long, fee: Long) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val activeWallet = walletManager.getActiveWallet()
                if (activeWallet == null) {
                    showToast("No active wallet found. Please go to Wallets and set an active wallet.")
                    return@launch
                }

                if (!AddressValidator.isValidAddress(recipient)) {
                    val errorMessage = AddressValidator.getAddressErrorMessage(recipient)
                    showToast(errorMessage)
                    return@launch
                }

                val allWallets = walletManager.getAllWallets().first()

                if (!walletPreferences.autoCascadeSend) {
                    val bal = walletManager.getWalletBalance(activeWallet.address)
                    if (bal < amount + fee) {
                        showToast("Недостаточно средств на активном кошельке (включая комиссию).")
                        return@launch
                    }
                    if (!submitSignedSendLeg(activeWallet, recipient, amount, fee)) {
                        showToast("Не удалось отправить транзакцию")
                    } else {
                        showToast("Транзакция отправлена")
                        updateBalanceAfterTransaction()
                    }
                    return@launch
                }

                val legs = walletManager.planCascadeLegs(activeWallet, allWallets, amount, fee)
                if (legs == null) {
                    showToast("Недостаточно средств на всех кошельках (с учётом комиссии за каждую транзакцию).")
                    return@launch
                }

                var step = 0
                for (leg in legs) {
                    step++
                    if (!submitSignedSendLeg(leg.wallet, recipient, leg.amountToRecipient, leg.fee)) {
                        showToast("Ошибка отправки (шаг $step из ${legs.size})")
                        return@launch
                    }
                }
                showToast(if (legs.size > 1) "Отправлено ${legs.size} транзакций" else "Транзакция отправлена")
                updateBalanceAfterTransaction()
            } catch (e: Exception) {
                showToast("Error sending transaction: ${e.message}")
            }
        }
    }

    private suspend fun submitSignedSendLeg(
        wallet: WalletInfo,
        recipient: String,
        amount: Long,
        fee: Long
    ): Boolean {
        val transactionRequest = createTransaction(
            wallet.address,
            recipient,
            amount,
            fee,
            wallet.publicKey,
            wallet.privateKey
        )
        api.submitTransaction(transactionRequest) ?: return false
        val transaction = transactionManager.createSendTransaction(
            txid = transactionRequest.txid,
            fromAddress = wallet.address,
            toAddress = recipient,
            amount = amount,
            fee = fee
        )
        transactionManager.addTransaction(transaction)
        withContext(Dispatchers.IO) {
            val currentBalance = walletManager.getWalletBalance(wallet.address)
            walletManager.updateWalletBalance(wallet.address, currentBalance - amount - fee)
        }
        return true
    }

    // Like TON/Ethereum: build and sign tx locally (private key never leaves client)
    private fun createTransaction(from: String, to: String, amount: Long, fee: Long, publicKey: String, privateKey: String): TransactionRequest {
        // STEP 1: build unsigned tx to compute txid
        // txid from all tx fields (inputs, outputs, fee, tx_type) WITHOUT signature
        val txidData = StringBuilder()
        txidData.append(from).append((amount + fee).toString())
        txidData.append(to).append(amount.toString())
        txidData.append(fee.toString())
        txidData.append("0") // tx_type = 0 for REGULAR txs
        
        // STEP 2: compute SHA256 hash (txid) - same as GUI
        val txidBytes = java.security.MessageDigest.getInstance("SHA-256")
            .digest(txidData.toString().toByteArray())
        val txid = txidBytes.joinToString("") { String.format("%02x", it) }
        
        // STEP 3: sign txid with Ed25519 (same as GUI and TON/Ethereum)
        val keyPair = KeyPair.fromPrivateKey(privateKey)
        if (keyPair == null) {
            throw Exception("Failed to create KeyPair from private key")
        }
        
        val signatureBytes = keyPair.sign(txid.toByteArray())
        if (signatureBytes == null) {
            throw Exception("Failed to sign transaction")
        }
        
        // Encode signature as base64
        val signature = Base64.encodeToString(signatureBytes, Base64.NO_WRAP)
        
        return TransactionRequest(
            txid = txid,
            inputs = listOf(
                TransactionInput(
                    address = from,
                    amount = amount + fee,
                    signature = signature, // Like TON/Ethereum: real Ed25519 txid signature
                    pubKey = publicKey
                )
            ),
            outputs = listOf(
                TransactionOutput(
                    value = amount,
                    address = to
                )
            ),
            fee = fee
        )
    }

    private fun addDemoTransactions() {
        lifecycleScope.launch {
            try {
                val activeWallet = walletManager.getActiveWallet()
                if (activeWallet != null) {
                    val address = activeWallet.address
                    
                    // Create several demo transactions
                    val demoTransactions = listOf(
                        transactionManager.createReceiveTransaction(
                            txid = "demo_receive_1",
                            fromAddress = "mrs_demo_sender_1",
                            toAddress = address,
                            amount = 1000L
                        ),
                        transactionManager.createSendTransaction(
                            txid = "demo_send_1",
                            fromAddress = address,
                            toAddress = "mrs_demo_recipient_1",
                            amount = 500L,
                            fee = 10L
                        ),
                        transactionManager.createMiningTransaction(
                            txid = "demo_mining_1",
                            minerAddress = address,
                            reward = CoinFormatter.coinsToNanos(9000.0), // miner share after 10% to validator
                            blockHeight = 1001
                        ),
                        transactionManager.createReceiveTransaction(
                            txid = "demo_receive_2",
                            fromAddress = "mrs_demo_sender_2",
                            toAddress = address,
                            amount = 250L
                        ),
                        transactionManager.createSendTransaction(
                            txid = "demo_send_2",
                            fromAddress = address,
                            toAddress = "mrs_demo_recipient_2",
                            amount = 100L,
                            fee = 5L
                        )
                    )
                    
                    // Add transactions to database
                    for (transaction in demoTransactions) {
                        transactionManager.addTransaction(transaction)
                    }
                    
                    android.util.Log.d("WalletFragment", "Added ${demoTransactions.size} demo transactions")
                }
            } catch (e: Exception) {
                android.util.Log.e("WalletFragment", "Error adding demo transactions: ${e.message}")
            }
        }
    }

    private fun createNewWalletFromWalletTab() {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_create_wallet, null)

        val etWalletName = dialogView.findViewById<EditText>(R.id.etWalletName)
        val btnCancel = dialogView.findViewById<TextView>(R.id.btnCancel)
        val btnCancelBottom = dialogView.findViewById<TextView>(R.id.btnCancelBottom)
        val btnCreate = dialogView.findViewById<TextView>(R.id.btnCreate)

        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()

        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        btnCancel.setOnClickListener { dialog.dismiss() }
        btnCancelBottom.setOnClickListener { dialog.dismiss() }

        btnCreate.setOnClickListener {
            val walletName = etWalletName.text.toString().trim()
            lifecycleScope.launch {
                try {
                    val newWallet = withContext(Dispatchers.IO) {
                        walletManager.createNewWallet(if (walletName.isNotEmpty()) walletName else null)
                    }
                    Toast.makeText(requireContext(), "New wallet created: ${newWallet.name}", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                    loadBalance()
                } catch (e: Exception) {
                    Toast.makeText(requireContext(), "Failed to create wallet: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        dialog.show()
    }

    private fun showAllWalletsFromWalletTab() {
        parentFragmentManager.beginTransaction()
            .replace(R.id.contentFrame, WalletsListFragment())
            .addToBackStack("wallets_list")
            .commit()
        (requireActivity() as? MainActivity)?.showBackButton("My Wallets")
    }

    private fun importWallet() {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_import_wallet, null)

        val etPrivateKey = dialogView.findViewById<EditText>(R.id.etPrivateKey)
        val etWalletName = dialogView.findViewById<EditText>(R.id.etWalletName)
        val tvStatusMessage = dialogView.findViewById<TextView>(R.id.tvStatusMessage)
        val btnPastePrivateKey = dialogView.findViewById<TextView>(R.id.btnPastePrivateKey)
        btnPastePrivateKey.setOnClickListener {
            pasteClipboardPlainTextInto(etPrivateKey)
        }

        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()

        // Remove white corner background
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        // Button handlers
        dialogView.findViewById<View>(R.id.btnCancel).setOnClickListener {
            dialog.dismiss()
        }

        dialogView.findViewById<View>(R.id.btnClose).setOnClickListener {
            dialog.dismiss()
        }

        dialogView.findViewById<View>(R.id.btnImport).setOnClickListener {
            val privateKey = etPrivateKey.text.toString().trim()
            val walletName = etWalletName.text.toString().trim()

            if (privateKey.isEmpty()) {
                showStatusMessage(tvStatusMessage, "Please enter a private key", false)
                return@setOnClickListener
            }

            // Show loading status
            showStatusMessage(tvStatusMessage, "🔄 Validating private key...", true)
            
            // Test address generation
            val testAddress = com.marsa.chain.crypto.KeyPair.testAddressGeneration(privateKey)
            android.util.Log.d("WalletFragment", "🔍 Test Address Generation:")
            android.util.Log.d("WalletFragment", "🔍 Private Key: $privateKey")
            android.util.Log.d("WalletFragment", "🔍 Generated Address: $testAddress")
            
            // Validate private key
            lifecycleScope.launch {
                try {
                    val isValid = walletManager.validatePrivateKey(privateKey)
                    if (!isValid) {
                        showStatusMessage(tvStatusMessage, "❌ Invalid private key format. Please check your key.", false)
                        return@launch
                    }

                    showStatusMessage(tvStatusMessage, "🔄 Importing wallet...", true)

                    // Import wallet
                    val importedWallet = walletManager.importWallet(
                        privateKey = privateKey,
                        name = if (walletName.isNotEmpty()) walletName else null
                    )

                    if (importedWallet != null) {
                        showStatusMessage(tvStatusMessage, "✅ Wallet imported successfully!", true)
                        
                        // Close dialog after 2 seconds
                        kotlinx.coroutines.delay(2000)
                        dialog.dismiss()
                        
                        showToast( "Wallet '${importedWallet.name}' imported successfully!\nAddress: ${importedWallet.address}")
                        
                        // Refresh balance after import
                        loadBalance()
                    } else {
                        showStatusMessage(tvStatusMessage, "❌ Failed to import wallet. It may already exist.", false)
                    }
                } catch (e: Exception) {
                    showStatusMessage(tvStatusMessage, "❌ Error importing wallet: ${e.message}", false)
                }
            }
        }

        dialog.show()
    }

    private fun showStatusMessage(textView: TextView, message: String, isSuccess: Boolean) {
        textView.text = message
        textView.visibility = View.VISIBLE
        textView.setTextColor(
            if (isSuccess) {
                requireContext().getColor(R.color.color_receive)
            } else {
                requireContext().getColor(R.color.color_failed)
            }
        )
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
