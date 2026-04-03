package com.qvapay.bridge

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.*
import com.qvapay.widget.BalanceWidget
import com.qvapay.widget.P2POffersWidget

class SharedStorageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val PREFS_NAME = "qvapay_widget_data"
    }

    override fun getName(): String = "SharedStorage"

    @ReactMethod
    fun setWidgetData(key: String, value: String, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(key, value).apply()

            // Trigger widget updates
            val appWidgetManager = AppWidgetManager.getInstance(reactApplicationContext)

            // Update balance widgets
            if (key == "balance") {
                val balanceComponent = ComponentName(reactApplicationContext, BalanceWidget::class.java)
                val balanceIds = appWidgetManager.getAppWidgetIds(balanceComponent)
                if (balanceIds.isNotEmpty()) {
                    BalanceWidget.updateAllWidgets(reactApplicationContext, appWidgetManager, balanceIds)
                }
            }

            // Update P2P offers widgets
            if (key == "p2p_offers") {
                val offersComponent = ComponentName(reactApplicationContext, P2POffersWidget::class.java)
                val offersIds = appWidgetManager.getAppWidgetIds(offersComponent)
                if (offersIds.isNotEmpty()) {
                    P2POffersWidget.updateAllWidgets(reactApplicationContext, appWidgetManager, offersIds)
                }
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getWidgetData(key: String, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val value = prefs.getString(key, null)
            promise.resolve(value)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
