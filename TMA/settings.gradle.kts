pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    // Kotlin/JS adds Node.js repo — FAIL_ON_PROJECT_REPOS breaks webpack/npm tasks
    repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "marsa-tma"
include(":shared")
