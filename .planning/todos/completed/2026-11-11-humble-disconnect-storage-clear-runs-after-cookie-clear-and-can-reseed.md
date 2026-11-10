---
created: 2026-11-11T00:00:00.000Z
title: 'Humble disconnect runs clearHumbleStorage AFTER clearHumbleCookies and can re-seed cookies behind the sweep'
area: shell
severity: minor
platform: any
ready: live-gate
status: "RESOLVED 2026-11-11 (d9feed7b3). Measured live on Windows: the storage window re-seeded 2 humblebundle.com cookies behind the cookie census. Fixed by running storage first and cookies last. macOS unmeasured, see Resolution."
resolved_by: d9feed7b3
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

## Status: RESOLVED 2026-11-11 -- measured, re-seeded, fixed

This was filed as a latent risk, not an observed defect, because the first Windows run (the
`webview2-humble-deletecookie` live gate) did not count the jar after the storage step. It is now
measured: the risk was real. See Resolution below. The text of the original, pre-measurement
status is kept here for the record:

> On the 2026-11-11 Windows live run of the `webview2-humble-deletecookie` fix (one run, Humble
> sign-in then disconnect), the cookie census read `before=31 after=1 -> CDP issued=1
> partitioned=1 -> after=0` and the reconnect check passed (reconnecting Humble asked for login,
> no silent auto-sign-in), so this run did not reproduce a re-seed. That check cannot rule out a
> re-seed of non-session cookies (for example anti-bot or analytics cookies), which would not
> change whether login is asked for, and nothing counted the jar AFTER the storage step. Absence
> of a reproduction is not a measurement.

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

## Resolution

Resolved 2026-11-11 by debug session `humble-storage-clear-reseed`
(`.planning/debug/resolved/humble-storage-clear-reseed.md`), fix commit `d9feed7b3`.

**Measured (Windows 11, `pnpm tauri:dev`, TEMP-DIAG build, now removed).** The cookie step's closing
census read `after(total=75, matched=0)`; a count-only census taken after the storage step read
`total=77, matched=2`, identical immediately and again 2000 ms later. So the storage step's hidden
window on the live Humble origin re-seeds humblebundle.com cookies behind a census that had already
certified the jar clean, and it is the storage window itself that writes them (not a late writer
after it closed). The reconnect check could not see this because it only looks for session cookies.

**Fix.** `wipeSteps` in `src/backend/humble/user.ts` is now `[clearHumbleStorage, clearHumbleCookies]`,
with an ORDER IS LOAD-BEARING comment citing the measurement and Epic's. The cookie step is the last
jar-touching step and its `after` census is the closing read. No step is fatal in Humble's guarded
loop and the credential is wiped before it, so the reorder does not change which failure is fatal.
Six behavioural order tests (macOS and non-macOS arms) pin it, mutation-checked red against the old
order.

**Live re-run of the fixed build (Windows 11, one run), gamelib.log:**

- `cleared storage -- localStorage=21, sessionStorage=0, indexedDB=1, caches=0, serviceWorkers=0` at 10:04:07
- `cookie census before(total=115, matched=30) after(total=85, matched=0) deleted=30 survivingNonHumble=85` at 10:04:09
- `cleared 30 humblebundle.com cookie(s)` at 10:04:09
- Reconnect check passed: reconnecting Humble asked for login.

Limits, recorded honestly: one run; the new order is observed (storage before census, closing census
`matched=0` as the last jar touch); the soft signal (cookie census `before matched` >= 31) was not
shown (30), but the jar varies run to run and the storage window can overwrite existing keys, so it
is not a pass criterion; the reconnect check only sees session cookies; no independent post-cookie
census exists now that the diagnostic is removed, so trust rests on structure (nothing runs after the
cookie step), not on a second count.

**Open item: macOS (unmeasured, no new todo opened).** The macOS Humble cookie-clear window still
uses the LIVE Humble origin (`HUMBLE_BASE_URL`; see `humble/constants.ts`
`HUMBLE_COOKIE_CLEAR_HANDLE_ORIGIN`): `813bc7c6c` moved only Windows and Linux onto
`https://gamelib.invalid/`. macOS removal is a WKWebsiteDataStore record eviction that was live-gated
against the live-origin window, and has not been measured for a live-page re-write during the clear
or against the quiet origin. The storage-first reorder is platform-independent and already applies on
macOS, which removes the storage window as a re-seeder there too, but the cookie window's own
live-origin load is untouched. If the macOS jar is found re-seeded mid-clear, it is the same defect
class and should be measured as a separate item. No new todo was opened: this note is the record, and
the knowledge-base entry for `webview2-humble-deletecookie` carries the same caveat.
