package com.marsa.chain

import android.app.Dialog
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.text.SpannableString
import android.text.Spanned
import android.text.TextPaint
import android.text.method.LinkMovementMethod
import android.text.style.ClickableSpan
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.ArrayAdapter
import android.widget.GridLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.marsa.chain.crypto.hd.Bip39
import com.marsa.chain.databinding.ActivityOnboardingBinding
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.security.OnboardingPrefs
import com.marsa.chain.security.SeedVault
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

/**
 * Первый запуск: предупреждения → 24 слова → проверка 3 слов → сид в [SeedVault] + HD#0.
 * Либо восстановление по фразе (см. ТЗ).
 */
class OnboardingActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_FROM_SETTINGS_RESET = "extra_from_settings_reset"
    }

    private lateinit var binding: ActivityOnboardingBinding
    private lateinit var wordList: List<String>
    private var mnemonicLine: String = ""
    private lateinit var mnemonicWords: List<String>

    private var termsOfUseDialog: Dialog? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val fromSettingsReset = intent.getBooleanExtra(EXTRA_FROM_SETTINGS_RESET, false)
        if (!fromSettingsReset && OnboardingPrefs.isComplete(this)) {
            proceedToMain()
            return
        }
        if (fromSettingsReset) {
            runBlocking {
                WalletManager(applicationContext).wipeAllLocalWalletDataForFullReset()
            }
        }
        binding = ActivityOnboardingBinding.inflate(layoutInflater)
        setContentView(binding.root)

        wordList = Bip39.loadEnglishWordList(this)
        val adapter = ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, wordList)
        binding.acWord1.setAdapter(adapter)
        binding.acWord2.setAdapter(adapter)
        binding.acWord3.setAdapter(adapter)

        setupUnderstandTermsRow()

        binding.cbUnderstand.setOnClickListener {
            if (binding.cbUnderstand.isChecked) {
                binding.cbUnderstand.isChecked = false
                binding.cbUnderstand.post { showTermsOfUseDialog() }
            }
        }
        binding.tvWroteBackupLabel.setOnClickListener {
            binding.cbWroteBackup.performClick()
        }

        binding.btnContinueWarnings.setOnClickListener {
            if (!binding.cbUnderstand.isChecked || !binding.cbWroteBackup.isChecked) {
                Toast.makeText(this, "Please confirm both items", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            generateAndShowMnemonicFromWarnings()
        }

        binding.btnRestoreInstead.setOnClickListener {
            binding.stepWarnings.visibility = View.GONE
            binding.stepRestore.visibility = View.VISIBLE
            binding.tvToolbarTitle.text = "Restore"
        }

        binding.btnRestoreBack.setOnClickListener {
            binding.stepRestore.visibility = View.GONE
            binding.stepWarnings.visibility = View.VISIBLE
            binding.tvToolbarTitle.text = getString(R.string.onboarding_toolbar_default)
        }

        binding.btnRestoreSubmit.setOnClickListener { onRestoreSubmit() }

        binding.btnWordsContinue.setOnClickListener { showVerifyStep() }

        binding.btnVerifySubmit.setOnClickListener { onVerifySubmit() }
    }

    private fun setupUnderstandTermsRow() {
        val prefix = getString(R.string.onboarding_understand_prefix)
        val link = getString(R.string.onboarding_terms_of_use_link)
        val suffix = getString(R.string.onboarding_understand_suffix)
        val full = prefix + link + suffix
        val ss = SpannableString(full)
        val start = prefix.length
        val end = start + link.length
        val linkColor = ContextCompat.getColor(this, R.color.primary_color)
        val span = object : ClickableSpan() {
            override fun onClick(widget: View) {
                showTermsOfUseDialog()
            }

            override fun updateDrawState(ds: TextPaint) {
                super.updateDrawState(ds)
                ds.isUnderlineText = true
                ds.color = linkColor
            }
        }
        ss.setSpan(span, start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        binding.tvUnderstandTermsLink.text = ss
        binding.tvUnderstandTermsLink.movementMethod = LinkMovementMethod.getInstance()
        binding.tvUnderstandTermsLink.highlightColor = Color.TRANSPARENT
    }

    private fun showTermsOfUseDialog() {
        if (termsOfUseDialog?.isShowing == true) return
        val dialogView = layoutInflater.inflate(R.layout.dialog_terms_of_use, null, false)
        val bodyText = resources.openRawResource(R.raw.terms_of_use).bufferedReader().use { it.readText() }
        dialogView.findViewById<TextView>(R.id.tvTermsDialogBody).text = bodyText
        val dialog = Dialog(this)
        dialog.setContentView(dialogView)
        dialog.setCancelable(false)
        dialog.setCanceledOnTouchOutside(false)
        dialog.setOnKeyListener { _, keyCode, _ ->
            keyCode == KeyEvent.KEYCODE_BACK
        }
        dialogView.findViewById<TextView>(R.id.btnTermsAccept).setOnClickListener {
            binding.cbUnderstand.isChecked = true
            dialog.dismiss()
        }
        dialog.setOnDismissListener { termsOfUseDialog = null }
        termsOfUseDialog = dialog
        dialog.show()
        val window = dialog.window ?: return
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        val metrics = resources.displayMetrics
        val w = (metrics.widthPixels * 0.90f).toInt().coerceAtMost((420 * metrics.density).toInt())
        window.setLayout(w, WindowManager.LayoutParams.WRAP_CONTENT)
    }

    private fun generateAndShowMnemonicFromWarnings() {
        mnemonicLine = Bip39.generateMnemonic(wordList)
        mnemonicWords = mnemonicLine.split(" ")
        require(mnemonicWords.size == 24)
        showMnemonicDisplayStep()
    }

    /** Показ сетки слов без перегенерации (например после ошибки проверки). */
    private fun showMnemonicDisplayStep() {
        require(mnemonicWords.size == 24)
        populateMnemonicGrid(mnemonicWords)
        binding.stepWarnings.visibility = View.GONE
        binding.stepVerify.visibility = View.GONE
        binding.stepRestore.visibility = View.GONE
        binding.stepWords.visibility = View.VISIBLE
        binding.tvToolbarTitle.text = "Seed phrase (24 words)"
    }

    private fun populateMnemonicGrid(words: List<String>) {
        binding.mnemonicGrid.removeAllViews()
        val marginPx = (3 * resources.displayMetrics.density).toInt()
        words.forEachIndexed { index, word ->
            val tile = layoutInflater.inflate(R.layout.item_onboarding_mnemonic_word, binding.mnemonicGrid, false)
            tile.findViewById<TextView>(R.id.tvWordIndex).text = "${index + 1}."
            tile.findViewById<TextView>(R.id.tvWordText).text = word
            val rowSpec = GridLayout.spec(index / 3)
            val colSpec = GridLayout.spec(index % 3, 1f)
            val lp = GridLayout.LayoutParams(rowSpec, colSpec).apply {
                width = 0
                height = GridLayout.LayoutParams.WRAP_CONTENT
                setMargins(marginPx, marginPx, marginPx, marginPx)
            }
            binding.mnemonicGrid.addView(tile, lp)
        }
    }

    private fun showVerifyStep() {
        binding.mnemonicGrid.removeAllViews()
        val order = (1..24).shuffled().take(3)
        binding.tvLabelWord1.text = "Word ${order[0]}"
        binding.tvLabelWord2.text = "Word ${order[1]}"
        binding.tvLabelWord3.text = "Word ${order[2]}"
        binding.stepWords.visibility = View.GONE
        binding.stepVerify.visibility = View.VISIBLE
        binding.tvToolbarTitle.text = "Verify seed phrase"
        binding.acWord1.setText("")
        binding.acWord2.setText("")
        binding.acWord3.setText("")
        binding.acWord1.tag = order[0]
        binding.acWord2.tag = order[1]
        binding.acWord3.tag = order[2]
    }

    private fun wordMatches(pos: Int, field: android.widget.AutoCompleteTextView): Boolean {
        val expected = mnemonicWords[pos - 1]
        val got = field.text.toString().trim().lowercase()
        return got == expected
    }

    private fun onVerifySubmit() {
        val p1 = binding.acWord1.tag as Int
        val p2 = binding.acWord2.tag as Int
        val p3 = binding.acWord3.tag as Int
        val ok = wordMatches(p1, binding.acWord1) &&
            wordMatches(p2, binding.acWord2) &&
            wordMatches(p3, binding.acWord3)
        if (!ok) {
            Toast.makeText(this, "Incorrect words. Review your seed phrase and try again.", Toast.LENGTH_LONG).show()
            showMnemonicDisplayStep()
            return
        }
        completeOnboarding()
    }

    private fun onRestoreSubmit() {
        val raw = binding.etRestoreMnemonic.text.toString()
        if (!Bip39.validateMnemonicPhrase(raw, wordList)) {
            Toast.makeText(this, "Invalid seed phrase or checksum", Toast.LENGTH_LONG).show()
            return
        }
        if (SeedVault(this).hasSeed()) {
            AlertDialog.Builder(this)
                .setTitle("Replace HD wallets?")
                .setMessage(
                    "Current HD wallets will be removed from this app. " +
                        "Key-imported wallets will stay."
                )
                .setNegativeButton(android.R.string.cancel, null)
                .setPositiveButton("Continue") { _, _ ->
                    lifecycleScope.launch { runRestore(raw) }
                }
                .show()
            return
        }
        lifecycleScope.launch { runRestore(raw) }
    }

    private suspend fun runRestore(raw: String) {
        val wm = WalletManager(this@OnboardingActivity)
        wm.restoreFromMnemonicTwentyFourWords(raw, wordList)
        OnboardingPrefs.markComplete(this@OnboardingActivity)
        proceedToMain()
    }

    private fun completeOnboarding() {
        val seed = Bip39.mnemonicToSeedBytes(mnemonicLine)
        mnemonicLine = ""
        mnemonicWords = emptyList()
        binding.mnemonicGrid.removeAllViews()
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                WalletManager(this@OnboardingActivity).setupHdWalletAfterOnboarding(seed)
            }
            OnboardingPrefs.markComplete(this@OnboardingActivity)
            proceedToMain()
        }
    }

    private fun proceedToMain() {
        startActivity(
            Intent(this, MainActivity::class.java).addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            )
        )
        finish()
    }
}
