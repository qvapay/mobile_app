package com.qvapay

import android.content.pm.ActivityInfo
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    // Portrait solo en teléfonos: en pantallas grandes (>= sw600dp) Android 16
    // ignora la restricción de todos modos — dejarlas libres también en <= 15
    if (resources.configuration.smallestScreenWidthDp < 600) {
      requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
  }

  /**
   * Atrás en la raíz (ninguna pantalla de JS lo consume) manda la app al fondo
   * en vez de destruir la Activity. Por defecto ReactActivity la termina: la
   * próxima apertura es un warm start que vuelve a montar TODO el árbol de
   * React (providers, rehidratación del persister, navegación) — caro en
   * gama baja (Cortex-A53 / Mali G52 en Play vitals). Android 12+ ya lo hace
   * así para la actividad raíz del launcher; esto lo extiende a <= 11 y a los
   * arranques por alias de icono o deep link.
   */
  override fun invokeDefaultOnBackPressed() {
    moveTaskToBack(true)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "QvaPay"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
