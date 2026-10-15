---
created: 2026-10-15T08:05:00.000Z
title: 'Amazon sign-in latch never clears on a zero-installed profile: the probe reads unknown after the token recovers, so the tile stays "Sign-in expired" until a re-login'
area: auth
severity: medium
platform: any
ready: code
found_by: "quick 261015-rud (Amazon A3/A6 induction live gate), Arm B launch 2"
files:
  - src/backend/signInProbe/runnerProbes.ts
  - src/backend/signInProbe/classify.ts
  - .planning/quick/261015-rud-live-gate-the-amazon-expiry-strings-a3-a/evidence/
---

# The latch is one-way on a profile with nothing installed

Measured 2026-10-15 on the real macOS profile (`installed.json = []`, `library.json = []`):

1. Launch 1 (refresh token invalid, one-entry `installed.json` fixture): `nile outcome=expired`,
   `verdict=latched`; Library row and Accounts tile read "Sign-in expired — Reconnect". Correct.
2. Launch 2 (real tokens restored, fixture removed so `installed.json = []`): the probe's
   `list-updates` printed `No games installed` before any auth call (A4) and classified
   `unknown`, `verdict=unchanged`. **The tile stayed "SIGN-IN EXPIRED — RECONNECT"**
   (`evidence/item5-tile-launch2-latched-unknown.png`) although the same boot's `library sync`
   had just refreshed the token successfully (`runner-nile-launch-2.excerpt.log`:
   `Refreshing token` → `Successfully synced the library`).
3. Launch 3 (real tokens, fixture back): `nile outcome=healthy`, `verdict=cleared`, tile
   "Connected". So the clear works — it just cannot happen with nothing installed.

`unknown` never changes state by design (260822-vov). On a zero-installed profile the Amazon
probe can therefore latch (a refresh line decides first, e.g. a transient 400 — A3 measured 400 for
a dead token, so a transient 400 is indistinguishable) but never clear; only the Reconnect login
clears it. The h9n fix (`268bae390`) made the zero-installed run `unknown` instead of a false
`healthy`, and parked the replacement-command question on the induction gate. That gate has now
run, so the 49-SPEC boundary row no longer blocks a replacement.

## What to decide

A nile command that reaches the refresh with zero installed games but does NOT sync the library
(D-16). Candidates from nile 1.2.0 `cli.py` (refresh calls at L66, L139, L154, L182, L270):
`list-updates` (L182, gated on installed), `library sync` (forbidden), and the launch/install
paths (not probes). If none fits, the alternative is to let the latch clear on a successful
*app-side* refresh signal (the `library sync` run already logs it), which keeps the probe
untouched. Either way the fix needs the Arm A rig in `evidence/nileEnc.cjs` + `armA.sh` to prove
both the expired and the recovered shape against scratch copies before any in-app run.

## Also observed (not scored, external binary)

nile 1.2.0 `library sync` after a failed refresh dies with an unhandled
`requests.exceptions.JSONDecodeError` at `nile/api/library.py:120` (it calls `.json()` on the
non-JSON error body), exit 1; GameLib logs `Failed to refresh library: Process exited with code 1`
and continues. Harmless to the probe (it is a separate spawn), noisy in `runners/nile.log`.
