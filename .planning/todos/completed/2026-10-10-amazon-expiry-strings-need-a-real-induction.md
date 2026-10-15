---
created: 2026-10-09T21:30:00.000Z
title: 'Amazon expiry strings (A3/A6) untested: nile tokens are encrypted, induction needs server-side device deregistration'
area: auth
severity: medium
platform: macos
ready: live-gate
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/backend/signInProbe/classify.ts
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md
---

# Item 5 of the Phase 49 live gate was not scorable

Run 1 (`49-LIVE-GATE.md` § Run 1, item 5 NOT SCORED). nile v1.2.0 stores its session in an
encrypted `*.enc` file under `nile_config/nile/`; `current_user.json` carries only `name` and
`user_id`. The contract's induction (edit refresh/expiry keys in place) has nothing to edit, so
`Failed to refresh the token <Response [NNN]>` and the 400/401/403 set in
`NILE_AUTH_FAILURE_STATUSES` remain source-derived. The only real induction is to deregister the
nile device from the Amazon account page (invalidating the refresh token server-side), run one
keyring-build launch with at least one installed Amazon game (see the A4 todo), record NNN, then
sign in again. Needs the operator's Amazon account and a willingness to re-login.

## Resolution (2026-10-15, quick 261015-rud)

Scored **PASS** without a device deregistration or re-login. The measurement above was right
(`current_user.json` carries no token keys) but the remedy was wrong: nile 1.2.0 encrypts
`<md5(user_id)>.enc` with AES-256-CBC under `sha256(user_id)` (IV = first 16 bytes, AES-ECB under
the same key; upstream `nile/utils/config.py` at tag v1.2.0 — the vendored
`.build-tools/runners-onedir/src/nile` is 1.1.2 and predates the scheme), and `user_id` is
plaintext beside it. Induction: decrypt, set `tokens.bearer.refresh_token` invalid and
`NILE.token_obtain_time = 1`, re-encrypt (`evidence/nileEnc.cjs`). With `installed.json = []` nile
returns before any auth call (A4), so a one-entry fixture was used.

- **Arm A** (CLI, scratch copies): `garbage` and `flip` (one character of the real token altered)
  both logged `ERROR [AUTH_MANAGER]: Failed to refresh the token <Response [400]>`; an
  un-induced control refreshed silently. `classifyNileOutput` read them `expired`/`expired`/`healthy`.
- **Arm B** (in-app, `pnpm tauri:dev`, real profile): `[signInProbe] nile outcome=expired`,
  `nile verdict=latched`, Library row and Accounts tile rendered (`item5-row.png`, `item5-tile.png`);
  after restore + fixture, `nile outcome=healthy`, `verdict=cleared`, tile "Connected".
- **A3 CONFIRMED = 400** (inside `NILE_AUTH_FAILURE_STATUSES`, no widening). **A6 CONFIRMED.**
- Follow-on finding filed: `2026-10-15-amazon-latch-never-clears-on-a-zero-installed-profile.md`
  (`ready: code`) — with nothing installed the latch cannot clear, and nile `library sync` crashes
  on a dead refresh token.

Evidence: `.planning/quick/261015-rud-live-gate-the-amazon-expiry-strings-a3-a/evidence/`;
record: `49-LIVE-GATE.md` § 2026-10-15 addendum. Key names only were ever written down.
