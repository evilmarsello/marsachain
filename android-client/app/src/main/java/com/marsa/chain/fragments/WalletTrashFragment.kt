package com.marsa.chain.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.marsa.chain.R
import com.marsa.chain.adapter.DeletedWalletsAdapter
import com.marsa.chain.data.DeletedWalletInfo
import com.marsa.chain.databinding.FragmentWalletTrashBinding
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.ui.CloudPopup
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class WalletTrashFragment : Fragment() {

    private var _binding: FragmentWalletTrashBinding? = null
    private val binding get() = _binding!!

    private lateinit var walletManager: WalletManager
    private lateinit var trashAdapter: DeletedWalletsAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentWalletTrashBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        walletManager = WalletManager(requireContext())

        trashAdapter = DeletedWalletsAdapter { w -> restoreWallet(w) }

        binding.trashRecyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.trashRecyclerView.adapter = trashAdapter

        val swipeDelete = object : ItemTouchHelper.SimpleCallback(0, ItemTouchHelper.LEFT) {
            override fun onMove(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder,
                target: RecyclerView.ViewHolder
            ): Boolean = false

            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {
                val pos = viewHolder.bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return
                val w = trashAdapter.getWalletAt(pos) ?: return
                binding.trashRecyclerView.post {
                    if (!isAdded || _binding == null) return@post
                    val anchor = binding.trashRecyclerView.findViewHolderForAdapterPosition(pos)?.itemView
                        ?: binding.trashRecyclerView
                    CloudPopup.showConfirmBelow(
                        anchor = anchor,
                        title = "Remove from bin",
                        message = "Permanently delete this wallet entry from the bin?",
                        negativeText = "Cancel",
                        positiveText = "Remove",
                        onPositive = {
                            lifecycleScope.launch {
                                withContext(Dispatchers.IO) {
                                    walletManager.permanentlyRemoveFromTrash(w.address)
                                }
                            }
                        },
                        onDismissWithoutConfirm = {
                            trashAdapter.notifyItemChanged(pos)
                        }
                    )
                }
            }
        }
        ItemTouchHelper(swipeDelete).attachToRecyclerView(binding.trashRecyclerView)

        binding.buttonClearTrash.setOnClickListener { anchor ->
            CloudPopup.showConfirmBelow(
                anchor = anchor,
                title = "Empty bin",
                message = "Remove all entries from the bin permanently? This cannot be undone.",
                negativeText = "Cancel",
                positiveText = "Empty",
                onPositive = {
                    lifecycleScope.launch {
                        withContext(Dispatchers.IO) {
                            walletManager.clearDeletedWalletsTrash()
                        }
                    }
                }
            )
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                withContext(Dispatchers.IO) {
                    walletManager.purgeExpiredDeletedWallets()
                }
                walletManager.observeDeletedWallets().collect { list ->
                    withContext(Dispatchers.Main) {
                        if (_binding != null) applyTrashList(list)
                    }
                }
            }
        }
    }

    private fun applyTrashList(list: List<DeletedWalletInfo>) {
        if (list.isEmpty()) {
            binding.textTrashEmpty.visibility = View.VISIBLE
            binding.trashRecyclerView.visibility = View.GONE
        } else {
            binding.textTrashEmpty.visibility = View.GONE
            binding.trashRecyclerView.visibility = View.VISIBLE
        }
        trashAdapter.submitList(list)
    }

    private fun restoreWallet(w: DeletedWalletInfo) {
        lifecycleScope.launch {
            val ok = withContext(Dispatchers.IO) {
                walletManager.restoreWalletFromTrash(w)
            }
            if (!isAdded) return@launch
            if (ok) {
                Toast.makeText(requireContext(), "Wallet restored to My Wallets", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(
                    requireContext(),
                    "A wallet with this address already exists in My Wallets",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                walletManager.purgeExpiredDeletedWallets()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
