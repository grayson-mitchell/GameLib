---
created: 2026-10-05T00:00:00.000Z
title: "Windows desktop/Start Menu shortcuts are never written — shell.writeShortcutLink is a stub returning false, yet the UI reports success"
area: shortcuts
severity: major
platform: windows
ready: live-gate
found_by: "Code review of phase 34.5 (non-Steam runners, Wine and shortcuts), 2026-10-05"
files:
  - src/backend/platform/index.ts:637-641
  - src/backend/shortcuts/shortcuts/shortcuts.ts:106
  - src/backend/shortcuts/shortcuts/shortcuts.ts:110
  - src/backend/sidecar/shortcutsFlowRegistration.ts:226-240
---

## Problem

The sidecar's `shell.writeShortcutLink` returns `false` unconditionally. Its comment says it is
"never reachable on the platforms the sidecar runs", but Windows ships as an NSIS build
(`tauri.conf.json`), and `shortcuts.ts:106,110` call it there.

## Failure scenario

A Windows user clicks "Add shortcut": no `.lnk` is written, the toast says "Shortcuts were created
on Desktop and Start Menu", and `GameSubMenu` flips to "Remove shortcuts". Auto-shortcuts on install
are dead too.

## Suggested fix

Implement `.lnk` writing (a Rust command, or PowerShell `WScript.Shell` via argv, no shell string),
and until then make `addShortcuts` report failure so no success toast is sent. Live verification
needs a Windows machine.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.

## Progress (2026-10-05)

**The code side is done. Kept pending because it needs a live run on Windows**
(`ready: live-gate`; `platform: windows` is unchanged). No PowerShell was run anywhere in this
work.

**Change.**
- New module `src/backend/shortcuts/shortcuts/windowsShortcut.ts`. It spawns
  `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -` with no shell
  and `windowsHide`, then writes a constant `WScript.Shell` script to stdin. That script has one
  statement per line, because `-Command -` parses stdin line by line.
- Every value (`.lnk` path, target, arguments, icon, icon index) reaches the script only as
  `$env:GAMELIB_LNK_*`. A title containing quotes, `$(...)`, backticks or CJK therefore needs no
  escaping, and Windows hands the environment to the child as UTF-16.
- A `gamelib://` URL target becomes `%SystemRoot%\explorer.exe` with the URL as its argument, the
  counterpart of the Linux entry's `xdg-open`.
- Success requires exit 0 and the `.lnk` existing afterwards. A 30s bound kills a hung child; its
  timer is `unref()`'d, per the sidecar exit contract.
- `shortcuts.ts`'s win32 branch now awaits this writer instead of the `shell.writeShortcutLink`
  stub, and `addShortcuts` rejects if any requested shortcut failed. The sidecar `addShortcut`
  channel shows `box.shortcuts.error` instead of the success toast. Install-time auto-shortcuts,
  whose callers do not await, now surface as a logged warning through the sidecar's
  unhandled-rejection guard rather than silence.
- The stub's comment in `platform/index.ts` was corrected: the sidecar does run on Windows.

**RED** (unchanged product code), `shortcuts/__tests__/addShortcutsOutcome.test.ts`, win32 arm:
- "rejects when PowerShell fails": the promise resolved instead of rejecting.
- "writes ... through PowerShell": 0 spawn calls, 2 expected.

**GREEN.**
- That suite passes 4/4.
- `windowsShortcut.test.ts` passes 10/10. It covers:
  - the fixed argv, with no hostile value in it;
  - the constant script on stdin;
  - a hostile non-ASCII path passed verbatim through env;
  - URL to explorer.exe, and a drive letter that is not mistaken for a URL;
  - a non-zero exit with its stderr;
  - exit 0 without a `.lnk` reported as failure;
  - a spawn error;
  - the timeout kill.
- `pnpm codecheck` exits 0. eslint on the new files: 0 problems. `prettier --check` passes.

**What remains: a live Windows check.**
1. "Add shortcut" writes `.lnk` files on the Desktop and in Start Menu\Programs, with no console
   window flashing.
2. Double-clicking one launches the game through `gamelib://`, via explorer.exe and the registered
   protocol.
3. The icon shows.
4. A game title with an apostrophe and non-ASCII characters works.
5. With Desktop redirected to OneDrive, the `.lnk` lands in the redirected folder (see the
   completed sibling todo `2026-10-05-desktop-and-documents-paths-ignore-real-user-folders.md`).
6. A forced failure, such as a read-only Desktop, shows the failure toast.

Also not done: `GameSubMenu` still flips to "Remove shortcuts" optimistically after the click,
because the channel is send-kind with no reply, until it remounts and re-reads `shortcutsExists`.

## Live gate (2026-10-12, quick 261012-9aa)

**Method.** Code under test: `14745f7fa`. A throwaway, gitignored entry in `scratchpad/`, compiled by
`meta/runTs.cjs`, imports the real `writeWindowsShortcut`, `pathShim.getPath` and
`readWindowsShellFolder`. It never builds its own `.lnk`-writing PowerShell; read-back is a separate
read-only `WScript.Shell` script that opens the finished `.lnk` and writes nothing. The isolated arm
ran twice, back to back, under `createFakeHomeProfile()` and wrote only inside the fake profile (the
real Desktop and Start Menu were snapshotted before and after: nothing gained; the profile was
disposed). The named real-profile arm ran once: the OneDrive-redirected Desktop and the real Start
Menu Programs folder exist only in the operator's populated profile, and `readWindowsShellFolder`
reads the real HKCU registry, which no fake HOME redirects. It wrote throwaway
`GameLib-live-gate-*` shortcuts, read them back and deleted them; an independent scan afterwards
found nothing left in either folder. The script has been deleted. Rerunning means re-creating it
from `.planning/quick/261012-9aa-run-the-live-windows-gate-for-the-pendin/261012-9aa-PLAN.md`.

**One line per remaining check.**
1. **FAIL for a CJK title, PASS otherwise.** Desktop and Start Menu `.lnk` files were written for
   `GameLib-live-gate-Baldur's Gate — ñ` (R1Da 267 ms, R1Ma 325 ms; both read back and removed).
   The same title with `幻想` added returned `{ ok: false }` in both folders (R1D 308 ms, R1M
   269 ms; nothing written). Console flash: `windowsHide: true` is present (R3, line 94); whether a
   window flashes is operator-only and not claimed.
2. **PASS as a substitute; NOT exercised.** Double-clicking a shortcut to launch a game was NOT done.
   Substitute: TargetPath reads back as `%SystemRoot%\explorer.exe` with the `gamelib://launch?...`
   URL as Arguments (I1, I2-adjacent D1 to D3, R1Da, R1Ma). `gamelib` is registered in HKCU
   and HKCR (URL Protocol present); the open command points at
   `%USERPROFILE%\AppData\Local\GameLib\gamelib-shell.exe`, which exists on disk.
3. **PASS for an ANSI icon path, FAIL for a CJK one.** With `notepad.exe` as the icon, IconLocation
   reads back as `<icon>,0` and the icon is extractable (R1Da, R1Ma, D1). With the icon inside
   `Install Dir ñ 幻想\`, IconLocation reads back as `...\Install Dir ñ ??\game.exe,0` (I1, D5,
   reproduced in both isolated runs); the bytes on disk contain no UTF-16 `幻想`, so the icon path
   is lost when written, not just when read. Explorer rendering is operator-only.
4. **FAIL.** `Baldur's Gate — ñ` round-trips byte-exact (NFC) on disk and through `WScript.Shell`
   (R1Da, R1Ma; `ñ` and the em dash alone also pass, D2 and D3), and the hostile
   ``Gate $(Get-Date) `t end`` title is data, with its exact filename on disk (I3). But
   `Baldur's Gate — 幻想 ñ` returned `{ ok: false }` (I2, R1D, R1M), as does any title with `幻想`
   (D4); `sanitize` is the identity on all of them. The same lossy conversion affects a non-URL
   target inside a CJK directory (I4: `Value does not fall within the expected range.`; the same
   target in an `ñ` directory is fine, D7) and a CJK character in the arguments (D8: stored as
   `??`).
   Measured cause: this machine's ANSI code page is 1252, and `WScript.Shell`'s
   `CreateShortcut`/`TargetPath`/`IconLocation`/`Arguments` go through it. The module header's claim
   that Unicode survives because the environment is UTF-16 holds up to the COM boundary and no
   further.
5. **PASS.** The Desktop is OneDrive-redirected (`%OneDrive%\Desktop`). `getPath('desktop')` equals
   `[Environment]::GetFolderPath('Desktop')`, `readWindowsShellFolder('Desktop')` answered from the
   registry (the raw HKCU `User Shell Folders` value is `%OneDrive%\Desktop`, not the `homedir()`
   fallback), and the `.lnk` landed in that folder (R0, R1Da). The Start Menu path matched
   `GetFolderPath('Programs')`.
6. **PASS for the failure result; toast rendering operator-only.** A nonexistent parent directory
   (F1) and a directory with a deny-write ACE (F2) each returned `{ ok: false }` with `powershell
   exited 1: Unable to save shortcut ...` and no file (ACE removed, exit 0). F3, a folder with the
   read-only attribute, still wrote the `.lnk` (INFO): the Properties > Read-only checkbox is NOT a
   way to force the failure toast. Scoped jest, run locally: `addShortcutsOutcome` 4/4 (including
   "rejects when PowerShell fails to write the .lnk"); `shortcutsFlows` 30 passed, 1 failed (the
   containment test, which assumes a Desktop under the fake home and so cannot hold on a
   OneDrive-redirected one) and 4 skipped, with the `box.shortcuts.error` toast assertion
   (`shortcutsFlows.test.ts:407`) among the passes; `windowsShortcut` 9/10 (the failure creates a
   file whose name contains `"`, which Windows forbids: a test artifact on this OS, not the module).

**Not closed:** check 4 FAIL (a title containing characters outside the ANSI code page, such as
`幻想`, is never written: `{ ok: false }`, so the user sees the failure toast and gets no shortcut),
and check 3 FAIL for an icon path outside the ANSI code page (the shortcut is written with a mangled
icon). Both reproduced on two consecutive runs and trace to `WScript.Shell`'s ANSI conversion in
`windowsShortcut.ts`. Triage hint for the operator to decide: `ready: code` once a fix approach is
picked (a non-`WScript.Shell` writer such as `IShellLink` through .NET/Rust, or an ASCII short-name
temp file plus a Unicode move and a Unicode icon path); the frontmatter is left as is. Checks 1
(ANSI titles), 2, 5 and the failure result of 6 pass. Residual operator-only observations: console
flash, icon in Explorer, real double-click launch, toast render.

The `GameSubMenu` optimistic flip to "Remove shortcuts" (send-kind `addShortcut` channel, no reply,
corrected only on remount via `shortcutsExists`) is still open and outside this gate. NO pending
todo carries it, so it must be filed separately to stay visible in triage.
