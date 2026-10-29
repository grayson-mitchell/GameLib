---
created: 2026-10-29
title: "UI shows Steam signed in/expired while the dev vault holds no refresh token; the only symptom is an install refusal"
area: steam-auth
severity: medium
platform: macos
ready: code
source: "phase 56 live gate (56-26), launch 0, 2026-10-29"
---

## Problem

At startup the sign-in probe logged `steam outcome=expired` after `[dev-secret-vault] read key=steam-refresh-token`, yet the account looked usable in the UI. The dev vault file (in the OS per-user temp directory, `gamelib-dev-secret-vault.json`) was `{}`, so Install failed with "You are not signed in to Steam, so this download could not start" (`install refused, no authenticated Steam session (token-absent)`). The UI gave no earlier cue. A GameLib QR re-login stored the token and fixed it. Live gate 56-25 also had no preflight for GameLib's own Steam sign-in.

## Next

Surface the token-absent state in the Steam account UI before an install is attempted; consider a persistent dev vault location; add a GameLib-sign-in preflight to live-gate contracts.

## Resolution

Resolved by quick 261029-s5l (2026-10-29).

- **Root cause.** `SteamUser.probeCredentialPresence()` maps an absent token to `expired`, and `applySignInVerdict` returns `unchanged` for `expired` only when `steamConfigStore.credentialsMissing` is already latched. That latch feeds `resolveSignInState` branch 1 (`expired`), which the Library row and the Manage Accounts `Reconnect` tile already showed. The gap was the install affordance: `startSteamQuickInstall` never looked at sign-in state, so Install stayed live and the backend refused after the click.
- **Fix.** `steamInstallSignIn.ts` derives the install-side state through the shared selector. `startSteamQuickInstall` (native path only) opens the Steam options dialog instead of dispatching `install` when the sign-in is latched `expired`. The dialog shows a sign-in-required notice with a `Sign in to Steam` action (`/login?open=steam`) and disables Install. Delegated installs, `unknown`, `connected` and `not-connected` are unchanged.
- **Live-gate preflight.** Already done: `56-33-LIVE-GATE.md` PC12 checks the dev vault for `steam-refresh-token` before launch 0 (cites 56-25 Gap 4).
- **Dev vault location.** Deferred to `2026-10-29-dev-secret-vault-lives-in-os-temp-and-can-lose-the-steam-token.md`.
