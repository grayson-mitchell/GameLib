---
phase: quick-260922-toc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md   # moved to completed/ ONLY if confirmed
  - .planning/todos/completed/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md # destination, ONLY if confirmed
  - .planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md
  - .planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md
autonomous: true
requirements: [QUICK-260922-TOC]
must_haves:
  truths:
    - "The pre-fix runTs.cjs (8ed7b8ccd^) was run on this Windows box and its esbuild-spawn outcome (fail with -4058/ENOENT, or not) is recorded verbatim"
    - "The current runTs.cjs was run on the SAME argv and its exit code + the script's own output line are recorded"
    - "pnpm download-helper-binaries was run; its outcome is classified as runTs-phase vs tar/symlink-phase, never conflated"
    - "The runTs todo is in completed/ with a dated Resolution section IF AND ONLY IF the negative control failed AND the positive run passed; otherwise it stays in pending/ with findings appended and ready: retagged"
    - "detectVCRedist todo reads ready: code with a dated retag note; tar todo reads ready: code with a dated section recording the local Git Bash `where tar` / `tar --version` result (explicitly NOT the CI runner)"
    - "No tracked file is left modified by the verification runs; meta/runTs.prefix-260922-toc.cjs does not exist and was never staged"
    - "pnpm planning-gates passes"
  artifacts:
    - path: ".planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md"
      contains: "ready: code"
    - path: ".planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md"
      contains: "ready: code"
  key_links:
    - from: "negative-control run (pre-fix copy)"
      to: "positive run (current meta/runTs.cjs)"
      via: "identical argv; the ONLY variable is the runTs file (git log 8ed7b8ccd^..HEAD -- meta/runTs.cjs lists exactly one commit, 8ed7b8ccd)"
---

<objective>
User request: "start with #1 and retag 1-3".

1. Verify on this Windows 11 box that the `meta/runTs.cjs` win32 esbuild spawn fix (commit `8ed7b8ccd`,
   quick 260906-hq8) actually fixes a failure that reproduces here — negative control first, then positive —
   and close its todo ONLY if both halves confirm.
2. Retag the three Windows todos (runTs, detectVCRedist, tar) to honest `ready:` values and append dated
   evidence sections.

This is a VERIFICATION task. No source file changes. The only committed changes are todo markdown files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md (todo triage frontmatter rules; two-profile rule)
@.planning/todos/pending/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md
@.planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md
@.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md (sections "Hypothesis — NOT established" and "Verification")
@meta/runTs.cjs
Closure-convention exemplar: .planning/todos/completed/2026-09-22-pre-push-hook-cannot-pass-on-a-windows-checkout.md

<evidence_already_measured>
Measured by the orchestrator this session, on this box. Record as EVIDENCE with that attribution; do not
re-label as assumption. Re-running F1 once to capture it into the log is fine and cheap.
- F1: `require.resolve('esbuild/bin/esbuild')` -> `C:\Users\grays\Projects\GameLib\node_modules\esbuild\bin\esbuild`,
  first bytes `"#!/usr/bin/env node\n"`. The JS shebang shim survived install -> the diagnosis precondition holds here.
- `where tar` in Git Bash: `C:\Program Files\Git\usr\bin\tar.exe` (GNU tar 1.35) FIRST, then
  `C:\Windows\System32\tar.exe` (bsdtar 3.8.8). GNU tar wins PATH in local Git Bash.
</evidence_already_measured>

<planner_findings>
Measured while planning (reads only). The executor should rely on these, not rediscover them.
- `git log --oneline 8ed7b8ccd^..HEAD -- meta/runTs.cjs` lists ONLY `8ed7b8ccd`. So `8ed7b8ccd^:meta/runTs.cjs`
  vs the working copy differ by exactly the fix; the negative control isolates the one variable.
- The pre-fix copy MUST live in `meta/`: both versions compute `path.join(__dirname, '..', 'node_modules')` for the
  tmpdir junction, and `require.resolve('esbuild/bin/esbuild')` resolves from the file's own directory. A copy in the
  scratchpad would fail for a DIFFERENT reason (esbuild unresolvable) and prove nothing.
- Pre-fix launch failure path: `runChild` resolves `{error}` -> `console.error('meta/runTs.cjs: failed to launch esbuild:', err)`
  (prints the full error object incl. `errno`, `code`, `syscall`, `path`) -> exit code 1. That printed object IS the F3 capture.
- Positive/negative script choice: `build:decompress-worker-dev`
  (`node meta/runTs.cjs --bundle --platform=node --target=node22 meta/buildDecompressWorkerDev.ts`). Justification:
  (a) it is the exact script the todo names as what `pnpm tauri:dev` runs — the headline symptom; (b) it touches no
  tar; (c) its writes land only in `build/main/` (gitignored via `/build`) and `lzmaNativeResolvedPaths.generated.cjs`
  (the git-status diff below catches it if that is tracked); (d) its own nested esbuild spawn already has a win32
  `process.execPath` branch (`buildDevWorkerEsbuildArgv`, meta/buildDecompressWorkerDev.ts:~101), so a pass is not
  confounded by a second unfixed spawn; (e) success is deterministic and self-announcing: it prints
  `[build:decompress-worker-dev] esbuild-aliased worker bundle -> ...`. `lint-translations` was rejected because its
  exit code carries its own lint verdict (a non-zero there would be ambiguous); `check:build-bin-mirror` rejected
  because it exits non-zero on mirror drift unrelated to runTs.
- `public/bin/.release_tags` ALREADY matches the current tags (`{"legendary":"0.21.0",...,"__darwin_layout":"964f49a5..."}`),
  so a plain `pnpm download-helper-binaries` will most likely print `Nothing to download, binaries are up-to-date` and
  exit 0 WITHOUT ever spawning tar. That proves the runTs bundle+run phase (F2) and NOTHING about tar. Exercising
  tar needs the forced run in Task 2.
- Pre-existing `public/bin` state (record, do not interpret): `.release_tags` mtime 2026-09-06 12:49 +1200 and
  `public/bin/x64` 12:48 — ~14 min BEFORE `8ed7b8ccd` (13:03 same day); `public/bin/arm64/darwin/{gogdl,legendary,nile}`
  are onedir directories with archive mtimes 2026-08-27. Provenance of that earlier populate is unknown (could be a
  copy, a PowerShell/bsdtar run, or tsx) — note it as an open observation in the tar todo, not as evidence of anything.
- Extraction (`extractTarGz`, meta/downloadHelperBinaries.ts:167, called at :262) only runs for the DARWIN onedir
  tarballs, but it runs on every host (dest `public/bin/{arch}/darwin`), so a forced run on Windows does exercise tar.
- Two-profile rule: does NOT apply. These are `meta/` build scripts, not sidecar/SEA binary runs; they read no
  HOME/APPDATA/XDG profile and create no session. No fake HOME needed. State this in the runTs Resolution section.
- `pnpm planning-gates` = `python3 meta/runPlanningGates.py`. On this box `python3` resolves to
  `.../Microsoft/WindowsApps/python3` (possibly the Store alias stub). If `pnpm planning-gates` fails because the
  interpreter itself will not start (not a gate verdict), run `python meta/runPlanningGates.py` and record both. Do
  NOT edit package.json.
- An untracked `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/.gitkeep` exists and
  is NOT ours. Never `git add -A` / `git add .`; stage explicit paths only.
</planner_findings>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Negative control (pre-fix runTs) then positive (current runTs), same argv</name>
  <files>meta/runTs.prefix-260922-toc.cjs (TEMPORARY — created and deleted inside this task, never committed); logs in the session scratchpad</files>
  <action>
All commands from Git Bash at repo root. Let SP be the session scratchpad dir; write every capture there, never in the repo.

Step 0 (baseline): save `git status --porcelain` to SP/status-before.txt. Re-run the F1 one-liner from the todo's
"Confirming command" section into SP/f1.txt and confirm it still starts with `#!/usr/bin/env node` (matches the
orchestrator's measurement). Save `git log --oneline 8ed7b8ccd^..HEAD -- meta/runTs.cjs` to SP/runts-history.txt
(must be exactly one line, 8ed7b8ccd). Save `node --version` too.

Step 1 (NEGATIVE CONTROL): create the pre-fix copy with `git show 8ed7b8ccd^:meta/runTs.cjs > meta/runTs.prefix-260922-toc.cjs`
(it must be in meta/ — see planner_findings). Install a bash `trap 'rm -f meta/runTs.prefix-260922-toc.cjs' EXIT` in the same
shell invocation so the file is deleted even if the run errors. Run
`node meta/runTs.prefix-260922-toc.cjs --bundle --platform=node --target=node22 meta/buildDecompressWorkerDev.ts`
capturing stdout+stderr to SP/negative.log and the exit code to SP/negative.exit. Then delete the file and verify
`test ! -e meta/runTs.prefix-260922-toc.cjs` and that `git status --porcelain` does not mention it.

Classify the negative control:
- REPRODUCED if the log contains `failed to launch esbuild` with `errno: -4058` and `code: 'ENOENT'`, and exit is 1.
  Extract F3: the error object's `syscall` and `path` fields verbatim. F3 is NOT falsified iff they name the resolved
  esbuild bin (`...node_modules\esbuild\bin\esbuild`).
- NOT REPRODUCED if it compiles and runs (the worker-bundle line appears) or fails some other way. Then STOP the
  closure path: skip nothing else below (still run Step 2 and Task 2 for evidence), but the runTs todo MUST NOT be
  closed in Task 3.

Step 2 (POSITIVE): with the committed meta/runTs.cjs, run `pnpm build:decompress-worker-dev` capturing to
SP/positive.log / SP/positive.exit. PASS iff exit 0, the log contains `[build:decompress-worker-dev] esbuild-aliased worker bundle ->`,
and contains no `failed to launch esbuild`.

Step 3: `git status --porcelain` to SP/status-after-task1.txt and diff against status-before. If any tracked file
changed (e.g. a generated file), restore it with `git checkout -- <path>` and record that it happened. Anything new
under gitignored build/ is expected and fine.

Do NOT fix anything in meta/runTs.cjs regardless of outcome — this task only measures.
  </action>
  <verify>
    <automated>test ! -e meta/runTs.prefix-260922-toc.cjs && ! git status --porcelain | grep -q 'runTs.prefix' && test -s "$SP/negative.log" && test -s "$SP/positive.log" && cat "$SP/negative.exit" "$SP/positive.exit"</automated>
  </verify>
  <done>negative.log and positive.log exist with exit codes; negative classified REPRODUCED/NOT REPRODUCED with F3 syscall/path extracted; positive classified PASS/FAIL; temp copy gone and never staged; tracked tree unchanged vs baseline.</done>
</task>

<task type="auto">
  <name>Task 2: pnpm download-helper-binaries — plain run (F2), then forced run to exercise tar, with full restore</name>
  <files>public/bin/** (gitignored runtime state — backed up and restored, never committed); logs in the session scratchpad</files>
  <action>
2a (PLAIN, the todo's named F2 step): run `pnpm download-helper-binaries` capturing to SP/dhb-plain.log / .exit.
Classify: the runTs phase PASSED iff there is no `failed to launch esbuild` and the compiled script's own output appears
(`Nothing to download, binaries are up-to-date` or `Downloading:`). F2 is NOT falsified iff exit is 0, or any non-zero is
attributable to a later phase (see classification below) and no -4058 appears. If it prints `Nothing to download`,
record explicitly: "tar was NOT exercised by the plain run".

2b (FORCED, tar evidence only — does NOT bear on the runTs verdict): back up state first, restore after, no matter the outcome.
- Save `where tar` and `tar --version | head -1` (from Git Bash) to SP/tar-env.txt.
- Move (rename, same volume — `mv`, not `cp`, so onedir contents incl. any links are preserved byte-for-byte)
  `public/bin/.release_tags` and every existing `public/bin/*/darwin` directory into SP/pubbin-backup/ preserving
  their relative paths. Record what was moved.
- Run `pnpm download-helper-binaries` capturing to SP/dhb-forced.log / .exit (allow up to ~10 min; it downloads
  every runner — network-heavy, that is expected). Pass `timeout` accordingly.
- Classify the outcome into exactly one bucket and quote the decisive log lines:
  (T-OK) exit 0 -> record the files that landed: `find public/bin -path '*darwin*' -maxdepth 4` output plus confirm
  `public/bin/{arch}/darwin/{runner}/{runner}` exists for each darwin runner — that is the tar todo's
  "confirm :138 ran, not merely :89" requirement.
  (T-TAR) `tar -tzf failed` / `tar -xzf failed` / `Cannot connect to C: resolve failed` -> GNU tar drive-letter defect evidence.
  (T-EPERM) `EPERM` on symlink creation -> SeCreateSymbolicLinkPrivilege limitation already documented in quick
  260922-nx4 SUMMARY; a different defect.
  (T-NET) download/sha256/network failure -> no tar information either way.
  (T-OTHER) anything else, quoted verbatim.
  None of T-TAR/T-EPERM/T-NET/T-OTHER counts against runTs as long as the compiled script started (its `Downloading:` line printed).
- RESTORE: remove any freshly created `public/bin/*/darwin` dirs and `.release_tags`, then move the backups back to
  their original paths. The win32/linux exes the forced run re-downloads are the SAME pinned release tags and are
  left in place — state that in the log. Verify `.release_tags` content is byte-identical to the pre-run copy
  (compare against `SP/release_tags.before`, a `cp` of `public/bin/.release_tags` taken BEFORE the move) and the darwin dirs are back.
- Final: `git status --porcelain` must equal SP/status-before.txt. If any tracked file changed, `git checkout -- <path>` it and record.

Do NOT close, retag beyond Task 3's instructions, or attempt a fix for the tar todo; its negative control on `fd7d085fb` is out of scope.
  </action>
  <verify>
    <automated>test -s "$SP/dhb-plain.log" && test -s "$SP/dhb-forced.log" && test -s "$SP/tar-env.txt" && cmp -s "$SP/release_tags.before" public/bin/.release_tags && diff <(git status --porcelain) "$SP/status-before.txt"</automated>
  </verify>
  <done>Plain run classified (runTs phase pass/fail, tar exercised yes/no); forced run classified into one of T-OK/T-TAR/T-EPERM/T-NET/T-OTHER with quoted lines and, for T-OK, the landed-file list; public/bin .release_tags and darwin dirs restored; git status identical to baseline.</done>
</task>

<task type="auto">
  <name>Task 3: Close or retag the runTs todo, retag detectVCRedist and tar todos, run gates, commit</name>
  <files>.planning/todos/pending/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md (or its completed/ destination), .planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md, .planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md</files>
  <action>
Body edits are APPEND-ONLY dated sections (`## ... (2026-09-22, quick 260922-toc)`); never delete prior prose. Frontmatter
keys may be updated. Keep `severity:` / `platform:` / `ready:` bare lowercase, in that order, `platform:` right after
`severity:` and `ready:` right after `platform:` (CLAUDE.md todo triage rules).

A. runTs todo — decision rule. CONFIRMED iff Task 1 negative = REPRODUCED (-4058/ENOENT, exit 1) AND Task 1 positive = PASS
AND Task 2a's runTs phase passed.
- If CONFIRMED: `git mv` it to `.planning/todos/completed/` (same filename). Frontmatter: `status: completed`, add
  `resolved: 2026-09-22` and `resolved_by: quick-260922-toc`, remove the now-stale `needs:` line (following the
  completed exemplar, which carries no `needs:`); leave `ready:` as-is (closed todos are exempt from triage). Append
  `## Resolution (2026-09-22, quick 260922-toc)` containing: host (Windows 11 10.0.26200, Git Bash, node version);
  the exact commands; a verdict table F1 / F2 / F3 with measured values (F1: orchestrator-measured shebang + the Task 1
  re-capture; F2: plain-run exit code and the line it printed, plus "tar not exercised" if applicable; F3: syscall/path
  from the negative-control error object); the negative/positive pair and the one-commit runts-history proving the
  runTs file was the only variable; a one-line pointer that the forced download-helper-binaries tar outcome is recorded
  in the tar todo, not here; the two-profile-rule note (meta build scripts, not sidecar/SEA runs, so no fake HOME);
  and a scope line repeating the todo's own "one spawn, not Windows support generally" caveat.
- If NOT CONFIRMED: leave it in pending/. Append `## Windows verification attempt (2026-09-22, quick 260922-toc)` with the
  same measurements and which falsifier fired. Retag `ready:` honestly: `code` if the failure is a reproducible defect
  now diagnosable on this box (set `needs:` to a short slug naming the next concrete step); `blocked` only if something
  external prevents progress (name it in `needs:`). Update `title:` only if the finding changes the claim.

B. detectVCRedist todo: `ready: blocked` -> `ready: code`. Keep `platform: windows`, `severity: medium`, `status: OPEN`.
Append `## Retag (2026-09-22, quick 260922-toc)`: the fix is porting the lost startup call (old `main.ts:288`
`detectVCRedist(mainWindow)`) into the Tauri-era startup path, and a Windows box is now available to verify it,
so it is desk-ready on the operator's Windows machine. Cite precedent: the pre-push-hook todo closed today
(`.planning/todos/completed/2026-09-22-pre-push-hook-cannot-pass-on-a-windows-checkout.md`) was tagged
`platform: windows` + `ready: code` for exactly this situation. Do not touch its `verifiable_on:` key.

C. tar todo: `ready: blocked` -> `ready: code`. Vocabulary reasoning (write it into the appended section, briefly):
the remaining work — run the negative control on `fd7d085fb` and the post-fix repro in Git Bash, confirm `:138`
extraction — is desk work an agent can run on this box: no app launch (so not `live-gate`, which is also defined
as a run on the Mac), no decision or credential (so not `human`), and the hardware is now to hand (so no longer
`blocked`). `code`'s "no other OS" clause is carried by `platform: windows`, the same pairing as the pre-push precedent
above. Leave `needs:` as is — it still accurately names the next step. Append
`## Local Windows measurements (2026-09-22, quick 260922-toc)` containing:
- `where tar` / `tar --version` result (from evidence_already_measured and SP/tar-env.txt), with the explicit caveat:
  this answers the Hypothesis section's "Nobody has run `where tar`" for THIS LOCAL Git Bash only; it is NOT a
  measurement of the `windows-latest` CI runner, whose PATH order remains unmeasured. It is consistent with (not proof
  of) the msys-GNU-tar-wins-PATH hypothesis.
- Task 2 plain-run note (tar exercised or not) and the forced-run bucket with quoted decisive lines. If T-OK: the
  landed-file list as evidence that `:138` ran on HEAD (post-fix `fb9f0d458`) under GNU tar 1.35 in Git Bash — and
  state plainly that without the `fd7d085fb` negative control this is NOT proof of the fix (it is exactly the
  "green run proves nothing until the pre-fix run is seen to fail" condition the Verification section names).
  If T-TAR: that is a post-fix Windows failure — say so prominently, it contradicts the shipped fix. If T-EPERM: record
  it as the separate symlink-privilege limitation (260922-nx4), not a tar result.
- The pre-existing `public/bin` provenance observation from planner_findings (dates only, explicitly uninterpreted).
- Do NOT close this todo.

D. Gates and commit: run `pnpm planning-gates` (fallback per planner_findings if the python3 alias will not start;
record both). Must pass. If the todo-frontmatter gate fails, fix the frontmatter — never the gate's vocabulary.
Stage ONLY the three todo paths (both old and new path for the `git mv` if it happened) by explicit path — never
`git add -A`/`.`, never the phase-46 `.gitkeep`. Commit once:
`docs(quick-260922-toc): verify runTs win32 esbuild fix on Windows, retag windows todos`
(adjust the first clause to "record unconfirmed runTs win32 verification" if not confirmed), ending with the trailer
`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Do not push. Do not run `graphify update`
(no code changed).
  </action>
  <verify>
    <automated>pnpm planning-gates || python meta/runPlanningGates.py; grep -q '^ready: code$' .planning/todos/pending/2026-09-06-detectvcredist-never-runs-on-windows.md && grep -q '^ready: code$' .planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md && grep -q 'NOT .*CI runner\|not .*CI runner' .planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md && git show --stat HEAD | grep -v 'phase' | grep -q 'todos' && ! git show --name-only HEAD | grep -q '46-windows-single-instance.*gitkeep\|runTs.prefix'</automated>
  </verify>
  <done>runTs todo is in completed/ with a Resolution section (confirmed) or in pending/ with findings + honest ready/needs (not confirmed); detectVCRedist and tar todos read ready: code with dated sections; planning gates green; one commit containing only the todo files; nothing pushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| network -> public/bin | forced download-helper-binaries pulls release archives; existing sha256 pinning in the script is the control |
| scratchpad logs -> repo | captures could be accidentally committed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260922-toc-01 | Tampering | forced download run | accept | script already refuses writes on sha256 mismatch (downloadHelperBinaries.ts:~243); tags are the already-pinned ones |
| T-260922-toc-02 | Information disclosure | logs | mitigate | logs live only in the session scratchpad; meta build scripts read no user profile/session, so no credentials can appear; nothing from SP is staged |
| T-260922-toc-03 | Tampering | temp pre-fix runTs copy | mitigate | bash EXIT trap deletes it; Task 1 verify asserts absence and not-staged; explicit-path staging only |
| T-260922-toc-04 | Repudiation | todo closure | mitigate | close only on the stated decision rule; negative control recorded verbatim with the one-commit history proving the single variable |
</threat_model>

<verification>
- Negative and positive runs share one argv; only the runTs file differs (one-commit history recorded).
- Tar outcomes are never counted for or against runTs; tar todo is not closed.
- `git status --porcelain` after Tasks 1-2 equals the baseline; the commit contains only todo markdown.
- `pnpm planning-gates` green.
</verification>

<success_criteria>
- runTs todo closed iff REPRODUCED + PASS; otherwise pending with findings and honest ready/needs.
- detectVCRedist and tar todos retagged to `ready: code` with dated, reasoned sections; tar section states the local-only scope of the `where tar` result.
- No stray files (pre-fix copy, logs, phase-46 .gitkeep) committed; nothing pushed.
</success_criteria>

<output>
Create `.planning/quick/260922-toc-verify-runts-win32-esbuild-fix-on-window/260922-toc-SUMMARY.md` when done.
</output>
