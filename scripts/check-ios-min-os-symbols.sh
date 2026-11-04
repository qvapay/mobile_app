#!/usr/bin/env bash
# Comprueba que un QvaPay.app compilado para dispositivo NO enlaza en firme (no-weak)
# símbolos que solo existen a partir de iOS 18: con ellos dyld aborta al arrancar en
# iOS 15-17 ("DYLD 4 Symbol missing") y la app ni llega a `main`. Es lo que pasó con
# las builds 3.3.1/3.6.0 de TestFlight (47 crashes): Nitro Modules + Xcode 27, ver
# patches/react-native-nitro-modules+0.37.1.patch y CLAUDE.md ("Xcode 27 + Nitro").
#
# Uso:  scripts/check-ios-min-os-symbols.sh <ruta/QvaPay.app>
#       (el .app de ios/build/Build/Products/Debug-iphoneos o el de un .xcarchive:
#        <X.xcarchive>/Products/Applications/QvaPay.app)
# Sale con 1 si encuentra alguno; lista símbolo, binario y librería esperada.
set -euo pipefail

APP="${1:?ruta al QvaPay.app}"
[ -d "$APP" ] || { echo "No existe $APP" >&2; exit 2; }

# Patrones de símbolos introducidos en iOS 18 que un toolchain moderno puede emitir
# aunque el deployment target sea 15.x (libc++ compilado desde Swift, Swift 6 runtime).
PATTERNS=(
  '__ZNSt13exception_ptr31__from_native_exception_pointerEPv'   # libc++ 18 (iOS 18.0)
  '___cxa_init_primary_exception'                               # libc++abi (iOS 18.0)
  '9isolation'                                                  # Swift 6 concurrency: next(isolation:), withCheckedContinuation(isolation:)...
)
REGEX=$(IFS='|'; echo "${PATTERNS[*]}")

bins=()
name=$(basename "$APP" .app)
[ -f "$APP/$name" ] && bins+=("$APP/$name")
for f in "$APP"/*.debug.dylib "$APP"/Frameworks/*.framework; do
  [ -e "$f" ] || continue
  if [ -d "$f" ]; then b="$f/$(basename "$f" .framework)"; else b="$f"; fi
  [ -f "$b" ] && bins+=("$b")
done

if [ ${#bins[@]} -eq 0 ]; then
  echo "✗ No se encontraron binarios en $APP" >&2
  exit 1
fi

bad=0
for b in "${bins[@]}"; do
  # dyld_info -fixups marca los enlaces débiles con [weak-import]; los demás son en firme.
  fixups=$(dyld_info -fixups "$b" 2>&1) || {
    echo "✗ dyld_info falló al inspeccionar $(basename "$b")" >&2
    exit 1
  }
  hits=$(echo "$fixups" | grep -E "$REGEX" | grep -v '\[weak-import\]' | awk '{print $NF}' | sort -u || true)
  if [ -n "$hits" ]; then
    bad=1
    echo "✗ $(basename "$b") enlaza en firme símbolos de iOS 18+ (crash al arrancar en iOS 15-17):"
    echo "$hits" | sed 's/^/    /'
  fi
done

if [ "$bad" = 0 ]; then
  echo "✓ ${#bins[@]} binarios sin símbolos de iOS 18+ en firme ($(basename "$APP"))"
fi
exit $bad
