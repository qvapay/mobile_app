# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QvaPay is a React Native mobile fintech app (v0.83.1, React 19.2.4) providing a non-custodial wallet, P2P marketplace, and crypto payment gateway for underbanked regions in Latin America and the Caribbean. The backend API lives at `~/webs/qpweb` (Next.js 16).

## Common Commands

```bash
# Development
npm run android          # Run on Android
npm run ios              # Run on iOS
npm run ios:build        # Build iOS (iPhone 16 simulator)
npm run pods             # Install CocoaPods (required for iOS)
npm run start            # Start Metro bundler

# Quality
npm run lint             # Run ESLint
npm run test             # Run Jest tests
```

**Node.js requirement**: >= 20

## Architecture

### State Management (Context API)
- **AuthContext** (`/auth/AuthContext.js`): Authentication state, token in AsyncStorage (keychain commented out), 30s validation checks
  - State: `isAuthenticated`, `user`, `token`, `isLoading`, `error`
  - Functions: `login()` (handles 202 2FA + 200 success), `logout()`, `register()`, `confirmRegistration()`, `requestPin()`, `updateUser()`, `checkToken()`, `initializeAuth()`
  - Failed login throttle: 60s lockout after 5+ failures
- **SettingsContext** (`/settings/SettingsContext.js`): App-wide settings (notifications, security, privacy, appearance, language, transactions, p2p, sounds). Supports import/export. Granular AsyncStorage keys.
- **ThemeContext** (`/theme/ThemeContext.js`): Light/dark/auto theme with memoized styles (`useTextStyles()`, `useContainerStyles()`). Listens to system appearance.

Provider hierarchy in `App.tsx`:
```
ThemeProvider > SettingsProvider > AuthProvider > NavigationContainer
```

### Navigation (React Navigation v7)
Routes defined in `/routes.js` (40+ named routes). Structure:
```
AppNavigator (Stack)
  Onboard (first-time)
  Welcome (unauthenticated)
  MainStack (authenticated) -> Bottom Tabs
    Home | Invest | Keypad | P2P | Store
  Feature screens: Add, Withdraw, P2PCreate, P2POffer,
    Send/SendConfirm/SendSuccess, Receive, Transaction(s),
    Scan, PhoneTopup, SettingsStack, Help
  Auth: Login, Register, RecoverPassword, Recover2FA
```

### API Layer (`/api/`)
Axios client (`client.js`) with:
- Base URL: `http://192.168.0.114:3000/api` (dev hardcoded) / `https://api.qvapay.com` (prod, commented out)
- Timeout: 20s. Headers: `X-QvaPay-Client`, `User-Agent`, version, platform, build
- Request interceptor: Bearer token from AsyncStorage
- Response interceptor: 401/403 clears token, Spanish error messages
- All modules return `{ success, data, error?, status? }`

**API Modules:**
- `authApi.js`: login (with 2FA), register, confirmRegistration, requestPin, checkToken, logout, resetPassword
- `userApi.js`: searchUser, getUserProfile (`/user/extended`), updateUser, KYC (submitInfo, uploadPicture, getStatus), verifyPhone, removePhone, telegram/2FA, password, deletion, payment methods, contacts, referrals, gold
- `p2pApi.js`: index (filters: type, coin, amount, ratio, KYC/VIP), show, create, cancel, markPaid, confirmReceived, getChat, sendChat, rateOffer
- `transferApi.js`: getLatestTransactions, getLatestSentTransfers, transferMoney (with PIN), getTransactionDetails, getTransactionPDF
- `withdrawApi.js`: preWithdraw (request PIN), withdraw (with PIN)
- `storeApi.js`: phonePackages, purchasePhonePackage
- `coinsApi.js`: index (enabled_in/enabled_out filters)
- `blogApi.js`: WordPress REST API via native fetch (not axios)

### Theme System
```javascript
const { theme } = useTheme()
const textStyles = createTextStyles(theme)
const containerStyles = createContainerStyles(theme)
```

Colors: primary `#6759EF`, success `#7BFFB1`, danger `#DB253E`, warning `#ff9f43`, gold `#FFD700`
Dark (default): bg `#0E0E1C`, surface `#1E2039` | Font: Rubik family

### Key Directories
- `/screens/`: 38 screens by domain (home, p2p, store, transaction, settings)
- `/ui/`: Composite (BottomBar, BalanceCard, P2POfferItem, AmountInput)
- `/ui/particles/`: Atomic (QPButton, QPInput, QPAvatar, QPBalance, QPCoin, QPTransaction, QPRate, QPPill, QPLoader, QPSwitch, SettingsItem)
- `/auth/`: AuthContext + screens (Login, Register, RecoverPassword, Recover2FA)
- `/api/`: 8 modules + client
- `/theme/`: ThemeContext + themeUtils
- `/settings/`: SettingsContext
- `/helpers.js`: Utilities (timeAgo, parseQRData, dates) - Spanish locale
- `/assets/`: Images, fonts, Lottie animations

### Key Dependencies
React Native 0.83.1, React 19.2.4, React Navigation 7, Axios 1.13.4, AsyncStorage, FastImage, Lottie, Reanimated 4, Vision Camera (QR), Linear Gradient, Toast Message, FontAwesome6, SVG, TypeScript 5.9.3 (partial ~3%)

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

**Auth** (`/api/auth/`): login, register, confirm-registration, check, request-pin, reset-password, logout (POST), create-2fa, reset-2fa, sessions

**User** (`/api/user/`): GET `/user` (profile + 3 txns), GET `/user/extended`, POST `/user/update`, POST `/user/update/password`, POST `/user/update/username`, GET/POST `/user/search`, POST `/user/kyc`, GET `/user/referrals`, GET/POST `/user/gold`, GET/POST/DELETE `/user/payment-methods`, POST `/user/contact`, POST `/user/verify/phone`, POST `/user/verify/telegram`, POST `/user/avatar`

**P2P** (`/api/p2p/`): GET `/p2p/index`, POST `/p2p/create`, GET `/p2p/{uuid}`, POST `/p2p/{uuid}/apply`, GET/POST `/p2p/{uuid}/chat`, POST `/p2p/{uuid}/paid`, POST `/p2p/{uuid}/received`, POST `/p2p/{uuid}/rate`, POST `/p2p/{uuid}/cancel`, GET `/p2p/average(s)`, GET `/p2p/ranking`, GET `/p2p/stats`

**Transactions** (`/api/transaction/`): GET `/transaction`, POST `/transaction/transfer` (amount, to, pin, description), GET `/transaction/{uuid}`, GET `/transaction/{uuid}/pdf`, GET `/transaction/latestusers`

**Other**: POST `/withdraw`, POST `/topup`, GET/POST `/store/phone_package`, GET `/coins/v2`, POST `/saving/deposit`, POST `/saving/withdraw`

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
`open` -> `processing` (peer applied) -> `paid` (buyer marked) -> `completed` (seller confirmed + rated) | `cancelled` or `revision` (dispute)

---

## Known Mobile-API Mismatches

| Issue | Mobile | Backend |
|-------|--------|---------|
| KYC path | `/user/kyc2/*` | `/user/kyc` |
| Logout | GET `/auth/logout` | POST `/auth/logout` |
| 2FA | reuses `/user/update/password` | `/auth/create-2fa`, `/auth/reset-2fa` |
| User update | PUT `/user/update` | POST `/user/update` |
| Withdraw | 2-step (preWithdraw + withdraw) | Single endpoint with PIN |

**Working well:** P2P full lifecycle, transactions, transfer, coins, phone packages, user search, auth login with 2FA

## Development Notes

- ~91 source files, ~10-12K LOC
- `.jsx` (97%) / `.tsx` (3%) - TypeScript migration early stage
- UI strings hardcoded in Spanish (i18n on roadmap)
- Functional components + hooks only (no class components)
- Cache-first strategy in P2POffer (AsyncStorage + API fetch)
- API base URL hardcoded to dev IP (needs env config)
- Token in AsyncStorage (react-native-keychain available but commented out)
