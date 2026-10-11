---
created: 2026-10-11T11:30:00.000Z
title: 'Point the pristine login WKWebView at the Epic store — run 11 proved the Turnstile gate is webview-side, not IP or UA'
area: webview/store-embed
severity: medium
platform: macos
ready: live-gate
status: completed
resolution: measured-rendered-never-challenged
resolved: 2026-10-12
resolved_by: "quick-261012-7f2"
found_by: 'quick 261011-ws7, spike 024 run 11 (Safari Private Window cold-jar control, 2026-10-11)'
files:
  - src-tauri/src/main.rs:4147
  - .planning/spikes/024-epic-store-in-embedded-child-webview/README.md
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/storeEmbedOrigins.ts
---

## RESOLUTION — measured, rendered, never challenged, 2026-10-12 (quick `261012-7f2`)

**Row 1 of the table below fired, with one correction.** Spike 024 runs 12–16: a raw `WKWebView`
with zero Tauri injection, no `add_child`, on a fresh `nonPersistentDataStore()` per window, in
the spike harness process (the shipped window's `defaultDataStore()` is the operator's signed-in
Epic jar, so it was ported rather than driven — a render there would have been the warm-jar
confound). Ten Epic arms across five runs and two UAs (the shipped Chrome 142 stub ×2, no override
×3): **challenged 0, rendered 6, stalled 4**. The Tauri child embed in the same five runs:
challenged 10 of 10. Steam served in all 20 arms. Rendered shots and redacted `run-1[2-6].log`
are committed under the spike.

- **The correction.** "Renders ⇒ candidate 1 confirmed by elimination" was one step too far: the
  pristine construction removes the init scripts AND the `add_child` attachment AND wry's
  delegates at once, so candidates 1 and 3 are confirmed as a pair. Candidate 2 (WKWebView-vs-
  Safari tells) IS refuted — it is still a WKWebView, bare WebKit UA, served. The separating test
  (a raw WKWebView subview of the MAIN window — also the real embed shape) is filed as
  `2026-10-12-raw-wkwebview-subview-of-the-main-window-separates-tauri-init-scripts-from-add-child.md`.
- **The stall** (4 of 10): the real store document, `readyState=loading`, empty body, 938 k
  parsed, still fetching key art at 40 s; not a challenge document; not measured past 40 s.
  Recorded in the README as open.
- **Consequence.** `/store/epic` has an in-app path in a pristine window. D-05's embed decision
  stands. Whether a separate window is acceptable Epic store UX is a product decision; the
  2026-09-15 sign-in-button todo now waits on that decision (appendix added there), not on a
  measurement. The UA arm asked for below was run (Chrome and none; `EpicGamesLauncher` skipped —
  the UA is refuted in both directions now, see the README).

## Problem

Spike 024's eleven runs now separate every variable but one. The Tauri-managed child `WKWebView`
is Turnstile-challenged on 9 of 10 cold runs across four user agents (runs 2–10); real Safari on
the **same machine, same residential IP, same WebKit, cold Private Window jar** renders the store
on both hosts, twice (run 11, egress IP verified identical via `api.ipify.org` in the same private
window — no Private Relay). The IP, the UA and the jar are each refuted. What is left is the
embedded webview itself.

The prime suspect is Tauri's injected initialization scripts (`__TAURI__`, `__TAURI_INTERNALS__`,
`ipc`, `isTauri`, `__TAURI_IIFE__`). Spike 024 called this refuted because the globals were
present in run 1, which passed; run 11 shows that inference was too strong — a first-contact pass
followed by challenges on every later cold visit is what a bot-like JS environment produces once
the IP has history. Second and third candidates: WKWebView-vs-Safari environment tells that
survive a correct UA (no `window.safari`, no extension surface), and the child attachment itself.

## Solution

**One config change in code that already exists.** `open_pristine_epic_login_window`
(`src-tauri/src/main.rs:4147`) builds a `WKWebView` with no Tauri injection; it passed Cloudflare
on 2026-09-28 (`cf_clearance` ×3, memory `logging-out-of-epic-is-a-one-way-door-on-a-cold-jar`).
Point it at `https://www.epicgames.com/store/en-US/` instead of the login URL — a dev-only
command or a spike-sized harness, not a shipped path.

- Run it ≥3 times, fresh data store each time, Steam positive control first, and once with the
  `EpicGamesLauncher` UA and once with no override (the UA is refuted but the pristine window
  currently passes a specific one).
- Read the title and body length from the page (the 024 probe pattern: `eval` after settle,
  exfil by navigation, never `fetch`), screenshot at a pixel-verified full viewport.

| Result | Consequence |
|---|---|
| Renders ≥3 times | Candidate 1 (injection) is confirmed by elimination. `/store/epic` has an in-app path: a pristine window, not the child embed. D-05's *embed* decision stands; a new decision is needed on whether a separate window is an acceptable Epic store UX, and the 2026-09-15 sign-in-button todo wakes |
| Challenged | Candidate 1 is out; candidates 2–3 remain and the next test is a Safari-shaped `WKWebViewConfiguration` in the pristine window |
| Mixed | Record it; the README's own history is the caution against generalising from one pass |

## Do not re-derive

- The gate is Turnstile on the store, distinct from the Talon 403 on `/id/api/email/exists`. Both
  are measured; neither explains the other.
- The child embed itself is **not** the next thing to re-run — runs 2–10 are enough.
- `embeddable: false` does not gate the direct route; only the `index.tsx` guard does.
