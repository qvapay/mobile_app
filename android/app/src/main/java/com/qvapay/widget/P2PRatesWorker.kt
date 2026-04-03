package com.qvapay.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class P2PRatesWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        return withContext(Dispatchers.IO) {
            try {
                val pairs = QvaPayApiClient.fetchP2PAverages()
                if (pairs.isEmpty()) return@withContext Result.retry()

                val appWidgetManager = AppWidgetManager.getInstance(context)
                val widgetComponent = ComponentName(context, P2PRatesWidget::class.java)
                val widgetIds = appWidgetManager.getAppWidgetIds(widgetComponent)

                for (widgetId in widgetIds) {
                    P2PRatesWidget.updateWidget(context, appWidgetManager, widgetId, pairs)
                }

                Result.success()
            } catch (e: Exception) {
                Result.retry()
            }
        }
    }
}
