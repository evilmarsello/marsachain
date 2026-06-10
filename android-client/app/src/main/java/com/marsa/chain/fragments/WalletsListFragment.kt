package com.marsa.chain.fragments

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Build
import android.os.Bundle
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ImageSpan
import android.graphics.drawable.Drawable
import android.view.LayoutInflater
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.marsa.chain.R
import com.marsa.chain.utils.PressHoldReveal
import com.marsa.chain.data.WalletInfo
import com.marsa.chain.databinding.FragmentWalletsListBinding
import com.marsa.chain.manager.PoolRepository
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.network.ApiClient
import com.marsa.chain.pool.WalletStakeBadgeHelper
import com.marsa.chain.pool.WalletStakeBadgeKind
import com.marsa.chain.ui.WalletOptionsPopup
import com.marsa.chain.ui.SortOptionsPopup
import com.marsa.chain.utils.CoinFormatter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class SortType {
    BY_DATE,            // By creation date (newest first)
    BY_BALANCE          // By balance (high to low)
}

@Suppress("DEPRECATION")
private class CenteredImageSpan(drawable: Drawable) : ImageSpan(drawable) {
    override fun getSize(
        paint: Paint,
        text: CharSequence?,
        start: Int,
        end: Int,
        fm: Paint.FontMetricsInt?
    ): Int {
        val d = drawable
        val rect = d.bounds
        if (fm != null) {
            val p = paint.fontMetricsInt
            fm.ascent = p.ascent
            fm.descent = p.descent
            fm.top = p.top
            fm.bottom = p.bottom
        }
        return rect.right
    }

    override fun draw(
        canvas: Canvas,
        text: CharSequence?,
        start: Int,
        end: Int,
        x: Float,
        top: Int,
        y: Int,
        bottom: Int,
        paint: Paint
    ) {
        val d = drawable
        canvas.save()
        val h = d.bounds.height()
        val extra = (bottom - top - h) / 2f
        canvas.translate(x, top + extra)
        d.draw(canvas)
        canvas.restore()
    }
}

class WalletsListFragment : Fragment() {
    private var _binding: FragmentWalletsListBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var walletManager: WalletManager
    private lateinit var walletsAdapter: WalletsAdapter
    private lateinit var api: ApiClient
    private lateinit var poolRepository: PoolRepository
    private lateinit var optionsPopup: WalletOptionsPopup
    private lateinit var sortOptionsPopup: SortOptionsPopup
    
    private var currentSortType = SortType.BY_DATE
    private var allWallets = listOf<WalletInfo>()
    private val walletOrderKey = "wallet_list_order"

    private fun saveWalletOrder(addresses: List<String>) {
        requireContext().getSharedPreferences("wallets_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString(walletOrderKey, addresses.joinToString(","))
            .apply()
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentWalletsListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        walletManager = WalletManager(requireContext())
        api = ApiClient(requireContext())
        poolRepository = PoolRepository(requireContext())
        setupOptionsPopup()
        setupSortOptionsPopup()
        setupRecyclerView()
        setupSortButton()
        loadWallets()
    }
    
    private fun setupOptionsPopup() {
        optionsPopup = WalletOptionsPopup(
            context = requireContext(),
            onCopyAddress = { wallet ->
                val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("Wallet Address", wallet.address))
                Toast.makeText(requireContext(), "Address copied", Toast.LENGTH_SHORT).show()
            },
            onRename = { wallet -> showRenameWalletDialog(wallet) },
            onShowPrivateKey = { wallet -> showPrivateKeyDialog(wallet) },
            onSetActive = { wallet -> setActiveWallet(wallet) },
            onDelete = { wallet -> deleteWallet(wallet) }
        )
    }
    
    private fun setupSortOptionsPopup() {
        sortOptionsPopup = SortOptionsPopup(
            context = requireContext(),
            onSortSelected = { sortType ->
                currentSortType = sortType
                val sortedWallets = sortWallets(allWallets, currentSortType)
                allWallets = sortedWallets
                walletsAdapter.updateWallets(sortedWallets)
                saveWalletOrder(sortedWallets.map { it.address })
            }
        )
    }
    
    private fun setupRecyclerView() {
        walletsAdapter = WalletsAdapter(api, poolRepository, walletManager,
            onWalletOptions = { wallet, anchorView -> showWalletOptions(wallet, anchorView) },
            onOrderChanged = { newOrder ->
                allWallets = newOrder
                saveWalletOrder(newOrder.map { it.address })
            }
        )
        binding.walletsRecyclerView.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = walletsAdapter
        }
        val itemTouchHelper = ItemTouchHelper(walletsAdapter.touchHelperCallback)
        itemTouchHelper.attachToRecyclerView(binding.walletsRecyclerView)
        walletsAdapter.onStartDrag = { itemTouchHelper.startDrag(it) }
    }
    
    private fun setupSortButton() {
        binding.sortButton.setOnClickListener {
            sortOptionsPopup.show(binding.sortButton, currentSortType)
        }
    }
    
    private fun loadWallets() {
        lifecycleScope.launch {
            try {
                var list = walletManager.getAllWallets().first()
                val savedOrder = requireContext().getSharedPreferences("wallets_prefs", Context.MODE_PRIVATE)
                    .getString(walletOrderKey, null)?.split(",")?.filter { it.isNotBlank() } ?: emptyList()
                list = if (savedOrder.isNotEmpty()) {
                    val byAddress = list.associateBy { it.address }
                    savedOrder.mapNotNull { byAddress[it] } + list.filter { it.address !in savedOrder }
                } else {
                    sortWallets(list, currentSortType)
                }
                allWallets = list
                walletsAdapter.updateWallets(allWallets)
                
                if (allWallets.isEmpty()) {
                    binding.emptyStateLayout.visibility = View.VISIBLE
                    binding.walletsRecyclerView.visibility = View.GONE
                } else {
                    binding.emptyStateLayout.visibility = View.GONE
                    binding.walletsRecyclerView.visibility = View.VISIBLE
                }
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Error loading wallets: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun showWalletOptions(wallet: WalletInfo, anchorView: View) {
        optionsPopup.show(anchorView, wallet)
    }

    private fun showRenameWalletDialog(wallet: WalletInfo) {
        val input = EditText(requireContext()).apply {
            setText(wallet.name)
            setPadding(48, 32, 48, 32)
            hint = "Wallet name"
        }
        AlertDialog.Builder(requireContext())
            .setTitle("Rename wallet")
            .setView(input)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                val newName = input.text.toString().trim()
                if (newName.isNotEmpty()) {
                    lifecycleScope.launch {
                        try {
                            walletManager.updateWalletName(wallet.address, newName)
                            Toast.makeText(requireContext(), "Renamed", Toast.LENGTH_SHORT).show()
                            loadWallets()
                        } catch (e: Exception) {
                            Toast.makeText(requireContext(), "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }
    
    private fun showPrivateKeyDialog(wallet: WalletInfo) {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_private_key, null)

        val privateKeyText = dialogView.findViewById<TextView>(R.id.privateKeyText)
        val copyButton = dialogView.findViewById<ImageView>(R.id.copyButton)
        val walletNameText = dialogView.findViewById<TextView>(R.id.walletNameText)
        val walletAddressText = dialogView.findViewById<TextView>(R.id.walletAddressText)

        PressHoldReveal.attach(privateKeyText, wallet.privateKey)
        walletNameText.text = wallet.name
        walletAddressText.text = wallet.address

        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()

        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<View>(R.id.btnCancel).setOnClickListener {
            dialog.dismiss()
        }

        copyButton.setOnClickListener {
            val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Private Key", wallet.privateKey)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(requireContext(), "Private key copied to clipboard", Toast.LENGTH_SHORT).show()
        }

        dialog.show()
    }
    
    private fun setActiveWallet(wallet: WalletInfo) {
        lifecycleScope.launch {
            try {
                walletManager.setActiveWallet(wallet.address)
                Toast.makeText(requireContext(), "Wallet set as active: ${wallet.name}", Toast.LENGTH_SHORT).show()
                loadWallets() // Refresh the list
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "Error setting active wallet: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun deleteWallet(wallet: WalletInfo) {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_delete_wallet, null)

        val walletNameText = dialogView.findViewById<TextView>(R.id.walletNameText)
        val walletAddressText = dialogView.findViewById<TextView>(R.id.walletAddressText)
        val walletBalanceText = dialogView.findViewById<TextView>(R.id.walletBalanceText)
        val privateKeyText = dialogView.findViewById<TextView>(R.id.privateKeyText)
        val btnCopyPrivateKey = dialogView.findViewById<TextView>(R.id.btnCopyPrivateKey)
        val btnCancel = dialogView.findViewById<TextView>(R.id.btnCancel)
        val btnDelete = dialogView.findViewById<TextView>(R.id.btnDelete)

        walletNameText.text = wallet.name
        walletAddressText.text = wallet.address
        PressHoldReveal.attach(privateKeyText, wallet.privateKey)

        // Load wallet balance
        lifecycleScope.launch {
            try {
                val balanceNanos = withContext(Dispatchers.IO) {
                    walletManager.getWalletBalance(wallet.address)
                }
                walletBalanceText.text = CoinFormatter.format(balanceNanos)
            } catch (e: Exception) {
                walletBalanceText.text = "Error loading balance"
            }
        }

        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()

        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<View>(R.id.btnShowPrivateKey).visibility = View.GONE

        btnCopyPrivateKey.setOnClickListener {
            val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Private Key", wallet.privateKey)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(requireContext(), "Private key copied to clipboard", Toast.LENGTH_SHORT).show()
        }

        btnCancel.setOnClickListener {
            dialog.dismiss()
        }

        btnDelete.setOnClickListener {
            lifecycleScope.launch {
                try {
                    walletManager.moveWalletToTrash(wallet)
                    Toast.makeText(requireContext(), "Wallet deleted: ${wallet.name}", Toast.LENGTH_SHORT).show()
                    loadWallets() // Refresh the list
                    dialog.dismiss()
                } catch (e: Exception) {
                    Toast.makeText(requireContext(), "Error deleting wallet: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        dialog.show()
    }

    private fun sortWallets(wallets: List<WalletInfo>, sortType: SortType): List<WalletInfo> {
        return when (sortType) {
            SortType.BY_DATE -> {
                // Active first, then by creation date (newest first)
                wallets.sortedWith(compareBy<WalletInfo> { !it.isActive }.thenByDescending { it.createdAt })
            }
            SortType.BY_BALANCE -> {
                // Active first, then by address (since balance sorting requires async operation)
                wallets.sortedWith(compareBy<WalletInfo> { !it.isActive }.thenBy { it.address })
            }
        }
    }
    

    override fun onDestroyView() {
        super.onDestroyView()
        optionsPopup.dismiss()
        sortOptionsPopup.dismiss()
        _binding = null
    }
}

class WalletsAdapter(
    private val api: ApiClient,
    private val poolRepository: PoolRepository,
    private val walletManager: WalletManager,
    private val onWalletOptions: (WalletInfo, View) -> Unit,
    private val onOrderChanged: (List<WalletInfo>) -> Unit
) : RecyclerView.Adapter<WalletsAdapter.WalletViewHolder>() {

    private val wallets = mutableListOf<WalletInfo>()

    var onStartDrag: ((WalletViewHolder) -> Unit)? = null

    val touchHelperCallback = object : ItemTouchHelper.SimpleCallback(ItemTouchHelper.UP or ItemTouchHelper.DOWN, 0) {
        override fun onMove(recyclerView: RecyclerView, viewHolder: RecyclerView.ViewHolder, target: RecyclerView.ViewHolder): Boolean {
            val from = viewHolder.adapterPosition
            val to = target.adapterPosition
            if (from == RecyclerView.NO_POSITION || to == RecyclerView.NO_POSITION) return false
            val w = wallets.removeAt(from)
            wallets.add(to, w)
            notifyItemMoved(from, to)
            onOrderChanged(wallets.toList())
            return true
        }
        override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {}
    }

    fun updateWallets(newWallets: List<WalletInfo>) {
        wallets.clear()
        wallets.addAll(newWallets)
        notifyDataSetChanged()
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): WalletViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_wallet, parent, false)
        return WalletViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: WalletViewHolder, position: Int) {
        holder.bind(wallets[position])
    }
    
    override fun getItemCount() = wallets.size
    
    inner class WalletViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val walletName: TextView = itemView.findViewById(R.id.walletName)
        private val walletAddress: TextView = itemView.findViewById(R.id.walletAddress)
        private val walletBalance: TextView = itemView.findViewById(R.id.walletBalance)
        private val optionsButton: ImageView = itemView.findViewById(R.id.optionsButton)
        private val walletMinerStakeBadge: TextView = itemView.findViewById(R.id.walletMinerStakeBadge)
        private var activeDotDrawable: Drawable? = null

        fun bind(wallet: WalletInfo) {
            setWalletTitle(wallet.name, wallet.isActive)
            walletAddress.text = wallet.address
            walletBalance.text = "..."
            walletMinerStakeBadge.visibility = View.GONE
            
            optionsButton.setOnClickListener {
                onWalletOptions(wallet, optionsButton)
            }
            itemView.setOnLongClickListener {
                onStartDrag?.invoke(this)
                true
            }
            // Load balance asynchronously
            loadBalance(wallet.address)
            loadMiningBadge(wallet.address)
        }

        private fun setWalletTitle(name: String, active: Boolean) {
            walletName.setCompoundDrawablesRelative(null, null, null, null)
            if (!active) {
                walletName.text = name
                return
            }
            val d = ensureActiveDotDrawable() ?: return
            val gapPx = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                8f,
                itemView.resources.displayMetrics
            )
            val spaceW = walletName.paint.measureText(" ")
            val gapSpaces = (gapPx / spaceW).toInt().coerceIn(1, 5)
            val ss = SpannableStringBuilder(name)
            repeat(gapSpaces) { ss.append(' ') }
            val from = ss.length
            ss.append('\uFFFC')
            val to = ss.length
            val span: ImageSpan = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ImageSpan(d, ImageSpan.ALIGN_CENTER)
            } else {
                @Suppress("DEPRECATION")
                CenteredImageSpan(d)
            }
            ss.setSpan(span, from, to, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            walletName.text = ss
        }

        private fun ensureActiveDotDrawable(): Drawable? {
            activeDotDrawable?.let { return it }
            val dot = ContextCompat.getDrawable(itemView.context, R.drawable.active_indicator)?.mutate() ?: return null
            val px = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                8f,
                itemView.resources.displayMetrics
            ).toInt()
            dot.setBounds(0, 0, px, px)
            activeDotDrawable = dot
            return dot
        }

        private fun loadMiningBadge(address: String) {
            kotlinx.coroutines.CoroutineScope(Dispatchers.Main).launch {
                try {
                    val kind = withContext(Dispatchers.IO) {
                        WalletStakeBadgeHelper.resolveBadgeKind(api, poolRepository, address)
                    }
                    if (adapterPosition == RecyclerView.NO_POSITION) return@launch
                    if (kind == null) {
                        walletMinerStakeBadge.visibility = View.GONE
                    } else {
                        walletMinerStakeBadge.text = when (kind) {
                            WalletStakeBadgeKind.POOL ->
                                itemView.context.getString(R.string.wallets_pool_miner_badge)
                            WalletStakeBadgeKind.SOLO ->
                                itemView.context.getString(R.string.wallets_miner_badge)
                        }
                        walletMinerStakeBadge.visibility = View.VISIBLE
                    }
                } catch (_: Exception) {
                    if (adapterPosition != RecyclerView.NO_POSITION) {
                        walletMinerStakeBadge.visibility = View.GONE
                    }
                }
            }
        }
        
        private fun loadBalance(address: String) {
            // Load balance asynchronously
            kotlinx.coroutines.CoroutineScope(Dispatchers.Main).launch {
                try {
                    val balanceNanos = withContext(Dispatchers.IO) {
                        walletManager.getWalletBalance(address)
                    }
                    walletBalance.text = CoinFormatter.formatWithSuffix(balanceNanos)
                } catch (e: Exception) {
                    walletBalance.text = "Error"
                }
            }
        }
    }
}
