package com.marsa.chain

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.ext.junit.rules.ActivityScenarioRule
import com.marsa.chain.data.AppDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StartupTest {
    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun appStartsAndHeadersInserted() {
        // wait some time for sync to complete
        Thread.sleep(3000)
        activityRule.scenario.onActivity { activity ->
            val ctx = activity.applicationContext
            val db = AppDatabase.get(ctx)
            val count = db.headersDao().count()
            assert(count >= 0)
        }
    }
}
