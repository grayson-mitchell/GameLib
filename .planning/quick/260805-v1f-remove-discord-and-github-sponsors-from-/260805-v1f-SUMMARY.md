---
phase: quick-260805-v1f
plan: 01
subsystem: ui
tags: [react, i18n, sidebar, jest]

requires: []
provides:
  - "SidebarLinks community group renders only Ko-fi (Discord and GitHub Sponsors entries removed)"
  - "Regression test locking the removal in (SidebarLinks community links describe block)"
  - "Sidebar tour community step copy no longer claims a Discord link"
affects: [sidebar, i18n]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
    - src/frontend/components/UI/Sidebar/components/SidebarLinks/__tests__/index.test.tsx
    - src/frontend/components/UI/Sidebar/components/SidebarTour.tsx
    - public/locales/en/translation.json

key-decisions:
  - "Kept the frontend/helpers 'openDiscordLink' export untouched (still consumed by Settings > Log) and left the IPC/preload surface for openDiscordLink/openGithubSponsorsPage alone — out of scope per plan's threat register (T-v1f-02, accepted)"
  - "Only updated the en locale bundle for the tour copy; non-en bundles still carry the old Discord-mentioning sentence pending the next translation sync (explicitly accepted per plan)"

patterns-established: []

requirements-completed: [QUICK-260805-v1f]

duration: 12min
completed: 2026-08-05
---

# Quick Task 260805-v1f: Remove Discord and GitHub Sponsors from Sidebar Summary

**Removed the Discord and GitHub Sponsors sidebar entries (dead imports and all), leaving only Ko-fi in the community group, and updated the sidebar tour copy to match**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-08-05T10:26:09Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `SidebarLinks` community group (`data-tour="sidebar-community"`) now renders only the Ko-fi button; Discord and GitHub Sponsors `SidebarItem`s are gone
- Dead `faDiscord`/`faGithub` (`@fortawesome/free-brands-svg-icons`) and `openDiscordLink` (`frontend/helpers`) imports removed from the component
- New regression test (`SidebarLinks community links` describe block) asserts `'Discord'` and `'GitHub Sponsors'` labels are absent and `'Ko-fi'` is present, following TDD RED → GREEN
- Obsolete `jest.mock('frontend/helpers', ...)` and its justifying docstring sentence removed from the test file now that the component no longer imports that module
- Sidebar tour's community step (`tour.sidebar.community`) no longer promises a Discord link — both the `SidebarTour.tsx` inline default and the `en` translation bundle now read `"Support GameLib's development."`

## Task Commits

Each task was committed atomically:

1. **Task 1a (RED): failing community-links assertion** - `d3014149b` (test)
2. **Task 1b (GREEN): remove Discord/GitHub Sponsors entries + dead imports + obsolete mock** - `ac5d3d795` (feat)
3. **Task 2: update sidebar tour copy (component + en locale)** - `835a4d6e8` (docs)

_TDD task (Task 1) produced two commits: test (RED) then feat (GREEN). No refactor step was needed — the removal was already minimal._

## Files Created/Modified
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` - Deleted the Discord and GitHub Sponsors `SidebarItem`s from the community div; removed the now-dead `@fortawesome/free-brands-svg-icons` and `frontend/helpers` imports; Ko-fi item and wrapping div untouched
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/__tests__/index.test.tsx` - Added `SidebarLinks community links` describe block with a `labelsOf` helper asserting the two removed labels are absent and Ko-fi is present; removed the obsolete `frontend/helpers` jest mock and its docstring justification
- `src/frontend/components/UI/Sidebar/components/SidebarTour.tsx` - Changed the `tour.sidebar.community` `t()` call's default string from "Join our community on Discord and support GameLib's development." to "Support GameLib's development."; key name and `element` selector untouched
- `public/locales/en/translation.json` - Updated the `tour.sidebar.community` value to match the new inline default text

## Decisions Made
- Left `openDiscordLink` in `frontend/helpers` alone since `LogSettings/index.tsx` still imports and uses it for the Settings > Log "Join our Discord" button — matches the plan's explicit scope boundary
- Left the `openDiscordLink`/`openGithubSponsorsPage` IPC listeners (main.ts, sidecar registration, preload API, ipc.ts) untouched — accepted as inert dead surface per the plan's threat register (T-v1f-02), removing them would break `shellFilesFlows.test.ts` and widen scope beyond a sidebar-only change
- Left the `userselector.discord` translation key in place (upstream-owned, still referenced elsewhere)
- Did not hand-edit the ~30 non-en locale bundles for the tour copy change — recorded as an accepted follow-up per the plan, to be picked up by the next translation sync rather than done ad hoc here

## Deviations from Plan

None - plan executed exactly as written. The test file's existing `labelsOf` helper duplication note in the plan ("lift to module scope or duplicate — pick whichever keeps the diff smallest") was resolved by duplicating the three-line helper in the new describe block, matching the existing pattern already used in the `SidebarLinks account item` block.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Verification Performed
- `pnpm exec jest src/frontend/components/UI/Sidebar/components/SidebarLinks` — 8/8 passing, including the new community-links test
- `pnpm exec jest src/frontend/components/UI/Sidebar` — full Sidebar suite green
- `pnpm codecheck` (`tsc --noEmit`) — clean, no errors from removed imports
- `pnpm exec eslint src/frontend/components/UI/Sidebar/components/SidebarLinks` — clean
- `pnpm exec eslint src/frontend/components/UI/Sidebar/components/SidebarTour.tsx` — clean
- `pnpm exec eslint src/frontend/components/UI/Sidebar` (broader scope) — 0 errors, only pre-existing warnings in unrelated files (`CurrentDownload/index.tsx`, `HeroicVersion/index.tsx`, `Sidebar/index.tsx`), out of scope per plan boundary
- `grep -c "faDiscord\|faGithub\|GitHub Sponsors\|openDiscordLink" index.tsx` → `0`; `grep -q "Ko-fi" index.tsx` → found
- `grep -riq "discord" SidebarTour.tsx` → not found (exit 1)
- `node -e "JSON.parse(...)"` on `public/locales/en/translation.json` — parses cleanly

## Next Phase Readiness
This was a self-contained UI cleanup with no downstream dependencies. No blockers for other in-flight work (Phase 34.4.2, 34.7, 34.8).

---
*Quick task: 260805-v1f*
*Completed: 2026-08-05*

## Self-Check: PASSED

All 3 commit hashes (`d3014149b`, `ac5d3d795`, `835a4d6e8`) found in `git log --oneline --all`. All 5 referenced files confirmed present on disk.
