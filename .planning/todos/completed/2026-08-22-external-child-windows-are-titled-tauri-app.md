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

## Resolution — CLOSED (2026-08-22, quick task 260822-rz1)

Summary: `.planning/quick/260822-rz1-child-window-hostname-title/SUMMARY.md`

**Option 3 implemented.** `tauriCreateNewWindow` derives the title from the url's host (leading
`www.` stripped) via a new total helper `externalWindowTitle`. External link windows are now titled
`protondb.com` / `codeweavers.com` / `applegamingwiki.com` instead of "Tauri App".

The WR-07 comment was rewritten in place, not deleted: it keeps WR-07's real requirement, states
plainly that the old document-title-fallback claim was false, and records that Electron parity is
knowingly not restored (restoring it needs an init script injected into remote content, against the
isolation posture).

**Both of this todo's factual claims re-verified at HEAD before any code was written**, one with a
correction: `default_title()` → `"Tauri App"` is at tauri-utils `config.rs:2375`, but the lockfile
pins **2.9.3**, not the 2.9.2 this todo cited — the crate was bumped and the fact survived. Extra
evidence this todo did not have: `on_document_title_changed`
(`tauri-2.11.5/src/webview/webview_window.rs:297-332`) is an opt-in hook whose own doc example body
is `window.set_title(&title).unwrap()`, and it is a Rust builder API unreachable from the JS
constructor used here.

**The callsite assertion was replaced as this todo required.** Seven tests now name the resulting
title (normal host, `www.` stripped, `www.com` NOT reduced to a TLD, unparseable url, `file://`
with no host, hostile url titled with its host and explicitly not `GameLib`/`Tauri App`, and
title-derivation not leaking into the label). RED-proven: 5 fail against the unfixed module, and
the two "omits title" fallback tests pass in both states by design.

**Still not a pixel-level gate, and deliberately so.** The new assertions read the constructor
mock; a `node`-environment unit test cannot observe a real OS window. Under Tauri the `title`
option is applied verbatim, so the asserted string is the displayed string — but the thing that
actually closes the loop is re-observing one external link window live. Phase 34.1 UAT item 8a
should be re-run rather than ticked from this suite.
