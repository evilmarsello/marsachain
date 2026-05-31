package com.marsa.chain.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.view.doOnLayout
import androidx.fragment.app.Fragment
import com.marsa.chain.MainActivity
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentWalletSettingsBinding
import com.marsa.chain.manager.WalletPreferences
import com.marsa.chain.ui.CloudPopup

/**
 * Wallet settings: opened above the Wallet tab with back stack; bottom tab bar stays visible.
 */
class WalletSettingsFragment : Fragment() {

    private var _binding: FragmentWalletSettingsBinding? = null
    private val binding get() = _binding!!

    private lateinit var walletPreferences: WalletPreferences

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentWalletSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        walletPreferences = WalletPreferences(requireContext())

        binding.switchCascadeSend.setOnCheckedChangeListener(null)
        binding.switchCascadeSend.isChecked = walletPreferences.autoCascadeSend
        binding.switchCascadeSend.setOnCheckedChangeListener { _, isChecked ->
            walletPreferences.autoCascadeSend = isChecked
        }

        binding.switchCascadeSend.doOnLayout { sw ->
            sw.pivotX = sw.width / 2f
            sw.pivotY = sw.height / 2f
            sw.scaleX = 1.4f
            sw.scaleY = 1.4f
        }

        binding.buttonCascadeInfo.setOnClickListener { v ->
            CloudPopup.showInfoBelow(
                v,
                "Auto-split send",
                "If the active wallet does not have enough balance for the amount you want to send plus the network fee, " +
                    "the app will send the remainder in one or more extra transactions from your other wallets. " +
                    "Order: active wallet first, then other wallets by creation time (newer before older). " +
                    "Each on-chain transaction pays its own fee."
            )
        }

        binding.buttonOpenDeletedWallets.setOnClickListener {
            parentFragmentManager.beginTransaction()
                .replace(R.id.contentFrame, WalletTrashFragment())
                .addToBackStack("wallet_trash")
                .commit()
            (requireActivity() as? MainActivity)?.showBackButton("Deleted wallets")
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
