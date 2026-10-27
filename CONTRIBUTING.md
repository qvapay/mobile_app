# Contributing to the QvaPay app

Thanks for your interest. This is the source of the QvaPay mobile app, used by real
people with real money, so we review carefully, but we do merge outside
contributions: bug fixes, UI polish, translations and docs are all welcome.

Spanish, English and Portuguese are all fine in issues, discussions and pull
requests. Please read our [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Where things go

| You want to… | Go to |
|---|---|
| Report a bug in the app | [Open a bug report](https://github.com/qvapay/mobile_app/issues/new?template=bug_report.yml) |
| Propose a feature | [Ideas](https://github.com/qvapay/mobile_app/discussions/categories/ideas) first, then a [feature request](https://github.com/qvapay/mobile_app/issues/new?template=feature_request.yml) |
| Ask how something works | [Q&A](https://github.com/qvapay/mobile_app/discussions/categories/q-a) |
| Report a **security** issue | [Private report](https://github.com/qvapay/mobile_app/security/advisories/new), see [SECURITY.md](SECURITY.md). Never a public issue |
| Get help with **your account** or a transaction | [Support on Telegram](https://t.me/qvapay) or soporte@qvapay.com. GitHub is only for the code |

## Setting up

Requirements: **Node 22.13+ or 24.3+** (or 26+), npm, and for iOS **Ruby 3.3.9**
via rbenv (pinned in `.ruby-version`) with Bundler 2.4.22, Xcode and CocoaPods.
Android needs Android Studio with SDK 37 and JDK 17+.

```bash
git clone https://github.com/qvapay/mobile_app.git
cd mobile_app
npm install
gem install bundler:2.4.22 && bundle install   # iOS only
npm run pods                                   # iOS only, and again after every npm install
npm run start                                  # Metro
npm run android                                # or: npm run ios
```

The app points at the production API out of the box. It only tries a local
backend first in development builds, and falls back to production if none
answers, so you can work on the UI without running the backend.

## Before you open a pull request

Run the same checks CI runs:

```bash
npm run lint
npm run typecheck
npm run test
npm run i18n:check   # if you touched any copy
npm run i18n:usage   # idem
```

CI runs lint, typecheck, Jest and `react-doctor` on every PR, and must be green.

## Conventions

The full architecture and the house rules live in [`CLAUDE.md`](CLAUDE.md). It
is long, but the sections on the data layer, navigation, theme and i18n answer
most questions. The short version:

- **TypeScript everywhere.** New endpoints get a real return type in their
  `api/` module, entities go in `types/domain.ts`, new screens register their
  params in `types/navigation.ts`. Tests stay `.test.js`, usually with a
  `@jest-environment node` docblock and the logic extracted to a pure module.
- **No literal UI strings.** Every piece of copy is an i18next key in
  `i18n/locales/` in **all three languages** (es, en, pt-BR), following
  `i18n/CONVENTIONS.md`. Spanish is the source language.
- **Reads go through React Query**, writes that move money are direct calls to
  `api/` with an idempotency key. Don't add new contexts for server data.
- **UI kit first.** Use `QPPressable` for anything pressable (never
  `Animated.createAnimatedComponent(Pressable)`), `@shopify/flash-list` for
  lists, `sonner-native` for toasts, the shared modal pattern, and the theme
  tokens. Surface cards show a hairline border **only in light mode**
  (`!theme.isDark && { borderWidth, borderColor }`), never in dark mode.
- **Lighter type.** Medium / semibold for emphasis; bold and black only for hero
  numbers.
- **Give interactive elements a stable `testID`** so the Maestro E2E flows don't
  depend on the language.
- **Wallet code is pure.** Inside `wallet/`, only `keystore.ts` and
  `appRpcRouter.ts` may touch react-native or AsyncStorage; everything else is
  tested in plain node.
- **Never commit secrets** or anything from a real account: keys, seeds, tokens,
  screenshots with personal data.

## The pull request

- Fork, branch from `main`, keep the PR focused on one thing. Rebase rather than
  merge if `main` moves under you.
- Fill in the PR template: what fails, why, what you changed, how you verified
  it, and before/after screenshots for anything visual (both themes if relevant,
  personal data cropped). The descriptions in merged PRs are a good model.
- **Don't bump the version.** Maintainers do that in `app.json` at release time;
  `npm run version:sync` propagates it.
- Expect a review within a few days. We squash-merge, keeping you as the author
  of the commit, so you show up in the contributors.

## Releases

Maintainers cut releases from `main`: the version lives in `app.json`, Android
goes through `scripts/release-android.sh` to the Play tracks, iOS through Xcode.
Contributors don't need to do anything here.
