package com.qvapay.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.qvapay.R
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/**
 * Widget de balance: saldo de la cuenta + accesos directos, en tres tamaños
 * (2x2, 4x2 y 4x4) y con tema claro/oscuro por `values-night`.
 *
 * Los datos los publica `helpers/widgetBridge.ts` en las SharedPreferences
 * `qvapay_widget_data`: la clave `balance` siempre, y `savings` solo cuando el
 * Home ha recibido el resumen de ahorro — sin ella el tamaño grande esconde su
 * bloque en vez de pintar un $0.00 falso.
 */
class BalanceWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        updateAllWidgets(context, appWidgetManager, appWidgetIds)
    }

    /**
     * Sin esto, en API < 31 redimensionar el widget NO cambia de layout: el
     * mapa de tamaños de RemoteViews solo existe desde Android 12, así que por
     * debajo hay que repintar a mano cuando cambian las opciones.
     */
    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle
    ) {
        updateWidget(context, appWidgetManager, appWidgetId, readSnapshot(context))
    }

    companion object {
        private const val PREFS_NAME = "qvapay_widget_data"

        /** Umbrales en dp que separan un tamaño del siguiente. */
        private const val WIDE_DP = 250
        private const val TALL_DP = 250

        /** Lo que el widget necesita pintar, ya normalizado. */
        private data class Snapshot(
            val balance: Double,
            val savings: Double?,
            val rate: Double
        )

        fun updateAllWidgets(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetIds: IntArray
        ) {
            val snapshot = readSnapshot(context)
            for (appWidgetId in appWidgetIds) {
                updateWidget(context, appWidgetManager, appWidgetId, snapshot)
            }
        }

        private fun readSnapshot(context: Context): Snapshot {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            val balance = readJson(prefs.getString("balance", null))?.optDouble("balance", 0.0) ?: 0.0
            val savingsJson = readJson(prefs.getString("savings", null))

            return Snapshot(
                balance = balance,
                savings = savingsJson?.optDouble("balance", 0.0),
                rate = savingsJson?.optDouble("rate", 0.0) ?: 0.0
            )
        }

        private fun readJson(raw: String?): JSONObject? {
            if (raw.isNullOrEmpty()) return null
            return try { JSONObject(raw) } catch (e: Exception) { null }
        }

        /** Separador de miles y dos decimales, como `QPBalance` en la app. */
        private fun money(value: Double): String {
            val formatter = NumberFormat.getNumberInstance(Locale.getDefault()).apply {
                minimumFractionDigits = 2
                maximumFractionDigits = 2
            }
            return formatter.format(value)
        }

        /** La tasa se enseña sin decimales cuando es entera (3.75% pero 4%). */
        private fun rate(value: Double): String =
            if (value == Math.floor(value)) String.format(Locale.getDefault(), "%.0f", value)
            else String.format(Locale.getDefault(), "%.2f", value)

        private fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
            snapshot: Snapshot
        ) {
            val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+ deja embarcar un layout por tamaño y el launcher
                // elige sin volver a despertar al proveedor
                RemoteViews(
                    mapOf(
                        SizeF(140f, 140f) to build(context, R.layout.widget_balance_small, snapshot),
                        SizeF(WIDE_DP.toFloat(), 140f) to build(context, R.layout.widget_balance, snapshot),
                        SizeF(WIDE_DP.toFloat(), TALL_DP.toFloat()) to build(context, R.layout.widget_balance_large, snapshot)
                    )
                )
            } else {
                build(context, layoutFor(appWidgetManager, appWidgetId), snapshot)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        /** Elección de layout por las dimensiones reportadas (solo API < 31). */
        private fun layoutFor(appWidgetManager: AppWidgetManager, appWidgetId: Int): Int {
            val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
            val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, WIDE_DP)
            val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 140)

            return when {
                minWidth >= WIDE_DP && minHeight >= TALL_DP -> R.layout.widget_balance_large
                minWidth >= WIDE_DP -> R.layout.widget_balance
                else -> R.layout.widget_balance_small
            }
        }

        /** Rubik desde assets/. Cachea: el provider repinta en cada update. */
        private val typefaces = HashMap<String, Typeface>()

        private fun typeface(context: Context, asset: String): Typeface? =
            try {
                typefaces.getOrPut(asset) { Typeface.createFromAsset(context.assets, asset) }
            } catch (e: Exception) {
                null // sin la fuente el bitmap sale en la del sistema, no se rompe nada
            }

        /**
         * Pinta texto en BLANCO sobre transparente. El color real lo aplica el
         * `android:tint` del ImageView, que se resuelve al inflar en el launcher
         * y por tanto sigue a values-night sin que haya que repintar el bitmap.
         */
        private fun textBitmap(context: Context, text: String, asset: String, sizeSp: Float): Bitmap {
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                typeface(context, asset)?.let { typeface = it }
                textSize = TypedValue.applyDimension(
                    TypedValue.COMPLEX_UNIT_SP, sizeSp, context.resources.displayMetrics
                )
                color = Color.WHITE
            }
            val metrics = paint.fontMetrics
            val width = Math.ceil(paint.measureText(text).toDouble()).toInt().coerceAtLeast(1)
            val height = Math.ceil((metrics.bottom - metrics.top).toDouble()).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            Canvas(bitmap).drawText(text, 0f, -metrics.top, paint)
            return bitmap
        }

        private const val RUBIK_BLACK = "fonts/Rubik-Black.ttf"
        private const val RUBIK_SEMIBOLD = "fonts/Rubik-SemiBold.ttf"

        /** Cifras por tamano; el simbolo va a la mitad, como en QPBalance. */
        private fun digitSize(layoutId: Int): Float = when (layoutId) {
            R.layout.widget_balance_small -> 24f
            R.layout.widget_balance_large -> 40f
            else -> 34f
        }

        private fun build(context: Context, layoutId: Int, snapshot: Snapshot): RemoteViews {
            val views = RemoteViews(context.packageName, layoutId)

            val digits = digitSize(layoutId)
            views.setImageViewBitmap(R.id.hero_symbol, textBitmap(context, "$", RUBIK_SEMIBOLD, digits / 2f))
            views.setImageViewBitmap(R.id.balance_amount, textBitmap(context, money(snapshot.balance), RUBIK_BLACK, digits))

            // Toque en el fondo: el dashboard. Los tiles de abajo lo pisan.
            views.setOnClickPendingIntent(R.id.widget_balance_container, link(context, "qvapay://home", 0))
            views.setOnClickPendingIntent(R.id.btn_deposit, link(context, "qvapay://add", 1))
            views.setOnClickPendingIntent(R.id.btn_send, link(context, "qvapay://send", 3))

            // Extraer y Comerciar solo existen a partir del tamaño mediano
            if (layoutId != R.layout.widget_balance_small) {
                views.setOnClickPendingIntent(R.id.btn_withdraw, link(context, "qvapay://withdraw", 2))
                views.setOnClickPendingIntent(R.id.btn_trade, link(context, "qvapay://p2p", 4))
            }

            if (layoutId == R.layout.widget_balance_large) {
                val savings = snapshot.savings
                if (savings == null) {
                    views.setViewVisibility(R.id.savings_block, View.GONE)
                } else {
                    views.setViewVisibility(R.id.savings_block, View.VISIBLE)
                    views.setTextViewText(R.id.savings_amount, "$" + money(savings))
                    views.setTextViewText(
                        R.id.savings_rate,
                        context.getString(R.string.widget_rate_suffix, rate(snapshot.rate))
                    )
                    val savingsIntent = link(context, "qvapay://savings", 5)
                    views.setOnClickPendingIntent(R.id.btn_savings_deposit, savingsIntent)
                    views.setOnClickPendingIntent(R.id.btn_savings_withdraw, savingsIntent)
                }
            }

            return views
        }

        /**
         * Estas rutas tienen que existir en `linking.ts`; si no, la app abre y
         * se queda en el Home sin navegar (era el bug de la primera version).
         */
        private fun link(context: Context, url: String, requestCode: Int): PendingIntent {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                setPackage(context.packageName)
            }
            return PendingIntent.getActivity(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }
}
