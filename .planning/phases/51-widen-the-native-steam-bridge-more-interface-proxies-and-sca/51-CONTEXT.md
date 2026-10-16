# Phase 51: Widen the native Steam bridge — more interface proxies, scan-derived eligibility - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Most Windows-only Steam games on macOS run through the Phase 24 bridge in their own per-game
CrossOver bottle (quick `261016-u1w`), and the shared Phase 17 `GameLibSteam` bottled-Steam
bottle becomes the fallback for a measured residue (DRM/CEG-wrapped titles, P2P-dependent titles,
64-bit titles while no Win64 shim exists, D-17 forced-Windows installs) instead of the default.
Three sub-decisions are LOCKED on the ROADMAP entry and are NOT re-decided here: the Hoard
interface order (ISteamUtils, ISteamApps, ISteamUserStats; then ISteamRemoteStorage as
cloud-disabled; then ISteamMatchmaking and ISteamNetworking as unavailable), scan-derived
eligibility persisted per game, and a bundled JSON seed plus known-bad list with no remote index.
Two hazards stay open research questions: 64-bit import blindness in `importScan.ts` and whether a
Win64 shim target is in scope. Acceptance anchor: 24-UAT Gate 4 re-run, Hoard (63000) playable
through the bridge.

Not in this phase: the deep in-process `lsteamclient` thunk, CEG/Denuvo enforcement, P2P
multiplayer join, retiring the `GameLibSteam` bottle, a remote/CI allowlist index.

</domain>

<decisions>
## Implementation Decisions

Decision IDs are prefixed `D-51-` so they never collide with the Phase 24 `D-NN` ids the ROADMAP
entry and this file cite.

### AppID identity for the new interfaces
- **D-51-01:** Each bridge launch spawns its **own helper, inited with the game's real AppID**
  (`steam_appid.txt` = the game's AppID, not 480). ISteamApps, ISteamUserStats and
  ISteamRemoteStorage answer truthfully about the running game; Mac Steam shows In-Game and
  records playtime. This supersedes Phase 24 D-03's "one shared, long-lived helper" and D-04's
  "single generic AppID 480" — "one Steam login" still holds, "one helper" does not.
  — **Reversibility:** costly — helper spawn, port allocation, readiness polling
  (`helperProcess.ts`), the CONTROL frame reconciliation and the launch-side `ensureBridgeHelperReady`
  contract all assume one helper; going back means re-threading every call site to a shared instance.
- **D-51-02:** When a game launches through a stubbed interface, or identity fell back (D-51-04),
  the user sees a **one-time per-game notice at first launch** via the existing `notify()` path
  ("Achievements and cloud saves do not sync for this game via the bridge"). Logged every time,
  shown once per game.
- **D-51-03:** **Two bridge games may run at once; no lock is built.** The user asked why anyone
  would want this and accepted the answer: nobody does, but under per-game helpers allowing it is
  zero code, while refusing it means a lock, a refusal message and stale-lock recovery. Steam's
  one-session rule is per account across machines; the local client accepts several inits.
- **D-51-04:** If real-AppID init fails for a game (Steam refuses the AppID, family-shared title,
  licence check), the helper **falls back to 480 identity-only and the game launches anyway**;
  SteamID and persona still flow, AppID-scoped interfaces answer as stubs, D-51-02's notice fires.
  Never a D-05 dialog for this case.

### What happens to the bits on a scan miss
- **D-51-05:** Install-first-decide-second is accepted. On an import-scan miss the D-05 dialog names
  the missing symbols and offers the bottled-Steam fallback, which **re-downloads through the proven
  Phase 17 path**; the per-game bridge bottle is deleted. The user challenged a "move the bits into
  `GameLibSteam`" option; re-download was chosen because it is the live-gated path with no new
  install-path / attribution / install-script bookkeeping, and misses are meant to be rare. The move
  is a later optimisation if the census (D-51-15) shows a high miss rate.
- **D-51-06:** **Pre-install screen on the depot manifest file list**, run before any download:
  `steam_api64.dll` only with no 32-bit shim target → bottled Steam, no bridge attempt;
  no `steam_api*.dll` at all → bridge bottle, no shim placed; `steam_api.dll` present → install then
  scan. The import scan stays authoritative; the screen only avoids the obvious wasted downloads.
- **D-51-07:** The persisted verdict stores the **missing symbols and the shim export-set version it
  was scanned against**. A later release whose shim covers those symbols clears the verdict on the
  next install or launch automatically; no manual "retry" affordance is built for this case.
  — **Reversibility:** costly — this is a new persisted field family on `steamMetadataStore`
  entries (D-17 `forcedWindowsViaBottle` precedent, including its CARRY-FORWARD hazard: `set`
  replaces the whole entry); changing the key semantics later means migrating existing verdicts.
- **D-51-08:** A title on the bundled **known-bad list gets a dialog up front naming the reason**
  (DRM-wrapped, 64-bit only, …), then routes to bottled Steam. The bridge is never attempted
  silently for a known-bad title. The dialog carries a third button per D-51-11.

### Route visibility and user override
- **D-51-09:** The route is shown in **both** the install dialog's wine section (one-line verdict:
  "Native Steam bridge" / "Bottled Steam client", with the reason: seed, scan result, known-bad,
  64-bit) **and** on the game page next to the compatibility rating, including the missing symbols
  after a scan miss.
- **D-51-10:** The user can **force bottled Steam for a clean-scan game** via a toggle in the install
  dialog's wine section ("Use the Windows Steam client instead"), persisted per game beside the scan
  verdict on the D-17 precedent. Flipping it after install means a reinstall into the other bottle.
- **D-51-11:** The user can **force a bridge attempt for a known-bad or scan-missed title**: the
  D-51-08 dialog offers "Try the bridge anyway", which runs the normal install-then-scan path; a miss
  lands on the ordinary D-05 fallback. The known-bad list is therefore self-correcting.
- **D-51-12 (folded todo LD-5):** `removeSteamInstallCopy('bridge')` **deletes the emptied per-game
  bridge bottle** via `removePerGameBridgeBottle` (guard chain from `261016-u1w`) when the bottle is
  per-game. Legacy-bottle behaviour unchanged.

### Acceptance set and the 64-bit stance
- **D-51-13:** **Research decides the Win64 shim.** Research censuses the owned Windows-only library
  for `steam_api64.dll` and prototypes `zig cc -target x86_64-windows-gnu` against the generator's
  vtable ABI. If it builds and the single Win64 calling convention holds, the planner includes the
  64-bit target in this phase; if not, the phase ships the fail-closed rule (any `steam_api64.dll`
  import → bottled Steam) and the target is deferred with the evidence attached. Neither outcome is
  assumed.
- **D-51-14:** Acceptance set = **Hoard (63000, locked) + one owned title per added interface**
  (Apps, UserStats, RemoteStorage) **nominated by research from the import census, + Avernum 5/6 as
  the regression pair**. The user confirms the nominated list at plan time.
- **D-51-15:** "Most" is **measured by a census of the operator's owned Windows-only library**:
  research produces the import census once; the phase closes by re-running it against the shipped
  shim and reporting N of M titles routed to the bridge, each miss classified (64-bit, missing
  symbols, known-bad). The number is the verdict; no threshold is pre-set.
- **D-51-16 (folded todo):** The bottled-Steam fallback's dead Play button is **in scope**: surface a
  "Waiting for Steam…" state when a fallback launch has produced no game process within the grace
  window, naming the likely causes. Start by measuring which of the three causes (self-update
  relaunch, hidden login window, one-session rule) is detectable from the bottle's
  `logs/bootstrap_log.txt` / `console_log.txt`, as the todo itself prescribes.

### Claude's Discretion
- Helper-side dispatch generation: the helper hand-`dlsym`s each method today; six more interfaces
  make it manifest-driven. Generator output shape, ordinal assignment and wire framing changes are
  research/planning.
- How full vtable slot tables for the six interfaces are authored under Phase 24 D-09 (GameLib-authored
  manifests, no vendored Valve headers). The two existing manifests carry synthetic `_TESTONLY`
  slots and are not full layouts.
- The `importScan.ts` symbol regex (`SteamAPI_*` only) must widen to the bare accessors
  (`SteamUser`, `SteamUtils`, …) and the `SteamInternal_*` / `SteamAPI_GetHSteamUser` /
  `SteamClient` family, and must fail closed on a `steam_api64.dll` heading. Census of that family
  against real owned titles is research (ROADMAP sub-decision 1).
- Per-game helper port allocation, helper lifetime after the game exits, and how the shim learns its
  helper's port.
- Whether the depot manifest file list is available before download in `depot.ts` for D-51-06, and
  the exact screen rules beyond the three cases listed.
- Known-bad list schema (reason taxonomy, `version: 2` of `bridge-allowlist.json`) and whether
  the seed and known-bad lists live in one file or two.
- Wording of the route line, the notice and the known-bad dialog; all new strings go in
  `gamelib.json` per the l10n standing requirement.
- What the Avernum 5/6 installs already sitting in the legacy `GameLibSteamBridge` bottle do when
  per-game becomes the default (the `261016-u1w` resolver already prefers legacy-if-it-holds-the-manifest).

### Folded Todos
- **"Two cleanup gaps left by per-game bridge bottles"** (`.planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md`)
  — item 1 was fixed by quick `261017-bqw`; item 2 (LD-5, "Remove all copies" leaves an empty
  per-game bottle) is decided here as D-51-12. Closing this todo is part of the phase.
- **"Play on a bottled Steam game gives no feedback while the bottled Steam client is blocked"**
  (`.planning/todos/pending/2026-10-16-steam-bottle-play-gives-no-feedback-while-steam-is-blocked.md`)
  — the fallback path this phase makes rarer; in scope as D-51-16.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and locked inputs
- `.planning/ROADMAP.md` § Phase 51 — goal, the three LOCKED sub-decisions (interface order,
  scan-derived eligibility, bundled JSON seed + known-bad), the two hazards, Depends-on.
- `.planning/todos/completed/2026-10-16-widen-the-native-steam-bridge-beyond-two-games.md` —
  the operator design question this phase closes, with the "Closed" section's correction that
  per-game bridge bottles need no Steam client.

### Phase 24 record (the bridge this phase widens)
- `.planning/milestones/v0.7-phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-SPEC.md`
  — the bridge's constraints that still bind (loopback-only, AppID-before-init, export every
  imported symbol, SteamID64 as strings, version-pinned interfaces, `zig cc` toolchain) and the
  out-of-scope list (lsteamclient, CEG/Denuvo, P2P join).
- `.planning/milestones/v0.7-phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-CONTEXT.md`
  — D-01..D-11. D-03/D-04 are SUPERSEDED by D-51-01 above; D-05/D-06/D-07/D-08/D-09/D-10/D-11 still hold.
- `.planning/milestones/v0.7-phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-UAT.md`
  — Gate 4 (Hoard) definition and D-UAT-24-09 (lines ~308–352 and ~552): the eight bare accessors
  Hoard imports, the `unimplemented function steam_api.dll.SteamUtils` crash, and the per-fix
  verification hooks (shim size 805888 B, `grep -ac 127.0.0.1`) a re-run reuses.
- `.planning/milestones/v0.7-phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-RESEARCH.md`
  § Pattern 1 — why D-04 settled on 480 (InitFlat takes no AppID; identity from `steam_appid.txt`
  in the helper's cwd). D-51-01 reverses the conclusion, not the mechanism: each per-game helper
  writes its own `steam_appid.txt`.

### Bridge blueprint and spike evidence
- `.claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md` — "What to Avoid" and
  "Constraints" (sret handling, pack(4)→pack(8) callbacks, no connect-per-call, CEG below the API).
- `.claude/skills/spike-findings-gamelib/sources/008-gating-game-hoard/` — Hoard import evidence.

### Per-game bottles and their follow-ups
- `.planning/quick/261016-u1w-per-game-bridge-bottles/` — D-A..D-E: `bridgeBottleNameFor`,
  `resolveBridgeBottleName`, `listReadyBridgeBottleNames`, `removePerGameBridgeBottle`, and the
  rule that every bridge-bottle entry point takes an explicit bottle/appId.
- `.planning/quick/261016-wsq-run-the-per-game-bridge-bottles-live-gat/` — the 5/5 live gate on
  real CrossOver; the rig to reuse for this phase's gates.
- `.planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md` — LD-5 (folded).
- `.planning/todos/pending/2026-10-16-steam-bottle-play-gives-no-feedback-while-steam-is-blocked.md` — folded.

### Repo conventions that bind this phase
- `Skill("gamelib-conventions")` — fake-HOME isolation for every spawn site (objdump, helper,
  zig), todo frontmatter, UAT item shape, `prettier --check` in every `<verify>` block.
- `.planning/research/STEAM-STACK.md` — frozen Steam stack; unchanged by this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeManagers/steam/bridge/importScan.ts` — `parseSteamApiImports` /
  `scanSteamApiImports` (argv-form objdump, pure parser). Its regex is `SteamAPI_*` only and it keys
  on the `steam_api.dll` heading: both the bare-accessor gap D-UAT-24-09 hit and the 64-bit vacuity
  live here. Widen, do not replace.
- `src/backend/storeManagers/steam/bridge/shimGenerate.ts` — `placeShimForGame` runs the coverage
  check at ~L239 and throws the verdict away; `SHIM_EXPORTED_SYMBOLS` (L69) is the fixed export set
  the verdict is computed against and the natural source of D-51-07's "shim export-set version".
- `src/backend/storeManagers/steam/bridge/allowlist.ts` + `bridge-allowlist.json` — zod-validated,
  `version: z.literal(1)`, fail-loud at module load, static JSON import (inlined into the bundle).
  Known-bad entries and a reason field extend this schema.
- `src/backend/storeManagers/steam/bridge/helperProcess.ts` — `spawnHelperIfNeeded` /
  `ensureBridgeHelperReady` (single-helper assumptions, port, readiness poll, the D-06 observable
  failure shapes). D-51-01 turns this into a per-appId registry.
- `native/steam-bridge/helper/bridge_helper.c` — ordinals 1 (SteamUser023) and 2 (SteamFriends018),
  hand-`dlsym`'d per method, CONTROL ordinal 0xFFFF, writes `steam_appid.txt`=480 in its cwd.
- `meta/gen_vtables.ts` + `meta/sdk/*.manifest.json` — generator (`generateShimC`,
  `generateDefFile`, `FLAT_EXPORTS_SUPERSET`); manifests are partial with `_TESTONLY` slots.
- `native/steam-bridge/generated/steam_api.def` — the twelve exports today: ten lifecycle +
  `SteamAPI_SteamUser_v023` + `SteamAPI_SteamFriends_v018`. No bare accessors, no `SteamInternal_*`.
- `src/backend/storeManagers/steam/electronStores.ts` `SteamMetadataCacheEntry.forcedWindowsViaBottle`
  — the D-17 persisted-verdict precedent, with its CARRY-FORWARD warning (`set` replaces the whole entry).
- `src/backend/storeManagers/steam/bottle.ts` — `bridgeBottleNameFor`, `resolveBridgeBottleName`,
  `removePerGameBridgeBottle`, `provisionBridgeBottle(bottleName)`; `bottleProcessMonitor.ts`
  (quick `261016-t3e`) already reports started/stopped for bottled launches and is the hook for D-51-16.
- `src/backend/dialog/dialog.ts` — `showDialogBoxModalAuto` / `notify` for D-51-02, D-51-08, D-05.
- Frontend: `src/frontend/screens/Library/components/InstallModal/steamEligibilityProbe.ts`,
  `steamSectionGating.ts`, `src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts`
  — the install-dialog wine section and game-page surfaces D-51-09/D-51-10 extend.

### Established Patterns
- Routing gate: `SteamGame.isBridgeEligible()` (`games.ts:2001`) composes
  `isBottleEligibleFromPlatforms() && bridgeAllowlist.has(appId) && !bridgeFailedThisSession.has(appId)`.
  This phase replaces the allowlist term with seed ∪ persisted-verdict ∖ known-bad ∖ forced-bottle.
  It deliberately does NOT read the D-17 forced verdict (different bottle root); keep that.
- `install()` (`games.ts:1079–1100`) and `launch()` (`~2135`) check `isBridgeEligible()` FIRST
  inside the bottle branch, before the Phase 17 `isBottleReady()` gate.
- `bridgeFailedThisSession` is session-scoped by design; D-51-07's verdict is the persisted
  complement, not a replacement.
- Every spawn site uses `createFakeHomeProfile()`; `spawnAsync` argv-form only (T-24-06).
- Deadline on first process match in `bottleProcessMonitor` is deliberately absent; D-51-16 adds a
  user-visible state, not a deadline.

### Integration Points
- `games.ts` install/launch/uninstall bridge branches; `library.ts` `buildBridgeInstalledMap`.
- `depot.ts` manifest fetch (for the D-51-06 pre-screen) — availability before download is a
  research question.
- Tauri packaging: a second shim target (`steam_api64.dll`) and per-game helper spawn both touch the
  `build-steam-bridge` step and the bundled `bin/arm64/darwin/` layout.
- i18n: new strings in `gamelib.json`; `pnpm i18n` zero-warning pass.

</code_context>

<specifics>
## Specific Ideas

- The user's test of every recommendation was cost: "why would I want more than one game to run?"
  and "why move the bits instead of re-downloading?" Both were resolved toward the no-new-code
  path. Planning should keep that bias: proven path over clever path on anything that is not the
  interface work itself.
- "Isn't the `GameLibSteam` bottle now redundant?" — answered: demoted, not redundant; it carries
  the DRM/CEG, P2P, 64-bit and D-17 residue. Recorded as a deferred idea below.
- Acceptance re-runs reuse the 24-UAT per-fix hooks (shim byte size, loopback-address grep) and the
  `261016-wsq` console rig; gates run on a packaged `.app` on real hardware, never `tauri:dev`.

</specifics>

<deferred>
## Deferred Ideas

- **Retire the shared `GameLibSteam` bottle** (per-game bottled Steam for the residue) — Phase 22
  game-families territory; a scope change, not this phase.
- **Move scan-missed bits into `GameLibSteam` instead of re-downloading** — revisit only if the
  D-51-15 census shows a high miss rate.
- **Remote/CI allowlist index** — declined again on the ROADMAP entry; nothing to index.
- **P2P multiplayer join** — stays out of scope (24-SPEC).

### Reviewed Todos (not folded)
- `2026-10-16-phase-21-native-install-uat-deferred-to-windows.md` and
  `2026-10-16-phase-26-steam-key-redemption-live-uat-never-run.md` — Steam UAT backlog on other
  phases; matched on keywords only.
- `2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md`,
  `2026-10-03-login-sheet-title-bar-has-a-light-wedge-at-the-rounded-corner.md` — UI, unrelated.
- `2026-10-11-stores-tab-embed-not-implemented-on-windows.md`,
  `2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md`,
  `2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four.md`,
  `2026-10-17-packaged-macos-build-delivers-no-notifications.md`,
  `2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` — platform/build items, unrelated.
  Note: the no-notifications todo means D-51-02's `notify()` is invisible on packaged macOS until
  that todo is fixed; the notice must also be observable another way (log line, game-page line).

</deferred>

---

*Phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca*
*Context gathered: 2026-10-17*
