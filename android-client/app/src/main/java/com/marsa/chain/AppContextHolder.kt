package com.marsa.chain

import android.app.Application
import android.content.Context

class AppContextHolder : Application() {
    override fun onCreate() {
        super.onCreate()
        appContext = applicationContext
    }
    companion object {
        var appContext: Context? = null
            private set
    }
}
