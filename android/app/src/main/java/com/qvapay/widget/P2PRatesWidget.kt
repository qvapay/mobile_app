package com.qvapay.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import androidx.work.*
import com.qvapay.R
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

class P2PRatesWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // Schedule periodic updates
        schedulePeriodicUpdate(context)

        // Trigger immediate update
        for (appWidgetId in appWidgetIds) {
            val workRequest = OneTimeWorkRequestBuilder<P2PRatesWorker>()
                .setInputData(workDataOf("widgetId" to appWidgetId))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(context).enqueue(workRequest)
        }
    }

    override fun onEnabled(context: Context) {
        schedulePeriodicUpdate(context)
    }

    override fun onDisabled(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME)
    }

    companion object {
        private const val PERIODIC_WORK_NAME = "p2p_rates_widget_update"
        private const val PREFS_NAME = "p2p_rates_widget_data"

        fun schedulePeriodicUpdate(context: Context) {
            val workRequest = PeriodicWorkRequestBuilder<P2PRatesWorker>(
                15, TimeUnit.MINUTES
            )
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
        }

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, pairs: List<CoinPairData>) {
            val views = RemoteViews(context.packageName, R.layout.widget_p2p_rates)

            // Set up click intent to open app
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (intent != null) {
                intent.data = android.net.Uri.parse("qvapay://invest")
                val pendingIntent = PendingIntent.getActivity(
                    context, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_container, pendingIntent)
            }

            // Update timestamp
            val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
            views.setTextViewText(R.id.widget_timestamp, timeFormat.format(Date()))

            // Row IDs for up to 6 rows
            val rowIds = listOf(
                Triple(R.id.row_0_name, R.id.row_0_buy, R.id.row_0_sell),
                Triple(R.id.row_1_name, R.id.row_1_buy, R.id.row_1_sell),
                Triple(R.id.row_2_name, R.id.row_2_buy, R.id.row_2_sell),
                Triple(R.id.row_3_name, R.id.row_3_buy, R.id.row_3_sell),
                Triple(R.id.row_4_name, R.id.row_4_buy, R.id.row_4_sell),
                Triple(R.id.row_5_name, R.id.row_5_buy, R.id.row_5_sell),
            )
            val rowContainerIds = listOf(
                R.id.row_0, R.id.row_1, R.id.row_2,
                R.id.row_3, R.id.row_4, R.id.row_5
            )

            for (i in rowIds.indices) {
                if (i < pairs.size) {
                    val pair = pairs[i]
                    views.setViewVisibility(rowContainerIds[i], View.VISIBLE)
                    views.setTextViewText(rowIds[i].first, QvaPayApiClient.getDisplayName(pair.tick))
                    views.setTextViewText(rowIds[i].second, if (pair.buy == 0.0) "—" else String.format("%.0f", pair.buy))
                    views.setTextViewText(rowIds[i].third, if (pair.sell == 0.0) "—" else String.format("%.0f", pair.sell))
                } else {
                    views.setViewVisibility(rowContainerIds[i], View.GONE)
                }
            }

            // Cache data
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putLong("last_updated", System.currentTimeMillis()).apply()

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
