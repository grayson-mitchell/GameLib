---
created: 2026-10-29
title: "Epic login window presents as a macOS sheet on main, like GOG and the other logins (lift the REQ-34.4.2-10 Epic descope)"
area: login-window
severity: minor
platform: macos
ready: live-gate
found_by: "operator request 2026-10-29, after quick-261029-o1w made GOG's pristine login a sheet and left Epic free-floating"
files:
  - src-tauri/src/main.rs
  - src/backend/__tests__/tauriShellSource.test.ts
  - .planning/quick/261029-o1w-gog-login-window-as-macos-sheet-with-nat/261029-o1w-PLAN.md
---

## Problem

On macOS every launcher login window is now a sheet attached to `main`, except Epic. The
Tauri-managed logins (Humble, Amazon and the rest) went to sheets in Phase 34.4.2, and GOG's
pristine `WKWebView` login followed in quick `261029-o1w`. Epic's account login still opens as its
own free-floating 900x700 window, centred and focused. It can fall behind the main window, it
does not join the single-flight login latch, and it has no native × cancel button.

This is a **decision that was locked, not something that was missed.** REQ-34.4.2-10 is the Epic
descope from Phase 34.4.2 (`.planning/milestones/v0.8-ROADMAP.md:2330`). It kept the pristine
Epic surface byte-unchanged because that window is the one construction Epic's Talon sign-in
serves without a 403. `PHASE_34_4_2_NEW_SYMBOLS` in `tauriShellSource.test.ts` enforces it: no
sheet or latch symbol may appear in the sliced `open_pristine_epic_login_window` body. Quick
`261029-o1w` kept it as well (its PLAN: "Epic stays exempt and free-floating"). This todo asks
to lift the descope. The operator asked for it, and that request is the decision.

**This is not the in-store Sign in button.** Epic's own Sign in button inside the `/store/epic`
embed already completes sign-in in place. See the closed
`completed/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md`, which passed
Phase 50 UAT Item 2 on 2026-10-13. This todo covers only the launcher's Epic account login.

## Solution

Follow GOG's `261029-o1w` shape. It already proved the approach inside the same pristine function:

- `open_pristine_epic_login_window` already takes `as_sheet: bool`. Today the Epic call in the
  `humble_login_open` arm passes `false`. With `true`, the window is built ordered-out so
  `beginSheet:` is what reveals it, and it gets the 32pt band with the native cancel button.
- Add an `open_epic_login_sheet` wrapper **outside** the pristine slice, mirroring
  `open_gog_login_sheet`: latch, `present_login_window_as_sheet`, watchdog, visible fallback,
  `clear_pending_visible_login_window` on every path, and the Destroyed hook's dismiss. That
  keeps every sheet and latch symbol out of the guarded body, so `PHASE_34_4_2_NEW_SYMBOLS`
  stays green without being weakened.
- Routing: Epic currently returns **before** the `if visible == true {` latch block (it is
  exempt). Move it after the latch, next to `if is_gog_login {`, and update the ordering pin
  `261029-o1w` added. Every pin change must be deliberate and cite this todo.
- Size: decide whether Epic takes the 464x592 sheet size every other login uses or keeps 900x700.
  Epic's login page may need the width, so check it live.
- Update REQ-34.4.2-10's text in `REQUIREMENTS.md` so the descope is recorded as lifted rather
  than silently contradicted.

**The live gate is the point (`ready: live-gate`).** The descope existed because Talon (the 403 on
`/id/api/email/exists`) and Turnstile both react to how the webview is built. GOG's sheet passed
Turnstile with no JS injected, which is encouraging, but Epic is a different gatekeeper. Measure
on this Mac:
(1) the Epic login completes end-to-end inside the sheet, with no 403 and no challenge;
(2) the × button, Esc and a successful login each dismiss the sheet and return the app to idle;
(3) a second visible login while the Epic sheet is up is refused by the latch.
If (1) fails, revert to free-floating and record why here. Do not work around it with injection.
