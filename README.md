# QvaPay Mobile App

**QvaPay** is a decentralized fintech platform that offers a non-custodial wallet, P2P marketplace, crypto payment gateway, and seamless integration with real-world financial services — all in one mobile app.

> "Building financial technologies that are free and accessible for everyone."

## About QvaPay

QvaPay enables individuals and businesses—especially in underbanked regions like Latin America and the Caribbean—to access the global financial system through crypto and digital balance infrastructure. With QvaPay, users can:

- Manage a digital USD balance
- Send and receive remittances instantly
- Trade via a decentralized P2P market
- Deposit and withdraw via crypto, bank transfers, or third-party rails
- Purchase phone top-ups and gift cards
- Access e-commerce and merchant tools via API

## About This App

This mobile application is the primary gateway to QvaPay. Built with **React Native 0.83** and **React 19**, it delivers a fast, native experience on both iOS and Android.

### Core Features

- Custodial crypto wallet with multi-coin support
- USD-equivalent digital balance (QUSD)
- P2P marketplace with real-time chat, ratings, and editable offers
- Deposits and withdrawals via 40+ crypto networks and fiat rails
- KYC verification, 2FA (PIN + TOTP), and biometric authentication
- Transaction history with PDF receipt downloads
- Phone top-ups and gift card purchases
- Push notifications for payments and P2P activity
- Contact list with quick-send shortcuts
- Light and dark theme with system auto-detection

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.83.1 + React 19.2.4 |
| Navigation | React Navigation 7 (native stack + bottom tabs) |
| State | Context API (Auth, Settings, Theme) |
| Networking | Axios 1.13 with interceptors |
| Lists | FlashList (Shopify) |
| Animations | Reanimated 4 |
| Camera | Vision Camera (QR scanning) |
| Storage | AsyncStorage |
| Backend | Next.js API + Prisma + MySQL + Redis |

## Architecture Overview

The app follows a modular architecture with Context-based state management and an API-first approach:

```
ThemeProvider > SettingsProvider > AuthProvider > NavigationContainer
```

- **40+ screens** organized by domain (home, p2p, transactions, settings, store)
- **8 API modules** with consistent `{ success, data, error }` response pattern
- **Atomic UI system**: particles (QPButton, QPInput, QPAvatar, QPCoin) compose into larger components (BalanceCard, P2POfferItem, ActionButtons)
- Bearer token auth with automatic 401/403 handling and session refresh

> Authentication tokens are stored on-device and validated periodically. Failed login throttling locks accounts after 5 attempts for 60 seconds.

## Getting Started

**Requirements:** Node.js >= 20, npm, Xcode (iOS) or Android Studio (Android)

```bash
git clone https://github.com/qvapay/mobile-app.git
cd mobile-app
npm install
npm run pods          # iOS only — install CocoaPods
npm run ios           # Run on iOS simulator
npm run android       # Run on Android emulator
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Start Metro bundler |
| `npm run ios` | Run on iOS |
| `npm run android` | Run on Android |
| `npm run ios:build` | Build iOS (iPhone 16 simulator) |
| `npm run pods` | Install CocoaPods |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Jest tests |

## Roadmap

### Completed

- [x] KYC verification flow
- [x] Biometric login (Face ID / fingerprint)
- [x] P2P marketplace with full lifecycle (create, apply, chat, pay, confirm, rate)
- [x] P2P offer editing for open offers
- [x] Crypto wallet integration (multi-coin deposits and withdrawals)
- [x] Push notifications (payment alerts, P2P activity)
- [x] Transaction PDF receipt downloads
- [x] Phone top-ups and gift cards
- [x] PIN + OTP paste support across all auth flows
- [x] FlashList migration for high-performance lists
- [x] Light/dark theme with system auto-detection
- [x] Contact list with quick-send
- [x] Privacy mode (hide balance and transaction amounts)
- [x] Pull-to-refresh across all screens

### In Progress

- [ ] TypeScript migration (~3% coverage, expanding)
- [ ] Environment-based API configuration (replace hardcoded dev IP)
- [ ] Migrate token storage from AsyncStorage to react-native-keychain

### Planned

- [ ] Multi-language support (EN/ES)
- [ ] Savings account UI (deposit, withdraw, earnings dashboard)
- [ ] P2P dispute resolution flow (revision status)
- [ ] In-app support chat with ticket system
- [ ] Merchant dashboard (invoice creation, payment links)
- [ ] Deep linking for P2P offers and payment requests
- [ ] Offline mode with transaction queue
- [ ] Widget for balance display (iOS/Android)
- [ ] Accessibility improvements (VoiceOver, TalkBack)
- [ ] End-to-end encryption for P2P chat messages
- [ ] Referral program UI with stats and rewards
- [ ] Advanced P2P analytics (volume charts, price history)

## Contributions

We welcome contributions! Please open an issue or submit a pull request. All code should follow our established coding style and pass linting tests.

## Security & Compliance

QvaPay complies with applicable regulations including:

- AML / KYC procedures for user onboarding
- Integration with OFAC sanctions list
- US FinCEN registered MSB (via partners)
- Ongoing work toward EU licensing under e-Residency
- Rate limiting on all sensitive endpoints (auth, transfers, withdrawals)

## Social & Support

- Website: [https://www.qvapay.com](https://www.qvapay.com)
- Blog: [https://qvapay.blog](https://qvapay.blog)
- Telegram: [https://t.me/qvapay](https://t.me/qvapay)
- Twitter/X: [@QvaPay](https://x.com/QvaPay)

---

QvaPay Technologies. All rights reserved.
