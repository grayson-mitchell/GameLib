---
phase: 21-steam-native-install
reviewed: 2026-07-19T10:43:58Z
depth: standard
scope: gap-closure (21-17 D-UAT-09 — incomplete install mislabeled Installed/Play)
diff_base: 452ec85c^
files_reviewed: 7
files_reviewed_list:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/frontend/hooks/constants.ts
  - src/frontend/hooks/hasStatus.ts
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-07-19T10:43:58Z
**Depth:** standard (--gaps-only, scoped to 21-17 diff `452ec85c^..a03c1ad8`)
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the 21-17 gap-closure (closes D-UAT-09). The change set has four moving parts:
(1) `isFullyInstalledStateFlags` centralizing the bit-4 completeness predicate,
(2) `markSteamInstallIncomplete` marking a same-session cancel as resumable,
(3) an abort-aware depot `finalize` that forces `outcome: 'cancelled'`, and
(4) frontend "Finish in Steam"/resume gating in MainButton/GameStatus/hasStatus.

The core safety invariant — **never render Play for an incomplete install** — holds on every
path I traced, because both the same-session marker and the on-disk 1026 ACF keep
`is_installed` false. The predicate centralization is a clean, correct refactor (NaN inputs
fail closed via `NaN & 4 === 0`, matching prior behavior).

The defects found are durability/consistency gaps in the *labeling* half of the fix, not the
safety half. The most important is that a mid-session library `refresh()` silently wipes the
same-session `steamResumePending` marker, reverting "Finish in Steam" back to a bare "Install".

No structural-findings block was provided, so this report is narrative-only.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Mid-session `refresh()` wipes the same-session incomplete marker, reverting "Finish in Steam" to "Install"

**File:** `src/backend/storeManagers/steam/library.ts:575-618` (interacts with `markSteamInstallIncomplete` at `342-356`)
**Issue:**
`markSteamInstallIncomplete` sets `install: { ...existing.install, steamResumePending: true }`
in memory and persists it. But `refresh()` does `library.clear()` (line 575) and rebuilds every
`GameInfo` from scratch — the `install` object it constructs (lines 609-618) is derived purely
from the ACF scan and **never re-seeds `steamResumePending`**. The method's own header comment
(lines 565-569) explicitly notes this resync "can be triggered mid-session (e.g. the
launch-completion 'done' status)". So after a same-session cancel, the first mid-session
`refresh()` erases the marker. `is_installed` stays correctly `false` (finalize wrote a 1026
manifest, so `buildInstalledMap` excludes it — the Play-safety invariant survives), but:
- MainButton falls through from "Finish in Steam" back to the generic **"Install"** label.
- `hasStatus` no longer derives `statusContext === 'steam-incomplete'`, so GameStatus reverts to
  the generic "This game is not installed" copy.

This is precisely the D-UAT-09 symptom the plan set out to eliminate, resurfacing after any
resync. Clicking Install still resumes correctly, so it is a UX regression of the fix, not a
data/safety failure — hence WARNING, not BLOCKER. The existing tests (library.test.ts Test E)
cover `markSteamInstallIncomplete` in isolation but none assert the flag survives `refresh()`, so
the gap is untested.
**Fix:** Preserve the resumable flag across resync — re-seed it from the prior in-memory entry (or
from the interrupted-ACF detection). Capture the prior value before `library.clear()`:
```ts
// before library.clear(): const priorResume = new Map(
//   Array.from(library.values()).map(g => [g.app_name, g.install?.steamResumePending]))
install: installedData
  ? { install_path: ..., install_size: ..., platform: ... }
  : priorResume.get(appIdStr)
    ? { steamResumePending: true }
    : {},
```
Alternatively, run the startup interrupted-ACF scan at the tail of `refresh()` so any 1026-on-disk
manifest deterministically re-flags `steamResumePending`.

### WR-02: Aborted zero-depot install returns `{ status: 'done' }`, bypassing `markSteamInstallIncomplete`

**File:** `src/backend/storeManagers/steam/depot.ts:2072-2077`
**Issue:**
```ts
if (!plan.depots.length) {
  await finalize()          // forces outcome:'cancelled' when opts.signal.aborted
  return { status: 'done' } // ...but reports 'done' regardless of the abort
}
```
If the signal is aborted after `buildDepotPlan` resolves with zero depots, `finalize` correctly
writes a `cancelled`/1026 manifest, but the function still returns `done`. In
`games.ts:runNativeDepotDownload` that `done` skips the `outcome.status === 'cancelled'` branch
(line 913), so `markSteamInstallIncomplete` is never called and the flow proceeds to start ACF
polling as if the install succeeded. The Play-safety invariant still holds (the 1026 ACF keeps
`is_installed` false on the next scan), but the abort→cancelled→mark chain the plan relies on is
broken for this edge, and the user's cancel is reported as a completed install. This contradicts
the abort-awareness that lines 2119 and 2152 add on the other two return paths.
**Fix:** Honor the abort on the early return, mirroring the main path:
```ts
if (!plan.depots.length) {
  await finalize()
  return opts.signal?.aborted === true
    ? { status: 'cancelled' }
    : { status: 'done' }
}
```

### WR-03: `markSteamInstallIncomplete` flips `is_installed` to false unconditionally, without confirming on-disk state

**File:** `src/backend/storeManagers/steam/library.ts:342-356`
**Issue:**
The helper hard-sets `is_installed: false` for whatever entry it is handed, on the assumption the
caller only invokes it from the cancelled branch of a fresh native install. That assumption is
currently true (install is gated behind `!is_installed` in the UI), but the helper is an exported,
reusable surface with no guard of its own. If it is ever called — or the cancelled branch is ever
reached — for an appId whose files are actually fully present on disk (a re-install/verify/resume
of an already-complete title that the user cancels), it will mislabel a genuinely-installed game
as not-installed and force a spurious resume. Given the D-UAT-09 lineage of mislabeling installed
games, this is worth hardening.
**Fix:** Either document the precondition as a hard contract at the call site, or make the helper
self-consistent by only flipping `is_installed` when the on-disk ACF is not bit-4 set (reuse
`readAcfState` + `isFullyInstalledStateFlags`), leaving a truly-complete manifest untouched.

## Info

### IN-01: Redundant `!is.installing && !is.queued` guards in MainButton's new branch

**File:** `src/frontend/screens/Game/GamePage/components/MainButton.tsx:217-223`
**Issue:** The new "Finish in Steam" block is reached only after the earlier `if (is.installing)`
(line 201) and `if (is.queued)` (line 151) branches have already `return`ed, so `!is.installing`
and `!is.queued` here can never be false. Harmless but dead defensive conditions that can mislead
a future reader into thinking those states are still live at this point.
**Fix:** Drop the two redundant clauses, or add a comment noting they are defensive only.

### IN-02: Two different predicates express the same "incomplete" UI decision

**File:** `src/frontend/screens/Game/GamePage/components/GameStatus.tsx:139` vs `MainButton.tsx:217-223`
**Issue:** GameStatus keys off `statusContext === 'steam-incomplete'` while MainButton keys off
`gameInfo.install?.steamResumePending`. Both ultimately derive from `steamResumePending`
(GameStatus's context is produced by `hasStatus` from that same field), so they agree today. But
they read through two different code paths (`hasStatus` derivation vs the raw prop), so a future
change to either path can desync the label between the button and the status line.
**Fix:** Standardize both components on one predicate for the incomplete-install case.

---

_Reviewed: 2026-07-19T10:43:58Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
