# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QvaPay is a React Native mobile fintech app (RN 0.84.1, React 19.2.3) providing a non-custodial wallet, P2P marketplace, crypto payment gateway, savings (with Roundup), phone top-ups and gift cards for underbanked regions in Latin America and the Caribbean. The version lives in `package.json` (currently **1.8.5**) and is synced everywhere else by `npm run version:sync`. The backend API lives at `~/webs/qpweb` (Next.js 16).

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

**Node.js requirement**: >= 22.11. CocoaPods required for iOS. `npm run version:sync` reads `package.json` version and writes it across `ios/QvaPay.xcodeproj/project.pbxproj`, `android/app/build.gradle`, and `app.json` — all version bumps go through `package.json`.

**Testing gotcha**: devDeps use jest 30 but the `react-native` preset bundles jest 29 packages — they clash in the default environment. Pattern: extract pure logic into a plain module and test it with a `@jest-environment node` docblock (see `screens/keypad/keypadAmount.js` + `.test.js`).

## Architecture

### Provider Hierarchy (`App.tsx`)
The full nested provider stack — order matters because lower providers depend on the ones above:

```
GestureHandlerRootView
  ErrorBoundary
    SafeAreaProvider
      LoadingProvider
        AuthProvider
          OnlineStatusProvider
            SettingsProvider
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

### State Management (Context API)
- **AuthContext** (`/auth/AuthContext.js`, state extracted to `useAuthState.js`): auth state, one-shot token validation on startup (`initializeAuth()` refreshes via `/user/extended` — no periodic revalidation). State: `isAuthenticated`, `user`, `token`, `isLoading`, `error`. Functions: `login()` (handles 202 2FA + 200 success), `loginWithPasskey()`, `logout()`, `register()`, `confirmRegistration()`, `requestPin()`, `updateUser()`, `initializeAuth()`. The 60s lockout after 5 failed logins lives in `auth/screens/Login.jsx`, not the context. Helpers in `/auth/hooks/`: `useBiometricSupport`, `usePinCountdown`.
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
- Timeout 20s. Headers: `X-QvaPay-Client`, `User-Agent`, `X-QvaPay-Client-Version`, `-Platform`, `-Platform-Version`.
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
- `/api/`: 15 modules + `client.js`
- `/theme/`: ThemeContext + themeUtils
- `/settings/`: SettingsContext + useSettingsState + settingsConstants
- `/lock/`: AppLockContext + LockScreen
- `/loading/`: LoadingContext (bridged to axios for `GlobalLoadingBar`)
- `/hooks/`: `OnlineStatusContext`, `useAppNavigation`, `useDeviceContacts`, `usePinEntry` (multi-box PIN/OTP input mechanics), `usePushPrompt`, `useStepTransitions` (animated multi-step wizard transitions, used by Register), `useTransactionSSE` (real-time transaction stream via `react-native-sse`)
- `/helpers/`: `dataCache.js` (stale-while-revalidate cold-start cache — see Development Notes), `iap.js` (StoreKit/IAP), `inAppReview.js`, `playSound.js`, `stickers.js` (QvaPay sticker catalog), `versionCheck.js` (drives `UpdatePromptModal`), `walletDeeplinks.js` (Trust Wallet & co. universal links for deposits), `widgetBridge.js` (iOS/Android home-screen widgets)
- `/helpers.js`: legacy utilities (timeAgo, parseQRData, formatMoney, dates — Spanish locale)
- `/assets/`: images, Rubik fonts, Lottie animations
- `/scripts/`: `release-android.sh`, `sync-version.js`

### Key Dependencies
React Native 0.84.1, React 19.2.3, React Navigation 7 (`native-stack` + `bottom-tabs`), Axios 1.16, `@shopify/flash-list` 2, AsyncStorage 3, `react-native-keychain` 10, `@d11/react-native-fast-image`, Lottie 7, Reanimated 4.4 + `react-native-worklets`, `react-native-nitro-modules` + `nitro-image`, Vision Camera 5 + `vision-camera-barcode-scanner` (QR), Gesture Handler 3, Linear Gradient, **sonner-native** (toasts), FontAwesome6, SVG, `react-native-onesignal` 5, `react-native-iap` 15, `react-native-passkey` 3, `react-native-sse` (SSE for transactions), `react-native-haptic-feedback`, `react-native-edge-to-edge`, `react-native-version-check`, `react-native-international-phone-number`, ESLint 9, Jest 30, TypeScript 6 (`App.tsx` is currently the only TS file).

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
Auth login: 6/45s | P2P index: 5/60s | P2P create: 1/5s + 100/day | Transfer: 1/10s | Withdraw: 1/5s | Topup: 5/60s

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
| KYC path     | `/user/kyc2/*`                  | `/user/kyc`                          |
| Logout       | GET `/auth/logout`              | POST `/auth/logout`                  |
| 2FA          | reuses `/user/update/password`  | `/auth/create-2fa`, `/auth/reset-2fa`|
| Withdraw     | 2-step (preWithdraw + withdraw) | Single endpoint with PIN             |

**Working well:** P2P full lifecycle, transactions, transfer, coins, store catalogs (vouchers + topups), user search, auth login with 2FA, passkeys, savings, pay invoices, SSE transaction stream.

## Development Notes

- `.jsx` everywhere (~145 files); `App.tsx` is the only TypeScript file — migration not really started
- Functional components + hooks only (no class components beyond `ErrorBoundary`)
- UI strings hardcoded in Spanish (i18n on roadmap)
- Token lives in Keychain (`com.qvapay.auth`) — AsyncStorage is only used for non-secret settings
- API base URL switches on `__DEV__`; dev IP `192.168.0.10:3000` in `config.js` may need updating per machine
- Lists should use `@shopify/flash-list` — preferred over `FlatList` for new code
- Toasts use `sonner-native` (`import { toast } from 'sonner-native'`) — not `react-native-toast-message`
- Real-time transactions stream over SSE via `useTransactionSSE` (`react-native-sse`); P2P chat also streams over SSE via `screens/p2p/useP2PChatSSE.js` (falls back to 10s polling, retries the stream every 60s). Gotcha with `react-native-sse`: calling `close()` inside the `error` listener leaves a zombie reconnect (the server's `retry:` overrides `pollingInterval: 0`) — defer the close one tick
- Stickers: persisted in transaction descriptions as `:sticker:<name>.webm` (catalog in `helpers/stickers.js`); render the `.gif` variant from `media.qvapay.com/qvi` via FastImage (iOS can't decode webm)
- iOS 26 liquid-glass headers: use `unstable_headerRightItems` for header items that need to play nicely with the native blur; provide an `headerRight` fallback for Android
- `enableFreeze(true)` is on — be aware that off-screen routes pause rendering
- Requests can pass `{ silent: true }` to suppress the global loading bar
- **Cold-start cache** (`helpers/dataCache.js`): stale-while-revalidate — screens hydrate instantly from AsyncStorage (`@qpcache:` prefix, versioned envelope) and revalidate over the network; a failed fetch keeps cached data on screen instead of an empty state. Wired into: Home feed (transactions, quick-pay, blog, watchlist, promo), Transactions (unfiltered first page), Send carousel, P2P (offers + coins), Store catalog (+ per-country topup brands), Invest dashboard and the savings summary in BalanceCard. Rules: hydration must never clobber a resolved fetch (guard via reducer `hydrate` actions or `hasFresh*` refs), only successful fetches write the cache, and `clearDataCache()` purges everything on logout (`clearAuthData`). User profile persists separately under `user_data` (auth/useAuthState.js)
