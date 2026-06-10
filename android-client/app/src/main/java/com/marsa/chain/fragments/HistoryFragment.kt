package com.marsa.chain.fragments

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.marsa.chain.R
import com.marsa.chain.adapter.WalletTxAdapter
import com.marsa.chain.data.TransactionEntity
import com.marsa.chain.manager.TransactionManager
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.manager.WalletTxSync
import com.marsa.chain.utils.TxKindHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class HistoryFragment : Fragment() {

    private lateinit var walletManager: WalletManager
    private lateinit var transactionManager: TransactionManager
    private lateinit var api: com.marsa.chain.network.ApiClient
    private lateinit var walletTxSync: WalletTxSync

    private var allTransactions = listOf<TransactionEntity>()
    private var addresses = listOf<String>()
    private var adapter: WalletTxAdapter? = null
    private var collectJob: Job? = null
    private var filterPopup: PopupWindow? = null

    private var currentFilter = "all"
    private var visibleCount = PAGE_SIZE

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_history, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        walletManager = WalletManager(requireContext())
        transactionManager = TransactionManager(requireContext())
        api = com.marsa.chain.network.ApiClient(requireContext())
        walletTxSync = WalletTxSync(requireContext(), transactionManager, api)
        api.updateBaseUrl(requireContext())

        val recycler = view.findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.transactionsRecyclerView)
        val statusText = view.findViewById<TextView>(R.id.historyStatusText)
        val filterTrigger = view.findViewById<View>(R.id.historyFilterTrigger)
        val filterLabel = view.findViewById<TextView>(R.id.historyFilterLabel)

        recycler.layoutManager = LinearLayoutManager(requireContext())
        adapter = WalletTxAdapter(emptyList(), "")
        recycler.adapter = adapter

        filterTrigger.setOnClickListener { toggleFilterMenu(filterTrigger, filterLabel, recycler, statusText) }

        recycler.addOnScrollListener(object : androidx.recyclerview.widget.RecyclerView.OnScrollListener() {
            override fun onScrolled(rv: androidx.recyclerview.widget.RecyclerView, dx: Int, dy: Int) {
                if (dy <= 0) return
                val lm = rv.layoutManager as? LinearLayoutManager ?: return
                val last = lm.findLastVisibleItemPosition()
                val total = lm.itemCount
                if (last >= total - 3 && visibleCount < applyFilter(allTransactions).size) {
                    visibleCount += PAGE_SIZE
                    paintList(recycler, statusText)
                }
            }
        })

        viewLifecycleOwner.lifecycleScope.launch {
            statusText.visibility = View.VISIBLE
            statusText.text = getString(R.string.common_loading)
            recycler.visibility = View.GONE

            val wallets = withContext(Dispatchers.IO) { walletManager.getAllWallets().first() }
            addresses = wallets.map { it.address }
            if (addresses.isEmpty()) {
                statusText.text = getString(R.string.history_no_wallets)
                return@launch
            }

            val cached = withContext(Dispatchers.IO) {
                transactionManager.getTransactionsForAddresses(addresses).first()
            }
            if (cached.isNotEmpty()) {
                allTransactions = cached
                visibleCount = PAGE_SIZE
                paintList(recycler, statusText)
            }

            withContext(Dispatchers.IO) {
                walletTxSync.syncAddresses(addresses, forceNetwork = true)
            }

            collectJob?.cancel()
            collectJob = viewLifecycleOwner.lifecycleScope.launch {
                transactionManager.getTransactionsForAddresses(addresses).collect { list ->
                    if (!isAdded) return@collect
                    allTransactions = list
                    paintList(recycler, statusText)
                }
            }
        }
    }

    private fun toggleFilterMenu(
        trigger: View,
        filterLabel: TextView,
        recycler: androidx.recyclerview.widget.RecyclerView,
        statusText: TextView
    ) {
        if (filterPopup?.isShowing == true) {
            dismissFilterMenu()
            return
        }
        showFilterMenu(trigger, filterLabel, recycler, statusText)
    }

    private fun showFilterMenu(
        trigger: View,
        filterLabel: TextView,
        recycler: androidx.recyclerview.widget.RecyclerView,
        statusText: TextView
    ) {
        dismissFilterMenu()
        val options = listOf(
            "all" to getString(R.string.history_filter_all),
            "send" to getString(R.string.history_filter_sent),
            "receive" to getString(R.string.history_filter_received),
            "mining" to getString(R.string.history_filter_mining),
            "stakes" to getString(R.string.history_filter_stakes)
        )
        val menu = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.wallet_picker_menu_bg)
        }
        options.forEachIndexed { index, (key, label) ->
            val item = layoutInflater.inflate(R.layout.item_wallet_picker_option, menu, false)
            item.findViewById<TextView>(R.id.walletPickerOptionText).apply {
                text = label
                setTextColor(if (key == currentFilter) 0xFFFF9500.toInt() else 0xFFFFFFFF.toInt())
            }
            item.findViewById<View>(R.id.walletPickerOptionDot).visibility = View.GONE
            item.setOnClickListener {
                currentFilter = key
                visibleCount = PAGE_SIZE
                filterLabel.text = label
                dismissFilterMenu()
                paintList(recycler, statusText)
            }
            menu.addView(item)
            if (index < options.lastIndex) {
                val divider = View(requireContext()).apply {
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        (1 * resources.displayMetrics.density).toInt()
                    )
                    setBackgroundColor(0xFF2C2C2E.toInt())
                }
                menu.addView(divider)
            }
        }
        filterPopup = PopupWindow(menu, trigger.width, ViewGroup.LayoutParams.WRAP_CONTENT, true).apply {
            isOutsideTouchable = true
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setOnDismissListener { filterPopup = null }
        }
        filterPopup?.showAsDropDown(trigger, 0, (4 * resources.displayMetrics.density).toInt(), Gravity.START)
    }

    private fun dismissFilterMenu() {
        filterPopup?.dismiss()
        filterPopup = null
    }

    private fun applyFilter(list: List<TransactionEntity>): List<TransactionEntity> = when (currentFilter) {
        "send" -> list.filter { classify(it) == "send" }
        "receive" -> list.filter { classify(it) == "receive" }
        "mining" -> list.filter {
            val k = classify(it)
            k == "mining" || k == "validator_reward"
        }
        "stakes" -> list.filter { TxKindHelper.isStakeKind(classify(it)) }
        else -> list.filter { TxKindHelper.isHistoryAllKind(classify(it)) }
    }

    private fun classify(tx: TransactionEntity): String =
        TxKindHelper.classifyForUser(tx, addresses)

    private fun paintList(
        recycler: androidx.recyclerview.widget.RecyclerView,
        statusText: TextView
    ) {
        val filtered = applyFilter(allTransactions)
        if (filtered.isEmpty()) {
            recycler.visibility = View.GONE
            statusText.visibility = View.VISIBLE
            statusText.text = if (allTransactions.isEmpty()) {
                getString(R.string.history_pull_hint)
            } else {
                getString(R.string.history_empty)
            }
            adapter?.update(emptyList(), "")
            return
        }
        statusText.visibility = View.GONE
        recycler.visibility = View.VISIBLE
        val slice = filtered.take(visibleCount)
        adapter?.update(slice, addresses.firstOrNull().orEmpty())
    }

    override fun onDestroyView() {
        collectJob?.cancel()
        collectJob = null
        dismissFilterMenu()
        adapter = null
        super.onDestroyView()
    }

    companion object {
        private const val PAGE_SIZE = 20
    }
}
