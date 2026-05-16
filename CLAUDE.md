# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QvaPay is a React Native mobile fintech app (RN 0.83.1, React 19.2.4) providing a non-custodial wallet, P2P marketplace, crypto payment gateway, savings (with Roundup), phone top-ups and gift cards for underbanked regions in Latin America and the Caribbean. Current version: **1.5.16**. The backend API lives at `~/webs/qpweb` (Next.js 16).

## Common Commands

```bash
# Development
npm run android          # Run on Android (auto-syncs version first)
npm run ios              # Run on iOS (auto-syncs version first)
npm run ios:build        # Build iOS (iPhone 16 simulator, auto-syncs version)
npm run pods             # cd ios && pod install (required after native dep changes)
npm run start            # Start Metro bundler

# Quality
npm run lint             # Run ESLint (@react-native config)
npm run test             # Run Jest tests (react-native preset)
npx jest --testPathPattern="path/to/test"  # Run a single test file

# Release (Android)
npm run android:bundle      # Bundle release AAB
npm run android:apk         # Build release APK
npm run android:release     # Bundle + APK
npm run android:apk:release # Full release script (scripts/release-android.sh)

# Utilities
npm run version:sync     # Sync version across iOS/Android/app.json (auto-runs before ios/android)
```

**Node.js requirement**: >= 20. CocoaPods required for iOS. `npm run version:sync` reads `package.json` version and writes it across `ios/QvaPay.xcodeproj/project.pbxproj`, `android/app/build.gradle`, and `app.json` — all version bumps go through `package.json`.

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

`OneSignal.initialize(...)` is called at module scope **outside** the component tree.

### State Management (Context API)
- **AuthContext** (`/auth/AuthContext.js`): auth state, periodic token validation. State: `isAuthenticated`, `user`, `token`, `isLoading`, `error`. Functions: `login()` (handles 202 2FA + 200 success), `logout()`, `register()`, `confirmRegistration()`, `requestPin()`, `updateUser()`, `checkToken()`, `initializeAuth()`. Throttle: 60s lockout after 5 failed logins.
- **SettingsContext** (`/settings/SettingsContext.js`): app-wide settings (notifications, security, privacy, appearance, language, transactions, p2p, sounds). Granular AsyncStorage keys; supports import/export.
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
    Savings, StockDetail, PhoneTopupIndex/Purchase, GiftCards/Detail, MyPurchases/Detail,
    GoldCheck, Contacts, SettingsStack, Help
  Auth: Login, Register, RecoverPassword, Recover2FA
```

iOS-specific: `P2POffer` uses `unstable_headerRightItems` for liquid-glass compatibility (Android falls back to `headerRight`). `Pay` is presented as `transparentModal` with `slide_from_bottom`. `enableFreeze(true)` is called at top level.

### Deep Linking (`/linking.js`)
Prefixes: `https://qvapay.com`, `https://www.qvapay.com`, `qvapay://`. Routes:
- `/p2p/:p2p_uuid` → `P2POffer`
- `/pay/:uuid` → `Pay`
- `/home`, `/p2p` inside `MainStack`

If a deep link arrives while unauthenticated, the URL is stashed in `pendingDeepLinkRef`; after login `AppNavigator` consumes it via `navigation.reset(...)`.

### API Layer (`/api/`)
**Axios client** (`client.js`):
- Base URL from `/config.js`: dev `http://192.168.0.10:3000/api`, prod `https://api.qvapay.com`. Fallback constant: `https://api.qvpay.me` (not yet wired into retry logic).
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

**API modules** (13 total):
- `authApi.js`: login (with 2FA), register, confirmRegistration, requestPin, checkToken, logout, resetPassword, passkey register/verify
- `userApi.js`: searchUser, getUserProfile (`/user/extended`), updateUser, KYC, verifyPhone/Telegram, password, deletion, payment methods, contacts, referrals, gold, avatar
- `p2pApi.js`: index, show, create, cancel, markPaid, confirmReceived, getChat, sendChat, rateOffer, user profile
- `transferApi.js`: getLatestTransactions, getLatestSentTransfers, transferMoney (PIN), getTransactionDetails, getTransactionPDF
- `withdrawApi.js`: preWithdraw (request PIN), withdraw (PIN)
- `payApi.js`: merchant invoice viewing and payment (Pay screen)
- `savingApi.js`: deposits, withdrawals, balance, earnings, Roundup config
- `stocksApi.js`: stocks/watchlist data for Invest screen
- `storeApi.js`: phone packages, gift cards, purchases
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

### Key Directories
- `/screens/`: 40+ screens by domain — `home/`, `invest/` (Invest, Savings, StockDetail), `keypad/`, `p2p/` (P2P, P2PCreate, P2POffer, P2PUser), `transaction/` (incl. Pay), `store/` (Store, PhoneTopup*, GiftCards*, MyPurchases, PurchaseDetail), `settings/` (+ 17 subpanels), `add/`, `withdraw/`, `scan/`, `splash/`, `welcome/`, `onboard/`, `help/`
- `/ui/`: composite (BottomBar, BalanceCard, P2POfferItem, AmountInput, WatchlistCard, Sparkline, UpdatePromptModal, PushPromptModal, ContactsDisclosureModal, GlobalLoadingBar, ErrorBoundary, …)
- `/ui/particles/`: atomic (QPButton, QPInput, QPAvatar, QPBalance, QPCoin, QPTransaction, QPRate, QPPill, QPLoader, QPSwitch, QPMoneyInput, QPProduct, QPSectionHeader, SettingsItem, FaceIDIcon)
- `/auth/`: AuthContext + Login/Register/Recover screens
- `/api/`: 13 modules + `client.js`
- `/theme/`: ThemeContext + themeUtils
- `/settings/`: SettingsContext
- `/lock/`: AppLockContext + LockScreen
- `/loading/`: LoadingContext (bridged to axios for `GlobalLoadingBar`)
- `/hooks/`: `OnlineStatusContext`, `useDeviceContacts`, `usePushPrompt`, `useTransactionSSE` (real-time transaction stream via `react-native-sse`)
- `/helpers/`: `iap.js` (StoreKit/IAP), `inAppReview.js`, `playSound.js`, `versionCheck.js` (drives `UpdatePromptModal`), `widgetBridge.js` (iOS/Android home-screen widgets)
- `/helpers.js`: legacy utilities (timeAgo, parseQRData, dates — Spanish locale)
- `/assets/`: images, Rubik fonts, Lottie animations
- `/scripts/`: `release-android.sh`, `sync-version.js`

### Key Dependencies
React Native 0.83.1, React 19.2.4, React Navigation 7 (`native-stack` + `bottom-tabs`), Axios 1.14, `@shopify/flash-list` 2, AsyncStorage 2, `react-native-keychain` 10, `@d11/react-native-fast-image`, Lottie 7, Reanimated 4 + `react-native-worklets`, `react-native-nitro-modules`, Vision Camera 4 (QR), Linear Gradient, **sonner-native** (toasts), FontAwesome6, SVG, `react-native-onesignal` 5, `react-native-iap` 14, `react-native-passkey` 3, `react-native-sse` (SSE for transactions), `react-native-haptic-feedback`, `react-native-edge-to-edge`, `react-native-version-check`, `react-native-international-phone-number`, TypeScript 5.9.3 (~3% adoption).

OneSignal app ID is hardcoded in `App.tsx`: `8f69c017-b7e7-40b2-903b-11ce7ac5cc81`.

---

## Backend API Reference (`~/webs/qpweb`)

**Stack:** Next.js 16.0.10 | Prisma 6 + MySQL | Redis (ioredis) | Node >= 22
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

**Other**: POST `/withdraw`, POST `/topup`, GET/POST `/store/phone_package`, GET `/store/giftcards`, GET `/coins/v2`, POST `/saving/deposit`, POST `/saving/withdraw`, GET `/pay/{uuid}`, POST `/pay/{uuid}`

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
| User update  | PUT `/user/update`              | POST `/user/update`                  |
| Withdraw     | 2-step (preWithdraw + withdraw) | Single endpoint with PIN             |

**Working well:** P2P full lifecycle, transactions, transfer, coins, phone packages, user search, auth login with 2FA, passkeys, savings, pay invoices, SSE transaction stream.

## Development Notes

- `.jsx` ~97% / `.tsx` ~3% — TypeScript migration is early; `App.tsx` is one of the few `.tsx` files
- Functional components + hooks only (no class components beyond `ErrorBoundary`)
- UI strings hardcoded in Spanish (i18n on roadmap)
- Token lives in Keychain (`com.qvapay.auth`) — AsyncStorage is only used for non-secret settings
- API base URL switches on `__DEV__`; dev IP `192.168.0.10:3000` in `config.js` may need updating per machine
- Lists should use `@shopify/flash-list` — preferred over `FlatList` for new code
- Toasts use `sonner-native` (`import { toast } from 'sonner-native'`) — not `react-native-toast-message`
- Real-time transactions stream over SSE via `useTransactionSSE` (`react-native-sse`)
- iOS 26 liquid-glass headers: use `unstable_headerRightItems` for header items that need to play nicely with the native blur; provide an `headerRight` fallback for Android
- `enableFreeze(true)` is on — be aware that off-screen routes pause rendering
- Requests can pass `{ silent: true }` to suppress the global loading bar
