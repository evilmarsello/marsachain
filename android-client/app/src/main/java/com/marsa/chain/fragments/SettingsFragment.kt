package com.marsa.chain.fragments

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.marsa.chain.OnboardingActivity
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentSettingsBinding
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.ui.LocalePickerHelper
import com.marsa.chain.pool.PoolHelper
import com.marsa.chain.network.ApiClient
import com.marsa.chain.network.TransactionInput
import com.marsa.chain.network.TransactionOutput
import com.marsa.chain.network.TransactionRequest
import com.marsa.chain.crypto.KeyPair
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.security.MessageDigest

class SettingsFragment : Fragment() {
    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!

    private lateinit var walletManager: WalletManager
    private lateinit var api: ApiClient
    private var localePicker: LocalePickerHelper? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        walletManager = WalletManager(requireContext())
        api = ApiClient(requireContext())

        setupLocalePicker()
        setupUI()
    }

    override fun onResume() {
        super.onResume()
        refreshMinerUnstakeButtonState()
    }

    private fun setupLocalePicker() {
        val picker = binding.settingsLocalePicker
        localePicker = LocalePickerHelper(
            context = requireContext(),
            anchor = picker.localePickerRow,
            valueView = picker.localePickerValue,
            chevronView = picker.localePickerChevron,
            onLocaleChanged = { requireActivity().recreate() }
        ).also { it.bind() }
    }

    private fun setupUI() {
        binding.minerUnstakeButton.setOnClickListener {
            if (!binding.minerUnstakeButton.isEnabled) return@setOnClickListener
            viewLifecycleOwner.lifecycleScope.launch {
                val wallet = withContext(Dispatchers.IO) { walletManager.getActiveWallet() } ?: return@launch
                val info = withContext(Dispatchers.IO) { api.getMiningInfo(wallet.address) }
                if (PoolHelper.miningInfoIsPoolStake(info)) {
                    Toast.makeText(
                        requireContext(),
                        getString(R.string.settings_pool_unstake_blocked),
                        Toast.LENGTH_LONG
                    ).show()
                    return@launch
                }
                showMinerUnstakeDialog()
            }
        }

        binding.connectionsButton.setOnClickListener {
            showConnections()
        }

        binding.aboutButton.setOnClickListener {
            showAbout()
        }

        binding.aboutMarsaChainButton.setOnClickListener {
            showAboutMarsaChain()
        }

        binding.networkConfigButton.setOnClickListener {
            showNetworkConfig()
        }

        binding.socialMediaButton.setOnClickListener {
            showSocialMedia()
        }

        binding.resetWalletFromPhraseButton.setOnClickListener {
            showWalletResetConfirmDialog()
        }

        binding.settingsAppVersionText.text = readVersionNameFromPackage()
    }

    private fun showMinerUnstakeDialog() {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_miner_unstake_confirm, null, false)
        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialogView.findViewById<View>(R.id.btnMinerUnstakeClose).setOnClickListener { dialog.dismiss() }
        dialogView.findViewById<View>(R.id.btnMinerUnstakeCancel).setOnClickListener { dialog.dismiss() }
        dialogView.findViewById<View>(R.id.btnMinerUnstakeSend).setOnClickListener {
            dialog.dismiss()
            submitMinerUnstake()
        }
        dialog.show()
    }

    private fun refreshMinerUnstakeButtonState() {
        viewLifecycleOwner.lifecycleScope.launch {
            val active = withContext(Dispatchers.IO) { walletManager.getActiveWallet() }
            if (active == null) {
                binding.minerUnstakeButton.isEnabled = false
                binding.minerUnstakeButton.alpha = 0.45f
                return@launch
            }
            val info = withContext(Dispatchers.IO) { api.getMiningInfo(active.address) }
            val isPoolStake = PoolHelper.miningInfoIsPoolStake(info)
            val hasStake = info?.has_stake == true && !isPoolStake
            val canUnstake = info?.can_unstake != false
            val enabled = hasStake && canUnstake
            binding.minerUnstakeButton.isEnabled = enabled
            binding.minerUnstakeButton.alpha = if (enabled) 1f else 0.45f
        }
    }

    private fun submitMinerUnstake() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val wallet = withContext(Dispatchers.IO) { walletManager.getActiveWallet() }
                if (wallet == null) {
                    Toast.makeText(requireContext(), "No active wallet", Toast.LENGTH_SHORT).show()
                    return@launch
                }
                val mining = api.getMiningInfo(wallet.address)
                if (mining?.has_stake != true) {
                    Toast.makeText(requireContext(), "No active MINER_STAKE", Toast.LENGTH_SHORT).show()
                    refreshMinerUnstakeButtonState()
                    return@launch
                }
                if (mining.can_unstake == false) {
                    val left = mining.blocks_until_can_unstake ?: 0
                    Toast.makeText(
                        requireContext(),
                        "Minimum lock: wait $left more block(s)",
                        Toast.LENGTH_SHORT
                    ).show()
                    return@launch
                }
                val status = api.getStatus()
                val currentHeight = (status?.get("height") as? Number)?.toInt() ?: 0
                val tx = buildMinerUnstakeTransactionRequest(
                    wallet.address,
                    wallet.publicKey,
                    wallet.privateKey,
                    currentHeight
                )
                Toast.makeText(requireContext(), "Sending MINER_UNSTAKE…", Toast.LENGTH_SHORT).show()
                val result = api.submitTransaction(tx)
                if (result != null) {
                    Toast.makeText(requireContext(), "Sent. Wait for confirmation.", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(requireContext(), "Submit failed", Toast.LENGTH_SHORT).show()
                }
                refreshMinerUnstakeButtonState()
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    
    private fun buildMinerUnstakeTransactionRequest(
        from: String,
        publicKey: String,
        privateKey: String,
        currentHeight: Int
    ): TransactionRequest {
        val fee = 0L
        val txidData = StringBuilder()
        txidData.append(from).append(fee.toString())
        txidData.append(from).append("0")
        txidData.append(fee.toString())
        txidData.append("11")
        txidData.append("0")

        val txidBytes = MessageDigest.getInstance("SHA-256")
            .digest(txidData.toString().toByteArray())
        val txid = txidBytes.joinToString("") { String.format("%02x", it) }

        val keyPair = KeyPair.fromPrivateKey(privateKey)
            ?: throw IllegalStateException("Failed to create KeyPair")
        val signatureBytes = keyPair.sign(txid.toByteArray())
            ?: throw IllegalStateException("Failed to sign transaction")
        val signature = Base64.encodeToString(signatureBytes, Base64.NO_WRAP)

        return TransactionRequest(
            txid = txid,
            inputs = listOf(
                TransactionInput(
                    address = from,
                    amount = 0L,
                    signature = signature,
                    pubKey = publicKey
                )
            ),
            outputs = listOf(
                TransactionOutput(value = 0, address = from)
            ),
            fee = fee,
            tx_type = 11,
            data = "0",
            metadata = mapOf(
                "current_height" to currentHeight,
                "stake_type" to "miner"
            )
        )
    }

    private fun showWalletResetConfirmDialog() {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_wallet_reset_confirm, null, false)
        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        val btnContinue = dialogView.findViewById<LinearLayout>(R.id.btnResetContinue)
        val tvCountdown = dialogView.findViewById<TextView>(R.id.tvResetCountdown)

        fun resetContinueUiIdle() {
            tvCountdown.visibility = View.GONE
            tvCountdown.text = ""
        }

        var countdownJob: Job? = null
        var resetCompleted = false

        dialog.setCanceledOnTouchOutside(true)
        dialog.setOnDismissListener {
            countdownJob?.cancel()
            countdownJob = null
            if (!resetCompleted) resetContinueUiIdle()
        }

        dialogView.findViewById<View>(R.id.btnResetClose).setOnClickListener { dialog.dismiss() }
        dialogView.findViewById<View>(R.id.btnResetCancel).setOnClickListener { dialog.dismiss() }

        btnContinue.setOnClickListener {
            if (resetCompleted) return@setOnClickListener
            if (countdownJob?.isActive == true) return@setOnClickListener
            tvCountdown.visibility = View.VISIBLE
            countdownJob = viewLifecycleOwner.lifecycleScope.launch {
                try {
                    for (s in 5 downTo 1) {
                        tvCountdown.text = s.toString()
                        delay(1000)
                    }
                    if (!isAdded) return@launch
                    resetCompleted = true
                    dialog.dismiss()
                    val i = Intent(requireContext(), OnboardingActivity::class.java).apply {
                        putExtra(OnboardingActivity.EXTRA_FROM_SETTINGS_RESET, true)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    }
                    startActivity(i)
                    requireActivity().finish()
                } catch (_: CancellationException) {
                    resetContinueUiIdle()
                }
            }
        }
        dialog.show()
    }

    private fun showConnections() {
        parentFragmentManager.beginTransaction()
            .replace(R.id.contentFrame, ConnectionsFragment())
            .addToBackStack("connections")
            .commit()

        (requireActivity() as? com.marsa.chain.MainActivity)?.showBackButton(getString(R.string.title_connections))
    }

    private fun showAbout() {
        parentFragmentManager.beginTransaction()
            .replace(R.id.contentFrame, AboutFragment())
            .addToBackStack("about")
            .commit()
        (requireActivity() as? com.marsa.chain.MainActivity)?.showBackButton(getString(R.string.title_about))
    }

    private fun showAboutMarsaChain() {
        parentFragmentManager.beginTransaction()
            .replace(R.id.contentFrame, AboutMarsaChainFragment())
            .addToBackStack("about_marsa_chain")
            .commit()
        (requireActivity() as? com.marsa.chain.MainActivity)?.showBackButton(getString(R.string.title_about_marsa))
    }

    private fun showNetworkConfig() {
        parentFragmentManager.beginTransaction()
            .replace(R.id.contentFrame, NetworkConfigFragment())
            .addToBackStack("network_config")
            .commit()
        (requireActivity() as? com.marsa.chain.MainActivity)?.showBackButton(
            getString(R.string.network_config_title)
        )
    }

    private fun showSocialMedia() {
        parentFragmentManager.beginTransaction()
            .replace(R.id.contentFrame, SocialMediaFragment())
            .addToBackStack("social_media")
            .commit()
        (requireActivity() as? com.marsa.chain.MainActivity)?.showBackButton(
            getString(R.string.social_media_title)
        )
    }

    private fun readVersionNameFromPackage(): String {
        return try {
            val ctx = requireContext()
            val pm = ctx.packageManager
            val pkg = ctx.packageName
            @Suppress("DEPRECATION")
            val info = pm.getPackageInfo(pkg, 0)
            info.versionName.orEmpty()
        } catch (_: Exception) {
            ""
        }
    }

    override fun onDestroyView() {
        localePicker?.dismiss()
        localePicker = null
        super.onDestroyView()
        _binding = null
    }
}
