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
