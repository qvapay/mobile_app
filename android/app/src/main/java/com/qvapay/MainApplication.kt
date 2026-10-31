package com.qvapay

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.qvapay.bridge.AppIconPackage
import com.qvapay.bridge.BiometricGatePackage
import com.qvapay.bridge.MiniAppShortcutsPackage
import com.qvapay.bridge.ScreenBrightnessPackage
import com.qvapay.bridge.SharedStoragePackage

class MainApplication : Application(), ReactApplication {

  companion object {
    /**
     * Canales de las notificaciones de dinero. Desde Android 8 el sonido vive
     * en el CANAL, no en la notificación: el backend solo tiene que mandar el
     * `channel_id` de FCM con uno de estos ids (scripts/notifications/push.js
     * de qpweb) para que el cobro suene a moneda con la pantalla bloqueada.
     *
     * OJO: un canal es INMUTABLE una vez creado — cambiarle el sonido a un
     * usuario que ya lo tiene exige un id nuevo (`..._v2`), no editar este.
     */
    const val CHANNEL_MONEY_IN = "qp_money_in"
    const val CHANNEL_MONEY_OUT = "qp_money_out"

    /**
     * Canales del push propio, espejo de `ANDROID_CHANNELS` en
     * `scripts/push/rules.js` de qpweb (`channelFor` elige uno por aviso:
     * sonido de dinero > tipo > categoría). Cada canal es un interruptor del
     * usuario en los ajustes del sistema, por eso el chat de un trato, el
     * trato en sí, las alertas del mercado y las promociones van separados.
     * `transactional` es además el canal por defecto del manifest (ahí cae
     * un `channel_id` que esta build no conozca). Sonido del sistema.
     */
    const val CHANNEL_TRANSACTIONAL = "transactional"
    const val CHANNEL_P2P_TRADES = "p2p_trades"
    const val CHANNEL_P2P_CHAT = "p2p_chat"
    const val CHANNEL_P2P_MARKET = "p2p_market"
    const val CHANNEL_SHOPPING = "shopping"
    const val CHANNEL_PROMOS = "promos"
  }

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(SharedStoragePackage())
          add(AppIconPackage())
          add(ScreenBrightnessPackage())
          add(BiometricGatePackage())
          add(MiniAppShortcutsPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createNotificationChannels()
  }

  /**
   * Registra los canales de notificación: los dos de dinero con los sonidos
   * que ya viajan en res/raw (los mismos que suenan dentro de la app vía
   * helpers/playSound) y los del push propio con el sonido del sistema.
   * Crearlos aquí los deja versionados con el código; `createNotificationChannel`
   * es idempotente, así que repetirlo en cada arranque no cuesta nada.
   */
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val attributes = AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .build()
    val moneyChannels = listOf(
        Triple(CHANNEL_MONEY_IN, R.string.channel_money_in, R.raw.money_in),
        Triple(CHANNEL_MONEY_OUT, R.string.channel_money_out, R.raw.money_out),
    )
    moneyChannels.forEach { (id, nameRes, soundRes) ->
      val channel = NotificationChannel(id, getString(nameRes), NotificationManager.IMPORTANCE_HIGH)
      channel.setSound(Uri.parse("android.resource://" + packageName + "/" + soundRes), attributes)
      channel.enableVibration(true)
      manager.createNotificationChannel(channel)
    }
    val pushChannels = listOf(
        Triple(CHANNEL_TRANSACTIONAL, R.string.channel_transactional, NotificationManager.IMPORTANCE_HIGH),
        Triple(CHANNEL_P2P_TRADES, R.string.channel_p2p_trades, NotificationManager.IMPORTANCE_HIGH),
        Triple(CHANNEL_P2P_CHAT, R.string.channel_p2p_chat, NotificationManager.IMPORTANCE_HIGH),
        Triple(CHANNEL_P2P_MARKET, R.string.channel_p2p_market, NotificationManager.IMPORTANCE_DEFAULT),
        Triple(CHANNEL_SHOPPING, R.string.channel_shopping, NotificationManager.IMPORTANCE_HIGH),
        Triple(CHANNEL_PROMOS, R.string.channel_promos, NotificationManager.IMPORTANCE_DEFAULT),
    )
    pushChannels.forEach { (id, nameRes, importance) ->
      val channel = NotificationChannel(id, getString(nameRes), importance)
      channel.enableVibration(importance == NotificationManager.IMPORTANCE_HIGH)
      manager.createNotificationChannel(channel)
    }
  }
}
