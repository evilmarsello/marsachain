package com.marsa.chain

import android.os.Bundle
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import com.marsa.chain.databinding.ActivityMainBinding
import com.marsa.chain.fragments.MiningFragment
import com.marsa.chain.fragments.WalletFragment
import com.marsa.chain.fragments.SettingsFragment
import com.marsa.chain.fragments.StatisticsFragment
import com.marsa.chain.fragments.WalletsListFragment
import com.marsa.chain.fragments.HistoryFragment
import com.marsa.chain.fragments.WalletSettingsFragment
import com.marsa.chain.fragments.WalletTrashFragment
import com.marsa.chain.fragments.AboutFragment
import com.marsa.chain.fragments.AboutMarsaChainFragment
import com.marsa.chain.fragments.ConnectionsFragment
import com.marsa.chain.fragments.PoolsListFragment
import com.marsa.chain.fragments.PoolDetailFragment
import com.marsa.chain.fragments.NetworkConfigFragment
import com.marsa.chain.fragments.SocialMediaFragment
import com.marsa.chain.manager.WalletManager
import com.marsa.chain.manager.LocaleManager
import com.marsa.chain.security.OnboardingPrefs
import com.marsa.chain.ui.HeaderInsets
import com.marsa.chain.ui.UiTheme

class MainActivity : FragmentActivity() {
    private lateinit var binding: ActivityMainBinding
    private var currentFragment: Fragment? = null

    override fun attachBaseContext(newBase: android.content.Context) {
        super.attachBaseContext(LocaleManager.attachBaseContext(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        UiTheme.apply(this)
        super.onCreate(savedInstanceState)
        if (!OnboardingPrefs.isComplete(this)) {
            startActivity(android.content.Intent(this, OnboardingActivity::class.java))
            finish()
            return
        }
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        HeaderInsets.applyTopBar(binding.topBar)

        initializeWallets()
        
        setupTabs()
        setupStatisticsButton()
        setupBackStackListener()
        showFragment(MiningFragment())
        setBackButtonVisible(false)
    }

    
    private fun setBackButtonVisible(visible: Boolean) {
        binding.backButton.visibility = if (visible) View.VISIBLE else View.GONE
        binding.headerLogo.visibility = if (visible) View.GONE else View.VISIBLE
        val mlp = binding.backButton.layoutParams as ViewGroup.MarginLayoutParams
        mlp.marginStart = if (visible) {
            TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                4f,
                resources.displayMetrics
            ).toInt()
        } else {
            TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                38f,
                resources.displayMetrics
            ).toInt()
        }
        binding.backButton.layoutParams = mlp
    }
    
    private fun initializeWallets() {
        lifecycleScope.launch {
            try {
                val walletManager = WalletManager(this@MainActivity)
                
                walletManager.migrateOldWallet()
                
                val activeWallet = walletManager.getActiveWallet()
                if (activeWallet != null) {
                    android.util.Log.d("MainActivity", "✅ Active wallet found: ${activeWallet.address}")
                } else {
                    android.util.Log.w("MainActivity", "⚠️ No active wallet")
                    val allWallets = walletManager.getAllWallets().first()
                    android.util.Log.d("MainActivity", "📊 Total wallets: ${allWallets.size}")
                    if (allWallets.isNotEmpty()) {
                        walletManager.setActiveWallet(allWallets.first().address)
                        android.util.Log.d("MainActivity", "Activated first wallet: ${allWallets.first().address}")
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Failed to initialize wallets: ${e.message}")
            }
        }
    }

    private fun setupTabs() {
        // Set initial selection
        binding.miningTab.isSelected = true
        binding.titleText.text = getString(R.string.title_mining)
        
        // Tab listeners
        binding.walletTab.setOnClickListener {
            selectTab(binding.walletTab)
            showFragment(WalletFragment())
            binding.titleText.text = getString(R.string.title_wallet)
            setBackButtonVisible(false)
        }
        
        binding.miningTab.setOnClickListener {
            selectTab(binding.miningTab)
            showFragment(MiningFragment())
            binding.titleText.text = getString(R.string.title_mining)
            setBackButtonVisible(false)
        }
        
        binding.settingsTab.setOnClickListener {
            selectTab(binding.settingsTab)
            showFragment(SettingsFragment())
            binding.titleText.text = getString(R.string.title_settings)
            setBackButtonVisible(false)
        }
    }

    private fun selectTab(selectedTab: View) {
        // Clear all selections
        binding.walletTab.isSelected = false
        binding.miningTab.isSelected = false
        binding.settingsTab.isSelected = false
        
        // Set selected tab
        selectedTab.isSelected = true
    }

    private fun setupStatisticsButton() {
        binding.statisticsButton.setOnClickListener {
            showFragment(StatisticsFragment(), addToBackStack = true)
            binding.titleText.text = getString(R.string.title_statistics)
            setBackButtonVisible(true)
        }
        
        binding.backButton.setOnClickListener {
            if (supportFragmentManager.backStackEntryCount > 0) {
                supportFragmentManager.popBackStackImmediate()
                updateTitleAndBackButtonFromVisibleFragment()
            } else {
                when (currentFragment) {
                    is StatisticsFragment -> {
                        selectTab(binding.miningTab)
                        showFragment(MiningFragment())
                        updateTitleAndBackButtonFromVisibleFragment()
                    }
                    is WalletsListFragment -> {
                        selectTab(binding.settingsTab)
                        showFragment(SettingsFragment())
                        updateTitleAndBackButtonFromVisibleFragment()
                    }
                    is HistoryFragment -> {
                        selectTab(binding.walletTab)
                        showFragment(WalletFragment())
                        updateTitleAndBackButtonFromVisibleFragment()
                    }
                    is WalletTrashFragment -> {
                        selectTab(binding.walletTab)
                        showFragment(WalletFragment())
                        updateTitleAndBackButtonFromVisibleFragment()
                    }
                    is WalletSettingsFragment -> {
                        selectTab(binding.walletTab)
                        showFragment(WalletFragment())
                        updateTitleAndBackButtonFromVisibleFragment()
                    }
                    is PoolsListFragment -> {
                        selectTab(binding.walletTab)
                        showFragment(WalletFragment())
                        updateTitleAndBackButtonFromVisibleFragment()
                    }
                    is PoolDetailFragment -> {
                        showFragment(PoolsListFragment(), addToBackStack = false)
                        showBackButton(getString(R.string.pools_title))
                    }
                    is NetworkConfigFragment -> {
                        selectTab(binding.settingsTab)
                        showFragment(SettingsFragment())
                        updateTitleAndBackButtonFromVisibleFragment()
                    }
                    is SocialMediaFragment -> {
                        selectTab(binding.settingsTab)
                        showFragment(SettingsFragment())
                        updateTitleAndBackButtonFromVisibleFragment()
                    }
                    else -> {
                        selectTab(binding.miningTab)
                        showFragment(MiningFragment())
                        updateTitleAndBackButtonFromVisibleFragment()
                    }
                }
            }
        }
    }

    
    private fun updateTitleAndBackButtonFromVisibleFragment() {
        val frag = supportFragmentManager.findFragmentById(R.id.contentFrame)
        currentFragment = frag
        when (frag) {
            is MiningFragment -> {
                binding.titleText.text = getString(R.string.title_mining)
                setBackButtonVisible(false)
                selectTab(binding.miningTab)
            }
            is WalletFragment -> {
                binding.titleText.text = getString(R.string.title_wallet)
                setBackButtonVisible(false)
                selectTab(binding.walletTab)
            }
            is SettingsFragment -> {
                binding.titleText.text = getString(R.string.title_settings)
                setBackButtonVisible(false)
                selectTab(binding.settingsTab)
            }
            is StatisticsFragment -> {
                binding.titleText.text = getString(R.string.title_statistics)
                setBackButtonVisible(true)
            }
            is HistoryFragment -> {
                binding.titleText.text = getString(R.string.title_history)
                setBackButtonVisible(true)
            }
            is WalletsListFragment -> {
                binding.titleText.text = getString(R.string.title_wallets)
                setBackButtonVisible(true)
            }
            is WalletTrashFragment -> {
                binding.titleText.text = getString(R.string.title_deleted_wallets)
                setBackButtonVisible(true)
                selectTab(binding.walletTab)
            }
            is WalletSettingsFragment -> {
                binding.titleText.text = getString(R.string.title_wallet_settings)
                setBackButtonVisible(true)
                selectTab(binding.walletTab)
            }
            is ConnectionsFragment -> {
                binding.titleText.text = getString(R.string.title_connections)
                setBackButtonVisible(true)
            }
            is AboutFragment -> {
                binding.titleText.text = getString(R.string.title_about)
                setBackButtonVisible(true)
                selectTab(binding.settingsTab)
            }
            is AboutMarsaChainFragment -> {
                binding.titleText.text = getString(R.string.title_about_marsa)
                setBackButtonVisible(true)
                selectTab(binding.settingsTab)
            }
            is NetworkConfigFragment -> {
                binding.titleText.text = getString(R.string.network_config_title)
                setBackButtonVisible(true)
                selectTab(binding.settingsTab)
            }
            is SocialMediaFragment -> {
                binding.titleText.text = getString(R.string.social_media_title)
                setBackButtonVisible(true)
                selectTab(binding.settingsTab)
            }
            is PoolsListFragment -> {
                binding.titleText.text = getString(R.string.pools_title)
                setBackButtonVisible(true)
                selectTab(binding.walletTab)
            }
            is PoolDetailFragment -> {
                setBackButtonVisible(true)
                selectTab(binding.walletTab)
            }
            else -> {
                binding.titleText.text = getString(R.string.title_mining)
                setBackButtonVisible(false)
                selectTab(binding.miningTab)
            }
        }
    }

    private fun showFragment(fragment: Fragment, addToBackStack: Boolean = false) {
        if (currentFragment != fragment) {
            currentFragment = fragment
            val transaction = supportFragmentManager.beginTransaction()
                .replace(R.id.contentFrame, fragment)
            
            if (addToBackStack) {
                transaction.addToBackStack(null)
            }
            
            transaction.commit()
        }
    }
    
    fun showBackButton(title: String) {
        setBackButtonVisible(true)
        binding.titleText.text = title
    }
    
    fun hideBackButton() {
        setBackButtonVisible(false)
    }
    
    fun showHistoryFragment() {
        showFragment(HistoryFragment(), addToBackStack = true)
        showBackButton(getString(R.string.title_history))
    }

    fun showWalletSettingsFragment() {
        showFragment(WalletSettingsFragment(), addToBackStack = true)
        showBackButton(getString(R.string.title_wallet_settings))
        selectTab(binding.walletTab)
    }

    fun showPoolsListFragment() {
        showFragment(PoolsListFragment(), addToBackStack = true)
        showBackButton(getString(R.string.pools_title))
        selectTab(binding.walletTab)
    }

    fun showPoolDetailFragment(poolId: Int, poolName: String) {
        showFragment(PoolDetailFragment.newInstance(poolId, poolName), addToBackStack = true)
        showBackButton(poolName)
        selectTab(binding.walletTab)
    }
    
    private fun setupBackStackListener() {
        supportFragmentManager.addOnBackStackChangedListener {
            updateTitleAndBackButtonFromVisibleFragment()
        }
    }
    
    override fun onBackPressed() {
        if (supportFragmentManager.backStackEntryCount > 0) {
            supportFragmentManager.popBackStackImmediate()
            updateTitleAndBackButtonFromVisibleFragment()
        } else {
            super.onBackPressed()
        }
    }
    
    fun updateApiClients() {
        // Update ApiClient in all fragments when connection settings change
        // Fragments will update their ApiClient instances in onResume()
        android.util.Log.d("MainActivity", "Connection settings updated - fragments will refresh on resume")
    }
}