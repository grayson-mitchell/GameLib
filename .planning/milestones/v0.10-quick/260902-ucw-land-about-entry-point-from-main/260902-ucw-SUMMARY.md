---
phase: quick-260902-ucw
plan: 01
status: complete
date: 2026-09-02
commits: [6638b71b9, 5758e6385, ed1727713, 7c61280c0, 9670dcf5f]
files_modified:
  - src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
  - public/locales/en/gamelib.json
  - .planning/phases/34.1-.../34.1-VERIFICATION.md
  - .planning/todos/completed/2026-08-22-about-window-is-unreachable-under-tauri.md
  - .planning/STATE.md
---

# Quick 260902-ucw — landed the About entry point stranded on `main`

First of two consolidation tasks. `main` held 4 commits absent from this branch — the complete
topological set. All four are now landed; **full suite 371/371, 7491 passed** (+1, the new spec).

Verified genuinely missing before starting, not assumed: `showAboutWindow` had **0** references in
the branch's entire `src/frontend`, `about.navLabel` was absent from `en/gamelib.json`, and
`SettingsPanel/index.tsx` contained **0** occurrences of "about". After landing: 2 files, present,
and 7 respectively.

## Two records conflicts — both resolved by keeping the truth, not a side

**The todo had been closed TWICE, by different means, on branches that had already diverged.**
`main` closed `2026-08-22-about-window-is-unreachable-under-tauri` with a Settings-panel row
(quick `260822-tv4`, 2026-08-22); this branch closed it with a Tauri tray item (Phase 35 plan 06,
2026-08-28). Neither author could see the other. **Both records kept**, in chronological order,
with a bridging note. The 08-22 entry argues the tray route was infeasible and declared out of
scope by 34.1 — 35-06 then did it anyway and it worked. That reasoning is left standing, marked
superseded on the facts, because it is why the Settings row exists at all. The two entry points
are complementary, not duplicates.

**A verification record would otherwise have asserted something false.** `dea20f7be` reopened 34.1
item 8b with the text "It now has one (Settings tab -> About)". True on `main`; FALSE here, where
the tray route already existed (`src-tauri/src/main.rs:634`, dispatched `:8161`). The later commit
`69417641b` re-closed 8b as **passed** on a live run, so that supersedes the reopening and was
taken as-is; a dated correction was appended to the resolved record because its reachability
finding ("Tauri's tray deliberately omits it") is no longer true on this branch. Net state:
34.1 `status: passed`, `human_verification: []`, and the tray route explicitly recorded as never
having been watched.

## The zero-match gate caught the fix for a stale comment — twice

The ported comment claimed the row is "shell-agnostic by way of the `isTauri()` switch". True when
written on `main`; Phase 35 plan 17 has since collapsed the Electron-branch fallback, so the
sentence was false here and was corrected rather than ported verbatim.

That correction then failed `meta/__tests__/isTauriRemoved.test.ts` — a **ZERO-MATCH grep for the
bare identifier across all of `src/`, which does not exempt comments**. Draft 1 quoted the old
wording. Draft 2 cited the gate's own filename, which contains the same substring. The shipped
comment describes the helper without naming it and records why, so the token is not reintroduced
by someone documenting its absence.

Same shape as quick `260902-tac` earlier today: a text-matching gate reacting to prose. Both times
the gate was right.

## Verification

| Gate | Result |
|---|---|
| `SettingsPanel.test.tsx` + `destinationCoverage.test.tsx` | 2 suites, 17 tests, green |
| full `pnpm test` | **371/371 suites, 7491 passed, 3 skipped** |
| `pnpm lint` | 4145 problems, **0 errors** |
| `prettier --check .` | clean repo-wide |
| `tsc --noEmit` | clean |
| `pnpm i18n --fail-on-update` | Added 0 / Restored 0, **no writes** under `public/locales/` |
| `hardcodedStringGate` | green (SettingsPanel is in the BLOCKING scope) |

**Note on equivalence.** `git cherry HEAD main` reports 3 of the 4 as NOT patch-equivalent. That is
deliberate — content was changed during resolution (the stale comment, the two-routes corrections,
the merged todo). Content was verified by marker instead. `main` will still show 4 commits ahead
by sha until it is realigned.
