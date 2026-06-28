# Phase 3: Game Operations - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can launch, install, and uninstall Steam games from within GamerLib. Every
operation **delegates to the Steam client via `steam://` URLs** — GamerLib fires
the URL (`steam://rungameid/{appId}`, `steam://install/{appId}`,
`steam://uninstall/{appId}`) and the Steam client performs the actual launch,
download, or removal. GamerLib does not download, run, or manage game files
itself.

Windows-only Steam games on Linux run through **Steam's own Proton** —
`steam://rungameid` hands them to Steam, which applies Proton. GamerLib must never
route a Steam game through Heroic's Wine/Proton layer.

The launch mechanism is **locked by CLAUDE.md** (`shell.openExternal()` +
`steam://` protocol). No research is needed on *how* to fire operations — this
phase is about the UX and state behavior *around* the hand-off.

**Out of scope:** real download/progress bars (Steam owns the download, GamerLib
has no visibility into it), in-GamerLib game settings/Wine config for Steam
games, save sync, repair/verify, move-install. Those are Steam-managed.

</domain>

<decisions>
## Implementation Decisions

### State Reconciliation
- **D-01:** After firing `steam://install` or `steam://uninstall`, detect the new
  install state by **re-reading ACF manifests on window focus** — when GamerLib's
  main window regains focus (user tabs back from Steam), re-read ACF for changed
  games and update install badges. No background polling loop. Builds on Phase 2
  D-10 (install state always read live from ACF on disk).
- **D-02:** Install state is **never assumed** from a click. GamerLib does not
  optimistically flip a badge to "installed" when the URL fires — the badge only
  changes once ACF re-read on focus confirms the real state.

### Hand-off Feedback
- **D-03:** On click of Install / Play / Uninstall, show a **brief toast** (e.g.
  "Opening in Steam…") confirming the hand-off, then nothing further — Steam
  takes over. No persistent in-app progress indicator (GamerLib has no progress
  data).

### Button Surface
- **D-04:** For Steam games, GamePage shows **only Play, Install, and Uninstall**.
  Unsupported Heroic actions (Settings, Move install, Repair, Verify) are
  **hidden entirely** — no greyed-out/disabled controls, no "managed by Steam"
  tooltips. Keep the action surface clean.

### Uninstall Flow
- **D-05:** Uninstall **delegates straight to Steam** — fire `steam://uninstall`
  and let Steam show its own confirmation dialog. GamerLib does **not** show its
  own pre-confirmation. Single source of truth, no double-dialog.

### Proton (GAME-04)
- **D-06:** Proton is **fully delegated to Steam**. `steam://rungameid` is the
  only launch path for Steam games; Steam decides Proton vs native. GamerLib adds
  **no** Proton/Wine selection UI and must not intercept Steam launches into
  Heroic's compatibility layer. GAME-04 is satisfied by *not* doing anything
  Heroic-specific, not by adding Proton handling.

### Claude's Discretion
- Exact toast wording and which toast/notification mechanism to use (follow the
  existing frontend toast pattern in `GlobalStateV2.ts` / `GlobalState.tsx`).
- The precise window-focus hook in the backend (Electron `BrowserWindow`
  `'focus'` event) and how it triggers a scoped ACF re-read + frontend push.
- Whether re-read on focus scans the whole library or only games with a recently
  fired operation — pick the simpler correct option.
- Edge handling when Steam is not running at URL-fire time (the OS launches Steam;
  Steam-not-installed was already handled in Phase 1 AUTH-05). Log and proceed.
- IPC message names for any operation/state-update events.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Steam Game Operations (the stubs to implement)
- `src/backend/storeManagers/steam/games.ts` — `SteamGame implements Game`; all
  operation methods are currently stubbed with "not implemented until Phase 2"
  throws. Phase 3 implements: `launch()`, `install()`, `uninstall()`,
  `isGameAvailable()`, and the no-op/delegate shape of `stop()`,
  `forceUninstall()`, plus `getSettings()`/`getExtraInfo()` as needed by the UI.
- `src/backend/storeManagers/steam/library.ts` — Phase 2 library manager; ACF
  install-state reading lives here (re-read on focus reuses this logic).
- `src/common/types/game_manager.ts` — `Game` interface contract every method
  must satisfy.

### Operation Mechanism (locked)
- `CLAUDE.md` §Game Launching — `shell.openExternal('steam://rungameid/{appId}')`
  for launch; `steam://install/{appId}` and `steam://uninstall/{appId}` for
  install/uninstall. Cross-platform, honors per-game Steam launch options.
- `src/backend/utils.ts`, `src/backend/main.ts` — existing `shell.openExternal`
  usage to follow.

### Frontend Game UI
- `src/frontend/screens/Game/GamePage/index.tsx` — GamePage; where Play/Install/
  Uninstall buttons live and where unsupported actions must be hidden for
  `runner === 'steam'`.
- `src/frontend/screens/Game/GamePage/components/` — action button components.
- `src/frontend/screens/Game/GameContext.tsx` — game-level context for the page.
- `src/frontend/state/GlobalStateV2.ts` / `src/frontend/state/GlobalState.tsx` /
  `src/frontend/state/ContextProvider.tsx` — toast/notification + library state;
  source of the hand-off toast and the focus-driven badge refresh.

### Backend Window / IPC
- `src/backend/main_window.ts`, `src/backend/main.ts` — `BrowserWindow`
  creation; attach the `'focus'` listener that triggers ACF re-read.
- `src/backend/ipc.ts` — `sendFrontendMessage` pattern (used in Phase 2
  `games.ts` as `sendFrontendMessage('pushGameToLibrary', ...)`) for pushing
  updated install state to the frontend after focus re-read.

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — GAME-01 (launch), GAME-02 (install),
  GAME-03 (uninstall), GAME-04 (Proton via Steam, not Heroic Wine).
- `.planning/ROADMAP.md` — Phase 3 success criteria.

### Prior Phase Decisions (carry forward)
- `.planning/phases/02-steam-library/02-CONTEXT.md` — D-10 (install state always
  from ACF on disk), D-03 (once-per-session sync + manual Refresh button).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SteamGame` class in `steam/games.ts` already exists with the full `Game`
  method surface stubbed — Phase 3 fills in the bodies, no new class needed.
- ACF manifest parsing from Phase 2 (`steam/library.ts`) is reusable for the
  focus-driven re-read; no new VDF/ACF code required.
- `sendFrontendMessage('pushGameToLibrary', gameInfo)` already used in Phase 2 to
  push enriched game state — same channel can push updated `is_installed`.
- Existing toast/notification mechanism in the frontend state layer for the
  "Opening in Steam…" feedback.

### Established Patterns
- `shell.openExternal()` is already the project's way to fire external URLs.
- Heroic's GamePage conditionally renders action buttons by `runner` — Steam adds
  another branch that hides Settings/Move/Repair/Verify.
- `LogPrefix.Steam` for logging (established Phase 1).

### Integration Points
- `BrowserWindow 'focus'` event (backend) → scoped ACF re-read → `sendFrontendMessage`
  → frontend updates install badges. This is the one genuinely new wiring.
- GamePage action area gates unsupported buttons on `runner === 'steam'`.

</code_context>

<specifics>
## Specific Ideas

- The whole phase is a thin delegation layer: GamerLib's job is to fire the right
  `steam://` URL, show a confirming toast, and reconcile state on focus. Resist
  building anything that mirrors Steam's download/progress state — GamerLib
  cannot see it.
- GAME-04 is satisfied by *absence* of Heroic Wine routing for Steam games, not
  by adding Proton logic. Planner/executor should verify Steam launches do not
  pass through Heroic's runtime/Wine code paths.

</specifics>

<deferred>
## Deferred Ideas

- **In-app download progress for Steam installs** — not possible via `steam://`;
  would require deeper Steam client integration. Out of scope, likely never.
- **Per-game launch options / Proton version picker in GamerLib** — Steam owns
  this; deferred indefinitely.
- **Repair / Verify integrity from GamerLib** — Steam-managed; not in this phase.
- **Active operation tracking ("Installing…" persistent card state)** — considered
  for hand-off feedback but rejected in favor of a simple toast (D-03); revisit
  only if users report the badge feeling stale despite focus re-read.

</deferred>

---

*Phase: 3-Game Operations*
*Context gathered: 2026-06-28*
