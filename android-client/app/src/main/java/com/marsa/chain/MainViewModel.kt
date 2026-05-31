package com.marsa.chain

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import com.marsa.chain.data.AppDatabase
import com.marsa.chain.data.HeaderEntity
import com.marsa.chain.network.Api
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MainViewModel : ViewModel() {
    private val _balance = MutableLiveData<Long>(0)
    val balance: LiveData<Long> = _balance

    fun updateBalance(newBalance: Long) {
        _balance.postValue(newBalance)
    }

    suspend fun syncLatestHeaders() {
        // naive: from last stored height-100
        withContext(Dispatchers.IO) {
            val ctx = AppContextHolder.appContext ?: return@withContext
            val db = AppDatabase.get(ctx)
            val last = db.headersDao().getMaxHeight() ?: 0
            val from = if (last > 100) last - 100 else 0
            val headers = Api.service.getHeaders(from)
            val entities = headers.mapIndexed { idx, h ->
                // map JSON to entity; assume order from->tip
                HeaderEntity(
                    height = from + idx,
                    version = h.version,
                    prev_hash = h.prev_hash,
                    merkle_root = h.merkle_root,
                    timestamp = h.timestamp,
                    bits = h.bits,
                    nonce = h.nonce
                )
            }
            db.headersDao().insertAll(entities)
        }
    }
}
