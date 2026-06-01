package com.marsa.chain.security

import android.os.Debug
import java.io.File
import java.io.FileInputStream

/**
 * Previously called a JNI module with wrong symbol names; logic moved to Kotlin
 * to avoid NDK and broken :app:packageDebug on machines without proper multi-ABI builds.
 */
class NativeChecks {

    fun isDebuggerPresent(): Boolean = Debug.isDebuggerConnected()

    fun apkChecksum(apkPath: String): Int {
        var sum = 0u
        val buf = ByteArray(4096)
        FileInputStream(File(apkPath)).use { fis ->
            while (true) {
                val r = fis.read(buf)
                if (r <= 0) break
                for (i in 0 until r) {
                    val b = buf[i].toUByte().toUInt()
                    sum = (sum * 1315423911u) xor b
                }
            }
        }
        return sum.toInt()
    }
}
