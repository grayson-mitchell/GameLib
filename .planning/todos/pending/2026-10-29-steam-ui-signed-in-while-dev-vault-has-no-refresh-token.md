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
