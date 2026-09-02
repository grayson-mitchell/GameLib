---
phase: quick-260902-ur1
plan: 01
status: complete
date: 2026-09-02
commits: [4ccf0261c, a0a1deb2a]
---

# Quick 260902-ur1 — landed Phase 34.12 (onboarding-tour rework) from `wt/Other`

Consolidation task 2 of 2. All 34 commits of Phase 34.12 existed only on the `wt/Other` worktree
branch. **Full suite 377/377, 7541 passed** — up from 371/7491, the six new 34.12 suites included.

## It was entirely absent, verified per plan

0 of `wt/Other`'s 34 non-planning files were identical here. Markers, branch vs `wt/Other`:
`data-tour` in `NavItem` 0/5, `NavTabs` 0/5, `HeroicVersion` 0/1, `QuitButton` 0/1,
`SettingsPanel` 0/6. And the two files 34.12 *removes* — `SidebarTour.tsx`, `tourDisabled.test.ts`
— were both still present. Nothing had landed piecemeal.

## Six conflicts, each resolved on evidence

| path | resolution |
|---|---|
| `SettingsPanel.test.tsx`, `destinationCoverage.test.tsx` | About (landed earlier today) and 34.12 both edited the entry list. Merged component keeps both, so: `About, Ko-fi, App Tour`; title `twelve` → `thirteen`. |
| `Header/index.css` | ours was EMPTY — 34.11 WR-19 scoped this file to `.Header`. Kept the two group rules 34.12-02 genuinely uses; **dropped** `.iconsWrapper`, `.refreshIcon`, `@keyframes refreshing`. |
| `translation.json` | ours + exactly the 6 tour keys. Rejected wt/Other's catalog-refresh noise. |
| `meta/i18nForkTouchedFiles.json` | recomputed, not side-picked — it is a derived artifact. |
| `.planning/STATE.md` | ours; wt/Other's copy is an 867-commit-old snapshot. |

**Two would have caused real damage if taken wholesale.** `Header/index.css`: WR-19 relocated
`.iconsWrapper`/`.refreshIcon`/`@keyframes refreshing` to `Settings/`, `ErrorComponent/` and
`UpdateComponent/`, and `tier2Portal.test.ts` is a gate that FAILS if this file carries them —
taking that side resurrects relocated CSS and reddens the gate. `translation.json`: wt/Other's
side carried a 2026-08-22 `pnpm i18n` refresh including fork strings (`box.repair.error` empty,
an `INLINE-DEFAULT-SENTINEL`, Steam/Humble/bottle keys) that `260901-ud5` has since re-homed into
`gamelib.json` — taking it undoes D-05. Verified the result adds exactly 6 keys vs HEAD, removes
none, changes none.

## The A-17 lesson: a count that does not move is not evidence

The artifact swap — `SidebarTour.tsx` out (deleted), `NavShellTour/index.tsx` in — **nets to
zero**, so the count still read 207 and looked right. It was wrong: 34.12-05 also hardened
`state/TourContext.tsx`, making it fork-touched. Only A-17's comparison against the live git
derivation caught it. Final: artifact **207 → 208**, ten count pins, debt **44 → 45**,
`i18nGateScope.json` **unchanged at 163** (NavShellTour was already listed — 34.12-04's own
`848b58f84` repointed the manifests). A-03 holds: 208 − 163 = 45. No regen.

## Closed on evidence

`.planning/todos/pending/2026-08-25-librarytour-targets-two-deleted-data-tour-anchors.md` →
`completed/`. Its two dead anchors (`library-categories`, `library-filters`) now have **0**
source files; all nine anchors `LibraryTour` targets resolve. The fix (34.12-02, `556a7f8e6`)
predated the todo by three days — it was unmerged, not missing.

## Verification

| Gate | Result |
|---|---|
| full `pnpm test` | **377/377 suites, 7541 passed, 3 skipped** |
| `navTourAnchorCensus` | green — proves the anchors resolve against a NavShell 867 commits newer |
| `tier2Portal` (WR-19) | 26/26 |
| `pnpm lint` | 4148 problems, **0 errors** (ceiling 4157) |
| `prettier --check .` | clean (6 wt/Other files formatted; verified whitespace-only) |
| `tsc --noEmit` | clean |
| `pnpm i18n --fail-on-update` | Added 0 / Restored 0; it rewrote one line — a key **reorder** (`viewsCollections` before `viewToggle`, its sort being case-insensitive). Kept as canonical. |

`--no-verify` was used on the merge commit only; all four gates were then run explicitly.
