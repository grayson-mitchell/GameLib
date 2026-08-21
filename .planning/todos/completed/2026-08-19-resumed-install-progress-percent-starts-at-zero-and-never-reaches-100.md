---
created: 2026-08-19T11:20:00.000Z
title: "A resumed Steam depot install reports progress from 0% and can never reach 100%"
area: steam/depot/progress
needs: code-fix
status: CLOSED
closed: 2026-08-21
closed_by: "Quick task 260821-nyh"
severity: major
surfaced_by: "Phase 23 plan 23-10 Task 2 (Gate 3 interrupt-resume), observed live by the operator 2026-08-19"
---

## Symptom

Force-quit a native Steam install mid-download, relaunch, and resume it. The download progress
reported to the user **restarts at 0%** even though most of the content is already on disk — and it
**never reaches 100%**. It climbs only to `bytes-fetched-this-run / whole-plan-bytes` and then the
install completes, so the UI appears to stall short of done and jump.

The 0% start is what the operator noticed. The **ceiling is the more damaging half**: on a resume that
skips a lot of content, a fully successful install looks like it froze well short of finished.

## Mechanism

`src/backend/storeManagers/steam/depot.ts`:

- **:1930** `healReconciledFileModes(...)` runs — reconciliation has already decided which files are
  present and correct and will be SKIPPED.
- **:1938** `let doneBytes = 0` — initialized fresh, *after* reconcile. Skipped files contribute
  nothing to it. It only ever accumulates bytes this run actually writes.
- **:1915** `const totalBytes = plan.totalBytes` — the whole plan's summed file sizes from plan-build
  (`:749`, `:757`), completely unaffected by reconcile.
- **:2044** `percent = Math.round((doneBytes / totalBytes) * 100)`.

So the numerator is run-scoped and the denominator is plan-scoped. On a fresh install they agree and
percent is correct; on a resume they are measured over different sets. Same expression feeds the
user-facing bus update at **:2191-2194** (whose WR-03 `clamp to 100` comment shows the opposite
overflow case was considered, but not this one) and the throttle delta at **:2136**.

## Live measurement (Gate 3 run, HUMANKIND 1124300, 2026-08-19)

Killed at **15,538 of 18,809 files**, which was ~83% by file count but only **~26% by bytes** — the
interrupted run had fetched mostly small files and left the bulk assets. Resume series:

```
11:15:32  files=16237  disk=10.07 GB  percent=3%
11:16:02  files=16425  disk=10.44 GB  percent=4%
```

Full series: `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md` Gate 3 record.

**Observed terminal percent: 76%.** The install COMPLETED SUCCESSFULLY at that reading —
`StateFlags 4`, `BytesDownloaded == SizeOnDisk == 37592580261`, all 18,809 files present. The last
`chunk-stream stats` line before the manifest write reads:

```
[Timing] chunk-stream stats @2181s: percent=76% downSpeedMiBs=0.00 diskSpeedMiBs=0.00
  totalAttempts=33267 rotations=2 timeouts=0 ... pool[size=10 busy=0 idle=10 queued=0 ...]
(11:50:16) Writing StateFlags=4 full-ownership manifest for appId 1124300
  (sizeOnDisk=37592580261, buildid=23181593)
```

So a fully successful resumed install's final user-visible progress reading was **76%**, and the
24-point gap is exactly the reconciled-skip bytes. The corresponding census line quantifies the skip
directly: `jobCount=3306 reconciledSkipped=15643` (of `totalFiles=18949`) — 82.6% of files skipped but
only ~24% of bytes, since the skipped files were the small ones.

Note the file-count-vs-bytes gap is itself the reason a naive "it looked ~83% done" intuition is
wrong; any fix must reason in bytes.

## Fix sketch (not prescriptive)

Make numerator and denominator agree on a set. Either:

1. **Seed `doneBytes` with the reconciled-skip byte total** so it means "bytes of the plan present on
   disk" against the unchanged plan-scoped `totalBytes` — preserves "percent of the whole install",
   which is what a user expects, and makes 100% reachable; or
2. **Subtract the skipped bytes from `totalBytes`** so both are run-scoped — makes 100% reachable but
   redefines the number as "percent of the remaining work", which will read oddly against a resumed
   install's own size.

(1) is the better user-facing semantics. Either way `reconcilePartialState` must return the skipped
byte total, which it does not currently surface to this call site.

## Guard against a vacuous test

A fresh install cannot distinguish the two implementations — numerator and denominator agree when
nothing is skipped. Any regression test MUST exercise a plan with a non-empty reconciled-skip set and
assert the terminal percent is 100, and must be shown to FAIL against the current expression. Same
shape as the standing lesson that a gate can be non-vacuous, correctly computed, and still measure the
wrong property.

## Not in scope for Phase 23

Cosmetic/reporting only — it does not affect what lands on disk, the reconcile skip itself, mode
application, or the `StateFlags` decision. Gate 3's contract is the resume's correctness, not its
progress reporting, so this is filed rather than fixed inside 23-10.

---

## Resolution — 2026-08-21, quick task `260821-nyh`

CLOSED. Fixed via **option 1** from the fix sketch above (seed the numerator); option 2
(shrinking `totalBytes`) was rejected for the reason stated there.

**Landed:**

- `src/backend/storeManagers/steam/depot/reconcile.ts` — `ReconcileResult` gained
  `skippedBytes`, accumulated at the `if (verified) continue` branch using the identical
  `Number(file.size)` coercion `plan.totalBytes` is built with, so
  `skippedBytes <= plan.totalBytes` holds by construction. Counting BYTES rather than
  files is load-bearing: this todo's own measurement (82.6% of files, ~24% of bytes) is
  exactly the confusion a file-count implementation would reproduce, so the new
  `reconcile.test.ts` units assert an exact partial SUM, never `> 0`.
- `src/backend/storeManagers/steam/depot.ts` — `downloadDepotFiles` seeds `doneBytes`
  with `reconciledSkippedBytes`. The reconcile-failure `catch` fallback leaves it 0,
  which is correct because that path rebuilds the full job list and re-downloads
  everything.

**Two hazards this todo did not name, found while planning, and handled:**

1. `avgBytesPerSec = doneBytes / elapsedSec` would have consumed the seed and reported a
   fabricated multi-GB/s rate with a near-zero ETA on a resume's first emit. A new
   `runStartBytes` baseline keeps that numerator run-scoped.
2. `lastEmitBytes` had to be seeded too, or the first emit window's `lastDiskSpeed` delta
   reads as the entire seed.

`remaining` and the `bytes:` field become *more* correct under the seed (both now mean
"plan bytes"), and the WR-03 clamp stays — it guards written-byte overshoot, a different
case from the one fixed here.

**Anti-vacuity requirement discharged as specified.** The regression test was committed
ALONE in `38e8fce01`, with the unfixed expression still in place, and observed red:

```
● downloadDepotFiles › a resumed install whose reconciler skipped a NON-EMPTY set of
  files still reports a terminal percent of 100

Expected: 100
Received: 1
```

Its own anti-vacuity assertion (`fetchChunk` called exactly once, never with the skipped
file's chunk sha) PASSED in that same run, proving the failure landed on the percent
assertion and not on a broken fixture — had the fixture's size/sha not matched the bytes
on disk, reconcile would not have skipped anything and the test would have degenerated
into the fresh-install case this todo warned cannot distinguish the two implementations.
Fix landed in `f6e87298e` and the same command went green.

**Verification:** 174/174 across `depot.test.ts`, `reconcile.test.ts` and
`depot.finalize.test.ts` (the last guards that the StateFlags=4 path is untouched — this
change is reporting-only). `pnpm codecheck` (`tsc --noEmit`) clean, which is not optional
here because ts-jest in this repo is transpile-only.

**Not verified live.** The fix is proven by a byte-accurate unit test, not by an observed
resumed install on hardware. The next real interrupt-resume run should confirm the
terminal reading is 100% rather than short of it.
