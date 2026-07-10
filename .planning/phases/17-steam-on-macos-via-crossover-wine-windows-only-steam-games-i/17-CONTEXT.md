# Phase 17: Steam on macOS via CrossOver/Wine - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

On **macOS**, Windows-only Steam games (no native Mac build) install **and** launch
by running the **Windows Steam client inside a dedicated GameLib-managed CrossOver/Wine
bottle**, and installing/launching those games *through* that bottled Steam client — so
Steam DRM and the Steam runtime are satisfied — instead of the native `steam://`
delegation used today.

**In scope (macOS only):**
- A dedicated, GameLib-managed Steam bottle (provision the Windows Steam client into it).
- Making `SteamGame.isNative()` per-OS on macOS (return `is_mac_native`) so Windows-only
  games stop being treated as native.
- Routing install/launch of Windows-only Steam games on macOS through the bottled Steam
  client instead of native `steam://install` / `steam://rungameid`.
- The first-run guided bottle setup + bottled-Steam login flow.
- A UI indicator that a game runs through the bottle.

**Out of scope / unchanged:**
- **Linux is untouched** — Windows-only Steam games on Linux keep delegating to Steam
  Proton (Phase 3 GAME-04 stays intact there).
- **Windows is untouched.**
- **GOG/Epic Wine behavior is untouched** — they keep their existing shared prefix/bottle.
- Wine-running individual game `.exe`s directly (explicitly rejected in the locked
  architecture decision — only works for DRM-free games, breaks the Steam runtime).

</domain>

<decisions>
## Implementation Decisions

### Bottle Provisioning & Scope
- **D-01:** **Dedicated Steam bottle.** One GameLib-managed bottle runs the Windows Steam
  client, and ALL bottled Steam games install/launch through it. GOG/Epic keep their
  existing shared `GameLib` bottle / `sharedWinePrefix` — do NOT install Steam into that
  shared bottle. Rationale: Steam is a heavyweight *resident* client (steamwebhelper,
  overlay hooks, auto-updater) unlike a loose GOG/Epic game `.exe`; isolation lets Steam
  be reset/reinstalled without risking non-Steam games, and keeps this phase from reaching
  into GOG/Epic behavior.
- **D-02:** **Guided click-through provisioning.** GameLib creates the bottle and fetches
  `SteamSetup.exe`, then opens the real Steam installer window for the user to click
  through (robust to installer quirks; user sees progress). NOT fully silent/automated,
  NOT "point at an existing install."
- **D-03:** **Reuse `WineSelector` for engine choice.** The user picks the compatibility
  engine (CrossOver / Wine-GE / bundled Wine) for the Steam bottle, defaulting to what's
  detected (e.g. CrossOver if installed). Consistent with how GOG/Epic Wine games are
  already configured. NOT CrossOver-only, NOT a hidden no-choice managed engine.

### Bottled-Steam Login
- **D-04:** **User logs into the bottled Steam UI once.** The user signs into the real
  Windows Steam window (QR or credentials); its auth persists in the bottle prefix
  (`loginusers.vdf` + sentry) across launches. GameLib treats bottled-Steam auth as
  **opaque** — no attempt to bridge/inject GameLib's native `steam-session` refresh token
  into the Windows client (that path is unsupported/fragile).
- **D-05:** **Login happens during bottle setup** (part of the one-time guided flow), not
  lazily on first game launch — so later installs/launches "just work."
- **D-06 (guidance, not enforced):** The bottled Steam login SHOULD be the **same Steam
  account** as GameLib's native session, or ownership won't match between the listed
  library and what the bottled client can install. Worth surfacing to the user; strict
  enforcement is planner discretion.

### Install / Play UX & First-Run
- **D-07:** **Guided setup prompt on first-run.** When a Mac user clicks Install/Play on a
  Windows-only Steam game and no Steam bottle exists yet, the click kicks off the one-time
  bottle setup + Steam login, then continues to the original install/launch once ready.
  This guided prompt is ALSO the explicit consent point for the multi-GB Steam-client
  provisioning (reconciles with D-10 "always-on").
- **D-08:** **Show a bottle indicator.** A small badge/row tells the user a game runs
  through the Windows Steam bottle rather than natively (natural home: near the existing
  Crossover emulation compat row on the game page). Exact visual treatment may be refined
  by `/gsd-ui-phase`.
- **D-09:** **Install is driven through the bottled Steam client** — GameLib tells the
  bottled Steam client to install (its own download/progress), analogous to the current
  native `steam://` delegation but aimed at the bottle. No GameLib install modal for these
  games (Steam exposes no download-size data — the very reason the current
  `InstallGameModal.ts` short-circuit exists). ACF-style polling in the bottle should
  surface progress/completion, mirroring the existing native ACF poller.

### Routing & Eligibility
- **D-10:** **Always-on for macOS.** Any Windows-only Steam game on macOS routes to the
  bottle flow (no separate opt-in setting). The first-run guided prompt (D-07) is where
  the user consents to provisioning, so "always-on" does not mean surprise background
  downloads.
- **D-11:** **Unknown platform data → treat as native until confirmed.** Do NOT force the
  bottle when `is_mac_native` hasn't been captured yet. Wait for the existing self-heal
  re-fetch (`platformsCaptured` path in `steam/games.ts`) to confirm `is_mac_native ===
  false` before routing a game to the bottle — avoids wrongly bottling a game that
  actually has a Mac build. Note: `library.ts:207` currently defaults `is_mac_native` to
  `false`; the routing logic must distinguish "confirmed not-native" from "not yet
  captured" rather than reading the raw default.

### Claude's Discretion (researcher/planner may decide)
- **Uninstall / move** for bottled games — expected to route through the bottled Steam
  client too, consistent with D-09; confirm mechanics.
- **Where the bottle-setup UI lives** — a Settings section vs an onboarding/first-run
  surface. Not decided.
- **How the guided setup + Steam login windows are surfaced** (progress, error handling
  when the Steam installer/first-run-update misbehaves under Wine).
- **How `isNative()` per-OS interacts with `launcher.ts`** — today `isNative() === true`
  makes `launcher.ts` skip `checkWineBeforeLaunch`; reversing this for non-native macOS
  games must route through the bottle without disturbing the Linux Proton path.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked architecture decision & phase scope
- `.planning/ROADMAP.md` § "Phase 17: Steam on macOS via CrossOver/Wine" — goal, the
  **locked architecture decision** (bottled Windows Steam client; do NOT wine-run
  individual `.exe`s), and the scope notes (reverse GAME-04 for macOS; Linux unchanged).

### Code to modify (the reversal points)
- `src/backend/storeManagers/steam/games.ts` — `isNative()` (line ~348, currently hardcoded
  `return true`) must become per-OS (return `is_mac_native`); `install()` /`launch()`
  /`uninstall()` (the `steam://` delegations, lines ~330–450) must route through the
  bottled Steam client on macOS for non-native games. Also see the `platformsCaptured`
  self-heal re-fetch (lines ~160–265) that populates `is_mac_native` / `is_linux_native`
  (relevant to D-11).
- `src/frontend/state/InstallGameModal.ts` (line ~35) — the `runner === 'steam' && action
  === 'install'` short-circuit that fires `steam://install` directly and bypasses the
  install modal. Must stop firing native `steam://install` for non-mac-native games on
  macOS and route them through the bottle flow instead.
- `src/common/types.ts` (lines ~220–221) — `is_mac_native` / `is_linux_native` on
  `GameInfo` (platform data source; already captured — Phase 7 dependency effectively met).
- `src/backend/storeManagers/steam/library.ts` (line ~207) — `is_mac_native: cachedMeta
  ?.is_mac_native ?? false` default (relevant to D-11 unknown-vs-confirmed handling).

### Existing bottle / Wine plumbing to reuse
- `src/frontend/screens/Settings/components/CrossoverBottle.tsx` — `wineCrossoverBottle`
  setting (defaults to `'GameLib'`); pattern for a named-bottle setting.
- `src/frontend/screens/Library/components/InstallModal/WineSelector/` — engine picker to
  reuse for D-03.
- `src/backend/config.ts` (lines ~340–360) — default settings incl. `winePrefix:
  sharedWinePrefix`, `wineCrossoverBottle: 'GameLib'`, `wineVersion: defaultWine`,
  `defaultWinePrefix` — shows how GOG/Epic already share one prefix/bottle by default
  (context for the dedicated-Steam-bottle decision D-01).

### Related recent work (UI indicator context)
- Phase 16 (`.planning/phases/16-crossover-compatibility-rating-codeweavers/16-CONTEXT.md`)
  and quick tasks 260710-qyc / 260710-rjm — the existing Crossover/Wine/Proton "emulation"
  compat rows on the game page (Install-info tab). Natural neighbor for the D-08 "runs via
  bottle" indicator.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`WineSelector` + `CrossoverBottle.tsx` + `wineVersion`/`wineCrossoverBottle`/`winePrefix`
  settings** — the full existing Wine/CrossOver bottle configuration surface, reusable for
  provisioning and engine selection of the dedicated Steam bottle (D-01/D-02/D-03).
- **Steam ACF install poller** (`startInstallPolling` in `steam/games.ts`) — the existing
  pattern that surfaces install progress/completion from appmanifest StateFlags without a
  focus round-trip; the bottled install (D-09) should mirror this for the bottle's Steam
  library.
- **`platformsCaptured` self-heal re-fetch** (`steam/games.ts`) — already re-fetches
  `platforms` when never captured; D-11 leans on this to know when `is_mac_native` is
  actually confirmed vs. defaulted.

### Established Patterns
- **Per-OS behavior gating** — the codebase already branches on `is.mac` / `is.linux` /
  `is.native` for the emulation compat rows; the isNative reversal and bottle routing must
  stay macOS-scoped and leave Linux Proton delegation intact.
- **`steam://` fire-and-forget + ACF owns real status** (D-02/D-07 from Phase 3) — the
  bottled flow replaces the *target* of the delegation (native client → bottled client)
  but should preserve the "don't optimistically flip state; let ACF confirm" discipline.
- **Shared default prefix/bottle for Wine games** (`config.ts`) — GOG/Epic default to
  `sharedWinePrefix` + the `GameLib` CrossOver bottle; Steam intentionally does NOT join
  that bottle (D-01).

### Integration Points
- **`SteamGame.isNative()`** → consumed by `launcher.ts` (skips `checkWineBeforeLaunch`
  when native). Reversing it per-OS is the pivot that makes the launch path go through Wine
  for non-native macOS games.
- **`InstallGameModal.ts:35`** → the single frontend chokepoint for every Steam install
  entry point (grid/list/submenu/game page); the bottle routing decision lives here.
- **Bottled Steam library location** → the bottle's own `steamapps/` (inside the Wine
  prefix) is where appmanifests/ACF for bottled games live — distinct from any native Steam
  library; the ACF poller must be pointed at the bottle path.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly considered **one shared bottle across Steam + GOG + Epic** and, after
  weighing the resident-client asymmetry, chose a **dedicated Steam bottle** (D-01). Keep
  GOG/Epic bottle behavior unchanged.
- "Always-on" (D-10) is deliberately paired with the "guided setup prompt" (D-07) as the
  consent gate — the two decisions are interdependent and should not be split apart in
  planning.

</specifics>

<deferred>
## Deferred Ideas

- **Opt-in Settings toggle for bottled Steam** — considered and rejected in favor of
  always-on (D-10). Could be revisited if the guided-setup flow proves too intrusive.
- **Token/session bridging** into the bottled Steam client — considered and rejected as
  unsupported/fragile (D-04). Could be revisited if a reliable session-reuse path is found.
- **Per-game Steam bottles** — considered and rejected (D-01); would mean many Steam
  installs/logins/disk. Not planned.

</deferred>

---

*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Context gathered: 2026-07-10*
