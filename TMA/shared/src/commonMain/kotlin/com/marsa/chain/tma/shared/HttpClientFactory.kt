package com.marsa.chain.tma.shared

import io.ktor.client.HttpClient

expect fun createFullnodeHttpClient(): HttpClient
