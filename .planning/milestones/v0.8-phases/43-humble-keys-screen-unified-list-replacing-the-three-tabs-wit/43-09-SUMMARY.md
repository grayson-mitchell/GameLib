---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 09
subsystem: ui
tags: [react, tauri, embedded-webview, i18n, humble, gog]

# Dependency graph
requires:
  - phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit (plan 03)
    provides: "D-43-11 probe verdict (43-PROBE-D-43-11.md) selecting candidate B"
  - phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit (plan 06)
    provides: "resolveKeyScenario switch and the HumbleKeyRow three-column KEY-cell render"
  - phase: 40 (Steam-native install stability line, embedded store browser)
    provides: "Window::add_child native child webview singleton (storeEmbedOpen / storeEmbedSetBounds)"
provides:
  - "The one gog_keyless claim path: a 'Claim on Humble' button that opens Humble's own keys page in the Phase 40 embedded store browser"
  - "gog_keyless excluded from the login-and-claim scenario (the click never depends on GameLib's own GOG connection state)"
  - "Mutation-proven test coverage pinning the label, its absence of 'GOG', its absence of faExternalLinkAlt, and unchanged TYPE/geometry"
affects: [43-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One-shot embed bounds snapshot (window.innerWidth/innerHeight fallback) for a click-triggered embed open, distinct from useStoreEmbedHost.ts's continuously-synced ResizeObserver oracle — documented in-line as NOT a second writer against that singleton"
    - "Destination-honesty test pattern: assert both the exact label text AND the absence of the competing store's name, plus icon-presence/absence keyed to whether the path leaves the app"

key-files:
  created: []
  modified:
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
    - public/locales/en/gamelib.json

key-decisions:
  - "Implemented candidate B verbatim from 43-PROBE-D-43-11.md's SELECTED BRANCH line: opens https://www.humblebundle.com/home/keys in the Phase 40 embedded store browser, not the reveal-endpoint path (candidate A, measured dead by a definitive server-side success=false denial) and not the external-browser fallback (rejected primary path — operator wanted to stay in-app)"
  - "gog_keyless was additionally excluded from the 'login-and-claim' scenario, on top of the plan's explicit branch instructions, because the click's destination (Humble's own site) never depends on whether GameLib's own GOG connection is linked — that scenario's whole premise (\"connect this store to GameLib first\") does not apply to a destination that isn't GOG's site"
  - "No backend change to revealKey/doRevealKey: confirmed via git diff --name-only against adapter.ts, library.ts and adapter.test.ts, all three remain untouched"

requirements-completed: [REQ-43-24]

# Metrics
duration: 21min
completed: 2026-09-10
---

# Phase 43 Plan 09: gog_keyless KEY Destination Summary

**Wires the gog_keyless claim button to open Humble's own keys page in the Phase 40 embedded store browser, labelled "Claim on Humble" — the probe-selected candidate B — with mutation-proven tests pinning the label and its honesty constraint.**

## Performance

- **Duration:** 21 min (15:12 docs commit for prior plan through 15:33 test commit)
- **Started:** 2026-09-10T15:12:03+12:00 (prior plan's metadata commit, immediately preceding this plan's work)
- **Completed:** 2026-09-10T15:33:38+12:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `gog_keyless` rows now render exactly one claim affordance, "Claim on Humble," which opens the Phase 40 embedded store browser pointed at `https://www.humblebundle.com/home/keys` — closing REQ-43-24 with the branch the D-43-11 probe's live evidence selected, not an assumption
- `gog_keyless` excluded from the `login-and-claim` scenario (Rule 1/2 fix beyond the plan's literal text — see Deviations)
- 8 new tests pin the destination-honesty contract: exactly one button, exact label text, absence of "GOG" in the label, absence of the external-link icon, unchanged branded GOG logo in TYPE, unchanged three-column geometry, and REQ-43-15's zero-interactivity gate for TYPE and GAME
- The rejected candidate A (reveal-endpoint) and the rejected external-browser fallback are recorded as not built, in both the code comments and this summary

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement the branch the probe selected** - `a25d8d2af` (feat)
2. **Task 2: Pin the gog_keyless destination and its honesty constraint** - `7274a6ddc` (test)

**Plan metadata:** (this commit, forthcoming)

## Files Created/Modified
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` - Added `isGogKeyless` flag, `openHumbleKeysEmbed()` (one-shot bounds snapshot + `storeEmbedOpen` call), the `claimOnHumble` label branch, and the `login-and-claim` exclusion for `gog_keyless`
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx` - Added `describe('gog_keyless KEY destination (REQ-43-24, D-43-11)')` with 8 tests and a mutation proof
- `public/locales/en/gamelib.json` - Minted `humbleKeys.claimOnHumble: "Claim on Humble"`

## Decisions Made
- Candidate B implemented verbatim per the probe's `SELECTED BRANCH` line — see key-decisions above for full rationale.
- The embed's bounds are a one-shot snapshot taken at click time (falling back to `window.innerWidth/innerHeight` when no store/wiki geometry oracle ref is available), not a continuously-synced rect. This row is not the store/wiki route's own geometry oracle (`useStoreEmbedHost.ts` owns the one `storeEmbedSetBounds` call site) and must not become a second writer against that singleton. Continuous resize-tracking and the close/return affordance for this specific embed open are deferred to 43-10's live gate — see Known Stubs below.
- `login-and-claim` exclusion (Rule 1/2, not explicitly named in the plan text but required by the plan's own logic): the plan's `read_first` for candidate B says "do not add a second login step" because the embed inherits the login webview's session; the `login-and-claim` scenario's premise — connect GameLib's own GOG login first — has no bearing on a click that opens Humble's site, so leaving it wired would have offered a button that promised something the click could not deliver.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Excluded `gog_keyless` from the `login-and-claim` scenario**
- **Found during:** Task 1
- **Issue:** Without this exclusion, a `gog_keyless` row with `storeLoginConnected === false` would resolve to `'login-and-claim'` and render "Log into GOG and claim" — a button whose premise (connecting GameLib's own GOG login) is irrelevant to a click that opens Humble's keys page, not GOG's.
- **Fix:** Added `humbleKey.platform !== 'gog_keyless'` to the `login-and-claim` resolution guard in `resolveKeyScenario`, so this platform always resolves to the ordinary `claim-and-gift` scenario and gets the destination-specific button instead.
- **Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`
- **Verification:** `npx tsc --noEmit` clean; `resolveKeyScenario`'s existing per-platform login-and-claim tests (uplay, battlenet, origin, origin_keyless, nintendo_direct, generic) continue to pass unaffected, and the new describe block's fixture (`storeLoginConnected` unset, i.e. the ordinary default) confirms `gog_keyless` renders the `claim-and-gift` button shape.
- **Committed in:** `a25d8d2af` (Task 1 commit)

**2. [Self-correction, not a deviation from plan intent] Draft comment briefly used the literal phrase "Claim on GOG"**
- **Found during:** Task 1, before commit
- **Issue:** A first-draft in-code comment illustrating what the label must NOT say used the literal string "Claim on GOG" defensively, which tripped the plan's own acceptance grep (`grep -c 'Claim on GOG' ... index.tsx` must return `0`).
- **Fix:** Reworded the comment to describe the constraint without ever spelling out the forbidden phrase verbatim ("never namechecking GOG's store here, because embed opens Humble's site, not GOG's").
- **Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`
- **Verification:** Re-ran the grep, confirmed `0`; re-ran `npx tsc --noEmit`, confirmed clean.
- **Committed in:** `a25d8d2af` (Task 1 commit, folded in before commit — not a separate commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug fix), plus 1 pre-commit self-correction that never reached a commit.
**Impact on plan:** The `login-and-claim` exclusion is necessary for the honesty contract this plan exists to ship (D-43-12); it is a direct, narrow consequence of the plan's own "do not add a second login step" instruction, not scope creep. No architectural changes were needed.

## Issues Encountered
None beyond the deviations above.

## Known Stubs

- `openHumbleKeysEmbed()` in `HumbleKeyRow/index.tsx` opens the embed with a one-shot bounds snapshot and no dedicated close/return affordance. There is no continuous resize re-sync for this particular open call (by design — see Decisions Made), and no UI element in this row lets the user close the embed and return to the Keys screen; that affordance, if one is needed beyond whatever the Phase 40 embed's own global close/dismiss mechanism provides, is unverified by this plan. This is a deliberate deferral to 43-10's live gate (which owns REQ-43-19's live-compositing verification), not a stub blocking this plan's own goal: the plan's `must_haves` only require the button to reach the selected destination with the correct label, which it does.

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: new-network-reachable-surface | `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | New call site to `storeEmbedOpen('https://www.humblebundle.com/home/keys', ...)` outside the existing route-based embed infrastructure (`/store/gog`, `/store/steam`, `/store-page`). The plan's own threat model (T-43-30) already accepts the underlying Phase 40 shared-cookie-jar risk for "one hard-coded Humble URL," which covers this; flagging here only because this is a second call site into that same singleton, added from a component that is not itself a route. |

## Self-Check: PASSED

- FOUND: `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (modified, contains `gog_keyless`, `isGogKeyless`, `openHumbleKeysEmbed`)
- FOUND: `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx` (modified, contains the new `describe('gog_keyless KEY destination ...')` block)
- FOUND: `public/locales/en/gamelib.json` (contains `claimOnHumble`)
- FOUND commit `a25d8d2af` in `git log --oneline --all`
- FOUND commit `7274a6ddc` in `git log --oneline --all`

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

Ready for 43-10's live gate. Flags for that gate to verify live (not measurable by this plan's jsdom-less Frontend jest project):
- Actual compositing behaviour when the embed opens above the main WKWebView for this specific call site (geometry, z-order, the `hide()`-before-modal dance if any modal opens over it).
- Close/return UX for this embed open specifically — whether the user has a way back to the Keys screen, and whether that affordance already exists globally in the Phase 40 embed chrome or needs to be added here.
- The probe's own residual unknowns remain live and are NOT resolved by this plan: (1) the actual Humble error text for the one denial observed is still redacted/unknown, (2) the n=1 sample is consumed and unrepeatable, (3) whether the GOG-Humble account link was present or absent on the operator's account during the probe is unconfirmed and remains a live alternative explanation for the observed denial, (4) no further reveal-endpoint sample remains for re-testing candidate A. This plan's tests document the account-link unknown in-file but cannot and do not resolve it.

No blockers to closing REQ-43-24 at the code level; all blockers above are live-verification items for 43-10, not defects in this plan's shipped code.

---
*Phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit*
*Completed: 2026-09-10*
