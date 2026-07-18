---
slug: steam-startup-resume-crash
status: resolved
trigger: "GameLib crashes ~15s after every launch (window vanishes, no dialog, no crash report). Root cause CONFIRMED: SteamLibraryManager.init -> scanDownloadingAppIds auto-resumes leftover StateFlags=1026 interrupted installs unattended on launch; the Cyberpunk (1091500) native auto-resume dies in the native download path and kills the main process."
created: 2026-07-18
updated: 2026-07-18
phase: 23-steam-full-ownership-install-stateflags-4
related_debug: .planning/debug/steam-cm-drop-planbuild.md
related_debug_2: .planning/debug/steam-install-slow-start.md
---

# Debug: Steam startup auto-resume of stale StateFlags=1026 installs crashes the app on launch

## Status: root cause CONFIRMED, design DECIDED — this session implements the fix

## Symptoms

- App opens, is responsive ~a few seconds, then the window just VANISHES — no crash dialog ("A JavaScript error occurred in the main process" NEVER appears), no macOS DiagnosticReport (.ips) generated today, and nothing logged after the last line. Reproducible on EVERY launch.
- Surfaced 2026-07-18 during Phase 23 Gate 1 hardware UAT (macOS, Apple Silicon), branch fix/steam-list-view-store-label.

## Root cause (CONFIRMED — proven by mitigation)

On launch, `SteamLibraryManager.init()` runs `scanDownloadingAppIds()` (src/backend/storeManagers/steam/library.ts:~1568), which scans ACF `StateFlags` across the native steamapps root AND the CrossOver bottle steamapps root and returns every appId whose bit-4 (value 4, FullyInstalled) is UNSET as "resumable". Two leftover `StateFlags 1026` (=1024+2, bit-4 unset) manifests existed:
- `appmanifest_1091500.acf` (Cyberpunk 2077, NATIVE steamapps) — 90GB / 3 macOS depots
- `appmanifest_990080.acf` (Hogwarts Legacy, BOTTLE steamapps) — Windows-only (`os=windows -> depots []`)

init() then AUTO-RESUMES these unattended: log shows `Starting the Download Queue` -> `Steam: starting install polling for appId 1091500 (source native)` -> `Preventing machine to sleep` (download started) -> then the app dies. An unhandled `axios 404` fires in that path (only a WARNING in this runtime — the log literally says unhandled rejections don't terminate — so the 404 is a real bug but NOT the fatal). The DownloadManager persisted queue is EMPTY (`store/download-manager.json` -> `"queue": []`); the trigger is the startup-resume path, NOT the DM queue.

Death signature (no JS dialog + no crash report + silent vanish + right after the download/decompress machinery spins up at "Preventing machine to sleep") points to a NATIVE fatal in the depot download/decompress worker path (worker_threads / native lzma / OOM), i.e. NOT catchable by a JS try/catch.

**Mitigation applied (reversible, confirmed the diagnosis):** moved both manifests to `~/Library/Application Support/gamelib/crash-mitigation-backup-20260718/` (native-appmanifest_1091500.acf, bottle-appmanifest_990080.acf). After the move the app launches and stays up. See memory `steam-startup-resume-crash-mitigation`.

## Decided fix design (user decision 2026-07-18)

**"Surface as Resume + harden"** — chosen over "keep auto-resume, harden only" precisely because the fatal looks native (a JS try/catch around the resume loop cannot stop a native segfault), so the robust fix is to NOT auto-start the heavy download unattended on launch.

1. **Startup detects, does NOT auto-download.** Change the `scanDownloadingAppIds` consumption in `SteamLibraryManager.init()` so a leftover interrupted (StateFlags=1026) install is DETECTED and surfaced as *resumable* (user must click Resume), instead of unattended-auto-resuming/downloading it on launch. Nothing heavy runs on boot. This softens Phase 23 **D-04** from auto-resume to user-initiated resume — update the D-04 record accordingly.
2. **Surface a "Resume" affordance** in the frontend for a Steam game left in the interrupted/resumable state (reuse existing install/resume UI patterns; do not invent a bespoke Steam-only surface if the DownloadManager/library button already expresses a resumable state).
3. **Catch the unhandled axios 404** in the resume/metadata/download path so no unhandled rejection leaks (use --trace-warnings to locate the exact call if needed).
4. **Harden per-appId**: any failure while detecting/surfacing a resumable install must be caught per-appId and never crash init/startup.
5. **Layer-3 / verification (may be follow-up):** the native fatal in the depot download/decompress path still exists for a *user-initiated* Cyberpunk resume/install — pin it (worker pool / lzma / OOM) OR confirm the design change is sufficient for shipping and file the native crash as a tracked follow-up. The launch crash itself is prevented by fix #1 regardless.

## Scope fence

- Do NOT touch: the Phase-23 single-flight guard (games.ts nativeInstallsInFlight), the StateFlags 4-vs-1026 completeness gate, buildid threading, or file-mode logic.
- Do NOT weaken D-UAT-05/D-UAT-06 abort/error-vs-cancel semantics; do NOT regress GOG/Epic/Amazon or the plan-build/chunk retry.
- OUT OF SCOPE: the separate ~30s pre-download latency (its own session steam-install-slow-start) and the reuben.exe CrossOver bottle crash.
- The uncommitted `[Timing]` instrumentation (depot.ts/games.ts/installLocation.ts/user.ts) belongs to the latency session — leave it or coordinate; do not revert it as part of this fix.
- Keep the 4 steam suites green; add regression coverage (startup-resume surfaces-not-downloads a 1026 install; init never throws on a failing per-appId resume; axios 404 is caught).

## Current Focus

hypothesis: CONFIRMED — startup auto-resume of stale StateFlags=1026 manifests via scanDownloadingAppIds spins up the native depot download/decompress path unattended on launch and dies natively, taking down the main process. Fix = detect-and-surface-as-resume instead of auto-download, + catch the axios 404 + per-appId hardening.
next_action: DONE — human hardware verification confirmed the fix (2026-07-18). Session resolved and archived.

```yaml
reasoning_checkpoint:
  hypothesis: "SteamLibraryManager.init() auto-invoking locate->buildDepotPlan->reconcile->finalize->watch unattended on launch for any on-disk StateFlags=1026 manifest triggers a native fatal in the depot download/decompress machinery, silently killing the main process. Removing the unattended auto-drive (replacing it with detect+flag-only) removes the trigger regardless of whether the native fatal itself is ever root-caused."
  confirming_evidence:
    - "gamelib.log: starting install polling for appId 1091500 (source native) -> Preventing machine to sleep -> app dies ~13-16s later, no JS dialog, no .ips, no post-crash log line (native fatal signature, not JS-catchable)"
    - "Moving the two 1026 manifests (1091500, 990080) out of the steamapps roots stops the crash entirely (mitigation), and restoring either one reproduces it — isolates the trigger to scanDownloadingAppIds' consumption in init(), not to DownloadManager (queue was empty) or the axios 404 (runtime only warns on unhandled rejections, app survived 13s past the 404)"
    - "Working-tree diff confirms init() no longer calls buildDepotPlan/finalizeToSteam/downloadSteamDepots/setInterval for a detected 1026 appId — only library.set(steamResumePending:true) + notify(); the exact same heavy sequence was moved verbatim into resumeInterruptedSteamInstall(), gated behind a fired-by-user-click call site in SteamGame.install()"
  falsification_test: "If the app still vanished on launch after moving the heavy resume sequence out of init() (i.e. detect-only startup still crashed), this hypothesis would be refuted and the native fatal would have to be elsewhere (e.g. scanDownloadingAppIds' own ACF scan, or something else running at boot). Not yet re-tested on real hardware with the two backed-up manifests restored — this is the one blind spot requiring human verification below."
  fix_rationale: "The fix does not attempt to fix the native fatal itself (which may be unfixable from JS — a try/catch cannot stop a native segfault). Instead it removes the unattended trigger: nothing heavy runs on boot for a leftover 1026 install anymore, so the native fatal (wherever it lives) can no longer fire without explicit user consent (an Install click). This directly targets the confirmed mechanism (unattended auto-drive on launch), not a symptom."
  blind_spots: "(1) Not yet re-verified on the real hardware where this reproduced (Apple Silicon Mac, Cyberpunk 1091500) with the manifest restored from crash-mitigation-backup-20260718 — self-verification below is unit-test-level only. (2) The native fatal for a USER-INITIATED resume/install of Cyberpunk is still unfixed (item 5 of the decided design, explicitly deferred as a tracked follow-up) — clicking Install on the resumable Cyberpunk entry could still crash; only the unattended-on-launch trigger is closed."
```

## Evidence

- timestamp: 2026-07-18 — gamelib.log: `15:25:50 starting install polling for appId 1091500 (source native)` -> `15:25:53 Preventing machine to sleep` -> `UnhandledPromiseRejectionWarning: AxiosError 404` -> app dies ~15:26:06. No dialog, no .ips, no post-crash log. `store/download-manager.json` queue empty. Moving the two 1026 manifests aside stops the crash (mitigation confirmed).

## Eliminated

- hypothesis: "DownloadManager persisted queue auto-resumes the failing install" — ELIMINATED: `store/download-manager.json` has `"queue": []`; the only entry is a finished/errored 990080. Trigger is scanDownloadingAppIds (startup-resume), not the DM queue.
- hypothesis: "the unhandled axios 404 is the fatal crash" — ELIMINATED: this runtime only WARNS on unhandled rejections (does not terminate); the app survived ~13s after the 404. The 404 is a real bug to fix but not the fatal death (which is native).
- hypothesis: "228980 (bottle) also triggers it" — ELIMINATED: 228980 is StateFlags 1030 (bit-4 SET) -> not classified resumable -> skipped.

- timestamp: 2026-07-18 (continuation session) — Reviewed uncommitted working-tree diff (types.ts, library.ts, games.ts, library.test.ts, games.test.ts) against the 5-point decided design: all 5 points implemented. `steamResumePending` flag added to `InstalledInfo`; `init()`'s scanDownloadingAppIds loop now only sets the flag + `notify()`s the user (per-appId try/catch, `existing` lookup wrapped, never throws) instead of calling `locate/buildResumeFinalizeOpts/finalizeToSteam/startInstallPolling`; the exact old heavy sequence was extracted verbatim into new exported `resumeInterruptedSteamInstall(appId)`, itself outer-try/catch hardened (never throws) and self-clears `steamResumePending` up front; `SteamGame.install()` calls it first (awaited, `.catch()`-wrapped) when the flag is set, then falls through to the normal install flow regardless of outcome; `getGameInfo()`'s one true fire-and-forget `fetchMetadataIfNeeded` call site now has an explicit `.catch()` (defense-in-depth — the function's own internal try/catch/finally around the axios call was already present and unchanged).
  implication: fix design is fully implemented, not just partially — this session is finish/verify only, no new production logic needed.

- timestamp: 2026-07-18 — Ran full `src/backend/storeManagers/steam/__tests__` (14 suites) with the working tree as-is: 568/568 pass, 0 failures. A post-suite `TypeError: Cannot read properties of undefined (reading 'map')` in `readAcfState`/`pollInstallOnce` fires from a leaked real setInterval AFTER all suites report passed — reproduced this exact same crash/location with our diff fully stashed (git stash) against the pre-existing base too (563/563 passed there). Confirmed PRE-EXISTING, unrelated to this fix, out of scope.
  implication: no test regressions introduced by this fix; the leaked-timer teardown warning is a pre-existing test-infra issue, not caused by or fixed in this session.

- timestamp: 2026-07-18 — Confirmed `fetchMetadataIfNeeded` (games.ts:413) already wraps its axios call in try/catch/finally (logs a warning on any error, including a 404, and never throws) — this predates the current session's diff. The new `.catch()` at the getGameInfo call site (games.ts:389) is defense-in-depth against a hypothetical future throw before/around that internal try. Point 3 of the decided design (catch the unhandled axios 404) is satisfied.
  implication: verification-bar item 3 (axios 404 caught, no unhandled rejection) confirmed via test (`games.test.ts`: "a fetchMetadataIfNeeded() rejection is caught at the call site and never surfaces as an unhandled rejection" — asserts `process.on('unhandledRejection', ...)` spy never fires) and via direct code read.

- timestamp: 2026-07-18 — Located the Phase 23 D-04 decision record at `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-CONTEXT.md` (line 27, under "Ownership scope boundary (D-2 reversal)"). Appended a "SOFTENED 2026-07-18" annotation directly under D-04 documenting that the *trigger* moved from unattended-on-launch to user-initiated (Install click), while the recovery logic itself (still GameLib-owned, chunk-verify + file-mode reapply + earns a trustworthy 4) is unchanged and now lives in `resumeInterruptedSteamInstall()`.
  implication: verification-bar item 5 (update D-04 record) satisfied.

- timestamp: 2026-07-18 — Used `git diff` per-file to attribute the tangled uncommitted working tree: `depot.ts`, `installLocation.ts`, `user.ts` are 100% `[Timing]` instrumentation (steam-install-slow-start session, confirmed by reading full diffs — no crash-fix logic present). `games.ts` has 5 hunks: 3 are this fix (import, getGameInfo .catch(), install() steamResumePending check) and 2 are `[Timing]` instrumentation inside `runNativeDepotDownload` (unrelated latency logging). Used `git add -p` to stage only the 3 crash-fix hunks in games.ts; left the 2 Timing hunks unstaged/untouched in the working tree for the other session.
  implication: a clean commit is possible without disturbing the sibling session's uncommitted instrumentation.

- timestamp: 2026-07-18 — Fix committed as `416ff217` ("fix: stop auto-resuming interrupted Steam installs on launch (silent crash)"). HUMAN HARDWARE VERIFICATION performed (user explicitly authorized running it on their behalf): both StateFlags=1026 manifests restored from `crash-mitigation-backup-20260718` to their live steamapps locations (native `appmanifest_1091500.acf` Cyberpunk 90GB/3-depot; bottle `appmanifest_990080.acf` Hogwarts Legacy Windows-only) — the exact prior crash trigger reproduced. Launched the fixed dev build (`electron-vite dev --watch`, HEAD 416ff217) and observed through and beyond the prior crash window (~2 minutes). RESULT: app stayed up — main Electron process (42631) + both renderer processes alive 2+ min later, log active, no silent vanish. New log line at 16:33:48: "Steam: appId 1091500 has an interrupted install detected on startup — surfacing as resumable, NOT auto-resuming". Old crash-path signatures (`starting install polling for appId 1091500`, `Preventing machine to sleep`) ABSENT. No unhandled rejection / axios 404 / fatal in the log (only a pre-existing, unrelated Legendary `installed.json` ENOENT warning — Heroic baseline, out of scope). Caveat: the user-initiated Resume/Install GUI click path was NOT exercised (cannot drive the UI) — this is the deliberately-deferred native-fatal-on-user-resume follow-up (design item 5), not a gap in this session's verification scope.
  implication: hardware verification confirms the fix closes the unattended-on-launch crash. The user-initiated resume native-fatal remains open as a tracked follow-up, unchanged from the decided design.

## Resolution

root_cause: |
  SteamLibraryManager.init() called scanDownloadingAppIds() on every launch and,
  for every on-disk StateFlags=1026 (interrupted) manifest, UNATTENDEDLY drove
  the full locate -> buildDepotPlan -> reconcile -> finalize -> startInstallPolling
  sequence with no user consent. A leftover Cyberpunk (1091500) manifest triggered
  this, spinning up the native depot download/decompress machinery immediately
  after boot; a native fatal in that path (not JS try/catch-able — no dialog, no
  .ips, no post-crash log) killed the entire Electron main process ~13-16s later,
  on every single launch. A secondary, non-fatal bug (unhandled axios 404 in the
  metadata/resume path) was present alongside it but eliminated as the cause of
  death (this runtime only warns on unhandled rejections; confirmed the app
  survived past the 404).

fix: |
  Softened D-04 (Phase 23) from auto-resume to user-initiated resume:
  1. SteamLibraryManager.init() now only DETECTS a leftover interrupted install
     via scanDownloadingAppIds and flags the library entry `steamResumePending:
     true` + fires a desktop notification — no heavy work (buildDepotPlan/
     finalizeToSteam/startInstallPolling) runs unattended on boot anymore.
  2. The exact original heavy sequence was extracted into a new exported
     `resumeInterruptedSteamInstall(appId)` (library.ts) — same guarantees
     (chunk-verify, file-mode reapply, trustworthy StateFlags=4 when provably
     complete) — but it now only runs when the user's own Install click
     triggers it (SteamGame.install() in games.ts calls it first, when
     steamResumePending is set, before falling through to the normal install
     flow). This IS the "Resume" affordance — no bespoke UI was needed since
     the game still shows as not-installed and the existing Install button
     already expresses it, per the decided design's preference not to invent
     a new surface.
  3. Both init()'s per-appId surfacing step and resumeInterruptedSteamInstall()
     are wrapped in try/catch (outer AND per-appId/per-call) so neither a scan
     failure nor a single game's resume attempt can ever throw out to the
     caller or block startup/other appIds.
  4. getGameInfo()'s fire-and-forget fetchMetadataIfNeeded() call site now has
     an explicit .catch() (defense-in-depth on top of that function's existing
     internal try/catch/finally around the axios call) so the 404 (or any other
     metadata-fetch error) can never produce an unhandled promise rejection.
  5. The native fatal itself in the depot download/decompress path is NOT
     fixed by this change and remains a tracked follow-up for a future,
     user-initiated Cyberpunk resume/install (explicitly deferred — item 5 of
     the decided design). This session closes the unattended-on-launch crash
     only.
  Updated Phase 23 D-04 decision record (23-CONTEXT.md) to document the
  trigger softening.

verification: |
  - All 14 steam __tests__ suites pass (568/568), including new regression
    coverage: (a) init() surfaces-not-auto-resumes a 1026 install — asserts
    setInterval/finalizeToSteam/buildDepotPlan/downloadSteamDepots are NOT
    called and steamResumePending is set + pushed + notified; (b) init()
    never throws when per-appId surfacing fails (notify() throwing does not
    stop startup or leave the flag unset); (c) SteamGame.install() calls
    resumeInterruptedSteamInstall() first when steamResumePending is set, and
    a rejection there never blocks the real install; (d) the fire-and-forget
    fetchMetadataIfNeeded rejection is caught at the call site with an
    explicit unhandledRejection listener assertion.
  - Confirmed via git-stash A/B comparison that a leaked-timer teardown
    warning after the full suite run is PRE-EXISTING (reproduces identically
    against the pre-fix base), not introduced by this fix.
  - HARDWARE VERIFICATION (human-confirmed 2026-07-18, run on user's behalf
    with explicit authorization): both StateFlags=1026 manifests restored
    from crash-mitigation-backup-20260718 to their live steamapps locations
    (native appmanifest_1091500.acf Cyberpunk 90GB/3-depot; bottle
    appmanifest_990080.acf Hogwarts Legacy Windows-only), reproducing the
    exact prior crash trigger. Fixed dev build (electron-vite dev --watch,
    HEAD 416ff217) launched and observed through and beyond the prior crash
    window (~2 min). App stayed up: main Electron process + both renderer
    processes alive 2+ min later, log active, no silent vanish. New log line
    "Steam: appId 1091500 has an interrupted install detected on startup —
    surfacing as resumable, NOT auto-resuming" fired at 16:33:48. Old
    crash-path signatures ("starting install polling for appId 1091500",
    "Preventing machine to sleep") ABSENT. No unhandled rejection / axios 404
    / fatal in the log (only a pre-existing unrelated Legendary
    installed.json ENOENT warning — Heroic baseline, out of scope).
  - Caveat / NOT covered by this verification: the user-initiated Resume/
    Install GUI click path was not exercised (cannot drive the UI in this
    session). This is the deliberately-deferred native-fatal-on-user-resume
    follow-up (design item 5) — see deferred_followup below — not a
    regression or gap of this fix.

deferred_followup: |
  The native fatal in the depot download/decompress path for a
  USER-INITIATED Cyberpunk (or any Steam) resume/install remains UNFIXED and
  is explicitly out of scope for this session (item 5 of the decided design).
  Clicking Install/Resume on a game left in steamResumePending state still
  routes through resumeInterruptedSteamInstall() -> the same native
  download/decompress machinery that crashed the app when it ran unattended
  on launch — that machinery itself was never root-caused (native, not
  JS-catchable). This session only removed the unattended-on-launch trigger;
  it did not verify or fix the native path when a user deliberately
  triggers it. Track as a follow-up: pin down the native fatal (worker pool
  / lzma / OOM in the depot download/decompress worker) or otherwise harden
  the user-initiated resume/install flow before shipping StateFlags=4 full
  ownership install (Phase 23) with confidence.

files_changed:
  - src/common/types.ts (steamResumePending?: boolean flag on InstalledInfo)
  - src/backend/storeManagers/steam/library.ts (init() detect-not-auto-download;
    new exported resumeInterruptedSteamInstall())
  - src/backend/storeManagers/steam/games.ts (install() consumes
    steamResumePending via resumeInterruptedSteamInstall(); getGameInfo()
    fetchMetadataIfNeeded call site hardened with explicit .catch())
  - src/backend/storeManagers/steam/__tests__/library.test.ts (regression
    coverage for detect-not-auto-download + per-appId hardening + D-05 tests
    repointed at resumeInterruptedSteamInstall())
  - src/backend/storeManagers/steam/__tests__/games.test.ts (regression
    coverage for resume-on-install-click + unhandled-rejection hardening)
  - .planning/phases/23-steam-full-ownership-install-stateflags-4/23-CONTEXT.md
    (D-04 decision record annotated with the 2026-07-18 softening)
