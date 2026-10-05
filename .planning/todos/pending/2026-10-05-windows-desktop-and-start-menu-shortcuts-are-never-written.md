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
