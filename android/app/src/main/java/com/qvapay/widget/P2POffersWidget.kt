package com.qvapay.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import com.qvapay.R
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

class P2POffersWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        updateAllWidgets(context, appWidgetManager, appWidgetIds)
    }

    companion object {
        private const val PREFS_NAME = "qvapay_widget_data"

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

        fun updateAllWidgets(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetIds: IntArray
        ) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val offersJson = prefs.getString("p2p_offers", null)

            var count = 0
            var offers = listOf<Map<String, Any>>()

            if (offersJson != null) {
                try {
                    val json = JSONObject(offersJson)
                    count = json.optInt("count", 0)
                    val arr = json.optJSONArray("offers")
                    if (arr != null) {
                        offers = (0 until arr.length()).map { i ->
                            val o = arr.getJSONObject(i)
                            mapOf(
                                "uuid" to (o.optString("uuid", "")),
                                "type" to (o.optString("type", "")),
                                "coin" to (o.optString("coin", "")),
                                "amount" to (o.optDouble("amount", 0.0)),
                                "status" to (o.optString("status", ""))
                            )
                        }
                    }
                } catch (e: Exception) { /* use defaults */ }
            }

            for (appWidgetId in appWidgetIds) {
                updateWidget(context, appWidgetManager, appWidgetId, count, offers)
            }
        }

        private fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
            count: Int,
            offers: List<Map<String, Any>>
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_p2p_offers)

            // Header count
            views.setTextViewText(R.id.offers_count, if (count > 0) "$count" else "0")

            // Timestamp
            val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
            views.setTextViewText(R.id.offers_timestamp, timeFormat.format(Date()))

            // Open P2P screen on tap
            val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse("qvapay://p2p"))
            val openPending = PendingIntent.getActivity(
                context, 10, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_offers_container, openPending)

            // Row IDs
            val rowIds = listOf(
                Triple(R.id.offer_0_type, R.id.offer_0_coin, R.id.offer_0_amount),
                Triple(R.id.offer_1_type, R.id.offer_1_coin, R.id.offer_1_amount),
                Triple(R.id.offer_2_type, R.id.offer_2_coin, R.id.offer_2_amount),
                Triple(R.id.offer_3_type, R.id.offer_3_coin, R.id.offer_3_amount),
            )
            val rowContainerIds = listOf(
                R.id.offer_row_0, R.id.offer_row_1, R.id.offer_row_2, R.id.offer_row_3
            )

            // Empty state
            views.setViewVisibility(R.id.offers_empty, if (offers.isEmpty()) View.VISIBLE else View.GONE)

            for (i in rowIds.indices) {
                if (i < offers.size) {
                    val offer = offers[i]
                    val coin = offer["coin"] as? String ?: ""
                    val type = offer["type"] as? String ?: ""
                    val amount = offer["amount"] as? Double ?: 0.0
                    val uuid = offer["uuid"] as? String ?: ""

                    views.setViewVisibility(rowContainerIds[i], View.VISIBLE)
                    views.setTextViewText(rowIds[i].first, if (type == "buy") "C" else "V")
                    views.setTextViewText(rowIds[i].second, DISPLAY_NAMES[coin] ?: coin)
                    views.setTextViewText(rowIds[i].third, String.format("$%.2f", amount))

                    // Deep link to specific offer
                    val offerIntent = Intent(Intent.ACTION_VIEW, Uri.parse("qvapay://p2p/$uuid"))
                    val offerPending = PendingIntent.getActivity(
                        context, 100 + i, offerIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    views.setOnClickPendingIntent(rowContainerIds[i], offerPending)
                } else {
                    views.setViewVisibility(rowContainerIds[i], View.GONE)
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
