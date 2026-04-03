package com.qvapay.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.qvapay.R
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

class BalanceWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        updateAllWidgets(context, appWidgetManager, appWidgetIds)
    }

    companion object {
        private const val PREFS_NAME = "qvapay_widget_data"

        fun updateAllWidgets(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetIds: IntArray
        ) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val balanceJson = prefs.getString("balance", null)

            var balance = 0.0
            var username = ""

            if (balanceJson != null) {
                try {
                    val json = JSONObject(balanceJson)
                    balance = json.optDouble("balance", 0.0)
                    username = json.optString("username", "")
                } catch (e: Exception) { /* use defaults */ }
            }

            for (appWidgetId in appWidgetIds) {
                updateWidget(context, appWidgetManager, appWidgetId, balance, username)
            }
        }

        private fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
            balance: Double,
            username: String
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_balance)

            // Balance text
            views.setTextViewText(R.id.balance_amount, String.format("$%.2f", balance))

            // Username
            if (username.isNotEmpty()) {
                views.setTextViewText(R.id.balance_username, "@$username")
            }

            // Timestamp
            val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
            views.setTextViewText(R.id.balance_timestamp, timeFormat.format(Date()))

            // Deposit button -> deep link
            val depositIntent = Intent(Intent.ACTION_VIEW, Uri.parse("qvapay://add"))
            val depositPending = PendingIntent.getActivity(
                context, 1, depositIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_deposit, depositPending)

            // Withdraw button -> deep link
            val withdrawIntent = Intent(Intent.ACTION_VIEW, Uri.parse("qvapay://withdraw"))
            val withdrawPending = PendingIntent.getActivity(
                context, 2, withdrawIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_withdraw, withdrawPending)

            // Tap on widget body -> open app
            val openAppIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (openAppIntent != null) {
                val openPending = PendingIntent.getActivity(
                    context, 0, openAppIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_balance_container, openPending)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
