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
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.qvapay.bridge.AppIconPackage
import com.qvapay.bridge.SharedStoragePackage

class MainApplication : Application(), ReactApplication {

  companion object {
    /**
     * Canales de las notificaciones de dinero. Desde Android 8 el sonido vive
     * en el CANAL, no en la notificación: el backend solo tiene que mandar
     * `existing_android_channel_id` con uno de estos ids (scripts/notifications/push.js
     * de qpweb) para que el cobro suene a moneda con la pantalla bloqueada.
     *
     * OJO: un canal es INMUTABLE una vez creado — cambiarle el sonido a un
     * usuario que ya lo tiene exige un id nuevo (`..._v2`), no editar este.
     */
    const val CHANNEL_MONEY_IN = "qp_money_in"
    const val CHANNEL_MONEY_OUT = "qp_money_out"
  }

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              add(SharedStoragePackage())
              add(AppIconPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createMoneyChannels()
  }

  /**
   * Registra los dos canales de dinero con los sonidos que ya viajan en
   * res/raw (los mismos que suenan dentro de la app vía helpers/playSound).
   * Crearlos aquí y no en el panel de OneSignal los deja versionados con el
   * código; `createNotificationChannel` es idempotente, así que repetirlo en
   * cada arranque no cuesta nada.
   */
  private fun createMoneyChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val attributes = AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .build()
    val channels = listOf(
        Triple(CHANNEL_MONEY_IN, R.string.channel_money_in, R.raw.money_in),
        Triple(CHANNEL_MONEY_OUT, R.string.channel_money_out, R.raw.money_out),
    )
    channels.forEach { (id, nameRes, soundRes) ->
      val channel = NotificationChannel(id, getString(nameRes), NotificationManager.IMPORTANCE_HIGH)
      channel.setSound(Uri.parse("android.resource://" + packageName + "/" + soundRes), attributes)
      channel.enableVibration(true)
      manager.createNotificationChannel(channel)
    }
  }
}
