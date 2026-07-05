---
phase: 11-library-sync-5-state-key-model
plan: 04
subsystem: ui
tags: [react, i18n, humble, keys, sidebar, routing]

# Dependency graph
requires:
  - phase: 11-library-sync-5-state-key-model
    plan: 01
    provides: HumbleKey/HumbleKeyState type contracts (common/types/humble.ts)
  - phase: 11-library-sync-5-state-key-model
    plan: 03
    provides: humble context slice (keys/syncedAt/syncError/syncing), humbleSync/humbleGetKeys/humbleGetSyncState IPC, humbleSyncProgress/humbleKeysUpdated listener slots
provides:
  - "Humble Keys screen (src/frontend/screens/Humble/Keys) — the visible proof of the 5-state classification model"
  - "humble-keys route (App.tsx), guarded to redirect to humbleLoginPath when disconnected"
  - "Connected-only sidebar entry (faKey, gated on humble?.isLoggedIn) alongside Stores"
  - "HumbleKeyGroup + HumbleKeyRow components with the 5-state badge color mapping"
  - "humbleKeys.* i18n namespace + sidebar.humbleKeys key"
affects: [11-05-real-account-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cooldown state (cooldownUntil) is fetched directly via window.api.humbleGetSyncState() inside the screen component rather than the context slice, since Plan 03's humble slice does not carry it — re-fetched on mount and whenever humble.syncing transitions false"
    - "Progressive-fill done/total counts are captured via a screen-local window.api.handleHumbleSyncProgress() listener (independent of GlobalState's own listener that only derives the syncing boolean) — multiple ipcRenderer.on subscribers on the same channel is supported by the existing frontendListenerSlot() helper"
    - "Route guard lives inside the screen component (Navigate to={humbleLoginPath} replace when !humble?.isLoggedIn) rather than a router-level loader, since createHashRouter's static route table has no easy access to context state"

key-files:
  created:
    - src/frontend/screens/Humble/Keys/index.tsx
    - src/frontend/screens/Humble/Keys/index.css
    - src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  modified:
    - src/frontend/App.tsx
    - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
    - public/locales/en/translation.json

key-decisions:
  - "UNPICKED pseudo-entry title renders as '{{title}} · games not picked' (humbleKeys.unpickedTitle) instead of the UI-SPEC's literal 'Humble Choice — {{month}} {{year}} · games not picked' — HumbleKey has no separate month/year fields; Plan 02's classify.ts already folds the Choice month's human-readable name into `title` (rawProduct.human_name), so the frontend appends the qualifier to that value rather than re-deriving month/year from an opaque string. Same information content, safer implementation."
  - "5-state badge and group heading share one localized label per state (humbleKeys.state.*), exported from HumbleKeyGroup as STATE_LABEL_KEYS and imported by HumbleKeyRow, so the group heading and its rows' badges never drift out of sync"

requirements-completed: [HSYNC-01, HSYNC-04]

# Metrics
duration: 45min
completed: 2026-07-05
---

# Phase 11 Plan 04: Humble Keys Screen + Route + Sidebar Entry Summary

**Shipped the strictly read-only Humble Keys page — grouped-by-state key list with a 5-state color badge, always-on freshness indicator, progressive-fill sync indicator, fail-soft banner, and a connected-only sidebar entry/route — the visible proof that HSYNC-01's classification model renders correctly.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-07-05T09:24:00Z
- **Completed:** 2026-07-05T10:09:42Z
- **Tasks:** 2 completed
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- `src/frontend/screens/Humble/Keys/index.tsx`: page shell reading the `humble` context slice — title, always-shown "Last synced X ago" freshness line, icon-only refresh button (spins while `humble.syncing`, disabled + tooltip during the 403 cooldown), fail-soft `WarningMessage` banner (full-abort vs partial copy) shown only on a non-`'none'` `syncError`, and the fixed UNPICKED→UNREVEALED→REVEALED→REDEEMED→UNREDEEMABLE group order with expiring-soonest-first sorting inside each group (no-expiration keys last).
- Route guard: an unauthenticated visit to `/humble-keys` (deep link, back-button) redirects to `humbleLoginPath` (`/loginweb/humble`) instead of ever rendering the page disconnected — no separate "disconnected" empty state was built, matching the UI-SPEC's guard contract.
- `src/frontend/App.tsx`: registered the `humble-keys` lazy route next to `wine-manager`/`download-manager`.
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx`: added the "Humble Keys" entry (`faKey`) immediately after the Stores submenu block and before `/discounts`, gated on `humble?.isLoggedIn` only (not `!expired`) so an expired session still shows cached keys per D-20.
- `HumbleKeyGroup` (`components/HumbleKeyGroup/index.tsx`): state heading with localized label + count pill, defensive empty-group guard, renders child rows in received order (sorting happens once in the parent).
- `HumbleKeyRow` (`components/HumbleKeyRow/index.tsx`): strictly read-only `<li>` — no click handler, no button/link element, no reveal/copy/expand affordance (D-22) — 5-state badge, title, platform/origin caption (omitted for the UNPICKED pseudo-entry), and an expiration cell that never throws/blocks on a missing pick deadline (Pitfall 2 defensive handling).
- `index.css`: refresh button/freshness-indicator styles cloned from `.steamRefreshButton`/`.steamStaleIndicator`, the `.humbleSyncBanner` orange override (compound `.WarningMessage.humbleSyncBanner` selector to guarantee precedence regardless of CSS load order), and five `.humbleKeyStateBadge--{state}` modifiers reusing `.gameCardUpdateBadge`'s exact padding/border-radius/font chrome mapped to the UI-SPEC's color table. Zero hard-coded hex values (verified by grep).
- `public/locales/en/translation.json`: full `humbleKeys.*` namespace (title, lastSynced, syncing, syncError/syncErrorPartial, refresh, cooldown, emptyTitle/emptyBody, rowCaption, expiresOn, noExpiration, unpickedTitle, noDeadline, five `state.*` labels) plus `sidebar.humbleKeys`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Humble Keys screen shell + route + sidebar entry** — `37171d8a` (feat)
2. **Task 2: HumbleKeyGroup + read-only HumbleKeyRow + 5-state badge** — `5b505312` (feat)
3. **Formatting fix (prettier)** — `4ac8d1f0` (style)

## Files Created/Modified

- `src/frontend/screens/Humble/Keys/index.tsx` — page shell, sync/cooldown/progress state, group ordering + sorting, route guard
- `src/frontend/screens/Humble/Keys/index.css` — page/header/banner/group/row/badge styles, existing tokens only
- `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx` — group heading + count pill + rows
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` — read-only row, state badge, UNPICKED pseudo-entry handling
- `src/frontend/App.tsx` — `humble-keys` lazy route registration
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` — connected-only "Humble Keys" sidebar entry
- `public/locales/en/translation.json` — `humbleKeys.*` namespace + `sidebar.humbleKeys`

## Decisions Made

See `key-decisions` in frontmatter (UNPICKED title copy adaptation; shared state-label source of truth between group heading and row badge).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `React` unused-import lint errors + floating-promise warnings**
- **Found during:** Task 2, running `npx eslint` on the new files before committing.
- **Issue:** The new `.tsx` files imported `React` explicitly (matching an older pattern seen in one existing component) but never referenced the `React` namespace directly — the project's JSX transform doesn't require it, and the existing convention (e.g. `screens/Discounts/index.tsx`) only imports the named hooks. ESLint's `@typescript-eslint/no-unused-vars` failed on all three new files. Separately, two `window.api.humbleGetSyncState().then(...)` calls inside `useEffect` triggered `@typescript-eslint/no-floating-promises` warnings.
- **Fix:** Removed the unused `import React from 'react'` from `index.tsx`, `HumbleKeyGroup/index.tsx`, and `HumbleKeyRow/index.tsx`; prefixed the two floating-promise call sites with `void`, matching the exact convention already used in `GlobalState.tsx` for the same IPC call.
- **Files modified:** `src/frontend/screens/Humble/Keys/index.tsx`, `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx`, `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`
- **Verification:** `npx eslint` clean (0 errors, 0 warnings) on all touched files; `npm run codecheck` exits 0.
- **Committed in:** `5b505312` (folded into the Task 2 commit before it was made — no separate commit needed since this was caught before staging)

**2. [Rule 3 - Blocking issue] Prettier formatting drift in `index.tsx`**
- **Found during:** Post-commit repo-hygiene check (`npx prettier --check`) run proactively before writing this summary, since the project's pre-push hook enforces `prettier --check .`.
- **Issue:** Three lines in `index.tsx` (a ternary assignment, a `FontAwesomeIcon` JSX call, and a group-map return) exceeded the project's Prettier line-length/wrapping rules.
- **Fix:** Ran `npx prettier --write` on the single affected file; no logic change, only line-wrapping.
- **Files modified:** `src/frontend/screens/Humble/Keys/index.tsx`
- **Verification:** `npx prettier --check` clean; `npm run codecheck` exits 0.
- **Committed in:** `4ac8d1f0` (separate style commit, since it landed after Task 2's feat commit was already made)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking lint/format issues caught before/after commit, zero scope creep, zero behavior change).
**Impact on plan:** None on functionality. Both fixes are hygiene-only and match pre-existing codebase conventions exactly.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None — no external service configuration required. Zero new npm dependencies (confirmed: no `package.json`/`pnpm-lock.yaml` changes in this plan).

## Next Phase Readiness

- The Humble Keys page is fully wired end-to-end: route, sidebar entry, context-slice consumption, grouped/sorted rendering, fail-soft banner, freshness/progress indicators, and cooldown-gated refresh button.
- `npm run codecheck` exits 0; `npx eslint` on all touched files is clean; `npx prettier --check` is clean; no hard-coded hex colors in the new CSS (verified by grep per the plan's acceptance criteria).
- Manual visual UAT against a real connected account (real key data, real sync failures/cooldowns) is explicitly deferred to Plan 05 per this plan's `<verification>` section — nothing here has been exercised against the live Humble API yet.
- No blockers for Plan 05.

---
*Phase: 11-library-sync-5-state-key-model*
*Completed: 2026-07-05*

## Self-Check: PASSED

All 4 created files + 3 modified files verified present on disk with expected
content; all 3 commits (37171d8a, 5b505312, 4ac8d1f0) verified present in
`git log --oneline --all`.
