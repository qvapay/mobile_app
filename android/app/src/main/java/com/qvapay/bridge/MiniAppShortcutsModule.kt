package com.qvapay.bridge

import android.content.ComponentName
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.*
import com.qvapay.MainActivity
import com.qvapay.R

/**
 * Accesos directos a mini-apps (helpers/miniAppShortcuts.ts):
 *  - ANCLADOS en la pantalla de inicio (`requestPin`): el launcher enseña su
 *    propia confirmación y pone un icono con el logo de la mini-app.
 *  - RÁPIDOS al mantener pulsado el icono de QvaPay (`setQuickActions`): las
 *    favoritas del usuario.
 * Los dos abren la URL pública de la mini-app con un intent EXPLÍCITO a
 * MainActivity, así que entran por el deep link `/apps/:slug` de siempre
 * (en frío `getInitialURL`, en caliente `onNewIntent`, que es singleTask).
 *
 * Los rápidos cuelgan del alias LAUNCHER habilitado: el cambiador de icono
 * (AppIconModule) apaga los demás y con ellos se irían sus accesos, así que
 * JS los vuelve a publicar tras cada cambio de icono.
 */
class MiniAppShortcutsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        // Lo mismo que enseña iOS; la mayoría de launchers no pasan de 4-5
        private const val MAX_QUICK_ACTIONS = 4
    }

    override fun getName(): String = "MiniAppShortcuts"

    /** Alias LAUNCHER habilitado ahora mismo (solo hay uno, ver AppIconModule). */
    private fun enabledLauncher(): ComponentName? {
        val context = reactApplicationContext
        val query = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setPackage(context.packageName)
        val activity = context.packageManager.queryIntentActivities(query, 0).firstOrNull()?.activityInfo
            ?: return null
        return ComponentName(context.packageName, activity.name)
    }

    /** Bitmap adaptativo pintado en JS; sin él (o si no decodifica), el icono de QvaPay. */
    private fun iconFor(base64: String?): IconCompat {
        if (!base64.isNullOrEmpty()) {
            try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bitmap != null) return IconCompat.createWithAdaptiveBitmap(bitmap)
            } catch (_: Exception) { }
        }
        return IconCompat.createWithResource(reactApplicationContext, R.mipmap.ic_launcher)
    }

    private fun ReadableMap.text(key: String): String? =
        if (hasKey(key) && !isNull(key)) getString(key) else null

    private fun buildShortcut(shortcut: ReadableMap, rank: Int): ShortcutInfoCompat? {
        val context = reactApplicationContext
        val id = shortcut.text("id") ?: return null
        val label = shortcut.text("label") ?: return null
        val url = shortcut.text("url") ?: return null
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(url)
        }
        val builder = ShortcutInfoCompat.Builder(context, id)
            .setShortLabel(label)
            .setLongLabel(label)
            .setIcon(iconFor(shortcut.text("icon")))
            .setIntent(intent)
            .setRank(rank)
        enabledLauncher()?.let { builder.setActivity(it) }
        return builder.build()
    }

    @ReactMethod
    fun isPinSupported(promise: Promise) {
        try {
            promise.resolve(ShortcutManagerCompat.isRequestPinShortcutSupported(reactApplicationContext))
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestPin(shortcut: ReadableMap, promise: Promise) {
        try {
            val context = reactApplicationContext
            if (!ShortcutManagerCompat.isRequestPinShortcutSupported(context)) {
                promise.resolve(false)
                return
            }
            val info = buildShortcut(shortcut, 0)
            if (info == null) {
                promise.reject("SHORTCUT_INVALID", "Missing id, label or url")
                return
            }
            promise.resolve(ShortcutManagerCompat.requestPinShortcut(context, info, null))
        } catch (e: Exception) {
            promise.reject("SHORTCUT_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setQuickActions(shortcuts: ReadableArray, promise: Promise) {
        try {
            val context = reactApplicationContext
            val max = minOf(MAX_QUICK_ACTIONS, ShortcutManagerCompat.getMaxShortcutCountPerActivity(context))
            val list = (0 until shortcuts.size())
                .mapNotNull { index -> shortcuts.getMap(index)?.let { buildShortcut(it, index) } }
                .take(max)
            // false = el sistema lo limitó (llamadas en segundo plano): JS reintenta en el siguiente render
            promise.resolve(ShortcutManagerCompat.setDynamicShortcuts(context, list))
        } catch (e: Exception) {
            promise.reject("SHORTCUT_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearQuickActions(promise: Promise) {
        try {
            // Solo los rápidos: los anclados son del usuario y siguen en su pantalla
            ShortcutManagerCompat.removeAllDynamicShortcuts(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHORTCUT_ERROR", e.message)
        }
    }
}
