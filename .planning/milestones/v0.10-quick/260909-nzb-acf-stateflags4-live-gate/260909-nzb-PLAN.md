---
phase: quick-260909-nzb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md
  - .planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md
  - .planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-SUMMARY.md
autonomous: false
requirements: [QUICK-260909-nzb]

must_haves:
  truths:
    - "The todo's item 3 reads ANSWERED with the DLC-union hypothesis refuted by arithmetic, not by assertion"
    - "The todo's 'Suspected mechanism' section carries a correction stating byte-exactness is the ordinary case (18/23) and carries no signal"
    - "The todo states that ENOTEMPTY and structural verification are mutually exclusive and require TWO runs"
    - "A live-gate contract exists specifying two gates plus a mandatory negative control, on appId 112100, native path"
    - "The gate contract forbids a fabricated pass and names BLOCKED as the honest outcome"
    - "No file under src/backend/storeManagers/steam/ is modified by this plan"
    - "Neither damaged install (native 38410, native 718850) is repaired, deleted, verified or mutated"
  artifacts:
    - path: ".planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md"
      provides: "Corrected record: item 3 ANSWERED, mechanism section retired, gate design corrected"
      contains: "2026-09-09"
    - path: ".planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md"
      provides: "Executable live-gate contract: Gate A, Gate B, negative control, backup/restore ledger"
      min_lines: 120
    - path: ".planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-SUMMARY.md"
      provides: "Recorded verdict per gate, PASS/FAIL/BLOCKED with reason"
  key_links:
    - from: ".planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md"
      to: ".planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md"
      via: "todo's gate-design correction section names the contract file"
      pattern: "260909-nzb-LIVE-GATE"
    - from: ".planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-SUMMARY.md"
      to: ".planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md"
      via: "summary records a verdict per gate id defined in the contract"
      pattern: "Gate A"
---

<objective>
Action the todo `2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md`:
record two desk findings that close its item 3 and retire its "Suspected mechanism"
section, correct its gate design, author the live-gate contract that its corrected
design demands, and record the outcome of running it.

Purpose: the todo's remaining unclosed subject is that `verifyStructuralIntegrity`
— the fail-closed completeness gate shipped by quick `260908-nbd` — has never been
exercised live. The todo's own prescribed run **cannot** exercise it (see Finding 3
below), so the contract has to be corrected before it is driven, or the run burns a
live install and proves the wrong half.

Output: a corrected todo, an executable live-gate contract, and a recorded verdict.

**This is a DOCS + LIVE-GATE task. It ships no production code.**
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md
@CLAUDE.md

Read-only reference (DO NOT EDIT — see hard constraints):
@src/backend/storeManagers/steam/depot.ts
@src/backend/storeManagers/steam/depot/reconcile.ts
</context>

<hard_constraints>
These are not guidance. A task that violates one is failed, not partially done.

1. **NO source change under `src/backend/storeManagers/steam/`.** The gate exists to
   measure the shipped code. Editing it invalidates the measurement. This includes
   "harmless" logging additions.
2. **NO repair of either damaged install.** Native 38410 (`master.dat` still an empty
   directory under a `StateFlags=4` manifest) and native 718850 (still 13.59 GB short)
   must not be repaired, deleted, verified, re-installed or otherwise mutated. Repair
   is the user's decision and the orchestrator will ask separately.
3. **The only writes under `~/Library/Application Support/Steam` this plan authorises
   are the 112100 gate's own**, and each requires a `cp` backup with a recorded
   `sha256` and a restore step.
4. **Never `git checkout --` anything.** The repo's post-checkout hook fires and
   attempts a helper-binary download. Restore by `cp` from a hashed backup.
5. **Do not re-derive Findings 1 or 2.** They were measured on live disk this session
   and are given verbatim in Task 1.
</hard_constraints>

<given_findings>
Measured this session on live disk. Task 1 records these; no task re-derives them.

**Finding 1 — item 3 is ANSWERED; the DLC-union hypothesis is REFUTED.**
`appmanifest_718850.acf` `InstalledDepots` holds 9 depots totalling 17,151,298,416 B.
Depots carrying a `dlcappid` sub-key total 561,517,956 B. Base depots alone
(718851 = 16,328,140,703 + 718853 = 261,639,757) are 16,589,780,460 B against
3,560,381,799 B actually on disk. Excluding **every** DLC depot still leaves a
13.03 GB shortfall against a total shortfall of 13.59 GB — DLC accounts for at most
4.1%. On-disk shape: 1315 files, 305 directories (24 empty), across
`Content/DLC00`–`DLC05` pack/library dirs and `Language/*/Text`; largest present file
654 MB (`Content/Title/Libraries/PFX/Particles.clb`). This is a broad content shortfall
in base depot 718851, **not** the plan-accounting artifact the todo hypothesised.

**Finding 2 — the "Suspected mechanism" section is retired.**
Across all 23 manifests in `~/Library/Application Support/Steam/steamapps`,
`SizeOnDisk` equals `sum(InstalledDepots[].size)` byte-exactly in **18 of 23** —
spanning healthy and damaged, Steam-written and GameLib-written. Byte-exactness
carries **no signal** about incompleteness; it is the ordinary case. The 5 mismatches
are 291650, 57300 (+1657), 8930 (−1396), 91310, and 402060 (no `InstalledDepots`
block at all). GameLib-written manifests showing small non-zero deltas independently
corroborates the 2026-09-08 correction that `measureInstalledBytes` is a real
recursive on-disk walk, not a manifest sum.

**Finding 3 — the todo's gate design is WRONG.**
`clearStaleDirectoryAtFilePath` (`depot.ts:1074`) rethrows the ENOTEMPTY refusal,
which lands in `failures[]`. `runLooksComplete` (`depot.ts:2700`) is
`allJobsAttempted && failures.length === 0 && !opts.signal?.aborted`, and
`verifyStructuralIntegrity` runs **only** inside `if (runLooksComplete)`
(`depot.ts:2703`). An ENOTEMPTY run therefore has `failures.length > 0` →
`runLooksComplete === false` → **the structural gate is skipped entirely**. The two
halves are mutually exclusive; they need TWO different runs. The todo's single
prescribed run proves the repair half and leaves `verifyStructuralIntegrity` — the
thing its own title calls "unproven live" — still unproven.

**Also given, measured this session (do not re-derive):**
- Dev build RUNNING: `target/debug/gamelib-shell` PID 82754, node sidecar PID 82760,
  both started 2026-09-09 ~14:57.
- `build/main/sidecar.js` built 2026-09-09 14:56:55 (after the gate commits) and
  contains `verifyStructuralIntegrity` (2 hits), the `post-download structural`
  string (2 hits), the ENOTEMPTY refusal string (1 hit). Commits `5f0f37112` and
  `744f93d65` are both ancestors of HEAD.
- Steam auth present (`steam_store/config.json` has `refreshToken`,
  `isLoggedIn: true`); `enableSteamNativeInstall = True`.
- The real Steam client is NOT running (only a stale `ipcserver` from Sep 7).
- Branch `fix/steam-native-install-stability`; `workflow.use_worktrees=false`.
</given_findings>

<interfaces>
<!-- Extracted from the shipped code. The executor writes the contract against these
     exact predicates and strings — no codebase exploration is needed. -->

`src/backend/storeManagers/steam/depot.ts:2700-2705` — the mutual exclusion:

    const runLooksComplete =
      allJobsAttempted && failures.length === 0 && !opts.signal?.aborted
    let structurallyVerified = true
    if (runLooksComplete) {
      const structural = await verifyStructuralIntegrity(plan, installRoot)

`depot.ts:2709` — the structural warning (WRAPPED across source lines; grep a short
fragment only, never the whole sentence):

    post-download structural re-verification found N of M planned entries damaged or missing — failing closed to StateFlags=1026 instead of an unproven StateFlags=4: "<file>" <reason> (expected=<n> found=<n>)

`depot.ts:1091` — the ENOTEMPTY refusal (also wrapped in source):

    downloadDepotFiles: "<filename>" is a file in the depot manifest, but a NON-EMPTY directory exists at that path. Refusing to delete it (<err>) — remove it by hand and retry the install.

`depot.ts:1099` — the stale-EMPTY-directory repair line (must NOT appear in Gate A;
the planted directory is non-empty):

    downloadDepotFiles: removed a stale empty directory at "<filename>"

`reconcile.ts:262-318` — `verifyStructuralIntegrity(plan, installRoot)` walks
**every planned entry** (not only the ones downloaded this run) and applies the same
type+size predicate the reconciler does: directory / symlink / zero-size /
`regularFileShape`. No sha1. This is why post-write damage to a
reconcile-SKIPPED file is invisible to the reconciler and visible to the structural
check — that gap is the only place Gate B can live.

`src/backend/storeManagers/steam/games.ts:1077` — the routing decision:

    const routeThroughBottle = forceWindowsViaBottle || this.isBottleEligible()

`games.ts:1890-1907` — `isBottleEligibleFromPlatforms()` returns true when
`mac_arch === '32'`, or when `platformsCaptured === true && is_mac_native === false`.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Record Findings 1-3 in the todo, correcting in place</name>
  <files>.planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md</files>
  <action>
Append a new dated section to the END of the todo and amend the three specific
passages named below. This file has a strong established norm — two prior
corrections (2026-09-08 x2) are appended as dated sections with the superseded text
left standing and annotated in place. Follow that norm exactly: **never delete or
rewrite prior text**; strike it with a `~~...~~` + dated verdict, or annotate it with
a `**Corrected 2026-09-09: ...**` line, the way the file already does.

Preserve `split_from` and `debug_session` in the frontmatter verbatim — they carry
the provenance chain and are the stated reason this todo was never moved to
`completed/`.

Frontmatter: keep `severity: major`, `platform: any`, `ready: live-gate`, bare and
lowercase per CLAUDE.md's todo-triage conventions. `ready` stays `live-gate`: the gate
is now specified but has not been driven, which is exactly what `live-gate` means.
Do not change `status: OPEN`.

Three amendments, all in place:

1. **"What to do" item 3** — currently `3. Establish 718850's shape ... **Still
   open.**`. Strike it (`~~...~~`) and follow with `ANSWERED 2026-09-09` plus the
   Finding 1 arithmetic in full: 9 depots / 17,151,298,416 B total; DLC-tagged depots
   561,517,956 B; base 718851 + 718853 = 16,589,780,460 B; on disk 3,560,381,799 B;
   residual shortfall excluding every DLC depot 13.03 GB against a total 13.59 GB, so
   DLC covers at most 4.1%. State the verdict plainly: the DLC-union hypothesis is
   REFUTED, this is a broad content shortfall in base depot 718851. Include the
   on-disk shape (1315 files, 305 dirs, 24 empty, largest present file 654 MB
   `Content/Title/Libraries/PFX/Particles.clb`).

2. **"Two DIFFERENT shapes" section, the 718850 bullet** — its "**Not established**:
   this may instead be unowned/unselected DLC depots entering the `selectAllDepots`
   base+DLC union" clause is now false. Annotate it in place with a
   `**Corrected 2026-09-09:**` line pointing at the item-3 answer. Do not delete the
   bullet.

3. **"Suspected mechanism (NOT established)" section** — add a
   `**RETIRED 2026-09-09:**` annotation below its existing 2026-09-08 correction,
   recording Finding 2: 18 of 23 manifests in `steamapps` have `SizeOnDisk` byte-exactly
   equal to `sum(InstalledDepots[].size)`, spanning healthy AND damaged, Steam-written
   AND GameLib-written; the 5 mismatches are 291650, 57300 (+1657), 8930 (−1396),
   91310, and 402060 (no `InstalledDepots` block). Byte-exactness is the ordinary case
   and carries no signal about incompleteness, so the section's central inference is
   dead — retained only as a historical record. Note that GameLib-written manifests
   showing small non-zero deltas independently corroborates the 2026-09-08 finding
   that `measureInstalledBytes` is a real recursive walk.

Then append the new section, headed
`# 2026-09-09 — the prescribed discriminating run CANNOT prove the structural gate`,
containing:

- The Finding 3 mechanism, with file:line citations: `clearStaleDirectoryAtFilePath`
  (`depot.ts:1074`) rethrows → `failures[]`; `runLooksComplete` (`depot.ts:2700`) is
  `allJobsAttempted && failures.length === 0 && !opts.signal?.aborted`;
  `verifyStructuralIntegrity` runs ONLY inside `if (runLooksComplete)`
  (`depot.ts:2703`). Therefore an ENOTEMPTY run has `runLooksComplete === false` and
  the structural gate is SKIPPED.
- The consequence stated bluntly: the "discriminating run, still NOT taken" section
  above prescribes ONE run and claims it proves the gate. It proves the **repair**
  half only. `verifyStructuralIntegrity` needs a run that otherwise looks complete
  and carries post-write damage — a different run, requiring mid-run fault injection.
- Why post-write damage is the only shape that discriminates: `verifyStructuralIntegrity`
  applies the same type+size predicate the reconciler does, so any damage present
  BEFORE reconcile is repaired by reconcile and never reaches the structural check.
  The two checks differ only in WHEN they run.
- A `**MANDATORY negative control**` bullet: an undamaged run of the same title must
  still earn `StateFlags=4`. Without it a `1026` proves nothing — a live null
  hypothesis is that the chosen title never earns a 4 at all.
- A pointer to the contract: `.planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md`.
- One line annotating the older "The discriminating run, still NOT taken" heading as
  superseded in design by this section (annotate, do not delete).

Do NOT touch the "Cleanup still owed" or "Live damage, not yet repaired" sections —
both damaged installs stay open and unrepaired per hard constraint 2.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; T=.planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md &amp;&amp; python3 .planning/todos/todo-frontmatter-gate.py &amp;&amp; grep -Fc 'ANSWERED 2026-09-09' "$T" &amp;&amp; grep -Fc 'RETIRED 2026-09-09' "$T" &amp;&amp; grep -Fc 'the prescribed discriminating run CANNOT prove' "$T" &amp;&amp; grep -Fc '260909-nzb-LIVE-GATE.md' "$T" &amp;&amp; grep -Fc '13.03' "$T" &amp;&amp; grep -Fc '18 of 23' "$T" &amp;&amp; grep -Fc 'runLooksComplete' "$T" &amp;&amp; grep -Fc 'negative control' "$T" &amp;&amp; grep -Fc 'split_from:' "$T" &amp;&amp; grep -Fc 'debug_session:' "$T" &amp;&amp; grep -Fxc 'severity: major' "$T" &amp;&amp; grep -Fxc 'platform: any' "$T" &amp;&amp; grep -Fxc 'ready: live-gate' "$T" &amp;&amp; test -z "$(git diff --name-only -- src/backend/storeManagers/steam/)" &amp;&amp; echo TASK1_OK</automated>
  </verify>
  <done>
The todo's item 3 is struck and answered with the DLC arithmetic; the 718850 bullet's
"not established" clause is corrected in place; "Suspected mechanism" carries a
RETIRED annotation citing 18/23; a new 2026-09-09 section states the ENOTEMPTY /
structural mutual exclusion with file:line citations, demands two runs plus a
mandatory negative control, and names the contract file. Provenance frontmatter and
all prior text are intact. `todo-frontmatter-gate.py` passes. Zero diff under
`src/backend/storeManagers/steam/`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Author the live-gate contract (specify only — do NOT execute it)</name>
  <files>.planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md</files>
  <action>
Write the contract the orchestrator will drive. **This task specifies the gate; it
does not run it.** Do not launch GameLib, do not move any ACF, do not plant any
directory, do not write anything under `~/Library/Application Support/Steam`.

**Target title (already pre-flighted this session — record as given, and re-assert as
a run-time precondition):** appId **112100**, Avadon: The Black Fortress,
`installdir` `Avadon The Black Fortress`, one depot **112102**, `SizeOnDisk`
121,853,904 B, 1209 files / 7 directories fully present on disk. Its ACF's field set
is exactly `buildAppManifestText`'s 15 keys (`MountedDepots`, not `MountedConfig`;
no `StagingSize`/`LastPlayed`/`DownloadType`/`InstallScripts`) — so it is
GameLib-written and provably took the native path.

Routing pre-flight, MEASURED at desk 2026-09-09 in
`~/Library/Application Support/gamelib/store_cache/steam_metadata.json` entry
`112100`: `platformsCaptured=true`, `is_mac_native=true`, `is_windows_native=true`,
`mac_arch='64'`, `forcedWindowsViaBottle` absent. Against `games.ts:1890-1907` that
makes `isBottleEligibleFromPlatforms()` **false** on both branches and
`isForcedWindowsViaBottle()` false, so `routeThroughBottle` is false → **native
path**. The contract must still re-assert this at run time by requiring the install
log to name the native install root
(`~/Library/Application Support/Steam/steamapps/common/Avadon The Black Fortress`)
and NOT a `GameLibSteam*` bottle root — the store is mutable and a stale read is not
a measurement.

**Explicitly NOT appId 38410.** It is a Windows title; `routeThroughBottle` sends it
to `installBottleNative`, which is precisely why the 2026-09-08 re-drive landed in
the CrossOver bottle instead of the native tree and learned nothing about this
defect. Say so in the contract so nobody substitutes it.

The contract must contain, in this order:

**§1 Preconditions (each a checkable command, each with its expected output)**
- The real Steam client is NOT running, and MUST stay quit for the whole gate. A
  running Steam rewrites `libraryfolders.vdf` and eats the setup, and never rescans
  an ACF mid-session anyway. Check by process name; a stale `ipcserver` is not the
  client, note that so it is not mistaken for a failure.
- The running dev build's `build/main/sidecar.js` contains `verifyStructuralIntegrity`
  and the `post-download structural` fragment (build identity — a gate against a
  stale sidecar measures nothing).
- `enableSteamNativeInstall` is true; Steam auth present.
- The 112100 install tree is intact: 1209 files, 121,853,904 B claimed.
- Free disk space exceeds ~1 GB.

**§2 Backup ledger (a table, filled in during the run)**
`cp` + `shasum -a 256` for: `appmanifest_112100.acf`, `libraryfolders.vdf`, and any
file the gate mutates inside the install tree (at minimum the Gate B truncation
target and the Gate A plant target's parent). Record source path, backup path, and
the sha256 of each. **Never `git checkout`** — hard constraint 4, the post-checkout
hook fires and attempts a helper-binary download.

**§3 Log capture discipline**
Sidecar `logWarning`/`logInfo` lands in `~/Library/Logs/GameLib/gamelib.log`, NOT the
`tauri:dev` terminal — and `log_writer.ts` does `renameSync(log, log + '.old')` on
first write per process, one `.old` slot only, so a THIRD app launch destroys the
FIRST launch's evidence. The contract must therefore require: archive
`gamelib-<run-id>.log` to a unique name in this quick directory **before every
relaunch**, and capture the `[shell]` terminal sink separately if the app is
restarted from a terminal. State per required line which sink it writes to.

**§4 Gate A — the ENOTEMPTY / repair half**
1. Move `appmanifest_112100.acf` aside (backed up per §2) so GameLib reads the title
   as not-installed; refresh the library or relaunch (archiving the log first per §3).
2. Plant a **NON-EMPTY** directory at one planned FILE path inside the install root —
   recommend `Avadon.app/Contents/Resources/AvScenData.dat` (6,026,632 B, the largest
   entry, so it is certainly a planned file): back up the real file, delete it, mkdir
   at that exact path, and drop a sentinel file inside so `rmdir` cannot succeed.
3. Install through the app UI.
4. **Expected:** the ENOTEMPTY refusal fires naming `AvScenData.dat`; the install
   FAILS; the resulting ACF reads `StateFlags` **1026**.
5. **Expected NOT to appear:** the `removed a stale empty directory` line — that is
   the empty-directory repair branch and its presence would mean the plant was empty
   and the gate measured the wrong branch.
6. **Explicitly expected NOT to appear:** the `post-download structural` line.
   `failures.length > 0` → `runLooksComplete === false` → the structural check is
   skipped. Its absence here is a PASS condition, not a failure — record it as such,
   because it is the direct live confirmation of Finding 3.
7. Restore the planted path from backup by hash.

**§5 Gate B — the structural half**
The run must otherwise look complete (`failures.length === 0`) while carrying
post-write damage, so `runLooksComplete` stays true and `verifyStructuralIntegrity`
is actually reached. Design:
1. ACF still aside. Delete ONE file so the reconciler schedules exactly one download
   job — recommend `AvScenData.dat` (6,026,632 B): large enough to hold the download
   phase open for a usable window, small enough to be cheap.
2. Arm a background watcher BEFORE starting the install: poll (~50-100 ms) for
   `AvScenData.dat` to reappear (the writer does `open(dest, 'w')` directly at the
   final path — no temp-and-rename, so its appearance marks the download job
   starting), then immediately truncate a DIFFERENT, already-present file that the
   reconciler will have SKIPPED — recommend `Avadon.app/Contents/MacOS/Avadon`
   (4,273,440 B) — via `: > <path>`. The watcher must log its own trigger time and
   the truncation result, and must be capable of reporting "never fired".
3. Why this is the only shape that works: `verifyStructuralIntegrity` checks EVERY
   planned entry, not only this run's jobs, while the reconciler already decided to
   skip the truncated file. Damage applied before reconcile would simply be
   re-downloaded and repaired.
4. Install.
5. **Expected:** the `post-download structural` warning naming
   `Contents/MacOS/Avadon` with `expected=4273440 found=0`; the ACF reads **1026**.
6. **Failure-to-arm is an explicit outcome:** if the watcher never fires, or fires
   after the structural check, the run is **BLOCKED — window missed**, retryable.
   It is NOT a fail of the gate and NOT a pass.
7. Restore the truncated file and `AvScenData.dat` from backup by hash.

**§6 Negative control — MANDATORY, run LAST**
An undamaged resume of 112100, ACF still aside, install tree fully restored from
backups (verify by sha256 first). **Expected: `StateFlags=4`.** Without this a 1026
proves nothing — the live null hypothesis is that this title never earns a 4 at all,
in which case Gates A and B measured a pre-existing condition. If the negative
control fails, Gates A and B are **UNARBITRABLE**, not passed. Say that in the
contract.

**§7 Traps, each as an explicit numbered step, not prose**
- Steam stays quit for the WHOLE gate.
- **Re-verify `libraryfolders.vdf` by sha256 AFTER each run, not only before.** Steam
  rewrites it and has eaten fixtures before.
- Read `StateFlags` from the ACF on disk after each run, and record the ACF's mtime
  against it, so a stale read is detectable.
- `steam-flags-census stage=download-complete` is PLAN-derived — its counts prove
  nothing about what was actually downloaded. Do not use it as evidence of transfer.
- Grep log evidence with SHORT fragments only. The required strings are WRAPPED
  across source lines; grepping a full sentence returns zero against a correctly
  firing gate.
- Restore EVERY backup by hash at the end; the ledger's final column is the
  post-restore sha256, which must equal the pre-run sha256.

**§8 Verdict table** — one row per gate (A, B, negative control), columns:
expected / observed / verdict (PASS | FAIL | BLOCKED) / evidence path. Left empty by
this task; the orchestrator fills it.

**§9 Honesty clause** — state verbatim that if a gate cannot be driven, the honest
outcome is **BLOCKED with the reason**, never a fabricated pass, and that a
`not attempted` row is a legitimate result while an invented one is not.

**§10 Out of scope** — restate hard constraints 1 and 2: no source change under
`src/backend/storeManagers/steam/`, and native 38410 and native 718850 are NOT
repaired, deleted, verified or mutated by this gate. Only 112100's own paths are
touched, each backed up and restored.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; G=.planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md &amp;&amp; test "$(grep -vc '^$' "$G")" -ge 120 &amp;&amp; grep -Fc 'Gate A' "$G" &amp;&amp; grep -Fc 'Gate B' "$G" &amp;&amp; grep -Fic 'negative control' "$G" &amp;&amp; grep -Fc '112100' "$G" &amp;&amp; grep -Fc '112102' "$G" &amp;&amp; grep -Fc 'NOT appId 38410' "$G" &amp;&amp; grep -Fc 'ENOTEMPTY' "$G" &amp;&amp; grep -Fc '1026' "$G" &amp;&amp; grep -Fc 'StateFlags=4' "$G" &amp;&amp; grep -Fc 'runLooksComplete' "$G" &amp;&amp; grep -Fc 'libraryfolders.vdf' "$G" &amp;&amp; grep -Fc 'shasum -a 256' "$G" &amp;&amp; grep -Fc 'BLOCKED' "$G" &amp;&amp; grep -Fc 'gamelib.log' "$G" &amp;&amp; grep -Fc 'AvScenData.dat' "$G" &amp;&amp; grep -Fc 'Contents/MacOS/Avadon' "$G" &amp;&amp; grep -Fc 'UNARBITRABLE' "$G" &amp;&amp; grep -Fic 'fabricat' "$G" &amp;&amp; test -z "$(git diff --name-only -- src/backend/storeManagers/steam/)" &amp;&amp; test "$(find "$HOME/Library/Application Support/Steam/steamapps" -maxdepth 1 -name 'appmanifest_112100.acf' | wc -l | tr -d ' ')" = "1" &amp;&amp; echo TASK2_OK</automated>
  </verify>
  <done>
`260909-nzb-LIVE-GATE.md` exists with §1-§10; Gate A specifies the non-empty plant at
`AvScenData.dat` and lists the ABSENCE of the `post-download structural` line as a
PASS condition; Gate B specifies mid-run truncation of `Contents/MacOS/Avadon` via an
armed watcher with an explicit "never fired ⇒ BLOCKED" outcome; the negative control
is mandatory and last, with an UNARBITRABLE clause; the backup ledger uses
`cp` + `shasum -a 256` and forbids `git checkout`; the honesty clause is present.
Nothing was executed — `appmanifest_112100.acf` is still in place and no source file
under `src/backend/storeManagers/steam/` changed.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Drive the gate (orchestrator), then record the outcome</name>
  <what-built>
Tasks 1 and 2 corrected the todo and produced
`.planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md`, an
executable contract for two live gates plus a mandatory negative control against
appId 112100 on the native Steam path.

**Nothing has been driven.** The verdict table in §8 is empty by design.
  </what-built>
  <how-to-verify>
1. Open `260909-nzb-LIVE-GATE.md` and work §1 → §7 in order. §6 (the negative
   control) runs LAST and is not optional.
2. Fill §2's backup ledger as you go, and §8's verdict table as each run concludes.
3. Archive `gamelib.log` to a unique name in this quick directory before every app
   relaunch — the writer keeps ONE `.old` slot, so a third launch destroys the first
   launch's evidence.
4. Re-verify `libraryfolders.vdf` by sha256 after each run, not only before.
5. Restore every backup by hash at the end and record the post-restore sha256.

**Report back, per gate:** verdict (PASS | FAIL | BLOCKED), the observed
`StateFlags`, the log fragments that fired (and, for Gate A, confirmation that the
`post-download structural` line did NOT fire), and the evidence file path.

**If a gate cannot be driven, say BLOCKED and why.** A `not attempted` row is a
legitimate result. An invented one is not — do not answer this checkpoint from the
contract's Expected column. The Expected column is a prediction, never evidence.
  </how-to-verify>
  <resume-signal>
Paste the filled §8 verdict table, or type "BLOCKED: &lt;reason&gt;".
  </resume-signal>
  <action>
AFTER the orchestrator returns real results — not before, and never from the
contract's Expected column:

1. Write the verdicts into `260909-nzb-LIVE-GATE.md` §8, each row citing its
   evidence file in this quick directory.
2. Append a `# 2026-09-09 — LIVE GATE RESULT` section to the todo recording, per
   gate: verdict, observed `StateFlags`, and the log fragment that fired. If Gate A
   passed, state that it live-confirms Finding 3's mutual exclusion (the structural
   line did not fire on a failed run). If Gate B passed, state that
   `verifyStructuralIntegrity` is now live-proven and the todo's title claim
   ("unproven live") is discharged for the structural half. If the negative control
   failed, mark Gates A and B UNARBITRABLE and say the phrase.
3. Update the todo's `ready:` only if the evidence earns it: `code` once every gate
   has a non-BLOCKED verdict, otherwise it stays `live-gate`. `status: OPEN` and
   `severity: major` stay put regardless — the two damaged installs are still
   unrepaired and that alone keeps this todo open.
4. Write `260909-nzb-SUMMARY.md`: what was corrected in the todo (Findings 1-3), what
   the gate measured, the verdict per gate, and what remains open — explicitly naming
   native 38410 and native 718850 as still damaged, still unrepaired, and awaiting
   the user's decision.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; S=.planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-SUMMARY.md &amp;&amp; G=.planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-LIVE-GATE.md &amp;&amp; T=.planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md &amp;&amp; python3 .planning/todos/todo-frontmatter-gate.py &amp;&amp; test -f "$S" &amp;&amp; grep -Fc 'LIVE GATE RESULT' "$T" &amp;&amp; grep -Ec 'PASS|FAIL|BLOCKED' "$G" &amp;&amp; grep -Fc '718850' "$S" &amp;&amp; grep -Fc '38410' "$S" &amp;&amp; grep -Fic 'unrepaired' "$S" &amp;&amp; test -z "$(git diff --name-only -- src/backend/storeManagers/steam/)" &amp;&amp; test "$(find "$HOME/Library/Application Support/Steam/steamapps" -maxdepth 1 -name 'appmanifest_112100.acf' | wc -l | tr -d ' ')" = "1" &amp;&amp; echo TASK3_OK</automated>
  </verify>
  <done>
§8's verdict table carries a real verdict per gate with an evidence path; the todo
carries a dated LIVE GATE RESULT section written from observed output, not from the
Expected column; `260909-nzb-SUMMARY.md` exists and names native 38410 and native
718850 as still damaged and unrepaired; `appmanifest_112100.acf` is restored in
place; zero diff under `src/backend/storeManagers/steam/`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| gate script → `~/Library/Application Support/Steam` | The gate writes into live user game data outside the repo. Every write is irreversible without its backup. |
| Steam client ↔ `libraryfolders.vdf` / ACF files | A second writer the gate does not control; can silently rewrite the fixture mid-run. |
| planner/executor → this contract's Expected column | The predicted outcome sits in the same file as the recorded one; nothing structurally prevents the prediction being copied into the record. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nzb-01 | Tampering | live 112100 install tree + ACF | mitigate | Every mutated path gets `cp` + `shasum -a 256` before the run and a hash-checked restore after; §2 ledger's final column is the post-restore sha256 and must equal the pre-run one. |
| T-nzb-02 | Tampering | `libraryfolders.vdf` (Steam as a rival writer) | mitigate | Steam stays quit for the whole gate; §7 requires a sha256 re-verify AFTER each run, not only before. |
| T-nzb-03 | Denial of Service | native 38410 / native 718850 | mitigate | Hard constraint 2: no repair, delete, verify or mutation. Task verifies assert zero writes outside 112100's own paths. |
| T-nzb-04 | Repudiation | gamelib.log one-slot rotation | mitigate | §3 requires archiving the log to a unique name before every relaunch; a third launch would otherwise destroy the first launch's evidence. |
| T-nzb-05 | Spoofing | a fabricated PASS copied from the Expected column | mitigate | §9 honesty clause + `autonomous: false` blocking checkpoint; Task 3's action forbids writing results before the orchestrator returns them and names the Expected column as a non-source. |
| T-nzb-06 | Tampering | shipped depot/reconcile source | mitigate | Hard constraint 1; every task's `<automated>` verify asserts `git diff --name-only -- src/backend/storeManagers/steam/` is empty. |
| T-nzb-07 | Elevation of Privilege | `git checkout --` firing the post-checkout hook | mitigate | Hard constraint 4: restore by `cp` from a hashed backup only; the contract says so explicitly. |
| T-nzb-SC | Tampering | npm/pip/cargo installs | accept | This plan installs no packages. No package-manager step exists in any task. |
</threat_model>

<verification>
- `python3 .planning/todos/todo-frontmatter-gate.py` passes after Tasks 1 and 3.
- `git diff --name-only -- src/backend/storeManagers/steam/` is empty after every task.
- `appmanifest_112100.acf` is present at `~/Library/Application Support/Steam/steamapps/`
  at the end of every task (absent ⇒ a run was left half-torn-down).
- Every backup in §2's ledger has a matching post-restore sha256 equal to its pre-run
  sha256.
- The todo's `split_from` and `debug_session` frontmatter keys are byte-identical to
  their pre-plan values.
</verification>

<success_criteria>
- The todo's item 3 is ANSWERED with the DLC arithmetic and the DLC-union hypothesis
  is recorded as REFUTED.
- The todo's "Suspected mechanism" section is RETIRED with the 18/23 measurement.
- The todo states that ENOTEMPTY and structural verification are mutually exclusive,
  cites `depot.ts:1074` / `:2700` / `:2703`, and demands two runs plus a mandatory
  negative control.
- `260909-nzb-LIVE-GATE.md` is drivable without further interpretation: named title,
  named paths, named log fragments, named backup/restore steps, named BLOCKED
  outcomes.
- A verdict per gate is recorded from observed output. A BLOCKED verdict with a
  reason is a success; a fabricated PASS is a failure of this plan.
- Native 38410 and native 718850 are untouched and recorded as still unrepaired.
</success_criteria>

<output>
Create `.planning/quick/260909-nzb-acf-stateflags4-live-gate/260909-nzb-SUMMARY.md` when done.
</output>
