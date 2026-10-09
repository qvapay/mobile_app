# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Widgets y bridge: SIN keep propio a propósito (Play: "R8 configuration could
# be causing higher memory usage" — los keep de paquete entero bloquean la
# optimización). Los AppWidgetProvider los conserva la regla que AAPT genera
# desde el manifest, el Worker la de WorkManager y los @ReactMethod la de RN;
# ninguno usa reflexión propia (los JSON se parsean con org.json a mano).

# OkHttp/Okio referencian clases de plataformas que no existen en Android
-dontwarn okhttp3.**
-dontwarn okio.**

# @stripe/stripe-react-native referencia el módulo opcional de push provisioning
# (tarjetas en Google Wallet) que no está en el classpath — la app no lo usa
-dontwarn com.stripe.android.pushProvisioning.**

# SDK nativo de Didit (KYC): binario cerrado con modelos serializados y JNI. Su
# propio proguard.txt ya trae `-keep class me.didit.sdk.** { *; }` (todo el SDK
# vive bajo me.didit.sdk) — repetirlo aquí solo duplicaba un keep de paquete
-dontwarn me.didit.**

# R8 en modo optimize (proguard-android-optimize.txt): el wrapper RN del SDK de
# KYC (com.sdkreactnative.SdkReactNativePackage) localiza POR REFLEXIÓN el
# constructor de ReactModuleInfo contando parámetros (6 en RN 0.79+). Optimize
# reescribía ese constructor y la app moría al arrancar con
# "NoSuchElementException: Array contains no element matching the predicate".
-keep class com.facebook.react.module.model.ReactModuleInfo { <init>(...); }

# react-native-device-info crea el InstallReferrerClient POR REFLEXIÓN
# (getMethod("newBuilder", Context)). R8 renombraba el método y
# getInstallReferrer() devolvía vacío: la atribución de instalación
# (helpers/installReferrer) se perdía en silencio en los builds release
-keep class com.android.installreferrer.api.** { *; }
