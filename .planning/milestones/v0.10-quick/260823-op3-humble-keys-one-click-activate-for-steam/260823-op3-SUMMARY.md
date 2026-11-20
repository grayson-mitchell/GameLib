---
quick_id: 260823-op3
slug: humble-keys-one-click-activate-for-steam
date: 2026-08-23
status: complete
commits:
  - ba68f8ed9 feat(260823-op3) one-click Activate for Humble Steam keys
  - e01c89189 feat(260823-op3) reorder HumbleKeyRow into fixed action-first columns
---

# Quick Task 260823-op3 — Summary

## What shipped

**One-click Activate (Steam).** A Steam key in Keys-waiting now needs zero
clicks past the row button: the wizard mounts straight into an `activating`
step that reveals (or, in `finish` mode, reads back the already-revealed
value), auto-copies, calls `redeemSteamKey`, then marks the Humble row
redeemed and refreshes the Steam library. Terminal copy comes from
`redeemOutcomeCopy` — the same source the manual Redeem-a-key dialog uses, so
the two surfaces cannot drift on what a given `EPurchaseResult` means.

**Row columns.** `HumbleKeyRow` renders Activate → Gift on Humble → Status
(+ urgency) → Title → Expiration.

## Decisions worth keeping

**The reveal/redeem split has two different failure postures, deliberately.**
Before the reveal lands, an unknown outcome is `ambiguous` (WR-05) — never a
retry that could re-fire the irreversible POST. After it lands, every failure
falls through to `keyShown` with the Steam outcome as a banner, so a spent
reveal never strands the user without their key. A single uniform catch would
have gotten one of those two halves wrong.

**T-14-08 is amended, not dropped.** `humbleRevealKey` now has a mount-effect
call site. The warning click used to be the guard against a double reveal; the
replacement is a `useRef` latch plus the fact that the wizard only mounts from
an explicit Activate click. The test harness's `useRef` had to become
slot-persistent for the latch test to be non-vacuous — a per-call
`{ current }` would have reset the latch every re-render and passed anyway.

**New strings went to `gamelib.json`, not `translation.json`.** The first
attempt added them to `translation.json` alongside the existing `humbleKeys.*`
block and turned the D-05 churn guard red: `translation.json` is
upstream-owned, and any write to it fails CI. The pre-existing `humbleKeys.*`
keys living there are inherited debt, untouched. New keys are
`gamelib:humbleKeys.*`, which meant adding a second `useTranslation('gamelib')`
hook to `HumbleKeyRow` and `Waiting/index.tsx`.

Relatedly: `humbleKeys.claim` already resolves to `"Claim"` in en, so
relabelling it through the `t()` default argument would have been a silent
no-op. The Activate label is a new key.

**Fixed-basis action cells, not `auto`.** Each `<li>` is its own flex
container, so content-sized action cells would give every row a slightly
different width and the "columns" would stagger down the list.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `jest --selectProjects Frontend` | 122 suites / 1990 tests passed |
| `jest meta/__tests__/{hardcodedStringGate,i18nCatalogChurnGuard,i18nGlossary,genI18nGateScope}` | 183 passed, 1 skipped |
| `eslint src/frontend/screens/Humble/Keys` | 0 errors (1 pre-existing warning) |

New coverage in the wizard suite: end-to-end auto-activate, the single-fire
reveal latch, the Steam-declined fallback to the manual hand-off, and a
`redeemSteamKey` rejection landing on the key step rather than the key-hiding
`ambiguous` step.

## Not done

**No live UAT.** Every check above is static or jest. The operator verified
`redeemSteamKey` itself works by hand earlier today, but the new one-click
sequence — and the reordered row in both Keys-waiting and Giftable Spares —
has not been exercised against a real Humble key in a running build.

**Non-Steam keys are unchanged** (warning-first reveal, copy, generic help
URL). There is no auto-activation API for them; D-68's static help URL is
still the only safe destination.

**Locale fill is en-only.** The six new `gamelib:humbleKeys.*` strings exist
in `public/locales/en/gamelib.json`; other locales fall back to the `t()`
defaults, same as the rest of the `gamelib` namespace pending plan 34.8-12.
