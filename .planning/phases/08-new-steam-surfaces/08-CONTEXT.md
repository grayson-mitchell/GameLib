# Phase 8: New Steam Surfaces - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface Steam in two existing places in GameLib, reusing established patterns:

1. **Steam storefront tab** (STORE-01) — a Steam entry in the sidebar Stores submenu that opens the Steam store inside the existing WebView screen, browse-only.
2. **Steam in Console mode** (CONSOLE-01) — Steam games appear in the Console-mode grid alongside the other stores and can be launched (and install-handed-off) from it.

This phase does NOT add new Steam capabilities beyond exposing existing library/launch data in these two surfaces. Purchasing, GameLib-managed Steam downloads, and any Steam store deep-integration are explicitly out of scope.

</domain>

<decisions>
## Implementation Decisions

### Console Mode — Steam games (CONSOLE-01)
- **D-01:** Show **all owned** Steam games in the Console grid, the same way Epic/GOG/Amazon/Zoom games appear. Do not restrict to installed-only. (`ConsoleMode/index.tsx` `allGames` currently excludes Steam — add `steam.library` to the composition and pull `steam` from `ContextProvider`.)
- **D-02:** Activating a **not-installed** Steam game opens the existing `InstallOverlay`. For Steam, install is a **handoff to the Steam client** via `steam://install/{appId}` — GameLib does not manage the download. The overlay shows a brief "Opening Steam to install…" notice, then **auto-dismisses** back to the grid. The existing ACF poller flips the card's install state when Steam finishes; no polling loop in the overlay.
- **D-03:** Add a **"Steam" store filter chip** to the Console top bar, enabled when `storesWithGames.has('steam')` (mirrors the existing per-runner chips). Include `steam` in the initial `refreshLibrary` guard so an empty Steam library triggers a background refresh like the other stores.

### Console Mode — launch feedback for Steam
- **D-04:** Steam launch is **fire-and-forget** — `steam://rungameid/{appId}` hands off to the Steam client, which never reports running/exit back to GameLib. The Console `LaunchOverlay` should fire the launch, show a brief **"Launched in Steam"** confirmation, then **auto-dismiss** after a short delay. Do NOT reuse the managed "Launching…" indefinite state (it would hang, since Steam sends no `running`/`quit` signal). Launch itself already works through the runner-agnostic `launch()` helper → backend `steam/games.ts` → `shell.openExternal`.

### Steam Store Tab (STORE-01)
- **D-05:** The Steam store tab is a **pure WebView** at `https://store.steampowered.com/`, using the same chrome/controls (`WebviewControls`, back/forward, etc.) as the Epic/GOG/Amazon/Zoom tabs. No injected "install in GameLib" buttons, no GameLib-side integration — browse-only.
- **D-06:** **Do NOT wire a `LoginWarning` for Steam.** The other stores show `LoginWarning` to prompt a GameLib-side store login; Steam has no in-app web login flow, so `showLoginWarningFor` must not add a `steam` branch.
- **D-07:** Use the WebView's existing **persistent session partition** (`partition={persist:${store}}` → `persist:steam`). This means if the user logs into their Steam account on the web page inside the WebView, that session persists across restarts and they see personalized store pages — for free, no extra code. (Purchasing still happens in Steam's own flow; we just don't fight the session.)
- **D-08:** Register the Steam store in the sidebar Stores submenu (`SidebarLinks/index.tsx`) with the label **"Steam Store"** (add an i18n key alongside `store`/`gog-store`/`amazon-luna`). The generic `store/:store` route already maps to the WebView, so no new route is needed.

### Store URL — region & persistence
- **D-09:** Load the **plain** URL `https://store.steampowered.com/` — no appended language/country params. Steam auto-detects region/language by IP and, once logged in, by the account's own preferences. Do not replicate Epic's `/{lang}/` pattern.
- **D-10:** **Persist last-visited** Steam store URL via the existing `last-url-{store}` mechanism. Add a `steam` case to `validStoredUrl` in `WebView/index.tsx` → `url.includes('store.steampowered.com')`, and a `/store/steam` → Steam store entry in the `urls` map.

### Claude's Discretion
- Exact submenu ordering of the Steam item within the Stores submenu, precise copy/timing of the "Opening Steam to install…" and "Launched in Steam" notices, and the auto-dismiss delay values. Keep consistent with existing Console/WebView styling.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — STORE-01 (Steam storefront in sidebar Stores, ENH-002) and CONSOLE-01 (Steam games in Console mode + launch, ENH-006)
- `.planning/ROADMAP.md` §"Phase 8: New Steam Surfaces" — goal + 4 success criteria

### Store tab surfaces (STORE-01)
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` — Stores submenu; add the Steam Store sub-item (see Epic/GOG/Amazon/Zoom entries, lines ~142–167)
- `src/frontend/screens/WebView/index.tsx` — the storefront browser. Add `steam` to `validStoredUrl` (lines 17–30), add `/store/steam` to the `urls` map (lines 76–88), and confirm the `persist:${store}` partition (line 383). Do NOT add a `steam` branch to `showLoginWarningFor` (lines 308–328).
- `src/frontend/App.tsx` §`store/:store` route (~line 140) — generic route already covers `/store/steam`; no change needed.

### Console mode surface (CONSOLE-01)
- `src/frontend/screens/ConsoleMode/index.tsx` — `allGames` composition (lines 116–131, excludes Steam), `storeFilters` (lines 159–183), initial refresh guard (lines 99–114), `activateGame` install/launch routing (lines 236–265)
- `src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx` — launch handling; adapt for Steam fire-and-forget "Launched in Steam" + auto-dismiss
- `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx` — install handling; adapt for Steam `steam://install` handoff + brief notice + auto-dismiss

### Steam backend (existing, v1.0 — reference only)
- `src/backend/storeManagers/steam/games.ts` — `launch()` (`steam://rungameid`), install/uninstall verbs, `buildSteamProtocolUrl`, `shell.openExternal` (lines ~37, 302, 333–358)
- `src/frontend/state/ContextProvider.tsx` / `src/frontend/types.ts` (`steam` at line 100) — `steam.library: GameInfo[]` already exposed

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **WebView screen** (`WebView/index.tsx`): the store `store/:store` route is generic — adding Steam is data-only (`urls` map + `validStoredUrl`), no new screen/route.
- **`persist:${store}` partition**: gives Steam a durable web session with zero extra code.
- **Runner-agnostic `launch()` helper** (`frontend/helpers`): already routes `runner: 'steam'` to the backend Steam manager → `steam://rungameid`. Console launch reuses it as-is.
- **`SidebarItem` / Stores submenu**: adding the Steam Store sub-item follows the exact Epic/GOG/Amazon/Zoom pattern.
- **Console `storeFilters` / `storesWithGames`**: adding a Steam chip follows the existing per-runner chip pattern (enabled via `storesWithGames.has('steam')`).

### Established Patterns
- Console `allGames` is an explicit per-store spread (`epic.library`, `gog.library`, …) — Steam must be added there deliberately; it does not flow in automatically.
- Steam status is owned by the **ACF poller** (v1.0), not the GameLib download manager — this is why Console install/launch for Steam are handoffs, not managed operations.
- i18n: user-facing labels use `t('key', 'Default')`; new keys (e.g. `steam-store`, install/launch notices) follow existing conventions.

### Integration Points
- `ConsoleMode/index.tsx` ← add `steam` from `ContextProvider`, `steam.library` into `allGames`, Steam chip in `storeFilters`, steam in refresh guard.
- `WebView/index.tsx` ← `steam` in `urls` + `validStoredUrl`.
- `SidebarLinks/index.tsx` ← Steam Store submenu item.
- `LaunchOverlay` / `InstallOverlay` ← Steam-specific fire-and-forget copy + auto-dismiss branches.

</code_context>

<specifics>
## Specific Ideas

- "Launched in Steam" and "Opening Steam to install…" are the intended user-facing framings — they should read as honest handoffs to the Steam client, not as GameLib-managed operations.
- Steam store tab should feel identical to the other store tabs, just without the login-warning prompt.

</specifics>

<deferred>
## Deferred Ideas

- **In-store "install in GameLib" injection** — deep-integrating the Steam storefront with GameLib's install flow. Out of scope (browse-only decision); would be its own phase if ever desired.
- **GameLib-managed Steam downloads** — replacing the `steam://install` handoff with a GameLib-driven download. Out of scope; Steam owns Steam downloads.
- **Language/country URL params for the Steam store** — considered and rejected (D-09) in favor of Steam's own geolocation/account preferences.

None outside these — discussion stayed within phase scope.

</deferred>

---

*Phase: 8-new-steam-surfaces*
*Context gathered: 2026-07-03*
