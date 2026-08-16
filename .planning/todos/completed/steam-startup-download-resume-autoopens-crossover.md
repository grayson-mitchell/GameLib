---
title: Startup download-resume silently auto-opens Steam-in-CrossOver for bottle games
date: 2026-07-13
priority: medium
scope: "Phase 3 (feat 03-04) / Phase 17 (CrossOver bottle) — NOT Phase 18"
source: 18-UAT.md test 1
---

# Startup install-poll resume auto-launches Steam-in-CrossOver

**Observed (Phase 18 UAT, test 1):** On launching GameLib, the last-played bottle
game *All Will Fall* "said it was updating steam" and auto-opened Steam inside
CrossOver — with no prompt.

**Root cause (diagnosed, not a Phase 18 regression):** `SteamLibraryManager.init()`
in `src/backend/storeManagers/steam/library.ts` calls `scanDownloadingAppIds()` and,
for any appId with a download/update in progress on disk, calls
`startInstallPolling(appId)` ("D-07 resume"). For a game installed in a CrossOver
bottle (Phase 17), resuming that poll drives the update through the bottled Windows
Steam client, which surfaces as "updating steam" + Steam auto-opening in CrossOver.

- Introduced in commit `d9f25fe5` — `feat(03-04): implement ACF install poller,
  startup resume, and install wiring` (2026-06-28), well before Phase 18.
- Phase 18's `library.ts` diff has **zero** occurrences of `startInstallPolling`/the
  resume path — confirmed not caused by this phase (mac_arch propagation + path
  containment only).

**Why it matters:** Resuming an interrupted download on startup is intended, but
silently launching Steam-in-CrossOver (a heavy, visible action) with no notice is
surprising. It reads as "the app did something on its own."

**Consider:**
- Notify/toast instead of a silent bottle-Steam launch on resume ("Resuming download
  for <game>…"), or
- A confirm gate before resuming a bottle download on startup, or
- At minimum, log/telemetry so the behavior is discoverable.

**Do NOT** fold into Phase 18 gap closure — this is Phase 3/17 territory. Triage under
the CrossOver-bottle install UX when that area is next revisited.

## Resolution 2026-08-16 — FIXED, more completely than this todo asked (quick task 260816-i8a)

This todo offered three escalating options: a notify/toast, a confirm gate, or at minimum a log
line. What shipped is stronger than all three — **the startup auto-resume was removed outright**,
so the silent bottle-Steam launch this note describes can no longer occur at all.

Current behaviour, `src/backend/storeManagers/steam/library.ts:536-584`:

- The `scanDownloadingAppIds()` loop no longer calls `startInstallPolling(appId)`. It only
  **surfaces** the interrupted install: sets `install.steamResumePending: true` on the cached
  `GameInfo`, writes it back, and pushes it to the frontend via `pushGameToLibrary`.
- It logs `"has an interrupted install detected on startup — surfacing as resumable, NOT
  auto-resuming"` (satisfying the "at minimum" option).
- It fires a notification, `steam.resumeAvailable.notify` — *"An interrupted install for {{game}}
  is ready to resume — click Install to continue"* (satisfying the notify option).
- The actual resume moved into `resumeInterruptedSteamInstall()`, which the surrounding comment
  states *"only runs when the user explicitly triggers it (their own Install click — see
  `SteamGame.install()`)"* (satisfying, and exceeding, the confirm-gate option).

Two hardening details landed alongside, worth knowing if this area is revisited: the loop skips
any appId already owned by a live in-process install (`isNativeInstallInFlight`, T-23-14), and it
is wrapped in outer *and* per-appId try/catch so neither a scan failure nor one game's surface
step can block startup.

Closed as fixed. The remaining Steam-startup concern in this area is tracked separately and is
about crash mitigation, not auto-launch.
