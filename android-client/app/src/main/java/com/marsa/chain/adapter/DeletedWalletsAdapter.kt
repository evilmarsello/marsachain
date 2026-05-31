package com.marsa.chain.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.marsa.chain.R
import com.marsa.chain.data.DeletedWalletInfo

class DeletedWalletsAdapter(
    private val onRestore: (DeletedWalletInfo) -> Unit
) : RecyclerView.Adapter<DeletedWalletsAdapter.VH>() {

    private val items = mutableListOf<DeletedWalletInfo>()

    fun submitList(list: List<DeletedWalletInfo>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    fun getWalletAt(position: Int): DeletedWalletInfo? = items.getOrNull(position)

    override fun getItemCount(): Int = items.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_trash_wallet_row, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val w = items[position]
        holder.name.text = w.name
        holder.address.text = w.address
        holder.restore.setOnClickListener { onRestore(w) }
    }

    class VH(itemView: android.view.View) : RecyclerView.ViewHolder(itemView) {
        val name: TextView = itemView.findViewById(R.id.trashWalletName)
        val address: TextView = itemView.findViewById(R.id.trashWalletAddress)
        val restore: MaterialButton = itemView.findViewById(R.id.trashRestoreWallet)
    }
}
