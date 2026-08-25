package com.qvapay.bridge

import android.content.ComponentName
import android.content.pm.PackageManager
import com.facebook.react.bridge.*

/**
 * Conmuta el icono del launcher entre los activity-alias del manifest (feature
 * GOLD "Ícono de la app"). Exactamente un alias está habilitado a la vez; el
 * cambio usa DONT_KILL_APP, así que nuestro proceso sobrevive, pero algunos
 * launchers OEM (MIUI, One UI) reposicionan o parpadean el shortcut al
 * re-resolver el componente LAUNCHER — comportamiento aceptado, igual que en
 * Telegram/Bitwarden. Los deep links no se ven afectados: los filtros VIEW
 * viven en .MainActivity, que nunca se toca aquí.
 */
class AppIconModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        // id JS -> FQCN del alias del manifest
        private val ALIASES = mapOf(
            "default" to "com.qvapay.MainActivityDefault",
            "midnight" to "com.qvapay.MainActivityMidnight",
            "gold" to "com.qvapay.MainActivityGold",
            "ocean" to "com.qvapay.MainActivityOcean",
            "pink" to "com.qvapay.MainActivityPink",
            "navidad" to "com.qvapay.MainActivityNavidad",
            "halloween" to "com.qvapay.MainActivityHalloween",
            "blackfriday" to "com.qvapay.MainActivityBlackFriday",
        )
    }

    override fun getName(): String = "AppIconChanger"

    private fun componentFor(alias: String) =
        ComponentName(reactApplicationContext.packageName, alias)

    @ReactMethod
    fun getIcon(promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val current = ALIASES.entries.firstOrNull { (id, alias) ->
                when (pm.getComponentEnabledSetting(componentFor(alias))) {
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
                    // DEFAULT = lo que declare el manifest: solo el alias
                    // Default nace con enabled="true"
                    PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> id == "default"
                    else -> false
                }
            }
            promise.resolve(current?.key ?: "default")
        } catch (e: Exception) {
            promise.reject("ICON_ERROR", e.message)
        }
    }

    @ReactMethod
    fun changeIcon(iconId: String, promise: Promise) {
        try {
            val target = ALIASES[iconId]
            if (target == null) {
                promise.reject("INVALID_ICON", "Unknown icon id: $iconId")
                return
            }
            val pm = reactApplicationContext.packageManager
            // Habilitar el nuevo ANTES de deshabilitar el resto: nunca debe
            // haber un instante sin componente LAUNCHER habilitado
            pm.setComponentEnabledSetting(
                componentFor(target),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP,
            )
            ALIASES.values.filter { it != target }.forEach { alias ->
                pm.setComponentEnabledSetting(
                    componentFor(alias),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP,
                )
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ICON_ERROR", e.message)
        }
    }
}
