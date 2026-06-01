import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.android.library)
}

android {
    namespace = "com.marsa.chain.tma.shared"
    compileSdk = 35
    defaultConfig {
        minSdk = 26
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }
    js(IR) {
        browser()
        binaries.executable()
        compilerOptions {
            target.set("es2015")
        }
    }

    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain.dependencies {
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.kotlinx.json)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.coroutines.core)
        }
        androidMain.dependencies {
            implementation(libs.ktor.client.okhttp)
        }
        jsMain.dependencies {
            implementation(libs.ktor.client.js)
        }
    }
}

val syncKotlinJsToWebapp by tasks.registering(Sync::class) {
    group = "build"
    description = "Copies shared JS bundle to webapp/public for Vite"
    dependsOn("jsBrowserProductionWebpack")
    from(layout.buildDirectory.dir("kotlin-webpack/js/productionExecutable"))
    into(rootProject.layout.projectDirectory.dir("webapp/public/kotlin"))
    include("*.js", "*.js.map")
}

tasks.named("jsBrowserProductionWebpack").configure {
    finalizedBy(syncKotlinJsToWebapp)
}
