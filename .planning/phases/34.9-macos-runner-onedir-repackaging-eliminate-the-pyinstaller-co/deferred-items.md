# Phase 34.9 — Deferred Items

This file records everything this phase's gap cycle 1 deliberately did **not** do. Each entry is a
decision, not an omission: it names a date, the blocker (the mechanism, not a summary), the named
precondition that would unblock it, and an `OWNER:` — the party or future phase responsible for
picking it up. Nothing here is marked complete. Descoped is not done, and it is not forgotten.

The scope fence below was a **user decision recorded 2026-08-11** at gap-planning time, after
`34.9-LIVE-GATE.md`'s FAIL run (verdict FAIL, 4/5 scored items) produced the findings that drove
this gap cycle. Gap cycle 1 (plans `34.9-12`..`34.9-17`) closed F-34.9-01/02/03 and re-ran the
blocking live gate (`34.9-LIVE-GATE-RERUN.md`, verdict PASS 2/2, run 2026-08-11). The items below
were explicitly fenced out of that re-run's scope and remain open.

## Descoped by the 2026-08-11 gap-planning scope fence

### 1. REQ-34.9-02 — CI x64 leg

**What it is:** CI building x64 **and** arm64 runner onedir bundles and publishing both to the
rolling release. Only the arm64 leg has ever been proven, locally.

**Blocker (mechanism, not a summary):** GitHub's `workflow_dispatch` API/CLI refuses to run **any**
workflow that is not also present on the repository's **default branch** (`main`), regardless of
which `--ref` is targeted. `gh workflow run` against `build-runners-onedir-macos.yml` returned
`HTTP 404: workflow build-runners-onedir-macos.yml not found on the default branch` (confirmed
independently via `gh workflow list` and `gh release view`; see `34.9-CI-ROUNDTRIP.md` Outcome C).
Plan 34.9-09's authorization was scoped to the feature branch only (no PR, no push to `main`), so
this cannot be self-resolved from inside a plan.

**Named precondition:** land `.github/workflows/build-runners-onedir-macos.yml` on the repository's
default branch, then dispatch. This is the developer's action — pushing to `main` is outside any
plan's authorization, and this gap cycle deliberately did not do it.

**Consequence, stated explicitly:** the x64 onedir leg **exists nowhere on any machine or in the
repo**. The six `PENDING-CI-PUBLISH` sentinels in `meta/runnersOnedirDigests.json` stay. Phase 34.9
closes on the **arm64 leg only** — this is the scope fence's central consequence, not an incidental
detail.

**OWNER:** follow-up phase / developer action (date recorded: 2026-08-11).

### 2. REQ-34.9-03 — downloader sources darwin archives

**What it is:** `meta/downloadHelperBinaries.ts` sourcing darwin onedir archives from the rolling
release, leaving win32/linux untouched.

**Status:** code complete, path unproven. The downloader code is written and unit-tested, but the
live network sourcing path has never run — it depends on a real published release artifact, which
depends on REQ-34.9-02.

**Blocker:** REQ-34.9-02 (no CI-published darwin archive exists to download).

**Named precondition:** REQ-34.9-02's own precondition (land the workflow on the default branch,
then dispatch), followed by a live run of `pnpm download-helper-binaries` against a real published
release.

**OWNER:** same as REQ-34.9-02 — follow-up phase / developer action (2026-08-11).

### 3. REQ-34.9-04 — sha256 digest verification

**What it is:** darwin archives sha256-verified against in-repo digests before extraction.

**Status:** code complete, never exercised. All six entries in `meta/runnersOnedirDigests.json`
remain `PENDING-CI-PUBLISH` sentinels, which throw by design on this checkout — no real digest has
ever been verified against a real archive.

**Blocker:** REQ-34.9-02 — there is no CI-published digest to verify against.

**Named precondition:** REQ-34.9-02's own precondition.

**OWNER:** same as REQ-34.9-02 — follow-up phase / developer action (2026-08-11).

### 4. REQ-34.9-09 — cold spawn ratio, per-runner

**What it is:** the per-runner cold/warm spawn-time win, MEASURED for legendary and gogdl, not
inferred from nile alone.

**Status:** satisfied-on-WARM, cold gap named. The WARM ratio is measured and valid for all three
runners (nile 32.5x, legendary 26.6x, gogdl 27.2x — `34.9-MEASUREMENT.md` §8.4). The COLD ratio is
UNMEASURED for legendary and gogdl.

**Blocker:** two attempted cold-measurement runs (plan 34.9-03) both failed their own harness
validity anchor — neither produced a trustworthy cold reading.

**Named precondition:** a valid cold-measurement run for legendary and gogdl, using a harness that
passes its own validity anchor.

**OWNER:** not scheduled; do NOT plan a third attempt (this is the explicit gap-planning decision,
2026-08-11 — a third attempt is not authorized by this scope fence).

### 5. Tauri-PACKAGED resolution

**What it is:** proving that runner resolution (the same nested-onedir-path mechanism REQ-34.9-06
proves for Tauri DEV and REQ-34.9-08 proves for Electron PACKAGED) also works under a packaged,
non-dev Tauri build.

**Status:** UNPROVEN, unscored — not a regression, never proven in the first place.

**Blocker:** `R-34.5-G1-PKG` (Phase 34.5 `deferred-items.md` item 12, dated 2026-07-29/2026-08-07),
which pre-dates this phase entirely. The packaged Tauri asset root does not resolve because
`electronStub.app.isPackaged` stays `false` under the sidecar, so `publicDir` unconditionally
appends `'public'` to a resource root (Tauri's `resource_dir()`) that has no such child. This is a
build/bundle-layout question, not an IPC-channel gap, and this phase's own gap cycle touches
neither `isPackaged` nor `publicDir`.

**Named precondition:** whichever plan first exercises a packaged (non-dev) Tauri build.

**OWNER:** Phase 34.5's deferred item 12 / the first packaged-Tauri plan (pre-dates 2026-08-11;
restated here 2026-08-11 as still open).

### 6. Real-certificate signing and notarization

**What it is:** notarizing a packaged macOS build with a real Apple Developer certificate, rather
than the adhoc/unsigned proxy this phase used throughout.

**Status:** out of scope for this phase entirely, not merely this gap cycle.

**Blocker:** D-03/D-04 — no Apple Developer Program credentials enrolled.

**Named precondition:** Apple Developer Program enrollment.

**OWNER:** developer action (2026-08-11 — restated, not newly discovered; this decision pre-dates
the gap cycle and is unchanged by it).

## Out-of-scope defects observed during the 2026-08-11 gate run

Both defects below were observed live during the 2026-08-11 FAIL-run gate (`34.9-LIVE-GATE.md`,
"Two further defects were observed and are recorded as out of scope for this verdict" — see that
document for the verbatim source). Both live in generic UI components this phase never touched, and
no item this phase scored depended on either. **Recorded here, not fixed.**

### 7. Silent, intermittent file-picker failure

`electronStub.showOpenDialog` converts every failure — timeout, unknown channel, permission
denial — into `{canceled: true, filePaths: []}`, byte-identical to a genuine user cancel. Its only
diagnostic is a `console.warn` call from the sidecar, and the sidecar's stdout IS the RPC frame
pipe — that `console.warn` reaches no readable sink at all
(`sidecar-console-and-logger-are-invisible`, this project's standing note). One picker attempt
during the 2026-08-11 gate run beeped, would not navigate, and committed nothing; a later attempt
on the same machine, same session, succeeded. Intermittent, not categorically broken — which makes
it worse to diagnose, not better.

**OWNER: Phase 35 (Electron cutover)**, which owns `electronStub.ts` directly (2026-08-11).

### 8. `PathSelectionBox` discards typed input unless the field is blurred

`PathSelectionBox` commits via `onBlur={(e) => onPathChange(e.target.value)}` with no Enter handler
anywhere in the `PathSelectionBox` → `TextInputWithIconField` → `TextInputField` chain. Pressing
Enter does nothing, and there is no affordance telling the user that. Separately, pasting into the
field during the 2026-08-11 gate run produced a repeating unrenderable glyph rather than the
clipboard text — consistent with this project's standing note that `navigator.clipboard` silently
no-ops under the Tauri/WKWebView host (`navigator-clipboard-noops-under-tauri.md`), which is the
likely root cause of the paste half of this defect, though it was not independently re-confirmed
here.

**OWNER: UNASSIGNED — no UI-owning phase remains after 34.11; developer decision owed** on where
this lands (2026-08-11).

## Pre-existing, recorded, not fixed

### 9. Plaintext PKCE logging at `src/backend/storeManagers/nile/user.ts:62`

`logInfo(['Register data is:', output], LogPrefix.Nile)` writes the full `NileLoginData` object —
including url, `code_verifier`, `serial`, and `client_id` — to `gamelib.log` in plaintext. This
project's identifier-redaction discipline names `code_verifier`, `serial`, and `client_id` only as
the field NAMES that must never be transcribed into a planning document or gate artifact as
VALUES — this entry does exactly that: it names the fields, never a value, consistent with every
gate contract's own redaction rule.

This is **unrelated to onedir packaging and predates this phase.** It was first noted during the
2026-08-11 FAIL-run gate's authoring (`34.9-LIVE-GATE.md`) and is restated here, unchanged, at the
close of gap cycle 1.

**OWNER:** a future security pass (2026-08-11).

## Measurement gaps

### 10. REQ-34.9-09's cold spawn ratio — see also item 4 above

**What IS measured and valid:** the WARM ratio, per runner, for all three runners —
`34.9-MEASUREMENT.md` §8.4:

| runner | onefile warm | onedir warm | ratio |
|---|---|---|---|
| nile | 4.23s | 0.13s | 32.5x |
| legendary | 3.99s | 0.15s | 26.6x |
| gogdl | 2.99s | 0.11s | 27.2x |

**What is NOT measured:** the COLD ratio for any of the three runners, within this phase. Two
attempted cold-measurement runs (plan 34.9-03) both failed their own harness validity anchor and
produced no trustworthy reading — recorded as void runs, not as a negative result.

**The `~95x cold` headline carried in early ROADMAP.md text is RETIRED**, as of 2026-08-11. It was
nile-only (from the earlier, separate `nile-spawn-app-side-latency` debug session, commit
`a9192ae80`: onefile cold 20.84s avg vs onedir cold 0.22s avg) and this phase never reproduced it
per-runner. That one cold figure (nile ~20.84s → 0.22s) remains individually citable — it comes
from that earlier session, independent of this phase's two invalidated runs, and applies to nile
alone, not to legendary or gogdl and not as a phase-wide claim.

**A third cold-measurement attempt is deliberately NOT scheduled** — this is the explicit
gap-planning decision (2026-08-11), reproduced from item 4 above for readers who land on this
section directly. The honest headline for this phase is **~27–33x warm, cold unmeasured** for
legendary and gogdl.

## Findings opened by the 2026-08-12 guard-proof run (plan 34.9-21)

Plan 34.9-21 ran `34.9-GUARD-PROOF.md` (the CR-01 tripwire proof authored by plan 34.9-20) on real
macOS arm64 hardware — both directions PASS, restore independently verified twice. Three
methodology/coverage findings were opened during that run; none of the three implicates the
guard's own correctness (`meta/verifyRunnerBundle.ts`, `meta/preserveRunnerSymlinks.ts`), all three
are about the *proof contract's own prescribed commands*.

### 14. `34.9-GUARD-PROOF.md` Direction A's `find -newer` dist/-emptiness check is vacuous

**What it is:** Section 3 step (d) of the proof contract asserts "no new `.dmg`/`.zip` in `dist/`"
as evidence the failing direction never reached `electron-builder`.

**Blocker (mechanism, not a summary):** `clean:dist-mac` runs FIRST in the `pnpm dist:mac` `&&`
chain and unconditionally empties `dist/` down to one non-macOS survivor (`builder-debug.yml`),
regardless of whether the guard later fires. The check cannot produce output either way — it
passed on the 2026-08-12 run by construction, not by discrimination. This is the same
self-satisfying-assertion class 34.9-20 already caught once at authoring time (`--publish=never`
self-matching a bare `publish` grep in Direction B).

**Named precondition:** rewrite Section 3 step (d) to use the terminal-pnpm-lifecycle-step check
this run substituted and validated instead: assert `verify:runner-bundle` is the LAST pnpm
lifecycle banner in the transcript and that neither `electron-builder  version=` nor `building
target=` appears anywhere in it (both proven real discriminators — either would be ≥1 had
electron-builder run).

**OWNER:** whichever plan next re-runs or re-authors this contract (2026-08-12).

### 15. `34.9-GUARD-PROOF.md`'s exit-capture idiom silently no-ops under zsh; `cat -A` is BSD-incompatible

**What it is:** the contract's prescribed pattern `pnpm dist:mac 2>&1 | tee -a log; echo
${PIPESTATUS[0]}` for capturing a piped command's exit status, and its `cat -A` suggestion for
restore-verification byte dumps.

**Blocker:** zsh does not populate bash's `PIPESTATUS` array the same way bash does — under the
operator's actual default shell on this hardware (zsh), the idiom silently wrote a 1-byte (bare
newline) exit-status file with no error, which would have been read as an empty/unscorable result
had it not been caught before being treated as evidence (2026-08-12 run, Direction A Block 2).
Separately, macOS's BSD `cat` has no `-A` flag (GNU-only); `cat -e` or `xxd` are the macOS-portable
equivalents.

**Named precondition:** rewrite the contract's exit-capture instruction to the shell-portable
redirect form (`pnpm dist:mac > log 2>&1; echo $? > exit-file`, which behaves identically under
zsh and bash) and its byte-dump instruction to `cat -e`/`xxd`.

**OWNER:** whichever plan next re-runs or re-authors this contract (2026-08-12).

### 16. `34.9-GUARD-PROOF.md`'s CLI-argument-passthrough sub-claim (Direction B) was never exercised

**What it is:** Section 5 of the contract, as authored by plan 34.9-20, specifies Direction B as
`pnpm dist:mac --arm64 --publish=never` specifically to prove that appended CLI arguments still
reach `electron-builder` — the exact invocation shape `build-base.yml:48` uses
(`pnpm dist:mac --x64 --arm64 --publish=never`).

**Blocker:** plan 34.9-21's own Task 2 `how-to-verify` text (Step 4.3, "Run the identical `pnpm
dist:mac`") superseded Section 5's wording without appended args, and the 2026-08-12 run followed
34.9-21's instruction. The core claim under test (the guard gates `electron-builder` and does not
obstruct a normal build) remains validly proven independent of this gap; the narrower
args-passthrough claim does not.

**Named precondition:** the next hardware run that exercises `dist:mac`/`release:mac` should append
`--arm64 --publish=never` (or the real `release:mac` invocation) at least once and assert the
resulting electron-builder invocation honored it (an arm64 `target=` line, no `Uploading` line).

**OWNER:** whichever plan next exercises `dist:mac`/`release:mac` on real hardware (2026-08-12).

## Code-review finding disposition (2026-08-12)

`34.9-REVIEW.md` (2026-08-11T03:22:49Z) opened six findings against gap cycle 1's own fixes. Gap
cycle 1's reconciliation plan, `34.9-17`, wrote a 10-item ledger and closed none of them — a direct
grep of `34.9-17-SUMMARY.md` for `CR-01|WR-0|IN-0|REVIEW` returns **zero matches** (confirmed
2026-08-12, this plan). `34.9-VERIFICATION.md` truth 8 records the consequence: CR-01 "was neither
fixed nor triaged into a dated, owned deferral — it fell through the phase's own reconciliation
step." This is the standing project rule in concrete form — **an audit whose unit is coarser than
the defect's unit cannot find the defect.** 34.9-17 swept at the granularity of descoped
*requirements* and never enumerated review *findings* at all. This section is the set-difference
that closes that class of miss, swept at the granularity of the defect itself: finding IDs.

**List A — every finding ID in `34.9-REVIEW.md`,** obtained by `grep -n '^### ' 34.9-REVIEW.md` and
extracting the `CR-`/`WR-`/`IN-` prefix (raw grep output, reproduced verbatim):

```
58:### CR-01: `closeBundle` doesn't fail the build on a skipped symlink restore, and nothing in the pipeline runs `verify:runner-bundle` to catch it
131:### WR-01: `restoreSymlinks` validates the destination path but never the symlink *target*
161:### WR-02: Missing top-level framework stub is never flagged, unlike a missing `Versions/Current`
188:### IN-01: `MAC_DIR_PATTERN` branch requires `isDirectory()`, so a bare macOS-staging-named symlink would go undetected — contradicting the doc comment
205:### IN-02: `cleanDistMac`'s containment throw is untested and structurally unreachable via its only call path
224:### IN-03: The F-34.9-02 fix is macOS-only; the same false-pass mechanism plausibly affects `dist:win`/`dist:linux`
```

List A = `{CR-01, WR-01, WR-02, IN-01, IN-02, IN-03}` — 6 IDs, confirmed by `grep -c '^### '
34.9-REVIEW.md` = 6.

**List B — every finding ID claimed closed by a landed gap-cycle-2 plan.** None of the four
Summaries (`34.9-18-SUMMARY.md`, `34.9-19-SUMMARY.md`, `34.9-20-SUMMARY.md`,
`34.9-21-SUMMARY.md`) carries a frontmatter field literally named `closes_findings:` — this is a
mismatch between this plan's own `<interfaces>` expectation and what actually landed, recorded here
rather than silently substituted. The equivalent evidence exists in each Summary's own body text, so
list B is derived from those explicit "closing X" statements instead, cross-checked against each
Summary's self-check section:

- `34.9-18-SUMMARY.md:45`: *"closing CR-01 and WR-01"* — both self-check PASSED, no disagreement in
  the body.
- `34.9-19-SUMMARY.md:60`: *"Closed the one known blind spot (WR-02)"*; `:62-63`: IN-01/IN-02 doc
  comments corrected and pinned; `:148` explicitly states *"IN-03 ... remains deferred, owned by
  plan 34.9-22's ledger entry"* — i.e. 34.9-19 itself records that IN-03 is NOT closed by it. No
  disagreement between frontmatter/tags and body for WR-02/IN-01/IN-02.
- `34.9-20-SUMMARY.md:61`: *"Closed the second half of CR-01 ... It is now an unconditional `&&`
  step in both macOS packaging scripts"* — wiring only, not yet observed firing; consistent with
  34.9-21 being the plan that completes CR-01's closure.
- `34.9-21-SUMMARY.md:62`: *"CR-01 (the sole Critical finding from `34.9-REVIEW.md`) is closed and
  `34.9-VERIFICATION.md` truth 8 is satisfied"* (verdict `PASS`, both directions scored from disk
  evidence) — no disagreement; this is CR-01's landing plan.

List B = `{CR-01 → 34.9-21, WR-01 → 34.9-18, WR-02 → 34.9-19, IN-01 → 34.9-19, IN-02 → 34.9-19}` —
5 IDs mapped to a landed fix.

**A minus B** = `{IN-03}` — exactly the one ID 34.9-19's own Summary already named as deferred to
this plan's ledger. It receives item 11 below.

| Finding | Severity | Disposition | Evidence |
|---|---|---|---|
| CR-01 | Critical | FIXED | 34.9-18 (`closeBundle` throw) + 34.9-20 (wired into `dist:mac`/`release:mac`) + 34.9-21 (`34.9-GUARD-PROOF.md`, live proof, verdict PASS) |
| WR-01 | Warning | FIXED | 34.9-18 (`isContainedSymlinkTarget`, `meta/preserveRunnerSymlinks.ts`) |
| WR-02 | Warning | FIXED | 34.9-19 (`summarise()`'s `!fw.topLevelStubExists` branch, `meta/verifyRunnerBundle.ts`) |
| IN-01 | Info | FIXED | 34.9-19 (`meta/cleanDistMac.ts` doc-comment correction, pinned) |
| IN-02 | Info | FIXED | 34.9-19 (`meta/cleanDistMac.ts` doc-comment downgraded to defense-in-depth, pinned) |
| IN-03 | Info | DEFERRED | item 11 |

**Count:** 6 IDs in list A. 5 mapped to a landed fix. 1 mapped to a ledger item (item 11). Unmapped
count: **0**.

### 11. IN-03 — the F-34.9-02 stale-artifact fix is macOS-only

**What it is:** `clean:dist-mac` runs first in `dist:mac`/`release:mac` only; `dist:win` and
`dist:linux` have no counterpart script and no equivalent pre-build clearing step.

**Blocker (mechanism, not a summary):** electron-builder clears only the target-specific
subdirectory it is about to populate and never top-level `dist/` — this is exactly F-34.9-02's root
cause, and `meta/cleanDistMac.ts`'s own header describes it as a general electron-builder behaviour,
not a macOS-specific one. A failed `dist:win`/`dist:linux` run therefore plausibly leaves stale
`.exe`/`.AppImage`/`latest-*.yml` behind, reproducing the same "did the build produce an artifact?"
false-pass risk F-34.9-02 named on macOS. This is **UNCONFIRMED** on win/linux — a plausible
generalization of a confirmed macOS mechanism, not an observed win/linux defect. No sentence here
asserts win/linux is broken; none asserts it is fine either.

**Named precondition:** a win or linux build run that reproduces the stale-artifact false pass, or a
decision to generalize `cleanDistMac.ts` into a platform-parameterized `cleanDist.ts` without
waiting for one.

**OWNER:** follow-up packaging phase / developer action, dated 2026-08-12.

### 12. The wired guard covers arm64 only

**What it is:** the `pnpm verify:runner-bundle build --arch=arm64` invocation wired into `dist:mac`
and `release:mac` by plan 34.9-20, and live-proven by plan 34.9-21 (`34.9-GUARD-PROOF.md`, verdict
PASS), hardcodes `--arch=arm64`.

**Blocker (mechanism, not a summary):** `build/bin/x64/darwin` holds onefile binaries, which have no
`_internal` directory and no `Python.framework`, so pointing the guard at x64 would fail its
**file-count floor** for a reason unrelated to symlink integrity — the guard's own preconditions are
not met by an x64 tree. The coverage consequence is **UNPROVEN, not asserted**: whether a real x64
darwin onedir tree would pass or fail the framework-structure checks has never been observed,
because no x64 onedir tree exists anywhere (item 1). This entry does not write that x64 is
unprotected, and does not write that x64 is unaffected.

**Named precondition:** an x64 darwin onedir tree existing on disk (transitively, REQ-34.9-02's own
precondition).

**OWNER:** the same follow-up phase that owns item 1, dated 2026-08-12.

### 13. The guard has never been exercised in CI

**What it is:** the `verify:runner-bundle` wiring is npm-script-level, so `build-base.yml`'s
`pnpm dist:mac` and `draft-release-mac.yml`'s `pnpm release:mac` would each invoke it — nominally.

**Blocker (mechanism, not a summary):** the macOS CI leg cannot reach the build step at all, because
`install-deps` runs `pnpm download-helper-binaries`, which throws on the six `PENDING-CI-PUBLISH`
sentinels in `meta/runnersOnedirDigests.json`; the job fails before any `dist:mac` invocation. This
is **UNPROVEN in CI** — the wiring is present and the CI path is structurally blocked upstream of
it, so no CI run has ever executed the guard, in either direction.

**Named precondition:** REQ-34.9-02/03/04's own precondition (real published darwin archives and
real digests), which unblocks `install-deps`.

**OWNER:** the same follow-up phase that owns items 1-3, dated 2026-08-12.

## Finding opened by the 2026-08-13 pipe-conversion proof run (plan 34.9-26)

Plan 34.9-26 ran `34.9-PIPE-PROOF.md` (the C2-01 pipe-to-`&&` conversion proof authored by its own
Task 1) on real macOS arm64 hardware -- Direction A 13/13 scripts PASS in both failure shapes,
Direction B 8/8 RUN scripts PASS, both chain proofs PASS, restore audit independently recomputed and
matched. One data-drift finding was opened during Direction B; it does not implicate the
pipe-conversion under test (`meta/gen_i18n_gate_scope`'s own `--outfile=`/`&&` wiring is correct and
scored PASS) -- it is about the *staleness of a tracked snapshot the script regenerates*.

### 17. `meta/i18nGateScope.json`'s committed snapshot is stale against the live source tree

**What it is:** `gen-i18n-gate-scope`'s Direction B run (34.9-26 Task 2) regenerated
`meta/i18nGateScope.json` live and produced a 12-line diff against the committed snapshot
(`generatedAt: 2026-08-08`).

**Blocker (mechanism, not a summary):** new frontend source files have entered the tree since the
snapshot was last committed (e.g. `src/frontend/screens/Library/filterEngine.ts`), and
`gen-i18n-gate-scope` deterministically includes every in-scope file it finds at run time -- so the
committed snapshot drifts out of date every time a new in-scope frontend file is added without a
corresponding re-run of `pnpm gen-i18n-gate-scope` and a commit of its output. The script itself is
correct; the drift was restored via `cp` from the pre-run backup and re-verified byte-identical by
`shasum -a 256` immediately after (34.9-26's Task 3 independent restore audit re-confirmed
`meta/i18nGateScope.json` untouched in the live tree).

**Named precondition:** re-run `pnpm gen-i18n-gate-scope` and commit its output, either as a one-off
catch-up or as a standing pre-commit/CI step that keeps the snapshot in sync with the frontend source
tree going forward.

**OWNER:** whichever plan or developer next touches the i18n gate scope or the frontend screens
directory tree, dated 2026-08-13 (finding F-34.9-26-01).

## Code-review finding disposition, gap cycle 2 (2026-08-13)

Per locked user decision D-C3-05, `34.9-REVIEW-CYCLE2.md`'s C2-05 and C2-07 findings are recorded
here, not fixed — no code change. This section covers **only** C2-05 and C2-07. C2-01, C2-02,
C2-03, C2-06 and C2-08 are dispositioned elsewhere in this gap cycle (plans `34.9-24`..`34.9-26`
and their own ledger entries/proof documents) and are **deliberately not claimed by this section**
— a table implying full eight-ID coverage here would be a worse defect than an honestly scoped one.

| Finding | Severity | Disposition | Evidence |
|---|---|---|---|
| C2-05 | Warning | DEFERRED (ledger only, D-C3-05) | item 18 below, reconciled against items 12 and 13 |
| C2-07 | Info | DEFERRED (ledger only, D-C3-05) | item 19 below |

### 18. C2-05 — the arm64-only guard is live and active in real CI, and gates an auto-publishing release

**What it is:** the base fact — the `verify:runner-bundle` guard wired into `dist:mac` and
`release:mac` (plan 34.9-20) hardcodes `--arch=arm64`, and `release:mac` also builds x64 — is
**already recorded**, in full, as items 12 and 13 above. This entry does **not** reopen either item
or restate their content; it cross-references both by number and records only the two concrete
details `34.9-REVIEW-CYCLE2.md`'s C2-05 finding adds on top of them:

1. The arm64-only invocation is live in real, currently-active CI, not merely theoretically wired.
   `.github/workflows/build-base.yml:48` runs `pnpm dist:mac --x64 --arm64 --publish=never` on a
   `macos-15` runner. pnpm appends extra CLI arguments to the end of the resolved script string
   with no `--` separator (unlike npm), so the guard still runs exactly once against arm64 only
   while `electron-builder` is handed both architectures in the same job.
2. `release:mac` chains `-p always` (`package.json:44`) — i.e. auto-publish to the GitHub releases
   feed `electron-updater` consumes. An unverified x64 macOS build can therefore reach real users'
   auto-update channel with the guard green throughout — a materially worse consequence than "built
   locally but unchecked".

Detail 1 sits in apparent tension with item 13, which states the guard has never been exercised in
CI because `install-deps` throws on the six `PENDING-CI-PUBLISH` sentinels before the build step is
reached. That tension is resolved, explicitly, here: the invocation is real and active in the
workflow file, and the job is nonetheless blocked upstream of it — so what detail 1 establishes is
that the arm64-only exposure is **structurally wired into the live CI definition**, not that it has
ever executed. No sentence in this entry claims the guard has run in CI.

**Blocker (mechanism, not a summary):** an x64 darwin onedir tree does not exist anywhere (item 1),
so the guard cannot be pointed at x64 without failing its file-count floor for a reason unrelated to
symlink integrity — item 12's own mechanism.

**Named precondition:** REQ-34.9-02's own precondition (land the workflow on the default branch,
then dispatch, producing a real x64 onedir tree), plus a decision on whether `release:mac`'s
`-p always` should be gated on a second `--arch=x64` guard invocation once that tree exists.

**OWNER:** the same follow-up phase that owns items 1, 12 and 13 (2026-08-13).

### 19. C2-07 — the doc-comment accuracy pins couple CI to documentation wording, not just behaviour

**What it is:** the four tests in `meta/__tests__/cleanDistMac.test.ts:234-276`
("doc-comment accuracy pins (IN-01/IN-02)") assert exact prose substrings of
`meta/cleanDistMac.ts`'s normalised header comments. Stated clearly: these tests are **not
vacuous** — they will genuinely fail if the wording changes — so this is a coupling concern, not a
correctness defect.

**Blocker (mechanism, not a summary):** two of the four assertions (`toContain`) pin documentation
wording rather than program behaviour, so any future rewording that preserves the identical
technical claim still breaks CI. The other two assertions (`not.toContain`) are what actually
prevent regression to the retired, misleading claims (the "symlink is matched by the
token/standalone-name branches" and "Every removal path is containment-checked" framings) and
carry the real protection — they are not affected by this concern.

**Named precondition:** a decision by whoever next edits `meta/cleanDistMac.ts`'s header comments
on whether to drop the positive `toContain` assertions and retain only the negative
(`not.toContain`) ones.

**OWNER:** whichever plan next edits those doc comments (2026-08-13).
