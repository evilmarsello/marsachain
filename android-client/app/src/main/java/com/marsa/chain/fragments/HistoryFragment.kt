package com.marsa.chain.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.marsa.chain.R
import com.marsa.chain.adapter.TransactionAdapter
import com.marsa.chain.data.TransactionEntity
import com.marsa.chain.manager.TransactionManager
import com.marsa.chain.manager.WalletManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class HistoryFragment : Fragment() {
    private lateinit var walletManager: WalletManager
    private lateinit var transactionManager: TransactionManager
    private lateinit var api: com.marsa.chain.network.ApiClient
    @Volatile private var latestTransactions: List<TransactionEntity> = emptyList()
    private var confirmationsJob: kotlinx.coroutines.Job? = null
    private var lastChainHeight: Int = -1
    private val nextPollAtMs = java.util.concurrent.ConcurrentHashMap<String, Long>()

    private var allTransactions = listOf<TransactionEntity>()
    private var currentFilter = "all"
    private lateinit var addresses: List<String>
    private var adapter: TransactionAdapter? = null
    
    // Пагинация
    private var currentPage = 0
    private val pageSize = 10
    private var isLoading = false
    private var hasMoreData = true

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_history, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        walletManager = WalletManager(requireContext())
        transactionManager = TransactionManager(requireContext())
        api = com.marsa.chain.network.ApiClient(requireContext())


        val titleText = view.findViewById<TextView>(R.id.titleText)
        titleText?.text = "History"

        val recycler = view.findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.transactionsRecyclerView)
        val emptyState = view.findViewById<LinearLayout>(R.id.emptyStateLayout)

        recycler.layoutManager = LinearLayoutManager(requireContext())

        // Кнопки фильтров
        var filterAll = view.findViewById<Button>(R.id.filterAllButton)
        var filterSent = view.findViewById<Button>(R.id.filterSentButton)
        var filterReceived = view.findViewById<Button>(R.id.filterReceivedButton)
        var filterMining = view.findViewById<Button>(R.id.filterMiningButton)

        // Назначаем обработчики кликов СРАЗУ
        filterAll.setOnClickListener {
            android.util.Log.d("HistoryFragment", "CLICK: filterAll")
            currentFilter = "all"
            currentPage = 0 // Сброс пагинации при смене фильтра
            updateFilterButtons(currentFilter, filterAll, filterSent, filterReceived, filterMining)
            updateFilteredList(recycler, emptyState)
        }
        filterSent.setOnClickListener {
            android.util.Log.d("HistoryFragment", "CLICK: filterSent")
            currentFilter = "send"
            currentPage = 0 // Сброс пагинации при смене фильтра
            updateFilterButtons(currentFilter, filterAll, filterSent, filterReceived, filterMining)
            updateFilteredList(recycler, emptyState)
        }
        filterReceived.setOnClickListener {
            android.util.Log.d("HistoryFragment", "CLICK: filterReceived")
            currentFilter = "receive"
            currentPage = 0 // Сброс пагинации при смене фильтра
            updateFilterButtons(currentFilter, filterAll, filterSent, filterReceived, filterMining)
            updateFilteredList(recycler, emptyState)
        }
        filterMining.setOnClickListener {
            android.util.Log.d("HistoryFragment", "CLICK: filterMining")
            currentFilter = "mining"
            currentPage = 0 // Сброс пагинации при смене фильтра
            updateFilterButtons(currentFilter, filterAll, filterSent, filterReceived, filterMining)
            updateFilteredList(recycler, emptyState)
        }

        // Остальное — загрузка данных
        lifecycleScope.launch {
            // Очистить всю историю транзакций перед загрузкой
            withContext(Dispatchers.IO) { transactionManager.clearAllTransactions() }
            val wallets = withContext(Dispatchers.IO) { walletManager.getAllWallets().first() }
            addresses = wallets.map { it.address }
            adapter = TransactionAdapter(
                transactions = emptyList(),
                userAddresses = addresses,
                onTransactionClick = { tx -> showTransactionDetails(tx) }
            )
            recycler.adapter = adapter

            // Добавляем слушатель прокрутки для подгрузки данных
            recycler.addOnScrollListener(object : androidx.recyclerview.widget.RecyclerView.OnScrollListener() {
                override fun onScrolled(recyclerView: androidx.recyclerview.widget.RecyclerView, dx: Int, dy: Int) {
                    super.onScrolled(recyclerView, dx, dy)
                    
                    val layoutManager = recyclerView.layoutManager as? LinearLayoutManager
                    if (layoutManager != null && !isLoading && hasMoreData) {
                        val visibleItemCount = layoutManager.childCount
                        val totalItemCount = layoutManager.itemCount
                        val firstVisibleItemPosition = layoutManager.findFirstVisibleItemPosition()
                        
                        // Если пользователь приближается к концу списка (осталось 3 элемента)
                        if ((visibleItemCount + firstVisibleItemPosition) >= totalItemCount - 3 && firstVisibleItemPosition >= 0) {
                            loadMoreTransactions()
                        }
                    }
                }
            })

            // Немедленный одноразовый reconciliation: обновляем blockHeight из /address/transactions
            launch(Dispatchers.IO) {
                try {
                    val snapshot = transactionManager.getTransactionsForAddresses(addresses).first()
                    
                    for (addr in addresses) {
                        val remoteTxs = api.getAddressTransactions(addr, limit = 200)
                        
                        for (rtx in remoteTxs) {
                            val existing = snapshot.find { it.txid == rtx.txid }
                            if (existing != null && existing.blockHeight == null && rtx.blockHeight != null) {
                                transactionManager.updateTransaction(existing.copy(blockHeight = rtx.blockHeight))
                            }
                        }
                    }
                    
                    // Сразу после reconciliation запрашиваем chainHeight
                    val status = runCatching { api.getStatus() }.getOrNull()
                    val chainHeight = (status?.get("height") as? Int)
                    if (chainHeight != null && chainHeight >= 0) {
                        withContext(Dispatchers.Main) {
                            adapter?.updateChainHeight(chainHeight)
                        }
                    }
                } catch (_: Exception) { }
            }
            var imported = 0
            for (addr in addresses) {
                val remoteTxs = api.getAddressTransactions(addr, limit = 500)
                withContext(Dispatchers.IO) {
                    for (rtx in remoteTxs) {
                        val existing = transactionManager.getTransactionById(rtx.txid)
                        if (existing == null) {
                            val baseTs = (if (rtx.timestamp > 10_000_000_000L) rtx.timestamp else rtx.timestamp * 1000L)
                            val entity = when (rtx.type) {
                                "send" -> transactionManager.createSendTransaction(
                                    txid = rtx.txid,
                                    fromAddress = rtx.fromAddress,
                                    toAddress = rtx.toAddress,
                                    amount = rtx.amount,
                                    fee = rtx.fee
                                ).copy(
                                    blockHeight = rtx.blockHeight,
                                    confirmations = 0,
                                    timestamp = baseTs,
                                    status = "pending"
                                )
                                "mining" -> transactionManager.createMiningTransaction(
                                    txid = rtx.txid,
                                    minerAddress = rtx.toAddress,
                                    reward = rtx.amount,
                                    blockHeight = rtx.blockHeight
                                ).copy(
                                    confirmations = 0,
                                    timestamp = baseTs,
                                    status = "pending"
                                )
                                else -> transactionManager.createReceiveTransaction(
                                    txid = rtx.txid,
                                    fromAddress = rtx.fromAddress,
                                    toAddress = rtx.toAddress,
                                    amount = rtx.amount,
                                    fee = rtx.fee
                                ).copy(
                                    blockHeight = rtx.blockHeight,
                                    confirmations = 0,
                                    timestamp = baseTs,
                                    status = "pending"
                                )
                            }
                            transactionManager.addTransaction(entity)
                            imported++
                        }
                    }
                }
            }
            // Триггерим отображение истории сразу после загрузки
            transactionManager.getTransactionsForAddresses(addresses).collect { list ->
                allTransactions = list
                latestTransactions = list
                updateFilteredList(recycler, emptyState)
            }

            // Попробуем поднять весь контейнер с фильтрами (родитель кнопок)
            val filtersContainer = (filterAll.parent as? View)
            filtersContainer?.let { fc ->
                fc.isClickable = true
                fc.isFocusable = true
                try { androidx.core.view.ViewCompat.setElevation(fc, 16f) } catch (_: Throwable) {}
                try { fc.translationZ = 16f } catch (_: Throwable) {}
                fc.bringToFront()
                fc.requestLayout()
                fc.invalidate()

                // Подвинем список ниже панели фильтров через padding (надёжнее чем margin)
                fc.post {
                    recycler.clipToPadding = false
                    val topPadding = fc.height.coerceAtLeast(8)
                    if (recycler.paddingTop < topPadding) {
                        recycler.setPadding(recycler.paddingLeft, topPadding, recycler.paddingRight, recycler.paddingBottom)
                        recycler.requestLayout()
                    }
                }
            }

            // Гарантируем кликабельность и видимость поверх списка
            listOf(filterAll, filterSent, filterReceived, filterMining).forEach { btn ->
                btn?.isClickable = true
                btn?.isEnabled = true
                btn?.isFocusable = true
                btn?.bringToFront()
                try { androidx.core.view.ViewCompat.setElevation(btn!!, 18f) } catch (_: Throwable) {}
                try { btn!!.translationZ = 18f } catch (_: Throwable) {}
            }

            // Также снизим Z у списка, чтобы не перекрывал клики
            try { androidx.core.view.ViewCompat.setElevation(recycler, 0f) } catch (_: Throwable) {}
            try { recycler.translationZ = 0f } catch (_: Throwable) {}

            // Устанавливаем начальное состояние - активна только кнопка "All"
            updateFilterButtons(currentFilter, filterAll, filterSent, filterReceived, filterMining)
            updateFilteredList(recycler, emptyState) // чтобы ALL сработал на самом первом отображении

            fun applyFilter(list: List<TransactionEntity>): List<TransactionEntity> = when (currentFilter) {
                "send" -> list.filter { getTransactionTypeForUser(it, addresses) == "send" }
                "receive" -> list.filter { getTransactionTypeForUser(it, addresses) == "receive" }
                "mining" -> list.filter { getTransactionTypeForUser(it, addresses) == "mining" }
                // Исправлено: ALL теперь показывает все пользовательские типы транзакций, в том числе "received"
                else -> list.filter {
                    val t = getTransactionTypeForUser(it, addresses)
                    t == "send" || t == "receive" || t == "internal" || t == "mining"
                }
            }

            fun updateFilteredList(recycler: androidx.recyclerview.widget.RecyclerView, emptyState: LinearLayout) {
                adapter?.updateUserAddresses(addresses)
                val filtered = applyFilter(allTransactions)
                
                // Применяем пагинацию: показываем только первые (currentPage + 1) * pageSize элементов
                val paginatedList = filtered.take((currentPage + 1) * pageSize)
                hasMoreData = paginatedList.size < filtered.size
                
                adapter?.updateTransactions(paginatedList)
                
                if (paginatedList.isEmpty()) {
                    recycler.visibility = View.GONE
                    emptyState.visibility = View.VISIBLE
                } else {
                    recycler.visibility = View.VISIBLE
                    emptyState.visibility = View.GONE
                }
            }
            
            // Стартуем единый "умный" цикл: опрос высоты
            if (confirmationsJob == null) {
                confirmationsJob = lifecycleScope.launch(Dispatchers.IO) {
                    while (isActive) {
                        try {
                            // Получаем текущую высоту (1 запрос)
                            val status = runCatching { api.getStatus() }.getOrNull()
                            val chainHeight = (status?.get("height") as? Int) ?: lastChainHeight
                            if (chainHeight >= 0) {
                                lastChainHeight = chainHeight
                                withContext(Dispatchers.Main) {
                                    adapter?.updateChainHeight(chainHeight)
                                }
                            }

                        } catch (_: Exception) { /* ignore single cycle errors */ }

                        kotlinx.coroutines.delay(3000) // Опрашиваем /status каждые 3 секунды
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // Очищаем кэш транзакций при закрытии приложения
        lifecycleScope.launch(Dispatchers.IO) {
            transactionManager.clearAllTransactions()
        }
    }

    private suspend fun updateStats(addresses: List<String>, totalSent: TextView, totalReceived: TextView) {
        var sent = 0L
        var recv = 0L
        val tm = transactionManager
        withContext(Dispatchers.IO) {
            addresses.forEach { addr ->
                sent += tm.getTotalSent(addr)
                recv += tm.getTotalReceived(addr)
            }
        }
        totalSent.text = "$sent MRS"
        totalReceived.text = "$recv MRS"
    }

    private fun showTransactionDetails(tx: TransactionEntity) {
        // For now, we can reuse WalletFragment's dialog or implement later
    }
    
    private fun getTransactionTypeForUser(transaction: TransactionEntity, userAddresses: List<String>): String {
        val isFromUser = userAddresses.contains(transaction.fromAddress)
        val isToUser = userAddresses.contains(transaction.toAddress)
        val isCoinbaseId = transaction.txid.endsWith("_cb")
        
        return when {
            transaction.type == "mining" || transaction.fromAddress == "mining_reward" || isCoinbaseId -> "mining"
            isFromUser && isToUser -> "internal"
            isFromUser -> "send"
            isToUser -> "receive"
            else -> "unknown"
        }
    }

    private fun applyFilter(list: List<TransactionEntity>): List<TransactionEntity> = when (currentFilter) {
        "send" -> list.filter { getTransactionTypeForUser(it, addresses) == "send" }
        "receive" -> list.filter { getTransactionTypeForUser(it, addresses) == "receive" }
        "mining" -> list.filter { getTransactionTypeForUser(it, addresses) == "mining" }
        else -> list.filter {
            val t = getTransactionTypeForUser(it, addresses)
            t == "send" || t == "receive" || t == "internal" || t == "mining"
        }
    }

    private fun loadMoreTransactions() {
        if (isLoading || !hasMoreData) return
        
        isLoading = true
        currentPage++
        
        // Обновляем список с новой страницей
        view?.let { v ->
            val recycler = v.findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.transactionsRecyclerView)
            val emptyState = v.findViewById<LinearLayout>(R.id.emptyStateLayout)
            updateFilteredList(recycler, emptyState)
        }
        
        isLoading = false
    }
    
    private fun updateFilteredList(recycler: androidx.recyclerview.widget.RecyclerView, emptyState: LinearLayout) {
        adapter?.updateUserAddresses(addresses)
        val filtered = applyFilter(allTransactions)
        adapter?.updateTransactions(filtered)
        if (filtered.isEmpty()) {
            recycler.visibility = View.GONE
            emptyState.visibility = View.VISIBLE
        } else {
            recycler.visibility = View.VISIBLE
            emptyState.visibility = View.GONE
        }
    }
    
    private fun updateFilterButtons(currentFilter: String, filterAll: Button, filterSent: Button, filterReceived: Button, filterMining: Button) {
        // Сбрасываем все кнопки в неактивное состояние
        filterAll.background = requireContext().getDrawable(R.drawable.filter_button_inactive)
        filterAll.setTextColor(requireContext().getColor(R.color.background_card))
        
        filterSent.background = requireContext().getDrawable(R.drawable.filter_button_inactive)
        filterSent.setTextColor(requireContext().getColor(R.color.background_card))
        
        filterReceived.background = requireContext().getDrawable(R.drawable.filter_button_inactive)
        filterReceived.setTextColor(requireContext().getColor(R.color.background_card))
        
        filterMining.background = requireContext().getDrawable(R.drawable.filter_button_inactive)
        filterMining.setTextColor(requireContext().getColor(R.color.background_card))
        
        // Активируем выбранную кнопку
        when (currentFilter) {
            "all" -> {
                filterAll.background = requireContext().getDrawable(R.drawable.send_button_background)
                filterAll.setTextColor(requireContext().getColor(R.color.background_card))
            }
            "send" -> {
                filterSent.background = requireContext().getDrawable(R.drawable.send_button_background)
                filterSent.setTextColor(requireContext().getColor(R.color.background_card))
            }
            "receive" -> {
                filterReceived.background = requireContext().getDrawable(R.drawable.send_button_background)
                filterReceived.setTextColor(requireContext().getColor(R.color.background_card))
            }
            "mining" -> {
                filterMining.background = requireContext().getDrawable(R.drawable.send_button_background)
                filterMining.setTextColor(requireContext().getColor(R.color.background_card))
            }
        }
    }
}



