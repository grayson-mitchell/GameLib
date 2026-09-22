---
phase: quick-260922-txw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md   # moved to completed/ ONLY per the Task 4 decision rule
  - .planning/todos/completed/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md # destination, ONLY per the decision rule
  - .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md                 # append-only residual carry, ONLY if the tar todo closes
  - .planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md                 # append-only evidence, ONLY if Layer B produced symlink evidence
  - .planning/todos/pending/2026-09-22-tardriveletter-safety-fixture-builder-dies-under-git-bash-gnu-tar.md       # NEW, ONLY if Task 3 measures that failure
autonomous: true
requirements: [QUICK-260922-TXW]
must_haves:
  truths:
    - "Layer A (isolated, offline): under Git Bash with GNU tar resolved, the PRE-fix listTarEntries (fd7d085fb) fails on a C:\\ fixture archive with 'Cannot connect to C: resolve failed', recorded verbatim"
    - "Layer A: under the same Git Bash, the POST-fix listTarEntries lists the fixture AND the POST-fix extractTarGz extracts it into a SEPARATE absolute destDir AND into a relative destDir resolved against the caller cwd (files present, content matches, nothing beside the archive)"
    - "Layer A: the POST-fix harness also passes under PowerShell with bsdtar resolved; which tar each shell resolved (where tar / Get-Command, tar --version) is recorded"
    - "Layer B: the real `pnpm download-helper-binaries` on HEAD was forced to download+verify+extract the darwin onedir archives from Git Bash, and its outcome is classified as exactly one of T-OK / T-TAR / T-SYMLINK / T-NET / T-DIGEST / T-OTHER"
    - "public/bin is restored byte-for-byte: .release_tags sha256, the full path listing, the dir /AL link listing and `git status --porcelain` all match their pre-run snapshots"
    - "The tar todo is closed IF AND ONLY IF the Task 4 decision rule holds; the tag-push step 5, the CI windows-latest PATH question and signing are recorded as NOT DONE / NOT MEASURED either way"
    - "No meta/_txw_* file exists and none was ever staged; .planning/phases/46-*/.gitkeep was never staged; STATE.md untouched"
  artifacts:
    - path: ".planning/quick/260922-txw-verify-windows-tar-drive-letter-fix-on-t/260922-txw-SUMMARY.md"
      provides: "Verdict table for Layer A (both shells), Layer B classification, jest counts, gate results, closure decision"
  key_links:
    - from: "Layer A negative control (pre-fix copy)"
      to: "Layer A positive (real meta/downloadHelperBinaries.ts)"
      via: "same fixture archive, same shell, same resolved tar; `git diff fd7d085fb fb9f0d458` and `git log fb9f0d458..HEAD -- meta/downloadHelperBinaries.ts` show the tar call sites are the only variable"
    - from: "Layer B"
      to: ":138 extraction"
      via: "public/bin/arm64/darwin/{legendary,gogdl,nile}/{name} exist in the run tree AND .release_tags was rewritten to the real marker (storeDownloadedTags only runs after every download promise resolved)"
---

<objective>
Verify on this Windows 11 box that the tar drive-letter fix (`fb9f0d458`, quick 260922-p57) in
`meta/downloadHelperBinaries.ts` actually fixes a failure that reproduces here — negative control first,
then positive — and close the todo
`.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md`
only if the evidence supports it.

Two layers of evidence, kept strictly separate in every record you write:

- **Layer A — load-bearing.** Isolated, offline, deterministic mechanism repro: a small symlink-free
  fixture `.tar.gz` under `os.tmpdir()` (an absolute `C:\...` path), driven through the PRE-fix and
  POST-fix `listTarEntries` / `extractTarGz`. This is the negative control AND the positive proof.
- **Layer B — corroborating.** The real `pnpm download-helper-binaries` on HEAD, forced to re-download,
  sha256-verify and extract the three darwin onedir archives from Git Bash, with guaranteed restore of
  `public/bin`. Its result is recorded whatever it is; it is not the closure criterion.

This is a VERIFICATION task. No product code, no test code and no package.json changes. If the fix is found
broken (Layer A post-fix fails in Git Bash, or Layer B is T-TAR), STOP and report — do not patch.
Output: todo markdown edits (committed) and a SUMMARY.md (written, not committed — see Task 4).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md (todo triage frontmatter vocabulary; two-profile rule)
@.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md (esp. "THE TRAP", "Ledger", "Verification", "Local Windows measurements")
@.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md
@meta/downloadHelperBinaries.ts
@meta/__tests__/tarDriveLetterSafety.test.ts
@meta/runTs.cjs (header comment only: argv contract)
Precedent (negative-control-then-positive, closure shape): .planning/quick/260922-toc-verify-runts-win32-esbuild-fix-on-window/260922-toc-PLAN.md and -SUMMARY.md;
closed-todo exemplar: .planning/todos/completed/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md
(frontmatter adds `status: completed`, `resolved: 2026-09-22`, `resolved_by: quick-...`; body gains a dated `## Resolution` section with Host, Decision rule applied, Commands, Verdict table).

<interfaces>
POST-fix (HEAD, identical to fb9f0d458 — `git log fb9f0d458..HEAD -- meta/downloadHelperBinaries.ts` is empty at planning time):
- `export function listTarEntries(archivePath: string): Promise<string[]>` — spawn('tar', ['-tzf', basename(archivePath)], { cwd: dirname(archivePath) }); rejects `tar -tzf failed (exit N): <stderr>`.
- `export function extractTarGz(archivePath: string, destDir: string): Promise<void>` — resolve(destDir) in the parent, then spawn('tar', ['-xzf', basename(archivePath), '-C', absoluteDestDir], { cwd: dirname(archivePath) }); rejects `tar extraction failed (exit N): <stderr>`.
- Module bottom: `if (!process.env.JEST_WORKER_ID) { main() ... }` — importing it WITHOUT that env var starts main(). main() is harmless-ish today (tags match -> "Nothing to download") but the harness must not depend on that: always set JEST_WORKER_ID=txw for harness runs.

PRE-fix (`git show fd7d085fb:meta/downloadHelperBinaries.ts`):
- `function listTarEntries(archivePath)` (line 87, NOT exported) — spawn('tar', ['-tzf', archivePath]) with no cwd.
- `function extractTarGz(archivePath, destDir)` (line 136, NOT exported) — spawn('tar', ['-xzf', archivePath, '-C', destDir]) with no cwd.
- Same JEST_WORKER_ID guard at line 537. Imports ./releaseTags, ./buildRunnersOnedir, ./runnersOnedirDigests.json — so the copy MUST live in meta/ to resolve them. buildRunnersOnedir's own main() is guarded by JEST_WORKER_ID AND a `--arch=` argv, so it never runs here.

Gating (decides whether darwin archives are fetched at all): `compareDownloadedTags()` reads `public/bin/.release_tags`; if `__darwin_layout !== darwinLayoutMarker()` it adds legendary/gogdl/nile. `storeDownloadedTags()` rewrites .release_tags ONLY after every download promise resolved — so a rewritten real marker is the end-to-end success signal. main() returns early with "public/bin not found" if public/bin does not exist.
</interfaces>

<planner_findings>
Measured while planning (reads only). Rely on these; do not rediscover.

1. **PREDICTED RED, not a fix failure: `meta/__tests__/tarDriveLetterSafety.test.ts` will very likely fail in Git Bash in `beforeAll`.** Its fixture builder `buildFixtureArchive` spawns `tar -czf <outPath> -C <fromDir> <entry>` where `outPath = join(archiveDir, 'fixture_macOS_arm64_onedir.tar.gz')` is an ABSOLUTE `C:\...` path with NO cwd — the exact pre-fix shape. Under GNU tar that dies with "Cannot connect to C: resolve failed" before either subject function runs; all 5 tests then fail. That is a defect in the TEST HARNESS, not in the fix, and must be classified that way (Task 3). CI's jest job (`.github/workflows/test.yml`) is `ubuntu-latest` only, so it has no CI consequence. Under PowerShell (bsdtar) it should be 5/5 green.
2. **Developer Mode fact conflict.** The orchestrator's brief says "no SeCreateSymbolicLinkPrivilege and no Developer Mode (quick 260922-nx4)". But `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` says "The operator enabled Developer Mode on 2026-09-22". Measure it (Task 1 Step 0) and record; do not assume either.
3. **The existing `public/bin/arm64/darwin` tree is precious local state.** Per the symlink todo, its 6 `Python.framework` links (2 per runner) were HAND-REPAIRED today with `mklink /D`. It must be moved aside by RENAME (never copied — a copy can silently re-type or deep-copy links) and renamed back. Rename is same-volume (repo and scratchpad are both on C:).
4. **The symlink failure class is ALREADY FILED.** `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` Layer 0/1 covers "EPERM without privilege" and "tar extracts directory links as FILE links". So a Layer B symlink outcome is APPENDED to that todo as dated evidence, NOT filed as a new todo — deviation from the orchestrator brief, made to avoid a duplicate. File a new todo only if the symlink failure is demonstrably a different mechanism from Layers 0-3.
5. `pnpm planning-gates` = `python3 meta/runPlanningGates.py`; on this box `python3` may be the WindowsApps Store stub. If the interpreter itself will not start, run `python meta/runPlanningGates.py` and record both. Known pre-existing unrelated failure: planning-envelope-tag-gate on `260922-p57-PLAN.md` — record, do not fix.
6. Two-profile rule (CLAUDE.md): does NOT apply. These are `meta/` build scripts, not sidecar/SEA binary runs; `tar` and the download script read no HOME/APPDATA/XDG profile and create no session. No fake HOME. State this in the Resolution section.
7. An untracked `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/.gitkeep` exists and is NOT ours. Never `git add -A` / `git add .`.
8. Let SP denote the session scratchpad: Windows `C:\Users\grays\AppData\Local\Temp\claude\C--Users-grays-Projects-GameLib\b3f56074-ea7e-4da2-9fae-a2103b83a994\scratchpad`, Git Bash `/c/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/b3f56074-ea7e-4da2-9fae-a2103b83a994/scratchpad`. Every capture goes there, prefixed `txw-`, never into the repo.
</planner_findings>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Layer A — isolated mechanism repro (pre-fix negative control, post-fix positive) in Git Bash, then PowerShell no-regression</name>
  <files>meta/_txw_harness.ts and meta/_txw_prefix_downloadHelperBinaries.ts (TEMPORARY — created and deleted inside this task, never staged); captures in SP</files>
  <action>
Step 0 — baseline (Git Bash, repo root). Save to SP: `git status --porcelain` (txw-status-before.txt); `git rev-parse HEAD`; `git diff --stat fd7d085fb fb9f0d458 -- meta/downloadHelperBinaries.ts` and `git log --oneline fb9f0d458..HEAD -- meta/downloadHelperBinaries.ts` (the latter MUST be empty — if not, record which commits and confirm neither touches the two tar call sites before going on); `node --version`; `where tar`; `tar --version | head -1`; `echo "$TEMP"`; Developer Mode via `reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense` (use `MSYS_NO_PATHCONV=1` so Git Bash does not rewrite the key) and `whoami //priv | grep -i SymbolicLink` (planner finding 2).

Step 1 — create the two temporary files in meta/ (they must live in meta/ so the pre-fix copy's relative imports resolve). The pre-fix copy: `git show fd7d085fb:meta/downloadHelperBinaries.ts > meta/_txw_prefix_downloadHelperBinaries.ts`, then APPEND one line re-exporting its two private functions under new names, preListTarEntries and preExtractTarGz (an `export { listTarEntries as preListTarEntries, extractTarGz as preExtractTarGz }` statement). Change nothing else in the copy.

The harness `meta/_txw_harness.ts` (write it with the Write tool; plain TypeScript, Node built-ins only) must:
(a) abort with exit 9 and message "JEST_WORKER_ID not set" if process.env.JEST_WORKER_ID is unset (imports would have started main()); import preListTarEntries/preExtractTarGz from './_txw_prefix_downloadHelperBinaries' and listTarEntries/extractTarGz from './downloadHelperBinaries';
(b) print the resolved tar as node sees it: stdout of spawnSync('where', ['tar']) and the first line of spawnSync('tar', ['--version']); set a flavor label GNU if that line contains "GNU tar", BSD if it contains "bsdtar", else UNKNOWN;
(c) create five separate mkdtemp roots under os.tmpdir() (stage, archive, extractPre, extractPost, relCwd) and assert the archive path matches a drive-letter prefix (regex on `^[A-Za-z]:[\\/]`) — if not, exit 4 "negative control meaningless: archive path has no drive letter";
(d) build the fixture WITHOUT the defect: write stage/fixture-runner/payload.txt with a known string, then spawn tar with argv `-czf fixture_macOS_arm64_onedir.tar.gz -C <absolute stage> fixture-runner` and `cwd` = archive dir (relative -f, absolute -C). No symlinks in the fixture;
(e) PRE list: call preListTarEntries(absolute archive path); record resolve/reject and the full error message; PRE extract: call preExtractTarGz(archivePath, extractPre); record outcome, and whether extractPre/fixture-runner/payload.txt exists afterwards;
(f) POST list: listTarEntries(archivePath) must contain "fixture-runner/" and "fixture-runner/payload.txt"; POST extract absolute: extractTarGz(archivePath, extractPost) — payload exists under extractPost with the exact content AND archiveDir/fixture-runner does NOT exist (the :138 relocation check); POST extract relative: process.chdir(relCwd), mkdir nested/dest, extractTarGz(archivePath, join('nested','dest')), assert relCwd/nested/dest/fixture-runner/payload.txt exists and archiveDir/nested does not, then chdir back to the original cwd;
(g) print one machine-greppable line starting `TXW-RESULT` with fields tar=<flavor>, pre_list=<PASS|FAIL:first-stderr-line>, pre_extract=<same>, post_list, post_extract_abs, post_extract_rel (each PASS or FAIL:reason), and remove all five temp roots in a finally block;
(h) exit code: 0 only if all three post_* are PASS AND (flavor is not GNU OR both pre_* FAILED with a message matching `Cannot connect to [A-Za-z]: resolve failed`); exit 3 with "NEGATIVE CONTROL NOT REPRODUCED" if flavor is GNU and pre_list PASSED; exit 5 if any post_* failed.

Step 2 — Git Bash run (the CI-equivalent shell): `JEST_WORKER_ID=txw node meta/runTs.cjs --bundle --platform=node --target=node21 meta/_txw_harness.ts 2>&1 | tee "$SP/txw-A-gitbash.log"`, capture `${PIPESTATUS[0]}`. Required: tar=GNU, pre_list FAIL with the resolve-failed string (quote the full stderr verbatim in the log), post_* all PASS, exit 0. If exit 3 or tar is not GNU: STOP — the bug is not reproduced, the fix is unfalsifiable here; skip to Task 4 in "do not close" mode. If exit 5: STOP — the fix is broken; do not patch; report.

Step 3 — PowerShell run. Use the PowerShell tool directly (NOT powershell.exe launched from Git Bash, which inherits Git Bash's PATH with usr/bin first). Record `Get-Command tar -All | Select-Object Source` and `tar --version` first line. If the first-resolved tar is not `C:\Windows\System32\tar.exe`, prepend `C:\Windows\System32` to `$env:PATH` for this session only and record that you had to. Then set `$env:JEST_WORKER_ID='txw'`, run `node meta/runTs.cjs --bundle --platform=node --target=node21 meta/_txw_harness.ts` capturing output to SP\txw-A-powershell.log, then remove the env var. Required: tar=BSD, post_* all PASS, exit 0. Record the pre_* outcome as observed (bsdtar is expected to PASS pre-fix too — that is the PATH-dependence finding, not a failure).

Step 4 — delete both temp files (`rm -f meta/_txw_harness.ts meta/_txw_prefix_downloadHelperBinaries.ts`), then confirm `git status --porcelain` equals txw-status-before.txt and `ls meta/_txw_* 2>/dev/null` prints nothing. Do this even if a step above stopped early.
  </action>
  <verify>
    <automated>grep -h '^TXW-RESULT' "/c/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/b3f56074-ea7e-4da2-9fae-a2103b83a994/scratchpad/txw-A-gitbash.log" "/c/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/b3f56074-ea7e-4da2-9fae-a2103b83a994/scratchpad/txw-A-powershell.log" && test -z "$(ls /c/Users/grays/Projects/GameLib/meta/_txw_* 2>/dev/null)" && echo TEMP-CLEAN</automated>
  </verify>
  <done>Both TXW-RESULT lines exist; Git Bash line shows tar=GNU, pre_list FAIL with "Cannot connect to C: resolve failed", post_list/post_extract_abs/post_extract_rel PASS; PowerShell line shows tar=BSD with all post_* PASS; temp files gone and git status unchanged from baseline.</done>
</task>

<task type="auto">
  <name>Task 2: Layer B — forced real `pnpm download-helper-binaries` on HEAD from Git Bash, with guaranteed byte-for-byte restore of public/bin</name>
  <files>public/bin/** (gitignored runtime state; moved aside and restored, net change zero); captures in SP</files>
  <action>
Runs whatever Task 1's verdict was, unless Task 1 found the fix broken (exit 5) — then skip Layer B and record "not run: fix already falsified in Layer A".

Step 0 — preconditions (Git Bash). Confirm no GameLib/tauri dev process holds files under public/bin (`tasklist | grep -iE 'gamelib|legendary|gogdl|nile'` empty). Confirm `$SP/txw-bin-orig` does NOT exist (refuse to run if it does — a prior interrupted run's backup would be overwritten). Snapshot into SP: `find public/bin | sort > txw-bin-listing-before.txt`; `sha256sum public/bin/.release_tags > txw-tags-before.sha`; `MSYS_NO_PATHCONV=1 cmd /c "dir /AL /S public\bin\arm64\darwin" > txw-links-before.txt` (captures today's hand-repaired SYMLINKD links, planner finding 3); `git status --porcelain > txw-status-before-B.txt`. Also record the shell view of tar that the child will inherit: `where tar`, `tar --version | head -1`, `pnpm config get script-shell`, and `MSYS_NO_PATHCONV=1 cmd /c where tar` (what a cmd.exe-launched pnpm script resolves under this PATH).

Step 1 — ONE Bash invocation (timeout 600000; a trap only lives for one invocation) that: defines a restore function which, if `$SP/txw-bin-orig` exists, renames any current public/bin to `$SP/txw-bin-run` and then renames `$SP/txw-bin-orig` back to public/bin; installs it with `trap restore EXIT`; renames (mv, never cp) public/bin to `$SP/txw-bin-orig` — abort if that mv fails; `mkdir public/bin`; writes public/bin/.release_tags as the original JSON with ONLY `__darwin_layout` replaced by the string "txw-forced-redownload" (use a node one-liner reading `$SP/txw-bin-orig/.release_tags`; every RELEASE_TAGS value stays identical, so only legendary/gogdl/nile are re-fetched); runs `pnpm download-helper-binaries 2>&1 | tee "$SP/txw-B-e2e.log"` and records `${PIPESTATUS[0]}`; then, BEFORE restore, inspects the run tree: for each of legendary gogdl nile whether public/bin/arm64/darwin/NAME/NAME exists and the file count under public/bin/arm64/darwin/NAME; the content of the rewritten public/bin/.release_tags (real 64-hex marker = storeDownloadedTags ran = every archive listed AND extracted); and link types via `MSYS_NO_PATHCONV=1 cmd /c "dir /AL /S public\bin\arm64\darwin"` saved to `$SP/txw-links-run.txt` (count `<SYMLINK>` vs `<SYMLINKD>` vs `<JUNCTION>` — evidence for the symlink todo's Layer 1 under GNU tar on HEAD). Then call restore explicitly (the trap covers early exit).

Step 2 — classify from txw-B-e2e.log, exactly one class:
T-OK — exit 0, all three NAME/NAME present, .release_tags rewritten to the real marker.
T-TAR — any "tar -tzf failed" or "tar extraction failed" whose stderr contains "Cannot connect to" / "resolve failed" (the drive-letter defect survived — STOP, do not close, report).
T-SYMLINK — "tar extraction failed" whose stderr names a symlink / "Cannot create symlink" / EPERM / Operation not permitted. The absence of any "tar -tzf failed" line in that run is still evidence that :89 listing passed in the real pipeline — record it as such.
T-NET — fetch failure / non-200 / DNS / timeout.
T-DIGEST — "sha256 mismatch" (rolling release re-dispatched; not a tar question).
T-OTHER — anything else, quoted verbatim.
Quote the decisive log lines verbatim. A pre-fix end-to-end run is deliberately NOT done: it would require overwriting a tracked source file in place, and Layer A is the negative control.

Step 3 — verify the restore (separate invocation): `find public/bin | sort` diffs clean against txw-bin-listing-before.txt; `sha256sum -c` against txw-tags-before.sha passes; the dir /AL listing matches txw-links-before.txt ignoring the header/free-space lines; `git status --porcelain` equals txw-status-before-B.txt; `$SP/txw-bin-orig` no longer exists. Only after all pass, `rm -rf "$SP/txw-bin-run"`. If ANY check fails, STOP and report with the exact diff — do not attempt a second run.
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && SP=/c/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/b3f56074-ea7e-4da2-9fae-a2103b83a994/scratchpad && sha256sum -c "$SP/txw-tags-before.sha" && diff <(find public/bin | sort) "$SP/txw-bin-listing-before.txt" && test ! -e "$SP/txw-bin-orig" && echo RESTORED</automated>
  </verify>
  <done>txw-B-e2e.log exists with an exit code and exactly one classification (T-OK / T-TAR / T-SYMLINK / T-NET / T-DIGEST / T-OTHER) backed by quoted lines; run-tree presence, marker rewrite and link-type counts recorded; public/bin restored with identical .release_tags hash, listing, link listing and git status.</done>
</task>

<task type="auto">
  <name>Task 3: Repo jest suites for the fix, in both shells, with the fixture-builder red classified correctly</name>
  <files>captures in SP only</files>
  <action>
Run the two Meta suites in Git Bash: `pnpm exec jest --selectProjects Meta tarDriveLetterSafety downloadHelperBinaries 2>&1 | tee "$SP/txw-jest-gitbash.log"` (bare-name patterns avoid Windows path-separator regex issues). Then the same command in the PowerShell tool (same bsdtar PATH handling as Task 1 Step 3; record `(Get-Command tar).Source`), capturing to SP\txw-jest-powershell.log. Record suites/tests passed/failed per shell.

Classification (planner finding 1): if `tarDriveLetterSafety.test.ts` fails in Git Bash and the failure is in beforeAll with "fixture tar -czf failed" + "Cannot connect to C: resolve failed", that is the TEST'S OWN fixture builder reproducing the original defect (absolute -f operand, no cwd, at its buildFixtureArchive) — it is NOT evidence against the fix (Layer A already drove the real functions under the same GNU tar). Record it as such and mark it for a new todo in Task 4. Any OTHER failure of either suite in either shell (in particular any failure inside listTarEntries/extractTarGz themselves, or any downloadHelperBinaries.test.ts failure) is a real finding: STOP and report, do not patch. Do not modify either test file.
  </action>
  <verify>
    <automated>grep -hE '^Tests:|^Test Suites:' "/c/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/b3f56074-ea7e-4da2-9fae-a2103b83a994/scratchpad/txw-jest-gitbash.log" "/c/Users/grays/AppData/Local/Temp/claude/C--Users-grays-Projects-GameLib/b3f56074-ea7e-4da2-9fae-a2103b83a994/scratchpad/txw-jest-powershell.log"</automated>
  </verify>
  <done>Pass/fail counts recorded for both suites in both shells; every failure classified either as the fixture-builder harness defect (with the verbatim beforeAll error) or as a STOP finding.</done>
</task>

<task type="auto">
  <name>Task 4: Record, decide closure, file/append todos, gates, one atomic docs commit</name>
  <files>.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md (or its completed/ destination), .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md, .planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md, .planning/todos/pending/2026-09-22-tardriveletter-safety-fixture-builder-dies-under-git-bash-gnu-tar.md, .planning/quick/260922-txw-verify-windows-tar-drive-letter-fix-on-t/260922-txw-SUMMARY.md</files>
  <action>
All todo edits are APPEND-ONLY in the body: add dated sections; never rewrite or delete earlier text (earlier claims that are now superseded get a dated note beneath, not an edit). Frontmatter keys may be updated.

DECISION RULE — close the tar todo iff ALL of: (1) Layer A Git Bash negative control reproduced (tar=GNU, pre_list FAILED with "Cannot connect to C: resolve failed"); (2) Layer A Git Bash post_list, post_extract_abs, post_extract_rel all PASS; (3) Layer B is NOT T-TAR. Layer B being T-SYMLINK / T-NET / T-DIGEST / T-OTHER does not block closure (Layer A is the load-bearing proof; record B as-is).

Planner recommendation, adopted as the rule: close WITH A RESIDUAL rather than hold the todo open for the tag push. Reasons, to be written into the Resolution: (a) the defect the todo names — GNU tar remote-parsing a drive-lettered -f operand — is reproduced and shown fixed under GNU tar 1.35, which is the same tar family whose error string CI printed; (b) the remedy is deliberately PATH-agnostic and Layer A proves it under BOTH tars on this box, so which tar wins PATH on windows-latest no longer changes correctness — it stays an unmeasured fact, not an open risk to this fix; (c) the only remaining step, a throwaway tag push (todo Verification step 5), is not desk work — keeping this todo open for it would leave a todo with nothing actionable at ready: code, and the next Windows tag push is already required by the signing todo, which will observe install-deps for free. The residual is therefore CARRIED, not dropped.

If the rule holds: in the tar todo, set `status: completed`, add `resolved: 2026-09-22` and `resolved_by: quick-260922-txw` (keep severity/platform/ready/needs as they are, matching the runTs exemplar), append `## Resolution (2026-09-22, quick 260922-txw)` containing Host (Windows 11 10.0.26200, node version, Git Bash vs PowerShell), Decision rule applied, the Developer Mode / symlink-privilege measurement, Commands, a Verdict table (Layer A Git Bash pre/post rows, Layer A PowerShell rows, Layer B class with quoted lines, jest counts both shells, gates), the two-profile statement (planner finding 6), and an explicit NOT DONE / NOT MEASURED list: tag-push step 5 not done; windows-latest `where tar` not measured; signing never reached; the other three tar sites unchanged and still not executed on Windows. Then `git mv` it to `.planning/todos/completed/`. Append to `2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md` a dated `## Carried residual (2026-09-22, quick 260922-txw)` section: the first Windows tag push must also confirm install-deps passes AND that public/bin/arm64/darwin/{legendary,gogdl,nile}/{name} exist on the runner (the :138 trap), and should record `where tar` on the runner; link back to the completed tar todo.

If the rule does NOT hold: leave the tar todo in pending/, append `## Local Windows verification (2026-09-22, quick 260922-txw)` with the same evidence and which clause failed; keep `ready: code` unless the failure means the next step needs a person (`human`) or is externally blocked (`blocked`) — justify the value per the CLAUDE.md table.

If Layer B was T-SYMLINK or produced link-type evidence (txw-links-run.txt): append a dated `## Evidence from quick 260922-txw` section to `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` with the classification, SYMLINK/SYMLINKD counts from a fresh GNU-tar extraction on HEAD, the Developer Mode measurement, and the note that the Windows install-deps leg could still die on this class on CI (unmeasured). Do NOT file a duplicate (planner finding 4); file a separate new todo only if the mechanism is demonstrably different from Layers 0-3, and say why.

If Task 3 measured the fixture-builder failure: create `.planning/todos/pending/2026-09-22-tardriveletter-safety-fixture-builder-dies-under-git-bash-gnu-tar.md` with frontmatter `created`, `title`, `area: build`, `severity: medium` (real defect, bounded blast radius — local Windows Git Bash only; CI jest is ubuntu-only; workaround: run in PowerShell), `platform: windows`, `ready: code` (in that key order: severity, platform, ready adjacent), `found_by: quick-260922-txw`, `files: [meta/__tests__/tarDriveLetterSafety.test.ts]`. Body: the verbatim beforeAll error; the mechanism (buildFixtureArchive passes an absolute -f with no cwd, the pre-fix shape); the observation that once fixed this suite becomes the repo's first EXECUTED detector that can go red for the drive-letter defect under Git Bash (contradicting its header's "no executed test can go red", which is true only on macOS); direction: build the fixture with cwd + relative -f as the Layer A harness did. Cross-link it from the tar todo's Resolution.

Write `260922-txw-SUMMARY.md` (summary template) with the verdict tables and the closure decision. Do NOT touch STATE.md. Do NOT commit the SUMMARY or this PLAN — the orchestrator's docs commit bundles PLAN + SUMMARY + STATE, per the 260922-toc precedent.

Gates: run `pnpm planning-gates` (fallback `python meta/runPlanningGates.py` if python3 is the Store stub; record both). Expected: only the known pre-existing planning-envelope-tag-gate finding on 260922-p57-PLAN.md — record, do not fix. Any failure naming a file this task touched (e.g. todo-frontmatter-gate) must be fixed in that file before committing. Check the new/edited todos end without any stray trailing closing tag.

Commit: first `ls meta/_txw_* 2>/dev/null` must print nothing. Stage ONLY the explicit todo paths actually changed (for the move, `git mv` already staged both sides), confirm with `git diff --cached --name-status` that nothing else — especially `.planning/phases/46-*/.gitkeep` and anything under public/ or meta/ — is staged, then commit with message `docs(quick-260922-txw): verify tar drive-letter fix on Windows, <close|keep open> tar todo` and a body naming the Layer A and Layer B verdicts, ending with the trailer line `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. No push.
  </action>
  <verify>
    <automated>cd /c/Users/grays/Projects/GameLib && git log -1 --name-status --format='%s' && test -z "$(ls meta/_txw_* 2>/dev/null)" && ! git show --name-only --format= HEAD | grep -qE 'gitkeep|^public/|^meta/|STATE\.md' && (python3 .planning/todos/todo-frontmatter-gate.py || python .planning/todos/todo-frontmatter-gate.py)</automated>
  </verify>
  <done>Tar todo is either in completed/ with a dated Resolution (rule held) or in pending/ with a dated verification section (rule failed), and either way lists tag-push step 5, windows-latest PATH and signing as NOT DONE / NOT MEASURED; conditional appends/new todo exist exactly when their trigger fired; SUMMARY written; planning-gates shows no failure other than the known 260922-p57 envelope finding; one docs commit containing only todo paths, with the Co-Authored-By trailer; nothing pushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub releases -> public/bin (Layer B) | Downloaded archives and upstream single-file binaries cross into the working tree |
| verification scratch -> git index | Temp harness files, captures and the run tree must never reach a commit |
| operator's local public/bin state | Hand-repaired darwin symlink tree (planner finding 3) must survive the forced run |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-txw-01 | Tampering | darwin onedir archives in Layer B | mitigate | Existing sha256 pin against meta/runnersOnedirDigests.json runs before any tar call (T-34.9-01); a mismatch is classified T-DIGEST and nothing is extracted |
| T-txw-02 | Tampering | upstream linux/win32 single-file binaries re-fetched in Layer B | accept | Pre-existing unpinned download path, unchanged by this task; they land only in the run tree, which is moved to SP and deleted after the restore is verified |
| T-txw-03 | Denial of service (local state loss) | public/bin during Layer B | mitigate | Rename-not-copy move-aside, trap restore within the same invocation, refusal if a stale backup exists, and a four-way restore check (hash, listing, dir /AL, git status) before the run tree is deleted |
| T-txw-04 | Information disclosure / repo pollution | meta/_txw_* temp files, SP captures | mitigate | Temp files deleted at end of Task 1 and re-checked before commit; explicit-path staging plus a `git diff --cached --name-status` check; captures never written into the repo |
| T-txw-05 | Tampering | archive entry traversal | accept | Layer A fixture is self-built and symlink-free; Layer B still runs assertArchiveEntriesAreSafe before extraction |
</threat_model>

<verification>
- Layer A Git Bash: TXW-RESULT shows tar=GNU, pre_list FAIL (resolve failed), post_list / post_extract_abs / post_extract_rel PASS.
- Layer A PowerShell: TXW-RESULT shows tar=BSD, all post_* PASS.
- Layer B: exactly one class, with quoted lines; public/bin restored (four-way check).
- Jest: counts recorded for both suites in both shells; any Git Bash red classified.
- `pnpm planning-gates`: only the known 260922-p57 envelope finding.
- `git status --porcelain` at the end differs from the Task 1 baseline only by the committed todo changes, the SUMMARY and this PLAN.
</verification>

<success_criteria>
- The negative control ran and its outcome is recorded verbatim. The todo is closed only if it reproduced and the post-fix passed in the same Git Bash shell.
- :138 extraction is proven by files landing in a separate absolute destDir and in a caller-relative destDir, not just by listing.
- The real pipeline was exercised, or its non-exercise is explained and classified.
- The operator's public/bin, including the hand-repaired links, is exactly as it was.
- The residuals (tag push, CI PATH, signing) are written down in the todos where the next person will find them.
</success_criteria>

<output>
Create `.planning/quick/260922-txw-verify-windows-tar-drive-letter-fix-on-t/260922-txw-SUMMARY.md` when done
</output>
