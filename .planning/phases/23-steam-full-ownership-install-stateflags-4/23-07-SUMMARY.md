---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 07
subsystem: steam
tags: [steam, depot, trace, g-23-02, root-cause, hardware-gate, uat, evidence-only]

# Dependency graph
requires:
  - phase: 23-06
    provides: the steam-flags-census instrumentation (plan-build / download-entry / download-complete) and the H1-H5 hypothesis matrix with concrete confirm/refute field criteria — this plan is the live-hardware execution of that matrix
provides:
  - "23-TRACE.md VERDICT: H2 CONFIRMED on real macOS hardware, with H1/H3/H4/H5 each refuted by a cited census field value"
  - "The architectural finding that EDepotFileFlag is NOT a sufficient source of executability on macOS — 2 of 3 titles censused carry zero executable flags, the third carries exactly one, while Steam's own install of one of the zero-flag titles carries 18,002 execute bits"
  - "Gate 1 launch-half trustworthiness verdict: MASKED, established by measurement rather than operator recall"
  - "G-23-02 in 23-UAT.md upgraded from a hypothesis list to a confirmed root cause with a specific implied fix"
affects: [23-08, 23-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capture the decisive diagnostic BEFORE the expensive work it precedes: stage=plan-build is emitted at buildDepotPlan return, so a started-then-cancelled install yields a complete verdict without a full multi-GB download. Run 2's install failed at 17% and still closed the verdict; run 3 was cancelled deliberately after ~55s."
    - "Certify a precondition by MEASUREMENT, not by the actor's self-report: the fresh-install requirement (T-23-22) was proven by the census's own reconciledSkipped=0 / jobCount==totalFiles, which is sound even though the uninstall that was supposed to establish it is itself under active debug for lying about completion."
    - "Validate a writer against the reference implementation's OUTPUT, not against its own internal consistency: comparing GameLib's landed WazHack install to a pre-captured baseline of Steam's own install of the same title turned 'the pipeline looks self-consistent' into 'the pipeline is byte-for-byte identical to Steam', which is what made the refutations decisive."
    - "When a control cannot reach the surviving hypothesis, say so in the artifact rather than letting the reader assume coverage — run 1 recorded that a single-depot control is structurally unable to test a multi-depot cause, and run 2 then closed that gap explicitly (depots=1, 2, 3 now all observed)."

key-files:
  created:
    - .planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md
    - ~/Library/Logs/GameLib/23-07-archive/humankind-pre-uninstall-baseline.txt (untracked, operator machine)
  modified:
    - .planning/phases/23-steam-full-ownership-install-stateflags-4/23-TRACE.md
    - .planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md

requirements: [REQ-23-06, REQ-23-07]
status: complete
completed: 2026-08-16
---

# Plan 23-07 Summary — G-23-02 live hardware trace

**Evidence only. No source file was modified, no `chmod` was performed, no fix was designed here.**
Both tasks were `checkpoint:human-verify` / `gate="blocking-human"`, executed against a real
authenticated Steam account on real macOS hardware, on the **Electron** runtime (the Tauri sidecar's
file logger is unreadable — stdout is the RPC pipe — so `~/Library/Logs/GameLib/gamelib.log` only
exists under Electron).

## Task 1 — VERDICT: **H2 CONFIRMED**

Three `stage=plan-build` censuses were gathered across the two tasks:

| Title | appId | depots | totalFiles | flagBearing | executableFlagged | distinctFlagValues |
|---|---|---|---|---|---|---|
| WazHack | 264160 | 1 | 198 | 28 | **1** | `[32,64]` |
| HUMANKIND | 1124300 | 2 | 18949 | 140 | **0** | `[64]` |
| Cyberpunk 2077 | 1091500 | 3 | 133 | 32 | **0** | `[64]` |

`flagBearing` equals `directoryEntries` exactly in every row except WazHack's single extra executable.

**H2 confirmed** on HUMANKIND: `flagBearing=140` (> 0, flags *are* populated) with
`executableFlagged=0`, and `distinctFlagValues=[64]` proving the only `EDepotFileFlag` present across
both depots is `64` (Directory). GameLib applied exactly what the manifest specified — nothing
executable. The `0 of 18,809 files +x` at the original launch failure is the writer behaving
**correctly** against a manifest with nothing to apply.

Refutations, each citing a field value:

- **H1** — `flagBearing=140` (run 2) and `=28` (run 1), never `0`; run 1 also `chmodAttempts=1`. The
  depot.ts:524-531 parser mapping is **exonerated**.
- **H3** — run 1 `chmodAttempts=1` **and** the landed binary is `-rwxr-xr-x`. Modes apply and persist
  at the correct path.
- **H4** — run 1 `jobCount=198` = `totalFiles=198`, `reconciledSkipped=0` on a certified-fresh install.
- **H5** — in all runs `plan-build` and `download-entry` are field-for-field identical.

The single strongest result: GameLib's WazHack install reproduced a pre-captured baseline of **Steam's
own** WazHack install byte-for-byte — 171 files, 1 `+x`, same file, same modes, same `-rw-r--r--` on
the `unitypurchasing` Mach-O *bundle*.

### Implied fix shape handed to 23-08

`EDepotFileFlag` is **not a sufficient source of executability on macOS**, and this is the normal case,
not an anomaly. Steam's own HUMANKIND install carries **18,002 of 18,809** files `+x` — per-file, not
blanket (`.wem`/`.txt`/`.dll`/`.manifest` excluded; `freetype6.dylib` is `+x` while `freetype6` beside
it is not) — despite the manifest supplying zero. The official client derives execute bits by other
means, and `StateFlags=4` guarantees no verify pass ever repairs the difference.

Selects **23-08's H2 branch**, including Task 3's magic-byte fallback, with one constraint this trace
adds: detection must discriminate **Mach-O subtype**, not merely "is Mach-O" — Steam leaves bundles
non-executable while marking executables and dylibs `+x`. Per REQ-23-01, `canWriteFullOwnership(...)`
should fail closed to Phase 21's `1026` verify-handoff while executability is unestablished; **that
gate's live behavior is UNOBSERVED** — run 2 never wrote an `.acf`.

## Task 2 — Gate 1 trustworthiness: **MASKED**

The planned cold-launch test was **not performable**: Cyberpunk 2077 retains 52 files, 0 with `+x`,
and **no `.app` bundle or Mach-O binary anywhere**, with `.acf` `StateFlags 36` (FullyInstalled +
FilesMissing). A launch would have failed for reasons unrelated to execute bits and returned no
signal. The two conditions the acceptance criteria ask about — Steam confirmed not running, Steam
auto-starting during launch — are therefore **not applicable: no launch was attempted.**

Operator recall (step 3): **cannot recall confidently** whether the 2026-07-19 launch used GameLib or
the Steam client. Recorded as an honest UNKNOWN, not reconstructed.

Rather than resting on memory, Cyberpunk's own manifest was censused via the same
cancel-after-plan-build technique: `executableFlagged=0`, `distinctFlagValues=[64]`, `depots=3`. A
GameLib `StateFlags=4` install of Cyberpunk would land **zero** executable files. The recorded launch
therefore **cannot** have run on execute bits GameLib applied → **MASKED**. Gate 1's *adoption* half
(StateFlags=4 accepted, no verify, no re-download) is unaffected and still stands.

**Honesty limit:** this establishes what did *not* launch it, not what did. The mechanism (Steam UI
Play vs a `steam://` handoff starting Steam, which then re-applies modes) is **unobserved and no
longer observable here** — no binary survives and the install has since been overwritten. 23-10 must
re-confirm against a *freshly* GameLib-installed title with Steam verified not running.

## Deviations from plan

1. **Run 2 was not a completed install.** Step 7 asked to repeat steps 1-6 against HUMANKIND. The
   install failed at 17% (see incidental defect below), so `stage=download-complete` and the landed
   execute-bit census were never produced. **This does not weaken the verdict** — H2's predicate is
   evaluated entirely on `stage=plan-build`, which was captured. Recorded rather than papered over.
2. **Task 2's cold launch was replaced by a manifest census.** Justified above: the prescribed test
   was un-runnable, and the substitute is strictly stronger than the operator recall the plan would
   otherwise have fallen back to.

## Incidental defect found (out of scope, filed to todos)

`Installation of 1124300 failed with: install did not settle — connection may be stale` (21:36:40) —
**the depot chunk loop did not stop**, running ~5 more minutes and leaving 4,486 files with no `.acf`
(so 23-03's reconciler cannot see them). It only stopped when GameLib exited.

Sharpened by a contrast measured 14 minutes later in the same session: an explicit user **Cancel** on
Cyberpunk logged `SteamGame: aborting in-flight native depot download` and stopped the loop the same
second. **The abort machinery exists and works — the failure path simply never invokes it**, which
should make the fix small. Filed to
`.planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md`. Distinct from
23-05's single-flight work (that fixed *two concurrent installs*; this is *one install whose failure
path fails to cancel its own worker*).

## Verification

- `grep -c "steam-flags-census" 23-TRACE.md` → 10 (≥ 3 required), all lines verbatim.
- `23-TRACE.md` frontmatter `status: verdict-recorded`, `verdict: H2` (was `awaiting-live-run`).
- `23-UAT.md` G-23-02 carries the confirmed root cause; `status: open` **retained** (diagnosed, not
  fixed). Gaps YAML re-parsed clean.
- `LastOwner` SteamID64 not transcribed anywhere (T-23-20): `grep -c` → 0.
- No source file modified by this plan. Note: `library.ts`, `library.test.ts` and `translation.json`
  carry uncommitted changes belonging to a **concurrent** debug session
  (`.planning/debug/wazhack-uninstall-reverts.md`); they were deliberately left untouched and
  excluded from this plan's commits — no `git stash` was used at any point.

## What this unblocks

23-08 may now proceed: the verdict is unambiguous (H2), so its Task 1 branch selection and its Task 3
"only if H2" gate both resolve. 23-10 gains a concrete extra obligation — re-confirm Gate 1's launch
half, which this plan downgraded.
