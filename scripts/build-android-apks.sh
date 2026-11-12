#!/bin/bash
# APKs para instalar fuera de Play (DigitalOcean + GitHub Releases), uno por
# arquitectura en vez de uno con las cuatro (314 MB en la 3.16.0):
#   QvaPay<versionCode>-arm64-v8a.apk    casi todo teléfono desde ~2017
#   QvaPay<versionCode>-armeabi-v7a.apk  teléfonos viejos y Android Go de 32 bits
#                                        (CPU de 64, sistema de 32: ahí el de arm64
#                                        no instala)
#   QvaPay<versionCode>.apk              universal: los dos juntos, para quien no
#                                        sepa cuál le toca. Conserva el nombre de
#                                        siempre para que no se rompan los enlaces
# x86/x86_64 (emuladores y Chromebooks, que tienen Play) no entran en ninguno.
# -PdistApk comprime las .so y deja solo es/en/pt (ver android/app/build.gradle).
# Una pasada de Gradle por APK: la primera compila, las otras dos solo reempaquetan.
set -e
cd "$(dirname "$0")/.."

VERSION_CODE=$(node -p "require('./app.json').versionCode")
SRC="android/app/build/outputs/apk/release/app-release.apk"
OUT_DIR="android/app/build/outputs/apk/dist"

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

build_apk() {
  local archs="$1" name="$2"
  echo ""
  echo "APK ${name} (${archs})..."
  rm -f "${SRC}"
  (cd android && ./gradlew assembleRelease -PdistApk -PreactNativeArchitectures="${archs}")
  if [ ! -f "${SRC}" ]; then
    echo "No está ${SRC}: ¿falta android/keystore.properties? Sin firma Gradle deja app-release-unsigned.apk" >&2
    exit 1
  fi
  # Guardarraíl: un APK con una arquitectura de más (o a medias) se instala donde
  # no debe y revienta al abrir
  local got
  got=$(unzip -Z1 "${SRC}" 'lib/*' | cut -d/ -f2 | sort -u | paste -sd, -)
  local want
  want=$(echo "${archs}" | tr ',' '\n' | sort -u | paste -sd, -)
  if [ "${got}" != "${want}" ]; then
    echo "El APK ${name} lleva .so de [${got}] y debía llevar [${want}]" >&2
    exit 1
  fi
  cp "${SRC}" "${OUT_DIR}/${name}"
}

build_apk "arm64-v8a" "QvaPay${VERSION_CODE}-arm64-v8a.apk"
build_apk "armeabi-v7a" "QvaPay${VERSION_CODE}-armeabi-v7a.apk"
build_apk "arm64-v8a,armeabi-v7a" "QvaPay${VERSION_CODE}.apk"

echo ""
echo "APKs en ${OUT_DIR}:"
ls -lh "${OUT_DIR}" | awk 'NR>1 {print "  " $5 "  " $9}'
