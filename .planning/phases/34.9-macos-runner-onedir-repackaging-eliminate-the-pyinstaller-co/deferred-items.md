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
