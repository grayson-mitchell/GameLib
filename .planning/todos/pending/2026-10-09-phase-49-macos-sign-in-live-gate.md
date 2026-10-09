---
created: 2026-10-10T00:00:00.000Z
title: 'Run the Phase 49 macOS sign-in live gate (runner strings A1-A6, Keychain deny and ignore, warm sidecar exit, row judgment)'
area: auth
severity: major
platform: macos
ready: live-gate
files:
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-UAT.md
---

# Run the Phase 49 macOS sign-in live gate

Phase 49 derived the legendary, gogdl and nile auth-failure strings from source at the pinned tags
(`legendary 0.21.0`, `gogdl v1.3.0`, `nile v1.2.0`) and never exercised them against a real expired
account. Keychain denial, an ignored Keychain prompt, and the sidecar's warm-profile exit timing
cannot be reached by a unit test either. A green suite does not close this.

Run `49-LIVE-GATE.md` on the operator's Mac, per plan 49-12. It holds eleven items across ten
launches, a Structural Reachability Review, and the capture standard. Record each item's result in
`49-UAT.md` (every item starts as `pending`) and in the contract's result table.

Things to know before starting:

- The launch order is not the item order. Read the launch map first.
- `pnpm tauri:dev` sets `GAMELIB_DEV_SECRET_VAULT=1`; items 7 and 8 need `pnpm tauri:dev:keyring`
  in a shell where the variable is unset, or they are vacuous.
- The run edits real credentials and `/etc/hosts`. Every edit has a restore and a positive
  observable. Back up after every healthy launch, not once.
- Nothing from the session's `secrets/` directory, and no unredacted log, may enter the repo.

## Run 1 result

Run 1 on 2026-10-09 (UTC): **FAIL 8/11**, full record in `49-LIVE-GATE.md` `## Run 1`, results in
`49-UAT.md`. Items 1-4, 7-9, 11 PASS; item 10 FAIL on 10d (dismiss does not survive relaunch,
todo `2026-10-10-dismissed-sign-in-notice-returns-after-relaunch.md`); item 5 NOT SCORED
(encrypted nile token store, todo `2026-10-10-amazon-expiry-strings-need-a-real-induction.md`);
item 6 FINDING A4. This todo stays open until 10d and 5 are re-run green; the probe layer needs
no re-run.
