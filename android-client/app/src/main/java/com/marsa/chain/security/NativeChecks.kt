package com.marsa.chain.security

import android.os.Debug
import java.io.File
import java.io.FileInputStream

/**
 * Раньше вызывался JNI-модуль с неверными именами символов; логика перенесена в Kotlin,
 * чтобы не тянуть NDK и не ломать :app:packageDebug на машинах без корректной multi-ABI сборки.
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
