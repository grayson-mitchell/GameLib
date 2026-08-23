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

**ROUTED 2026-08-22:** now owned by **Phase 34.16** (`macos-runner-onedir-x64-ci-leg-...`), created 2026-08-22 in commit `386b2f497`. The "follow-up phase" named above had no counterpart in ROADMAP.md when this item was written, so the routing was dangling for 9-11 days -- the same shape that left Phase 27 blocked across four phases after its cause was gone. OWNER text above is left as written; this line supersedes only its routing.

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

**ROUTED 2026-08-22:** now owned by **Phase 34.16** (`macos-runner-onedir-x64-ci-leg-...`), created 2026-08-22 in commit `386b2f497`. The "follow-up phase" named above had no counterpart in ROADMAP.md when this item was written, so the routing was dangling for 9-11 days -- the same shape that left Phase 27 blocked across four phases after its cause was gone. OWNER text above is left as written; this line supersedes only its routing.

### 3. REQ-34.9-04 — sha256 digest verification

**What it is:** darwin archives sha256-verified against in-repo digests before extraction.

**Status:** code complete, never exercised. All six entries in `meta/runnersOnedirDigests.json`
remain `PENDING-CI-PUBLISH` sentinels, which throw by design on this checkout — no real digest has
ever been verified against a real archive.

**Blocker:** REQ-34.9-02 — there is no CI-published digest to verify against.

**Named precondition:** REQ-34.9-02's own precondition.

**OWNER:** same as REQ-34.9-02 — follow-up phase / developer action (2026-08-11).

**ROUTED 2026-08-22:** now owned by **Phase 34.16** (`macos-runner-onedir-x64-ci-leg-...`), created 2026-08-22 in commit `386b2f497`. The "follow-up phase" named above had no counterpart in ROADMAP.md when this item was written, so the routing was dangling for 9-11 days -- the same shape that left Phase 27 blocked across four phases after its cause was gone. OWNER text above is left as written; this line supersedes only its routing.

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

**CLOSED 2026-08-23 (quick task 260823-seg).** The named precondition landed as
`34.9-GUARD-PROOF.md` §2.5 **AMENDMENT v2 §A1**, which replaces §3's PASS bar (d) in full with the
validated substitute (assert `verify:runner-bundle` is the LAST pnpm lifecycle banner, record its
line number; (c)'s two banner-absence greps stay where they already are). §3's original (d) is
struck through **in place** and marked "do not run" rather than deleted, so the 2026-08-12 RUN
RECORD stays interpretable against the contract it was actually scored under.

**The fix carries an explicit scope fence, because the obvious generalization is wrong.** §5's PASS
bar (d) has the same *shape* but is genuinely load-bearing — on the passing direction `dist/` gains
artifacts only if the build completes, and that check doubles as the F-34.9-02 stale-artifact
guard. It is annotated **NOT superseded — do not retire for symmetry**. This finding was always
scoped to Direction A alone and the amendment keeps it that way.

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

**CLOSED 2026-08-23 (quick task 260823-seg), with one half recorded as VERIFIED-ABSENT rather than fixed.**

The exit-capture half landed as `34.9-GUARD-PROOF.md` §2.5 **AMENDMENT v2 §A2**: the redirect form
`pnpm dist:mac > <SESSION_DIR>/direction-a.log 2>&1; echo $? > <SESSION_DIR>/direction-a.exit`
replaces the piped idiom at all four sites (§3 step 4, §3 PASS bar (a), §5 step 2, §5 PASS bar
(a)), each carrying an inline SUPERSEDED marker. The amendment also requires reading the exit file
back with `xxd` before scoring it, because a 1-byte file is this defect's actual signature.

**A rule conflict this fix would otherwise have created is reconciled in the open.** Precondition 7
mandates `tee -a`, "never bare `tee`, never `>`" — a rule that exists so a re-run cannot TRUNCATE
an earlier block's evidence. The redirect form reintroduces exactly that risk, so v2 makes a
**distinct filename per block** mandatory and says so at precondition 7 itself. Precondition 7's
intent is preserved; only its mechanism changes. Two rules left in silent conflict is how the
original defect survived authoring in the first place.

**The `cat -A` half needed no edit and is NOT claimed as fixed.** Grepped live 2026-08-23: `cat -A`
appears ONLY in the RUN RECORD's own `F-34.9-21-02` finding row, and NOWHERE in the contract's
prescribed commands — the body already uses `xxd` at both byte-dump sites. There was nothing to
repair. Recording this as "fixed" would have manufactured a change that never happened.

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

**PARTIALLY ADDRESSED 2026-08-23 (quick task 260823-seg) — THIS ITEM REMAINS OPEN.**

Only the contract-side half is done. The sub-claim itself is unproven and **cannot be closed by
editing a document**; it needs a hardware run.

**What the investigation corrected about this item's own framing:** this is not a
missing-instruction defect. Section 5 step 2 ALREADY prescribes `pnpm dist:mac --arm64
--publish=never`, ALREADY states the args-passthrough rationale, and PASS bar (c) ALREADY asserts
an arm64 `target=` line plus `grep -c Uploading` = 0. **The contract was correct.** What failed is
that plan 34.9-21's `how-to-verify` PARAPHRASED the step as "Run the identical `pnpm dist:mac`",
dropping the args, and the run followed the paraphrase rather than the contract (Deviation 6). A
lossy restatement outranked a correct record in practice, because the restatement is what the
executor actually reads.

**So the fix is a precedence rule, landed as AMENDMENT v2 §A3, not new procedure:** §5's invocation
string is NORMATIVE; a plan may CITE it but must not PARAPHRASE it; where the two disagree the
contract wins; any deliberate departure is recorded as a deviation BEFORE the run. §5 step 2 and §5
PASS bar (a) both carry inline markers to that effect.

**Still owed, and the only thing that can close this item:** the next hardware run must execute §5
step 2 with its arguments as written and record, in its own run record, the arm64 `target=` line
verbatim plus `grep -c Uploading` = 0, naming `F-34.9-21-03` as discharged. Phase 34.16 will re-run
this contract and is the natural place for it.

**OWNER (unchanged):** whichever plan next exercises `dist:mac`/`release:mac` on real hardware.

**CLOSED 2026-08-23 (quick task 260823-suw) — discharged by a real hardware run, not by an edit.**

`pnpm dist:mac --arm64 --publish=never` was run on macOS arm64 exactly as §5 step 2 writes it,
under AMENDMENT v2's capture form. **Verdict PASS 4/4; `F-34.9-21-03` DISCHARGED.** Full record:
`34.9-GUARD-PROOF.md` § "RUN RECORD -- 2026-08-23 (Direction B only)".

**The decisive evidence is the resolved script string (log line 3), not the `target=` lines** — it
shows the passthrough mechanism directly rather than by inference:

```
> export CSC_IDENTITY_AUTO_DISCOVERY=false && pnpm clean:dist-mac && pnpm build-steam-bridge && electron-vite build && pnpm verify:runner-bundle build --arch=arm64 && electron-builder --mac --arm64 --publish=never
```

pnpm appended both args to the END of the resolved chain with no `--` separator, so they landed on
`electron-builder` while `verify:runner-bundle` kept its own hardcoded `--arch=arm64`. Confirming
effects: 2 arm64 `target=` lines, **0** x64 `target=` lines (so `--arm64` NARROWED the build rather
than merely being accepted), **0** `Uploading` lines. The bare word `publish` was deliberately not
grepped — the invocation line echoes `--publish=never` and self-matches.

Also scored: exit `0` read as bytes `300a` via `xxd`; guard PASS line 465 before electron-builder's
first line 466; dmg and zip both with mtime strictly after `BUILD_START` (2m49s wall time).
Vendored trees verified unchanged after the build — 109/67/108 files, symlink manifest sha256
identical to the pre-run snapshot.

**Scope, stated plainly: Direction B ONLY.** Direction A was deliberately not re-run — item 16 is
about args passthrough, and Direction A would require re-injecting a dereferenced
`Python.framework` into the vendored tree for no benefit to this discharge. The failing direction's
evidence remains solely the 2026-08-12 record.

**Unplanned corroboration for item 18, worth reading before Phase 34.16 plans:** log line 3
directly confirms item 18 detail 1's mechanism — the guard's `--arch=arm64` is fixed in the script
body while the builder's arches come from the caller. **That is corroboration of the MECHANISM, not
an observation of the exposure.** This run passed `--arm64`, so guard arch and build arch agreed and
no gap opened; the x64 case where they diverge remains unexercised, exactly as items 1/12/13/18 all
say.

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
| IN-03 | Info | FIXED | quick task 260822-hrf (commits `df7af9f4a` rename + `ab1ee0448` generalization), closing item 11 opened against 34.9-19's `meta/cleanDistMac.ts`; `meta/cleanDist.ts` now requires an explicit `--platform=` mac/win/linux argument with no silent default, wired into `dist:win`/`release:win`/`dist:linux`/`release:linux` alongside the existing mac wiring; proven on a synthetic three-platform `dist/` fixture where each platform's clean removes only its own entries and leaves the other two byte-identical (`meta/__tests__/cleanDist.test.ts`), macOS behaviour unchanged verbatim, IN-01/IN-02 doc-comment pins re-baselined against the new path |

**Count:** 6 IDs in list A. 5 mapped to a landed fix. 1 mapped to a ledger item (item 11). Unmapped
count: **0**. *(As originally recorded 2026-08-12. Superseded 2026-08-22 by quick task 260822-hrf:
IN-03 now reads FIXED above; see item 11's own closure note below for the landed commits. Left in
place rather than rewritten, per this ledger's amend-not-retick discipline.)*

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

**Closure note (2026-08-22, quick task 260822-hrf):** the named precondition's second branch
landed — `meta/cleanDistMac.ts` was renamed to `meta/cleanDist.ts` (commit `df7af9f4a`) and
generalized to a required `--platform=` mac/win/linux argument with no silent default (commit
`ab1ee0448`), keyed off `electron-builder.yml`'s real per-platform artifact-name tokens.
`dist:win`/`release:win`/`dist:linux`/`release:linux` now run their own `clean:dist-win` /
`clean:dist-linux` prefix, mirroring the pre-existing `dist:mac` wiring this item originally
found missing. This closes IN-03 — see the disposition table above. The Blocker paragraph's
**UNCONFIRMED** caveat is carried forward unchanged and still applies exactly as written: this
machine is macOS arm64 with no win/linux build to run live, so win/linux coverage is
synthetic-fixture-only (`meta/__tests__/cleanDist.test.ts`'s three-platform fixture proves each
platform's clean touches only its own entries and leaves the other two byte-identical, which is
a fixture-level non-deletion proof, not a live win/linux build observation). No sentence in this
closure note asserts win/linux is broken, and none asserts a live win/linux run has occurred —
the generalization closes the code-parity gap this item named; it does not manufacture a live
observation this machine cannot produce.

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

**ROUTED 2026-08-22:** now owned by **Phase 34.16** (`macos-runner-onedir-x64-ci-leg-...`), created 2026-08-22 in commit `386b2f497`. The "follow-up phase" named above had no counterpart in ROADMAP.md when this item was written, so the routing was dangling for 9-11 days -- the same shape that left Phase 27 blocked across four phases after its cause was gone. OWNER text above is left as written; this line supersedes only its routing.

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

**ROUTED 2026-08-22:** now owned by **Phase 34.16** (`macos-runner-onedir-x64-ci-leg-...`), created 2026-08-22 in commit `386b2f497`. The "follow-up phase" named above had no counterpart in ROADMAP.md when this item was written, so the routing was dangling for 9-11 days -- the same shape that left Phase 27 blocked across four phases after its cause was gone. OWNER text above is left as written; this line supersedes only its routing.

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

**ROUTED 2026-08-22:** now owned by **Phase 34.16** (`macos-runner-onedir-x64-ci-leg-...`), created 2026-08-22 in commit `386b2f497`. The "follow-up phase" named above had no counterpart in ROADMAP.md when this item was written, so the routing was dangling for 9-11 days -- the same shape that left Phase 27 blocked across four phases after its cause was gone. OWNER text above is left as written; this line supersedes only its routing.

**LANDMARKS RE-VERIFIED 2026-08-23 (quick task 260823-rtm).** Every claim in this item was
re-checked against the live tree before it is planned from. **All hold**, with one stale line
reference corrected:

- `.github/workflows/build-base.yml:48` — **exact, unchanged**: `pnpm dist:mac --x64 --arm64
  --publish=never`, on `macos-15`. Detail 1 stands verbatim, including `--publish=never`.
- `package.json:44` → **now `package.json:46`**. `release:mac` reads `pnpm clean:dist-mac && pnpm
  build-steam-bridge && electron-vite build && pnpm verify:runner-bundle build --arch=arm64 &&
  electron-builder -p always --mac --x64 --arm64`. The `-p always` and the arm64-only guard over a
  both-arch build are both unchanged; only the line moved (`release:linux`/`release:mac`/
  `release:win` now sit at 45/46/47). Detail 2's substance stands.
- Six `PENDING-CI-PUBLISH` sentinels in `meta/runnersOnedirDigests.json` — **still six** (a seventh
  string match is the file's own `_comment` describing them, not a sentinel).

**This item's own distinction is correct and must survive restatement.** Detail 1 (CI) and detail 2
(`release:mac`) are two different mechanisms and this entry has always separated them —
`build-base.yml` builds both arches under an arm64-only guard but publishes **nothing**
(`--publish=never`); the auto-publish arm is `release:mac`, a script a human runs to cut a release.
`ROADMAP.md`'s Phase 34.16 restatement had collapsed the two into "This is live in currently-active
CI, not hypothetical", which reads as though CI publishes; it was corrected on 2026-08-23 by this
same quick task to quote `--publish=never` and to name the two mechanisms separately. **This entry,
not the ROADMAP paragraph, is the authoritative statement of C2-05.**

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

**AMENDED 2026-08-23 (quick task 260823-rtm) — the precondition FIRED on 2026-08-22 and no decision
was recorded. The item's own citations are dead.** Both are corrected below; the text above is left
as written, per this ledger's amend-not-rewrite discipline, because the dead citations are the
evidence of how the record rotted.

**1. Dead paths.** `meta/cleanDistMac.ts` and `meta/__tests__/cleanDistMac.test.ts` no longer
exist — quick task `260822-hrf` renamed both (`df7af9f4a`) while closing item 11. A reader
following this item's `:234-276` reference today finds nothing. Live locations, read 2026-08-23:

| What | Was cited as | Is now |
|---|---|---|
| source under pin | `meta/cleanDistMac.ts` | `meta/cleanDist.ts` (via the test's `CLEAN_DIST_SOURCE_PATH`) |
| the pins block | `meta/__tests__/cleanDistMac.test.ts:234-276` | `meta/__tests__/cleanDist.test.ts:451-493` |
| IN-01 negative (protective) | — | `:467-471` |
| IN-01 positive, 2× `toContain` | — | `:473-477` |
| IN-02 negative (protective) | — | `:479-483` |
| IN-02 positive, 3× `toContain` | — | `:485-492` |

**2. The precondition fired.** It named "a decision by whoever next edits [the] header comments".
`260822-hrf` **is** that editor — its own closure note on item 11 records "IN-01/IN-02 doc-comment
pins re-baselined against the new path". The pins were re-baselined against `meta/cleanDist.ts`;
the question this item exists to put was never put. The failure shape is a deferred check whose
precondition decays silently — here by a **rename** rather than by data drift. Nothing announced
it: the item still parses, still reads as current, and its line numbers still look resolvable
right up until someone opens the path and finds no file.

**3. Net coupling grew by exactly one assertion — not two.** The re-baseline added a second
describe block, `honesty pin: no win/linux "broken" or "observed" claim (E-02 discipline)`
(`meta/__tests__/cleanDist.test.ts:495-514`). Scored against C2-07's own criterion:

- `:496-508` — one test looping **6 phrases** through `not.toContain` ("win is broken", "observed
  on linux", …). This is the **protective** kind this item explicitly exempts above ("The other two
  assertions (`not.toContain`) ... carry the real protection — they are not affected by this
  concern"). **Not new coupling.**
- `:510-513` — `expect(source).toContain('UNCONFIRMED generalization')`. This **is** a new positive
  prose pin, and the only one added.

Positive prose assertions: **5 before, 6 now.** Any restatement claiming two were added is wrong.

**4. The decision remains OPEN and is unchanged in substance.** Whether to drop the positive
`toContain` assertions and keep only the negative ones is still a developer call, and the concern
is still a coupling concern rather than a correctness defect — the pins are non-vacuous and will
genuinely fail on a reword. What changed is only that the trigger has now passed once without
being answered, so the next editor of `meta/cleanDist.ts`'s header is the second such trigger, not
the first.

**OWNER (unchanged in kind, restated with a live path):** whichever plan next edits
`meta/cleanDist.ts`'s header comments. No phase owns this.

**CLOSED 2026-08-23 (quick task 260823-sok) — DECIDED, not merely re-pointed.** The developer chose
**option 3: keep the positive pins but reduce them to one distinctive anchor phrase per claim.**
Six positive `toContain` assertions became three. All three `not.toContain` assertions are
untouched.

**Why C2-07's own proposal (drop the positives entirely) was NOT taken.** C2-07 reasoned that the
`not.toContain` assertions "carry the real protection". They do — against *regression to the
retired framing*. But **`not.toContain` passes trivially against a deleted comment**, so the
negatives cannot detect that the corrected claim was removed altogether. The positives are the only
assertion that a correct replacement still EXISTS. The real trade was never coupling-vs-nothing:

- negatives alone → protected against regression-to-wrong, **unprotected against deletion-to-nothing**
- both → protected against both, at the cost of a tripwire on prose

Three short anchors keep the deletion protection while halving the reword-breakage surface, and
each surviving anchor is a technical term rather than a sentence, so a reword preserving the claim
is far likelier to preserve the anchor.

What was kept and what went (deliberately a list, not a table -- a markdown row beginning with a
bare finding ID is parsed by `34.9-REVIEW-SWEEP-CHECK.cjs` as a disposition row and collides with
the real one; caught by that tool on this very edit):

- **IN-01's claim** -- anchor KEPT: `'symlink literally named'`. Dropped:
  `'matches no branch and is left in place'`.
- **IN-02's claim** -- anchor KEPT: `'defense-in-depth against a currently-unreachable input'`.
  Dropped: `'never contain a path separator'`, `'no test exercises it'`.
- **the E-02 honesty claim** -- anchor KEPT: `'UNCONFIRMED generalization'`. Nothing dropped; it was
  already a single anchor.

Test names were corrected in the same edit: `'IN-01: the corrected comment names the unreachable
shape **and states it is left in place**'` described two assertions and now describes one. A test
name that overstates what it checks is the same defect class this phase spent four gap cycles on.

**RED-proven, each anchor independently** (`RED-PROOF-OK 3/3`): for each of the three, the phrase
was removed from `meta/cleanDist.ts`, its own test went red (1/1) **and the other two stayed green**
— proving the anchors are independent checks, not one assertion wearing three hats — then the
source was restored and confirmed by `shasum -a 256` against a pre-mutation snapshot, with `git
diff --quiet` agreeing. Green control: 33/33. Full `Meta` project: 22 suites, 521 passed / 1
pre-existing skip. `tsc --noEmit` clean, `eslint` exit 0.

**Method note worth carrying forward:** the first RED-proof attempt restored via `git checkout --
meta/cleanDist.ts`, which fired this repo's **post-checkout hook** → `pnpm install` →
`download-helper-binaries`, which threw on the six `PENDING-CI-PUBLISH` sentinels after
re-downloading the linux/win runner binaries. No damage resulted (all three darwin onedir trees
verified intact afterwards at 109/67/108 files with `Versions/Current` still a symlink in each),
but **a restore mechanism must not have side effects on the tree it restores into.** The proof was
re-run with `cp`-from-snapshot restore. This is the same hazard `deferred-items.md`'s standing note
about not running `download-helper-binaries` describes, reached by an unexpected route.

**This discharges the precondition that fired unanswered on 2026-08-22** (see the AMENDED note
above). Item 19 is closed.

## Code-review finding disposition — gap cycle 2 review (2026-08-13)

`34.9-REVIEW-CYCLE2.md`'s eight findings (C2-01 through C2-08) appeared in **none** of
`deferred-items.md`, `STATE.md`, `ROADMAP.md` or `REQUIREMENTS.md` at the 2026-08-12 verification
run (grep for `C2-0`, zero matches in all four) — the identical shape that produced the original
truth-8 failure, where CR-01 sat in a review document with no ledger entry and no fix and fell
through the phase's own reconciliation step. Plan 34.9-22's `## Code-review finding disposition
(2026-08-12)` section (above) is the structural precedent for closing that class of miss at the
granularity of the defect — one row per finding ID, never per file, because an audit whose unit is
coarser than the defect's unit cannot find the defect. This section is that precedent's cycle-3
counterpart, and it is strengthened over it in one respect: every `FIXED` row below is scored from
repository state OUTSIDE `.planning/` (a source symbol, a `package.json` script string, a named
green test), never from a plan SUMMARY's or a frontmatter `closes_findings`' claim, because a plan
SUMMARY is exactly the kind of mutating command's own report this project's standing rule says
must never be accepted as proof of effect on its own.

### List A — every finding ID in `34.9-REVIEW-CYCLE2.md`

Obtained by `grep -n '^### C2-' 34.9-REVIEW-CYCLE2.md` (raw output, reproduced verbatim):

```
65:### C2-01: A compile failure in the wired guard is invisible — `dist:mac` proceeds unguarded
98:### C2-02: `build-steam-bridge` shares C2-01's exact defect and is not named by it
126:### C2-03: `build-runners-onedir` shares the defect too, but is likely caught by an accidental downstream failure (lower severity, per the proven finding's own note)
152:### C2-04: No regression test pins `verify:runner-bundle`'s wiring into `dist:mac`/`release:mac`
184:### C2-05: `--arch=arm64`-only guard coverage is confirmed live in real CI, and `release:mac` amplifies it via auto-publish
221:### C2-06: `verifyRunnerBundle`'s top-level framework stub check is asymmetric — a dangling-target stub reports nothing
269:### C2-07: Doc-comment-prose-matching tests couple the suite to documentation wording, not behavior
285:### C2-08: Minor incomplete assertion — `rejected` bucket not checked in the symlink-free-tree test
```

List A = `{C2-01, C2-02, C2-03, C2-04, C2-05, C2-06, C2-07, C2-08}` — 8 IDs, confirmed by
`grep -c '^### C2-' 34.9-REVIEW-CYCLE2.md` = **8** (matches the review's own frontmatter
`findings: {critical: 1, warning: 5, info: 2, total: 8}`).

### List B — every finding ID with a landed fix, confirmed against the repository

Stage one (the claim) is each ID's `closes_findings` frontmatter across `34.9-23-PLAN.md` through
`34.9-27-PLAN.md`, cross-read against the corresponding Summary's own body. Stage two (the
confirmation) is repository state outside `.planning/`, checked live at execution time. An ID
enters list B only when stage two passes.

- **C2-01, C2-02, C2-03** — claimed by `34.9-25-PLAN.md`'s frontmatter (`closes_findings: [C2-01,
  C2-02, C2-03]`); `34.9-25-SUMMARY.md` records the conversion as landed and defers the *proof*
  that it works to 34.9-26 (no disagreement — the SUMMARY never claims the fix was itself proven,
  only converted). **Confirmation (repository, this execution):** the census predicate run live
  against `package.json`'s `scripts` object — every value containing `esbuild` cross-checked
  against a pipe-into-node pattern (`\|\s*node\b`) — returns **0** surviving matches out of the 13
  scripts `34.9-PIPE-AUDIT.md` originally censused. `verify:runner-bundle`, `clean:dist-mac`,
  `build-steam-bridge` and `build-runners-onedir` (the four scripts C2-01/02/03 name) each read,
  verbatim, as:
  - `verify:runner-bundle`: `esbuild --bundle --platform=node --target=node21 --outfile=node_modules/.cache/verify-runner-bundle.cjs meta/verifyRunnerBundle.ts && node node_modules/.cache/verify-runner-bundle.cjs`
  - `clean:dist-mac`: `esbuild --bundle --platform=node --target=node21 --outfile=node_modules/.cache/clean-dist-mac.cjs meta/cleanDistMac.ts && node node_modules/.cache/clean-dist-mac.cjs`
  - `build-steam-bridge`: `esbuild --bundle --platform=node --target=node21 --outfile=node_modules/.cache/build-steam-bridge.cjs meta/buildSteamBridgeShims.ts && node node_modules/.cache/build-steam-bridge.cjs`
  - `build-runners-onedir`: `esbuild --bundle --platform=node --target=node21 --outfile=node_modules/.cache/build-runners-onedir.cjs meta/buildRunnersOnedir.ts && node node_modules/.cache/build-runners-onedir.cjs`

  All four use the `--outfile=... && node ...` idiom, not the `| node`/`| node -` pipe. The FIX
  is additionally proven, not merely converted, by `34.9-26-PLAN.md`'s `34.9-PIPE-PROOF.md`
  (verdict **PASS, 36/36 directions**: 13/13 census scripts non-zero exit in both deliberately-broken
  shapes for Direction A, 8/8 safely-runnable scripts green for Direction B, both `dist:mac`
  chain-abort proofs PASS, restore audit independently recomputed and matched) — no disagreement
  between `34.9-26-SUMMARY.md`'s claim and the proof document it cites.
- **C2-04** — claimed by `34.9-27-PLAN.md`'s frontmatter (`closes_findings: [C2-04, C2-05, C2-07]`);
  `34.9-27-SUMMARY.md` states the wiring pin was added to `meta/__tests__/verifyRunnerBundle.test.ts`
  and proven red against all four mutations (M1/M2 presence, M3/M4 ordering) before `package.json`
  was restored byte-identical — no disagreement. **Confirmation (repository, this execution):**
  `meta/__tests__/verifyRunnerBundle.test.ts` contains a `describe('package.json wiring pin
  (C2-04)', ...)` block (module-scope `PACKAGE_JSON_PATH` const, local `loadScripts()` helper) with
  two tests asserting presence and `indexOf`-ordering of `verify:runner-bundle` before
  `electron-builder` in both `dist:mac` and `release:mac`; `pnpm test:ci` (this execution) reports
  the file's suite green as part of a full 243/243-suite, 4765/4766-test run (1 pre-existing skip).
- **C2-06** — claimed by `34.9-24-PLAN.md`'s frontmatter (`closes_findings: [C2-06, C2-08]`);
  `34.9-24-SUMMARY.md` states the top-level-stub asymmetry was closed and proven in both directions
  (fires / does not over-fire) — no disagreement. **Confirmation (repository, this execution):**
  `meta/verifyRunnerBundle.ts:108` declares `resolvedTopLevelTargetExists: boolean` on the
  framework-inspection type; `:196-219`'s `inspectFramework` computes it (mirroring the existing
  `Versions/Current` resolution check); `:492`'s `summarise()` consumes it in an `else if
  (!fw.resolvedTopLevelTargetExists)` failure branch. `pnpm test:ci` (this execution) reports the
  file's suite green in the same full run.
- **C2-08** — claimed by the same `34.9-24-PLAN.md` frontmatter entry; same Summary, no
  disagreement. **Confirmation (repository, this execution):**
  `meta/__tests__/preserveRunnerSymlinks.test.ts:270`, inside `'restoreSymlinks over a
  symlink-free source tree leaves the destination byte-for-byte unchanged'`, now asserts
  `expect(result.rejected).toEqual([])` alongside the pre-existing `restored`/`skipped`
  assertions. `pnpm test:ci` (this execution) reports the file's suite green in the same full run.
- **C2-05, C2-07** — expected DEFERRED per locked user decision D-C3-05; not scored against list B
  (no code fix claimed by any plan's frontmatter). Scored instead by the DEFERRED arm below, against
  the structured ledger sections `## Code-review finding disposition, gap cycle 2 (2026-08-13)`
  already added items 18 and 19 for.

List B = `{C2-01 → 34.9-25/26, C2-02 → 34.9-25/26, C2-03 → 34.9-25/26, C2-04 → 34.9-27, C2-06 →
34.9-24, C2-08 → 34.9-24}` — 6 IDs mapped to a confirmed landed fix, every confirmation drawn from
`meta/`, `package.json` or a live `pnpm test:ci` run, never from `.planning/` or a SUMMARY's own
words.

### A minus B

`{C2-05, C2-07}` — exactly the two IDs plan 34.9-27 already ledgered as dated, owned deferrals per
locked decision D-C3-05 (items 18 and 19, added by that plan, unchanged by this one). A minus B is
therefore empty apart from the two deferrals already owned by 34.9-27; no new ledger item is opened
by this section.

### The table

| Finding | Severity | Disposition | Evidence | Independent confirmation (non-.planning) |
|---|---|---|---|---|
| C2-01 | Critical | FIXED | 34.9-25 (pipe-to-`&&` conversion) + 34.9-26 (`34.9-PIPE-PROOF.md`, verdict PASS 36/36) | package.json `verify:runner-bundle`: `esbuild ... --outfile=node_modules/.cache/verify-runner-bundle.cjs meta/verifyRunnerBundle.ts && node node_modules/.cache/verify-runner-bundle.cjs`; live census of package.json scripts matching esbuild-piped-into-node = 0/13 |
| C2-02 | Warning | FIXED | 34.9-25 (conversion) + 34.9-26 (proof) | package.json `build-steam-bridge`: `esbuild ... --outfile=node_modules/.cache/build-steam-bridge.cjs meta/buildSteamBridgeShims.ts && node node_modules/.cache/build-steam-bridge.cjs` |
| C2-03 | Warning | FIXED | 34.9-25 (conversion) + 34.9-26 (proof) | package.json `build-runners-onedir`: `esbuild ... --outfile=node_modules/.cache/build-runners-onedir.cjs meta/buildRunnersOnedir.ts && node node_modules/.cache/build-runners-onedir.cjs` |
| C2-04 | Warning | FIXED | 34.9-27 (package.json wiring pin) | meta/__tests__/verifyRunnerBundle.test.ts `package.json wiring pin (C2-04)` describe block asserts presence + ordering of verify:runner-bundle before electron-builder in dist:mac and release:mac; pnpm test:ci green |
| C2-05 | Warning | DEFERRED | item 18 below | `### 18. C2-05 — the arm64-only guard is live and active in real CI, and gates an auto-publishing release` |
| C2-06 | Warning | FIXED | 34.9-24 (`resolvedTopLevelTargetExists`) | meta/verifyRunnerBundle.ts:108,196-219,492 — resolvedTopLevelTargetExists computed in inspectFramework, consumed by a failure branch in summarise; pnpm test:ci green |
| C2-07 | Info | DEFERRED | item 19 below | `### 19. C2-07 — the doc-comment accuracy pins couple CI to documentation wording, not just behaviour` |
| C2-08 | Info | FIXED | 34.9-24 (`result.rejected` assertion) | meta/__tests__/preserveRunnerSymlinks.test.ts:270 — expect(result.rejected).toEqual([]) added to the symlink-free-tree test; pnpm test:ci green |

**Count:** 8 IDs in list A. 6 mapped to a confirmed landed fix. 2 mapped to an already-existing
ledger item (items 18/19, opened by plan 34.9-27). Unmapped count: **0**.

### Truth 8 missing-list delivery state (2026-08-13)

Three items, quoted verbatim from `34.9-VERIFICATION.md` lines 79-82 (the `truths[7].missing` list
that failed the 2026-08-12 re-verification run).

| Missing item (verbatim) | Delivered? | Evidence observed on disk | Partial or deferred outcome recorded by the delivering plan |
|---|---|---|---|
| "Either fix the pipe idiom (temp-file the esbuild output and check its own exit code, `set -o pipefail` where supported, or invoke via a bundler/runner that surfaces a compile failure as a non-zero top-level exit ...) across all four affected scripts (verify:runner-bundle, clean:dist-mac, build-steam-bridge, build-runners-onedir), or an explicit, dated risk-acceptance entry in deferred-items.md if the team chooses not to fix it now" | YES | All 13 census scripts (not just the four named) converted from `\| node`/`\| node -` to `--outfile=... && node ...` (34.9-25); proven both directions on real arm64 hardware — Direction A 13/13 scripts, both deliberately-broken shapes (S1 parse error, S2 unresolvable import), non-zero exit, no false `Cannot find module`; Direction B 8/8 safely-runnable scripts green, cache present, `[OK]`/success literal observed (`34.9-PIPE-PROOF.md`, verdict PASS 36/36) | 34.9-26's own run cross-checked at SCRIPT granularity against `34.9-PIPE-AUDIT.md`'s 13-script census: all 13 appear in the Direction A table; the 5 scripts NOT RUN in Direction B (`download-helper-binaries`, `machine-fill-gamelib`, `build-crossover-index`, `build-runners-onedir`, `build:sidecar-sea`) each carry a named network/destructive reason in `34.9-PIPE-PROOF.md` §5 — no censused script is silently absorbed into a per-file "COVERED" verdict. One unrelated data-drift finding (F-34.9-26-01, `meta/i18nGateScope.json` stale snapshot) opened as item 17; it does not implicate the conversion under test. |
| "A wiring-pin test (C2-04) mirroring cleanDistMac.test.ts's existing package.json assertions, so a future refactor of dist:mac/release:mac cannot silently drop verify:runner-bundle without a red test — this closes a narrower, adjacent gap (is the step present and ordered correctly), not C2-01 itself" | YES | `meta/__tests__/verifyRunnerBundle.test.ts`'s `package.json wiring pin (C2-04)` describe block (34.9-27), proven red against all four deliberate mutations on real hardware (M1/M2 deletion → red on presence; M3/M4 relocation → red on ordering, presence still passing), `package.json` restored byte-identical (`shasum -a 256` matched after every restore) | None — 34.9-27's own Summary states this plan does NOT close C2-01 itself; the pin is explicitly the narrower "present and ordered" guarantee, distinct from the pipe-idiom fix (34.9-25/26) |
| "Ledger entries for C2-01 through C2-08 in deferred-items.md (or a landed fix), so this finding does not repeat CR-01's own history of falling through a reconciliation step" | YES | This section: all eight IDs mapped, six to a confirmed landed fix, two (C2-05, C2-07) to dated, owned ledger items (18, 19, opened by 34.9-27 per locked decision D-C3-05). Computed unmapped count 0, agreeing with the stated count. | None — this section is the delivery of this exact missing-list item |

**This plan does not score truth 8; that judgment belongs to `/gsd-verify-work 34.9`.**

## Item 20 — pre-existing repo-wide `pnpm lint` failure, confirmed unrelated to plan 34.9-29 (2026-08-14)

**What it is:** `pnpm lint` exits non-zero repo-wide: `3544 problems (53 errors, 3491 warnings)`,
spread across dozens of unrelated `src/` files (unsafe-`any` warnings, unused eslint-disable
directives, `require-await`, `no-duplicates`, etc.). Plan 34.9-29's own acceptance criteria and
`<verification>` block both name `pnpm lint exits 0` as a check.

**Why this is out of scope, not a Rule 1/2/3 fix:** the SCOPE BOUNDARY rule restricts auto-fixing to
issues directly caused by the current task's changes. `meta/runTs.cjs` is a `.cjs` file and is
excluded from lint entirely (`eslint.config.mjs:93`, `ignores: ['build/', '**/*.js', '**/*.cjs',
'**/*.mjs']`), so it cannot contribute any of the 3544 problems. `meta/__tests__/runTs.test.ts`
lints clean on its own (`npx eslint meta/__tests__/runTs.test.ts` exits 0). `package.json` is not a
lint target at all (`files` glob is `**/*.ts`/`**/*.tsx` only).

**Confirmed unrelated, not merely assumed:** the exact figure `3544 problems (53 errors, 3491
warnings)` was observed identically both before Task 1's `meta/runTs.cjs` existed on disk (the
very first `pnpm lint` run this plan's execution performed) and again after all three tasks were
committed. Byte-identical count, before and after.

**Disposition:** DEFERRED, pre-existing, out of this plan's scope. Not owned by this plan; not
introduced by this plan. `pnpm lint`'s exit code as an overall gate for phase 34.9 stays red for a
reason unrelated to C3-01, and whichever future work addresses repo-wide lint debt should treat this
as its own item, not as unfinished work from 34.9-29.

**OWNER:** unassigned (pre-existing repo-wide lint debt, not scoped to any phase-34.9 finding).

## Code-review finding disposition — gap cycle 3 review (2026-08-13)

`34.9-REVIEW-CYCLE3.md` (2026-08-13) opened three findings against gap cycle 3's own pipe-to-`&&`
conversion and sweep tooling. `34.9-VERIFICATION.md`'s gaps[0] found the identical pattern a third
time: a proven review finding with zero disposition in any of this phase's four ledgers
(`deferred-items.md`, `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`) — the same shape that produced
the original truth-8 failure (CR-01) and the cycle-2 sweep gap (C2-01..C2-08). This section is that
precedent's cycle-3 counterpart, at the same granularity: one row per finding ID. All three FIXED
rows below cite repository state or a reproducible command's own observed result, confirmed live at
THIS plan's execution time — never a plan SUMMARY's own words, per this project's standing rule that
a mutating command's own report is never accepted as proof of its own effect.

### List A — every finding ID in `34.9-REVIEW-CYCLE3.md`

Obtained by `grep -n '^### C3-' 34.9-REVIEW-CYCLE3.md` (raw output, reproduced verbatim):

```
81:### C3-01: Concurrent invocations of the same pnpm script race on the shared `node_modules/.cache/<name>.cjs` outfile — one process silently runs the other's compiled code, exit 0, no diagnostic
132:### C3-02: `meta/lintTranslations.ts:26`'s pipe/argv comment is now false, and the cycle's own "exhaustive" comment audit explicitly (and incorrectly) claims no such comment exists
180:### C3-03: `34.9-C2-SWEEP-CHECK.cjs`'s FIXED-row "Independent confirmation" check never inspects the confirmation text's polarity — a contradicting cell passes
```

List A = `{C3-01, C3-02, C3-03}` — 3 IDs, confirmed by `grep -c '^### C3-' 34.9-REVIEW-CYCLE3.md` =
3 (matches the review's own frontmatter `findings: {critical: 0, warning: 2, info: 1, total: 3}`).

### List B — every finding ID with a landed fix, confirmed against the repository

- **C3-01** — claimed by 34.9-29's own delivery (`meta/runTs.cjs`, the private-tmpdir compile
  wrapper) and proven by 34.9-32 (`34.9-WRAPPER-PROOF.md`, run on real macOS arm64 hardware).
  **Confirmation (repository, this execution):** `package.json`'s `scripts` object contains zero
  occurrences of `node_modules/.cache` (`grep -c "node_modules/.cache" package.json` = 0) and 15
  occurrences of `node meta/runTs.cjs` (`grep -c "node meta/runTs.cjs" package.json` = 15);
  `meta/runTs.cjs:119` calls `fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-runts-'))`, a private
  per-invocation directory, not a shared script-name-keyed path. `34.9-WRAPPER-PROOF.md`'s
  frontmatter records observed verdict: PASS, directions_passed 43, directions_failed 0 (read
  directly at execution time).
- **C3-02** — claimed by 34.9-30's delivery (`meta/lintTranslations.ts` doc-comment correction).
  **Confirmation (repository, this execution):** `meta/lintTranslations.ts:30-32`'s doc comment,
  read live, states the earlier claim that argv was mechanically unreachable because of the
  script's invocation mechanism was false and has been removed; the file's scope-from-env-var
  convention is now described as a deliberate convention, not a mechanical necessity, and names no
  invocation mechanism.
- **C3-03** — claimed by 34.9-30's delivery (`34.9-REVIEW-SWEEP-CHECK.cjs`'s case-insensitive
  `POLARITY_DENY_PATTERNS`). **Confirmation (repository, this execution), per this plan's own
  `<polarity_self_trap>` (referenced indirectly, never quoted):** feeding the tool the verbatim
  counter-example cited in `34.9-REVIEW-CYCLE3.md` finding C3-03 produces rejection token
  `FIXED-CONFIRMATION-DENIES-FIX`, confirmed by direct invocation against that exact string at
  execution time. Separately, `node 34.9-REVIEW-SWEEP-CHECK.cjs`, re-run against the real ledger at
  execution time, reports an observed verdict: PASS (exit 0, `REVIEW-SWEEP-OK` line printed).

List B = `{C3-01 → 34.9-29/32, C3-02 → 34.9-30, C3-03 → 34.9-30}` — 3 IDs mapped to a confirmed
landed fix.

### A minus B

Empty. All three gap-cycle-3 findings map to a confirmed landed fix.

### The table

| Finding | Severity | Disposition | Evidence | Independent confirmation (non-.planning) |
|---|---|---|---|---|
| C3-01 | Warning | FIXED | 34.9-29 (`meta/runTs.cjs`, private-tmpdir compile wrapper) + 34.9-32 (`34.9-WRAPPER-PROOF.md`, observed verdict: PASS, 43/43 directions) | package.json: `node_modules/.cache` occurrences = 0, `node meta/runTs.cjs` occurrences = 15 (both counted live); meta/runTs.cjs:119 fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-runts-')) confirmed live |
| C3-02 | Warning | FIXED | 34.9-30 (`meta/lintTranslations.ts` doc-comment correction) | meta/lintTranslations.ts:30-32 read live: earlier pipe/argv-unreachability claim stated false and removed; env-var scope now described as a deliberate convention, no invocation mechanism named |
| C3-03 | Info | FIXED | 34.9-30 (`34.9-REVIEW-SWEEP-CHECK.cjs` polarity deny-list) | live re-run at execution time: the tool rejects the verbatim counter-example cited in 34.9-REVIEW-CYCLE3.md finding C3-03 with token FIXED-CONFIRMATION-DENIES-FIX; a fresh run against the real ledger reports observed verdict: PASS |

**Count:** 3 IDs in list A. 3 mapped to a confirmed landed fix. Unmapped count: **0**.

## Code-review finding disposition — gap cycle 4 review (2026-08-14)

`34.9-REVIEW-CYCLE4.md` (2026-08-14T21:45:00Z) opened five findings against gap cycle 4's own
`meta/runTs.cjs` wrapper and the `34.9-REVIEW-SWEEP-CHECK.cjs` sweep tool itself. Per this project's
own closure protocol (recorded below), this section ledgers all five cycle-4 findings in the same
execution that ledgers gap cycle 3's three findings above — closing the loop in practice, not merely
describing it. Four of the five (C4-01 through C4-04) were fixed by quick task `260814-u2u` (commit
`fdc5b24e7`), landed before this plan ran, and C4-01 was additionally independently live-confirmed by
plan 34.9-32's `34.9-WRAPPER-PROOF.md` Direction B row 11. The fifth (C4-05) is deferred: this plan's
own Task 1 acceptance criteria pin `34.9-REVIEW-SWEEP-CHECK.cjs` itself as unchanged by this plan, so
fixing C4-05 — an asymmetry in the tool's own anti-loophole logic — is out of this task's scope, even
though fixing it would tighten, not loosen, the gate.

### List A — every finding ID in `34.9-REVIEW-CYCLE4.md`

Obtained by `grep -n '^### C4-' 34.9-REVIEW-CYCLE4.md` (raw output, reproduced verbatim):

```
61:### C4-01: No signal handling in `meta/runTs.cjs` — orphans the child process and leaks the tmpdir; invalidates `34.9-WRAPPER-PROOF.md` Direction B row 11's own methodology
112:### C4-02: `node_modules` junction creation runs outside the `try/catch` responsible for tmpdir cleanup — a `symlinkSync` failure leaks the tmpdir via an uncaught exception
143:### C4-03: `spawnSync` launch failures are silently swallowed — no diagnostic is ever printed when the child never starts
168:### C4-04: Signal-terminated and spawn-failed children are both collapsed to a flat exit code `1`, discarding signal-number fidelity
192:### C4-05: `34.9-REVIEW-SWEEP-CHECK.cjs`'s FIXED-row self-citation ban is case-sensitive while its polarity deny-list is case-insensitive — an inconsistent evasion path in the tool that exists to close exactly this class of loophole
```

List A = `{C4-01, C4-02, C4-03, C4-04, C4-05}` — 5 IDs, confirmed by `grep -c '^### C4-'
34.9-REVIEW-CYCLE4.md` = 5 (matches the review's own frontmatter `findings: {critical: 1, warning:
4, info: 0, total: 5}`).

### List B — every finding ID with a landed fix, confirmed against the repository

- **C4-01, C4-02, C4-04** — fixed by quick task 260814-u2u, commit `fdc5b24e7`. **Confirmation
  (repository, this execution):** `meta/runTs.cjs` contains zero live `spawnSync` calls (`grep -c
  spawnSync meta/runTs.cjs` returns 3, all three inside the file's own doc comment describing the
  prior defect, none in executable code — confirmed by reading each matched line); `const { spawn }
  = require('node:child_process')` is the file's only child-process import; `FORWARDED_SIGNALS =
  ['SIGTERM', 'SIGINT', 'SIGHUP']` (line 97) and a `process.on(sig, ...)` handler per signal (from
  line 159) forward to the tracked child, with a bounded `KILL_ESCALATION_MS = 5000` (line 104)
  SIGKILL escalation — C4-01. The `fs.symlinkSync` junction call sits inside the `try` block that
  owns cleanup, per the file's own inline `C4-02` comment at that call site — C4-02. `exitCodeFor()`
  (line 237) propagates `128 + signal number` for a signal-terminated child rather than a flat `1` —
  C4-04. `meta/__tests__/runTsSignals.test.ts` exists on disk; a direct run of that suite (this
  execution) reports 5/5 passed. C4-01 additionally independently live-confirmed by
  `34.9-WRAPPER-PROOF.md` Direction B row 11 (34.9-32): the wrapper process was SIGTERM'd directly,
  confirmed terminated, `$TMPDIR/gamelib-runts-*` confirmed absent afterward, `public/bin/`/
  `build/bin/` byte-unchanged before and after the kill.
- **C4-03** — fixed by the same commit `fdc5b24e7`, as a documented consequence of the async-spawn
  rewrite (D7). **Confirmation (repository, this execution):** `meta/runTs.cjs`'s `runChild()`
  reads `compile.error`/`run.error` and both call sites (lines 297-302, 313-315) log the
  launch-failure diagnostic via `console.error` before `cleanupAndExit`, confirmed by reading the
  file live at execution time.
- **C4-05** — NOT claimed by any landed fix. This plan's own Task 1 acceptance criteria require
  `34.9-REVIEW-SWEEP-CHECK.cjs` to stay unmodified by this plan ("The sweep tool itself is unchanged
  by this task"), confirmed by `git diff --stat` on that file showing no modification at commit
  time — so this finding is deferred, not fixed. See item 21 below.

List B = `{C4-01 → 260814-u2u, C4-02 → 260814-u2u, C4-03 → 260814-u2u (D7 consequence), C4-04 →
260814-u2u}` — 4 IDs mapped to a confirmed landed fix.

### A minus B

`{C4-05}` — deferred, not fixed, per this plan's own Task 1 acceptance criteria pinning the sweep
tool unchanged. Receives item 21 below.

### The table

| Finding | Severity | Disposition | Evidence | Independent confirmation (non-.planning) |
|---|---|---|---|---|
| C4-01 | Critical | FIXED | quick task 260814-u2u (commit `fdc5b24e7`) + 34.9-32 (`34.9-WRAPPER-PROOF.md` Direction B row 11, live SIGTERM confirmation) | meta/runTs.cjs: FORWARDED_SIGNALS array plus per-signal process.on handlers forward to the tracked child with bounded SIGKILL escalation; zero live spawnSync calls (3 doc-comment mentions only); meta/__tests__/runTsSignals.test.ts 5/5 passed (this execution) |
| C4-02 | Warning | FIXED | quick task 260814-u2u (commit `fdc5b24e7`); confirmed live by 34.9-33's own execution | meta/runTs.cjs: the fs.symlinkSync junction call now sits inside the try block that owns cleanup, confirmed live at execution time |
| C4-03 | Warning | FIXED | quick task 260814-u2u (commit `fdc5b24e7`, D7 consequence); confirmed live by 34.9-33's own execution | meta/runTs.cjs: runChild() reads compile.error/run.error and both call sites log via console.error before cleanupAndExit, confirmed live |
| C4-04 | Warning | FIXED | quick task 260814-u2u (commit `fdc5b24e7`); confirmed live by 34.9-33's own execution | meta/runTs.cjs: exitCodeFor() propagates 128+signal for a signal-terminated child instead of a flat 1, confirmed live |
| C4-05 | Warning | FIXED | quick task 260822-hrf (commit `a850e9d66`), closing item 21 opened against 34.9-29's `34.9-REVIEW-SWEEP-CHECK.cjs`; the FIXED-row citation-acceptance check's substring match is now case-insensitive, matching the polarity deny-list's own convention two functions over in the same file; proven with a synthetic fixture where the pre-fix tool scored a mixed-case self-citing evidence cell clean (1/1 mapped, unmapped 0, exit 0) and the post-fix tool correctly rejects it (FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING, exit 1); a control fixture with the citing word removed still scores clean; this real phase directory's own re-run at fix time: verdict PASS, 24/24 mapped, unmapped 0 | Header doc block in `34.9-REVIEW-SWEEP-CHECK.cjs` updated to state the new case-insensitive rule |

**Count:** 5 IDs in list A. 4 mapped to a confirmed landed fix. 1 mapped to a ledger item (item 21).
Unmapped count: **0**. *(As originally recorded 2026-08-14. Superseded 2026-08-22 by quick task
260822-hrf: C4-05 now reads FIXED above; see item 21's own closure note below for the landed
commit. Left in place rather than rewritten, per this ledger's amend-not-retick discipline.)*

### 21. C4-05 — the sweep tool's FIXED-row self-citation ban is case-sensitive while its polarity deny-list is case-insensitive

**What it is:** `34.9-REVIEW-SWEEP-CHECK.cjs:157`'s FIXED-row citation-acceptance check (`const
citesSummary = combined.includes('SUMMARY')`) is an exact-case substring match, while the polarity
deny-list two functions over in the same file (`POLARITY_DENY_PATTERNS`, lines 66-75) is built with
the case-insensitive `/i` flag on every entry. A future FIXED row citing a plan's own summary
document with different capitalisation in its evidence prose (e.g. "documented in this plan's
Summary.") would silently evade the self-citation ban while the polarity check next to it applies
the stricter, case-insensitive standard to the identical class of self-assertion concern.

**Blocker (mechanism, not a summary):** the fix (making the citation check case-insensitive, e.g.
`/SUMMARY/i.test(combined)`) is squarely a change to `34.9-REVIEW-SWEEP-CHECK.cjs` itself, and this
plan's own Task 1 acceptance criteria require the sweep tool to stay byte-unchanged by this plan
("The sweep tool itself is unchanged by this task", verified by `git diff --stat` on that file at
commit time). Fixing C4-05 now would violate that constraint even though the fix itself would
tighten the gate, not loosen it — the reverse of the class of change this project's "fix the ROW,
never the CHECK" rule prohibits. Checked against the real `deferred-items.md`: no current row
exploits this gap (every mixed-case "Summary" occurrence found is prose, not an Evidence-cell
citation of a `*-SUMMARY.md` path) — not a live false negative today, a latent inconsistency in the
tool's own logic, per `34.9-REVIEW-CYCLE4.md`'s own finding text.

**Named precondition:** a future plan authorized to modify `34.9-REVIEW-SWEEP-CHECK.cjs`'s own logic
(i.e. one that does not carry this plan's "sweep tool unchanged" constraint) making the
citation-acceptance check case-insensitive to match the polarity check's own convention.

**OWNER:** whichever plan next touches `34.9-REVIEW-SWEEP-CHECK.cjs`'s own logic, dated 2026-08-14.
This deferral is asymmetric with every other item in this file: it is deferred not because the fix
is risky or unauthorized in principle, but because THIS plan's own acceptance criteria specifically
forbid modifying the file that would need to change, and tightening a gate is the one direction this
project's "never loosen the sweep to admit a row" rule does not prohibit.

**Closure note (2026-08-22, quick task 260822-hrf):** the named precondition landed — this task
(unlike the plan that opened this item) carries no constraint against modifying
`34.9-REVIEW-SWEEP-CHECK.cjs`, so commit `a850e9d66` made the FIXED-row citation-acceptance check's
substring match case-insensitive, matching the polarity deny-list's own convention two functions
over in the same file. Direction proven both ways with a synthetic fixture: the pre-fix tool scored
a mixed-case self-citing evidence cell clean (1/1 mapped, unmapped 0, exit 0); the post-fix tool
correctly rejects the identical fixture (`FIXED-NOT-CONFIRMED-OUTSIDE-PLANNING`, exit 1); a control
fixture with the citing word removed still scores clean under the post-fix tool, confirming the
tightening does not admit a false rejection. Re-running the tool against this real phase directory
at fix time reported `verdict PASS, 24/24 mapped, unmapped 0` — the same real rows this file's own
FIXED claims depend on. This closes C4-05 — see the disposition table above.

### 22. C5-01 — the tmpdir leaks if a signal arrives before the forwarded-signal handlers are installed

**What it is:** `meta/runTs.cjs` creates its private tmpdir at `mkdtempSync` (line 119) but does not
finish installing the `FORWARDED_SIGNALS` handlers until the `for` loop completes (lines 159-193).
A `SIGTERM`/`SIGINT`/`SIGHUP` delivered inside that startup window finds no registered listener, so
Node applies the signal's OS-default disposition and terminates the process **without emitting the
`'exit'` event at all** — which means the `cleanup()` registered via `process.on('exit', ...)` at
line 142 (itself inside the same unprotected window) never runs, and `$TMPDIR/gamelib-runts-*`
survives. The file's own header comment at lines 121-131 calls the `'exit'` registration "a second,
independent guarantee"; that claim assumes `'exit'` fires for every termination, and it does not.

This is C4-01's failure family recurring in a narrower form: there the handlers existed but could
never fire because `spawnSync` blocked the event loop; here the handlers are correct once installed,
but installation is not instantaneous from process start.

**Blocker (mechanism, not a summary):** the fix is a change to `meta/runTs.cjs` — moving the
handler-registration loop to the first statements of `main()`, ahead of `mkdtempSync`, so the
handlers exist before the resource they protect. That file is the exact subject of
`34.9-WRAPPER-PROOF.md`, whose recorded `verdict: PASS` (43/43 directions, run on real macOS arm64
hardware by plan 34.9-32) describes the file **as it stands now**. Editing it after the proof ran
would leave the phase's headline evidence describing a version of the file that is no longer the one
shipped, and this phase's own author/runner separation forbids the runner from re-scoring a contract
it did not author. The change is therefore deferred to a plan that can re-run the affected directions
against the edited file, not because the fix is wrong or risky in itself.

Severity context, recorded so a future reader does not over- or under-react: the reviewer's five
consecutive spawn-then-`kill -TERM` attempts against the real, unmodified file all exited `143` with
no leak. Reproducing the leak required splicing an 800ms busy-wait after `mkdtempSync` to widen the
window artificially, with a non-vacuity control at 1200ms (after the widened window closes) showing
correct cleanup. The window in the shipped file is real but sub-practical — a low-probability gap,
not a systemic one. It also does **not** reopen `34.9-WRAPPER-PROOF.md` Direction B row 11: that
procedure signals only after observing the child's first stdout line, by which point the wrapper has
long since passed line 193.

**Named precondition:** a plan authorized to modify `meta/runTs.cjs` AND to re-run the
`34.9-WRAPPER-PROOF.md` directions affected by the change (at minimum Direction B row 11 and the
Direction A rows, whose PASS bars include a tmpdir-absence criterion), so the proof and the shipped
file describe the same artifact again.

**OWNER:** whichever plan next modifies `meta/runTs.cjs`, dated 2026-08-14. Opened from
`34.9-REVIEW-CYCLE5.md` finding C5-01, execution-verified by the reviewer two independent ways.

**Closure note (2026-08-22, quick task 260822-hrf):** the named precondition landed as a single
task — commit `06d7f6555` moved the `FORWARDED_SIGNALS` handler-registration loop (and the
`'exit'` handler) to the first statements of `main()`, ahead of `mkdtempSync`, and hoisted
`tmpDir`/`cleaned`/`currentChild`/`escalationTimer`/`terminatingSignal` to mutable `let` bindings
at the top of the function so `cleanup()` can be defined and registered before `tmpDir` is
assigned, without the naive move's TDZ crash. `cleanup()` now returns early when `tmpDir === null`
(nothing to remove yet is a correct outcome, not a swallowed failure). Also re-ran the directions
this item's own Named precondition called out: `34.9-WRAPPER-PROOF.md` Direction B row 11 and the
Direction A 15x2 matrix were both live re-run against this edited file in this same task (see that
document's own 2026-08-22 addendum) — both PASS, so the proof and the shipped file describe the
same artifact again. New test T8 in `meta/__tests__/runTsSignals.test.ts` reproduces the reviewer's
own 800ms-busy-wait technique: a SIGTERM landing inside the widened window is now handled cleanly
(exit 143, no tmpdir survivor); the RED half was observed manually against the pre-fix ordering
(default disposition, no `'exit'` event, tmpdir survived on disk). This closes C5-01 — see the
disposition table above.

### 23. C5-02 — `SIGHUP` forwarding has no regression-test coverage

**What it is:** `FORWARDED_SIGNALS` at `meta/runTs.cjs:97` includes `SIGHUP` alongside `SIGTERM` and
`SIGINT`, and commit `fdc5b24e7` names `SIGHUP` as explicitly in scope (the terminal-closed case,
which produces the same orphan-plus-leak shape). But `meta/__tests__/runTsSignals.test.ts` exercises
only `SIGTERM` (T1), `SIGINT` (T2) and an external `SIGKILL` to the child (T4). No test sends
`SIGHUP`, so that one forwarded signal has no pin against silent regression.

**Blocker (mechanism, not a summary):** adding the test means editing
`meta/__tests__/runTsSignals.test.ts`, and a new signal test in that file must be RED-proven against
a pre-fix wrapper copy to be non-vacuous — the discipline every existing test in that file was held
to. That is plan-sized work with its own restore-and-verify protocol, not an inline addition, and
this orchestration run's authorization extends to ledgering review findings, not to writing new
tests. Recorded rather than done, so it cannot be lost.

Not a live defect: the reviewer verified `SIGHUP` behaves correctly by direct execution during the
cycle-5 review — the wrapper exits `129` (128 + SIGHUP) and the tmpdir is removed, with no leak. This
is an untested-path gap, not a broken one.

**Named precondition:** a plan authorized to add tests to `meta/__tests__/runTsSignals.test.ts`,
carrying the same RED-proof-against-a-pre-fix-copy requirement the file's existing five tests were
built under.

**OWNER:** whichever plan next extends `meta/__tests__/runTsSignals.test.ts`, dated 2026-08-14.
Opened from `34.9-REVIEW-CYCLE5.md` finding C5-02.

**Closure note (2026-08-22, quick task 260822-hrf):** the named precondition landed — commit
`b938aaace` added T6 (mirroring T1/T2: `SIGHUP` to the wrapper PID alone kills the child, removes
the tmpdir, wrapper exits `129`) and T7, the RED-proof-against-a-pre-fix-copy control this item's
own Blocker paragraph required: against a generated probe copy with `SIGHUP` removed from
`FORWARDED_SIGNALS`, the wrapper is instead terminated directly by Node's default signal
disposition, the child is orphaned, and the tmpdir survives — proving T6 can actually fail, and
carrying the same non-vacuity discipline the file's existing five tests were held to. T7's leak is
intentional (the observation under test) and is cleaned up inside the test body so the suite's
existing `afterEach` leak assertion stays green unmodified. 7/7 tests passing. This closes C5-02 —
see the disposition table above.

### 24. E-02 — twelve `meta/*.ts` files still document the retired `node_modules/.cache/*.cjs` execution path

**What it is:** plan 34.9-25 corrected every source comment the pipe→`&&` conversion falsified, and
left the `doc-comment accuracy pins (IN-01/IN-02)` suite green (still green today). Plan 34.9-29 then
changed the execution mechanism a second time — `package.json` scripts now run
`node meta/runTs.cjs …`, which compiles into a private
`fs.mkdtempSync(path.join(os.tmpdir(), 'gamelib-runts-'))` directory — without re-running that
stale-comment-correction discipline. Verified live: **zero** `package.json` scripts contain
`--outfile=node_modules/.cache`, yet **12** files under `meta/` still assert that a bundle is written
to `node_modules/.cache/<name>.cjs` and run as `node node_modules/.cache/<name>.cjs`:

`buildCrossoverIndex.ts`, `buildRunnersOnedir.ts`, `buildSidecarSea.ts`, `buildSteamBridgeShims.ts`,
`cleanDistMac.ts`, `downloadHelperBinaries.ts`, `genI18nGateScope.ts`, `gen_vtables.ts`,
`i18nCatalogChurnGuard.ts`, `machineFillGamelib.ts`, `trayIconVariants.ts`, `verifyRunnerBundle.ts`.

Census command (raw): `grep -rln "node_modules/\.cache" meta/*.ts` → 12 files.

Two mechanisms keep this invisible. The `IN-01/IN-02` jest pins assert *prose about why `__dirname`
is avoided*, not the path literal, so the suite stays green while the comment is factually wrong —
the pin measures a different property than the one that drifted. And stale `.cjs` files from before
plan 34.9-29 still sit in `node_modules/.cache/` as residue (`clean-dist-mac.cjs`,
`gen-i18n-gate-scope.cjs`, `gen-vtables.cjs` and others are present on disk right now), so a reader
who checks whether the documented path exists concludes the comment is accurate. The residue actively
launders the drift.

This is the third recurrence of this defect class in Phase 34.9: IN-01/IN-02 originally, the
pipe-conversion instance plan 34.9-25 fixed, and now this one.

**Blocker (mechanism, not a summary):** the fix is a comment rewrite across 12 files, four of which
(`meta/runTs.cjs`'s neighbours `verifyRunnerBundle.ts`, `cleanDistMac.ts`, `buildRunnersOnedir.ts`,
`downloadHelperBinaries.ts`) are named in `34.9-WRAPPER-PROOF.md` and `34.9-PIPE-PROOF.md`, whose
recorded `verdict: PASS` describes the tree as it stands. More importantly, a rewrite that only
corrects the prose would reproduce the same failure a fourth time on the next mechanism change: the
durable fix is a pin that asserts the *path literal* against `package.json`'s actual script values,
so the comment cannot drift silently again. That is plan-sized work with its own RED-proof
requirement, and this run's authorization is to verify threat mitigations, not to edit
implementation files.

**Named precondition:** a plan authorized to modify comments across `meta/*.ts` AND to add a
doc-accuracy pin that derives the expected execution path from `package.json` rather than restating
it, so the assertion fails when the mechanism next changes. The plan should also decide whether to
delete the stale `node_modules/.cache/*.cjs` residue, since its presence is what makes the wrong
comments look right.

**OWNER:** whichever plan next performs a doc-accuracy pass over `meta/*.ts`, dated 2026-08-15.
Opened from `34.9-SECURITY.md` escalation E-02 (threat `T-34.9C3-19`, plan 34.9-25). Not a security
control failure and not a live build defect — an evidence-surface defect. Note for the next reader:
the security audit's first pass sampled two files and reported two; a census over all of `meta/*.ts`
found twelve. The defect's unit is the file, and an audit whose unit is coarser cannot find it.

**Closure note (2026-08-22, quick task 260822-hrf, Task 5, commit `5af220b4b`):** the named
precondition landed. Rewrote each of the affected files to describe the real invocation
(`node meta/runTs.cjs`, `package.json`'s actual script name) instead of the retired
`node_modules/.cache` tmpdir filename, preserving each comment's original point. Deleted the 10
stale `node_modules/.cache/*.cjs` residue files (untracked, gitignored) whose mere presence had
laundered the wrong comments into looking accurate. Added the durable fix this item's Blocker
paragraph called for — not just a prose correction, but a pin: `meta/__tests__/runTs.test.ts` gained
a negative pin (no `meta/*.ts` source mentions `node_modules/.cache`, tied to the fact that no
`package.json` script writes there), a positive pin (every `package.json` script wrapping a
`meta/<X>.ts` entry through `meta/runTs.cjs` has its runner path equal to `meta/runTs.cjs`, derived
from `loadScripts()` rather than hand-copied), and a vacuity guard (pin 1's predicate fires against a
known-bad synthetic input) — so this defect's third-recurrence pattern (IN-01/IN-02, then the
pipe-conversion instance, then this one) cannot recur silently a fourth time; the next mechanism
change will fail the pin instead of drifting invisibly under it, which is the exact miss the
IN-01/IN-02 pins made because they asserted rationale prose rather than the path fact.

This item's own **census count of twelve is left as originally recorded above, not silently
corrected** — per this ledger's amend-in-place-don't-re-tick discipline, the number an item opened
with stays put even when a later fix finds the ground has shifted. A live re-census at fix time
(`grep -rln "node_modules/\.cache" meta/*.ts`) found **thirteen** distinct files had carried the
stale pattern at some point across this item's lifetime, not twelve: `meta/buildDecompressWorkerDev.ts`
was added to the repository after this item was written and carried the same stale-comment pattern,
so it was never part of the original twelve this item named. One of the originally-named twelve —
`meta/cleanDistMac.ts` — no longer needed touching by this closure's own commit: Task 4 of this same
quick task (commit `ab1ee0448`) had already rewritten it end to end while generalizing it for IN-03
(renamed to `meta/cleanDist.ts` first), and that rewrite incidentally removed its stale
`node_modules/.cache` references before this item's fix ever ran. Commit `5af220b4b`'s own diffstat
therefore touches 12 `meta/*.ts` files, not 13 — the original eleven still needing the fix plus the
one new arrival (`buildDecompressWorkerDev.ts`) — and a post-fix census across all of `meta/*.ts`
confirms zero remaining matches (verified: `grep -rl "node_modules/\.cache" meta/*.ts` returns
nothing). This closes E-02 — its `E-02` ID shape is not one of the `C<n>-<nn>` / `CR-<nn>` /
`WR-<nn>` / `IN-<nn>` shapes `34.9-REVIEW-SWEEP-CHECK.cjs` recognizes, so this closure is recorded
here in prose rather than as a disposition-table row; there is no disposition table for this item to
flip.

## Closure protocol — why every cycle's own review is unledgered by construction

Recorded 2026-08-14 (gap cycle 4, plan 34.9-33), fuller than the abbreviated note `ROADMAP.md`'s
Phase 34.9 section already carries — this section is the canonical version; `ROADMAP.md`
cross-references it rather than duplicating it in full.

**The mechanism.** `/gsd-execute-phase` orders its gates: run all waves, THEN `code_review_gate`,
THEN `regression_gate`, THEN `verify_phase_goal`. A phase's reconciliation sweep IS its last wave, so
it always runs *before* the review whose findings it is supposed to sweep. The review that produces
a cycle's findings does not exist yet when that cycle's own sweep runs — the sweep is structurally
incapable of seeing a document that has not been written. This is not a diligence problem, and
improving the sweep's rigor cannot fix it: no amount of care in a wave-scheduled task can inspect a
file `code_review_gate` has not written yet.

**The four instances this phase hit this exact shape.**

1. **CR-01** (`34.9-REVIEW.md`), missed by 34.9-17 — 34.9-17's own reconciliation ledgered 6 descoped
   items, 2 UI defects and 1 PKCE note, and named zero code-review findings. Swept later by gap
   cycle 2 (34.9-22).
2. **C2-01..C2-08** (`34.9-REVIEW-CYCLE2.md`), missed by the cycle that produced it — no plan in gap
   cycle 2 ran after `34.9-REVIEW-CYCLE2.md` existed. Swept later by gap cycle 3 (34.9-28,
   `34.9-C2-SWEEP-CHECK.cjs`).
3. **C3-01..C3-03** (`34.9-REVIEW-CYCLE3.md`), missed by 34.9-28 — a plan written specifically to
   stop this recurring, dated the same day as the review it could not have swept (28-SUMMARY.md
   mtime 19:32, `34.9-REVIEW-CYCLE3.md` mtime 19:45). Swept later by gap cycle 4 (this plan, 34.9-33).
4. **This cycle** (`34.9-REVIEW-CYCLE4.md`, C4-01..C4-05) — produced by `code_review_gate` running
   against gap cycle 4's own waves (34.9-29..32), and discovered live by this plan's own sweep
   re-run rather than trusted from planning-time expectations (planning time measured 17 IDs / 3
   unmapped; this plan's own live sweep found 22 IDs / 8 unmapped, because `34.9-REVIEW-CYCLE4.md`
   did not exist at planning time). Swept in the same execution as C3-01..C3-03, above — the loop
   broken in practice, not merely described, per this plan's own governing decision D-C4-04.

**The remedy is ordering, not diligence.** Re-run the sweep tool AFTER the review gate has written
that cycle's review, and ledger its findings BEFORE `/gsd-verify-work` runs. This plan's own
blocking checkpoint (Task 3) is the mechanism that enforces this for gap cycle 4's own review going
forward — a wave-scheduled task cannot carry the sweep past `code_review_gate`, because the wave
always runs first; only a checkpoint that holds the phase open until the operator confirms the
post-review sweep is green can.

**Operational hazard: the fixed-path silent overwrite.** `code_review_gate` writes to the FIXED path
`{phase_dir}/{padded_phase}-REVIEW.md` and **silently overwrites** on every re-review — there is no
versioning, no append, no warning. This phase's one-file-per-cycle convention
(`34.9-REVIEW.md`/`34.9-REVIEW-CYCLE2.md`/`34.9-REVIEW-CYCLE3.md`/`34.9-REVIEW-CYCLE4.md`) has only
ever held because the newly-written file was moved by hand, immediately, before the next re-review
could clobber it. A future cycle that forgets this step will lose the prior cycle's review text
permanently, with no diagnostic — `git show HEAD:<path> > <path>` is the recovery if it is caught
via `git status` before the next commit; there is no recovery once committed over without git
history to fall back on.

## Code-review finding disposition — gap cycle 5 review (2026-08-14)

`34.9-REVIEW-CYCLE5.md` is **the protocol recorded immediately above, executed for the first time.**
It is this execution's own `code_review_gate` output, reviewed and ledgered *before*
`/gsd-verify-work` rather than after — which is the whole point of D-C4-04. Its output path was
redirected by hand to `34.9-REVIEW-CYCLE5.md`; the default fixed path would have silently clobbered
`34.9-REVIEW.md` (gap cycle 1's review, `reviewed: 2026-08-11T03:22:49Z`, confirmed intact and
untouched after this review ran). That clobber would have destroyed history *and* corrupted this
sweep tool's own input set, since it parses every `*-REVIEW*.md` by filename.

Scope reviewed: `meta/runTs.cjs` — which commit `fdc5b24e7` rewrote (+211/-49) **after**
`34.9-REVIEW-CYCLE4.md` was written, so the shipped version had never been reviewed by anyone — plus
the new `meta/__tests__/runTsSignals.test.ts` and `meta/__tests__/fixtures/runTsSignalFixture.ts`.
`meta/__tests__/runTs.test.ts`, `meta/lintTranslations.ts` and `package.json` were confirmed
unchanged since cycle 4 by git log, so their cycle-4 dispositions stand.

Both findings are DEFERRED, and neither is a live defect. Recording why, because "deferred" has been
used loosely in this file's history: C5-01 is a real but sub-practical startup race the reviewer
could only reproduce by artificially widening the window; C5-02 is an untested-but-verified-correct
path. Both fixes touch files whose current state is load-bearing evidence — `meta/runTs.cjs` is the
subject of `34.9-WRAPPER-PROOF.md`'s `verdict: PASS`, and editing it after the proof ran would leave
the phase's headline evidence describing a file that is no longer the one shipped.

### List A — every finding ID in `34.9-REVIEW-CYCLE5.md`

Obtained by `grep -n '^### C5-' 34.9-REVIEW-CYCLE5.md` (raw output, reproduced verbatim):

```
72:### C5-01: Tmpdir leaks if a signal arrives before the signal handlers are installed (startup-only race, real but narrow)
132:### C5-02: `SIGHUP` forwarding has zero regression-test coverage
```

List A = `{C5-01, C5-02}` — 2 IDs, confirmed by `grep -c '^### C5-' 34.9-REVIEW-CYCLE5.md` = 2
(matches the review's own frontmatter `findings: {critical: 0, warning: 1, info: 1, total: 2}`).

### List B — every finding ID with a landed fix, confirmed against the repository

Empty. Neither finding was fixed in this execution; both are mapped to ledger items instead.

### A minus B

`{C5-01, C5-02}` — both require a disposition row, and both have one below.

| Finding | Severity | Disposition | Evidence | Independent confirmation (non-.planning) |
|---|---|---|---|---|
| C5-01 | Warning | FIXED | quick task 260822-hrf (commit `06d7f6555`), closing item 22 opened against 34.9-32's `meta/runTs.cjs`; handler registration (the FORWARDED_SIGNALS loop) now runs before `mkdtempSync`, closing the startup-window race; proven live: T8 in `meta/__tests__/runTsSignals.test.ts` reproduces the reviewer's own 800ms-busy-wait technique and shows a SIGTERM landing inside the widened window is handled cleanly post-fix (exit 143, no tmpdir survivor), RED half observed manually against the pre-fix ordering (default disposition, no exit event, tmpdir survived); a real `pnpm clean:dist-mac` run completes with zero gamelib-runts-* survivors | 11/11 signal tests + runTs.test.ts passing, tsc --noEmit clean, handler-before-mkdtempSync order verified programmatically |
| C5-02 | Info | FIXED | quick task 260822-hrf (commit `b938aaace`), closing item 23 opened against 34.9-32's `meta/runTs.cjs`; T6/T7 added to `meta/__tests__/runTsSignals.test.ts` pin SIGHUP forwarding with a non-vacuity control -- T7 removes SIGHUP from a generated probe copy's FORWARDED_SIGNALS and shows the wrapper is then killed by default disposition, child orphaned, tmpdir leaked, proving T6 can actually fail | 7/7 tests passing, tsc --noEmit clean |

**Count:** 2 IDs in list A. 0 mapped to a confirmed landed fix. 2 mapped to ledger items (items 22
and 23). Unmapped count: **0**. *(As originally recorded 2026-08-14. Superseded 2026-08-22 by
quick task 260822-hrf: both rows above now read FIXED; see items 22 and 23's own closure notes
below for the landed commits. Left in place rather than rewritten, per this ledger's amend-not-retick
discipline.)*
