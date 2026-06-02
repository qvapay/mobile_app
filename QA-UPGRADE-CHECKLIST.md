# QA Checklist — Upgrade de dependencias (RN 0.84)

Checklist de pruebas pendientes tras el upgrade mayor de paquetes. Marcá cada caso al validarlo.

**Contexto del upgrade:** RN 0.83→0.84 · Reanimated 4.3→4.4 + worklets 0.8→0.9 · gesture-handler 2→3 · VisionCamera 4→5 (+ barcode-scanner MLKit) · react-native-iap 14→15 (openiap 2.2.1) · async-storage 2→3 · ESLint 8→9 (flat config) · TypeScript 5→6 · `react` pin 19.2.3 · iOS min target 15.1→15.5.

---

## ✅ Ya probado
- [x] **Escaneo QR → pago** (VisionCamera 5 + `useBarcodeScannerOutput` + MLKit) — `Scan.jsx`

---

## 🔴 P0 — Lo que más cambió + toca dinero

### 1. Gold IAP — comprar y restaurar *(iap 14→15, openiap 1.3.15→2.2.1)*
- [ ] Comprar **mensual**: iOS App Store sheet → backend valida recibo → check dorado activo
- [ ] Comprar **anual**: iOS App Store sheet → backend valida recibo → check dorado activo
- [ ] Comprar **mensual/anual** en **Android** Play sheet → check dorado activo
- [ ] **Restaurar compras** (`getAvailablePurchases`) con cuenta que ya pagó
- [ ] Cancelar a mitad del sheet → no rompe estado, no doble cobro
- [ ] Android: que el `obfuscatedAccountId` y el `offerToken` del basePlan correcto sigan llegando
- [ ] Errores en español correctos: sin red, producto no disponible, ya suscrito

### 2. Deep links *(RN 0.84 + tocamos `AppDelegate.swift` / `RCTLinkingManager`)*
- [ ] App **cerrada**: abrir `qvapay://p2p/:uuid` → abre la oferta
- [X] App **en background**: abrir `qvapay://p2p/:uuid` → abre la oferta
- [ ] `https://www.qvapay.com/p2p/:uuid` (Universal Link) → abre el app *(requiere AASA deployado en qpweb — ver nota)*
- [ ] `https://www.qvapay.com/pay/:uuid` (Universal Link) → abre `Pay`
- [ ] Custom scheme `qvapay://pay/:uuid` → abre `Pay`
- [ ] Link entrando **sin sesión** → se guarda y se consume tras login (`pendingDeepLinkRef`)

> ⚠️ **Universal Links iOS** dependen de que el `apple-app-site-association` corregido (`CN9WDS6BJW.com.qvapay`) esté **deployado** en `qpweb` y propagado por el CDN de Apple. Para testear sin esperar: `applinks:qvapay.com?mode=developer` en el entitlement + *Associated Domains Development* activado en el device. El custom scheme `qvapay://` no depende del AASA.

---

## 🟠 P1 — Migraciones de código hechas a mano

### 3. AsyncStorage v3 *(`getMany`/`setMany`/`removeMany` — cambió la forma del retorno)*
- [ ] **Push prompts** (`usePushPrompt`): descartar el banner 3 veces → cooldown 1 semana; el contador **persiste** tras cerrar la app *(cambio sutil: `getMany` devuelve objeto, no pares — confirmar que el banner respeta el conteo y no reaparece siempre)*
- [ ] **Logout** (`AuthContext.clearAuthData`): cerrar sesión limpia token + las 3 keys de contactos; al re-loguear no quedan datos viejos
- [ ] **Contactos** (`useDeviceContacts.clearSyncedData`): tras logout no quedan matched contacts

### 4. Toasts *(sonner-native con GH3/worklets0.9 forzados por `legacy-peer-deps`)*
- [ ] Toast de **éxito** (ej. transfer ok) → aparece y se anima bien
- [ ] Toast de **error** (ej. error de compra) → aparece y se anima bien
- [ ] Toast de **info** (ej. copiar al portapapeles) → aparece y se anima bien

### 5. Animaciones / gestos *(Reanimated 4.4 + worklets 0.9 + babel `worklets/plugin`; gesture-handler 3)*
- [ ] **Splash** entra limpio (era donde reventaba el react mismatch)
- [ ] Balance animado (Home)
- [ ] Sparklines del Invest
- [ ] Lotties (Gold)
- [ ] Barra de carga global
- [ ] Gesto **swipe-back** iOS
- [ ] Bottom sheets (`Pay` modal slide-from-bottom)
- [ ] Drawers / swipes en listas

---

## 🟡 P2 — Regresión general (RN 0.84 bridgeless/Fabric)

### 6. Auth completo
- [ ] Login **2FA** (202) → flujo de PIN/TOTP
- [ ] Login **directo** (200)
- [ ] Biometría Face ID / Touch ID (Keychain `com.qvapay.biometrics`)
- [ ] Passkeys
- [ ] App Lock PIN (Keychain `com.qvapay.applock`)

### 7. Tiempo real
- [ ] Stream **SSE** (`useTransactionSSE`) — siguen llegando transacciones con bridgeless

### 8. Núcleo financiero
- [ ] Transfer con PIN
- [ ] Withdraw (2 pasos)
- [ ] P2P lifecycle completo (open → processing → paid → completed)
- [ ] Pay de invoice

### 9. Listas
- [ ] FlashList sin glitches de render con Fabric (Home, P2P, Store)

### 10. Notificaciones
- [ ] OneSignal (init fuera del árbol) recibe push

---

## ⚙️ Setup E2E y notas de entorno
- [ ] Rebuildeá el binario E2E con RN 0.84 (Detox; los selectores no cambian)
- [ ] 📱 **Cámara en E2E**: VisionCamera no escanea en simulador → flujo QR en **device físico** o con mock del módulo nativo; el resto corre en simulador
- [ ] 🍎 Probar instalación en device con **iOS 15.5–15.x** (subimos min target 15.1→15.5; documentar que <15.5 ya no se soporta)
- [ ] 💳 IAP necesita **sandbox de App Store / cuenta de prueba de Play** + productos configurados (el sheet nativo no se mockea)

---

## 🚦 Smoke test mínimo antes de cada release (los 5 imprescindibles)
- [ ] 1. Login (2FA)
- [ ] 2. Escanear QR de pago → pagar
- [ ] 3. Comprar / Restaurar Gold
- [ ] 4. Toast de confirmación visible
- [ ] 5. Deep link `qvapay://` con app cerrada
