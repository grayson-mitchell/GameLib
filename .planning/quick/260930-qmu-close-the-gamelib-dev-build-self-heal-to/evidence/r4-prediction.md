# R4 pre-registered prediction (2026-09-30, before any hijack)

Written before any live registry write. Each check below is scored during the Live run and
recorded in `r4-live.txt`.

- **C1**: the hijack landed. The .NET readback and the `reg.exe query /ve` readback both show
  `"C:\gamelib-hijack-test\nope.exe" "%1"` as REG_SZ, before launch.
- **C2**: the launched process's ExecutablePath is the installed exe
  (`C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe`), and it is the only
  gamelib-shell.exe process running.
- **C3**: exactly one post-offset log line, pid-matched to the launched process, equal to the
  expected line: `<epoch> pid=<launched pid> repaired the gamelib:// HKCU registration (prior
  value: points-elsewhere) -- 4/4 installer-shaped values written under
  HKCU\Software\Classes\gamelib`.
- **C4**: the command value, read while the app is still running and BEFORE any harness restore,
  equals the pre-state byte-for-byte as REG_SZ
  (`"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"`).
- **C5**: the full `reg.exe query /s` snapshot equals the pre-state snapshot. All four values
  (`URL Protocol`, root `(Default)`, `DefaultIcon` `(Default)`, `shell\open\command` `(Default)`)
  are installer-shaped.
- **C6**: no post-offset log line contains the substring `gamelib-hijack-test`.
- **C7**: the app came up within 60 s. Either a gamelib-sidecar.exe whose ParentProcessId is the
  launched pid appears, or the main window handle becomes non-zero.
- **C8**: zero gamelib-shell.exe and gamelib-sidecar.exe processes after teardown.
- **INV**: after the finally block, the registry equals the pre-state.
- **PASS** means C1 through C8 and INV all PASS AND `restore_write_needed: no`.

## What FAIL would mean, per check

- C1 FAIL: the instrument's own hijack write did not take, or was not read back correctly by
  one of the two independent readback paths (.NET vs `reg.exe`). This would be an instrument
  defect, not a product finding, and the run should not proceed to launch.
- C2 FAIL: either the wrong exe was launched (a defect in the instrument's `Start-Process` call),
  or a second gamelib-shell.exe was already running (a precondition should have already caught
  this at P1, so this would indicate a race between P1 and launch).
- C3 FAIL: the product does NOT write the expected line to the log within the log-based channel.
  Given C4/C5, this could mean the repair happened (registry-only) but `shell_diag` did not reach
  the file — a genuine, narrower product finding (see "C4 PASS but C3 FAIL" triage in the plan).
  Given C4/C5 also FAIL, this means the repair did not run at all — the regression this check
  exists to catch: the quick-260926-f3l dev-build skip predicate incorrectly also skipped the
  installed-app repair path.
- C4 FAIL: the installed app did NOT repair the hijacked key at all. This is the core regression
  under test — the todo's step 2 would FAIL.
- C5 FAIL: the repair ran partially (e.g. wrote fewer than 4 of the 4 installer-shaped values),
  leaving the key in a third, divergent shape rather than either the hijacked value or a fully
  installer-shaped value.
- C6 FAIL: the hijack value leaked into the log — a log-discipline (T-UOK-01) violation. Since
  the message only logs a coarse classification, never the stored value, this should not be
  reachable by design; a FAIL here would be a real defect in `repair_windows_gamelib_protocol_registration`'s log discipline.
- C7 FAIL: the app did not come up (crashed, hung, or never signalled ready) within 60 s. This
  would make C3/C4/C5's timing suspect, since the repair runs synchronously in `.setup()` before
  the rest of startup completes.
- C8 FAIL: teardown left a gamelib-shell.exe or gamelib-sidecar.exe process running after the
  graceful/forceful taskkill sequence and the ExecutablePath-scoped sweep. This is a harness
  hygiene failure, not a product finding, but it is still recorded as a FAIL because it violates
  the operator's hard safety invariant.
- INV FAIL: after the finally block restores the registry, the key still does not match the
  pre-state byte-for-byte. This is the most serious possible outcome (exit code 3) — the harness's
  own safety net did not hold.
- `restore_write_needed: yes` on an otherwise-PASSING run: this would mean the harness had to
  write the registry back itself, which means the APP did not actually repair it (C4 must have
  already been FAIL in that case) — this is exactly what T-QMU-02 exists to prevent from being
  mistaken for a product PASS.

## Deliberate real-profile arm (CLAUDE.md two-profile rule, half 2), in my own words

This check runs against the operator's REAL Windows profile — real `HOME` and `USERPROFILE`, not
a fake-HOME sandbox — for three reasons:

1. **The state under test cannot be isolated.** The only thing this check mutates and scores is
   `HKCU\Software\Classes\gamelib`, the operator's own per-user registry hive keyed to their SID.
   None of the eight fake-HOME variables (`HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`,
   `XDG_*`) can redirect a registry hive — they redirect filesystem paths. A fake-HOME sandbox
   here would isolate the sidecar's store data and the diagnostic log, while leaving the actual
   value under test — the real registry key — completely unisolated. That would give the
   appearance of safety while providing none of it over the one thing that matters.
2. **Windows resolves its own known folders independently of these variables anyway.**
   quick-260930-o75 already measured that on Windows the Tauri shell resolves its folders through
   the platform's known-folder API, not through `HOME`/`APPDATA` overrides, so faking them would
   not even achieve the isolation it would appear to promise for the app's own storage.
3. **This IS what the todo and the operator's request ask to be verified.** The todo's step 2 and
   the operator's own request name the INSTALLED app, run as the operator runs it, as the subject
   under test — not a sandboxed stand-in for it.

Mitigations, applied throughout: no app stdout/stderr is ever captured (`Start-Process` runs with
no redirection); only log lines containing `gamelib:// HKCU` are ever copied into evidence; only
our own key's values, pids, paths and hashes enter any evidence file; the app runs for well under
90 seconds total before teardown.
