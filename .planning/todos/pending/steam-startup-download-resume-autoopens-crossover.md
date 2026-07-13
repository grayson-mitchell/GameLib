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
