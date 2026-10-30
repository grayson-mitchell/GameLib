---
status: complete
parked_todo: 2026-10-16-phase-26-steam-key-redemption-live-uat-never-run.md
phase: 26-steam-key-redemption
source: [26-VERIFICATION.md]
started: 2026-07-20
updated: 2026-10-30
audit_acknowledged:
  milestone: v0.8
  at: 2026-10-16
  gap_snapshot: "partial::scenarios=5"
---

## Current Test

[testing complete]

## Tests

### 1. Live redeem of a valid unowned Steam test key

expected: Success message names the redeemed game/package, and the game appears in the Steam library view after refresh, with no app restart.
result: pass — 2026-10-30 operator live run. Redeemed via the Humble Keys activate flow (reveal + redeem, same `SteamUser.redeemKey` backend as the dialog); gamelib.log 20:30:04 `outcome=success purchaseResultDetails=0`, then `[refreshLibrary] runner=steam origin=redeem-steam-key`. Operator confirmed the game appeared without restart.

### 2. Redeem a key for an already-owned title

expected: Distinct "already owned" message (copy.ts already-owned bucket), not the generic invalid/failed copy.
result: pass — 2026-10-30. Operator re-entered a key for a title already on the account; gamelib.log 20:55:22 `outcome=already-owned purchaseResultDetails=9` (AlreadyPurchased), distinct already-owned copy shown. Note: Steam answers 9, not DuplicateActivationCode (15), for a used key on the owning account.

### 3. Redeem a malformed-but-shaped (10-40 char, valid charset) key that Steam rejects as invalid

expected: Distinct "invalid key" message, no crash, modal stays open.
result: pass — 2026-10-30. Junk key `AAAAA-BBBBB-CCCCC`; gamelib.log 20:37:09 `outcome=invalid purchaseResultDetails=14` (BadActivationCode); the dialog input was still focused at 20:38 (BLANKPROBE `centre.id=redeem-steam-key-input`), so the modal stayed open.

### 4. Entry point visibility toggling with a real Steam login/logout cycle

expected: Sidebar "Redeem a Steam key" item is absent with no Steam session and appears immediately after a real Steam login, opening the modal on click.
result: pass — 2026-10-30 operator live run. The entry point now lives in the Stores tier-2 panel (`StoresPanel/index.tsx`, gated on `steam.username`), not a sidebar — the left nav was retired in 34.10; behaviour as expected there.

### 5. Log inspection after a real redeem attempt (any outcome)

expected: No raw key value appears anywhere in gamelib.log.
result: pass — 2026-10-30. A Steam-key-shaped regex (5x5 and 5x5x5x5x5) over all 16 files in `~/Library/Logs/GameLib/` (incl. runners/ and gamelib-shell.log) matched 0; operator's literal grep for the junk key returned 0. Redeem lines log only store/outcome/purchaseResultDetails.

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
