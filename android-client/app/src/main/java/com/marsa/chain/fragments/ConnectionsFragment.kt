package com.marsa.chain.fragments

import android.app.AlertDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.marsa.chain.R
import com.marsa.chain.databinding.FragmentConnectionsBinding
import com.marsa.chain.manager.ConnectionManager
import com.marsa.chain.manager.ValidatorNodeInfo
import com.marsa.chain.network.ApiClient
import com.marsa.chain.network.Api
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.isActive

class ConnectionsFragment : Fragment() {
    private var _binding: FragmentConnectionsBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var connectionManager: ConnectionManager
    private lateinit var autoIpsAdapter: AutoIpsAdapter
    private var autoIpsList = mutableListOf<String>()
    private var connectionCheckJob: Job? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentConnectionsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        connectionManager = ConnectionManager(requireContext())
        
        setupUI()
        loadSettings()
        startConnectionCheck()
    }
    
    override fun onDestroyView() {
        super.onDestroyView()
        connectionCheckJob?.cancel()
        _binding = null
    }

    private fun setupUI() {
        // Radio button listeners
        binding.autoConnectRadio.setOnClickListener {
            switchToAutoMode()
        }
        
        binding.manualConnectRadio.setOnClickListener {
            switchToManualMode()
        }
        
        // Setup RecyclerView for auto IPs
        autoIpsAdapter = AutoIpsAdapter(autoIpsList, connectionManager) { ip ->
            val nodeIndex = autoIpsList.indexOf(ip)
            if (nodeIndex <= 0) {
                return@AutoIpsAdapter
            }
            if (!connectionManager.isAutoSelectEnabled()) {
                connectionManager.setSelectedAutoIp(ip)
                updateApiClients()
                checkConnectionStatus()
                autoIpsAdapter.notifyDataSetChanged()
                Toast.makeText(requireContext(), getString(R.string.connection_node_name, nodeIndex + 1), Toast.LENGTH_SHORT).show()
            } else {
                showEditAutoIpDialog(ip)
            }
        }
        binding.autoIpsRecyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.autoIpsRecyclerView.adapter = autoIpsAdapter
        
        // Auto-select switch
        binding.autoSelectSwitch.isChecked = connectionManager.isAutoSelectEnabled()
        binding.autoSelectSwitch.setOnCheckedChangeListener { _, isChecked ->
            connectionManager.setAutoSelectEnabled(isChecked)
            if (isChecked) {
                // Если включили auto-select - очищаем выбранный IP
                connectionManager.setSelectedAutoIp(null)
                // Проверяем все IP и выбираем первый рабочий
                findAndSelectWorkingServer()
            } else {
                // Если выключили - используем текущий выбранный или первый из списка
                val currentSelected = connectionManager.getSelectedAutoIp()
                if (currentSelected == null || !connectionManager.getAutoIps().contains(currentSelected)) {
                    connectionManager.setSelectedAutoIp(connectionManager.getAutoIps().firstOrNull())
                }
                updateApiClients()
                checkConnectionStatus()
            }
        }
        
        // Add IP button
        binding.addAutoIpButton.setOnClickListener {
            showAddAutoIpDialog()
        }
        
        // Connect manual connection button
        binding.connectManualButton.setOnClickListener {
            connectManual()
        }
        
        // Disconnect manual connection button
        binding.disconnectManualButton.setOnClickListener {
            disconnectManual()
        }
    }
    
    private fun loadSettings() {
        val mode = connectionManager.getConnectionMode()
        
        if (mode == ConnectionManager.ConnectionMode.AUTO) {
            binding.autoConnectRadio.isChecked = true
            switchToAutoMode()
        } else {
            binding.manualConnectRadio.isChecked = true
            switchToManualMode()
        }
        
        autoIpsList.clear()
        autoIpsList.addAll(connectionManager.getAutoIps())
        autoIpsAdapter.notifyDataSetChanged()
        
        // Load auto-select switch state
        binding.autoSelectSwitch.isChecked = connectionManager.isAutoSelectEnabled()
        
        // Load manual settings
        val manualIp = connectionManager.getManualIp()
        binding.manualIpEditText.setText(manualIp)
        
        // Check connection status after loading settings
        if (mode == ConnectionManager.ConnectionMode.AUTO) {
            if (connectionManager.isAutoSelectEnabled()) {
                findAndSelectWorkingServer()
            } else {
                checkConnectionStatus()
            }
        } else if (mode == ConnectionManager.ConnectionMode.MANUAL && manualIp.isNotEmpty()) {
            checkManualConnectionStatus()
        }
    }

    private fun loadValidatorsFromNode() {
        binding.loadFromNodeButton.isEnabled = false
        binding.loadFromNodeButton.text = "Loading..."
        viewLifecycleOwner.lifecycleScope.launch {
            val urls = connectionManager.getCandidateBaseUrls()
            var done = false
            for (url in urls) {
                if (!isAdded) break
                val data = ApiClient(requireContext()).getValidatorsFrom(url)
                if (data != null && data.validators.isNotEmpty()) {
                    val nodes = data.validators
                        .filter { !it.ip.isNullOrBlank() }
                        .map { v ->
                            val apiPort = when {
                                (v.api_port ?: 0) > 0 -> v.api_port!!
                                (v.port ?: 0) > 0 -> v.port!!
                                else -> 80
                            }
                            ValidatorNodeInfo(
                                ip = v.ip!!,
                                apiPort = apiPort,
                                activeMinerCount = v.active_miner_count ?: 0,
                                minerCapacity = v.miner_capacity ?: 150,
                                minerSlotsFree = v.miner_slots_free ?: 150,
                                isActive = v.is_active,
                                isOverloaded = v.is_overloaded == true,
                                loadPercent = v.load_percent ?: 0
                            )
                        }
                    if (nodes.isNotEmpty()) {
                        withContext(Dispatchers.Main) {
                            if (_binding == null) return@withContext
                            connectionManager.setValidatorNodes(nodes)
                            autoIpsList.clear()
                            autoIpsList.addAll(connectionManager.getAutoIps())
                            autoIpsAdapter.notifyDataSetChanged()
                            Toast.makeText(requireContext(), "Loaded ${nodes.size} validator(s)", Toast.LENGTH_SHORT).show()
                        }
                        done = true
                        break
                    }
                }
            }
            withContext(Dispatchers.Main) {
                if (_binding == null) return@withContext
                binding.loadFromNodeButton.isEnabled = true
                binding.loadFromNodeButton.text = "Load validators from node"
                if (!done && isAdded) {
                    Toast.makeText(requireContext(), "No validators from node. Check connection.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun switchToAutoMode() {
        connectionManager.setConnectionMode(ConnectionManager.ConnectionMode.AUTO)
        binding.autoConnectSection.visibility = View.VISIBLE
        binding.manualConnectSection.visibility = View.GONE
        
        // Update all ApiClient instances
        updateApiClients()
        
        // Check connection status (с учетом auto-select)
        if (connectionManager.isAutoSelectEnabled()) {
            findAndSelectWorkingServer()
        } else {
            checkConnectionStatus()
        }
    }
    
    private fun switchToManualMode() {
        connectionManager.setConnectionMode(ConnectionManager.ConnectionMode.MANUAL)
        binding.autoConnectSection.visibility = View.GONE
        binding.manualConnectSection.visibility = View.VISIBLE
        binding.connectionStatusLayout.visibility = View.GONE
        
        // Update all ApiClient instances
        updateApiClients()
        
        // Check if already connected
        checkManualConnectionStatus()
    }
    
    private fun connectManual() {
        val ip = binding.manualIpEditText.text.toString().trim()
        
        if (ip.isEmpty()) {
            Toast.makeText(requireContext(), "Please enter IP address", Toast.LENGTH_SHORT).show()
            return
        }
        
        // Save connection settings
        connectionManager.setManualConnection(ip)
        
        // Show loading state
        binding.connectManualButton.visibility = View.GONE
        binding.disconnectManualButton.visibility = View.GONE
        binding.manualConnectionStatusLayout.visibility = View.VISIBLE
        binding.manualConnectionStatusIndicator.setBackgroundResource(R.drawable.connection_status_checking)
        binding.manualConnectionStatusText.text = "Connecting..."
        binding.manualConnectionStatusText.setTextColor(0xFF8E8E93.toInt())
        binding.manualConnectionProgressBar.visibility = View.VISIBLE
        
        // Update all ApiClient instances
        updateApiClients()
        
        // Check connection and update UI (viewLifecycleOwner — отмена при уходе с экрана)
        viewLifecycleOwner.lifecycleScope.launch {
            delay(500) // Small delay for visual feedback
            if (_binding == null) return@launch
            checkManualConnectionStatus()
        }
    }
    
    private fun disconnectManual() {
        // Clear manual connection
        binding.manualIpEditText.setText("")
        connectionManager.setManualConnection("")
        
        // Update UI
        binding.connectManualButton.visibility = View.VISIBLE
        binding.disconnectManualButton.visibility = View.GONE
        binding.manualConnectionStatusLayout.visibility = View.GONE
        
        // Update all ApiClient instances
        updateApiClients()
        
        Toast.makeText(requireContext(), "Disconnected", Toast.LENGTH_SHORT).show()
    }
    
    private fun checkManualConnectionStatus() {
        if (!::connectionManager.isInitialized) return
        
        val ip = binding.manualIpEditText.text.toString().trim()
        if (ip.isEmpty()) {
            binding.manualConnectionStatusLayout.visibility = View.GONE
            binding.connectManualButton.visibility = View.VISIBLE
            binding.disconnectManualButton.visibility = View.GONE
            return
        }
        
        val baseUrl = connectionManager.getCurrentBaseUrl()
        val statusLayout = binding.manualConnectionStatusLayout
        val statusIndicator = binding.manualConnectionStatusIndicator
        val statusText = binding.manualConnectionStatusText
        val progressBar = binding.manualConnectionProgressBar
        
        // Show status layout
        statusLayout.visibility = View.VISIBLE
        
        // Show checking state
        statusIndicator.setBackgroundResource(R.drawable.connection_status_checking)
        statusText.text = "Connecting..."
        statusText.setTextColor(0xFF8E8E93.toInt())
        progressBar.visibility = View.VISIBLE
        binding.connectManualButton.visibility = View.GONE
        binding.disconnectManualButton.visibility = View.GONE
        
        // Check connection in background (viewLifecycleOwner — отмена при уничтожении view, иначе NPE на binding)
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val apiClient = ApiClient(requireContext())
                val isConnected = withContext(Dispatchers.IO) {
                    apiClient.getHealth()
                }
                if (_binding == null) return@launch
                if (isConnected) {
                    statusIndicator.setBackgroundResource(R.drawable.connection_status_connected)
                    val serverUrl = baseUrl.replace("http://", "").replace("/", "")
                    statusText.text = "✓ Connected: $serverUrl"
                    statusText.setTextColor(0xFF4CAF50.toInt())
                    binding.connectManualButton.visibility = View.GONE
                    binding.disconnectManualButton.visibility = View.VISIBLE
                } else {
                    statusIndicator.setBackgroundResource(R.drawable.connection_status_disconnected)
                    val serverUrl = baseUrl.replace("http://", "").replace("/", "")
                    statusText.text = "✗ Connection failed: $serverUrl"
                    statusText.setTextColor(0xFFF44336.toInt())
                    binding.connectManualButton.visibility = View.VISIBLE
                    binding.disconnectManualButton.visibility = View.GONE
                }
                progressBar.visibility = View.GONE
            } catch (e: Exception) {
                if (_binding == null) return@launch
                statusIndicator.setBackgroundResource(R.drawable.connection_status_disconnected)
                statusText.text = "✗ Error: ${e.message?.take(30) ?: "Connection failed"}"
                statusText.setTextColor(0xFFF44336.toInt())
                binding.connectManualButton.visibility = View.VISIBLE
                binding.disconnectManualButton.visibility = View.GONE
                progressBar.visibility = View.GONE
            }
        }
    }
    
    private fun showAddAutoIpDialog() {
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_add_ip, null)
        
        val ipEditText = dialogView.findViewById<EditText>(R.id.ipEditText)
        val btnCancel = dialogView.findViewById<android.widget.Button>(R.id.btnCancel)
        val btnAdd = dialogView.findViewById<android.widget.Button>(R.id.btnAdd)
        
        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        
        // Убираем белый фон по углам (как в dialog_create_wallet)
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        
        btnCancel.setOnClickListener {
            dialog.dismiss()
        }
        
        btnAdd.setOnClickListener {
            val ip = ipEditText.text.toString().trim()
            
            if (ip.isEmpty()) {
                Toast.makeText(requireContext(), "Please enter IP address", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            
            val fullAddress = ip
            val currentIps = connectionManager.getAutoIps()
            if (currentIps.contains(fullAddress)) {
                Toast.makeText(requireContext(), "Server already exists", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            connectionManager.setAutoIps(currentIps + fullAddress)
            autoIpsList.clear()
            autoIpsList.addAll(connectionManager.getAutoIps())
            autoIpsAdapter.notifyDataSetChanged()
            
            dialog.dismiss()
            
            // Проверяем новый IP и если он рабочий - переключаемся на него (viewLifecycleOwner — отмена при уходе)
            viewLifecycleOwner.lifecycleScope.launch {
                val testBaseUrl = "http://$fullAddress/"
                val testClient = Api.serviceFor(testBaseUrl)
                
                try {
                    val isWorking = withContext(Dispatchers.IO) {
                        try {
                            val response = testClient.getStatus()
                            response.success
                        } catch (e: Exception) {
                            false
                        }
                    }
                    if (_binding == null) return@launch
                    if (isWorking) {
                        connectionManager.setSelectedAutoIp(fullAddress)
                        updateApiClients()
                        if (connectionManager.isAutoSelectEnabled()) {
                            findAndSelectWorkingServer()
                        } else {
                            checkConnectionStatus()
                        }
                        Toast.makeText(requireContext(), "Server added and connected: $fullAddress", Toast.LENGTH_SHORT).show()
                    } else {
                        if (connectionManager.isAutoSelectEnabled()) {
                            findAndSelectWorkingServer()
                        } else {
                            checkConnectionStatus()
                        }
                        Toast.makeText(requireContext(), "Server added: $fullAddress", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    if (_binding == null) return@launch
                    Toast.makeText(requireContext(), "Server added: $fullAddress", Toast.LENGTH_SHORT).show()
                    if (connectionManager.isAutoSelectEnabled()) {
                        findAndSelectWorkingServer()
                    } else {
                        checkConnectionStatus()
                    }
                }
            }
        }
        
        dialog.show()
        
        dialog.show()
    }
    
    private fun showEditAutoIpDialog(ip: String) {
        val nodeIndex = autoIpsList.indexOf(ip)
        if (nodeIndex <= 0) return

        val currentIp = ip
        
        val dialogView = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_add_ip, null)
        
        val ipEditText = dialogView.findViewById<EditText>(R.id.ipEditText)
        val btnCancel = dialogView.findViewById<android.widget.Button>(R.id.btnCancel)
        val btnAdd = dialogView.findViewById<android.widget.Button>(R.id.btnAdd)
        val btnDelete = dialogView.findViewById<android.widget.Button>(R.id.btnDelete)
        
        ipEditText.setText(currentIp)
        btnAdd.text = "Save"
        btnDelete.visibility = View.VISIBLE
        
        val dialog = AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        
        // Убираем белый фон по углам
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        
        btnCancel.setOnClickListener {
            dialog.dismiss()
        }
        
        btnAdd.setOnClickListener {
            val newIp = ipEditText.text.toString().trim()
            
            if (newIp.isEmpty()) {
                Toast.makeText(requireContext(), "Please enter IP address", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            
            val currentIps = connectionManager.getAutoIps()
            val index = currentIps.indexOf(ip)
            if (index >= 0) {
                val newAddress = newIp
                val updated = currentIps.toMutableList().apply { set(index, newAddress) }
                connectionManager.setAutoIps(updated)
                autoIpsList.clear()
                autoIpsList.addAll(connectionManager.getAutoIps())
                autoIpsAdapter.notifyDataSetChanged()
                
                // Если это был выбранный IP - обновляем выбор
                val currentSelected = connectionManager.getSelectedAutoIp()
                if (currentSelected == ip) {
                    connectionManager.setSelectedAutoIp(newAddress)
                }
                
                // Проверяем соединение с обновленным IP (viewLifecycleOwner — отмена при уходе)
                viewLifecycleOwner.lifecycleScope.launch {
                    val testBaseUrl = "http://$newAddress/"
                    val testClient = Api.serviceFor(testBaseUrl)
                    
                    try {
                        val isWorking = withContext(Dispatchers.IO) {
                            try {
                                val response = testClient.getStatus()
                                response.success
                            } catch (e: Exception) {
                                false
                            }
                        }
                        if (_binding == null) return@launch
                        if (isWorking && connectionManager.isAutoSelectEnabled()) {
                            connectionManager.setSelectedAutoIp(newAddress)
                            findAndSelectWorkingServer()
                        } else if (connectionManager.isAutoSelectEnabled()) {
                            findAndSelectWorkingServer()
                        } else {
                            checkConnectionStatus()
                        }
                    } catch (e: Exception) {
                        if (_binding == null) return@launch
                        if (connectionManager.isAutoSelectEnabled()) {
                            findAndSelectWorkingServer()
                        } else {
                            checkConnectionStatus()
                        }
                    }
                }
                
                updateApiClients()
                Toast.makeText(requireContext(), "Server updated: $newAddress", Toast.LENGTH_SHORT).show()
                dialog.dismiss()
            }
        }
        
        btnDelete.setOnClickListener {
            if (autoIpsList.indexOf(ip) <= 0) return@setOnClickListener
            AlertDialog.Builder(requireContext())
                .setTitle("Delete Server")
                .setMessage("Are you sure you want to delete this server?")
                .setPositiveButton("Delete") { _, _ ->
                    if (autoIpsList.indexOf(ip) <= 0) return@setPositiveButton
                    val wasSelected = connectionManager.getSelectedAutoIp() == ip
                    val updated = connectionManager.getAutoIps().filter { it != ip }
                    connectionManager.setAutoIps(updated)
                    autoIpsList.clear()
                    autoIpsList.addAll(connectionManager.getAutoIps())
                    autoIpsAdapter.notifyDataSetChanged()
                    if (wasSelected) {
                        if (connectionManager.isAutoSelectEnabled()) {
                            findAndSelectWorkingServer()
                        } else {
                            connectionManager.setSelectedAutoIp(connectionManager.getAutoIps().firstOrNull())
                            updateApiClients()
                            checkConnectionStatus()
                        }
                    }
                    
                    Toast.makeText(requireContext(), "Server removed", Toast.LENGTH_SHORT).show()
                    updateApiClients()
                    dialog.dismiss()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
        
        dialog.show()
    }

    private fun updateApiClients() {
        // Notify MainActivity to update all ApiClient instances
        (requireActivity() as? com.marsa.chain.MainActivity)?.updateApiClients()
    }
    
    private fun startConnectionCheck() {
        // Check connection status periodically (viewLifecycleOwner — отмена при уходе с экрана, иначе NPE на binding)
        connectionCheckJob?.cancel()
        connectionCheckJob = viewLifecycleOwner.lifecycleScope.launch {
            while (isActive && _binding != null) {
                if (binding.autoConnectSection.visibility == View.VISIBLE) {
                    if (connectionManager.isAutoSelectEnabled()) {
                        findAndSelectWorkingServer()
                    } else {
                        checkConnectionStatus()
                    }
                }
                delay(10000) // Check every 10 seconds (чтобы не перегружать)
            }
        }
    }
    
    private fun checkConnectionStatus() {
        if (!::connectionManager.isInitialized) return
        
        val statusLayout = binding.connectionStatusLayout
        val statusIndicator = binding.connectionStatusIndicator
        val statusText = binding.connectionStatusText
        val progressBar = binding.connectionProgressBar
        
        // Show status layout only in Auto Connect mode
        if (connectionManager.getConnectionMode() == ConnectionManager.ConnectionMode.AUTO) {
            statusLayout.visibility = View.VISIBLE
        } else {
            statusLayout.visibility = View.GONE
            return
        }
        
        // Если auto-select включен - ищем рабочий сервер
        if (connectionManager.isAutoSelectEnabled()) {
            findAndSelectWorkingServer()
            return
        }
        
        // Иначе проверяем текущий выбранный IP
        val baseUrl = connectionManager.getCurrentBaseUrl()
        
        // Show checking state
        statusIndicator.setBackgroundResource(R.drawable.connection_status_checking)
        statusText.text = "Checking connection..."
        statusText.setTextColor(0xFF8E8E93.toInt())
        progressBar.visibility = View.VISIBLE
        
        // Check connection in background (viewLifecycleOwner — отмена при уходе с экрана)
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val apiClient = ApiClient(requireContext())
                val isConnected = withContext(Dispatchers.IO) {
                    apiClient.getHealth()
                }
                if (_binding == null) return@launch
                if (isConnected) {
                    statusIndicator.setBackgroundResource(R.drawable.connection_status_connected)
                    statusText.text = "✓ Connected"
                    statusText.setTextColor(0xFF4CAF50.toInt())
                } else {
                    statusIndicator.setBackgroundResource(R.drawable.connection_status_disconnected)
                    statusText.text = "✗ Connection failed"
                    statusText.setTextColor(0xFFF44336.toInt())
                }
                autoIpsAdapter.notifyDataSetChanged()
                progressBar.visibility = View.GONE
            } catch (e: Exception) {
                if (_binding == null) return@launch
                statusIndicator.setBackgroundResource(R.drawable.connection_status_disconnected)
                statusText.text = "✗ Error: ${e.message?.take(25) ?: "Connection failed"}"
                statusText.setTextColor(0xFFF44336.toInt())
                autoIpsAdapter.notifyDataSetChanged()
                progressBar.visibility = View.GONE
            }
        }
    }
    
    private fun findAndSelectWorkingServer() {
        val statusLayout = binding.connectionStatusLayout
        val statusIndicator = binding.connectionStatusIndicator
        val statusText = binding.connectionStatusText
        val progressBar = binding.connectionProgressBar
        
        statusLayout.visibility = View.VISIBLE
        statusIndicator.setBackgroundResource(R.drawable.connection_status_checking)
        statusText.text = "Searching for working server..."
        statusText.setTextColor(0xFF8E8E93.toInt())
        progressBar.visibility = View.VISIBLE
        
        viewLifecycleOwner.lifecycleScope.launch {
            var workingServer: String? = null
            
            for (ip in autoIpsList) {
                try {
                    val testBaseUrl = "http://$ip/"
                    val testClient = com.marsa.chain.network.Api.serviceFor(testBaseUrl)
                    
                    val isWorking = withContext(Dispatchers.IO) {
                        try {
                            val response = testClient.getStatus()
                            response.success
                        } catch (e: Exception) {
                            false
                        }
                    }
                    
                    if (isWorking) {
                        workingServer = ip
                        break
                    }
                } catch (e: Exception) {
                    // Продолжаем проверку следующего IP
                }
            }
            
            if (_binding == null) return@launch
            if (workingServer != null) {
                connectionManager.setSelectedAutoIp(workingServer)
                updateApiClients()
                statusIndicator.setBackgroundResource(R.drawable.connection_status_connected)
                statusText.text = "✓ Connected"
                statusText.setTextColor(0xFF4CAF50.toInt())
                autoIpsAdapter.notifyDataSetChanged()
            } else {
                val currentIp = connectionManager.getAutoIps().firstOrNull() ?: "none"
                connectionManager.setSelectedAutoIp(currentIp)
                updateApiClients()
                statusIndicator.setBackgroundResource(R.drawable.connection_status_disconnected)
                statusText.text = "✗ No working servers found"
                statusText.setTextColor(0xFFF44336.toInt())
                autoIpsAdapter.notifyDataSetChanged()
            }
            progressBar.visibility = View.GONE
        }
    }
    
    private class AutoIpsAdapter(
        private val ips: List<String>,
        private val connectionManager: ConnectionManager,
        private val onItemClick: (String) -> Unit
    ) : RecyclerView.Adapter<AutoIpsAdapter.ViewHolder>() {
        
        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val textView: android.widget.TextView = view.findViewById(R.id.ipTextView)
            val connectedIndicator: android.widget.ImageView = view.findViewById(R.id.connectedIndicator)
        }
        
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_auto_ip, parent, false)
            return ViewHolder(view)
        }
        
        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val ip = ips[position]
            holder.textView.text = holder.itemView.context.getString(
                R.string.connection_node_name,
                position + 1
            )
            
            val currentBaseUrl = connectionManager.getCurrentBaseUrl()
            val currentIp = currentBaseUrl.replace("http://", "").replace("/", "")
            val isConnected = ip == currentIp
            
            if (isConnected) {
                holder.textView.setTextColor(0xFF4CAF50.toInt())
                holder.connectedIndicator.visibility = View.VISIBLE
                holder.connectedIndicator.setColorFilter(0xFF4CAF50.toInt(), android.graphics.PorterDuff.Mode.SRC_IN)
            } else {
                holder.textView.setTextColor(0xFFFFFFFF.toInt())
                holder.connectedIndicator.visibility = View.GONE
            }
            
            holder.itemView.setOnClickListener { onItemClick(ip) }
        }
        
        override fun getItemCount() = ips.size
    }
}

