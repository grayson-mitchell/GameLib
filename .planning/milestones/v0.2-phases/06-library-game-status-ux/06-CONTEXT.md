# Phase 6: Library & Game Status UX - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the library grid and download manager reflect accurate, real-time Steam
data. Two deliverables carry this phase:

1. **Real install size (LIB-06)** — replace the `'?? MB'` fallback in the
   download-manager queue with a real size for Steam games.
2. **"Playing" badge (GAME-05)** — show a Playing status on a Steam game's
   library card while a Steam session for that game is active, given launch is
   fire-and-forget (`steam://rungameid`).

**LIB-05 (playtime on grid tiles) is intentionally descoped** — see D-01.

New capabilities (store browsing, game-details enrichment, console mode) belong
to their own phases (7, 8) and are out of scope here.

</domain>

<decisions>
## Implementation Decisions

### Playtime display (LIB-05 — descoped)
- **D-01:** LIB-05 is satisfied by the existing **game-details page** display
  (`TimeContainer`, quick task `260628-pi7`). **Do NOT add playtime to library
  grid/list cards.** A prior attempt (Phase 02-05) added card playtime but it
  never rendered and was deliberately removed (`325cf7f4 refactor(steam):
  remove dead card playtime display`). The user confirms the details-page view
  is sufficient. This overrides LIB-05's original wording ("shown on
  library-grid tiles"); flag at phase transition so REQUIREMENTS.md records
  LIB-05 as **met via the details page**, not silently dropped.

### Install size (LIB-06)
- **D-02:** Source of the size is **Claude's discretion / research-driven** —
  the leading approach is the public Steam store `appdetails` API for a
  pre-install estimate, with the ACF `SizeOnDisk` as a truth-up once Steam has
  installed the game. Research picks the most reliable available source.
- **D-03:** **Best-effort is acceptable.** Show the best number we can obtain
  even if approximate; any real figure beats `'?? MB'`. If no figure is
  obtainable for a given app, the existing `'?? MB'` fallback stays. The queue
  is informational for delegated Steam installs — accuracy need not be exact.
- **D-04:** Scope this to the Steam runner path in
  `src/backend/downloadmanager/downloadqueue.ts` (the `'?? MB'` fallback at
  ~line 160). Do not alter the GOG/Epic/Amazon size behavior.

### Playing-session detection (GAME-05)
- **D-05:** Detect an active session via **Steam's own local running state**:
  the `RunningAppID` Steam maintains (`registry.vdf` on macOS/Linux;
  `HKCU\Software\Valve\Steam\RunningAppID` on Windows). Research confirms exact
  paths/keys per platform. This avoids needing the game's executable name and
  is the cleanest cross-platform signal. Process-scanning is the fallback only
  if the local-state signal proves unreliable.
- **D-06:** A **few-second poll cadence** is acceptable — the badge may appear
  or clear within ~5s of the game starting/stopping. No need for instant or
  event-driven detection. Poll only while the app window is open.

### Playing badge behavior (GAME-05)
- **D-07:** **Reuse the existing `isPlaying` UI** in `GameCard` (the same badge
  path Epic/GOG use). Feed the detected Steam session into that existing state
  rather than inventing a Steam-specific badge — keep the look/placement
  consistent.
- **D-08:** **Hide the Stop button for Steam** while a Steam game shows as
  Playing. GameLib never owned the process (fire-and-forget launch) and cannot
  kill the session, so the badge is **observe-only** — do not surface a Stop
  action that can't work. Do not change Stop behavior for other runners.

### Claude's Discretion
- Exact install-size source and fetch/caching strategy (D-02) — research picks.
- Exact per-platform `RunningAppID` read implementation and where the poller
  lives (D-05) — mirror the existing Steam ACF poll lifecycle in
  `steam/library.ts` where it fits.
- How the detected session state is plumbed from backend to the frontend
  `isPlaying` state (event vs. status update) — follow existing gameStatus
  patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs or ADRs — requirements are fully captured in the decisions
above. The relevant source files are listed under Integration Points below;
downstream agents should read those before modifying behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/frontend/screens/Library/components/GameCard/index.tsx` — already has an
  `isPlaying` concept (badge render + Stop action, `getCardStatus` in
  `constants.ts`). GAME-05 reuses this rather than adding new badge UI (D-07).
- `src/frontend/screens/Game/TimeContainer/index.tsx` — existing Steam playtime
  display on the details page; the reason LIB-05 is descoped (D-01).
- `src/backend/storeManagers/steam/library.ts` — Steam ACF install poller
  (`pollInstallOnce`, `activePolls`, StateFlags bit-4 parsing) and the
  owned-games/playtime sync (`steamPlaytimeMinutes`, `steamLastPlayed`). The
  Playing-session poller (D-05/D-06) should mirror this poll lifecycle.

### Established Patterns
- **Fire-and-forget Steam ops:** `SteamGame.launch()` fires `steam://rungameid`
  and deliberately does NOT call `sendGameStatusUpdate` ("Steam client owns the
  'playing' state", `steam/games.ts:249`). GAME-05 must derive playing state
  externally — GameLib has no process handle (drives D-05).
- **ACF/local-state as source of truth:** install status already comes from
  reading Steam's local files (ACF StateFlags), not from optimistic UI flips.
  D-05 extends the same philosophy to running state via `RunningAppID`.
- **Runner-gated changes:** existing Steam work guards behavior on
  `runner === 'steam'` to avoid touching GOG/Epic/Amazon. D-04 and D-08 follow
  this — Steam-only paths.

### Integration Points
- `src/backend/downloadmanager/downloadqueue.ts` (~line 160) — the `'?? MB'`
  fallback for Steam size (LIB-06 / D-02–D-04).
- `src/backend/storeManagers/steam/library.ts` — home for the running-state
  poller (GAME-05 / D-05–D-06), alongside the existing ACF poll registry.
- `src/backend/storeManagers/steam/games.ts` — `launch()` / status ownership;
  the badge state must be produced without a process handle.
- `src/frontend/screens/Library/components/GameCard/index.tsx` +
  `constants.ts` (`getCardStatus`) — where `isPlaying` renders and where the
  Steam Stop button must be hidden (D-07/D-08).

</code_context>

<specifics>
## Specific Ideas

- User explicitly verified the LIB-05 situation live: playtime shows on the
  **details page**, and they do not want it on the grid. Treat the details-page
  display as the requirement's satisfaction.
- Detection preference is concrete: Steam's `RunningAppID`, not process
  scanning, as the primary signal.

</specifics>

<deferred>
## Deferred Ideas

- **Grid/list-view playtime on cards** — considered and declined (D-01). If
  ever revisited, note the prior removal (`325cf7f4`) explaining the card
  layout never rendered it.
- **A working Steam "Stop" (close via `steam://`)** — declined for this phase
  (D-08); badge is observe-only. Could be revisited if a reliable Steam
  close-game path is found.

</deferred>

---

*Phase: 06-library-game-status-ux*
*Context gathered: 2026-07-02*
