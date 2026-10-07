---
created: 2026-10-05T00:00:00.000Z
title: "pathShim desktop/documents ignore user-dirs.dirs (Linux) and OneDrive redirection (Windows); shortcut write errors are swallowed"
area: shortcuts
severity: medium
platform: any
ready: code
found_by: "Code review of phase 34.5 (non-Steam runners, Wine and shortcuts), 2026-10-05"
files:
  - src/backend/sidecar/pathShim.ts:94-97
  - src/backend/sidecar/pathShim.ts:104-108
  - src/backend/shortcuts/shortcuts/shortcuts.ts:72-79
---

## Problem

Electron read `~/.config/user-dirs.dirs`; the shim reads only the `XDG_DESKTOP_DIR` env var, which
is almost never exported. On Windows it ignores OneDrive redirection of Desktop and Documents. The
`writeFile` callbacks in `shortcuts.ts:72-79` drop the error and log "Shortcut saved" anyway.

## Failure scenario

On a localized Linux desktop (e.g. `~/Schreibtisch`) `~/Desktop` doesn't exist; the write fails
silently, the success toast shows, and `shortcutsExists` stays false. On Windows, GOG default save
paths under `documents` resolve wrong.

## Suggested fix

Parse `user-dirs.dirs` (or run `xdg-user-dir DESKTOP` via argv); on Windows use the known-folder
path; check `writeFile` errors and report failure.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Reproduced**, all three parts. `pathShim.getPath('desktop'|'documents')` read only the
`XDG_*_DIR` env var on Linux and always returned `homedir()/<Name>` on Windows.
`shortcuts.ts`'s `writeFile` callbacks ignored their `err` and logged "Shortcut saved" anyway.

**Change.**
- New module `src/backend/sidecar/knownFolders.ts`.
  - Linux: a pure `parseUserDirs()` that mirrors GLib's reader (`"$HOME/..."` or an absolute
    path, double-quoted, backslash escapes) and reads `$XDG_CONFIG_HOME/user-dirs.dirs`. The
    order is env var, then file, then `~/Desktop`.
  - Windows: `reg.exe query "HKCU\...\Explorer\User Shell Folders" /v Desktop|Personal`, called
    with argv through `spawnSync` with a 5s timeout. Its output goes through a pure
    `parseRegQueryValue()` and `%VAR%` expansion against the real environment. The result is
    cached per folder for the process. Any failure, including a relative, unexpanded or mangled
    result, falls back to `homedir()/<Name>` as before. No new native dependency.
- `shortcuts.ts`: the Linux writes are now awaited `fs/promises.writeFile` calls. Every requested
  write is attempted. If any failed, `addShortcuts` rejects with the failed paths, and it logs
  "Shortcut saved" only after a write succeeded. The sidecar `addShortcut` channel already caught
  that rejection. It now also shows a failure toast (`box.shortcuts.error`, en catalogue entry
  added by `pnpm i18n`) instead of the success toast.

**RED** (on the unchanged product code):
- `pathShim.test.ts`, new "real user folders" block, 2 failed:
  - Linux returned `<home>/Desktop`; expected `<home>/Schreibtisch`.
  - win32 returned `<home>/Desktop`; expected `C:\Users\Jörg\OneDrive\Desktop`.
- `shortcuts/__tests__/addShortcutsOutcome.test.ts`, "rejects when the desktop entry cannot be
  written": "Received promise resolved instead of rejected".

**GREEN.**
- pathShim 16/16. New `knownFolders.test.ts` covers the parsers: localized dirs, `$HOME/`,
  escapes, ignored relative values, CRLF, `reg` output, case-insensitive `%VAR%`, and an
  unresolved var.
- `addShortcutsOutcome` 4/4. `shortcutsFlows` passes and now asserts the failure toast.
- `pnpm codecheck` exits 0.
- eslint: 0 errors and no new warnings. The new files have 0 warnings, and the remaining warnings
  in touched files are on lines this change did not touch. The new `t()` calls use the named
  export so they do not add `no-named-as-default-member` warnings.
- `prettier --check` passes on every touched `.ts` file. `public/locales/en/translation.json` is
  prettier-ignored, so it was hand-matched to the surrounding file.

**Not verified.**
- No live run on any OS.
- The Windows path has not run against a real registry. `reg.exe` prints in the console code
  page, so a redirect typed with characters outside it may come back mangled. Such a result is
  rejected (U+FFFD check), and the fallback is used. The common OneDrive value
  (`%USERPROFILE%\OneDrive\Desktop`) is ASCII and is expanded from the UTF-16 environment.
- The Start Menu path (`appData\...\Programs`) still uses the APPDATA env var, not the
  `Programs` known folder.
- `GameSubMenu` still flips to "Remove shortcuts" optimistically, because `addShortcut` is a
  send channel with no reply. It re-reads `shortcutsExists` on remount, so it corrects itself.
