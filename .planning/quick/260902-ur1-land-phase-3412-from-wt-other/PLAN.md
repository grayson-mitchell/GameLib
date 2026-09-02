---
id: 260902-ur1
slug: land-phase-3412-from-wt-other
date: 2026-09-02
status: in-progress
---

# Quick 260902-ur1 — land Phase 34.12 (the onboarding-tour rework) from `wt/Other`

Consolidation task 2 of 2. `wt/Other` holds **all** of Phase 34.12: 34 commits, 55 files,
34 non-planning (+1834/-332). **Nothing landed piecemeal** — 0 of the 34 non-planning files are
identical to the branch, and every per-plan marker is zero here:

| plan | marker | branch | `wt/Other` |
|---|---|---|---|
| 34.12-01 | `data-tour` in `NavItem` | 0 | 5 |
| 34.12-03 | `data-tour` in `NavTabs` | 0 | 5 |
| 34.12-03 | `data-tour` in `HeroicVersion` / `QuitButton` | 0 | 1 / 1 |
| 34.12-05 | `data-tour` in `SettingsPanel` | 0 | 6 |
| 34.12-06 | `tourDisabled.test.ts` (this plan DELETES it) | present | absent |
| 34.12-04 | `SidebarTour.tsx` (moved to `NavShellTour`) | present | absent |

The branch carries a pending todo from **2026-08-25** — `LibraryTour` targets two `data-tour`
anchors Phase 34.11 deleted — which is the exact breakage 34.12 fixes. The fix existed two days
earlier and never arrived.

## Merge shape (measured with read-only `git merge-tree`)

55 files, **4 conflicting paths, all `content`** — no add/add, rename/delete or modify/delete:

| path | nature |
|---|---|
| `.planning/STATE.md` | append-style bookkeeping, both sides added rows |
| `meta/i18nForkTouchedFiles.json` | the A-17 artifact; both sides re-baselined |
| `public/locales/en/translation.json` | see below — NOT a simple take-one-side |
| `src/frontend/components/UI/Header/index.css` | the only real code conflict |

8 files are NEW (7 test suites + `NavShellTour/index.tsx`).

## The i18n decision this merge forces

`tour.*` lives in `translation.json` on BOTH branches (upstream Heroic namespace). Comparing the
`tour` subtree: `wt/Other` adds exactly one new top-level key, **`tour.nav`**, and changes
`tour.library`; all six others are byte-identical.

`tour.nav.*` is fork-authored NavShell content, so **D-05 puts it in `gamelib.json`, not
`translation.json`** — a convention established 2026-09-01 by quick `260901-ud5`, nine days AFTER
34.12 was written. `NavShellTour` also legitimately reuses upstream `tour.sidebar.*` keys, which
stay where they are.

The rest of `wt/Other`'s `translation.json` diff is unrelated catalog-refresh noise from a
`pnpm i18n` run on 2026-08-22 (Steam/Humble/bottle keys, an `INLINE-DEFAULT-SENTINEL`, and an
empty `box.repair.error`). Those keys have since been re-homed into `gamelib.json` by `260901-ud5`.
**Taking `wt/Other`'s side of this file wholesale would resurrect fork strings in
`translation.json` and undo that work.**

## Tasks

1. Merge `wt/Other`; resolve the 4 conflicts.
2. `translation.json`: take OURS as the base, port ONLY `tour.library`'s change if it is upstream-
   shaped; do NOT take the catalog-refresh noise.
3. Re-home `tour.nav.*` into `gamelib.json` and repoint `NavShellTour`'s `t()` calls at the
   `gamelib:` namespace.
4. Re-baseline the A-17 artifact + count pins + debt for the new fork-touched files (same
   coordinated edit as `260902-qs4`/`260902-rpa`; NO regen).
5. Verify, including `navTourAnchorCensus` — the gate 34.12-06 adds, which is what proves the
   anchors still match a NavShell that has since moved on 867 commits.

## Constraints

- NEVER `git checkout -- <file>` / `git stash` / `git reset --hard`. `git merge --abort` is the
  escape hatch and fires no post-checkout hook.
- Do NOT run `pnpm gen-i18n-gate-scope` (regen turns 1 failure into 5).
- `pnpm i18n --fail-on-update` WRITES locale files even when it passes — check
  `git status -- public/locales/` after every run.
- New/fork strings go in `gamelib.json`, NEVER `translation.json`.
- `wt/Other` is checked out at `/Users/graysonmitchell/Projects/GameLib-wt/Other` — do not disturb
  that worktree.

## Success criteria

- Full `pnpm test` 0 failing suites; lint 0 errors; prettier + tsc clean.
- `navTourAnchorCensus.test.ts` green — the anchors 34.12 placed still resolve post-34.13.
- `tourDisabled.test.ts` gone, `SidebarTour.tsx` gone, `NavShellTour/index.tsx` present.
- The 2026-08-25 LibraryTour-dead-anchors todo closed on evidence.
