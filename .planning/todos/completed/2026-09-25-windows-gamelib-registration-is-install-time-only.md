---
created: 2026-09-25
title: "Windows gamelib:// registration is install-time only — any other app claiming the scheme steals deep links until reinstall"
found_during: plan 46-07 (Windows live-gate re-run, operator-requested deviation)
severity: medium
platform: windows
ready: human
area: src-tauri/shell
files:
  - src-tauri/src/main.rs
  - src-tauri/tauri.conf.json
---

# Windows gamelib:// registration is install-time only

## Evidence

Observed live during plan 46-07's Check 3b/Check 5 (`46-LIVE-GATE-RERUN.md`, 2026-09-25). A
leftover, machine-wide Electron-era GameLib install (`C:\Program Files\GameLib\GameLib.exe`,
sharing the current Tauri build's Start-menu shortcut display name) was launched by mistake during
Check 3b. Launching it re-registered `HKCU\Software\Classes\gamelib\shell\open\command` at runtime
to point at its own exe. The operator then uninstalled that Electron app, which deleted the exe
without restoring the previous registry value — leaving `gamelib://` dangling. Check 5's first ping
attempt failed as a direct result: `Start-Process : This command cannot be run due to the error:
Application not found.` The orchestrating agent had to manually restore the HKCU value via
`Set-ItemProperty` before the re-gate could continue.

## Mechanism

Phase 46 decision point (a) (`.planning/REQUIREMENTS.md` §"Phase 46 Requirements", "Open decision
points") deliberately keeps the runtime `register_all()` call Linux-only on this build: "The NSIS
installer alone registers `gamelib://`... This is pinned by the existing Linux-only
`cfgGuardAboveRegisterAll` gate." That decision is explicitly operator-overridable ("To override,
widen the `#[cfg]` to `any(target_os = "linux", windows)`").

Because Windows has no runtime self-assertion of the registry value, the registration is a
write-once artifact of install time only. ANY other application that calls
`RegSetValue`/`WriteRegStr` (or is itself another NSIS/Electron installer) against
`Software\Classes\gamelib` — whether at its own install time or, as observed here, at its own
runtime launch — silently steals the `gamelib://` scheme. GameLib has no way to detect or recover
from this short of a full reinstall or an explicit registry repair. This is exactly the class of
key collision the phase 46 todo's own "Addendum 2026-09-22" already flagged as a pre-existing
artifact (the leftover Electron-era key), but this instance is worse: it happened DURING this
project's own re-gate session, from an app that itself no longer exists after being uninstalled,
leaving a dangling pointer rather than merely a stale-but-valid one.

## Options

- Re-assert the HKCU registration at GameLib startup when it is found pointing elsewhere (a
  bounded, narrowly-scoped widening of decision point (a) — self-heal on launch, not a full runtime
  `register_all()` widening).
- Detect a dangling/mismatched `gamelib://` handler at startup and warn the user rather than
  silently failing the next external open.
- Leave as-is and accept the risk, documenting it as a known Windows platform limitation (decision
  point (a)'s cost was already accepted for the "install-time only" trade generally; this would be
  a decision to also accept the collision risk specifically).

This needs an operator decision on which mitigation (if any) is worth the added complexity — filed
`ready: human` rather than `ready: code` for that reason.

## Verification (once decided/fixed)

A live Windows session in which: (1) a second application (or a stale/uninstalled remnant)
overwrites `HKCU\Software\Classes\gamelib\shell\open\command`, and (2) GameLib's next external
`gamelib://` open still reaches the running instance — either because GameLib repaired the key on
launch, or because the user was warned and repaired it themselves, per whichever option is chosen.

## Resolution

Closed 2026-09-25 by quick task **260925-uok**
(`.planning/quick/260925-uok-windows-gamelib-self-heal-on-launch/`).

**Option 1 — self-heal on launch — was chosen by operator decision.** Options 2 (detect and
warn only) and 3 (accept the risk and document it as a platform limitation) were rejected.

**Rationale.** Option 2 still leaves the user to hand-edit the registry, which is exactly what
happened on 2026-09-25: a human had to run `Set-ItemProperty` before the re-gate could continue,
and no ordinary user will do that. Option 3 was already shown insufficient by the incident itself
— the failure occurred during this project's OWN re-gate session, and it left a **dangling**
pointer (the hijacking exe had been uninstalled) rather than a merely stale-but-valid one, so
there was no working handler to fall back to at all.

**What shipped.**

- Six pure, host-independent decision helpers in `src-tauri/src/main.rs`
  (`gamelib_protocol_command_exe`, `gamelib_protocol_paths_equivalent`,
  `gamelib_protocol_repair_needed`, `gamelib_protocol_open_command`,
  `gamelib_protocol_default_value`, `gamelib_protocol_default_icon`), with 7 `cargo test` cases
  including the round trip proving the repair's own output satisfies its own detector.
- `#[cfg(windows)] fn repair_windows_gamelib_protocol_registration(identifier: &str)` — the FFI
  half: a `CI=e2e` short-circuit before the first registry call, an HKCU read of
  `Software\Classes\gamelib\shell\open\command`, and, only when repair is needed, a write of all
  four installer-shaped values. Fail-open throughout; the stored command value is never logged
  verbatim.
- Its call site in `.setup()`, `#[cfg(windows)]`-gated, placed AFTER the
  `#[cfg(target_os = "linux")]` `register_all()` block so the REQ-46-06 pin is untouched.
- One new `windows-sys` cargo feature, `Win32_System_Registry`. No new crate name in
  `Cargo.lock`.
- Four RED-proofed source gates in `src/backend/__tests__/tauriShellSource.test.ts` (new describe
  `quick-260925-uok Windows gamelib:// HKCU self-heal on launch`).
- Three prose corrections — `main.rs`'s decision-point (a) block, this test file's header item 3
  plus its REQ-46-06 note, and `.planning/REQUIREMENTS.md`'s decision point (a) and REQ-46-06
  body — all of which previously told the superseded "install-time only, no runtime
  self-assertion" story.

**Why this is narrower than widening `register_all()`.** `register_all()` is the deep-link
plugin's whole-scheme registration for every configured scheme through the platform's own
mechanism; the self-heal is a single HKCU subtree read, a comparison, and a conditional write of
the four values the NSIS template already writes — no plugin surface, no new scheme, and nothing
at all on macOS or Linux.

### NOT DONE — what remains unverified

**The live Windows gate described in the "Verification (once decided/fixed)" section above has
NOT been run.** Nothing in this work has observed a real registry read, a real registry write, or
a real `gamelib://` open. The work was entirely desk-side: `cargo test --bin gamelib-shell`
(234 → 241 passed, 0 failed, 2 ignored), `cargo check --bin gamelib-shell`, jest source gates,
`pnpm codecheck` and `pnpm planning-gates`.

The Rust unit tests cover only the **pure decision helpers**. The `#[cfg(windows)]` FFI function
itself is **exercised by nothing** — it is compiled by the Windows CI leg and executed by no test.
That follows the `acquire_single_instance` precedent stated at the FFI-tier banner in `main.rs`
("these functions are not unit-tested ... exercised by the live gate, REQ-46-10, not
`cargo test`"), but the consequence must be stated plainly: **do not read this todo's presence in
`completed/` as evidence that the repair works on a real machine.**

The executing agent was also explicitly forbidden from launching the app or mutating
`HKCU\Software\Classes\gamelib` during this task, because the operator's machine currently holds
a hand-restored value from the 2026-09-25 session.

**Live-gate steps a future operator should run, on a real Windows machine:**

1. Install GameLib via the NSIS installer and confirm
   `Get-ItemProperty 'HKCU:\Software\Classes\gamelib\shell\open\command'` names the installed
   `gamelib-shell.exe`.
2. With GameLib **not** running, hijack the key from a second application (or simulate it):
   `Set-ItemProperty 'HKCU:\Software\Classes\gamelib\shell\open\command' -Name '(Default)' -Value '"C:\Does\Not\Exist\thief.exe" "%1"'`.
3. Launch GameLib normally. Re-read the key: it must now name the running `gamelib-shell.exe`
   again, and `%LOCALAPPDATA%`'s `gamelib-shell.log` must carry one
   `repaired the gamelib:// HKCU registration (prior value: points-elsewhere) -- 4/4 ...` line.
4. With GameLib still running, open an external deep link
   (`Start-Process 'gamelib://library'` from another shell) and confirm it reaches the RUNNING
   instance rather than starting a second one.
5. Restart GameLib and confirm the log gains **no** new repair line — the anti-churn case: a key
   already pointing at the running exe must produce no registry write at all.
6. Also confirm the delete case: remove the whole `HKCU\Software\Classes\gamelib` subtree, launch,
   and check all four values (`URL Protocol`, the root default `URL:com.gamelib.shell protocol`,
   `DefaultIcon`, and `shell\open\command`) are recreated.

### Frontmatter note

The `platform: windows` / `ready: human` frontmatter above is now moot — the operator decision
this todo was filed to obtain has been made, and the code work is done. The block is left
otherwise as-is: `.planning/todos/todo-frontmatter-gate.py` scopes to `pending/` only, so moving
the file removes it from that gate's census rather than subjecting it to a new one, and no
frontmatter change is required by the move. (`platform: windows` does remain accurate for the
one thing still outstanding — the live gate above.)

### Live gate run (2026-09-26)

The live-gate steps above were run on the operator's Windows 11 machine against a debug NSIS build
of `c3cc2ef44`. **PASS**:

- A correct key produced no repair (anti-churn).
- A hijacked key was repaired on launch: `repaired the gamelib:// HKCU registration (prior value:
  points-elsewhere) -- 4/4 ...`.
- A deleted subtree was recreated with all four values: `(prior value: absent) -- 4/4 ...`.
- A deep link was delivered after each repair.

The full record is in
`.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-POSTFIX-LIVE-CHECK.md`.

Two corrections to step 3 and to what it implies:

- The `repaired ...` line reached the console only. On a normal Windows launch `HOME` is unset, so
  `shell_diag` writes no `gamelib-shell.log`.
- A `pnpm tauri:dev` run also triggers the repair and re-points `gamelib://` at
  `src-tauri\target\debug\gamelib-shell.exe`. This was observed live before the gate.
