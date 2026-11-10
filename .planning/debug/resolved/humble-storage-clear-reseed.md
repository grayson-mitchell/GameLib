---
status: resolved
trigger: "humble disconnect storage clear runs after cookie clear — todo .planning/todos/pending/2026-11-11-humble-disconnect-storage-clear-runs-after-cookie-clear-and-can-reseed.md"
created: 2026-11-11
updated: 2026-11-11
---

## Symptoms

- **Expected:** After `HumbleUser.disconnect()` finishes, the WebView cookie jar holds no Humble cookies, and the last step that touches the jar is the cookie step whose closing census certifies it clean (as Epic does: `clearEpicStorage` first, `clearEpicCookies` last — legendary/user.ts ~254-298, "ORDER IS LOAD-BEARING").
- **Actual (suspected, latent):** Humble's `wipeSteps` run `clearHumbleCookies` first and `clearHumbleStorage` last (src/backend/humble/user.ts ~997 and ~1167). The storage step opens a hidden window on the LIVE Humble origin (`humble_login_clear_storage`, needed because storage is origin-scoped), and Humble's page sets cookies when it loads. So cookies could be re-seeded after the cookie census already certified the jar. Epic measured exactly this re-seed live (debug `epic-cookie-clear-read-divergence`).
- **Errors:** none observed.
- **Timeline:** Not observed live. 2026-11-11 Windows run of the `webview2-humble-deletecookie` fix (`813bc7c6c`): cookie census `before=31 after=1 -> CDP issued=1 partitioned=1 -> after=0`; reconnect asked for login. Nothing counted the jar AFTER the storage step, and the reconnect check cannot see non-session (anti-bot/analytics) cookies.
- **Reproduction:** Windows 11, `pnpm tauri:dev`, sign in to Humble, disconnect. `[shell]` lines go to the tauri:dev terminal stderr, not gamelib.log. Requires the operator's live account — `ready: live-gate`.

## Constraints

- Count-only diagnostics: never cookie names, values or domains (T-34.4.1-02 / -94).
- Do not loosen the TS fail-closed guard. Before reordering, check how a failed storage step is treated (warnings today: logged, loop continues) so the reorder does not change which failure is fatal.
- Measure first: if no re-seed on Windows, record and close with Epic's reasoning kept as Epic-only rationale. If re-seed: reorder storage-first, cookies-last, keeping the cookie step's closing census the last jar-touching step.

## Current Focus

bug_class: Bohrbug (deterministic ordering; whether the live page seeds cookies is a property of Humble's page, so only a live measurement settles it).
hypothesis: CONFIRMED (live, Windows 11, 2026-11-11, outcome B). clearHumbleStorage's live-origin window re-seeds humblebundle.com cookies after the cookie step's census had read matched=0: post-storage census immediate(total=77, matched=2) and settled+2000ms(total=77, matched=2), against the cookie step's own after(total=75, matched=0). Stable across the settle, so it is the storage window itself, not a late writer after it closed (not outcome C).
test: (done) TEMP-DIAG build, since REMOVED. Fix applied: wipeSteps reordered to [clearHumbleStorage, clearHumbleCookies], with an ORDER IS LOAD-BEARING comment citing this measurement and Epic's. Live re-run of the fixed build returned: CONFIRMED FIXED (see the last Evidence entry).
expecting: (met) gamelib.log shows `Humble disconnect: cleared storage` BEFORE `Humble disconnect: cookie census before(...) after(... matched=0 ...)`.
next_action: none -- session resolved, fix committed (d9feed7b3), session archived.

## Evidence

- timestamp: 2026-11-11
  checked: src/backend/humble/user.ts disconnect() wipeSteps (lines ~995-1196) and the guarded loop
  found: order is [clearHumbleCookies, clearHumbleStorage]. The loop `try { await step() } catch { logWarning(...continuing) }` is uniform: NO Humble step is fatal. The cookie step logs census discrepancies as warnings only; it throws only on a rejected seam call (open/clearCookies), which the loop also downgrades to a warning. The credential (`configStore.clear()`, keyring secrets, library/sync stores) is wiped BEFORE the loop, so no wipe step's failure can leave the session on disk.
  implication: a storage-first reorder does not change which failure is fatal for Humble (none are). It would not need a FATAL_WIPE_STEP-style rethrow. The only thing to preserve is that the cookie step stays the LAST jar-touching step so its closing census (the one in the cookie step's `after`) certifies the final jar. If the reorder is made, Humble's cookie step has no Epic-style closing sweep, so the cookie step's `after` census is the closing census (decide at fix time whether to add the Epic-style post-sweep verification; do not widen scope without evidence).
- timestamp: 2026-11-11
  checked: src/backend/storeManagers/legendary/user.ts wipeSteps ~254-298 and the resolved session epic-cookie-clear-read-divergence
  found: Epic runs storage FIRST and cookies LAST. Measured live on macOS (2026-08-31): cookie sweep reported matched=0, then the storage step re-seeded the jar behind it (survivor `created` timestamps on the clear's own seconds; `__cf_bm` Cloudflare TTL records, which only a live HTTPS request mints). After the reorder: storage ran 21:03:12, cookie clear 21:03:13 (cleared 8), post-clear verification 0 remaining, independent parse 0 Epic-owned.
  implication: the Epic evidence is a macOS measurement against Epic+Cloudflare. It says nothing about Humble on Windows; only a Humble-on-Windows measurement can.
- timestamp: 2026-11-11
  checked: src-tauri/src/login_window/humble_reveal.rs `rpc_humble_login_clear_storage` (lines 281-332)
  found: the storage step builds a plain `WebviewWindowBuilder` on `WebviewUrl::External(origin_url)` (the live Humble origin), `.visible(false)`, injects the clear script via `eval`, waits for the exfil navigation, then `window.close()`. No separate data directory: it is a sibling webview in the same app, so it shares the app-wide jar the cookie step census reads. The window is a real navigation of https://www.humblebundle.com, i.e. the same class of window the cookie step used to open before 813bc7c6c (which measurably re-wrote cookies during the clear).
  implication: mechanism for a re-seed is present in the code path; whether Humble's page actually sets cookies on a cookie-less first load, and whether they land before `window.close()` returns, is unmeasured.
- timestamp: 2026-11-11
  checked: where the existing TS census line lands on this Windows machine (`%LOCALAPPDATA%\GameLib\logs\gamelib.log`, the 09:14 disconnect run already in the file)
  found: `Humble disconnect: cookie census before(total=97, matched=31, verdict=SUPPORTED_NONEMPTY) after(total=66, matched=0, verdict=SUPPORTED_NONEMPTY) deleted=31 survivingNonHumble=66` at 09:14:00, `cleared 31 humblebundle.com cookie(s)` at 09:14:00, `cleared storage — localStorage=22, sessionStorage=0, indexedDB=1, caches=0, serviceWorkers=0` at 09:14:01. (Count-only lines from the operator's earlier run; no names/domains.) `[shell]` lines are NOT in this file.
  implication: sidecar `logInfo` lines land in gamelib.log, so a TS-side census line is greppable there, and the cookie step's closing `after(total=66, matched=0)` is the pre-storage reference (66 non-Humble cookies means the read channel is live, so a later matched=0 is trustworthy). The storage step starts ~1 s after the cookie step ends.
- timestamp: 2026-11-11
  checked: tests that parse humble/user.ts source: src/backend/sidecar/__tests__/seamBranchParity.test.ts
  found: it extracts the `wipeSteps` labels from the source and throws `unrecognized wipeSteps label` for any label not in CATEGORY_MAP.
  implication: the diagnostic must NOT add a new wipeSteps entry; it is a helper called from inside the existing clearHumbleStorage step instead.

- timestamp: 2026-11-11
  checked: TEMP-DIAG build and desk gates
  found: |
    Change (UNCOMMITTED, working tree only, one file): src/backend/humble/user.ts. Adds `tempDiagPostStorageJarCensus(seam)` (module-level helper, marked TEMP-DIAG, with `type LoginWindowSeam` added to the existing loginWindowSeam import) and ONE call to it at the end of the existing 'clearHumbleStorage' step. It opens a quiet window on HUMBLE_COOKIE_CLEAR_HANDLE_ORIGIN, reads the jar via `seam.cookiesForDomain(label, 'humblebundle.com', [])` immediately and again after a 2000 ms unref'd settle, logs ONE line, closes the window in a finally. Whole helper is try/catch/finally and non-fatal; no new wipeSteps label (seamBranchParity parses labels).
    Log line (sidecar logInfo -> %LOCALAPPDATA%\GameLib\logs\gamelib.log):
      `[TEMP-DIAG humble-storage-reseed] post-storage jar census immediate(total=N, matched=M, verdict=V) settled+2000ms(total=N2, matched=M2, verdict=V2)`
    Gates: `tsc --noEmit` exit 0; `prettier --file-info` -> ignored:false / typescript, `prettier --check src/backend/humble/user.ts` clean; `eslint src/backend/humble/user.ts` clean; esbuild sidecar bundle (to a temp path) contains the marker twice (`pnpm tauri:dev` runs `pnpm build:sidecar` first, so the dev run picks it up). Jest: seamBranchParity PASS; humble user.test.ts 110 passed, 1 failed: 'the window is closed exactly once, after the census, on the census-failure path too' expects `mockSeamClose` x1, receives x2 (the cookie window + the diag window). That is the diagnostic's second window, expected; the test is NOT changed because the diag is not to be committed. The suite also takes ~43 s instead of a few seconds because each of 23 disconnect() calls now waits the 2 s settle.
  implication: build is ready for the operator live gate. Not committed.

- timestamp: 2026-11-11
  checked: operator live run of the TEMP-DIAG build (Windows 11, pnpm tauri:dev, Humble sign-in then disconnect), gamelib.log, count-only lines
  found: |
    (09:52:13) Humble disconnect: cookie census before(total=106, matched=31, verdict=SUPPORTED_NONEMPTY) after(total=75, matched=0, verdict=SUPPORTED_NONEMPTY) deleted=31 survivingNonHumble=75
    (09:52:14) Humble disconnect: cleared storage -- localStorage=23, sessionStorage=0, indexedDB=1, caches=0, serviceWorkers=0
    (09:52:16) [TEMP-DIAG humble-storage-reseed] post-storage jar census immediate(total=77, matched=2, verdict=SUPPORTED_NONEMPTY) settled+2000ms(total=77, matched=2, verdict=SUPPORTED_NONEMPTY)
    Arithmetic: total 75 -> 77 and matched 0 -> 2 across the storage step; both post-storage reads agree and survivingNonHumble stays 75 (the whole delta is humblebundle.com cookies). The read channel is live (75-77 non-empty), so matched=0 -> matched=2 is a real change, not a blind read.
  implication: OUTCOME B. The storage step's hidden window on the LIVE Humble origin re-seeds humblebundle.com cookies AFTER the cookie step's closing census certified the jar clean. Latent defect confirmed on Windows, same class as Epic's (macOS). Identical immediate/+2s reads exclude a late writer (outcome C), so reordering alone is sufficient: a cookie sweep that starts after the storage window has closed sees every re-seeded cookie; no settle and no Epic-style post-sweep is needed. The two seeded cookies were invisible to the existing reconnect check (it only looks for session cookies), which is why nothing else could have caught this.

- timestamp: 2026-11-11
  checked: fix + desk gates (UNCOMMITTED, working tree: src/backend/humble/user.ts, src/backend/humble/__tests__/user.test.ts)
  found: |
    TEMP-DIAG fully removed (helper, `type LoginWindowSeam` import change, call site, settle): user.ts restored from `git show HEAD:...` (no `git checkout`, husky post-checkout runs pnpm i), then the fix applied. `grep -c "TEMP-DIAG|tempDiag" user.ts` = 0; diff vs HEAD has no import line changes.
    Fix: wipeSteps order is now [clearHumbleStorage, clearHumbleCookies]; ORDER IS LOAD-BEARING comment on the array cites this measurement (matched 0->2, 75->77, stable at +2000 ms) and Epic's; the old "second, INDEPENDENT step" prose and the "cookie step above" cross-references updated; a closing-read comment on the cookie step's `after` census. The cookie step stays the last jar-touching step; its `after` census is the closing read. No Epic-style post-sweep added (evidence does not demand it).
    Fatality confirmed unchanged: the guarded loop is uniform, no Humble step is fatal; the credential (configStore.clear + keyring + library/sync stores) is wiped BEFORE the loop. A cookie-step throw (e.g. rejected open()) now leaves the storage window's re-seeded cookies, where the old order left the ORIGINAL session cookies in the same failure -- not a new exposure.
    Tests added (user.test.ts, `describe.each` over non-macOS and macOS, 6 tests): clearStorage invoked before every jar-touching cookie-step call (open, 2 census reads, clearCookies; asserts 4 calls so it cannot pass vacuously); the closing census read is the last jar read and follows both clearCookies and clearStorage; the `cleared storage` log line precedes the `cookie census` log line (what the operator greps). Behavioural via mock invocationCallOrder, not a source gate (Epic's is a source gate only because its mocked storage step sets no cookies; call ORDER itself is observable here). Existing 'a rejecting clearCookies step does not prevent the storage step' test kept (now holds by construction; comment added).
    Gates: `tsc --noEmit` exit 0; `prettier --check` clean on both files (neither is prettier-ignored); `eslint` on both files 0 errors (5 pre-existing warnings, none in new lines); jest humble/__tests__/user.test.ts + sidecar seamBranchParity 117/117 pass (seamBranchParity parses labels, not order, and is order-insensitive); adjacent suites src/backend/humble/** + epicLogoutDomains 751 pass, with the 6 failures all in sidecar humbleFlows.test.ts (EPERM renaming gamelib.log in the jest temp home -- the known Windows-local class; reproduced IDENTICALLY (6 failed / 29 passed) with user.ts restored to HEAD, so unrelated to this change).
    Mutation check: wipeSteps swapped back to [cookies, storage] -> all 6 new order tests RED (6 failed, 82 passed); restored -> green. The swapped file was restored byte-identical from a saved copy.
  implication: fix is ready for the live re-run. Not committed (orchestrator instruction).

- timestamp: 2026-11-11
  checked: operator live re-run of the FIXED build (Windows 11, one run), gamelib.log, count-only lines
  found: |
    (10:04:07) Humble disconnect: cleared storage -- localStorage=21, sessionStorage=0, indexedDB=1, caches=0, serviceWorkers=0
    (10:04:09) Humble disconnect: cookie census before(total=115, matched=30, verdict=SUPPORTED_NONEMPTY) after(total=85, matched=0, verdict=SUPPORTED_NONEMPTY) deleted=30 survivingNonHumble=85
    (10:04:09) Humble disconnect: cleared 30 humblebundle.com cookie(s)
    New order observed: storage cleared at 10:04:07, BEFORE the cookie census at 10:04:09, and the cookie step's closing census (matched=0, total=85, non-empty so the read channel is live) is the last thing that touches the jar. `deleted=30` equals `before matched=30`.
  implication: CONFIRMED FIXED on Windows, with these limits recorded honestly. (1) One run only. (2) The soft signal in `expecting` was NOT shown: `before matched=30`, not 31-33. The jar contents vary run to run (31, 31, 30 across the three disconnects measured today) and the storage window can overwrite keys that already exist, so the count is not a pass criterion and its absence does not weaken the result. (3) The reconnect check PASSED on this post-fix run (operator report): reconnecting Humble asked for login. It cannot see non-session cookies, so it corroborates the census rather than replacing it. (4) No independent post-cookie census exists (TEMP-DIAG was removed), so `after matched=0` is the same read channel that read matched=0 before the old order re-seeded behind it. Trust rests on structure, not on a second count: nothing in wipeSteps runs after the cookie step, and the six order tests pin that.

## Eliminated

- hypothesis: no re-seed on Windows (storage window does not write cookies; Epic's measurement was macOS/Cloudflare-specific)
  eliminated_by: live post-storage census matched=0 -> 2 (immediate and +2000 ms), 2026-11-11.
- hypothesis: outcome C -- a late writer after the storage window closed (reorder alone insufficient)
  eliminated_by: immediate and +2000 ms post-storage reads identical (total=77, matched=2 both).

## Resolution

root_cause: Humble's disconnect() ran clearHumbleCookies first and clearHumbleStorage last. Storage is origin-scoped, so the storage step loads a real document from the live Humble origin in a hidden window, and Humble's page sets humblebundle.com cookies on that load (measured: 2 cookies, jar 75 -> 77, identical immediately and 2000 ms later). Because the storage step ran after the cookie step, nothing swept those cookies and the cookie step's closing census (matched=0) had already certified a jar that was no longer clean. The reconnect check only sees session cookies, so the leftover was invisible to it. Same defect class Epic measured on macOS (`__cf_bm`).
fix: wipeSteps reordered to [clearHumbleStorage, clearHumbleCookies] in src/backend/humble/user.ts, with an ORDER IS LOAD-BEARING comment citing this measurement and Epic's. The cookie step is now the last jar-touching step and its `after` census is the closing read. No Epic-style post-sweep and no settle added (the identical immediate/+2000 ms reads show the storage window is the writer, so running the clear after it has closed is sufficient). No Humble wipe step is fatal and the credential is wiped before the loop, so the reorder does not change which failure is fatal. Six behavioural order tests (macOS and non-macOS arms) pin it and were mutation-checked red against the old order.
verification: Desk gates: tsc clean, prettier clean, eslint 0 errors, jest humble user.test.ts + seamBranchParity 117/117, mutation check red (6 failed) against the old order. Live (Windows 11, ONE run of the fixed build): `cleared storage` (10:04:07) logged before `cookie census before(matched=30) after(matched=0) deleted=30` (10:04:09), `cleared 30 humblebundle.com cookie(s)`. Reconnect check passed on the same post-fix run (reconnecting Humble asked for login; it cannot see non-session cookies, so it corroborates the census rather than replacing it). Limits: one run; the soft signal (before matched >= 31) not shown and is not a pass criterion; no independent post-cookie census exists, so trust rests on structure (nothing runs after the cookie step), as stated above. macOS not measured.
files_changed:
  - src/backend/humble/user.ts
  - src/backend/humble/__tests__/user.test.ts
commit: d9feed7b3
open_item: macOS Humble cookie-clear window still opens on the LIVE Humble origin (HUMBLE_BASE_URL); not measured for a live-page re-write during the clear. Recorded in the closed todo's Resolution, no new todo opened.
