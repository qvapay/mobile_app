# 💜 QvaPay Mobile App

![QvaPay App Preview](preview.jpg)

<p align="center">
  <img src="https://img.shields.io/badge/version-3.2.0-6759EF?style=for-the-badge" alt="Version 3.2.0" />
  <img src="https://img.shields.io/badge/React%20Native-0.84-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React Native 0.84" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 6" />
  <img src="https://img.shields.io/badge/platforms-iOS%20%7C%20Android-0E0E1C?style=for-the-badge&logo=apple&logoColor=white" alt="iOS & Android" />
  <img src="https://img.shields.io/badge/i18n-ES%20%7C%20EN%20%7C%20PT--BR-7BFFB1?style=for-the-badge" alt="Multilanguage" />
</p>

<p align="center">
  <a href="#-features">Features</a> ·
  <a href="#-self-custody-wallet">Wallet</a> ·
  <a href="#-tech-stack">Tech stack</a> ·
  <a href="#-getting-started">Getting started</a> ·
  <a href="#-testing">Testing</a> ·
  <a href="#-roadmap">Roadmap</a>
</p>

**QvaPay** is the financial app of the Caribbean and Latin America. It combines a digital USD balance, a **self-custody multi-chain wallet**, a P2P marketplace, savings, and real-world services such as top-ups, gift cards, and assisted shopping in one app.

> 🌎 *"Building financial technologies that are free and accessible for everyone."*

## 🧭 At a Glance

| | | |
|---|---|---|
| 💵 **Digital USD balance**<br/>Instant transfers, remittances and merchant payments | 🔑 **Self-custody wallet**<br/>8 blockchains, your keys stay on your phone, **no account needed** | 🔄 **Swaps**<br/>Crypto ↔ crypto and balance ↔ QUSD, tracked end to end |
| 🤝 **P2P marketplace**<br/>Trade room with real-time chat | 📈 **Savings & markets**<br/>Savings with Roundup, crypto & stock charts | 🛍️ **Store**<br/>Top-ups, gift cards, Personal Shopper, Seller Shops |

## ✨ Features

### 💰 Money
- USD-equivalent digital balance (QUSD) plus **spendable satoshis**: Lightning withdrawals, store discounts and bolt11 scanning
- **Card deposits** through a native payment sheet, with the balance credited in real time
- Instant transfers confirmed with a PIN or TOTP, protected by **idempotency keys** on every money operation so a retry can never charge twice
- Merchant invoice payments on the Pay screen, reachable by deep link
- Transaction history with real-time **SSE streaming**, filters and PDF receipts

### 🔑 Self-Custody Wallet
Lives in the **Crypto** tab. It is non-custodial, meaning QvaPay never sees your recovery phrase and cannot move your funds.

- **Use it without a QvaPay account.** From the welcome screen, tap *"I just want a wallet"* to create or import one. With a wallet on the phone and no session, the app opens straight into the wallet. Creating an account later keeps the same wallet.
- **8 networks**: Ethereum, BNB Chain, Polygon, Base, TRON, Bitcoin, Stacks and Solana. It holds native coins plus USDT, USDC and QUSD, and you can show or hide assets and set their order.
- **12-word recovery phrase** generated on the device, with a mandatory 4-question backup quiz before you can receive funds.
- **Signing gated by the app-lock PIN or biometrics**. The phrase can only be revealed after verifying your identity, and screenshots are blocked while it is visible.
- **Send and receive** on every chain. Each transaction is re-parsed and verified before it is signed, and a confirmation screen shows the real network fee.
- **Crypto ↔ crypto swaps** through aggregated providers, plus **balance ↔ QUSD** swaps, with live status tracking and history.
- **TRON energy rental**, paid from your QvaPay balance, so a USDT transfer does not burn TRX. The app only offers the rental when it actually unblocks the send or saves money.
- **Sponsored sends on Solana** for GOLD members: QvaPay pays the fee, so no SOL is needed.
- **Your own RPC nodes**: health- and latency-aware routing with a circuit breaker, and per-chain custom nodes that are tested before they are saved.
- On-chain **activity history** with dust filtering and explorer links (requires an account).

### 🤝 P2P Marketplace
- Full lifecycle: create, apply, chat, pay, confirm and rate, in a trade room with a step-by-step progress bar
- **Real-time chat over SSE** with stickers, images and online presence
- Smart filters, best-rate sorting, 24h-average rate coloring and a single "I want to trade $X" field
- Offer editing, KYC and VIP gating, and rankings

### 📈 Savings & Markets
- Crypto dashboard with coins, stocks, watchlist and coin detail screens
- Interactive **price charts** with a touch-to-scrub readout for GOLD members
- Savings account with **Roundup** (automatic spare-change deposits) and an earnings dashboard

### 🛍️ Store
- Phone top-ups (Cuba and international) and gift cards by country and category
- **In-app purchase top-ups** billed through the App Store or Google Play
- **Personal Shopper**: assisted shopping on Amazon and eBay with cart, tax quotes and US shipping
- **Seller Shops** marketplace with idempotent checkout

### 🔐 Security & Identity
- **Passkey login** (WebAuthn), Face ID / fingerprint and 2FA (PIN + TOTP)
- **KYC verification** with an embedded native flow, a status screen and gentle home nudges
- **App lock** with a PIN and its own biometric marker. It protects your session *or* your wallet, so wallet-only users get it too.
- Tokens and secrets stored only in the Keychain, plus leaked-password warnings, failed-login throttling and rate limiting on every sensitive endpoint

### 🎨 Experience
- 🌍 **Spanish, English and Portuguese (pt-BR)** with about 2,400 keys per language. The app follows the device language or a manual choice.
- ⚡ **Offline-first**: a persisted React Query cache makes every screen paint instantly from disk and then refresh in the background
- 🌗 Light and dark themes, including themed native navigation and **liquid-glass headers on iOS 26**
- 🔢 Rolling-digit balance counters and a custom **Skia aurora** loading veil
- 🏅 **GOLD perks**: 8 alternative app icons, chart scrubbing, emoji names and sponsored Solana fees
- 📱 Home-screen widgets on iOS and Android, push notifications with in-app toasts, and **Nearby Pay** for proximity payments (iOS)
- 🔗 Deep links (`qvapay://` and universal links) that are redeemed after login, plus Android install-referrer attribution

## 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| ⚛️ Framework | React Native 0.84.1 (New Architecture / Fabric) + React 19.2.3 |
| 🔤 Language | **TypeScript 6**. The whole app is `.ts`/`.tsx`; only `index.js` stays JS |
| 🧭 Navigation | React Navigation 7 (native stack + bottom tabs, iOS 26 liquid-glass ready) |
| 🗄️ Server state | **TanStack Query 5** + AsyncStorage persister (24h offline cache, version-busted) |
| 🎛️ App state | Context API (Auth, Settings, Theme, Wallet, AppLock, OnlineStatus, Loading) |
| 🔑 Wallet crypto | viem, `@scure/bip39` / `bip32` / `btc-signer`, `@noble/curves`, `@stacks/transactions`, `react-native-quick-crypto`; in-house Solana codec and SLIP-0010 derivation, verified against golden vectors |
| 🌍 i18n | i18next 26 + react-i18next (es / en / pt-BR, synchronous singleton) |
| 🌐 Networking | Axios 1.16 with interceptors + SSE (`react-native-sse`) for real-time streams |
| 📜 Lists | FlashList 2 |
| 🎬 Animations | Reanimated 4 + Worklets, custom `QPPressable` press system, number-flow counters |
| 🖌️ Graphics | Skia 2 (SkSL aurora shader) + victory-native 41 (charts) + Lottie 7 |
| 📷 Camera | Vision Camera 5 + barcode scanner (QR / bolt11 / addresses) |
| 🔐 Storage | Keychain (token, wallet seed, app-lock PIN, biometric markers) + AsyncStorage (settings and cache) |
| 💳 Payments | Native payment sheet + react-native-iap 15 (StoreKit / Play Billing) |
| 🔔 Notifications | OneSignal 5 + sonner-native toasts |
| 🧪 Testing | Jest 30 (2,280+ tests) + **Maestro** end-to-end flows |
| 🖥️ Backend | Next.js 16 API + Prisma 6 + MySQL + Redis |

## 🏗️ Architecture

**Every server read lives in React Query**, with query modules placed next to the screens that use them. Contexts hold UI and app state, and money mutations stay as direct, idempotent API calls. The wallet signs locally and talks to the blockchains through its own RPC router; the backend is only needed for account features.

```
GestureHandlerRootView
 └─ ErrorBoundary
     └─ PersistQueryClientProvider      ← offline cache, outside Auth (logout clears it)
         └─ SafeAreaProvider → LoadingProvider → AuthProvider → OnlineStatusProvider
             └─ SettingsProvider → LanguageSync → ThemeProvider
                 └─ WalletProvider           ← seed in Keychain, RPC router for the session
                     └─ AppLockProvider      ← locks the session OR the wallet
                         └─ NavigationContainer (deep links + dynamic theme)
                             Onboard · Welcome · WalletOnly · MainStack (Home | Crypto | Send | P2P | Store)
```

- 🗂️ **140+ screens and panels** organized by domain: home, crypto/wallet, keypad, p2p, store, transactions, settings, and more
- 🔌 **22 API modules** sharing one `{ success, data, error, status }` contract. Responses are unwrapped into React Query with retry policies that respect `429` responses and back off exponentially.
- ⚛️ **Atomic UI system**: particles such as `QPButton`, `QPCodeInput` and `QPAssetIcon` compose into components such as `BalanceHero`, `P2POfferItem` and `QPCoinPicker`
- 🔁 Hierarchical query keys (`['home']`, `['p2p']`, `['wallet']`…), so a single invalidation refreshes a whole domain on every screen that uses it
- 🧩 The wallet core under `wallet/` is **pure TypeScript** (no React Native imports) and is tested in Node. Only the keystore and the RPC-router singleton touch native modules.

## 🏁 Getting Started

**Requirements:** Node.js >= 22.11, Xcode with CocoaPods (iOS), Android Studio (Android), Ruby 3.3 (see `.ruby-version`).

```bash
git clone https://github.com/qvapay/mobile_app.git
cd mobile_app
npm install
npm run pods          # iOS only; re-run after every npm install
npm run ios           # iOS simulator
npm run android       # Android emulator
```

> ℹ️ The app version lives in **`app.json`** (`version` + `versionCode`). `npm run version:sync` copies it to iOS and `package.json`, and runs automatically before every iOS or Android build.

### 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Start the Metro bundler |
| `npm run ios` / `npm run android` | Run on a simulator or emulator (syncs the version first) |
| `npm run ios:device` | Run on a physical iPhone |
| `npm run pods` | Install CocoaPods |
| `npm run lint` | ESLint |
| `npm run typecheck` | Type-check the whole app (`tsc --noEmit`) |
| `npm run test` | Jest unit and integration tests |
| `npm run e2e:wallet` | Maestro end-to-end flows for the wallet without an account |
| `npm run i18n:check` | Translation key parity, placeholders and plurals |
| `npm run i18n:usage` | Check that every `t('...')` key exists |
| `npm run doctor` | react-doctor diagnostics (also runs in CI) |
| `npm run android:release` | Build a release AAB + APK |
| `npm run android:publish` | Publish the bundle to Google Play tracks |

## 🧪 Testing

- **Unit and integration:** 2,280+ Jest tests across 190+ suites. Pure logic (wallet derivation, transaction building, swap routing, energy decisions) runs in a Node environment, and hooks are tested with real React Query clients.
- **End-to-end:** [Maestro](https://maestro.mobile.dev) flows in `.maestro/` cover the whole no-account wallet experience: create with a backup quiz, import, receive, security, cold-start lock, delete, and resuming a half-finished backup. See [`.maestro/README.md`](.maestro/README.md).
- **CI:** lint, typecheck, Jest and react-doctor run on every pull request.

## 🗺️ Roadmap

### ✅ Recently shipped

- [x] **Self-custody multi-chain wallet**: 8 networks, send and receive, backup quiz, custom RPC nodes
- [x] **Wallet without an account**, launched straight from the welcome screen
- [x] **Crypto ↔ crypto swaps** and **balance ↔ QUSD** swaps with tracking and history
- [x] **TRON energy rental** paid from the QvaPay balance
- [x] **Sponsored Solana sends** for GOLD members
- [x] **Redesigned lock screen** that protects the session or the wallet
- [x] **Maestro end-to-end suite** for the wallet
- [x] Full **TypeScript** migration and a **React Query** offline-first data layer
- [x] **ES / EN / PT-BR** internationalization
- [x] Lightning / spendable satoshis, card deposits, in-app purchase top-ups
- [x] Personal Shopper (Amazon / eBay) and the Seller Shops marketplace
- [x] Native KYC flow, idempotency keys on every money operation, passkeys
- [x] P2P trade room with SSE chat, price charts, GOLD app icons, home-screen widgets

### 🔨 In progress

- [ ] Nearby Pay phase 2 (BLE, Android)
- [ ] Localized backend error messages (server responses are still Spanish only)
- [ ] Accessibility pass on modals and custom controls (VoiceOver / TalkBack)

### 🔮 Planned

- [ ] Spot exchange in Coin Detail
- [ ] P2P dispute resolution flow
- [ ] In-app support chat with tickets
- [ ] Merchant dashboard (invoices and payment links)
- [ ] End-to-end encryption for P2P chat

## 🤝 Contributing

We welcome contributions! Please open an issue or submit a pull request.

**New code must be TypeScript.** Every screen, hook, context and API module is `.ts`/`.tsx`; the only `.js` file left is `index.js`, the entry point React Native requires under that name. Test files stay `.test.js` on purpose.

Keep modules typed end to end:
- Give new endpoints a real return type in their `api/` module.
- Declare payload entities in `types/domain.ts`.
- Register new screens in `RootStackParamList` in `types/navigation.ts`.

Babel strips types without checking them, so `npm run typecheck` (run in CI) is what actually enforces them.

New user-facing copy is never a literal string. Add it as a key in `i18n/locales/` in **all three languages** (es / en / pt-BR), following `i18n/CONVENTIONS.md`. Give interactive elements a stable `testID` so end-to-end flows don't depend on the language.

Before opening a PR, run:

```bash
npm run lint && npm run typecheck && npm run test
npm run i18n:check   # if you touched any copy
```

Branch from `main`, and rebase rather than merge if `main` moves under you.

## 🛡️ Security & Compliance

- AML / KYC procedures for onboarding and OFAC sanctions screening
- US FinCEN-registered MSB (through partners); ongoing work toward EU licensing
- Wallet keys never leave the device. QvaPay cannot see or move self-custody funds.
- Rate limiting on every sensitive endpoint, and idempotent money operations so a network retry can never charge twice

## 🌐 Social & Support

- 🏠 Website: [www.qvapay.com](https://www.qvapay.com)
- ✍️ Blog: [qvapay.blog](https://qvapay.blog)
- 💬 Telegram: [t.me/qvapay](https://t.me/qvapay)
- 🐦 Twitter/X: [@QvaPay](https://x.com/QvaPay)

---

<p align="center">Made with 💜 by <b>QvaPay Technologies</b>. All rights reserved.</p>
