package com.marsa.chain

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.marsa.chain.keystore.KeyStoreManager
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

@RunWith(AndroidJUnit4::class)
class KeystoreInstrumentedTest {
    @Test
    fun generateSignVerify() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val ksm = KeyStoreManager(context)
        val alias = "spv_test_key"

        // Generate (idempotent for alias)
        try { ksm.generateKey(alias) } catch (_: Exception) {}

        val data = "hello keystore".toByteArray()
        val signature = ksm.sign(alias, data)

        val pubKeyBytes = ksm.getPublicKey(alias)
        val kf = KeyFactory.getInstance("EC")
        val pubKey = kf.generatePublic(X509EncodedKeySpec(pubKeyBytes))

        val verifier = Signature.getInstance("SHA256withECDSA")
        verifier.initVerify(pubKey)
        verifier.update(data)
        val verified = verifier.verify(signature)

        assertTrue("Signature must verify", verified)
    }
}
