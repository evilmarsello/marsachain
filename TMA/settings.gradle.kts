pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    // Kotlin/JS добавляет репозиторий Node.js — FAIL_ON_PROJECT_REPOS ломает webpack/npm задачи
    repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "marsa-tma"
include(":shared")
