---
created: 2026-08-22T16:55:00.000Z
title: "External child windows are titled 'Tauri App' — the WR-07 comment claims a document-title fallback that does not exist, and its test cannot detect the difference"
area: tauri
severity: low
found_by: "Phase 34.1 UAT item 8a, live gate 2026-08-22 (first time any child window was observed running)"
source: ".planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-HUMAN-UAT.md item 8a"
files:
  - src/preload/api/tauriChildWindows.ts
  - src/preload/__tests__/childWindows.test.ts
---

## Problem

Every external child window (ProtonDB / AppleGamingWiki / CodeWeavers / IGDB / HowLongToBeat —
anything routed through `createNewWindow`) opens with the window title **"Tauri App"**.

Observed live 2026-08-22 on two windows in the same session: the CodeWeavers row and the
AppleGamingWiki row from Avowed's Install info tab. Both titled "Tauri App".

`tauriChildWindows.ts:78-86` omits `title` deliberately, and defends the choice in a comment:

> "Omitting `title` restores that Electron behaviour: Tauri falls back to the loaded document's
> own title. Do not 'fix' this by adding a title back."

**The premise is false.** Tauri does not fall back to the document title — it falls back to its
own built-in default, `"Tauri App"`, verified against the installed crate at
`tauri-utils-2.9.2/src/config.rs:2375` (not from memory). Tauri v2 does not sync a window's title
from `document.title` at all.

## Why no gate caught it

`childWindows.test.ts:189` asserts `expect(options.title).toBeUndefined()` — that **no title was
passed at the call site**. It does not, and structurally cannot, assert what the window ends up
displaying. It stays green regardless. Same shape as the recorded lesson that a verification can
check a callsite rather than a behaviour: the test is correct about the code and silent about the
result.

This survived because no child window had ever been observed running. The code reviewer verified
the WR-07 posture statically; UAT item 8 sat unrun for five sessions.

## Severity: low, and NOT a security regression

WR-07's actual concern was that titling renderer-supplied REMOTE content **"GameLib"** presents an
attacker-controlled page under the app's own name — a phishing affordance Electron's
`loadURL` equivalent did not have. That concern is **not realized**: the window is not titled
"GameLib". The isolation posture is also unaffected — labels are still generated, never
url-derived, so these windows continue to match no capability and get zero Tauri command access.

What fails is (a) the stated goal of Electron parity, and (b) user-facing polish — every external
link opens a window labelled "Tauri App", which leaks the framework name and reads as broken.

## Options

1. **Leave the behaviour, fix the comment.** Cheapest. The comment currently instructs future
   readers not to "fix" a thing it misdescribes, which is worse than no comment.
2. **Sync `document.title` from the child window.** Requires injecting an initialization script
   into remote content, which cuts against the isolation posture that keeps these windows
   capability-free. Not recommended.
3. **Title the window with the URL's hostname** (`codeweavers.com`, `applegamingwiki.com`).
   Recommended. Not the app's name, so WR-07 holds; no framework leak; and it is *better*
   anti-phishing than a page-controlled title, because an attacker controls `<title>` but not the
   host they are served from. Derive it in `tauriCreateNewWindow` from the already-supplied url.

Whichever is chosen, **replace the callsite assertion with one that names the resulting title**,
or the next reader inherits the same green-and-wrong gate.
