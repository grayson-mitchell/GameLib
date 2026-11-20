---
quick_id: 260822-hrf
title: Close phase 34.9 deferred-ledger items 21, 22, 23, 24 and 11
phase_ref: 34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co
status: complete
segments: 3
completed: 2026-08-22
---

# Quick 260822-hrf: Close phase 34.9 deferred-ledger items 21, 22, 23, 24 and 11 — Summary

One-liner: fixed four narrowly-scoped defects (sweep-tool case-sensitivity, a signal-handler
startup race, missing SIGHUP regression coverage, generalizing a mac-only dist cleaner) and one
doc-accuracy defect (stale execution-path comments), then re-proved and re-ledgered all five so
`34.9-REVIEW-SWEEP-CHECK.cjs` reports `REVIEW-SWEEP-OK 24/24 mapped, unmapped 0`.

## Segments and commits

**Segment A — Tasks 1-3** (independent single-file fixes):
- `a850e9d66` fix(quick-260822-hrf): make sweep tool's self-citation ban case-insensitive (item 21 / C4-05)
- `b938aaace` test(quick-260822-hrf): pin SIGHUP forwarding with a non-vacuity control (item 23 / C5-02)
- `06d7f6555` fix(quick-260822-hrf): register signal handlers before mkdtempSync (item 22 / C5-01)

**Segment B — Tasks 4-5** (dist-cleaner generalization + doc-accuracy pass, sequential because
Task 5's census runs against the tree Task 4 leaves behind):
- `df7af9f4a` refactor(quick-260822-hrf): rename cleanDistMac to cleanDist ahead of generalization
- `ab1ee0448` feat(quick-260822-hrf): generalize dist cleaner to win + linux (item 11 / IN-03)
- `5af220b4b` fix(260822-hrf): correct stale node_modules/.cache doc comments, pin against package.json (item 24 / E-02)

**Segment C — Tasks 6-7** (proof re-run + ledger closure, this execution):
- `3b0973c32` docs(quick-260822-hrf): re-run 34.9 wrapper/pipe chain proofs against renamed cleanDist.ts
- `83b6a374e` docs(quick-260822-hrf): flip ledger items 11/21/22/23/24 to closed, re-run sweep 24/24

## Task 5's live census and its discrepancy with the ledger's recorded 12

Item 24's own text (opened 2026-08-15) recorded a census of **12** `meta/*.ts` files carrying a
stale `node_modules/.cache` execution-path comment. A live re-census at fix time
(`grep -rln "node_modules/\.cache" meta/*.ts`) found **13** distinct files had carried the pattern
across the item's lifetime, not 12: `meta/buildDecompressWorkerDev.ts` was added to the repository
after item 24 was written and carried the identical stale-comment pattern, so it was never part of
the original 12 named. Conversely, one of the originally-named 12 —
`meta/cleanDistMac.ts` — no longer needed touching by Task 5's own commit: Task 4 (`ab1ee0448`)
had already rewritten it end to end while generalizing it for IN-03 (after renaming it to
`meta/cleanDist.ts` in `df7af9f4a`), and that rewrite incidentally removed its stale
`node_modules/.cache` references before Task 5 ran. `5af220b4b`'s own diffstat therefore touches
12 `meta/*.ts` files — the original 11 (of the named 12) still needing the fix, plus the one new
arrival (`buildDecompressWorkerDev.ts`) — not 13 and not the original 12's exact membership. A
post-fix census across all of `meta/*.ts` confirms zero remaining matches. The ledger's own
disposition-table sentence and item 24's section still read "twelve" as originally written; this
task did not silently correct that number in place — see item 24's 2026-08-22 closure note in
`deferred-items.md` for the full reconciliation, which is deliberately recorded as an addendum,
not a rewrite.

## The residue decision (Task 5) and its reason

Task 5 deleted 10 stale `node_modules/.cache/*.cjs` residue files (untracked, gitignored) whose
mere on-disk presence had been laundering the wrong doc comments into looking accurate — a stale
comment describing a real file on disk reads as true even when the file is a leftover from a
retired build mechanism. Two directories, `gamelib-pipe-proof/` and `gamelib-wrapper-proof/`, were
left alone per the plan's own scoping: they are proof-run scratch artifacts unrelated to the
`node_modules/.cache` compile-then-run mechanism this item's defect concerns, and deleting them was
never part of item 24's named precondition.

## Task 6 re-run results, row by row

**Direction A (15 scripts x 2 shapes, `34.9-WRAPPER-PROOF.md`):** all 30 cells re-run live against
the tree as edited by Tasks 1-5 (post-rename `meta/cleanDist.ts`, post-generalization). All 30
**PASS**. Full per-row table is in `34.9-WRAPPER-PROOF.md`'s own 2026-08-22 addendum. Notable
methodology note: row 13 (`clean:dist-mac`) now targets `meta/cleanDist.ts --platform=mac`, not the
retired `meta/cleanDistMac.ts`.

**Direction B row 11 (build-runners-onedir SIGTERM, `34.9-WRAPPER-PROOF.md`):** re-run live. **PASS**
— exit 143, wrapper and `pnpm` PIDs confirmed dead, tmpdir absent, `public/bin/`/`build/bin/`
318-file trees byte-identical to their pre-run state.

**Chain proof C-cheap (`34.9-PIPE-PROOF.md`):** broke `meta/cleanDist.ts` (S2), ran `pnpm dist:mac`.
**PASS** — exit 1, chain aborted at the very first `&&` step (`clean:dist-mac`) before
`build-steam-bridge` ever started, `dist/` unchanged (byte-identical `builder-debug.yml` before and
after), error correctly names the current file `meta/cleanDist.ts:1:7`, not the retired
`meta/cleanDistMac.ts`.

**Chain proof C-load (`34.9-PIPE-PROOF.md`):** broke `meta/verifyRunnerBundle.ts` (S2, same file,
not renamed by this task), ran `pnpm dist:mac`. **PASS** — `clean:dist-mac`, `build-steam-bridge`,
and the full `electron-vite build` all completed healthily (renderer `✓ built in 6.92s`,
`preserve-runner-symlinks` restored 12 symlinks), then aborted at `verify:runner-bundle` with the
esbuild literal naming `meta/verifyRunnerBundle.ts:1:7`. One citation drifted: the original proof
recorded this error at log line 184; the live re-run put it at line 180 (a 4-line shift, most
plausibly from vite chunk-warning output length differing between runs). No `electron-builder
version=` banner appeared in either chain run; `dist/` was never touched by either.

Both proof documents were restored via `cp` + `shasum -a 256` equality after every injected break,
and `git status --porcelain -- meta/ package.json` was confirmed empty after each row throughout
Task 6 — no injected break was ever left in the committed tree.

## Pre-fix RED observations (items 21, 22, 23)

- **Item 21 (C4-05):** pre-fix, `34.9-REVIEW-SWEEP-CHECK.cjs`'s FIXED-row citation check scored a
  synthetic fixture with a mixed-case self-citing evidence cell (e.g. `Summary`) as clean — `1/1
  mapped, unmapped 0`, exit 0 — despite the citation being exactly the self-referential pattern the
  check exists to reject. Post-fix, the identical fixture is correctly rejected
  (`FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING`, exit 1).
- **Item 22 (C5-01):** pre-fix, a SIGTERM landing inside the window between process start and
  `mkdtempSync` in `meta/runTs.cjs` hit Node's default signal disposition — the process terminated
  immediately with no `'exit'` event and no cleanup, and (once a tmpdir existed) any tmpdir already
  created would survive on disk. Reproduced manually against the pre-fix ordering during Task 3
  before the fix landed.
- **Item 23 (C5-02):** pre-fix, no test existed that could fail if SIGHUP forwarding silently broke
  — the only proof was manual, one-off, and unrepeatable. T7's non-vacuity control demonstrates the
  gap directly: against a generated probe copy with SIGHUP removed from `FORWARDED_SIGNALS`, the
  wrapper is killed by Node's default disposition instead of forwarding, the child is orphaned, and
  the tmpdir leaks — proving T6 (the positive assertion) is capable of failing, not just capable of
  passing.

## Ledger and sweep state after this execution

`deferred-items.md` items 11 (IN-03), 21 (C4-05), 22 (C5-01), 23 (C5-02) flipped from DEFERRED to
FIXED in their disposition tables, each Evidence cell citing the landing commit, a `34.9-N` plan
lineage, and either a `meta/`-path artifact or a `verdict`/`PASS` reproducible-result citation, so
`scoreFixedRow()` accepts each row. Item 24 (E-02) is closed in prose only — its `E-02` ID shape is
not one of the `C<n>-<nn>` / `CR-<nn>` / `WR-<nn>` / `IN-<nn>` shapes the sweep tool recognizes, so
there is no disposition-table row for it to flip. All five sections carry a dated
2026-08-22 closure note appended after their original Blocker / Named-precondition / OWNER text,
which is left unedited. Item 11's UNCONFIRMED win/linux caveat is carried forward verbatim in its
closure note: win/linux coverage remains synthetic-fixture-only (this machine is macOS arm64 with
no win/linux build to run live), and the closure note does not assert or imply a live win/linux
observation.

`node .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-SWEEP-CHECK.cjs`
reports:
```
REVIEW-SWEEP-OK 24/24 mapped, unmapped 0
```
exit 0.

## Verification (run at end of Segment C, per plan)

| Check | Result |
| --- | --- |
| `pnpm jest meta/__tests__` | 1 failed, 1 skipped, 506 passed, 508 total — sole failure is the known pre-existing `genI18nGateScope` A-17 case |
| `pnpm codecheck` (`tsc --noEmit`) | clean |
| `node .../34.9-REVIEW-SWEEP-CHECK.cjs` | `REVIEW-SWEEP-OK 24/24 mapped, unmapped 0`, exit 0 |
| `grep -rln "node_modules/\.cache" meta/*.ts` | zero files |
| `git status --porcelain -- meta/ package.json` | empty |
| `ls -d $TMPDIR/gamelib-runts-* 2>/dev/null \| wc -l` | 0 |
| `git status --short .planning/STATE.md` | empty (untouched, per plan) |

## Deviations from Plan

None — Segment C executed exactly as scoped. `.planning/STATE.md` was intentionally left untouched
throughout this quick task, per the plan's own explicit instruction (no `gsd-sdk state.*` /
`roadmap.*` / `query commit` verb used anywhere); this is a plan directive, not an omission.

## Self-Check

Verified commits exist:
```
git log --oneline --all | grep 260822-hrf
```
All 8 commits present: `a850e9d66`, `b938aaace`, `06d7f6555`, `df7af9f4a`, `ab1ee0448`,
`5af220b4b`, `3b0973c32`, `83b6a374e`.

Verified files exist:
- `.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-WRAPPER-PROOF.md` — FOUND, addendum present
- `.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-PIPE-PROOF.md` — FOUND, addendum present
- `.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/deferred-items.md` — FOUND, all five items closed

## Self-Check: PASSED
