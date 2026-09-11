#!/usr/bin/env bash
# Compila QvaPay en Debug, la instala y la lanza en un iPhone físico.
#
# Reemplaza a `react-native run-ios --udid <udid>` porque el CLI de RN consulta la
# lista de dispositivos de xctrace, que marca el iPhone como "offline" aunque
# esté conectado por cable con modo desarrollador activo. xcodebuild + devicectl
# (CoreDevice) sí lo ven.
#
# Uso: npm run ios:device            (iPhone por defecto, ver DEVICE_UDID)
#      npm run ios:device -- <udid>  (otro iPhone; el UDID que muestra Xcode)
#      METRO=0 npm run ios:device    (no arranca Metro)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE_UDID="${1:-${DEVICE_UDID:-00008150-00110C693E08401C}}"
BUNDLE_ID="com.qvapay"
DERIVED="$ROOT/ios/build"
APP="$DERIVED/Build/Products/Debug-iphoneos/QvaPay.app"

# devicectl direcciona por su propio identificador CoreDevice (UUID), no por el
# UDID del hardware; lo resolvemos a partir del UDID leyendo el JSON de la lista.
DEVICES_JSON="$(mktemp -t qvapay-devices).json"
xcrun devicectl list devices --json-output "$DEVICES_JSON" >/dev/null
CORE_ID="$(node -e '
  const j = require(process.argv[1]);
  const d = (j.result?.devices || []).find(x => x.hardwareProperties?.udid === process.argv[2]);
  if (!d) process.exit(1);
  process.stdout.write(d.identifier);
' "$DEVICES_JSON" "${DEVICE_UDID}")" || {
  echo "✖ No se encontró un iPhone emparejado con UDID ${DEVICE_UDID}." >&2
  echo "  Conéctalo por cable, desbloquéalo y confía en el Mac. Dispositivos vistos:" >&2
  xcrun devicectl list devices >&2
  exit 1
}
rm -f "$DEVICES_JSON"

if [ "${METRO:-1}" != "0" ] && ! lsof -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "▸ Arrancando Metro en segundo plano (puerto 8081)"
  (cd "$ROOT" && nohup npx react-native start >/dev/null 2>&1 &)
fi

# react-native-quick-crypto NO trae su OpenSSL estático en el tarball de npm: lo
# descarga el podspec durante `pod install` y lo deja DENTRO de node_modules, así
# que cualquier `npm install` se lo lleva por delante. Sin esta comprobación el
# build compila entero y muere al final copiando un xcframework que no existe
# ("rsync error: .../QuickCryptoOpenSSL.xcframework/ios-arm64/*").
OPENSSL_XCF="$ROOT/node_modules/react-native-quick-crypto/ios/openssl/QuickCryptoOpenSSL.xcframework"
if [ ! -d "$OPENSSL_XCF" ]; then
  echo "▸ Falta el OpenSSL de quick-crypto (lo borra npm install) — corriendo pod install"
  (cd "$ROOT/ios" && { bundle exec pod install || pod install; })
fi

# SKIP_BUNDLING: en Debug la app carga el JS desde Metro, así que el bundle
# embebido (1-2 min + avisos de hermesc) sobra. react-native-xcode.sh escribe
# ip.txt (la IP de Metro para el iPhone) ANTES de mirar este flag, así que el
# teléfono sigue sabiendo dónde está el packager.
echo "▸ Compilando QvaPay (Debug) para el dispositivo ${DEVICE_UDID}"
(cd "$ROOT/ios" && SKIP_BUNDLING=1 xcodebuild \
  -workspace QvaPay.xcworkspace \
  -scheme QvaPay \
  -configuration Debug \
  -destination "id=${DEVICE_UDID}" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  -quiet \
  build 2>&1 | { grep -vE '^\++ |Run script build phase .* will be run during every build' || true; })
# El filtro quita las trazas `set -x` de react-native-xcode.sh y los avisos
# repetidos de fases sin outputs. pipefail: si xcodebuild falla, el pipeline
# falla y set -e aborta; el `|| true` solo evita que grep -v devuelva 1 cuando
# filtra todas las líneas.

echo "▸ Instalando en el iPhone"
xcrun devicectl device install app --device "$CORE_ID" "$APP" --quiet

echo "▸ Lanzando ${BUNDLE_ID}"
xcrun devicectl device process launch --device "$CORE_ID" --terminate-existing "${BUNDLE_ID}" --quiet

echo "✔ QvaPay corriendo en el iPhone."
