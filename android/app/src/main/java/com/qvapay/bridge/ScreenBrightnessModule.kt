package com.qvapay.bridge

import android.view.WindowManager
import com.facebook.react.bridge.*

/**
 * Sube el brillo al máximo mientras se enseña un QR. En Android el brillo se
 * fija por VENTANA (`screenBrightness` de los LayoutParams de la Activity), así
 * que no hay que guardar nada: al pasar a segundo plano el sistema vuelve solo
 * al brillo del usuario y al volver reaplica el de la ventana. `restore` pone
 * BRIGHTNESS_OVERRIDE_NONE, que devuelve el control al ajuste del sistema.
 */
class ScreenBrightnessModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ScreenBrightness"

    private fun setWindowBrightness(value: Float, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            // Sin Activity (app en segundo plano) no hay ventana que tocar
            promise.resolve(false)
            return
        }
        UiThreadUtil.runOnUiThread {
            try {
                val window = activity.window
                val params = window.attributes
                params.screenBrightness = value
                window.attributes = params
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("BRIGHTNESS_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun boost(promise: Promise) = setWindowBrightness(WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL, promise)

    @ReactMethod
    fun restore(promise: Promise) = setWindowBrightness(WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE, promise)
}
