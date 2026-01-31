# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QvaPay is a React Native mobile fintech app (v0.81.4) providing a non-custodial wallet, P2P marketplace, and crypto payment gateway for underbanked regions in Latin America and the Caribbean.

## Common Commands

```bash
# Development
npm run android          # Run on Android
npm run ios              # Run on iOS
npm run ios:build        # Build iOS
npm run pods             # Install CocoaPods (required for iOS)
npm run start            # Start Metro bundler

# Quality
npm run lint             # Run ESLint
npm run test             # Run Jest tests
```

**Node.js requirement**: >= 20

## Architecture

### State Management (Context API)
- **AuthContext** (`/auth/AuthContext.js`): Authentication state, token management with 30-second validation checks, secure storage via react-native-keychain
- **SettingsContext** (`/settings/SettingsContext.js`): App-wide settings (notifications, security, privacy, appearance)
- **ThemeContext** (`/theme/ThemeContext.js`): Light/dark theme with memoized style utilities

Provider hierarchy in `App.tsx`:
```
ThemeProvider > SettingsProvider > AuthProvider > NavigationContainer
```

### Navigation (React Navigation v7)
Routes defined in `/routes.js`. Structure:
- **AppNavigator** (root): Onboard → Splash → Welcome → MainStack (authenticated)
- **MainStack**: Bottom tabs (Home, Invest, Keypad, P2P, Store)
- Feature stacks: Send flow, Withdraw flow, SettingsStack

### API Layer (`/api/`)
Axios client (`client.js`) with:
- Base URL: `http://192.168.0.10:3000/api` (dev) / `https://api.qvapay.com` (prod)
- Request interceptor adds Bearer token from AsyncStorage
- Response interceptor handles 401/403 (clears token), returns Spanish error messages

API modules follow consistent pattern returning `{ success, data, error?, status? }`:
- `authApi.js`: login, register, checkToken, logout
- `userApi.js`: profile, KYC operations
- `p2pApi.js`: marketplace CRUD, offer applications
- `transferApi.js`: send money, history
- `withdrawApi.js`: withdrawals
- `storeApi.js`: products, purchases

### Theme System
Use context-level memoized styles for performance:
```javascript
const { theme, styles } = useTheme()
// Access: styles.container.container, styles.text.title
```

Avoid creating styles inline. See `/theme/README.md` for migration patterns.

### Key Directories
- `/screens/`: Feature screens organized by domain (home, p2p, store, transaction, settings)
- `/ui/`: Reusable components; `/ui/particles/` for atomic components (QPButton, QPInput, QPAvatar)
- `/auth/screens/`: Login, Register, password recovery
- `/helpers.js`: Utilities (timeAgo, parseQRData, date formatting) - Spanish locale

## Development Notes

- Mix of `.jsx` and `.tsx` files (TypeScript migration ongoing)
- UI strings are hardcoded in Spanish (i18n on roadmap)
- Functional components with hooks only (no class components)
- Colors: primary `#6759EF`, success `#7BFFB1`, danger `#DB253E`
- Dark theme default: background `#0E0E1C`
