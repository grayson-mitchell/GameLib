---
created: 2026-09-28T00:00:00.000Z
title: "humble_login_clear_cookies' arm comment (main.rs:7185-7188) still claims GOG/Amazon route through a live Tauri-managed window — contradicted by the Phase 40 sentinel-label change at :7200-7205"
area: auth/webview
severity: minor
platform: any
ready: code
source: "quick task 260928-qvr, 2026-09-28 — surfaced by that task's mandatory caller audit; deliberately left unfixed there as out of scope, filed here so it is not lost"
files:
  - src-tauri/src/main.rs
---

## Problem

The `humble_login_clear_cookies` match arm opens with a comment at `src-tauri/src/main.rs:7185-7188`
describing its callers as "Humble/GOG/Amazon, all still routed through a live Tauri-managed
window".

That is no longer true. The Phase 40 plan 04 note a few lines below it, at `:7200-7205`, records
the change that moved GOG and Amazon to **sentinel no-window labels** — which means they take the
`existing_window.is_none()` fallback into `clear_default_data_store_cookies_for_domain`, not the
window-based branch the stale comment implies.

The two comments sit ~15 lines apart and say opposite things about the same callers. The lower one
is correct.

**Measured, not inferred.** Quick task 260928-qvr's caller audit enumerated all four
`seam.clearCookies` sites and classified each by label binding:

| caller | label | branch taken (macOS) |
| --- | --- | --- |
| Humble `disconnect()` (`src/backend/humble/user.ts:1010`) | real `seam.open()` window label | **window-based** (the only one) |
| GOG (`src/backend/storeManagers/gog/user.ts:69`) | sentinel no-window | default-store fallback |
| Amazon (`src/backend/storeManagers/nile/user.ts:69`) | sentinel no-window | default-store fallback |
| Epic (`src/backend/storeManagers/legendary/user.ts:400`) | sentinel `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL` | default-store fallback |

## Why this is worth fixing rather than ignoring

No live consequence today — it is a comment, and the code is correct. The cost is that it is
**actively misleading at exactly the place someone reads before editing this arm.** Two of the
three sibling debug sessions on this code path turned on which branch a given store actually
reaches; a reader who trusts the top comment will conclude GOG and Amazon exercise the
window-based branch and reason about blast radius wrongly.

This is the same failure shape as the defect that produced it: `clear_default_data_store_cookies_for_domain`'s
own doc comment asserted that a separate storage clear covered the cache categories, which was
true of the JS-observable Cache Storage API and false of WebKit's native HTTP cache — and that
wrong comment is part of why the gap survived review for so long (see
`.planning/debug/resolved/epic-cold-jar-login-timeout.md`).

## Solution

Rewrite the `:7185-7188` comment so it agrees with `:7200-7205` and with the audit table above:
Humble is the sole caller reaching the window-based branch; GOG, Amazon and Epic pass sentinel
labels and take the default-store fallback on macOS.

Comment-only. No behaviour change, no type-set change, no new test. Consider instead whether the
Phase 40 note at `:7200-7205` should simply absorb the corrected caller list, so there is one
statement about caller routing in this arm rather than two that can drift apart again.

## Expected / Result

expected: The arm's opening comment describes caller routing accurately — Humble via a real window
label, GOG/Amazon/Epic via sentinel no-window labels — with no second comment contradicting it.
result: pending
