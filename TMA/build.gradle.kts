import org.jetbrains.kotlin.gradle.targets.js.yarn.YarnPlugin
import org.jetbrains.kotlin.gradle.targets.js.yarn.YarnRootExtension

plugins {
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.android.library) apply false
}

// Pin patched npm versions for Kotlin/JS webpack toolchain (Dependabot / CVE fixes).
rootProject.plugins.withType<YarnPlugin> {
    rootProject.the<YarnRootExtension>().apply {
        resolution("webpack", "5.107.2")
        resolution("webpack-dev-server", "5.2.4")
        resolution("serialize-javascript", "7.0.5")
        resolution("tmp", "0.2.7")
        resolution("uuid", "11.1.0")
        resolution("ws", "8.21.0")
    }
}
