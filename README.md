# 💜 QvaPay Mobile App

![QvaPay App Preview](preview.jpg)

<p align="center">
  <img src="https://img.shields.io/badge/version-2.4.1-6759EF?style=for-the-badge" alt="Version 2.4.1" />
  <img src="https://img.shields.io/badge/React%20Native-0.84-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React Native 0.84" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/platforms-iOS%20%7C%20Android-0E0E1C?style=for-the-badge&logo=apple&logoColor=white" alt="iOS & Android" />
  <img src="https://img.shields.io/badge/i18n-ES%20%7C%20EN%20%7C%20PT--BR-7BFFB1?style=for-the-badge" alt="Multilanguage" />
</p>

**QvaPay** is a decentralized fintech platform that offers a non-custodial wallet, P2P marketplace, crypto payment gateway, and seamless integration with real-world financial services — all in one mobile app.

> 🌎 *"Building financial technologies that are free and accessible for everyone."*

## 🚀 About QvaPay

QvaPay enables individuals and businesses—especially in underbanked regions like Latin America and the Caribbean—to access the global financial system through crypto and digital balance infrastructure. With QvaPay, users can:

- 💵 Manage a digital USD balance (QUSD)
- ⚡ Send and receive remittances instantly
- 🤝 Trade via a decentralized P2P market with real-time chat
- 🏦 Deposit and withdraw via crypto, bank transfers, cards, or third-party rails
- 📈 Invest, save, and earn with an integrated savings account
- 📱 Purchase phone top-ups, gift cards, and shop on Amazon/eBay
- 🛠️ Access e-commerce and merchant tools via API

## 📲 About This App

This mobile application is the primary gateway to QvaPay. Built with **React Native 0.84** (New Architecture / Fabric) and **React 19**, it delivers a fast, native experience on both iOS and Android — with a persisted offline-first data layer, three languages, and native goodies like widgets, passkeys, and liquid-glass headers on iOS 26.

### ✨ Core Features

#### 💰 Money
- Non-custodial crypto wallet with multi-coin support (40+ networks and fiat rails)
- USD-equivalent digital balance (QUSD) + **spendable satoshis** (Lightning withdrawals, store discounts, bolt11 scanning)
- **Card deposits** with a native payment sheet
- Instant transfers with PIN/TOTP confirmation and **idempotency keys** on every money operation (safe retries, no double-spends)
- Merchant invoice payments (Pay screen, deep-linkable)
- Transaction history with real-time **SSE streaming**, filters, and PDF receipt downloads

#### 🤝 P2P Marketplace
- Full lifecycle: create, apply, chat, pay, confirm, rate — Binance/OKX-style trade room
- **Real-time chat over SSE** with stickers, images, and online presence
- Client-side filters, 24h-average rate coloring, and a single-field "I want to trade $X" flow
- Offer editing, KYC/VIP gating, and rankings

#### 📈 Invest & Savings
- Invest dashboard with stocks, watchlist, and crypto detail screens
- Interactive **price charts** (victory-native) with GOLD-exclusive scrubbing readout
- Savings account with **Roundup** (spare-change auto-deposits) and earnings dashboard

#### 🛍️ Store
- Phone top-ups (Cuba + international) and gift cards by country/category
- **In-app purchase top-ups** billed through App Store / Google Play (consumable IAP)
- **Personal Shopper**: assisted shopping on Amazon & eBay with cart, tax quotes, and US shipping
- **Seller Shops** marketplace with local cart and idempotent checkout

#### 🔐 Security & Identity
- **Passkey login** (WebAuthn), biometric auth (Face ID / fingerprint), 2FA (PIN + TOTP)
- **KYC verification** with a hosted flow and in-app status tracking
- App lock with PIN gate, Keychain-only token storage, leaked-password warnings
- Failed-login throttling and rate limiting on all sensitive endpoints

#### 🎨 Experience
- 🌍 **Full internationalization**: Spanish, English, and Portuguese (pt-BR), ~1,900 keys per language, auto device-language detection
- ⚡ **Offline-first**: React Query persisted cache — screens paint instantly from disk and revalidate in the background
- 🌗 Light/dark theme with system auto-detection and themed native navigation
- 🧿 **Aurora loading veil** — a custom Skia SkSL shader instead of a boring spinner
- 🏅 **GOLD perks**: custom app icons (8 themed variants), chart scrubbing, emoji names
- 📱 Home-screen widgets (balance, P2P offers, crypto rates) on iOS + Android
- 🔔 Push notifications (OneSignal) with in-app toasts and deep navigation
- 📳 Haptics, edge-to-edge display, squircle design language, Rubik typography
- 🔗 Deep linking (`qvapay://`, universal links) with post-login redemption and Android install referrer attribution

## 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| ⚛️ Framework | React Native 0.84.1 (Fabric) + React 19.2.3 |
| 🔤 Language | **TypeScript 6** — the entire app is `.ts`/`.tsx` (only `index.js` stays JS) |
| 🧭 Navigation | React Navigation 7 (native stack + bottom tabs, iOS 26 liquid-glass ready) |
| 🗄️ Server state | **TanStack Query 5** + AsyncStorage persister (24h offline cache, versioned buster) |
| 🎛️ App state | Context API (Auth, Settings, Theme, AppLock, OnlineStatus, Loading) |
| 🌍 i18n | i18next 26 + react-i18next (es / en / pt-BR, synchronous singleton) |
| 🌐 Networking | Axios 1.16 with interceptors + SSE (`react-native-sse`) for real-time streams |
| 📜 Lists | FlashList 2 (Shopify) |
| 🎬 Animations | Reanimated 4 + Worklets, custom `QPPressable` press system |
| 🖌️ Graphics | Skia 2 (SkSL aurora shader) + victory-native 41 (charts) + Lottie 7 |
| 📷 Camera | Vision Camera 5 + barcode scanner (QR / bolt11) |
| 🔐 Storage | Keychain (tokens, biometrics, app-lock PIN) + AsyncStorage (settings & cache) |
| 💳 Payments | Native payment sheet + react-native-iap 15 (StoreKit / Play Billing) |
| 🪪 Auth | Bearer tokens + Passkeys (WebAuthn) + biometrics + TOTP |
| 🔔 Notifications | OneSignal 5 |
| 🍞 Toasts | sonner-native |
| 🧪 Testing | Jest 30, ~900+ tests, node-env harness with real React Query clients |
| 🖥️ Backend | Next.js 16 API + Prisma 6 + MySQL + Redis (100+ endpoints) |

## 🏗️ Architecture Overview

The app follows a modular architecture: **all server reads live in React Query** (domain query modules co-located with their screens), contexts hold UI/app state, and money mutations stay as direct, idempotent API calls.

```
GestureHandlerRootView
 └─ ErrorBoundary
     └─ PersistQueryClientProvider      ← offline cache, outside Auth (logout clears it)
         └─ SafeAreaProvider
             └─ LoadingProvider → AuthProvider → OnlineStatusProvider
                 └─ SettingsProvider → LanguageSync → ThemeProvider
                     └─ AppLockProvider
                         └─ NavigationContainer (deep linking + dynamic theme)
```

- 🗂️ **40+ screens** organized by domain (home, invest, keypad, p2p, store, transactions, settings)
- 🔌 **15 API modules** with a consistent `{ success, data, error, status }` contract, unwrapped into React Query with smart retry policies (429-aware, exponential backoff)
- ⚛️ **Atomic UI system**: particles (`QPButton`, `QPInput`, `QPCoin`, `QPCodeInput`…) compose into larger components (`BalanceCard`, `P2POfferItem`, `QPCoinPicker`…)
- 🔁 Hierarchical query keys (`['home']`, `['p2p']`, `['savings']`…) — one invalidation refreshes a whole domain across every screen that shares it
- 🔒 Bearer tokens in Keychain with automatic 403 cleanup; deep links stashed and redeemed after login

## 🏁 Getting Started

**Requirements:** Node.js >= 22.11, npm, Xcode (iOS) or Android Studio (Android), CocoaPods

```bash
git clone https://github.com/qvapay/mobile-app.git
cd mobile-app
npm install
npm run pods          # iOS only — install CocoaPods
npm run ios           # Run on iOS simulator
npm run android       # Run on Android emulator
```

> ℹ️ The app version lives in **`app.json`** (`version` + `versionCode`) and is synced everywhere else automatically by `npm run version:sync` (runs before every ios/android build).

### 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Start Metro bundler |
| `npm run ios` / `npm run android` | Run on simulator/emulator (auto-syncs version) |
| `npm run ios:device` | Run on a physical iPhone |
| `npm run pods` | Install CocoaPods |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check the whole app (`tsc --noEmit`) |
| `npm run test` | Run Jest tests (~900+) |
| `npm run i18n:check` | Validate translation key parity + placeholders + plurals |
| `npm run i18n:usage` | Verify every `t('...')` key exists in the bundles |
| `npm run doctor` | react-doctor diagnostics (also runs in CI) |
| `npm run android:release` | Build release AAB + APK |
| `npm run android:publish` | Publish bundle to Play Store tracks |
| `npm run version:sync` | Sync version from app.json across iOS/Android |

## 🗺️ Roadmap

### ✅ Completed

- [x] **Full TypeScript migration** — every screen, hook, context and API module is typed
- [x] **React Query data layer** — offline-first persisted cache, instant cold starts
- [x] **Multi-language support (ES/EN/PT-BR)** — full i18next sweep, ~1,900 keys per language
- [x] **Lightning / spendable satoshis** — LN withdrawals, sats discounts, bolt11 scanning
- [x] **Card deposits** (native payment sheet)
- [x] **In-app purchase top-ups** (StoreKit / Play Billing consumables)
- [x] **Personal Shopper** — assisted Amazon/eBay shopping with checkout
- [x] **Seller Shops marketplace** with idempotent checkout
- [x] **KYC flow** — register wizard step, status screen, smart home nudges
- [x] **Idempotency keys** on all money operations (transfer, withdraw, P2P create)
- [x] **Price charts** with GOLD scrubbing (victory-native)
- [x] **Custom app icons for GOLD users** (8 themed variants)
- [x] **P2P trade room redesign** (Binance/OKX-style) + SSE chat with stickers
- [x] **Aurora Skia loading veil** (custom SkSL shader)
- [x] **Company/Enterprise registration** from Settings
- [x] Passkey authentication (WebAuthn), biometric login, 2FA
- [x] P2P marketplace full lifecycle with client-side filters and rate coloring
- [x] Savings account with Roundup + Invest dashboard with watchlist
- [x] Home-screen widgets, push notifications, PDF receipts
- [x] Phone top-ups and gift cards (unified catalogs)
- [x] Deep linking (P2P offers, payments, shops) + Android install referrer attribution
- [x] FlashList migration, haptics, edge-to-edge, light/dark theme, privacy mode
- [x] R8 shrinking on Android release builds
- [x] ~900+ Jest tests with React Query harnesses

### 🔨 In Progress

- [ ] Backend error prose localization (server responses still Spanish-only)
- [ ] Nearby Pay — proximity payments radar (phase 1: iOS Multipeer ✅, phase 2: BLE)

### 🔮 Planned

- [ ] Spot exchange in Coin Detail (pending backend)
- [ ] P2P dispute resolution flow (revision status)
- [ ] In-app support chat with ticket system
- [ ] Merchant dashboard (invoice creation, payment links)
- [ ] Accessibility improvements (VoiceOver, TalkBack)
- [ ] End-to-end encryption for P2P chat messages

## 🤝 Contributions

We welcome contributions! Please open an issue or submit a pull request.

**New code must be written in TypeScript.** The app is fully migrated — every screen, hook, context
and API module is `.ts`/`.tsx`, and the only remaining `.js` file is `index.js`, the entry point React
Native requires under that name. Pull requests that add or rename files back to plain `.js`/`.jsx`
won't be merged. Test files stay `.test.js` on purpose.

When you touch a module, keep it typed end to end: give new endpoints a real return type in its `api/`
module, declare payload entities in `types/domain.ts`, and register new screens in the
`RootStackParamList` of `types/navigation.ts`. Babel strips types without checking them, so
`npm run typecheck` is what actually guards the migration — it runs in CI on every pull request.

Before opening a PR, make sure the following pass:

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test        # Jest
npm run i18n:check  # translation key parity (if you touched any copy)
```

New user-facing copy is never a literal string: it's born as a key in `i18n/locales/` for **all three
languages** (es / en / pt-BR), following `i18n/CONVENTIONS.md`.

Branch from `main`, and rebase rather than merge if `main` moves under you — it keeps the diff to what
you actually changed.

## 🛡️ Security & Compliance

QvaPay complies with applicable regulations including:

- AML / KYC procedures for user onboarding
- Integration with OFAC sanctions list
- US FinCEN registered MSB (via partners)
- Ongoing work toward EU licensing under e-Residency
- Rate limiting on all sensitive endpoints (auth, transfers, withdrawals)
- Idempotent money operations — network retries can never double-charge

## 🌐 Social & Support

- 🏠 Website: [https://www.qvapay.com](https://www.qvapay.com)
- ✍️ Blog: [https://qvapay.blog](https://qvapay.blog)
- 💬 Telegram: [https://t.me/qvapay](https://t.me/qvapay)
- 🐦 Twitter/X: [@QvaPay](https://x.com/QvaPay)

---

<p align="center">Made with 💜 by <b>QvaPay Technologies</b>. All rights reserved.</p>
