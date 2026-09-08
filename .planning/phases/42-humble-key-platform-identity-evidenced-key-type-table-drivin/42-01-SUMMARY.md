---
phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
plan: 01
subsystem: humble
tags: [typescript, humble, pure-function, discriminated-union, redeem-url]

# Dependency graph
requires: []
provides:
  - "src/common/humble/keyTypePresentation.ts — pure key_type -> presentation + redeem-target table"
  - "HUMBLE_REDEEM_HELP_URL constant, ready for HumbleClaimWizard/index.tsx:18 to import instead of redefining"
  - "getKeyTypePresentation(keyType) -> branded/named/unknown discriminated union"
  - "getRedeemTarget(keyType, code) -> deep-link/help discriminated union"
affects: [42-04, 42-05, 42-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit map-entry unknown branch instead of switch default: (prevents silent fall-through to a fabricated/GameLib-icon result)"
    - "Discriminated union with no-payload 'unknown'/'named' variants, mirroring expirationDisplay.ts's kind-tagged shape"
    - "Deep-link builder table keyed on a closed literal set (steam/gog only) so a hostile key_type can only ever reach the help fallback"

key-files:
  created:
    - src/common/humble/keyTypePresentation.ts
    - src/backend/humble/__tests__/keyTypePresentation.test.ts
  modified: []

key-decisions:
  - "HumbleStoreLogoId is a fresh 'steam' | 'gog' | 'epic' union, NOT an extension of common/types' Runner — Runner's StoreLogos component has a default branch that returns the GameLib icon, which D-42-03 names as the exact trap this module exists to avoid."
  - "The literal 'generic' key_type (GENERIC_KEY_PLATFORM from groupKeys.ts) is an explicit map entry resolving to { kind: 'unknown' }, not merely the fall-through — unrecognised strings hit the same case via a plain return with zero switch/default anywhere in the file."
  - "getRedeemTarget's help branch takes but never uses the code argument — dropping it is load-bearing (T-42-01): the fallback URL must never carry the secret key value, pinned by an explicit security test against the literal 'SECRET-CODE'."
  - "Display names chosen for the four no-logo platforms (plan 42-07's human-verify checkpoint will confirm these): origin/origin_keyless -> 'Origin', uplay -> 'Ubisoft Connect', battlenet -> 'Battle.net', nintendo_direct -> 'Nintendo'."

patterns-established:
  - "Fourth common/humble/ pure-lookup sibling (alongside expirationDisplay.ts, groupKeys.ts, urgencyBadge.ts, viewFilters.ts) — same no-React/no-i18n/no-I/O tier, same test-lives-in-backend-suite convention."

requirements-completed: [REQ-42-01]

# Metrics
duration: ~15min
completed: 2026-09-08
---

# Phase 42 Plan 01: Evidenced key_type presentation + redeem table Summary

**Pure `common/humble/keyTypePresentation.ts` module resolving Humble's raw `key_type` string to a branded/named/unknown display and a deep-link/help redeem target, with an explicit (never default-clause) unknown branch and a security-pinned guarantee that the secret code never reaches the fallback URL.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 2 (both new)

## Accomplishments

- Created the single evidenced `key_type` -> presentation/redeem-target table this phase is named for (D-42-03), subsuming the three ad-hoc call sites at `HumbleKeyRow/index.tsx:230`, `HumbleClaimWizard`'s "Redeem on {{platform}}" label, and its Steam-vs-help URL fork.
- All nine `KNOWN_GAME_KEY_TYPES` values plus the literal `'generic'` are explicit map entries; every unrecognised string collapses to the SAME `{ kind: 'unknown' }` case as `'generic'`, reached by a plain `return`, never a `switch`/`default:`.
- Only `'steam'` and `'gog'` produce `{ kind: 'deep-link' }`; every other key_type — including a hostile key_type of a full URL string — produces `{ kind: 'help', url: HUMBLE_REDEEM_HELP_URL }` with the code argument dropped, closing the T-42-01/T-42-02 threats from the plan's threat register.
- RED state was captured before the implementation was written (Task 1 commit precedes Task 2 commit; jest failed on `Cannot find module 'common/humble/keyTypePresentation'`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the failing unit suite for the key_type table (RED)** - `224f1a8d4` (test)
2. **Task 2: Implement the pure key_type presentation + redeem table (GREEN)** - `a70f1bd12` (feat)

_No plan-metadata commit was made per this executor's explicit instructions — .planning/STATE.md and .planning/ROADMAP.md are owned by the orchestrator and were left untouched._

## Captured RED Output (Task 1)

```
FAIL src/backend/humble/__tests__/keyTypePresentation.test.ts
  ● Test suite failed to run

    Cannot find module 'common/humble/keyTypePresentation' from 'src/backend/humble/__tests__/keyTypePresentation.test.ts'

       8 |  */
       9 |
    > 10 | import {
         | ^
      11 |   HUMBLE_REDEEM_HELP_URL,
      12 |   HumbleKeyTypePresentation,
      13 |   getKeyTypePresentation
```

This is a module-resolution error naming `common/humble/keyTypePresentation`, per the plan's done criteria — not a passing run and not a "0 tests found" no-op. `RED-CONFIRMED` printed from the plan's own verify script.

## Final Export Signatures (Task 2, GREEN)

```typescript
export const HUMBLE_REDEEM_HELP_URL = 'https://support.humblebundle.com/hc/en-us'

export type HumbleStoreLogoId = 'steam' | 'gog' | 'epic'

export type HumbleKeyTypePresentation =
  | { kind: 'branded'; name: string; logo: HumbleStoreLogoId }
  | { kind: 'named'; name: string }
  | { kind: 'unknown' }

export type HumbleRedeemTarget =
  | { kind: 'deep-link'; url: string }
  | { kind: 'help'; url: string }

export function getKeyTypePresentation(keyType: string): HumbleKeyTypePresentation
export function getRedeemTarget(keyType: string, code: string): HumbleRedeemTarget
```

## Display Names Chosen for the No-Logo Platforms

Flagged per the plan's `<output>` spec for plan 42-07's human-verify checkpoint:

| key_type | Display name |
|---|---|
| `origin`, `origin_keyless` | Origin |
| `uplay` | Ubisoft Connect |
| `battlenet` | Battle.net |
| `nintendo_direct` | Nintendo |

(Branded platforms, for completeness: `steam` -> Steam, `gog` -> GOG, `epic`/`epic_keyless` -> Epic Games.)

## Files Created/Modified

- `src/common/humble/keyTypePresentation.ts` - The pure lookup table: `HUMBLE_REDEEM_HELP_URL`, `HumbleStoreLogoId`, `HumbleKeyTypePresentation`, `HumbleRedeemTarget`, `getKeyTypePresentation`, `getRedeemTarget`. No React, no i18n, no I/O, no logger import.
- `src/backend/humble/__tests__/keyTypePresentation.test.ts` - Unit coverage for every key_type row, the explicit unknown branch (generic + 5 unrecognised variants), redeem-target table-driven coverage (`it.each`), the two T-42-01/T-42-02 security pins, the independent-axes pin (epic has a logo but no deep link), and a compile-level exhaustiveness switch over `HumbleKeyTypePresentation['kind']`.

## Decisions Made

- `HumbleStoreLogoId` is a fresh union rather than reusing/extending `Runner` — see key-decisions above. This was explicit in the plan's `<action>` block, not an executor decision, but is called out here since it's the decision most likely to be "fixed" incorrectly by a future reader unfamiliar with the trap.
- Followed the plan's literal spec for display names, map structure, docblock convention (three-part shape matching `groupKeys.ts`/`viewFilters.ts`), and the deliberate "code argument unused" comment on the help branch.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed; the module compiled and passed on first write.

## Issues Encountered

None specific to this plan's scope. One unrelated pre-existing failure was observed while running the full Backend jest project (`src/backend/humble/__tests__/keyTypePresentation.test.ts` was run via `npx jest --selectProjects Backend <path>`, which this repo's jest config causes to execute the entire Backend project rather than filtering to the given path): `src/backend/sidecar/__tests__/electronUntouched.test.ts` fails on a `TOKEN_STORE_KEY|TOKEN_PREFIX|configStore` regex match, last touched by an unrelated commit (`267375a7c`, a prettier sweep) with no connection to Humble or this plan's files. Not fixed — out of scope per the scope-boundary rule, and not one of the two named baseline failures (`test:ci` leaked timer, `pnpm lint` warning ratchet) but equally pre-existing and unrelated to this diff. `pnpm lint` was also run and confirmed to exit 1 on the pre-existing warning-ratchet baseline; `npx eslint` scoped to the two new files reported zero warnings.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The contract plan 42-04 (row indicator) and plan 42-05 (`HumbleClaimWizard` redeem rewrite) both depend on is complete and green. Both plans can import `getKeyTypePresentation`/`getRedeemTarget`/`HUMBLE_REDEEM_HELP_URL` from `common/humble/keyTypePresentation` directly.
- No blockers. The A1 assumption from `42-CONTEXT.md` (that Humble's live `key_type` for GOG really is the string `'gog'`) is unaffected by this plan — it is a pure lookup table keyed on whatever string arrives; if the live value differs, only the map key changes.

---
*Phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin*
*Completed: 2026-09-08*
