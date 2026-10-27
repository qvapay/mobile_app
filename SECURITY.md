# Security Policy

QvaPay moves real money. If you find a vulnerability in this app, please tell us
privately first so we can fix it before anyone can abuse it.

## Reporting a vulnerability

Use one of these two channels, never a public issue, discussion or social post:

1. **GitHub private vulnerability reporting** (preferred):
   [Report a vulnerability](https://github.com/qvapay/mobile_app/security/advisories/new).
   Only maintainers can read it.
2. **Email**: [soporte@qvapay.com](mailto:soporte@qvapay.com) with the subject
   `[Security] <short title>`. We will move the conversation to a private channel.

Please include what you can of:

- The affected screen, flow or module, and the app version (Settings → About, or
  the `version` in `app.json`) and platform (iOS/Android, OS version).
- Steps to reproduce, or a proof of concept. A video or screenshots help.
- The impact you believe it has (funds, keys, personal data, account takeover…).

Spanish, English and Portuguese are all fine.

## What to expect

- An acknowledgement within **3 business days**.
- A first assessment, and an estimated timeline, within **10 business days**.
- We keep you informed while we work on it, and we credit you in the release notes
  when the fix ships, unless you prefer to stay anonymous.

## Scope

In scope for this repository:

- The React Native app in this repo (iOS and Android), including the self-custody
  wallet (`wallet/`), deep links, the mini-apps bridge and local storage of
  secrets.
- Native modules and build configuration shipped with the app.

The backend (`api.qvapay.com`, `www.qvapay.com`) lives in a separate, private
repository. Report backend issues through the same channels; we will route them.

Out of scope:

- Issues in third-party services and SDKs we integrate, unless our integration is
  the problem. Report those upstream.
- Anything that requires a rooted/jailbroken device, a compromised OS or physical
  access to an unlocked phone.
- Denial of service, rate-limit probing, spam, social engineering of QvaPay staff
  or users, and anything that touches other users' funds or data.
- Self-XSS, clickjacking on pages without sensitive actions, and reports from
  automated scanners without a demonstrated impact.

## Ground rules

- Test only with your own accounts and wallets, with small amounts.
- Never access, modify or exfiltrate data that is not yours.
- Stop as soon as you have demonstrated the issue, and give us reasonable time to
  fix it before any disclosure.

We do not run a paid bug bounty at the moment. We do thank reporters publicly and
take every report seriously.

## Supported versions

We fix security issues in the **latest version published on the App Store and
Google Play**. Older versions are not patched; the app prompts users to update.
