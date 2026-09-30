---
phase: quick-260930-qmu
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - QUICK-260930-QMU
files_modified:
  - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/r4-hijack-repair-check.ps1
  - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-build-identity.txt
  - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prestate-reg.txt
  - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prediction.md
  - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-preflight.txt
  - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-live.txt
  - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-new-log-lines.txt
  - .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-poststate-reg.txt
  - .planning/todos/pending/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md
  - .planning/todos/completed/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md
  - src/backend/__tests__/tauriShellSource.test.ts

estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - 'Launching the installed %LOCALAPPDATA%\GameLib\gamelib-shell.exe (CI release build of b48e8948f, which carries the quick-260926-f3l dev-build skip) while HKCU\Software\Classes\gamelib\shell\open\command reads "C:\gamelib-hijack-test\nope.exe" "%1" rewrites that key to the installed exe, byte-identical to the pre-state, with NO harness write (restore_write_needed: no)'
    - 'The gamelib-shell.log under HOME gains, after the recorded byte offset, exactly one line "<epoch> pid=<launched pid> repaired the gamelib:// HKCU registration (prior value: points-elsewhere) -- 4/4 installer-shaped values written under HKCU\Software\Classes\gamelib", and no new line carries the hijack value (T-UOK-01 log discipline holds live)'
    - 'In every outcome (PASS, FAIL, timeout, thrown error) the HKCU gamelib key ends byte-identical to its pre-state and zero gamelib-shell.exe / gamelib-sidecar.exe processes remain'
    - 'On PASS the todo is in .planning/todos/completed/ with a dated Result section, a Resolution section, severity/platform/ready intact and status: RESOLVED; on FAIL it stays in pending/ with a FAIL Result and no code or test file is touched'
    - 'Committed evidence carries no app stdout/stderr and no session data: only our own registry key values, our own log line(s), pids, paths and hashes'
  artifacts:
    - path: .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/r4-hijack-repair-check.ps1
      provides: 'The R4 instrument: read-only preconditions, hijack, launch, offset-scoped scoring, try/finally restore then teardown'
      contains: 'VERDICT: '
    - path: .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-live.txt
      provides: 'Scored run record: C1-C8, INV, log_offset_bytes, launched_pid, restore_write_needed, VERDICT line'
      contains: 'VERDICT: '
    - path: .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prestate-reg.txt
      provides: 'Bash-captured reg query /s of HKCU\Software\Classes\gamelib before any write; the reference every post-check diffs against'
    - path: .planning/todos/completed/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md
      provides: 'The closed todo (PASS branch only)'
      contains: '## Resolution'
  key_links:
    - from: 'r4-hijack-repair-check.ps1 Start-Process (environment inherited from powershell.exe, itself spawned from Git Bash)'
      to: 'shell_diag -> <HOME>\.config\gamelib\gamelib-shell.log'
      via: 'HOME inherited as C:\Users\grays; without HOME shell_diag writes the repair line nowhere and the release build discards stderr'
      pattern: 'HOME'
    - from: 'C4 registry read (inside try, app still running)'
      to: 'restore_write_needed (inside finally)'
      via: 'C4 is read BEFORE the harness restore; PASS requires restore_write_needed: no, so the safety net cannot mask a failed repair'
      pattern: 'restore_write_needed'
    - from: 'try block (hijack, launch, score)'
      to: 'finally block (restore FIRST, then teardown, then re-verify)'
      via: 'PowerShell try/finally, so the registry restore runs on success, FAIL, timeout and thrown errors alike'
      pattern: 'finally'
---

<objective>
Close the todo `2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md` by
running its one remaining live verify step -- step 2, the 46-POSTFIX R4 shape -- on this Windows
11 machine: hijack `HKCU\Software\Classes\gamelib\shell\open\command`, launch the INSTALLED app,
and confirm it repairs the key. Then record the result in the todo and move it to `completed/`.

Purpose: quick-260926-f3l put a dev-build skip in front of the HKCU self-heal
(`gamelib_protocol_exe_is_dev_build`, commits `28ff2c3e8` and `4a6f92bdf`). Verify step 1 (a
`pnpm tauri:dev` run leaves the key alone) was proven live on 2026-09-26. Step 2 proves the other
half: the skip did not also disable the repair for the installed app. That is the regression a
too-broad skip predicate would cause, and nothing has measured it since the predicate shipped.

Output: a reusable PowerShell instrument, pre-registered prediction and scored evidence under
this task's `evidence/`, and the todo closed (PASS) or a FAIL recorded in its pending copy (FAIL).
No product code changes. If the repair does not happen, STOP and report. Do not fix code.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md
@.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-POSTFIX-LIVE-CHECK.md

Read from `src-tauri/src/main.rs`, by symbol and not by line number:
`repair_windows_gamelib_protocol_registration`, `shell_diag`, `shell_diag_log_path`,
`shell_panic_log_path`, `gamelib_protocol_command_exe` and `gamelib_protocol_repair_needed`.
Graphify locates them: run `graphify query "repair_windows_gamelib_protocol_registration"`.

## Facts measured at planning time (2026-09-30, about 19:10 +13)

Re-measure every fact below at execution. None of them authorizes a registry write or a process
kill by itself. Only the in-script preconditions, observed live immediately before the write, do.

**Where the line lands.** `shell_diag` prints the line to stderr, then appends
`{epoch_secs} pid={pid} {message}\n` to `shell_diag_log_path(HOME)`. On non-macOS, `shell_panic_log_path` resolves that
to `<HOME>\.config\gamelib\gamelib-shell.log`.
- Here that is `C:\Users\grays\.config\gamelib\gamelib-shell.log`. In bash it is
  `$HOME/.config/gamelib/gamelib-shell.log`.
- At planning time it held 184 lines and 13344 bytes. Its last line's epoch was 1790743118, from
  a dev-tree run.
- It is NOT under `%LOCALAPPDATA%`. See 46-POSTFIX-LIVE-CHECK.md, Note 2.

**HOME is the only channel.** Without `HOME`, `shell_diag` writes nothing to the file. The release
build is also `windows_subsystem = "windows"`, set by the `cfg_attr` near the top of main.rs, so
its stderr is discarded.
- `powershell.exe` spawned from the Bash tool was measured to inherit `HOME=[C:\Users\grays]`
  and `USERPROFILE=[C:\Users\grays]`, with `CI` empty.
- The packaged sidecar-spawn lines use `eprintln!`, not `shell_diag`. A release launch therefore
  writes almost nothing else to the file.

**The exact line to score.** The repair ends with this `shell_diag(&format!(...))` call:
`"repaired the gamelib:// HKCU registration (prior value: {classification}) -- {written}/4 installer-shaped values written under HKCU\\{ROOT_SUBKEY}"`,
where `ROOT_SUBKEY = r"Software\Classes\gamelib"`.
- The hijack value `"C:\gamelib-hijack-test\nope.exe" "%1"` parses (via
  `gamelib_protocol_command_exe`) to `C:\gamelib-hijack-test\nope.exe`. That is not path-equivalent to the running exe,
  so the classification is `points-elsewhere`.
- The expected file line is therefore exactly:
  `<epoch> pid=<launched pid> repaired the gamelib:// HKCU registration (prior value: points-elsewhere) -- 4/4 installer-shaped values written under HKCU\Software\Classes\gamelib`

**Vacuity trap.** The log ALREADY contains two lines with that exact message: file lines 71 and
149, pids 34144 and 35496, both from PRE-FIX dev builds.
- A whole-file grep for the repair message passes before the app is ever launched.
- Every scoring read must start at the byte offset recorded before launch, and must match on
  the launched pid.

**The skip lines never reach the file.** The dev-build skip line
(`[shell] dev build running from its cargo target dir -- skipping ...`) and the `CI=e2e` skip line
are `eprintln!` only. The repair line's presence in the file is the proof that neither skip fired.
- The `CI=e2e` short-circuit reads the process environment. `CI` must not be `e2e` in the launch
  environment.

**When the repair runs.** It runs synchronously in `.setup()`, after the single-instance
decision. It writes all four installer-shaped values, then logs. So by the time the line is
visible, the registry writes have finished.

**Build under test.** The installed build is `%LOCALAPPDATA%\GameLib\gamelib-shell.exe`: 16554496
bytes, mtime 2026-09-29 23:44.
- Its sha256 is `5ADCE1BEB48CCC8F82695F98164062E6E53F45581DD0F188269015EBA6C63A9F`. That equals
  the value quick-260930-o75 recorded in its `evidence/w04-install-after.json` for the CI NSIS
  build of release-tauri.yml run `36556473399`, headSha `b48e8948f`.
- `git merge-base --is-ancestor 28ff2c3e8 b48e8948f` succeeds.
- `grep -c -a -F` on the exe returns 1 for each of three literals:
  `dev build running from its cargo target dir`,
  `repaired the gamelib:// HKCU registration (prior value: ` and `points-elsewhere`.
- This is a RELEASE build. 46-POSTFIX R4 ran against a debug NSIS build.

**Registry pre-state.** `reg query /s` of `HKCU\Software\Classes\gamelib` shows the four
installer-shaped values:

| Value | Data |
| --- | --- |
| `URL Protocol` | empty |
| `(Default)` | `URL:com.gamelib.shell protocol` |
| `DefaultIcon` `(Default)` | `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe",0` |
| `shell\open\command` `(Default)` | `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"` |

**Environment.**
- No `gamelib-*` process was running.
- `pwsh` is not installed. `powershell.exe` is Windows PowerShell 5.1.26100.
- PowerShell 5.1 reads a BOM-less `.ps1` as ANSI, so the instrument must be pure ASCII.
- PowerShell 5.1 also mangles embedded double quotes in native-command arguments, which is why
  the instrument writes the registry through .NET rather than through `reg.exe add`.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <relative/forward-slash path> -Mode X`
  was measured to work from the repo root in Git Bash. The script's exit code propagates.

**Planning gates.** `PYTHONUTF8=1 pnpm planning-gates` gives 12/12.
- Without `PYTHONUTF8`, one gate crashes on cp1252 and the result is 11/12. This is pre-existing
  and tracked by the pending todo `2026-09-30-planning-frontmatter-gate-crashes-on-windows-cp1252.md`.
  It is out of scope.

**Jest baseline.** `pnpm exec jest tauriShellSource` gives 1 suite, 228 passed, ending
`Ran all test suites matching /tauriShellSource/i.`
- A path-form filter such as `src/backend/__tests__/...` does NOT filter on Windows. It silently
  ran all 221 suites, 28 of which fail on Windows.
- Use the name pattern, and check the trailing `matching` line.

**The one live citation of the todo's pending/ path.** Outside historical planning records, the
only citation is a comment in Gate 5 at `src/backend/__tests__/tauriShellSource.test.ts:2762`.
- main.rs cites the todo by filename only.
- Precedent: `c3cc2ef44` (quick-260925-uok) cites its closed sibling todo as `todos/completed/...`
  at `:2564` of the same file. It wrote that path in the commit that closed the todo.
- The 260926-f3l PLAN and SUMMARY citations are history, not pointers. They are left alone.

## Deliberate real-profile arm (CLAUDE.md two-profile rule, half 2)

This check runs the INSTALLED app on the operator's REAL profile, with real `HOME` and
`USERPROFILE`. This is declared, not an oversight.

**Why it is the real profile:**
1. The only state this check mutates and scores is `HKCU\Software\Classes\gamelib`. That is the
   per-user registry hive of the operator's SID, and none of the eight fake-HOME variables can
   redirect it. A fake HOME would redirect the sidecar's store data and the log file, but not
   the state under test, so it would give the appearance of isolation over exactly the thing
   that is not isolated.
2. quick-260930-o75 measured that on Windows the Tauri shell resolves its own folders through the
   known-folder API regardless of those variables.
3. The todo's step 2 and the operator's request name the installed app as the operator runs it.

**Mitigations:**
- No app stdout/stderr is captured at all.
- Only lines containing `gamelib:// HKCU` are copied out of the log.
- Only our own key's values, pids, paths and hashes enter evidence.
- The app runs for well under 90 s and is then torn down.
</context>

<tasks>

<!-- planner-discipline-allow: gamelib-hijack-test -->
<!-- Rationale: the hijack path IS the value the instrument must write into the registry, so it
     has to be named verbatim in Task 1/2 actions. The Task 2 negative grep targets only
     evidence/r4-new-log-lines.txt, a file holding nothing but copied log lines (no header, no
     commentary), where its absence is the live proof of T-UOK-01 log discipline. -->

<task type="tracer">
  <name>Task 1: Preflight -- re-measure identity/registry/log, pre-register the prediction, build the R4 instrument and prove its restore path end-to-end with NO hijack and NO launch</name>
  <files>.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/r4-hijack-repair-check.ps1, .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-build-identity.txt, .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prestate-reg.txt, .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prediction.md, .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-preflight.txt</files>
  <read_first>src-tauri/src/main.rs (the symbols named in context), .planning/quick/260930-o75-phase-38-sitting-13-windows-38-e01-38-w0/evidence/w04-install-after.json, .planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-POSTFIX-LIVE-CHECK.md</read_first>
  <action>
All paths below are relative to the repo root. Run everything from the repo root in Git Bash.
Every evidence file is UTF-8 without a BOM, with LF-only line endings, and written as `key: value`
lines where a key is named. Call the task directory TD
(`.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to`).

**Step 1 -- Build identity (bash, read-only).** Write `TD/evidence/r4-build-identity.txt` with
these keys:
- `installed_exe`
- `size_bytes`
- `mtime`
- `sha256`, from sha256sum of the installed shell
- `sha256_match: yes|no`, compared case-insensitively against the o75 value quoted in context
- `ancestor_28ff2c3e8_of_b48e8948f: yes|no`
- one `literal_count` line per literal, giving the `grep -c -a -F` count for each of the three
  literals quoted in context

If `sha256_match` is no, or any count is 0, STOP and report to the orchestrator. The build under
test would then no longer be the one whose provenance and dev-skip predicate were established.

**Step 2 -- Registry pre-state (bash, read-only).** Run
`MSYS_NO_PATHCONV=1 reg query "HKCU\Software\Classes\gamelib" /s`, pipe it through `tr -d '\r'`,
and write the output to `TD/evidence/r4-prestate-reg.txt`.
- If the `shell\open\command` default is not exactly
  `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"`, STOP and report.
- The PASS criterion "byte-identical to pre-state" only means "repaired" when the pre-state is
  the installed-exe shape.
- Also confirm that `MSYS_NO_PATHCONV=1 tasklist /FI "IMAGENAME eq gamelib-shell.exe" /NH` reports
  no tasks. If a GameLib instance is running, it is the operator's: STOP and report. Never kill it.

**Step 3 -- Pre-register the prediction.** Write `TD/evidence/r4-prediction.md` BEFORE any live
step. List each scored check, its expected observation, and what FAIL would mean:
- C1: the hijack landed. The .NET readback and the `reg.exe query /ve` readback both show
  `"C:\gamelib-hijack-test\nope.exe" "%1"` as REG_SZ, before launch.
- C2: the launched process's ExecutablePath is the installed exe, and it is the only
  gamelib-shell.exe.
- C3: exactly one post-offset log line, pid-matched, equal to the expected line quoted in
  context, with classification `points-elsewhere` and `4/4`.
- C4: the command value, read while the app is still running and BEFORE any harness restore,
  equals the pre-state byte-for-byte as REG_SZ.
- C5: the full `reg.exe query /s` snapshot equals the pre-state snapshot. All four values are
  installer-shaped.
- C6: no post-offset log line contains the substring `gamelib-hijack-test`.
- C7: the app came up within 60 s. Either a gamelib-sidecar.exe whose ParentProcessId is the
  launched pid appears, or the main window handle becomes non-zero.
- C8: zero gamelib-shell.exe and gamelib-sidecar.exe after teardown.
- INV: after the finally block, the registry equals the pre-state.
- PASS means C1 to C8 and INV all PASS AND `restore_write_needed: no`.

Also copy in the "Deliberate real-profile arm" declaration from this plan's context, in your own
words and with the same three reasons.

**Step 4 -- Write the instrument** `TD/r4-hijack-repair-check.ps1`.
- It must be pure ASCII: no em-dashes, arrows or smart quotes, even in comments.
- It targets Windows PowerShell 5.1, with `Set-StrictMode -Version Latest` and
  `$ErrorActionPreference = 'Stop'`.
- Parameters: `-Mode` (mandatory, `Preflight` or `Live`) and `-EvidenceDir` (default
  `$PSScriptRoot\evidence`).
- Constants:
  - the three subkey paths
  - the hijack value `"C:\gamelib-hijack-test\nope.exe" "%1"`, as a single-quoted PS literal
  - the installed exe, `Join-Path $env:LOCALAPPDATA 'GameLib\gamelib-shell.exe'`
  - the expected sha256
  - the expected message (the text after `pid=<n> `, exactly as quoted in context)
  - a 60 s poll bound
  - a 10 s graceful-close bound
- Registry access goes through
  `[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(path[, writable])`:
  - read with `GetValue('', $null, 'DoNotExpandEnvironmentNames')`
  - read the type with `GetValueKind('')`
  - write with `SetValue('', value, [Microsoft.Win32.RegistryValueKind]::String)`
  - close every key handle
  - do NOT use `reg.exe add` from PowerShell (5.1 native-arg quoting mangles embedded quotes)

**Preconditions.** Run these in both modes. They are all read-only, and they run before ANY
registry write. On any failure the script writes the reason, performs no write, and exits 2.
- P1: zero processes named gamelib-shell.exe or gamelib-sidecar.exe, via
  `Get-CimInstance Win32_Process`.
- P2: the installed exe exists, and its `Get-FileHash -Algorithm SHA256` equals the expected hash.
- P3: the .NET-read command value is exactly the installed-exe shape, and its kind is String.
- P4: `$env:HOME` is non-empty and equals `$env:USERPROFILE`, compared case-insensitively. This
  is the real-profile arm, and it is what makes shell_diag write to the file.
- P5: `$env:CI` is not `e2e`.
- P6: `Test-Path 'C:\gamelib-hijack-test'` is false, so the hijack points at nothing.
- P7: the log path is `Join-Path $env:HOME '.config\gamelib\gamelib-shell.log'`. Record whether it
  exists, its byte length as `log_offset_bytes`, its line count, and ONLY the epoch and pid
  prefix of its last line. Never record the message text.
- P8: capture the in-run pre-state snapshot from `& reg.exe query 'HKCU\Software\Classes\gamelib' /s`.

**The restore function.** Both modes use ONE restore function.
- It re-reads the command value via .NET.
- If the value differs from the P3 pre-state value, or its kind is not String, it writes the
  pre-state value back via SetValue.
- It then re-reads, and returns two facts: whether a write was needed, and whether the value now
  equals the pre-state.

**Preflight mode.**
1. Run the preconditions.
2. Back up the key with `& reg.exe export 'HKCU\Software\Classes\gamelib' <EvidenceDir>\r4-backup.reg /y`.
3. Exercise the write-and-verify primitive for real: FORCE one SetValue of the pre-state value
   onto itself. This same-value REG_SZ write is the ONLY registry write Preflight makes.
4. Re-read via .NET and via a fresh `reg.exe query /s` snapshot. Both must equal the pre-state.
5. Write `r4-preflight.txt`, containing every precondition result and the round-trip result,
   ending with exactly `PREFLIGHT: PASS` or `PREFLIGHT: FAIL`.
6. Exit 0 on PASS and 1 on FAIL.

**Live mode.** Implement it now; Task 2 runs it. The body runs inside try/finally.

Before the try:
- Run the preconditions (exit 2 on failure).
- Take the reg export backup.

Inside the try:
1. **(a) Hijack.** Write the hijack value (REG_SZ) via .NET.
2. **(b) C1.** Read the value back via .NET (exact match and kind String). ALSO read it with
   `& reg.exe query '<command subkey under HKCU>' /ve`, and require an output line that ends with
   `REG_SZ    ` followed by the hijack value. Use a string EndsWith, not `-like`. If either
   readback fails, throw. Do not launch.
3. **(c) Launch and C2.** Launch with
   `Start-Process -FilePath <installed exe> -WorkingDirectory <install dir> -PassThru`.
   - Pass no arguments and no output redirection. The app's stdout/stderr are never captured.
   - Record `launched_pid`.
   - C2: check the launched process's ExecutablePath and single-instance count.
4. **(d) Poll.** Poll every 1 s, up to 60 s.
   - Read the log from `log_offset_bytes` to EOF with FileShare ReadWrite, decode it as UTF-8,
     split on LF, and trim CR.
   - Match a line against `^\d+ pid=<launched_pid> ` plus the expected message, as an exact,
     case-sensitive, full-line match. Record the seconds until it is seen.
   - Record the seconds until app-up evidence is seen: a sidecar child whose ParentProcessId is
     the launched pid, or a non-zero MainWindowHandle after `Refresh()`.
   - Stop when both are seen, or when the process has exited, or at the bound.
5. **(e) Score, while the app is still running and before the finally block.**
   - C3: exactly one pid-matched line equals the expected line.
   - C4: the .NET command value equals the pre-state exactly, with kind String.
   - C5: the `reg.exe /s` snapshot equals P8.
   - C6: no post-offset line contains `gamelib-hijack-test`.
   - C7: app-up evidence was seen within the bound.
   - Write `r4-new-log-lines.txt` containing ONLY the post-offset lines that contain
     `gamelib:// HKCU`, never all new lines. Copy them verbatim, with no header, label or
     commentary: the Task 2 gate negative-greps this file, so any text the harness adds would
     turn it into a self-invalidating gate. Record the count of all new lines in `r4-live.txt`.

The finally block runs on PASS, FAIL, timeout and thrown errors alike, in this order:
1. **Restore the registry FIRST**, through the restore function. Record
   `restore_write_needed: yes|no`.
2. **Then tear down.**
   - If the launched pid is alive, run `taskkill.exe /PID <pid> /T`. This is graceful: WM_CLOSE,
     which a tray-resident app may ignore.
   - Wait up to 10 s, then run `taskkill.exe /PID <pid> /T /F`.
   - Then Stop-Process -Force any remaining gamelib-shell.exe or gamelib-sidecar.exe whose
     ExecutablePath is under `%LOCALAPPDATA%\GameLib\`. P1 proved none existed before, so every
     one of them is ours.
   - Wait up to 10 s for zero. That result is C8.
   - Informational only: count msedgewebview2.exe processes whose CommandLine contains
     `gamelib-shell.exe.WebView2`.
3. **Then re-read the registry** via .NET and `reg.exe /s`. INV requires both to equal the
   pre-state.

Then write `r4-live.txt`. It records:
- the precondition results
- `log_offset_bytes: <n>`
- `launched_pid: <n>`
- both hijack readbacks
- the ExecutablePath
- the poll timeline
- one line per check, in the form `C1: PASS|FAIL <observed>` through `C8`, plus `INV`
- `restore_write_needed: yes|no`
- a final line, exactly `VERDICT: PASS` or `VERDICT: FAIL`

Exit codes: 0 PASS, 1 FAIL, 2 precondition unmet (nothing written), and 3 if INV or C8 is
violated after the finally block. Exit 3 is the loudest outcome: the registry or processes were
not restored.

PASS REQUIRES `restore_write_needed: no`. That requirement is what stops the harness's own safety
net from masking a failed repair. Without it, the registry could read correct only because the
HARNESS restored it, not the app.

**Step 5 -- Run the preflight** from the repo root, with the command in this task's verify block.
It must exit 0 with `PREFLIGHT: PASS`, and the bash re-capture of the key must diff empty against
`r4-prestate-reg.txt`.
- An instrument bug may be fixed and the preflight re-run.
- Leave `r4-backup.reg` in place; Task 2 overwrites it.

Prettier: every file this task writes is under `.planning/`, which prettier ignores
(`npx prettier --file-info` reports `"ignored": true`). A prettier `--check` would be vacuous, so
it is omitted by design, per CLAUDE.md.
  </action>
  <verify>
    <automated>TD=.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to; perl -ne '$n++ if /[^\x00-\x7F]/; END { exit($n ? 1 : 0) }' $TD/r4-hijack-repair-check.ps1 && powershell.exe -NoProfile -ExecutionPolicy Bypass -File $TD/r4-hijack-repair-check.ps1 -Mode Preflight && grep -qx 'PREFLIGHT: PASS' $TD/evidence/r4-preflight.txt && ! grep -q $'\r' $TD/evidence/r4-preflight.txt && diff <(MSYS_NO_PATHCONV=1 reg query "HKCU\Software\Classes\gamelib" /s | tr -d '\r') $TD/evidence/r4-prestate-reg.txt && grep -qx 'sha256_match: yes' $TD/evidence/r4-build-identity.txt && grep -qx 'ancestor_28ff2c3e8_of_b48e8948f: yes' $TD/evidence/r4-build-identity.txt && test -s $TD/evidence/r4-prediction.md && grep -q 'VERDICT: ' $TD/r4-hijack-repair-check.ps1 && grep -q 'finally' $TD/r4-hijack-repair-check.ps1 && echo TASK1_OK</automated>
  </verify>
  <done>
The instrument exists and is pure ASCII. Preflight exits 0 with `PREFLIGHT: PASS`, having
performed only the same-value write, and the key diffs empty against the bash pre-state capture.
The build identity is re-confirmed: the hash matches o75's record, the ancestry holds, and all
three literals are present. The prediction is on disk before any hijack. No app has been
launched, and the key has never held a non-pre-state value.
  </done>
</task>

<task type="auto">
  <name>Task 2: Live R4 -- hijack the key, launch the installed app, score the repair, tear down; the registry is restored in every outcome</name>
  <files>.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-live.txt, .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-new-log-lines.txt, .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-poststate-reg.txt</files>
  <precondition>Task 1 left `PREFLIGHT: PASS`, no gamelib-shell.exe or gamelib-sidecar.exe is running, and HKCU gamelib still diffs empty against evidence/r4-prestate-reg.txt.</precondition>
  <reversibility rating="reversible">The hijack is a single REG_SZ value restored in the instrument's finally block, with a reg export backup and a bash reg import recovery as a second net.</reversibility>
  <read_first>.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/r4-hijack-repair-check.ps1, .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-prediction.md</read_first>
  <action>
TD is the task directory, as in Task 1. Hijacking HKCU is explicitly authorized for this run by
the operator's request. The authorization for THIS write comes from the live observation in
step 1 and the instrument's preconditions, not from planning-time facts.

**Step 1 -- Re-observe.** In bash, re-capture `reg query /s` of `HKCU\Software\Classes\gamelib`
(with `tr -d '\r'`) and diff it against `TD/evidence/r4-prestate-reg.txt`. Also re-check
tasklist for both image names.
- If the key has drifted, or a GameLib process is running, STOP and report. Do not overwrite the
  pre-state file to make it fit, and do not kill anything.

**Step 2 -- Run the instrument ONCE.** Run
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File TD/r4-hijack-repair-check.ps1 -Mode Live`
in the FOREGROUND, with a Bash tool timeout of 300000 ms. The script's own bounds total under
about 100 s.

**Step 3 -- Independent post-checks** from bash, outside the instrument, through a different
process and API.
- Re-capture `reg query /s` the same way into `TD/evidence/r4-poststate-reg.txt`. It must diff
  empty against `r4-prestate-reg.txt`.
- tasklist must report no gamelib-shell.exe and no gamelib-sidecar.exe.
- On a PASS verdict, independently grep the REAL log file: take the bytes after
  `log_offset_bytes` (via tail -c), and require exactly 1 line containing
  `pid=<launched_pid> ` plus the expected message. Both values come from `r4-live.txt`.

**Step 4 -- Remove the backup.** Delete `TD/evidence/r4-backup.reg` ONLY once the step 3 diff is
empty. Its content is already recorded as text in `r4-prestate-reg.txt`.

**Recovery.** Use this only on exit code 3, a non-empty post diff, or an interrupted run.
1. Run `MSYS_NO_PATHCONV=1 reg import "$(cygpath -w TD/evidence/r4-backup.reg)"`, then re-diff.
2. Run `MSYS_NO_PATHCONV=1 taskkill /IM gamelib-shell.exe /T /F` and the same for
   gamelib-sidecar.exe. P1 proved none of them were the operator's.
3. Re-verify both, then STOP and report. Do not proceed to closing the todo.

**Triage -- an instrument defect is not a product result.**
- **Exit 2:** a precondition was unmet and nothing was written. Report it; never bypass a
  precondition.
- **A thrown PowerShell error unrelated to the product** (for example a typo or StrictMode
  null-property access): you may fix the instrument and re-run. The finally block will already
  have restored the key. Every re-run repeats all preconditions. Before a re-run, rename the prior
  `r4-live.txt` to `r4-live-attempt-N.txt` so no attempt is silently lost.
- **A genuine product FAIL** (C1 and C2 PASS, but C3, C4 or C5 FAIL): do NOT retry it into a pass.
  Do NOT touch anything under `src-tauri/`. Record it and go to Task 3's FAIL branch.
- **C4 PASS but C3 FAIL** (the key repaired but no line): this is still FAIL for closing
  purposes, because the todo's step 2 asks for both. Report it as a log-channel finding.

Prettier: every file this task writes is under `.planning/`, which prettier ignores. A
`--check` would be vacuous and is omitted by design, per CLAUDE.md.
  </action>
  <verify>
    <automated>D=.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence; L="$HOME/.config/gamelib/gamelib-shell.log"; grep -Eqx 'VERDICT: (PASS|FAIL)' $D/r4-live.txt && ! grep -q $'\r' $D/r4-live.txt && diff <(MSYS_NO_PATHCONV=1 reg query "HKCU\Software\Classes\gamelib" /s | tr -d '\r') $D/r4-prestate-reg.txt && diff $D/r4-poststate-reg.txt $D/r4-prestate-reg.txt && MSYS_NO_PATHCONV=1 tasklist /FI "IMAGENAME eq gamelib-shell.exe" /NH | grep -q "No tasks" && MSYS_NO_PATHCONV=1 tasklist /FI "IMAGENAME eq gamelib-sidecar.exe" /NH | grep -q "No tasks" && ! test -e $D/r4-backup.reg && { grep -qx 'VERDICT: FAIL' $D/r4-live.txt || { OFF=$(sed -n 's/^log_offset_bytes: //p' $D/r4-live.txt) && P=$(sed -n 's/^launched_pid: //p' $D/r4-live.txt) && [ -n "$OFF" ] && [ -n "$P" ] && NEW=$(tail -c +$((OFF+1)) "$L") && grep -qF "pid=$P repaired the gamelib:// HKCU registration (prior value: points-elsewhere) -- 4/4 installer-shaped values written under HKCU\Software\Classes\gamelib" <<<"$NEW" && grep -qx 'C3: PASS.*' $D/r4-live.txt && grep -qx 'restore_write_needed: no' $D/r4-live.txt && test -s $D/r4-new-log-lines.txt && ! grep -q 'gamelib-hijack-test' $D/r4-new-log-lines.txt; }; } && echo TASK2_OK</automated>
  </verify>
  <done>
`r4-live.txt` ends in a VERDICT line. Whatever the verdict, the key diffs empty against the
pre-state, zero gamelib-shell.exe and gamelib-sidecar.exe remain, and the backup was removed only
after the diff proved the invariant.

On PASS, all of these hold:
- the real log file, read after the recorded offset, holds exactly one pid-matched
  `(prior value: points-elsewhere) -- 4/4` line
- `restore_write_needed` is `no`, so the APP repaired the key, not the harness
- the hijack value appears nowhere in the new log lines
  </done>
</task>

<task type="auto">
  <name>Task 3: Record the result in the todo; on PASS close it to completed/ and re-point its one live citation; on FAIL record the failure in pending/ and stop</name>
  <files>.planning/todos/pending/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md, .planning/todos/completed/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md, src/backend/__tests__/tauriShellSource.test.ts</files>
  <read_first>.planning/todos/pending/2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md, .planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md (the sibling closed todo's Resolution shape), .planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/evidence/r4-live.txt</read_first>
  <action>
The branch is chosen by the last line of `evidence/r4-live.txt`. Record only measured facts, each
traceable to an evidence file. Keep the appended text concise, 45 lines or fewer in total, citing
evidence files rather than duplicating them, so git still sees the move as a rename.

**PASS branch (`VERDICT: PASS`).**

1. **Result section.** Append `## Result (quick-260930-qmu, 2026-09-30)` to the todo, while it is
   still in pending/. State:
   - the build under test: path, sha256, and provenance (run 36556473399 / `b48e8948f`, a
     descendant of `28ff2c3e8`, with the dev-skip literal present in the exe)
   - that this was a RELEASE CI build, whereas 46-POSTFIX R4 used a debug NSIS build
   - the real-profile-arm declaration, in one sentence with its reason
   - the pre-state command value, verbatim
   - the hijack value, and both readbacks
   - the launched pid and its ExecutablePath
   - the exact new log line, verbatim from `r4-new-log-lines.txt`, and the seconds to repair and
     to app-up
   - C4 and C5
   - `restore_write_needed: no`, and why it matters
   - C6 (the hijack value is absent from the log)
   - the teardown result C8
   - the independent bash post-checks

   Close the section with an honest-limits paragraph:
   - one host, one launch
   - the file line depends on `HOME`, inherited here from Git Bash. A Start-menu launch has no
     HOME, so the line would reach no file. 46-POSTFIX Note 2 still stands and is not addressed
     here. The registry result does not depend on HOME.
   - a gamelib:// deep-link delivery after the repair was not exercised. 46-POSTFIX R4 did
     exercise it, but the todo's step 2 asks only for the repair.

2. **Resolution section.** Append `## Resolution`, stating that both verify steps are now confirmed
   live:
   - step 1 by quick-260926-f3l on 2026-09-26: a dev build left HKCU naming the installed exe
   - step 2 by quick-260930-qmu
   - the fix commits are `28ff2c3e8` and `4a6f92bdf`

3. **Frontmatter.** Keep `severity: medium`, `platform: windows` and `ready: live-gate` exactly as
   they are, in place. Add `status: RESOLVED` immediately after `ready:`, then
   `resolved: 2026-09-30`. Values are bare and lowercase where the vocabulary applies, as CLAUDE.md
   requires. Change nothing else in the frontmatter.

4. **Move.** `git mv` the todo file, keeping its basename
   `2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md`, from
   `.planning/todos/pending/` to `.planning/todos/completed/`.

5. **Re-point the one live citation.** In `src/backend/__tests__/tauriShellSource.test.ts`, the
   Gate 5 comment near line 2762 cites this todo's path under the pending directory. Change that
   directory segment to `completed`, and change nothing else in the file.
   - This is a comment-only edit, made necessary by the move. It follows the `c3cc2ef44`
     precedent at `:2564` of the same file.
   - It is the only file outside `.planning/` this task touches.
   - It is NOT a product-code change. Nothing under `src-tauri/` is touched.
   - The historical 260926-f3l PLAN and SUMMARY citations stay as written.

6. **Commit.** Stage exactly these, and nothing else:
   - the rename
   - the test file
   - `TD/r4-hijack-repair-check.ps1`
   - the evidence files

   Commit as `docs(quick-260930-qmu): close the gamelib:// dev-build self-heal todo -- installed
   app repairs a hijacked HKCU key live (46-POSTFIX R4)`, ending with the session's commit
   attribution trailer. Do NOT stage PLAN, SUMMARY or STATE.md; the orchestrator commits those.
   Run the privacy grep from this task's verify block BEFORE committing.

   Never stage `evidence/r4-backup.reg`, in either branch. If it still exists, delete it only
   after a bash `reg query /s` diff against `r4-prestate-reg.txt` is empty. The verify block's
   clean-status check over `evidence/` fails while it lingers untracked.

**FAIL branch (`VERDICT: FAIL`, or Task 2 stopped).**

1. Append `## Result (quick-260930-qmu, 2026-09-30) -- FAIL` to the PENDING todo. Give:
   - the failing check ids and their observed values
   - the INV and C8 status
   - the attempt count
2. Leave the frontmatter unchanged. Add no Resolution section, do not move the file, do not edit
   the test file, and touch nothing under `src-tauri/`.
3. Commit the todo edit, the instrument and the evidence, with a `docs(quick-260930-qmu): record
   R4 live FAIL ...` subject.
4. Report to the orchestrator.

**Formatter.**
- `src/backend/__tests__/tauriShellSource.test.ts` is SEEN by prettier (it was measured as
  `{ "ignored": false, "inferredParser": "typescript" }`), so the verify block runs a REAL
  `npx prettier --check` over that one path.
- Every other path this task writes is under `.planning/`, which prettier ignores, so its check
  is omitted by design.
  </action>
  <verify>
    <automated>TD=.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to; N=2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md; C=.planning/todos/completed/$N; P=.planning/todos/pending/$N; F=src/backend/__tests__/tauriShellSource.test.ts; test -d $TD/evidence && test -s $TD/evidence/r4-live.txt && ! grep -rEl '[0-9]{17}|refresh_?token|access_?token|passw|galaxyUserId|userId|username' $TD/evidence/ && if grep -qx 'VERDICT: PASS' $TD/evidence/r4-live.txt; then test -f $C && ! test -e $P && TRACKED_P=$(git ls-files -- $P) && TRACKED_C=$(git ls-files -- $C) && [ -z "$TRACKED_P" ] && [ -n "$TRACKED_C" ] && grep -qx '## Result (quick-260930-qmu, 2026-09-30)' $C && grep -qx '## Resolution' $C && FM=$(awk '/^---$/{c++; next} c==1' $C) && grep -qx 'severity: medium' <<<"$FM" && grep -qx 'platform: windows' <<<"$FM" && grep -qx 'ready: live-gate' <<<"$FM" && grep -qx 'status: RESOLVED' <<<"$FM" && ! grep -q 'todos/pending/2026-09-26-gamelib-self-heal' $F && grep -q 'todos/completed/2026-09-26-gamelib-self-heal' $F && CM=$(git log -1 --format=%H -- $C) && [ -n "$CM" ] && NS=$(git diff --numstat $CM~1 $CM -- $F) && [ "$(printf '%s' "$NS" | cut -f1,2)" = "$(printf '1\t1')" ] && npx prettier --check $F && J=$(pnpm exec jest tauriShellSource 2>&1) && grep -qE '^Tests: +228 passed, 228 total$' <<<"$J" && grep -qF 'Ran all test suites matching /tauriShellSource/i.' <<<"$J"; else test -f $P && ! test -e $C && grep -q '^## Result (quick-260930-qmu, 2026-09-30) -- FAIL$' $P && [ -z "$(git status --porcelain -- $F src-tauri/)" ]; fi && [ -z "$(git status --porcelain -- .planning/todos $F $TD/evidence $TD/r4-hijack-repair-check.ps1)" ] && PYTHONUTF8=1 pnpm planning-gates 2>&1 | grep -q '12/12 planning gates passed' && echo TASK3_OK</automated>
  </verify>
  <done>
**PASS branch.** The todo is committed at its `completed/` path and gone from `pending/`. It has
exactly one dated Result section and one Resolution section. Its frontmatter still carries
`severity: medium`, `platform: windows` and `ready: live-gate`, now with `status: RESOLVED`.
The test file's one comment citation now names `completed/`: a 1-line diff, prettier-clean, and
tauriShellSource still at 228/228. The evidence passes the privacy grep. Planning gates are 12/12
under `PYTHONUTF8=1`.

**FAIL branch.** The todo stays in `pending/` with a FAIL Result, no source or test file is
changed, the evidence is committed, and the orchestrator has been told which checks failed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| harness -> HKCU\Software\Classes\gamelib | The harness writes the operator's real per-user registry. A left-behind hijack silently breaks every gamelib:// open. |
| installed app (real profile) -> evidence files | The app runs against real sessions. Anything copied out of its outputs may carry session data into a committed file. |
| harness -> running processes | The harness kills processes. A wrong target could kill an operator-run GameLib, and a missed one could orphan an authenticated sidecar. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-QMU-01 | Tampering | HKCU gamelib command value | high | mitigate | Live mode wraps the hijack in try/finally. The finally block restores the key FIRST, before teardown, on every outcome. A `reg export` backup is taken before the write. The instrument exits 3 on an INV violation. An independent bash `reg query /s` diff runs outside the instrument. The documented `reg import` recovery is used, and the backup is deleted only after the diff is empty. |
| T-QMU-02 | Repudiation | PASS verdict | high | mitigate | The harness's own restore could mask a failed repair. C4 is read BEFORE the finally restore, and PASS requires `restore_write_needed: no`. Scoring is offset-scoped and pid-matched, because the log already holds two historical `points-elsewhere` lines (pids 34144 and 35496) that a whole-file grep would pass on. |
| T-QMU-03 | Information disclosure | evidence/ files | medium | mitigate | App stdout/stderr are never captured: Start-Process runs without redirection. Only post-offset log lines containing `gamelib:// HKCU` are copied out. P7 records only the epoch and pid of the last pre-existing line. The Task 3 privacy grep runs over evidence/ before commit. |
| T-QMU-04 | Denial of service | gamelib-shell.exe / gamelib-sidecar.exe | medium | mitigate | Teardown tries a graceful `taskkill /T`, then `taskkill /T /F`, then a Stop-Process sweep scoped to ExecutablePath under `%LOCALAPPDATA%\GameLib\`. C8 must count zero, and bash tasklist re-checks it. |
| T-QMU-05 | Spoofing | process targeting | medium | mitigate | P1 requires zero GameLib processes before any write. Task 2 step 1 re-observes that. An operator-run instance causes a STOP, never a kill. The sweep is safe only because of P1. |
| T-QMU-06 | Tampering | gamelib:// opens during the hijack window | low | accept | For under about 90 s an external gamelib:// open would target `C:\gamelib-hijack-test\nope.exe`, which P6 proves does not exist. It fails harmlessly with a not-found error. |
| T-QMU-SC | Tampering | npm/pip/cargo installs | high | accept | This plan installs no packages. It uses only preinstalled OS tools (`reg.exe`, `tasklist`, `taskkill`, `powershell.exe` 5.1) and the repo's existing devDependencies. |
</threat_model>

<verification>
- Task 1 leaves a pure-ASCII instrument with `PREFLIGHT: PASS`, and the key byte-identical to
  the bash pre-state.
- Task 2 leaves a VERDICT line, the key byte-identical to the pre-state (checked both in-run and by
  an independent bash diff), and zero GameLib processes. On PASS it adds a pid-matched,
  offset-scoped repair line in the real log and `restore_write_needed: no`.
- Task 3, on PASS, leaves the todo committed in `completed/` with Result and Resolution sections,
  frontmatter keys intact plus `status: RESOLVED`, a 1-line comment re-point that is
  prettier-clean with jest at 228/228, and planning gates at 12/12. On FAIL it leaves the todo in
  `pending/` with a FAIL Result and no source change.
- No file under `src-tauri/` changes in either branch.
</verification>

<success_criteria>
- The installed app, launched against a hijacked key, repairs it by itself, and the harness
  never needs a restore write.
- `gamelib-shell.log` shows exactly one new `(prior value: points-elsewhere) -- 4/4` line for the
  launched pid.
- The registry and the process table are back to the pre-state in every outcome.
- The todo is closed to `completed/` on PASS. On FAIL, the failure is recorded in `pending/` and
  reported, and no code is changed.
</success_criteria>

<output>
Create `.planning/quick/260930-qmu-close-the-gamelib-dev-build-self-heal-to/260930-qmu-SUMMARY.md` when done.
</output>
