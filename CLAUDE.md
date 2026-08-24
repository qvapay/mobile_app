# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QvaPay is a React Native mobile fintech app (RN 0.84.1, React 19.2.3) providing a non-custodial wallet, P2P marketplace, crypto payment gateway, savings (with Roundup), phone top-ups and gift cards for underbanked regions in Latin America and the Caribbean. The version lives in **`app.json`** (source of truth: `version` + `versionCode`) and is synced everywhere else by `npm run version:sync`. The backend API lives at `~/webs/qpweb` (Next.js 16).

## Common Commands

```bash
# Development
npm run android          # Run on Android (auto-syncs version first)
npm run ios              # Run on iOS (auto-syncs version first)
npm run ios:build        # Build iOS (iPhone 16 simulator, auto-syncs version)
npm run ios:device       # Run on a physical iPhone (hardcoded UDID, auto-syncs version)
npm run pods             # cd ios && pod install (required after native dep changes)
npm run start            # Start Metro bundler

# Quality
npm run lint             # Run ESLint (@react-native config)
npm run test             # Run Jest tests (react-native preset)
npm run i18n:check       # Paridad de claves es/en + placeholders + pares de plural
npm run i18n:usage       # Toda clave literal t('...') del código existe en el bundle es
npx jest screens/keypad/keypadAmount.test.js  # Run a single test file
npm run doctor           # react-doctor diagnostics (also runs in CI: .github/workflows/react-doctor.yml)

# Release (Android)
npm run android:bundle      # Bundle release AAB
npm run android:apk         # Build release APK
npm run android:release     # Bundle + APK
npm run android:apk:release # Full release script (scripts/release-android.sh)
npm run android:publish[:internal|:production]  # gradle publishBundle to Play tracks

# Utilities
npm run version:sync     # Sync version across iOS/Android/app.json (auto-runs before ios/android)
```

**Node.js requirement**: >= 22.11. CocoaPods required for iOS. `npm run version:sync` reads **`app.json`** (`version` + `versionCode`) and writes them into `package.json` and `ios/QvaPay.xcodeproj/project.pbxproj`; Android reads `app.json` directly via Gradle — all version bumps go through `app.json`. The version also feeds the React Query persister `buster`, so bumping it invalidates the whole persisted query cache on update.

**Testing gotcha**: devDeps use jest 30 but the `react-native` preset bundles jest 29 packages — they clash in the default environment. Pattern: extract pure logic into a plain module and test it with a `@jest-environment node` docblock (see `screens/keypad/keypadAmount.js` + `.test.js`).

## Architecture

### Provider Hierarchy (`App.tsx`)
The full nested provider stack — order matters because lower providers depend on the ones above:

```
GestureHandlerRootView
  ErrorBoundary
    PersistQueryClientProvider  ← React Query + persister (por FUERA de Auth: el logout vacía la caché)
      SafeAreaProvider
        LoadingProvider
          AuthProvider
            OnlineStatusProvider
              SettingsProvider
                LanguageSync        ← render null; aplica language.currentLanguage a i18next
                ThemeProviderWithSettings
                  LoadingBridge       ← wires LoadingContext into the axios client
                    AppLockProvider
                      NavigationWrapper (NavigationContainer with linking + dynamic theme)
                        GlobalLoadingBar
                        AppNavigator
                        Toaster (sonner-native, top-center)
                      LockScreen
```

`OneSignal.initialize(...)` is called at module scope **outside** the component tree. `AppNavigator` also owns OneSignal foreground/click listeners (toast + navigate) and the `UpdatePromptModal` flow via `helpers/versionCheck`.

### Data Layer (React Query / TanStack Query 5)

**Todas las LECTURAS de servidor viven en React Query** (queries por dominio en módulos `*Queries.js` junto a sus pantallas); las mutaciones de dinero y los flujos en vivo siguen siendo llamadas directas a `api/` (ver "Fuera a propósito"). Piezas centrales:

- **`api/unwrap.js`**: traduce el contrato `{ success, data, error, status }` de los 15 módulos de `api/` a valor-o-`ApiError` (React Query necesita promesas que rechazan). `shouldRetry`: nunca 4xx (**excepto 429**, el único que el tiempo arregla — el token bucket del backend se rellena solo), siempre 5xx **y `status: undefined`** (500/red llegan sin código porque el interceptor rechaza sin `.response`). `retryDelay`: 429 espera 2.5s fijos (calzado con las ventanas de refill de 5s del backend); el resto backoff exponencial acotado a 5s. Máx 2 reintentos.
- **`api/queryClient.js`**: `staleTime: 0` por defecto (cada montaje revalida; las queries que pueden permitirse datos viejos lo suben caso a caso), `gcTime` 24h (DEBE cubrir la persistencia o el GC ganaría al persister), `refetchOnWindowFocus` off (no hay foco de ventana en RN). **Persister** a AsyncStorage (`@qpquery:v1`, 24h, `buster` = versión de app.json) con dos políticas globales: `shouldPersistQuery` excluye queries con **`meta: { noPersist: true }`** (histórico filtrado/buscado, carrito asistido, disponibilidad IAP), y el `serialize` **recorta toda query infinita a su primera página** antes de escribirla (persistir N páginas obligaría al próximo arranque a revalidarlas todas en cadena).
- **`api/queryUtils.js`**: `trimToFirstPage` — el pull-to-refresh de una query infinita hace `setQueryData(key, trimToFirstPage)` + `refetch()` para que un refresh sea UNA petición y no una cadena de refetches por página (Transactions, MarketOrders).
- **Logout**: `clearAuthData` hace `queryClient.clear()` + `persister.removeClient()` — sin esto, los datos de la cuenta anterior sobrevivirían en memoria y en disco.

**Raíces de claves** (jerárquicas: `refetchQueries(root)` refresca el dominio entero):
`['home', …]` feed del Home (transactions/quickpay/blog/watchlist/promo/profile) | `['transactions','list',filters]` histórico infinito (los filtros VAN EN LA CLAVE: filtrar = cambiar de query) | `['savings', …]` resumen + movimientos | `['invest', …]` dashboard + stocks/históricos | `['coins', kind|history]` catálogo de monedas e históricos | `['store', …]` catálogos Zendit + compras | `['market', …]` Seller Shops | `['assisted', …]` Personal Shopper | `['p2p', …]` monedas/medias/snapshot/perfiles | `['topup', …]` recargas IAP | `['user','referrals']` | `['contacts']`

**Queries compartidas entre pantallas** (misma clave = una petición y una caché): `['home','quickpay']` (fila de pago rápido del Home + carrusel de Send — vive en `hooks/useQuickPayQuery.js` para no arrastrar el feed entero a los tests de Send), `['savings','summary']` (`hooks/useSavingsSummaryQuery.js`: BalanceCard + Invest + Savings — un depósito/retiro invalida `['savings']` y las tres superficies se actualizan), `['coins', kind]` (`hooks/useCoins.js`, reescrito sobre RQ: Add/Withdraw/P2PCreate/PaymentMethods + picker del P2P), `['invest','coins']` (dashboard + CoinDetail), `['store','topup-countries']` (portada de tienda + PhoneTopupIndex).

**Convenciones**: `refreshing` es SIEMPRE estado local activado solo por el tirón del usuario (nunca `useIsFetching` — BalanceCard lo usa como flanco de subida); los toasts de error solo cuando `isError && !data` (offline con caché = silencio); `placeholderData: previous => previous` en listas/catálogos para que cambiar de clave no vacíe la pantalla (también entre timeframes de un gráfico).

**Fuera a propósito**: la orquestación de ofertas del P2P (`useP2POffers`: debounce 350ms + coalescing calibrados contra el rate limit 10/min — RQ solo aporta el snapshot de arranque vía `setQueryData(P2P_OFFERS_SNAPSHOT_KEY)`), `useP2POfferDetail`/`useP2PChat` (trade en vivo: polling 5s + SSE), y toda mutación de dinero (SendConfirm/Withdraw/Pay/compras — llamadas directas + `invalidateQueries` donde aplica).

**Tests**: React Query notifica vía `notifyManager` (`setTimeout`), así que los harness necesitan asentar con un temporizador real tras cada interacción (`settle()` = `act(async () => sleep(20))`); con fake timers, avanzar el reloj simulado en su lugar (ver `useP2POffers.test.js`). Cada harness crea su `QueryClient` con `retry: false` y lo desmonta en `afterEach` (`clear()` + `unmount()`) o jest no cierra el proceso.

### State Management (Context API)
Contexts = estado de UI/app (sesión, tema, ajustes, lock); el estado de **servidor** vive en React Query (sección anterior) — no crear contexts nuevos para datos de red.
- **AuthContext** (`/auth/AuthContext.js`, state extracted to `useAuthState.js`): auth state, one-shot token validation on startup (`initializeAuth()` refreshes via `/user/extended` — no periodic revalidation). State: `isAuthenticated`, `user`, `token`, `isLoading`, `error`. Functions: `login()` (handles 202 2FA + 200 success), `loginWithPasskey()`, `logout()`, `register()`, `confirmRegistration()`, `requestPin()`, `updateUser()`, `initializeAuth()`. **`updateUser` tiene identidad ESTABLE** (`useCallback` deps `[]` + ref espejo del user): hay efectos que dependen de ella (useHomeFeed vuelca el perfil), y si se recreara con cada `setUser` entrarían en bucle infinito — la tormenta de updates de contexto contra pantallas congeladas por `enableFreeze` pierde el contexto y revienta con "useAuth must be used within an AuthProvider". The 60s lockout after 5 failed logins lives in `auth/screens/Login.jsx`, not the context. Helpers in `/auth/hooks/`: `useBiometricSupport`, `usePinCountdown`.
- **SettingsContext** (`/settings/SettingsContext.js`, + `useSettingsState.js`, `settingsConstants.js`): app-wide settings (notifications, security, privacy, appearance, language, transactions, p2p, sounds). Granular AsyncStorage keys; supports import/export.
- **ThemeContext** (`/theme/ThemeContext.js`): light/dark/auto theme, memoized styles via `useTextStyles()` / `useContainerStyles()`. Listens to system appearance.
- **AppLockContext** (`/lock/AppLockContext.js`): PIN-protected app lock, gates the UI behind `LockScreen` when armed.
- **OnlineStatusContext** (`/hooks/OnlineStatusContext.js`): heartbeat/online presence for P2P peers and chats.
- **LoadingContext** (`/loading/LoadingContext.js`): drives `GlobalLoadingBar`. Wired into axios via `LoadingBridge` → `registerLoadingCallbacks()`. Requests can opt out by setting `config.silent = true`.

### Navigation (React Navigation v7)
Routes are defined as constants in `/routes.js`. Structure (`AppNavigator` is a native stack):

```
AppNavigator (Stack)
  Onboard (first-time, gated by appearance.firstTime)
  Welcome (unauthenticated)
  MainStack (authenticated) → Bottom Tabs: Home | Invest | Keypad | P2P | Store
  Feature screens: Add, Withdraw, Send/SendConfirm/SendSuccess, Receive,
    Transaction(s), Pay, P2PCreate, P2POffer, P2PUser, Scan,
    Savings, StockDetail, PhoneTopupIndex/PhoneTopupBrand, GiftCards/GiftCardBrand,
    MyPurchases/PurchaseDetail, AssistedShopping/AssistedProduct/AssistedCart/
    AssistedCheckout/AssistedOrders/AssistedOrderDetail (screens/store/assisted/),
    GoldCheck, Contacts, SettingsStack, Help
  Auth: Login, Register, RecoverPassword, Recover2FA
```

iOS-specific: `P2POffer` uses `unstable_headerRightItems` for liquid-glass compatibility (Android falls back to `headerRight`). `Pay` is presented as `transparentModal` with `slide_from_bottom`. `enableFreeze(true)` is called at top level. Header options come from a shared memoized `getHeaderOptions()` helper in `App.tsx`.

### Deep Linking (`/linking.js`)
Prefixes: `https://qvapay.com`, `https://www.qvapay.com`, `qvapay://`. Routes:
- `/p2p/:p2p_uuid` → `P2POffer`
- `/pay/:uuid` → `Pay`
- `/home`, `/p2p` inside `MainStack`

If a deep link arrives while unauthenticated, the URL is stashed in `pendingDeepLinkRef`; after login `AppNavigator` consumes it via `navigation.reset(...)`.

### API Layer (`/api/`)
**Axios client** (`client.js`):
- Base URL from `/config.js`: dev `http://192.168.0.10:3000/api`, prod `https://api.qvapay.com`. Fallback constant: `https://www.qvapay.com/api` (not yet wired into retry logic).
- Timeout 20s. Headers: `X-QvaPay-Client: QvaPayAPP`, `X-QvaPay-Client-Version` (app version), `-Platform` (**`Platform.OS` — `ios`/`android`**, the backend register endpoint keys the Turnstile-captcha exemption on it), `-Platform-Version` (OS version), `-Build` (build number), `-Device` (device model), `-Device-Name` (user-assigned name, ASCII-sanitized — raw non-ASCII header values crash the native HTTP stacks), plus a real `User-Agent` (`QvaPayAPP/<version> (<os> <osVersion>; <model>)`).
- Request interceptor pulls bearer token from **Keychain** (service `com.qvapay.auth`), not AsyncStorage. Triggers the global loading bar unless `silent: true`.
- Response interceptor: 403 clears the keychain token; 500 returns `"Ha ocurrido un error, contacte a soporte"`; network errors return `"No se ha podido conectar con el servidor"`. All in Spanish.
- All modules return `{ success, data, error?, status? }`.

The client also owns three Keychain services and exports their helpers:
| Service                 | Purpose                                                    |
|-------------------------|------------------------------------------------------------|
| `com.qvapay.auth`       | Bearer auth token                                          |
| `com.qvapay.biometrics` | Face ID / Touch ID login creds (email + password)          |
| `com.qvapay.applock`    | App-lock PIN                                               |

**API modules** (15 total):
- `authApi.js`: login (with 2FA), register, confirmRegistration, requestPin, logout, resetPassword, passkey register/verify
- `userApi.js`: searchUser, getUserProfile (`/user/extended`), updateUser, KYC, verifyPhone/Telegram, password, deletion, payment methods, contacts, referrals, gold, avatar
- `p2pApi.js`: index, show, create, cancel, markPaid, confirmReceived, getChat, sendChat, rateOffer, user profile
- `transferApi.js`: getLatestTransactions, getLatestSentTransfers, transferMoney (PIN), getTransactionDetails, getTransactionPDF
- `withdrawApi.js`: preWithdraw (request PIN), withdraw (PIN)
- `payApi.js`: merchant invoice viewing and payment (Pay screen)
- `savingApi.js`: deposits, withdrawals, balance, earnings, Roundup config
- `stocksApi.js`: stocks/watchlist data for Invest screen
- `storeApi.js`: unified Zendit-backed catalogs. `getVoucherCatalog` (`/store/voucher-catalog`, mode params: `countries` | `featured` | `favorites` | `categories` | `country`/`brand`), `purchaseVoucher` (`/store/voucher/purchase`), topup catalog (`/store/topup-catalog`, same mode-param style; Cuba = `cubacel` source, rest = Zendit), `/store/topup`, `/store/phone_package` (Cubacel), purchases (`/store/my`, `/store/my/{id}`)
- `shopApi.js`: assisted shopping (Personal Shopper) — parse store URL (`POST /shop/assisted-shopping/product`), product by uuid, recent shelf, cart (GET/POST + DELETE `/cart/product/{uuid}`; quantity encoded by repetition server-side), tax quote (`POST /checkout/quote` — state tax rates live server-side only), checkout, orders (`GET /orders`, `/orders/{id}`), shipping addresses CRUD (`/user/shipping-addresses`). Amazon fee 0% / eBay +1%; US-only shipping; $20 minimum
- `topupApi.js`: store-billed mobile top-ups (Google Play / App Store consumable one-time products). `/topup/products` (backend availability), `/topup/validate-receipt` (backend verifies receipt + executes the top-up; only a `success` response lets the client consume via `finishTransaction({ purchase, isConsumable: true })` — `pending`/202 is consumed server-side), `/topup/history`, `/topup/{id}/status`. SKU catalog in `helpers/iap.js` (`TOPUP_SKUS`/`TOPUP_CATALOG`)
- `coinsApi.js`: enabled coins (in/out filters)
- `promoApi.js`: promo banners shown across the app
- `blogApi.js`: WordPress REST API (uses native `fetch`, not axios)

### i18n (es/en/pt-BR — i18next)

**TODO el copy de UI vive en i18next** desde 2026-08-24 (barrido completo, ~1.900 claves por idioma; pt-BR añadido el mismo día). Piezas:

- **`i18n/index.js`**: singleton con init SÍNCRONO a nivel de módulo (`initImmediate: false`, recursos empaquetados) — `i18n.t()` es usable desde el primer import (ErrorBoundary lo necesita en render). `lng: 'es'` SIEMPRE en el init (determinista para jest); el idioma real lo aplica **`settings/LanguageSync.jsx`** en runtime. Exporta `getDeviceLanguage()` (vía `Intl` de Hermes, sin dep nativa), `resolveLanguage(pref)` y `getDateLocale()` ('es-ES'/'en-US'/'pt-BR' — sustituye a todo locale hardcodeado). **Regla dura: este módulo jamás importa react-native/AsyncStorage** (corre en cada test node).
- **Selectores por-app del SISTEMA** (los dos alimentan el modo 'auto' vía el locale del proceso): iOS exige **`CFBundleLocalizations`** en Info.plist (sin él, `CFBundleDevelopmentRegion=es` clava NSLocale en español aunque el teléfono esté en inglés — bug real cazado en simulador) y Android 13+ usa **`android:localeConfig`** → `res/xml/locales_config.xml`. **Checklist idioma nuevo**: carpeta `i18n/locales/<código>/` (21 JSON), bloque en `resources.js`, `SUPPORTED_LANGUAGES` + `DATE_LOCALES` en index.js, opción en `subpanels/Language.jsx` + claves `settings.language.options.<código>` en TODOS los bundles (cada idioma se muestra en sí mismo), `OTHERS` en `scripts/check-i18n.js`, Info.plist y locales_config.xml, y sufijos de plural extra si el CLDR del idioma no es one/other (pt: el 0 selecciona `_one`).
- **Recursos**: `i18n/locales/{es,en}/<dominio>.json` (21 dominios), fusionados por `i18n/resources.js` como grupos top-level de un único namespace → `t('p2p.offer.toasts.published')`. El español es el idioma fuente; convenciones y glosario en **`i18n/CONVENTIONS.md`**.
- **Preferencia**: `settings.language.currentLanguage` (`'auto'|'es'|'en'`, default `'auto'` = idioma del dispositivo con fallback a español); panel en Ajustes → Idioma (`subpanels/Language.jsx`). `LanguageSync` hace `i18n.changeLanguage(resolveLanguage(pref))` con guards de hidratación e identidad.
- **Patrones**: componentes → `useTranslation()` (sin provider: singleton global). Fuera de render (api/, helpers, hooks no reactivos, clases) → `i18n.t()` EN CALL TIME, nunca resuelto a nivel de módulo. Constantes de módulo con copy → mapas de claves/builders `(t) => …` resueltos en render. En hooks con identidad estable calibrada (useP2POffers/useP2PChat, fetchs de SendConfirm/Pay) se usa `i18n.t()` call-time a propósito: un `t` reactivo en sus deps re-dispararía efectos al cambiar idioma.
- **Navegación**: los títulos viven en `buildStaticScreens(t)` memoizado con `[t]` en `AppNavigator` (mantener la memoización: options con identidad cambiante reintroducen el flash liquid-glass iOS); tabs de MainStack con `t` en sus deps de useMemo.
- **Tests**: `jest.setup.js` (registrado en `setupFiles` PRESERVANDO el del preset RN — las claves de proyecto REEMPLAZAN las del preset) inicializa el singleton real en español → `t()` devuelve los literales que las suites asertan. El contrato está fijado en `i18n/i18n.test.js`.
- **Backend**: el cliente manda `Accept-Language` por request; la prosa de error del servidor sigue en español (workstream futuro en qpweb) — solo los FALLBACKS locales son claves.
- **NO traducir**: passthrough del backend, marcas (QvaPay, QUSD, Face ID…), enums/valores que viajan a la API ('Criptomonedas', ticks), payloads de OneSignal, valores de routes.js, `ui/BottomBar.jsx` (código muerto).

### Theme System
```javascript
const { theme } = useTheme()
const textStyles = createTextStyles(theme)
const containerStyles = createContainerStyles(theme)
```
Colors: primary `#6759EF`, success `#7BFFB1`, danger `#DB253E`, warning `#ff9f43`, gold `#FFD700`
Dark (default): bg `#0E0E1C`, surface `#1E2039`. Font: Rubik family.
`NavigationWrapper` mirrors the theme into React Navigation's `theme` to prevent iOS native flashes during transitions.

UI conventions:
- Prefer lighter font weights — medium/semiBold for emphasis; reserve bold/black for hero numbers.
- Surface cards must not show borders in dark mode: `theme.mode === 'light' && { borderWidth, borderColor }` inline.
- Press feedback uses `QPPressable` (own component: a **single** Reanimated `Animated.View` handling touches via RN's native Responder system — no wrapping `Pressable`). **Never** `Animated.createAnimatedComponent(Pressable)` on Fabric — it SIGSEGVs.
- Modals: centered card overlay (`transparent`, `animationType="fade"`, `statusBarTranslucent`, Pressable backdrop dismiss) — see `ContactsDisclosureModal`.

### Key Directories
- `/screens/`: 40+ screens by domain — `home/`, `invest/` (Invest, Savings, StockDetail), `keypad/`, `p2p/` (P2P, P2PCreate, P2POffer, P2PUser — P2POffer is decomposed into panels/modals: P2PChatPanel, P2PActionBar, P2PApplyModal, P2PEditModal, P2POfferDetailsCard, P2PRequirementsGate, SavedMethodsModal…; hooks `useP2PChat` + `useP2PChatSSE` for real-time chat), `transaction/` (incl. Pay), `store/` (Store + StoreGiftCardsSection/StoreTopupSection, PhoneTopupIndex/Brand/Step1, GiftCards, GiftCardBrand, MyPurchases, PurchaseDetail), `topup/` (TopupScreen — store-billed consumable top-ups via Play Billing/StoreKit, + components/), `settings/` (+ 17 subpanels), `add/`, `withdraw/`, `scan/`, `splash/`, `welcome/`, `onboard/`, `help/`
- `/ui/`: composite (BottomBar + BottomBarContext, AnimatedTabBar, BalanceCard, P2POfferItem, AmountInput, QPCoinPicker/QPCoinRow, WalletPickerSheet, CashDeliveryCard, QPKeyboardView, QPRefreshIndicator, WatchlistCard, Sparkline, BlogPostCard, PromoBanner, UpdatePromptModal, PushPromptModal, ContactsDisclosureModal, CountryPickerModal, QPPhoneInput, TransactionSkeleton, GlobalLoadingBar, ErrorBoundary, …)
- `/ui/particles/`: atomic (QPButton, QPPressable, QPInput, QPAvatar, QPBalance, QPCoin, QPTransaction, QPRate, QPPill, QPLoader, QPSwitch, QPMoneyInput, QPCodeInput, QPSkeleton, QPProduct, QPSectionHeader, SettingsItem, TransactionSticker, FaceIDIcon)
- `/ui/store/`: store-specific particles (BrandTile, CategoryPill, CountryPicker, OperatorAvatar)
- `/auth/`: AuthContext + `useAuthState` + `hooks/` + Login/Register/Recover screens; Login subcomponents live in `auth/screens/login/` (CredentialsForm, TwoFactorEntry, QuickLoginRow, LeakedPasswordModal)
- `/api/`: 15 modules + `client.js` + la capa de queries: `unwrap.js` (contrato→excepción + política de reintentos), `queryClient.js` (cliente + persister + políticas de persistencia), `queryUtils.js` (`trimToFirstPage`). Las queries por dominio viven junto a sus pantallas: `screens/home/homeQueries.js`, `screens/transaction/transactionsQueries.js` + `sendQueries.js`, `screens/invest/investQueries.js`, `screens/store/storeQueries.js`, `screens/store/market/marketQueries.js`, `screens/store/assisted/assistedQueries.js`, `screens/p2p/p2pQueries.js`
- `/theme/`: ThemeContext + themeUtils
- `/settings/`: SettingsContext + useSettingsState + settingsConstants
- `/lock/`: AppLockContext + LockScreen
- `/loading/`: LoadingContext (bridged to axios for `GlobalLoadingBar`)
- `/hooks/`: `OnlineStatusContext`, `useAppNavigation`, `useDeviceContacts`, `usePinEntry` (multi-box PIN/OTP input mechanics), `usePushPrompt`, `useStepTransitions` (animated multi-step wizard transitions, used by Register), `useTransactionSSE` (real-time transaction stream via `react-native-sse`), y las queries compartidas entre pantallas: `useQuickPayQuery` (Home + Send), `useSavingsSummaryQuery` (BalanceCard + Invest + Savings), `useCoins` (catálogo de monedas sobre RQ, filtros in|out|p2p|all)
- `/helpers/`: `dataCache.js` (LEGACY — solo `clearDataCache()` en el logout; ver Development Notes), `iap.js` (StoreKit/IAP), `inAppReview.js`, `playSound.js`, `stickers.js` (QvaPay sticker catalog), `versionCheck.js` (drives `UpdatePromptModal`), `walletDeeplinks.js` (Trust Wallet & co. universal links for deposits), `widgetBridge.js` (iOS/Android home-screen widgets)
- `/helpers.js`: legacy utilities (timeAgo, parseQRData, formatMoney, dates — Spanish locale)
- `/assets/`: images, Rubik fonts, Lottie animations
- `/scripts/`: `release-android.sh`, `sync-version.js`

### Key Dependencies
React Native 0.84.1, React 19.2.3, React Navigation 7 (`native-stack` + `bottom-tabs`), **TanStack Query 5** (`@tanstack/react-query` + `react-query-persist-client` + `query-async-storage-persister`), **i18next 26 + react-i18next 17** (+ `intl-pluralrules` para Hermes), Axios 1.16, `@shopify/flash-list` 2, AsyncStorage 3, `react-native-keychain` 10, `@d11/react-native-fast-image`, Lottie 7, Reanimated 4.4 + `react-native-worklets`, `@shopify/react-native-skia` 2 (only the aurora loading veil), `react-native-nitro-modules` + `nitro-image`, Vision Camera 5 + `vision-camera-barcode-scanner` (QR), Gesture Handler 3, Linear Gradient, **sonner-native** (toasts), FontAwesome6, SVG, `react-native-onesignal` 5, `react-native-iap` 15, `react-native-passkey` 3, `react-native-sse` (SSE for transactions), `react-native-haptic-feedback`, `react-native-edge-to-edge`, `react-native-version-check`, `react-native-international-phone-number`, ESLint 9, Jest 30, TypeScript 6 (`App.tsx` is currently the only TS file).

OneSignal app ID is hardcoded in `App.tsx`: `8f69c017-b7e7-40b2-903b-11ce7ac5cc81`.

---

## Backend API Reference (`~/webs/qpweb`)

**Stack:** Next.js 16.2.x | Prisma 6 + MySQL | Redis (ioredis) | Node >= 22
**Validation:** Zod v4 | **Rate Limiting:** ArcJet | **Email:** Resend + React Email
**Monitoring:** Sentry | **Auth:** bcrypt + speakeasy (TOTP) + HIBP password check

### Backend Structure
```
~/webs/qpweb/
  /app/api/          # API route handlers (100+ endpoints)
  /models/           # Prisma data access (@models/*)
  /scripts/          # Business logic (@scripts/*)
  /lib/              # Auth middleware (withAuth, withAppsAuth, withBothAuth)
  /emails/           # 20+ React Email templates
  /components/       # Web UI components
  /hooks/            # React hooks
  /prisma/           # schema.prisma
  /scripts/kv-state/ # Redis caching (session, rates, balance, user, p2p)
  /scripts/providers/payment/ # NowPayments, PayPal, Zendit, Hive, TropiPay, etc.
  /scripts/coins/    # Blockchain utils (TRON, Solana, ETH, BTC)
```

### API Endpoints (consumed by mobile)

**Auth** (`/api/auth/`): login, register, confirm-registration, check, request-pin, reset-password, logout (POST), create-2fa, reset-2fa, sessions, passkey register/verify

**User** (`/api/user/`): GET `/user` (profile + 3 txns), GET `/user/extended`, POST `/user/update`, POST `/user/update/password`, POST `/user/update/username`, GET/POST `/user/search`, POST `/user/kyc`, GET `/user/referrals`, GET/POST `/user/gold`, GET/POST/DELETE `/user/payment-methods`, POST `/user/contact`, POST `/user/verify/phone`, POST `/user/verify/telegram`, POST `/user/avatar`

**P2P** (`/api/p2p/`): GET `/p2p/index`, POST `/p2p/create`, GET `/p2p/{uuid}`, POST `/p2p/{uuid}/apply`, GET/POST `/p2p/{uuid}/chat`, POST `/p2p/{uuid}/paid`, POST `/p2p/{uuid}/received`, POST `/p2p/{uuid}/rate`, POST `/p2p/{uuid}/cancel`, GET `/p2p/average(s)`, GET `/p2p/ranking`, GET `/p2p/stats`

**Transactions** (`/api/transaction/`): GET `/transaction`, POST `/transaction/transfer` (amount, to, pin, description), GET `/transaction/{uuid}`, GET `/transaction/{uuid}/pdf`, GET `/transaction/latestusers`

**Store** (`/api/store/`): GET `/store/voucher-catalog` (mode params: `countries`/`featured`/`favorites`/`categories`/`country`+`brand`), POST `/store/voucher/purchase`, GET `/store/topup-catalog`, POST `/store/topup`, POST `/store/phone_package` (Cubacel), GET `/store/my`, GET `/store/my/{id}`, GET `/store/giftcards`

**Other**: POST `/withdraw`, POST `/topup`, GET `/coins/v2`, POST `/saving/deposit`, POST `/saving/withdraw`, GET `/pay/{uuid}`, POST `/pay/{uuid}`

**Merchant API** (`/api/v2/`): balance, create_invoice, modify_invoice, charge, transactions, authorize_payments

**Crons**: p2p-cleanup, p2p-validate, prices/crypto, prices/fiat, process-withdraw, savings-earnings, savings-snapshot, goldexpiration, gift-cards, phone-packages

### Backend Auth
- Cookie `qpsess` = `id|token` (personal_access_tokens table)
- Bearer token for API: `Authorization: Bearer {token}`
- Session: 2h default, 180d with "remember me", max 5 per user
- 2FA: 4-digit PIN (email) or 6-digit TOTP (speakeasy)

### Backend Rate Limits (ArcJet)
Auth login: 6/45s | P2P index: 10/min | P2P create: 1/5s + 100/day | Transfer: 1/10s | Withdraw: 1/5s | Topup: 5/60s | Transaction index (GET): token bucket 20 de ráfaga, refill 5/5s por usuario | Coin price-history: ráfaga 5, 3/10s (el backend cachea 1h — el cliente usa staleTime 1h)

### Key Models (Prisma/MySQL)
**User**: uuid, username, name, lastname, email, password, balance(9,2), satoshis, phone, telegram, kyc, vip, golden_check, pin, trustscore, role, p2p_enabled, image, cover, two_factor_secret
**Transaction**: uuid, user_id(receiver), app_id, amount(10,2), description, status(paid/pending/processing/received/cancelled), paid_by_user_id(sender), webhook
**P2P**: uuid, user_id(creator), peer_id, type(buy/sell), coin, amount(8,2), receive(30,12), status(open/processing/paid/completed/revision/cancelled), only_kyc, only_vip, private, details(Json)
**Withdraw**: user_id, transaction_id, amount, receive, payment_method, details(LongText), status(pending/paid/cancelled/processing)
**Coin**: tick(unique), name, price(36,18), fee_in, fee_out, enabled_in, enabled_out, enabled_p2p, working_data(Json)
**Wallet**: transaction_id, wallet_type, wallet(address), value(25,8), received(25,8), txid, status
**SavingsAccount**: user_id, balance(12,2), total_deposited, total_withdrawn, total_earned
**Chat**: p2p_id, peer_id, message(600), image
**Rating**: rateable_id, rateable_type, rater_id, rating(Float)
**KYC**: user_id, country, birthday, document_url, selfie_url, result(started/passed/processing/failed)
**Support**: ticket_number, status, priority, topic, subject, message, user_id, assigned_to

### P2P Offer Limits by Role
Regular: 1 | KYC: 3 | VIP: 5 | Gold: 10 | Company: 100 | Admin: 1000

### P2P Lifecycle
`open` → `processing` (peer applied) → `paid` (buyer marked) → `completed` (seller confirmed + rated) | `cancelled` or `revision` (dispute)

---

## Known Mobile-API Mismatches

| Issue        | Mobile                          | Backend                              |
|--------------|---------------------------------|--------------------------------------|
| Logout       | GET `/auth/logout`              | POST `/auth/logout`                  |
| 2FA          | reuses `/user/update/password`  | `/auth/create-2fa`, `/auth/reset-2fa`|
| Withdraw     | 2-step (preWithdraw + withdraw) | Single endpoint with PIN             |

**Working well:** P2P full lifecycle, transactions, transfer, coins, store catalogs (vouchers + topups), user search, auth login with 2FA, passkeys, savings, pay invoices, SSE transaction stream.

## Development Notes

- `.jsx` everywhere (~145 files); `App.tsx` is the only TypeScript file — migration not really started
- Functional components + hooks only (no class components beyond `ErrorBoundary`)
- **UI multilenguaje (es/en/pt-BR) vía i18next** — ver sección "i18n" arriba; copy nuevo SIEMPRE nace como clave en `i18n/locales/` (los 3 idiomas) siguiendo `i18n/CONVENTIONS.md`, nunca como literal
- Token lives in Keychain (`com.qvapay.auth`) — AsyncStorage is only used for non-secret settings
- API base URL switches on `__DEV__`; dev IP `192.168.0.10:3000` in `config.js` may need updating per machine
- Lists should use `@shopify/flash-list` — preferred over `FlatList` for new code
- Toasts use `sonner-native` (`import { toast } from 'sonner-native'`) — not `react-native-toast-message`
- Real-time transactions stream over SSE via `useTransactionSSE` (`react-native-sse`); P2P chat also streams over SSE via `screens/p2p/useP2PChatSSE.js` (falls back to 10s polling, retries the stream every 60s). Gotcha with `react-native-sse`: calling `close()` inside the `error` listener leaves a zombie reconnect (the server's `retry:` overrides `pollingInterval: 0`) — defer the close one tick
- Stickers: persisted in transaction descriptions as `:sticker:<name>.webm` (catalog in `helpers/stickers.js`); render the `.gif` variant from `media.qvapay.com/qvi` via FastImage (iOS can't decode webm)
- iOS 26 liquid-glass headers: use `unstable_headerRightItems` for header items that need to play nicely with the native blur; provide an `headerRight` fallback for Android
- `enableFreeze(true)` is on — be aware that off-screen routes pause rendering
- Requests can pass `{ silent: true }` to suppress the global loading bar
- **Idempotencia en operaciones de dinero** (`helpers/idempotency.js`): los tres endpoints de dinero (`/p2p/create`, `/transaction/transfer`, `/withdraw`) aceptan `idempotency_key` opcional (8-64 chars `[A-Za-z0-9._-]`). Las pantallas P2PCreate/SendConfirm/Withdraw guardan la clave en un ref creado al montar, la mantienen ESTABLE en todo reintento (timeout, 5xx, doble tap) y solo la rotan tras éxito 2xx confirmado. Un replay de operación completada devuelve `200` con la operación ORIGINAL + `duplicate: true` (p2pApi.create lo acepta como éxito además del 201); un reintento con la original en vuelo devuelve `409 DUPLICATE_REQUEST` — `callWithDuplicateRetry` espera ~5s (el rate limit 1/5s corre antes del check) y reintenta UNA vez con la misma clave. Clave finalizada dura 24h server-side; Redis caído = fail-open (es red de seguridad, no lógica de negocio)
- **KYC (Didit) y nudges de verificación**: el KYC es una URL hospedada de Didit que se abre en el navegador — `POST /user/kyc` devuelve la URL (códigos: 400 ya verificado, 409 en revisión, 403 rechazado/máx intentos, 429 lock); `GET /user/kyc` → `{ kyc, kyc_status: none|pending|approved|declined }`. El flag autoritativo de gating es `user.kyc` (el backend gatea transfer ≥$500, retiro >$1000, P2P completo, ahorro y seller). Superficies en la app: paso `kyc` del Register wizard (sesión silenciosa, con "Ahora no"), pantalla `settings/subpanels/KYC.jsx` de 4 estados (re-check al volver del navegador vía AppState + polling 12s en pending) y banner sutil del Home gobernado por `hooks/useKycPrompt.js` (5 descartes máx, cooldown 5 días, gracia 48h tras abrir sesión — `markKycSessionStarted()`)
- **Cold-start cache**: lo da el persister de React Query (ver "Data Layer") — las pantallas pintan al instante desde `@qpquery:v1` y revalidan por detrás; un fetch fallido conserva los datos anteriores por construcción. **`helpers/dataCache.js` es LEGACY**: ya no tiene consumidores de lectura/escritura; solo sobrevive `clearDataCache()` en el logout para purgar las claves `@qpcache:` huérfanas de instalaciones viejas. No añadir usos nuevos — toda lectura nueva es una query. User profile persists separately under `user_data` (auth/useAuthState.js)
