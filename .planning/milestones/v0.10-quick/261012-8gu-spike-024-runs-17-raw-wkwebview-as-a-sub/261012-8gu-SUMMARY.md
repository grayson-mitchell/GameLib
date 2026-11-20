---
quick_id: 261012-8gu
title: Spike 024 — runs 17–19, the raw WKWebView inside the MAIN window, and the 120 s stall sample
date: 2026-10-12
status: complete
outcome: RENDERED IN PLACE, never challenged — 0 of 6 in-main Epic arms hit Turnstile, 4 rendered by 120 s, child embed challenged 6 of 6 alongside; the attachment is not the trigger and the embed shape exists as a Rust-managed raw WKWebView. The stall is real — 5 of 16 raw loads blank at 40 s across runs 12–19, 2 of 3 sampled still blank at 120 s — and is now the shipping blocker
todo_closed: .planning/todos/completed/2026-10-12-raw-wkwebview-subview-of-the-main-window-separates-tauri-init-scripts-from-add-child.md
todo_filed: .planning/todos/pending/2026-10-12-which-in-flight-head-resource-holds-the-stalled-epic-store-load.md
todo_woken: .planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md (blocked -> human)
executed_inline: true
---

# Quick 261012-8gu — runs 17–19

## Result

| Run | Steam | `www.epicgames.com/store/en-US/` 20/40/120 s | `store.epicgames.com/en-US/` 20/40/120 s | Child embed |
|---|---|---|---|---|
| 17 | served | RENDERED / — / — | RENDERED / — / — | challenged ×2 |
| 18 | served | stalled / stalled / stalled | stalled / stalled / stalled | challenged ×2 |
| 19 | served | stalled / stalled / RENDERED | RENDERED / — / — | challenged ×2 |

Raw `WKWebView` as a subview of the main window's content view at `290,96 760×560` (AppKit
origin `290,244`, not flipped), fresh `nonPersistentDataStore()`, no UA override. 0 of 6
challenged; 4 of 6 rendered by 120 s; embed 6 of 6 challenged; Steam 12 of 12 served.

**Stall, across runs 12–19:** 16 raw-WKWebView cold Epic loads, 11 rendered by 40 s, 5 blank at
40 s. Of 3 stalls sampled at 120 s: 1 completed (run 19, between 40 and 120 s), 2 had not. Same
state every time: real store document, `readyState=loading`, empty body, ~938 k parsed, key-art
preloads still arriving. Never a challenge document.

## What it means for the decision

- The separate-window question is moot unless the subview is rejected on other grounds: the
  store renders in place without Tauri's multiwebview.
- The decision that is actually open is whether `/store/epic` adopts a Rust-managed raw
  `WKWebView` subview (its own bounds-sync, cookie and navigation plumbing, macOS-only as
  written) — a different construction from D-05's "Tauri child webview". The sign-in-button
  todo is awake on that (`ready: human`).
- The stall blocks shipping either shape. Next measurement is named and cheap: list in-flight
  head resources on a stalled arm (`severity: major` todo filed).

## Landed

- Harness: `SPIKE_PRISTINE_INMAIN=1` (subview of the main window, `removeFromSuperview` on
  close, main-window shots), `SPIKE_PRISTINE_LONG=1` (120 s read + shot on Epic arms);
  `PRISTINE` slot carries an owns-window flag. One `unnecessary unsafe` warning fixed.
- README: frontmatter, `### Runs 17–19`, established #7, NOT-established rewritten, reproduce
  knobs, consequence rewrite. `run-17.log` … `run-19.log` redacted. Two shots: in-main RENDERED
  (run 17), in-main STALLED at 120 s (run 18). `events-export.json` restored after each run.
- Comment-only edits in `WebView/index.tsx` and `WebviewUnavailablePanel.tsx`; prettier clean.
- Subview todo closed with a RESOLUTION; sign-in todo `blocked` → `human` + appendix; stall
  todo filed.

## Gates

- `cargo build` clean. `npx prettier --check` on the two tsx files clean. `pnpm planning-gates`
  12/12 (todo moves staged before the run — the envelope gate reads the git index).
