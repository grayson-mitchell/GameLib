---
created: 2026-11-11T00:00:00.000Z
title: 'Humble disconnect runs clearHumbleStorage AFTER clearHumbleCookies and can re-seed cookies behind the sweep'
area: shell
severity: minor
platform: any
ready: live-gate
files:
  - src/backend/humble/user.ts:995-1190
  - src/backend/storeManagers/legendary/user.ts:254-298
  - .planning/debug/resolved/webview2-humble-deletecookie.md
  - .planning/debug/resolved/epic-cookie-clear-read-divergence.md
---

## Problem

`HumbleUser.disconnect()` declares its `wipeSteps` as `clearHumbleCookies` first, then
`clearHumbleStorage` last (`src/backend/humble/user.ts`, the entries at ~997 and ~1167). The
storage step calls `seam.clearStorage(HUMBLE_BASE_URL, ...)`, which opens its own hidden window in
the Rust arm (`humble_login_clear_storage`) on the LIVE Humble origin, because localStorage,
sessionStorage, IndexedDB and Cache Storage are origin-scoped and can only be cleared from a real
document on that origin. Loading the live origin is exactly what the cookie step no longer does
(fixed in `813bc7c6c`, debug session `webview2-humble-deletecookie`): Humble's page sets cookies
when it loads.

So a cookie could be re-seeded AFTER the cookie sweep has finished and certified the jar. The
paired before/after census lives INSIDE the cookie step, so it cannot see anything written by the
step that runs after it.

Epic orders this the other way on purpose: `clearEpicStorage` FIRST, `clearEpicCookies` LAST
(`legendary/user.ts` ~254-298, "ORDER IS LOAD-BEARING", debug session
`epic-cookie-clear-read-divergence`). The measured reason there: the cookie sweep reported
`matched=0`, then the storage step re-seeded the jar behind it with nothing to follow, live in both
a dev and a packaged jar, with the surviving records' `created` timestamps landing on the clear's
own seconds. The reorder is also what makes the cookie step's closing verification meaningful: it
can only certify a clean jar if it is the last thing that touches the jar.

## Status: latent, NOT observed live

This is a latent risk, not an observed defect, hence `severity: minor`. On the 2026-11-11 Windows
live run of the `webview2-humble-deletecookie` fix (one run, Humble sign-in then disconnect), the
cookie census read `before=31 after=1 -> CDP issued=1 partitioned=1 -> after=0` and the reconnect
check passed (reconnecting Humble asked for login, no silent auto-sign-in), so this run did not
reproduce a re-seed. That check cannot rule out a re-seed of non-session cookies (for example
anti-bot or analytics cookies), which would not change whether login is asked for, and nothing
counted the jar AFTER the storage step. Absence of a reproduction is not a measurement.

## Solution

Measure first, then decide:

- Add a count-only census (never names, values or domains, T-34.4.1-02) after `clearHumbleStorage`
  and run one live Humble disconnect on Windows to see whether the jar is non-empty afterwards. The
  same on macOS if the Mac is to hand.
- If it re-seeds: reorder to storage first, cookies last, mirroring Epic, and keep the cookie
  step's closing census as the last jar-touching step. Check what the TS fail-closed guard does
  with a failed storage step before moving it (storage steps are warnings today, a failure is
  logged and the loop continues), so the reorder does not change which failure is fatal.
- If it does not re-seed on Windows, record the measurement here and close; the reasoning above
  stays the documented rationale for Epic only.

## Notes

- The macOS Humble cookie-clear window still uses the LIVE Humble origin
  (`HUMBLE_BASE_URL`, see `humble/constants.ts` `HUMBLE_COOKIE_CLEAR_HANDLE_ORIGIN` comment): the
  fix in `813bc7c6c` only moved Windows and Linux onto `https://gamelib.invalid/`. macOS removal is
  a WKWebsiteDataStore record eviction that was live-gated against the live-origin window and has
  not been measured against the quiet origin, nor measured for a live-page re-write during the
  clear. If the macOS jar is re-seeded mid-clear, it is the same defect class as the one fixed on
  Windows and should be measured there as a separate item.
- The `[shell] humble_login_clear_cookies:` lines go to the terminal running `pnpm tauri:dev`
  (shell stderr), not `gamelib.log`.
