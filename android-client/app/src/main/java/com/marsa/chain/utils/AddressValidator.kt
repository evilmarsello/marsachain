package com.marsa.chain.utils

object AddressValidator {
    
    /**
     * Validates if the address is in correct format
     * Our addresses should start with "mrs" and be 42 characters long
     */
    fun isValidAddress(address: String): Boolean {
        if (address.isBlank()) return false
        
        // Remove any whitespace
        val cleanAddress = address.trim()
        
        // Check if address starts with "mrs" (our format)
        if (!cleanAddress.startsWith("mrs")) return false
        
        // Check length (should be 43 characters for our format: mrs + 40 hex chars)
        if (cleanAddress.length != 43) return false
        
        // Check if it contains only valid characters (alphanumeric)
        if (!cleanAddress.matches(Regex("^[a-zA-Z0-9]+$"))) return false
        
        return true
    }
    
    /**
     * Validates if the address is not the same as sender
     */
    fun isNotSelfAddress(address: String, senderAddress: String): Boolean {
        return address.trim() != senderAddress.trim()
    }
    
    /**
     * Checks if the address belongs to user's own wallets
     */
    fun isOwnWallet(address: String, userWallets: List<String>): Boolean {
        val cleanAddress = address.trim()
        return userWallets.contains(cleanAddress)
    }
    
    /**
     * Gets a user-friendly error message for invalid address
     */
    fun getAddressErrorMessage(address: String): String {
        if (address.isBlank()) {
            return "Please enter a wallet address"
        }
        
        val cleanAddress = address.trim()
        
        if (!cleanAddress.startsWith("mrs")) {
            return "Address must start with 'mrs'"
        }
        
        if (cleanAddress.length != 43) {
            return "Address must be 43 characters long"
        }
        
        if (!cleanAddress.matches(Regex("^[a-zA-Z0-9]+$"))) {
            return "Address contains invalid characters"
        }
        
        return "Invalid address format"
    }
}
