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
import java.text.SimpleDateFormat
import java.util.*

class TransactionAdapter(
    private var transactions: List<TransactionEntity>,
    var userAddresses: List<String>, // был val, теперь var
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
        
        // Определяем тип транзакции для пользователя
        val transactionType = getTransactionTypeForUser(transaction)
        val displayAmount = getDisplayAmount(transaction)
        
        // Устанавливаем иконку и текст типа
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
            else -> {
                holder.typeIcon.setImageResource(android.R.drawable.ic_menu_help)
                holder.typeText.text = "Unknown"
                holder.amountText.text = CoinFormatter.format(transaction.amount)
                holder.amountText.setTextColor(holder.itemView.context.getColor(R.color.color_unknown))
            }
        }
        
        // Адресный маршрут (короткий вид)
        val shortFrom = formatAddress(transaction.fromAddress)
        val shortTo = formatAddress(transaction.toAddress)
        val routeText: String = when (transactionType) {
            "mining" -> "⚒ mining → $shortTo"
            "send", "internal" -> "$shortFrom → $shortTo"
            "receive" -> "$shortFrom → $shortTo"
            else -> "$shortFrom → $shortTo"
        }
        holder.addressText.text = routeText
        // Можно стилизовать разным цветом, если есть желание: например, для send/receive
        when (transactionType) {
            "send" -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_send))
            "receive" -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_send))
            "mining" -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_mining))
            "internal" -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_internal))
            else -> holder.addressText.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.color_unknown))
        }
        
        // Устанавливаем время
        holder.timeText.text = dateFormat.format(Date(transaction.timestamp))
        
        // Устанавливаем статус
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
        
        // Устанавливаем подтверждения (Bitcoin-style)
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
        
        // Обработчик клика
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

    private fun getTransactionTypeForUser(transaction: TransactionEntity): String {
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
