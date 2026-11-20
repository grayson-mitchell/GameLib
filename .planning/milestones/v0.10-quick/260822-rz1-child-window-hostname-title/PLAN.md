---
task: 260822-rz1
title: "Title external child windows with the URL's hostname instead of Tauri's 'Tauri App' default"
date: 2026-08-22
branch: wt/smallstuff
resolves_todo: .planning/todos/pending/2026-08-22-external-child-windows-are-titled-tauri-app.md
files:
  - src/preload/api/tauriChildWindows.ts
  - src/preload/__tests__/childWindows.test.ts
---

## Problem

Every window opened by `tauriCreateNewWindow` (ProtonDB, AppleGamingWiki, CodeWeavers, IGDB,
HowLongToBeat, AreWeAntiCheatYet) displays the title **"Tauri App"**.

The WR-07 comment at `tauriChildWindows.ts:78-86` omits `title` deliberately and asserts:

> "Omitting `title` restores that Electron behaviour: Tauri falls back to the loaded document's
> own title. Do not 'fix' this by adding a title back."

## Facts established at HEAD (re-verified, not carried from the todo)

| Claim | Evidence |
| --- | --- |
| Tauri's default window title is `"Tauri App"` | `tauri-utils/src/config.rs:2375` — `fn default_title() -> String { "Tauri App".to_string() }` |
| The crate version moved since the todo was filed | `Cargo.lock` pins tauri-utils **2.9.3**; the todo cited 2.9.2. The fact survived the bump. |
| Tauri does **not** sync `document.title` automatically | `tauri-2.11.5/src/webview/webview_window.rs:297-332` — `on_document_title_changed`, an opt-in hook whose own doc example body is `window.set_title(&title).unwrap()`. If Tauri synced the title itself, that hook (and that example line) would not exist. It is also a **Rust builder** API, unreachable from the JS `WebviewWindow` constructor this module uses. |
| The gate cannot see the defect | `childWindows.test.ts:189` — `expect(options.title).toBeUndefined()` asserts what was passed at the call site, never what the window displays. Green throughout. |
| All callers pass absolute https URLs | 20 call sites across `src/frontend` (CompatibilityInfo, GameSubMenu, Anticheat, AppleWikiInfo, GameScore, HowLongToBeat) — every one an absolute `https://` literal or template. |

## Approach — todo Option 3, hostname title

1. Add a total helper deriving the title from the URL's hostname, stripping a leading `www.`.
   Returns `undefined` (⇒ omit `title`, i.e. today's behaviour) when the url will not parse or
   carries no hostname. Totality is required: the enclosing function is reached from a user click
   and the whole module is deliberately exception-free.
2. Spread the title in conditionally so an underivable title omits the key rather than passing
   `title: undefined`.
3. Rewrite the WR-07 comment: keep the real concern (never title remote content "GameLib"),
   correct the false document-title-fallback claim **in place**, and record why a hostname is a
   *stronger* anti-phishing posture than a page-controlled title.
4. Leave label generation untouched. The title must never become a label input (T-34.1-27).

### Explicitly rejected

- **Option 2 (inject a script to sync `document.title`).** Requires an initialization script in
  renderer-supplied remote content, against the isolation posture that keeps these windows
  capability-free.
- **`www.` stripped unconditionally.** `www.com` is a real registrable domain; blind stripping
  titles it `com`. Strip only when the remainder still contains a dot.

## Tests

Replace the callsite assertion at `childWindows.test.ts:189`. New cases:

1. A normal host → title is the bare hostname.
2. A `www.`-prefixed host → `www.` stripped.
3. An unparseable url → `title` key absent, window still constructed (totality).
4. A hostile-looking url → the title is the attacker's **host**, and explicitly not `GameLib`
   (WR-07 holds) and not `Tauri App`.
5. `www.com`-shaped degenerate host → not reduced to a TLD.
6. The url must still not leak into the **label** (label discipline unchanged).

All must be RED against the unfixed module, proven on a scratchpad copy (no `git stash`, no
`git reset` — the stash stack is shared with concurrent sessions).

The existing About-window `title: 'About GameLib'` test stays untouched and passing.
