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
