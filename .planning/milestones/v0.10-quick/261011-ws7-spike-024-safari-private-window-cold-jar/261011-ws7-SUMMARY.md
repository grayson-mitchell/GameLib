---
quick_id: 261011-ws7
title: Spike 024 — Safari Private Window cold-jar control (run 11)
date: 2026-10-11
status: complete
outcome: RENDERED twice — IP and jar refuted; the Turnstile gate is specific to the embedded Tauri webview
todo_filed: .planning/todos/pending/2026-10-11-epic-store-in-the-pristine-login-wkwebview-the-embed-challenge-is-webview-side.md
executed_inline: true
---

# Quick 261011-ws7 — run 11

## Result

| Sample | Window | URL | Title at 25 s / 45 s | Egress IP |
|---|---|---|---|---|
| 1 | fresh Private Window, `Sign in` shown | `store.epicgames.com/en-US/` | real store title, both times | identical to the webview's challenge-card address (`api.ipify.org` in the same window) |
| 2 | fresh Private Window after closing the first | `www.epicgames.com/store/en-US/` | real store title | — |

Same machine, same IP, same WebKit, cold jar: **served**. The Tauri child webview under the same
conditions: challenged 9 of 10 (runs 2–10, four UAs). IP reputation, UA and jar are each refuted;
the discriminator is the embedded webview. Prime suspect: Tauri's injected init scripts — the
2026-08-03 Talon-fingerprint theory spike 024 had called refuted on an over-strong inference.

## Landed

- Spike README: `### Run 11`, established #5, IP bullet struck, consequence rewritten ("gate
  stays; the reason changed"). Shot `shot-safari-private-cold-jar-RENDERED-run11.png` (Private
  badge, `Sign in`, store). IP shot not committed.
- Guard comment in `WebView/index.tsx` and the panel docstring: comment-only, re-proven.
- New pending todo (severity medium, macos, live-gate): point `open_pristine_epic_login_window`
  at the store URL. Appendices on the w8j and 2026-09-05 WONTFIX todos.

## Method notes

Apple events to Safari: `-1743`. `System Events` keystrokes are authorised, so ⇧⌘N / ⌘L / URL /
⏎ drove it; frontmost-app asserted before any keystroke. Titles via a Swift one-off over
`CGWindowListCopyWindowInfo(.optionAll)`. Two Private Windows were opened and the second left
open on the store page; the user's normal-session Epic tab from w8j is still open too.
