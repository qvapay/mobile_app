# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Widgets y bridge de almacenamiento compartido: instanciados por el framework
# (AppWidgetProvider desde el manifest) y accedidos entre procesos — R8 full mode
# no puede ver esos puntos de entrada
-keep class com.qvapay.widget.** { *; }
-keep class com.qvapay.bridge.** { *; }

# OkHttp/Okio referencian clases de plataformas que no existen en Android
-dontwarn okhttp3.**
-dontwarn okio.**

# @stripe/stripe-react-native referencia el módulo opcional de push provisioning
# (tarjetas en Google Wallet) que no está en el classpath — la app no lo usa
-dontwarn com.stripe.android.pushProvisioning.**
