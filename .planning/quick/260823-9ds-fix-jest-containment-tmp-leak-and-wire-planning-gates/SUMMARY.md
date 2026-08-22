---
quick_id: 260823-9ds
slug: fix-jest-containment-tmp-leak-and-wire-planning-gates
status: complete
completed: 2026-08-23
commits: [2a121ac90, e33dc2744, 22d7895c4]
closes: [34.2-REVIEW-GAP-CYCLE-4 WR-01, 34.2-REVIEW-GAP-CYCLE-4 WR-11]
---

# Summary

## WR-01 — containment temp-directory leak (`2a121ac90`)

`ensureContainmentRoot()` memoized on `globalThis`, but jest gives every test
FILE a fresh sandbox global, so the memo never hit across files. A 174-suite
run added 174 top-level directories and removed none. **It now adds 1.**

Three memo seams were probed empirically first; two do not work:

| Seam | Result |
|---|---|
| `globalThis` | Sandboxed per test FILE. This was the bug. |
| `process.env` from `setupFiles` | **Also sandboxed per file.** Three files in ONE worker (identical pid) read back three different values. The obvious fix is inert. |
| `globalSetup` | Runs once in the parent before workers fork; workers inherit its env. **This is the seam used.** |

The review's prescribed fix was deliberately NOT applied — it writes a marker
file at the predictable path `gamelib-jest-home-pid{pid}`, reintroducing the
symlink-capture vector cycle-3's WR-07 closed. `mkdtemp` unpredictability and
mode 0700 both survive unchanged.

**The first version of this fix was wrong, and the suite caught it.** Sharing
one root across all suites broke ISOLATION: `settingsFlows.test.ts` read a
legendary user record written by an unrelated suite and got the developer's
real username where it asserts `undefined`. The per-file root had been
silently providing a pristine HOME per suite, not merely containment. Final
design keeps a per-file directory, NESTED inside one reapable run root —
isolation byte-identical to before, only the parent changed.

Reaping runs at SETUP of the next run, not in a teardown hook (a force-exited
worker skips teardown — `92c29a5e`). Five conditions must hold before any
`rm -rf`, re-stat'd AT delete time rather than from the readdir snapshot.

`jestGlobalSetup.test.ts`, 13 tests, RED-proved. Every negative case is paired
with a positive control. The suite also cleans up after itself — caught while
measuring delta=+2 instead of +1, because it was reproducing WR-01 in
miniature.

**6,057 stale directories purged; TMPDIR 981M → 394M.**

## WR-11 — six unwired planning gates (`e33dc2744`, `22d7895c4`)

Running them for the first time found **two silently red for weeks**:

1. `34.5/preload-surface-gate.py` — `steamRemoveAllCopies` is exposed in
   preload and ported on both builds, but in no bucket line. Root cause worth
   keeping: it was added by a QUICK TASK (`quick-260821-le0`), which does not
   run the phase-level inventory discipline — the same escape route that let
   `oauthCaptureLogin` go unbucketed.
2. `34.4/ported-channels-gate.py` — pinned `(57 channels)` while the inventory
   legitimately says 58 (moved 2026-08-11 by plan 34.5-43, which updated the
   34.5 gate and missed this one). The gate's pin was stale, not the document.

`meta/runPlanningGates.py` discovers by suffix, not a hand-maintained list —
a list would reproduce WR-11 one level up. Fails if fewer than six gates are
found, so a glob that stops matching cannot report green. Wired into
`codecheck.yml`; exposed as `pnpm planning-gates`.

RED-proved three ways: a synthetic failing gate (6/7, exit 1), an empty
`.planning` tree (floor trips), and deleting the CI step (wiring test goes red
on exactly one assertion, green on restore).

## Verification

Backend 175/175 suites, 4021 passed. 6/6 planning gates. `tsc` clean, eslint
0 errors, prettier clean.

**Pre-existing failure, NOT from this work:**
`meta/__tests__/genI18nGateScope.test.ts`'s A-17 anti-rot assertion (committed
`i18nForkTouchedFiles.json` vs live git derivation, 13 `src/frontend/**`
entries). Fails standalone, not only under load; none of these commits touches
a frontend file. Belongs with the Phase 37 UI work that last moved those
components.
