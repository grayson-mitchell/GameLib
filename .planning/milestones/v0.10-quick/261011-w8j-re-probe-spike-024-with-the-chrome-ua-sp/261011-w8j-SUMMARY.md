---
quick_id: 261011-w8j
title: Re-probe spike 024 with the Chrome UA spoof OFF
date: 2026-10-11
status: complete
outcome: measured, still challenged — the user agent is ruled OUT; WONTFIX on `/store/epic` stands with better evidence
todo_closed: .planning/todos/completed/2026-10-11-re-probe-spike-024-epic-store-embed-with-the-chrome-ua-spoof.md
executed_inline: true
---

# Quick 261011-w8j — spike 024, the UA arm

## Result

Five more autoruns of the spike 024 harness, each on a fresh `WKWebsiteDataStore`, each with the
Steam positive control rendering. **Every Epic arm was challenged under every user agent tried.**

| Run | Container | UA presented | Epic | Steam control |
|---|---|---|---|---|
| 6 | `spike024e` | none (bare `AppleWebKit/605.1.15 (KHTML, like Gecko)`) | Turnstile, "One more step" | rendered |
| 7 | `spike024f` | none | Turnstile | rendered |
| 8 | `spike024g` | none | Turnstile | rendered |
| 9 | `spike024h` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher` | Turnstile | rendered |
| 10 | `spike024i` | full Safari 26.6 string | Turnstile | rendered |

Runs 6, 9 and 10 are pixel-verified (986×630 synced; 760×560 add_child size — never the 58 px
squeeze). Runs 7–8 are log-only. Real Safari on the same machine and IP rendered the store during
the same session (CGWindowList title), **but** that Safari is signed in to Epic, so it is a warm-jar
control, not a cold one; its shot is not committed. The interactive click arm was not run: no new
condition existed for a human to click under.

**Surviving question**, sharper than before: cold jar on this IP vs the embedded webview itself.
A Safari Private Window control or a different-network run separates them — operator work.

## Corrections recorded

- WKWebView's default UA has **no** `Version/` or `Safari/` token (the todo assumed it did).
- "Permanent" in the README consequence section, the `index.tsx` guard comment and the panel
  docstring is now "measured", with the reopen condition stated.

## Files

- `app/src/main.rs` — `SPIKE_SPOOF_UA=0` (no override) and `SPIKE_UA=<string>` knobs on the
  autorun's PHASE 1 embed; `spoofUa` / `uaOverride` logged; probe exfil carries
  `navigator.userAgent`. `tauri.conf.json` left at `spike024i`.
- Spike dir: `run-6.log` … `run-10.log` (IP + Cloudflare session ID redacted), three black-barred
  challenge shots, README `### Runs 6–10` + consequence rewrite + reproduce knobs.
- `WebView/index.tsx`, `WebviewUnavailablePanel.tsx` — comment-only; proven identical after a
  TypeScript `removeComments` print of HEAD vs working copy. Prettier clean.
- Todo moved to completed with a RESOLUTION; WONTFIX todo got a 2026-10-11 addendum.
  `pnpm planning-gates` 12/12.

## Deviations

Executed inline rather than via planner/executor subagents: the task is a live GUI run with
window-targeted captures and judgement calls mid-run (viewport shape, redaction, the Safari
confound), which a detached executor would have had to fabricate or skip. A Safari tab to
`store.epicgames.com` was opened in the operator's browser for the control and left open.
