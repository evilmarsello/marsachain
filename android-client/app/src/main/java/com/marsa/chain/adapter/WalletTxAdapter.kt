package com.marsa.chain.adapter

import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.marsa.chain.R
import com.marsa.chain.data.TransactionEntity
import com.marsa.chain.utils.CoinFormatter
import com.marsa.chain.utils.TxKindHelper
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** TMA-style wallet transaction rows (multi-line, colored). */
class WalletTxAdapter(
    private var transactions: List<TransactionEntity>,
    private val viewAddress: String
) : RecyclerView.Adapter<WalletTxAdapter.VH>() {

    private val dateFormat = SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.getDefault())

    private companion object {
        const val COLOR_WHITE = 0xFFFFFFFF.toInt()
        const val COLOR_GRAY = 0xFF8E8E93.toInt()
        const val COLOR_SEND = 0xFF34C759.toInt()
        const val COLOR_ACCENT = 0xFFFF9500.toInt()
    }

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val addrLine: TextView = view.findViewById(R.id.walletTxAddrLine)
        val metaLine: TextView = view.findViewById(R.id.walletTxMetaLine)
        val amountLine: TextView = view.findViewById(R.id.walletTxAmountLine)
        val hashLine: TextView = view.findViewById(R.id.walletTxHashLine)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_wallet_tx, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val tx = transactions[position]
        val ctx = holder.itemView.context
        val kind = TxKindHelper.normalizeKind(tx.type, tx.fromAddress, tx.txid)
        val kindLabel = kindLabel(ctx, kind)
        val shortFrom = shorten(tx.fromAddress)
        val shortTo = shorten(tx.toAddress)

        holder.addrLine.text = buildAddrLine(ctx, kind, kindLabel, shortFrom, shortTo)

        val block = tx.blockHeight?.takeIf { it > 0 }?.toString() ?: "mempool"
        val dateStr = dateFormat.format(Date(tx.timestamp))
        holder.metaLine.text = if (TxKindHelper.isStakeKind(kind)) {
            spanMeta(ctx, block, dateStr)
        } else {
            buildMetaLine(ctx, kind, kindLabel, block, dateStr)
        }

        val amt = CoinFormatter.format(tx.amount)
        val fee = CoinFormatter.format(tx.fee)
        holder.amountLine.text = if (kind == "mining" || kind == "validator_reward") {
            buildAmountOnly(ctx, amt)
        } else {
            buildAmountWithFee(ctx, amt, fee)
        }

        holder.hashLine.text = buildHashLine(tx.txid)
    }

    override fun getItemCount(): Int = transactions.size

    fun update(transactions: List<TransactionEntity>, viewAddress: String) {
        this.transactions = transactions
        notifyDataSetChanged()
    }

    private fun buildAddrLine(
        ctx: android.content.Context,
        kind: String,
        kindLabel: String,
        shortFrom: String,
        shortTo: String
    ): SpannableStringBuilder {
        val fromLab = ctx.getString(R.string.wallet_tx_label_from)
        val toLab = ctx.getString(R.string.wallet_tx_label_to)
        return when (kind) {
            "miner_stake", "miner_pool_stake", "stake" ->
                stakeLine(fromLab, shortFrom, toLab, kindLabel, outbound = true)
            "miner_unstake", "miner_pool_unstake", "unstake" ->
                stakeLine(fromLab, kindLabel, toLab, shortTo, outbound = false)
            else ->
                transferLine(fromLab, shortFrom, toLab, shortTo)
        }
    }

    private fun transferLine(fromLab: String, from: String, toLab: String, to: String): SpannableStringBuilder {
        val sb = SpannableStringBuilder()
        appendLabel(sb, "$fromLab ")
        appendAccent(sb, from)
        appendLabel(sb, " $toLab ")
        appendAccent(sb, to)
        return sb
    }

    private fun stakeLine(
        fromLab: String,
        fromVal: String,
        toLab: String,
        toVal: String,
        outbound: Boolean
    ): SpannableStringBuilder {
        val sb = SpannableStringBuilder()
        appendLabel(sb, "$fromLab ")
        if (outbound) {
            appendAccent(sb, fromVal)
            appendLabel(sb, " $toLab ")
            appendAccentBold(sb, toVal)
        } else {
            appendAccentBold(sb, fromVal)
            appendLabel(sb, " $toLab ")
            appendAccent(sb, toVal)
        }
        return sb
    }

    private fun buildMetaLine(
        ctx: android.content.Context,
        kind: String,
        kindLabel: String,
        block: String,
        dateStr: String
    ): SpannableStringBuilder {
        val sb = SpannableStringBuilder()
        val kindColor = when (kind) {
            "send" -> COLOR_SEND
            "receive" -> COLOR_ACCENT
            else -> COLOR_ACCENT
        }
        val start = sb.length
        sb.append(kindLabel)
        sb.setSpan(ForegroundColorSpan(kindColor), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sb.setSpan(StyleSpan(Typeface.BOLD), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        appendGray(sb, " · ${ctx.getString(R.string.wallet_tx_block_label)} ")
        appendWhite(sb, block)
        sb.append(" · ")
        val dateStart = sb.length
        sb.append(dateStr)
        sb.setSpan(ForegroundColorSpan(COLOR_GRAY), dateStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        return sb
    }

    private fun spanMeta(ctx: android.content.Context, block: String, dateStr: String): SpannableStringBuilder {
        val sb = SpannableStringBuilder()
        appendGray(sb, "${ctx.getString(R.string.wallet_tx_block_label)} ")
        appendWhite(sb, block)
        sb.append(" · ")
        val dateStart = sb.length
        sb.append(dateStr)
        sb.setSpan(ForegroundColorSpan(COLOR_GRAY), dateStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        return sb
    }

    private fun buildAmountOnly(ctx: android.content.Context, amt: String): SpannableStringBuilder {
        val sb = SpannableStringBuilder()
        appendGray(sb, "${ctx.getString(R.string.wallet_tx_amount_label)} ")
        appendWhite(sb, amt)
        appendGray(sb, " MRS")
        return sb
    }

    private fun buildAmountWithFee(ctx: android.content.Context, amt: String, fee: String): SpannableStringBuilder {
        val sb = SpannableStringBuilder()
        appendGray(sb, "${ctx.getString(R.string.wallet_tx_amount_label)} ")
        appendWhite(sb, amt)
        appendGray(sb, " MRS · ${ctx.getString(R.string.wallet_tx_fee_label)} ")
        appendWhite(sb, fee)
        appendGray(sb, " MRS")
        return sb
    }

    private fun buildHashLine(txid: String): SpannableStringBuilder {
        val sb = SpannableStringBuilder()
        appendLabel(sb, "Hash: ")
        val start = sb.length
        sb.append(txid)
        sb.setSpan(ForegroundColorSpan(COLOR_GRAY), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        return sb
    }

    private fun appendLabel(sb: SpannableStringBuilder, text: String) {
        val start = sb.length
        sb.append(text)
        sb.setSpan(ForegroundColorSpan(COLOR_WHITE), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sb.setSpan(StyleSpan(Typeface.BOLD), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    private fun appendAccent(sb: SpannableStringBuilder, text: String) {
        val start = sb.length
        sb.append(text)
        sb.setSpan(ForegroundColorSpan(COLOR_ACCENT), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    private fun appendAccentBold(sb: SpannableStringBuilder, text: String) {
        val start = sb.length
        sb.append(text)
        sb.setSpan(ForegroundColorSpan(COLOR_ACCENT), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sb.setSpan(StyleSpan(Typeface.BOLD), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    private fun appendWhite(sb: SpannableStringBuilder, text: String) {
        val start = sb.length
        sb.append(text)
        sb.setSpan(ForegroundColorSpan(COLOR_WHITE), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sb.setSpan(StyleSpan(Typeface.BOLD), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    private fun appendGray(sb: SpannableStringBuilder, text: String) {
        val start = sb.length
        sb.append(text)
        sb.setSpan(ForegroundColorSpan(COLOR_GRAY), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    private fun shorten(addr: String): String =
        if (addr.length > 20) "${addr.take(8)}…${addr.takeLast(8)}" else addr

    private fun kindLabel(ctx: android.content.Context, kind: String): String = when (kind) {
        "send" -> ctx.getString(R.string.wallet_tx_kind_send)
        "receive" -> ctx.getString(R.string.wallet_tx_kind_receive)
        "miner_stake" -> ctx.getString(R.string.tx_kind_miner_stake)
        "miner_unstake" -> ctx.getString(R.string.tx_kind_miner_unstake)
        "miner_pool_stake" -> ctx.getString(R.string.tx_kind_miner_pool_stake)
        "miner_pool_unstake" -> ctx.getString(R.string.tx_kind_miner_pool_unstake)
        "stake" -> ctx.getString(R.string.tx_kind_stake)
        "unstake" -> ctx.getString(R.string.tx_kind_unstake)
        "mining" -> ctx.getString(R.string.wallet_tx_kind_mining)
        "validator_reward" -> ctx.getString(R.string.tx_kind_validator_reward)
        else -> kind
    }
}
