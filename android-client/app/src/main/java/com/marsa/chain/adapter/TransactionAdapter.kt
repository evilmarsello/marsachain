package com.marsa.chain.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.ImageView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.marsa.chain.R
import com.marsa.chain.data.TransactionEntity
import com.marsa.chain.utils.CoinFormatter
import com.marsa.chain.utils.TxKindHelper
import java.text.SimpleDateFormat
import java.util.*

class TransactionAdapter(
    private var transactions: List<TransactionEntity>,
    var userAddresses: List<String>,
    private val onTransactionClick: (TransactionEntity) -> Unit
) : RecyclerView.Adapter<TransactionAdapter.TransactionViewHolder>() {

    private val dateFormat = SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.getDefault())
    private var chainHeight: Int? = null

    class TransactionViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val typeIcon: ImageView = view.findViewById(R.id.transactionTypeIcon)
        val typeText: TextView = view.findViewById(R.id.transactionTypeText)
        val amountText: TextView = view.findViewById(R.id.transactionAmountText)
        val addressText: TextView = view.findViewById(R.id.transactionAddressText)
        val timeText: TextView = view.findViewById(R.id.transactionTimeText)
        val statusText: TextView = view.findViewById(R.id.transactionStatusText)
        val confirmationsText: TextView = view.findViewById(R.id.transactionConfirmationsText)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): TransactionViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_transaction, parent, false)
        return TransactionViewHolder(view)
    }

    override fun onBindViewHolder(holder: TransactionViewHolder, position: Int) {
        val transaction = transactions[position]
        
        val transactionType = getTransactionTypeForUser(transaction)
        val displayAmount = getDisplayAmount(transaction)
        
        when (transactionType) {
            "send" -> {
                holder.typeIcon.setImageResource(R.drawable.send_money)
                holder.typeText.text = "Sent"
                val totalNanos = transaction.amount + transaction.fee
                holder.amountText.text = "-${CoinFormatter.format(totalNanos)}"
                holder.amountText.setTextColor(holder.itemView.context.getColor(R.color.color_send))
            }
            "receive" -> {
                holder.typeIcon.setImageResource(R.drawable.receive)
                holder.typeText.text = "Received"
                holder.amountText.text = "+${CoinFormatter.format(transaction.amount)}"
                holder.amountText.setTextColor(holder.itemView.context.getColor(R.color.color_receive))
            }
            "mining" -> {
                holder.typeIcon.setImageResource(R.drawable.ic_mining2)
                holder.typeText.text = "Mining Reward"
                holder.amountText.text = "+${CoinFormatter.format(transaction.amount)}"
                holder.amountText.setTextColor(holder.itemView.context.getColor(R.color.color_mining))
            }
            "internal" -> {
                holder.typeIcon.setImageResource(R.drawable.ic_swap)
                holder.typeText.text = "Internal Transfer"
                holder.amountText.text = CoinFormatter.format(transaction.amount)
                holder.amountText.setTextColor(holder.itemView.context.getColor(R.color.color_internal))
            }
            "miner_stake" -> bindStakeRow(holder, transaction, R.string.tx_kind_miner_stake)
            "miner_unstake" -> bindStakeRow(holder, transaction, R.string.tx_kind_miner_unstake, debit = false)
            "miner_pool_stake" -> bindStakeRow(holder, transaction, R.string.tx_kind_miner_pool_stake)
            "miner_pool_unstake" -> bindStakeRow(holder, transaction, R.string.tx_kind_miner_pool_unstake, debit = false)
            "stake", "unstake" -> bindStakeRow(
                holder,
                transaction,
                if (transactionType == "stake") R.string.tx_kind_stake else R.string.tx_kind_unstake,
                debit = transactionType == "stake"
            )
            "validator_reward" -> {
                holder.typeIcon.setImageResource(R.drawable.ic_mining2)
                holder.typeText.text = holder.itemView.context.getString(R.string.tx_kind_validator_reward)
                holder.amountText.text = "+${CoinFormatter.format(transaction.amount)}"
                holder.amountText.setTextColor(holder.itemView.context.getColor(R.color.color_mining))
            }
            else -> {
                holder.typeIcon.setImageResource(android.R.drawable.ic_menu_help)
                holder.typeText.text = "Unknown"
                holder.amountText.text = CoinFormatter.format(transaction.amount)
                holder.amountText.setTextColor(holder.itemView.context.getColor(R.color.color_unknown))
            }
        }
        
        val shortFrom = formatAddress(transaction.fromAddress)
        val shortTo = formatAddress(transaction.toAddress)
        val routeText: String = when (transactionType) {
            "mining", "validator_reward" -> "⚒ mining → $shortTo"
            "miner_stake", "miner_unstake", "miner_pool_stake", "miner_pool_unstake", "stake", "unstake" ->
                holder.itemView.context.getString(R.string.tx_route_stake, shortFrom)
            "send", "internal" -> "$shortFrom → $shortTo"
            "receive" -> "$shortFrom → $shortTo"
            else -> "$shortFrom → $shortTo"
        }
        holder.addressText.text = routeText
        when (transactionType) {
            "send" -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_send))
            "receive" -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_send))
            "mining", "validator_reward" -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_mining))
            "internal" -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_internal))
            "miner_stake", "miner_unstake", "miner_pool_stake", "miner_pool_unstake", "stake", "unstake" ->
                holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_internal))
            else -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_unknown))
        }
        
        holder.timeText.text = dateFormat.format(Date(transaction.timestamp))
        
        val displayStatus = when {
            transaction.type == "mining" -> "Success ⚒"
            chainHeight != null && transaction.blockHeight != null -> {
                val h = chainHeight!!
                val bh = transaction.blockHeight!!
                val conf = if (h >= bh) (h - bh + 1) else 0
                if (conf >= 10) "Confirmed" else "Pending"
            }
            transaction.status == "confirmed" -> "Confirmed"
            else -> transaction.status.capitalize()
        }
        holder.statusText.text = displayStatus
        when (displayStatus.lowercase()) {
            "confirmed", "success" -> holder.statusText.setTextColor(holder.itemView.context.getColor(R.color.color_confirmed))
            "pending" -> holder.statusText.setTextColor(holder.itemView.context.getColor(R.color.color_pending))
            "failed" -> holder.statusText.setTextColor(holder.itemView.context.getColor(R.color.color_failed))
            else -> holder.statusText.setTextColor(holder.itemView.context.getColor(R.color.color_confirmed))
        }
        
        if (transaction.type != "mining") {
            val conf = when {
                chainHeight != null && transaction.blockHeight != null -> {
                    val h = chainHeight!!
                    val bh = transaction.blockHeight!!
                    val c = if (h >= bh) (h - bh + 1) else 0
                    c.coerceAtMost(10)
                }
                else -> transaction.confirmations
            }
            val label = if (conf >= 10) "10/10" else "Confirmations ${conf}/10"
            holder.confirmationsText.text = label
            holder.confirmationsText.visibility = View.VISIBLE
        } else {
            holder.confirmationsText.visibility = View.GONE
        }
        
        holder.itemView.setOnClickListener {
            onTransactionClick(transaction)
        }
    }

    override fun getItemCount(): Int = transactions.size

    fun updateTransactions(newTransactions: List<TransactionEntity>) {
        transactions = newTransactions
        notifyDataSetChanged()
    }

    fun updateUserAddresses(newAddresses: List<String>) {
        userAddresses = newAddresses
    }

    fun updateChainHeight(newHeight: Int?) {
        chainHeight = newHeight
        notifyDataSetChanged()
    }

    private fun getTransactionTypeForUser(transaction: TransactionEntity): String =
        TxKindHelper.classifyForUser(transaction, userAddresses)

    private fun bindStakeRow(
        holder: TransactionViewHolder,
        transaction: TransactionEntity,
        labelRes: Int,
        debit: Boolean = true
    ) {
        holder.typeIcon.setImageResource(R.drawable.miner_stake)
        holder.typeText.text = holder.itemView.context.getString(labelRes)
        val total = TxKindHelper.stakeDebitAmount(transaction)
        holder.amountText.text = if (debit) "-${CoinFormatter.format(total)}" else CoinFormatter.format(transaction.amount)
        holder.amountText.setTextColor(holder.itemView.context.getColor(R.color.color_internal))
    }

    private fun getDisplayAmount(transaction: TransactionEntity): Long {
        val isFromUser = userAddresses.contains(transaction.fromAddress)
        val isToUser = userAddresses.contains(transaction.toAddress)
        
        return when {
            transaction.type == "mining" -> transaction.amount
            isFromUser && isToUser -> transaction.amount
            isFromUser -> -(transaction.amount + transaction.fee)
            isToUser -> transaction.amount
            else -> 0L
        }
    }

    private fun formatAddress(address: String): String {
        return if (address.length > 20) {
            "${address.take(8)}...${address.takeLast(8)}"
        } else {
            address
        }
    }
}
