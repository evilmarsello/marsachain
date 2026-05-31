package com.marsa.chain.security

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

class SecurityManager(private val context: Context) {
    private val native = NativeChecks()

    fun isEmulator(): Boolean {
        val b = Build.BOARD + Build.BRAND + Build.DEVICE + Build.HARDWARE + Build.MODEL + Build.MANUFACTURER
        val emulatorHints = listOf("goldfish", "ranchu", "sdk", "emulator", "genymotion")
        return emulatorHints.any { b.contains(it, ignoreCase = true) }
    }

    fun isRooted(): Boolean {
        val paths = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/su/bin/su")
        return paths.any { java.io.File(it).exists() }
    }

    fun isDebuggerPresent(): Boolean = native.isDebuggerPresent()

    fun apkSignatureValid(): Boolean {
        // Placeholder: in prod compare against expected signing cert digest
        return try {
            val pm = context.packageManager
            val pkg = context.packageName
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES)
                info.signingInfo != null
            } else {
                @Suppress("DEPRECATION")
                val info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES)
                @Suppress("DEPRECATION")
                val sigs = info.signatures
                sigs != null && sigs.isNotEmpty()
            }
        } catch (_: Exception) { false }
    }

    fun apkChecksum(): Int {
        val apk = context.packageCodePath
        return native.apkChecksum(apk)
    }

    fun deviceAttestation(): Boolean {
        // Placeholder for Play Integrity / SafetyNet
        return true
    }

    fun isLimitedMode(): Boolean {
        // If emulator or rooted, restrict functionality
        // TEMPORARILY DISABLED FOR DEVELOPMENT
        return false
        // return isEmulator() || isRooted() || isDebuggerPresent() || !apkSignatureValid()
    }
}
