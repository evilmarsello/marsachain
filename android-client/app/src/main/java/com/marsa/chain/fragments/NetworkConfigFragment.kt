package com.marsa.chain.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentNetworkConfigBinding

class NetworkConfigFragment : Fragment() {

    private var _binding: FragmentNetworkConfigBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentNetworkConfigBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val sections = networkConfigSections()
        val inflater = LayoutInflater.from(requireContext())
        sections.forEach { section ->
            val card = inflater.inflate(R.layout.network_config_section, binding.networkConfigSections, false)
            card.findViewById<TextView>(R.id.networkConfigSectionTitle).text = section.title
            val body = card.findViewById<LinearLayout>(R.id.networkConfigSectionBody)
            section.paragraphs.forEach { paragraph ->
                val p = TextView(requireContext()).apply {
                    text = paragraph
                    setTextColor(0xFF8E8E93.toInt())
                    textSize = 14f
                    setLineSpacing(4f, 1f)
                    val lp = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                    lp.bottomMargin = (12 * resources.displayMetrics.density).toInt()
                    layoutParams = lp
                }
                body.addView(p)
            }
            binding.networkConfigSections.addView(card)
        }
    }

    private data class ConfigSection(val title: String, val paragraphs: List<String>)

    private fun networkConfigSections(): List<ConfigSection> {
        val ru = resources.configuration.locales[0].language == "ru"
        return if (ru) listOf(
            ConfigSection(
                "Халвинги блоков",
                listOf(
                    "Каждые 1 050 000 блоков сеть применяет халвинг к награде за блок и связанным экономическим параметрам.",
                    "График снижения: 1-й халвинг −50%, 2-й −40%, 3-й −30%, 4-й −20%, 5-й и далее −10% на каждый шаг.",
                    "После каждого интервала награда умножается на оставшуюся долю."
                )
            ),
            ConfigSection(
                "Награда за блок (текущая эра)",
                listOf(
                    "Общая награда за добытый блок: 10 000 MRS.",
                    "9 000 MRS получает майнер, создавший блок; 1 000 MRS делится между валидаторами."
                )
            ),
            ConfigSection(
                "Эмиссия и время блока",
                listOf(
                    "Максимальная эмиссия: 50 миллиардов MRS.",
                    "Среднее время добычи одного блока: около 12–15 секунд."
                )
            ),
            ConfigSection(
                "Кредиты майнинга",
                listOf(
                    "Стоимость одного кредита майнинга сейчас составляет 10 MRS.",
                    "Это значение снижается с халвингами по той же схеме, что и награда за блок."
                )
            ),
            ConfigSection(
                "Константы сети",
                listOf(
                    "MIN_MINER_STAKE_LOCK_BLOCKS = 10 000 — минимум блоков до MINER_UNSTAKE.",
                    "MIN_STAKE_DURATION = 250 000 — минимальный срок стейкинга валидаторов.",
                    "REFILL_PERIOD = 100 — каждые 100 блоков кредиты пополняются заново."
                )
            )
        ) else listOf(
            ConfigSection(
                "Block halvings",
                listOf(
                    "Every 1,050,000 blocks the network applies a halving to the block reward and related economic parameters.",
                    "Reduction schedule: 1st −50%, 2nd −40%, 3rd −30%, 4th −20%, 5th and later −10% each.",
                    "After each interval the reward is multiplied by the remaining share."
                )
            ),
            ConfigSection(
                "Block reward (current era)",
                listOf(
                    "Total reward per mined block: 10,000 MRS.",
                    "9,000 MRS goes to the miner; 1,000 MRS is shared among validators who voted for that block."
                )
            ),
            ConfigSection(
                "Supply and block time",
                listOf(
                    "Maximum supply: 50 billion MRS.",
                    "Average time to mine one block: about 12–15 seconds."
                )
            ),
            ConfigSection(
                "Mining credits",
                listOf(
                    "The cost of one mining credit is currently 10 MRS.",
                    "This value decreases with halvings using the same schedule as the block reward."
                )
            ),
            ConfigSection(
                "On-chain constants",
                listOf(
                    "MIN_MINER_STAKE_LOCK_BLOCKS = 10,000 — minimum blocks before MINER_UNSTAKE.",
                    "MIN_STAKE_DURATION = 250,000 — minimum staking period for validators.",
                    "REFILL_PERIOD = 100 — every 100 blocks unused credits expire and the budget is refilled."
                )
            )
        )
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
