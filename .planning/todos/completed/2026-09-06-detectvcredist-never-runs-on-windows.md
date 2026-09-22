---
created: 2026-09-06
title: "detectVCRedist never runs under Tauri — Windows users are never prompted to install the VC++ redistributable"
area: tauri-sidecar
status: completed
severity: medium
platform: windows
ready: code
resolved: 2026-09-22
resolved_by: quick-260922-v2e
verifiable_on: "operator has a Windows machine (not primary OS)"
source: "quick-260906-gej, sweep FINDINGS.md section A row A7"
files:
  - src/backend/utils.ts:775 (detectVCRedist definition)
  - src/backend/utils.ts:1789 (re-export, no caller)
resolves_phase: null
---

# detectVCRedist never runs under Tauri — Windows users are never prompted to install the VC++ redistributable

## The unported side effect

Old `main.ts` called `detectVCRedist(mainWindow)` on Windows at startup (`main.ts:288`).

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

**0 occurrences** in the bundle; in-tree defined at `utils.ts:775`, re-exported at
`utils.ts:1789`, no caller.

## Consequence

Windows users are never prompted to install the VC++ redistributable. Windows is not the
operator's primary OS, so this is unverifiable locally — same class as the existing single-instance
todo (`.planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`).

## Retag (2026-09-22, quick 260922-toc)

`ready: blocked` -> `ready: code`. The fix is porting the lost startup call (old `main.ts:288`
`detectVCRedist(mainWindow)`) into the Tauri-era startup path. A Windows box is now available to
this operator (used this session for the runTs verification above), so this is no longer blocked
on hardware — it is desk-ready work an agent can pick up and verify on the operator's Windows
machine. Precedent: the pre-push-hook todo closed today
(`.planning/todos/completed/2026-09-22-pre-push-hook-cannot-pass-on-a-windows-checkout.md`) was
tagged `platform: windows` + `ready: code` for exactly this situation — reproducible and fixable
work that needs this specific OS but not a live app run, a decision, or credentials. `verifiable_on`
is left unchanged.

## Resolution (2026-09-22, quick 260922-v2e)

**Host:** Windows 11 10.0.26200, Git Bash (`C:\Program Files\Git`), node v24.19.0.

**What was wired and where:** `detectVCRedist()` (`src/backend/utils.ts:778`) is now called from
`src/backend/sidecar/appShellFlowRegistration.ts`'s `frontendReady` handler, inside the SAME
`if (!frontendReadyBootWorkDone)` one-shot boot block that guards `initQueue(true)`'s 5s
download-queue auto-resume, immediately AFTER that `setTimeout` is scheduled. NOT wired into
`bootstrap.ts`'s `init()`: the in-app dialog path (`showDialogBoxModalAuto` ->
`sendFrontendMessage('showDialog')`) is one-way and is silently dropped if no renderer listener is
mounted yet (`preload/tauriTransport.ts`'s `listen()` has no buffer/replay) — a call in `init()`
would run the probe before the webview has even loaded and the dialog would vanish.
`frontendReady` is the same hook the pre-existing Snap warning dialog already uses for exactly
this reason. The call is wrapped in its own try/catch (`logSendFailure('frontendReady ->
detectVCRedist', error)`) so a synchronous throw cannot skip the `initQueue` scheduling that
precedes it, and it reuses `frontendReadyBootWorkDone` so a renderer reload cannot re-spawn
powershell.

**Bound + value justification (D3/D4):** the probe's `spawn()` now carries
`{ timeout: VC_REDIST_PROBE_TIMEOUT_MS, windowsHide: true }`. `VC_REDIST_PROBE_TIMEOUT_MS =
15_000` — >= 3x the worst measured wall time below (409ms; 3x = ~1.2s, well under both the rule's
floor and its 30_000ms ceiling), keeping headroom for a slower/loaded machine. The close handler
was made signal-safe (D5): a timeout kill closes with `code === null` and a signal set, which the
old `if (code)` guard would treat as falsy/success and wrongly show the "not installed" dialog —
a false nag caused purely by the bound. `-NoProfile -NonInteractive` (D6) was prepended to the
argv so a user's powershell profile script cannot add latency or hang the probe.

**Mutation table (all measured red, then restored green):**

| ID | Mutation | Test | Result |
|----|----------|------|--------|
| M1 | Removed the `detectVCRedist()` call site in `appShellFlowRegistration.ts` | `260922-v2e: detectVCRedist wiring` (2 tests) | RED: both wiring tests failed (`Expected number of calls: 1, Received: 0`) |
| M2 | Removed `timeout: VC_REDIST_PROBE_TIMEOUT_MS` from the spawn options in `utils.ts` | bound test (`spawns powershell.exe with -NoProfile/-NonInteractive...`) | RED: `toMatchObject` failed, `timeout` key missing from the options object |
| M3 | Reverted the close guard to `if (code)` (removed the `signal` branch) | timeout-kill test (`a timeout kill (close with code null + a signal)...`) | RED: `showDialogBoxModalAuto` was called once — exactly the false-nag D5 exists to prevent |

Each mutation was restored immediately after being measured; `git diff` after restoration matched
the intended (pre-mutation) change only, confirmed by re-running the full pair of suites green
(52/52) before the fix commit.

**Probe measurement (Step A, read-only HKLM query — reads no HOME/APPDATA profile, so the
two-profile rule does not apply):** ran the exact final argv (`-NoProfile -NonInteractive
Get-ItemProperty ... | Select-Object DisplayName | Format-Table -AutoSize`) via
`child_process.spawn` 3 times from a scratchpad script:

| run | code | signal | elapsed ms | count |
|-----|------|--------|-----------|-------|
| 1 (cold) | 0 | null | 409 | 6 |
| 2 (warm) | 0 | null | 375 | 6 |
| 3 (warm) | 0 | null | 374 | 6 |

Count 6 >= 4, so no dialog is expected on this box, and `VC_REDIST_PROBE_TIMEOUT_MS = 15_000`
satisfies D4's rule against the worst (409ms) measurement — no adjustment needed.

Full `DisplayName` list matching `Visual C\+\+` on this box (6 "Microsoft Visual C++ 2022"
matches, plus 2 non-matching "v14" parent entries and several older-version entries):

```
Microsoft Visual C++ 2013 Redistributable (x64) - 12.0.30501
Microsoft Visual C++ v14 Redistributable (x64) - 14.51.36247
Microsoft Visual C++ 2013 x86 Minimum Runtime - 12.0.21005
Microsoft Visual C++ 2012 Redistributable (x86) - 11.0.61030
Microsoft Visual C++ 2022 X86 Minimum Runtime - 14.51.36247
Microsoft Visual C++ 2022 X86 Additional Runtime - 14.51.36247
Microsoft Visual C++ v14 Redistributable (x86) - 14.51.36247
Microsoft Visual C++ 2012 x86 Additional Runtime - 11.0.61030
Microsoft Visual C++ 2022 X86 Debug Runtime - 14.44.35211
Microsoft Visual C++ 2012 x86 Minimum Runtime - 11.0.61030
Microsoft Visual C++ 2012 Redistributable (x64) - 11.0.61030
Microsoft Visual C++ 2010  x86 Redistributable - 10.0.40219
Microsoft Visual C++ 2013 Redistributable (x86) - 12.0.30501
Microsoft Visual C++ 2013 x86 Additional Runtime - 12.0.21005
Microsoft Visual C++ 2010  x64 Redistributable - 10.0.40219
Microsoft Visual C++ 2012 x64 Additional Runtime - 11.0.61030
Microsoft Visual C++ 2022 X64 Additional Runtime - 14.51.36247
Microsoft Visual C++ 2013 x64 Additional Runtime - 12.0.21005
Microsoft Visual C++ 2022 X64 Minimum Runtime - 14.51.36247
Microsoft Visual C++ 2013 x64 Minimum Runtime - 12.0.21005
Microsoft Visual C++ 2012 x64 Minimum Runtime - 11.0.61030
Microsoft Visual C++ 2022 X64 Debug Runtime - 14.44.35211
```

**Operator flag #1 (naming risk, NOT acted on):** the parent redistributable entry on this box now
reads `Microsoft Visual C++ v14 Redistributable (x64|x86) - 14.51.36247`, not "...2022...". The
6 individual Minimum/Additional/Debug entries the matcher actually counts still carry the literal
"2022" substring today, so the count-of-6 (>= 4) held and the matcher's current substring check is
unaffected. But if Microsoft ever renames the Minimum/Additional entries the same way it already
renamed the parent bundle entry, `detectVCRedist`'s `.includes('Microsoft Visual C++ 2022')` check
would stop matching them and would nag every Windows user who actually has the runtime installed.
Recorded per the plan's decision rule; the matcher itself was deliberately NOT changed in this
task.

**Live-run evidence (Step B):** `pnpm tauri:dev` was run against the operator's REAL profile
(deliberate — the check fires only on a real renderer's `frontendReady`; this is the plan's named
real-profile arm). First attempt crashed before reaching `frontendReady` with an unrelated
environment race — vite's `beforeDevCommand` watcher hit `EBUSY: resource busy or locked, watch
'...target\debug\deps\gamelib_shell.exe'` while cargo was still writing that file (`node:internal
/fs/watchers`, `ELIFECYCLE` exit 1). No repo files, registry, or config were touched; the crashed
process tree exited fully on its own (confirmed via `tasklist`, no leftover `gamelib-shell.exe`/
`node.exe`/`cargo.exe`). Second attempt succeeded. Matching lines captured from
`%LOCALAPPDATA%\GameLib\logs\gamelib.log` (only these two lines copied here; the rest of the
capture and the raw scratchpad output file were deleted after use, per the real-profile capture
policy):

```
(22:51:41) [INFO]:    [Backend]:         Frontend Ready
(22:51:42) [INFO]:    [Backend]:         VCRuntime is installed (6 matching entries, probe 549 ms)
```

The `VCRuntime is installed (` line's count (6) and probe time (549ms, within the 15s bound) match
the Step A registry measurement. The dev app was then stopped by walking the full process tree
from the top-level `pnpm tauri:dev` node process down through `cargo` -> `gamelib-shell.exe` ->
the sidecar `node` process and the `vite` dev-server node process (`taskkill /PID <pid> /T /F`);
`tasklist` afterward confirmed zero `gamelib-shell.exe`, `cargo.exe`, `rustup.exe`, or sidecar/vite
`node.exe` processes remained.

**Dialog branch NOT live-proven, unit-tested only (T-v2e-06, accepted/forbidden):** this box has
the runtime installed (count 6 >= 4), so the "not installed" in-app dialog branch could not be
observed live. Per the plan and threat model, nothing was uninstalled, no registry key was edited,
and `skipVcRuntime` was not set to force it — that branch's only evidence is the mutation-tested
`detectVCRedistDialog.test.ts` suite (both the pre-existing 260919-sch tests and this task's new
bounded-probe tests).

**Obsolescence evidence (Step C, recorded, not acted on):** `gamelib-shell.exe`
(`src-tauri/target/debug/gamelib-shell.exe`) imports both `VCRUNTIME140.dll` and
`VCRUNTIME140_1.dll` (confirmed via a case-insensitive binary grep). The sidecar binary
(`src-tauri/binaries/gamelib-sidecar-x86_64-pc-windows-msvc.exe`, a Node SEA build) shows 0
matches for `vcruntime140`. No `.cargo/config.toml` exists anywhere in the repo, so `crt-static`
is not set. **Operator flag #2:** the check's original purpose (Heroic #1583) is games that need
the runtime, not the launcher itself — but since the Tauri shell binary itself dynamically links
VCRUNTIME140.dll, a machine lacking every 14.x VC++ runtime cannot start GameLib at all. The
in-app prompt can therefore only ever reach a user who has an OLDER 14.x runtime installed
(enough to run the shell) but is missing the specific 2022 Minimum/Additional entries the matcher
counts. Recorded per the plan; the check was not removed or changed.

**`pnpm smoke:sidecar` (Step D, named real-profile arm):** FAILED, ~0.45s wall time, both attempts.
Root cause confirmed unrelated to this change: `meta/sidecarStartupSmoke.cjs` calls
`spawnSync('pnpm', ['build:sidecar'], { cwd: REPO_ROOT, encoding: 'utf-8' })` with no `shell: true`
and no `.cmd` extension; on this Windows box that resolves to `spawnSync pnpm ENOENT` (confirmed
directly: `spawnSync('pnpm', ['--version'], ...)` reproduces the identical `ENOENT` outside the
smoke script), because `pnpm` is a shell shim on Windows and `spawnSync` without shell resolution
cannot locate it. Running `pnpm build:sidecar` directly (outside the smoke script) succeeds in
48ms. This is a pre-existing Windows-portability gap in the smoke script itself, out of this
task's scope — recorded per the plan's Step D instruction ("record and do not chase"), not fixed.

**Two-profile rule:** Step A/Step C are read-only registry/binary inspection — no HOME/APPDATA/XDG
profile touched, so the rule does not apply to them. Step B is the plan's own named, deliberate
real-profile arm (`pnpm tauri:dev` against the operator's actual GameLib profile) — required
because the check only fires from a real renderer's `frontendReady`; both scratchpad capture files
were deleted after the matching lines above were copied out, and nothing from the scratchpad was
staged.

**Operator flags (surfaced, not acted on):**
1. The `Microsoft Visual C++ v14 Redistributable` parent-entry rename is a latent naming risk for
   the `.includes('Microsoft Visual C++ 2022')` heuristic if the Minimum/Additional/Debug entries
   are ever renamed the same way.
2. The Tauri shell's own `VCRUNTIME140.dll`/`VCRUNTIME140_1.dll` dependency means the in-app
   prompt can only reach a narrower population than "any Windows user missing the runtime" — a
   user missing it entirely cannot launch GameLib to see the prompt at all.

**Decision rule applied:** CLOSE iff call wired (commit `907c08886`), M1-M3 all measured red then
restored green, Step A count >= 4, and Step B observed the `VCRuntime is installed (` line after
`Frontend Ready` in a live run. All four held, so this todo is closed.
