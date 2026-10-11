---
phase: quick-261012-9aa
plan: 01
subsystem: shortcuts
tags: [windows, shortcuts, live-gate, wscript-shell, onedrive]
status: incomplete
requirements: [QUICK-261012-9aa]
key-files:
  created: []
  modified:
    - .planning/todos/pending/2026-10-05-windows-desktop-and-start-menu-shortcuts-are-never-written.md
decisions:
  - "Todo kept pending: check 4 (and the icon half of check 3) FAIL for characters outside the Windows ANSI code page (1252 on this box); reproduced on two consecutive isolated runs and once in the real-profile arm."
metrics:
  actuals:
    tokens: 24000
    tasks: 3
    commits: 1
plan_head_before: 1ab283c76192c07dc630d5d8059d2a8877206766
plan_head_after: f76382f6cc8248bb6576268a5a05fde9309f1c40
commits: 1
completed: 2026-10-12
---

# Phase quick-261012-9aa Plan 01: Live Windows gate for the pending shortcuts todo Summary

The live gate ran against the real `writeWindowsShortcut` (code under test `14745f7fa`). It found a product defect: `WScript.Shell` converts titles, target paths, icon paths and arguments through the ANSI code page (1252 here), so anything outside it (CJK) is rejected or mangled. The todo stays in `pending/` with the gate recorded. Commit `f76382f6c` touches only the todo.

## Outcome per todo check

| # | Check | Outcome |
| - | ----- | ------- |
| 1 | Add shortcut writes `.lnk` on Desktop and Start Menu, no console flash | PASS for `Baldur's Gate — ñ` (R1Da 267 ms, R1Ma 325 ms). FAIL for the plan's title with `幻想` (R1D 308 ms, R1M 269 ms, both `{ ok: false }`, nothing written). Console flash: `windowsHide: true` present at line 94 (R3); the visual is operator-only, not claimed. |
| 2 | Double-click launches via `gamelib://` | NOT exercised. Substitute PASS: TargetPath `%SystemRoot%\explorer.exe` + URL as Arguments (I1, D1-D3, R1Da, R1Ma); `gamelib` registered in HKCU and HKCR with URL Protocol; open command is `%USERPROFILE%\AppData\Local\GameLib\gamelib-shell.exe`, which exists. |
| 3 | Icon shows | PASS for an ANSI path (`notepad.exe,0`, extractable: R1Da, R1Ma, D1). FAIL for an icon path with CJK: reads back `...\Install Dir ñ ??\game.exe,0` (I1, D5, both isolated runs); the bytes on disk contain no UTF-16 `幻想`, so the write is lossy. Explorer rendering operator-only. |
| 4 | Apostrophe + non-ASCII title | FAIL. `Baldur's Gate — ñ` round-trips NFC byte-exact; `ñ` alone (D2) and em dash alone (D3) pass; hostile `$(Get-Date)`/backtick title is data with its exact filename (I3 PASS). But `Baldur's Gate — 幻想 ñ` and any title with `幻想` returns `{ ok: false }` (I2, D4, R1D, R1M). Non-URL target in a CJK directory fails (I4, `Value does not fall within the expected range.`; `ñ` directory fine, D7). CJK in arguments is stored as `??` (D8). `sanitize` was the identity throughout. |
| 5 | OneDrive-redirected Desktop | PASS. Desktop is `%OneDrive%\Desktop`; `getPath('desktop')` equals `[Environment]::GetFolderPath('Desktop')`; the registry answered (raw HKCU `User Shell Folders` Desktop value is `%OneDrive%\Desktop`, a `REG_EXPAND_SZ`, not the `homedir()` fallback); the `.lnk` landed there (R0, R1Da). Start Menu path matched `GetFolderPath('Programs')` (`%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs`). |
| 6 | Forced failure shows failure toast | PASS for the failure result: F1 (missing parent) and F2 (deny-write ACE, removed again, exit 0) return `{ ok: false }` with `powershell exited 1: Unable to save shortcut ...`, no file. F3 (folder read-only attribute) still wrote the `.lnk` (INFO). Toast rendering operator-only. |

Corrections to the plan's assumptions: the plan said the Desktop registry value was an absolute OneDrive path; it is `%OneDrive%\Desktop` (an expandable value). It resolves to the same OneDrive folder and the gate handled it as designed.

## Harness results

Isolated arm (fake profile `gamelib-fakehome-9aa-*`, child guard passed, profile disposed, H1 PASS: no entry gained in the real Desktop or Start Menu). Run 1 and run 2 were identical in outcome:

| ID | Outcome | ms (run 2) | Notes |
| -- | ------- | ---------- | ----- |
| I1 | FAIL | 488 (run 1: 703) | write ok; Target and Arguments correct; IconLocation `...Install Dir ñ ??\game.exe,0` |
| I2 | FAIL | 467 | `{ ok: false }`, `Unable to save shortcut` |
| I3 | PASS | 481 | exact filename on disk |
| I4 | FAIL | 467 | `Value does not fall within the expected range.` (target in CJK dir) |
| F1 | PASS | 478 | `{ ok: false }`, no file |
| F2 | PASS | 466 | `{ ok: false }`, no file, ACE removed (exit 0) |
| F3 | INFO | 477 | `{ ok: true }`, file written |
| D1 | INFO | 517 | apostrophe title OK |
| D2 | INFO | 480 | `ñ` title OK |
| D3 | INFO | 469 | em dash title OK |
| D4 | INFO | 478 | `幻想` title `{ ok: false }` |
| D5 | INFO | 484 | ASCII title, CJK icon dir: write ok, IconLocation `??`, no UTF-16 CJK in the file |
| D6 | INFO | 500 | ASCII non-URL target OK |
| D7 | INFO | 516 | `ñ` non-URL target OK |
| D8 | INFO | 475 | CJK argument stored as `??` |
| D0 | INFO | | ANSI code page 1252 |
| H1 | PASS | | real folders untouched |

Real-profile arm (named half 2 of the two-profile rule): R0 PASS, R1Da PASS (267 ms), R1Ma PASS (325 ms), R1D FAIL (308 ms), R1M FAIL (269 ms), R2 INFO, R3 INFO. Each file written was read back and unlinked; the 3-second pause before deletion happened; an independent scan afterwards (and again after the script was removed) found 0 `GameLib-live-gate-*` entries in either folder. No pre-existing file was touched or overwritten. Desktop path: `%OneDrive%\Desktop` (OneDrive root redacted); Start Menu: `%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs`.

Scoped jest (never the full suite): `addShortcutsOutcome` 4/4 pass; `shortcutsFlows` 30 passed, 1 failed, 4 skipped; `windowsShortcut` 9 passed, 1 failed. Both failures are local-environment artifacts, not caused by this task (no product code changed): the `shortcutsFlows` containment test asserts a Desktop under the fake home, which a OneDrive-redirected Desktop cannot satisfy; the `windowsShortcut` spawn test creates a file whose name contains `"`, which Windows forbids. The toast mapping (`box.shortcuts.error`, `shortcutsFlows.test.ts:407`) passes.

## Deviations from Plan

1. **[Rule 1 - extra diagnostics]** Added INFO checks D0-D8 to the isolated child to separate which characters and fields the COM layer drops. They use the same real writer and write only inside the fake profile.
2. **[Rule 3 - extra real-arm variant]** Added R1Da/R1Ma using an ANSI-safe title (`Baldur's Gate — ñ`). Without them the plan's CJK title fails in both folders, so checks 1, 3 and 5 could not have been measured at all. Same `GameLib-live-gate-` prefix, same pre-flight, deletion and leftover scan.
3. **Commit trailer.** The task prompt asked for `Claude Fable 5.1`; the session's attribution reminder specifies `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, which is what the commit carries (the plan itself named a third model). Adjust if the orchestrator wants a different trailer.
4. A heredoc to create the gate script failed in the Bash tool, so the script was created with the Write tool instead. No effect on the result.

No auth gates. No product code under `src/` changed.

## Decision

KEEP PENDING (product FAIL). Frontmatter (`severity: major`, `platform: windows`, `ready: live-gate`) is byte-unchanged; `pnpm planning-gates` is 12/12. The todo's closing note suggests `ready: code` once a fix approach is chosen (a non-`WScript.Shell` writer such as `IShellLink` via .NET or Rust, or an ASCII short-name temp file plus a Unicode move); the operator decides.

## Recommendations

- File a separate pending todo for the `GameSubMenu` optimistic flip to "Remove shortcuts" (send-kind `addShortcut` channel, no reply, corrected only on remount via `shortcutsExists`). No pending todo carries it; the gate todo only mentions it in prose. Suggested frontmatter: `severity: medium`, `platform: any`, `ready: code`.
- File a separate todo (or reuse the pending one) for the ANSI-code-page defect, since it is a code fix, not a live-gate item. The current todo already holds the full measurements.
- Operator-only observations remain: console window flash, icon rendering in Explorer, a real double-click launch, failure toast rendering.

## Commits

- `f76382f6c`: docs(quick-261012-9aa): live Windows shortcut gate — not closed (only the todo path)

## Self-Check: PASSED

- Todo present in `pending/` with the `## Live gate (2026-10-12, quick 261012-9aa)` section: FOUND
- Commit `f76382f6c` exists; HEAD touches only the todo; the three pre-existing uncommitted files are as found.
- `scratchpad/261012-9aa-live-gate` removed; no `GameLib-live-gate-*` left in Desktop or Start Menu; no `gamelib-fakehome-9aa-*` or `gate9aa-*` temp dirs left.
