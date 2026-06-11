package com.marsa.chain.ui

import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.marsa.chain.MainActivity
import com.marsa.chain.R
import com.marsa.chain.manager.PoolModePreferences
import com.marsa.chain.manager.PoolRepository
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.network.ApiClient
import com.marsa.chain.network.PoolConstants
import com.marsa.chain.network.PoolTransactionBuilder
import com.marsa.chain.pool.PoolHelper
import com.marsa.chain.utils.CoinFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** MINER_POOL_STAKE dialog + submit — TMA minerPoolStakeModal parity. */
class CreateMinerPoolStakeHelper(
    private val fragment: Fragment,
    private val walletManager: WalletManager,
    private val api: ApiClient,
    private val poolRepository: PoolRepository,
    private val poolModePrefs: PoolModePreferences,
    private val onSuccess: () -> Unit = {}
) {

    fun show(poolIdOverride: Int? = null) {
        fragment.viewLifecycleOwner.lifecycleScope.launch {
            try {
                val wallet = withContext(Dispatchers.IO) { walletManager.getActiveWallet() }
                if (wallet == null) {
                    toast(R.string.alert_no_active_wallet)
                    return@launch
                }
                val membership = withContext(Dispatchers.IO) {
                    poolRepository.refreshMembership(wallet.address)
                }
                if (membership.active && membership.poolId != null) {
                    toast(R.string.pool_stake_already_in_pool)
                    onSuccess()
                    return@launch
                }
                val miningInfo = withContext(Dispatchers.IO) { api.getMiningInfo(wallet.address) }
                val pending = poolModePrefs.isPoolStakePending(wallet.address)
                if (PoolHelper.hasSoloMinerStakeOnly(miningInfo, membership, pending)) {
                    toast(R.string.mining_finish_solo_stake)
                    return@launch
                }
                val poolId = poolIdOverride ?: poolModePrefs.getChosenPoolId(wallet.address)
                if (poolId == null) {
                    toast(R.string.mining_select_pool_first)
                    (fragment.activity as? MainActivity)?.showPoolsListFragment()
                    return@launch
                }
                if (membership.active && membership.poolId != null && membership.poolId != poolId) {
                    val other = PoolHelper.displayPoolName(membership.poolId, "")
                    toast(fragment.getString(R.string.pool_wallet_other_pool, other))
                    return@launch
                }
                val balance = withContext(Dispatchers.IO) {
                    walletManager.getWalletBalance(wallet.address)
                }
                val apiName = poolRepository.peekCachedPools()
                    ?.find { it.pool_id == poolId }
                    ?.name
                    .orEmpty()
                val poolName = PoolHelper.displayPoolName(poolId, apiName)
                val minStakeWei = PoolConstants.MIN_POOL_STAKE_WEI
                val balanceFormatted = CoinFormatter.format(balance)
                val minFormatted = CoinFormatter.format(minStakeWei)

                val dialogView = fragment.layoutInflater.inflate(R.layout.dialog_create_pool_stake, null)
                dialogView.findViewById<TextView>(R.id.tvPoolStakeTitle).text =
                    fragment.getString(R.string.pool_join_title, poolName)
                dialogView.findViewById<TextView>(R.id.tvPoolBalanceInfo).text =
                    fragment.getString(R.string.pool_stake_balance, balanceFormatted)
                dialogView.findViewById<TextView>(R.id.tvPoolStakeMinHint).text =
                    fragment.getString(R.string.pool_stake_min, minFormatted)

                val etAmount = dialogView.findViewById<EditText>(R.id.etPoolStakeAmount)
                val dialog = AlertDialog.Builder(fragment.requireContext())
                    .setView(dialogView)
                    .create()
                dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

                dialogView.findViewById<android.view.View>(R.id.btnPoolStakeCancel)
                    .setOnClickListener { dialog.dismiss() }
                dialogView.findViewById<android.view.View>(R.id.btnPoolStakeCreate)
                    .setOnClickListener {
                        val raw = etAmount.text.toString().trim()
                        if (raw.isEmpty()) {
                            toast(R.string.stake_enter_amount)
                            return@setOnClickListener
                        }
                        val stakeWei = try {
                            CoinFormatter.coinsToNanos(raw.replace(',', '.').toDouble())
                        } catch (_: Exception) {
                            toast(R.string.stake_invalid_amount)
                            return@setOnClickListener
                        }
                        if (stakeWei <= 0L) {
                            toast(R.string.stake_invalid_amount)
                            return@setOnClickListener
                        }
                        if (stakeWei < minStakeWei) {
                            toast(fragment.getString(R.string.stake_min_amount, minFormatted))
                            return@setOnClickListener
                        }
                        val feeWei = PoolConstants.POOL_STAKE_FEE_WEI
                        if (stakeWei + feeWei > balance) {
                            toast(R.string.stake_insufficient)
                            return@setOnClickListener
                        }
                        dialog.dismiss()
                        submitPoolStake(wallet.address, wallet.publicKey, wallet.privateKey, poolId, stakeWei, balance)
                    }
                dialog.show()
            } catch (e: Exception) {
                toast(e.message ?: fragment.getString(R.string.pool_stake_failed))
            }
        }
    }

    private fun submitPoolStake(
        address: String,
        publicKey: String,
        privateKey: String,
        poolId: Int,
        stakeWei: Long,
        balanceBefore: Long
    ) {
        fragment.viewLifecycleOwner.lifecycleScope.launch {
            try {
                val status = withContext(Dispatchers.IO) { api.getStatus() }
                val height = (status?.get("height") as? Number)?.toInt() ?: 0
                val feeWei = PoolConstants.POOL_STAKE_FEE_WEI
                val tx = PoolTransactionBuilder.buildMinerPoolStake(
                    from = address,
                    publicKey = publicKey,
                    privateKey = privateKey,
                    poolId = poolId,
                    stakeAmountWei = stakeWei,
                    feeWei = feeWei,
                    currentHeight = height
                )
                toast(R.string.pool_stake_sending)
                val ok = withContext(Dispatchers.IO) { api.submitTransaction(tx) }
                if (ok == null) {
                    toast(R.string.pool_stake_failed)
                    return@launch
                }
                poolModePrefs.markPoolChosen(address, poolId)
                poolModePrefs.setMiningMode(PoolModePreferences.MiningMode.POOL)
                poolModePrefs.setPoolStakePending(address)
                withContext(Dispatchers.IO) {
                    walletManager.updateWalletBalance(address, balanceBefore - stakeWei - feeWei)
                }
                toast(R.string.pool_stake_sent)
                onSuccess()
                pollPoolStakeConfirmed(address)
            } catch (e: Exception) {
                toast(e.message ?: fragment.getString(R.string.pool_stake_failed))
            }
        }
    }

    private suspend fun pollPoolStakeConfirmed(address: String) {
        repeat(30) {
            delay(2000)
            val membership = withContext(Dispatchers.IO) {
                poolRepository.refreshMembership(address)
            }
            if (membership.active) {
                poolModePrefs.clearPoolStakePending()
                toast(R.string.pool_stake_confirmed)
                onSuccess()
                return
            }
        }
        onSuccess()
    }

    private fun toast(resId: Int) {
        Toast.makeText(fragment.requireContext(), resId, Toast.LENGTH_SHORT).show()
    }

    private fun toast(message: String) {
        Toast.makeText(fragment.requireContext(), message, Toast.LENGTH_SHORT).show()
    }
}
