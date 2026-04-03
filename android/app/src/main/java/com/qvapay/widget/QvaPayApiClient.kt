package com.qvapay.widget

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

data class CoinPairData(
    val tick: String,
    val name: String,
    val buy: Double,
    val sell: Double,
    val count: Int
)

object QvaPayApiClient {
    private const val BASE_URL = "https://api.qvapay.com"

    private val ORDERED_TICKS = listOf(
        "BANK_CUP", "BANK_MLC", "CLASICA", "BANDECPREPAGO",
        "ETECSA", "TROPIPAY", "ZELLE", "BOLSATM"
    )

    private val DISPLAY_NAMES = mapOf(
        "BANK_CUP" to "CUP",
        "BANK_MLC" to "MLC",
        "CLASICA" to "Clásica",
        "BANDECPREPAGO" to "Bandec",
        "ETECSA" to "ETECSA",
        "TROPIPAY" to "TropiPay",
        "ZELLE" to "Zelle",
        "BOLSATM" to "BolsaTM"
    )

    fun fetchP2PAverages(): List<CoinPairData> {
        return try {
            val url = URL("$BASE_URL/p2p/averages")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.setRequestProperty("X-QvaPay-Client", "QvaPay-Android-Widget")
            connection.setRequestProperty("Accept", "application/json")

            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val reader = BufferedReader(InputStreamReader(connection.inputStream))
                val response = reader.readText()
                reader.close()
                parseAverages(JSONObject(response))
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun parseAverages(json: JSONObject): List<CoinPairData> {
        return ORDERED_TICKS.mapNotNull { tick ->
            if (json.has(tick)) {
                val coinData = json.getJSONObject(tick)
                CoinPairData(
                    tick = tick,
                    name = coinData.optString("name", DISPLAY_NAMES[tick] ?: tick),
                    buy = coinData.optDouble("average_buy", 0.0),
                    sell = coinData.optDouble("average_sell", 0.0),
                    count = coinData.optInt("count", 0)
                )
            } else null
        }
    }

    fun getDisplayName(tick: String): String = DISPLAY_NAMES[tick] ?: tick
}
