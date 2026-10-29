---
created: 2026-10-29
title: "Store embed: macOS/Linux live runs of 261012-f25 / 261012-gn8, the resize-while-away geometry case, and the UA and panel-copy observations"
area: tauri-shell
severity: minor
platform: any
ready: code
found_by: "quick 261029-bv7 closing the Windows todo .planning/todos/completed/2026-10-11-stores-tab-embed-not-implemented-on-windows.md"
files:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/storeEmbedZoom.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
  - public/locales/en/gamelib.json
  - src-tauri/src/main.rs
---

## Problem

The Windows store-embed todo closed on 2026-10-29 with W1-W10 passing on Windows. Five items were
still owed off Windows, or were observations nobody had decided on. They are carried forward here
so they keep a tracked file. The closed todo is
`.planning/todos/completed/2026-10-11-stores-tab-embed-not-implemented-on-windows.md`.

## Items

1. A macOS live run of `261012-f25` and `261012-gn8`.
   - The zoom-aware bounds come from commits `e97265b1c` and `a8e03e290`.
   - The renderer change applies to macOS too, and so does the post-open `setBounds` on the
     existing-embed path.
   - At 100% the payload is unchanged by construction, because `storeEmbedZoom.ts` reads an absent
     factor as 1.
   - It is compiled in CI (run `38856607168`, aarch64-apple-darwin leg) but has never been observed
     live.
   - Steps: re-run R1-R6 from the parent's "W8 re-run steps" section, including 120% and 80%
     Accessibility Zoom.
2. The same live run on Linux.
   - Linux positions through `gtk::Fixed` in logical units.
   - It needs the Linux machine.
   - Compiled in CI on the ubuntu-22.04 leg of run `38856607168`.
3. The window resized while away from the store route.
   - This stale-geometry case is unmeasured on every platform, Windows included. It was named in
     261012-gn8's NOT-verified list.
   - Steps: open Stores, go to Library, resize the window, return. The embed must fill the slot.
   - `a8e03e290`'s post-open `setBounds` might already cover it. That has not been measured, so do
     not claim it does.
4. The embed UA keeps its `Macintosh` platform token on Windows and Linux
   (`STORE_EMBED_USER_AGENT` in `src-tauri/src/main.rs`, which begins
   `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)`).
   - This needs an operator decision: keep one UA for store compatibility, or go per-OS.
5. On a supported OS, the D-34 deep-link panel heading `webview.unavailable.platform.heading`
   (`public/locales/en/gamelib.json`) still reads "In-app store and wiki browsing isn't available
   on this platform yet". That path is now the only practical way to reach the platform reason.
   - Candidate: a dedicated origin reason. This needs a decision, plus an l10n change under the D-09
     key-presence rule.

## Triage

- `minor`: nothing has been observed broken. Items 1-3 are unverified paths with no reported
  failure, and items 4-5 are copy and UA observations.
- `platform: macos`: the next action, item 1, needs the operator's Mac.
- Item 2 needs the Linux machine, and items 4-5 are decisions.
- `ready: live-gate`: items 1 and 3 are the next action.

## Next

1. Item 1 on the Mac, since it also gives item 3 a second platform for free (add the resize step).
2. Item 3 on Windows, which is the cheapest place to measure it.
3. Item 2 when the Linux machine is to hand.
4. Items 4 and 5 once the operator decides, as one small change.

## macOS live run (2026-10-30)

The operator ran R1-R6 and the resize-while-away step (R7) on the Mac, in `pnpm tauri:dev` at
`3fbe162b3`. The orchestrator took screenshots on a 1x display (3440x1440).

First pass, with "Use frameless window" OFF (the native titlebar visible):

- R1 PASS, R3-R6 PASS: the embed tracked zoom, resize and store switches.
- R2 FAIL: at 120% the embed was not flush with the slot top.
- Screenshots showed the cause: at every zoom the embed sat about 28px (one titlebar height) too
  high and covered the `StoreEmbedControls` row. That is about 32px at 100% and 28px at 140%.
  The row was hidden almost completely at 100%, so R1 "passed" without anyone noticing it was
  missing.
- With frameless ON, at 140%, the embed sat flush under the row.
- R7 PARTIAL: after a resize away from Stores, the embed showed at the old size, then snapped
  after about 1 s. This answers item 3 on macOS: `a8e03e290`'s follow-up `setBounds` did not
  cover it in time.

Fixed in debug session `macos-embed-titlebar-offset` (`.planning/debug/resolved/`):

- `2fd875107`: `content_top_inset` adds the visible titlebar's height to the Tauri embed's y.
  The renderer re-flushes after a runtime `setTitleBarStyle`. The existing-embed branch of
  `store_embed_open` now applies the rect before `show()` on macOS and Windows.
- `b69e5efad`: the same inset for the raw Epic `WKWebView` subview.

The re-run after the restart was the operator's report, with no captures:

- The non-Epic stores were fixed with frameless OFF and ON, R7 included.
- Epic was still off after `2fd875107` and passed after `b69e5efad`.

Item 1 (macOS) and the macOS half of item 3 are done.

## Decisions (2026-10-30, operator)

- Item 4: keep the single `Macintosh` UA on every OS. No change.
- Item 5: add a dedicated origin reason, used on supported OSes in place of the platform heading,
  with its locale keys added under the D-09 key-presence rule. This is now the desk-ready next
  action, hence `platform: any` and `ready: code`.

## Still open

- Item 5's code change.
- Item 2: the Linux live run, which needs the Linux machine.
- Item 3 on Windows. The Windows half of `2fd875107`'s existing-embed rect is compiled but not
  observed live. Windows has no titlebar inset, because `content_top_inset` is macOS-only.
