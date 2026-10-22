package com.qvapay.bridge

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.*
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * Huella del bloqueo y de la firma de la wallet, pedida en CADA uso.
 *
 * Sustituye en Android al marcador de react-native-keychain: ese crea sus claves
 * con 5 s de validez tras CUALQUIER autenticación del teléfono (huella o PIN del
 * teléfono), así que abrir QvaPay justo después de desbloquear el móvil leía el
 * marcador sin diálogo y se saltaba el bloqueo.
 *
 * Aquí la clave es de autenticación por uso (timeout 0), solo admite biometría
 * fuerte (nunca el PIN del teléfono) y se invalida al registrar una huella
 * nueva. Solo un `BiometricPrompt` con su `CryptoObject` la desbloquea, y el
 * éxito se comprueba cifrando con ella: sin la huella de ESTE diálogo no hay
 * `success`.
 *
 * `authenticate` resuelve siempre con un resultado (nunca rechaza):
 * success | cancelled | lockout | invalidated | missing | unavailable | busy | error.
 */
class BiometricGateModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    // Un diálogo a la vez: su promesa queda aquí hasta que el diálogo responda
    private var pending: Promise? = null

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "BiometricGate"

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun settle(outcome: String) {
        val promise = pending ?: return
        pending = null
        promise.resolve(outcome)
    }

    private fun deleteQuietly(alias: String) {
        try { keyStore().deleteEntry(alias) } catch (_: Exception) { }
    }

    /** ¿Hay al menos una biometría FUERTE registrada y usable? */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        val status = BiometricManager.from(reactApplicationContext).canAuthenticate(BIOMETRIC_STRONG)
        promise.resolve(status == BiometricManager.BIOMETRIC_SUCCESS)
    }

    @ReactMethod
    fun hasKey(alias: String, promise: Promise) {
        try { promise.resolve(keyStore().containsAlias(alias)) } catch (_: Exception) { promise.resolve(false) }
    }

    /** Crea (o reemplaza) la clave. No pide la huella: solo exige que haya una registrada. */
    @ReactMethod
    fun createKey(alias: String, promise: Promise) {
        try {
            val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            } else {
                // -1 = autenticación por uso y solo biometría (el PIN del teléfono no la autoriza)
                @Suppress("DEPRECATION")
                spec.setUserAuthenticationValidityDurationSeconds(-1)
            }
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).apply { init(spec.build()) }.generateKey()
            promise.resolve(true)
        } catch (_: Exception) {
            // Sin biometría fuerte registrada la clave no se puede crear
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun deleteKey(alias: String, promise: Promise) {
        deleteQuietly(alias)
        promise.resolve(true)
    }

    @ReactMethod
    fun authenticate(alias: String, title: String, cancelLabel: String, promise: Promise) {
        if (pending != null) { promise.resolve("busy"); return }
        val activity = reactApplicationContext.currentActivity as? FragmentActivity
        if (activity == null) { promise.resolve("unavailable"); return }

        // La clave se prepara ANTES del diálogo: si se invalidó (huella nueva) ni se muestra
        val cipher: Cipher
        try {
            val key = keyStore().getKey(alias, null) as? SecretKey
            if (key == null) { promise.resolve("missing"); return }
            cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key) }
        } catch (_: KeyPermanentlyInvalidatedException) {
            deleteQuietly(alias)
            promise.resolve("invalidated")
            return
        } catch (_: Exception) {
            promise.resolve("error")
            return
        }

        pending = promise
        UiThreadUtil.runOnUiThread {
            // En segundo plano androidx.biometric no muestra nada NI avisa: la promesa
            // se quedaría colgada para siempre
            if (activity.isFinishing || activity.isDestroyed || activity.supportFragmentManager.isStateSaved) {
                settle("cancelled")
                return@runOnUiThread
            }
            try {
                val prompt = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        // Prueba de que la clave la autorizó ESTE diálogo: cifrar con ella
                        val outcome = try {
                            val authorized = result.cryptoObject?.cipher ?: throw IllegalStateException("no cipher")
                            authorized.doFinal(PROOF)
                            "success"
                        } catch (_: Exception) {
                            "error"
                        }
                        settle(outcome)
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        settle(
                            when (errorCode) {
                                BiometricPrompt.ERROR_USER_CANCELED,
                                BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                                BiometricPrompt.ERROR_CANCELED -> "cancelled"
                                BiometricPrompt.ERROR_LOCKOUT,
                                BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "lockout"
                                BiometricPrompt.ERROR_NO_BIOMETRICS,
                                BiometricPrompt.ERROR_HW_NOT_PRESENT,
                                BiometricPrompt.ERROR_HW_UNAVAILABLE -> "unavailable"
                                else -> "error"
                            }
                        )
                    }
                    // onAuthenticationFailed (huella no reconocida) no es final: el diálogo sigue
                })
                val info = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setNegativeButtonText(cancelLabel)
                    .setAllowedAuthenticators(BIOMETRIC_STRONG)
                    .setConfirmationRequired(false)
                    .build()
                prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
            } catch (_: Exception) {
                settle("error")
            }
        }
    }

    override fun onHostResume() {}

    override fun onHostPause() {}

    // Si la Activity muere con el diálogo abierto, ningún callback llega: se libera aquí
    override fun onHostDestroy() {
        settle("cancelled")
    }

    override fun invalidate() {
        reactApplicationContext.removeLifecycleEventListener(this)
        settle("cancelled")
        super.invalidate()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        val PROOF = byteArrayOf(0x51, 0x50)
    }
}
