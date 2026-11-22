# Phase 86: Pure leaf services - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The self-contained information and cache services move from the Node sidecar to Rust and behave
exactly as before (SVC-01). The phase ports **eight slices**: wiki game info (with its umu lookup),
the CrossOver compatibility index, store search and discounts (ITAD), anti-cheat info, recent
games, per-game overrides, and the artwork caches (steamgrid and `images_cache`). The phase checks
them against fixtures recorded from the TypeScript, and deletes each slice's TypeScript and sidecar
registrations within the phase.

Out of scope, even though the v0.11 research summary listed them as "leaves": `online_monitor` /
`connectivityNow` and `gamedetails` (they port with Phase 88), `macArch` (89), the `signInProbe`
parsers (91/92), and `runsForMe`, `appshell` and `cache.ts`. Each of these goes to the phase that
ports its main callers.

</domain>

<decisions>
## Implementation Decisions

### Scope and crate layout
- **D-01:** **86 ports the slice set in the roadmap's success criteria, nothing more:**
  `wiki_game_info`, `crossover_index`, `storeSearch` + `discounts`, `anticheat`, `recent_games`,
  `game_overrides`, `steamgrid` + `images_cache` (about 4.1k TS source lines). The research
  summary's extra items do not belong to 86 (see the Phase Boundary). This is one phase, not 86 + 86.1.
- **D-02:** **One `gamelib-info` crate.** It has a module per slice, one `dispatch(op, args)` and one
  `gamelib-info-cli`, following the Tauri-free per-domain crate pattern of Phases 63–80. It does
  not use eight tiny crates. Each slice still has its own `*PortComplete` delete gate.
- **D-03:** **Rust copies TS quirks for parity, and each quirk gets a todo.** The fixtures pin
  current behaviour, including any wrong TTL, lenient parse or odd sort order. Each quirk found is
  filed as a `.planning/todos/pending/` todo (with the three triage keys) and fixed later as its own
  change, so a golden diff never mixes a port with a fix.
- **D-04:** **The umu lookup (`wiki_game_info/umu`, `getUmuId`) ports with wiki in 86** as a
  `gamelib-info` module, because Rust wiki calls it. Its other callers
  (`storeManagers/gog/games.ts`, `nile/games.ts`, `legendary/games.ts`) go through a shim under
  D-05. **Amend `82-STATE-OWNERSHIP.md`:** the `umu` row's mirror deletion moves from 87 to 86,
  recorded as an amendment with the reason.

### Slices that still have TypeScript callers
- **D-05:** **TS backend callers reach a ported slice through a thin `rustInvoke` shim with the
  same signature.** The TS implementation is deleted in 86, and callers don't change. Known
  callers: `launcher.ts` (`addRecentGame`, `gameAnticheatInfo`), `steam/launchDispatch.ts`
  (`addRecentGame`), `sideload/games.ts` (`removeRecentGame`), the GOG, Epic and Amazon
  `games.ts`/`library.ts` files (wiki info, umu, overrides, steamgrid), and `store_backend.ts` /
  `appRuntime.ts` / `miscRuntime.ts`. Research must produce the complete list. Each shim dies
  when its last caller ports (88 / 91 / 92). — **Reversibility:** reversible — the shims are
  one-line wrappers.
- **D-06:** **The delete gate counts the shims.** A slice's `*PortComplete` gate fails if the old TS
  implementation survives, or if a shim contains anything beyond the typed `rustInvoke` call. A
  schedule test, modelled on 85's `storeMirrorSchedule`, lists every shim with the phase that
  deletes it, so a shim can't outlive its schedule unnoticed.
- **D-07:** **Rust has no online logic in 86.** The online signal comes from TS. `anticheat`'s
  download currently waits on `onlineMonitor.runOnceWhenOnline`, which stays in TS until 88. TS
  keeps that hook and calls a Rust op (e.g. `anticheat.refresh`) when it fires. The same pattern
  applies to any other ported fetcher that waits for connectivity. Phase 88 rewires the trigger
  when `online_monitor` ports.
- **D-08:** **Rust emits `recentGamesChanged`.** Once Rust owns recent games, it emits to the renderer
  through `FrontendEmitter` and updates the Rust tray directly (`src-tauri/src/tray.rs`). The
  sidecar relay of this event (`src-tauri/src/sidecar.rs` around L485) goes away for this event. If
  research finds a TS backend listener on `appRuntime.events` `'recentGamesChanged'`, that listener
  gets a relay that dies with it.

### Fixtures and parity oracle
- **D-09:** **The oracle is recorded real responses plus TS-output goldens.** The TS runs once
  against the live services for the network-backed slices (the 8 wiki sources, the CrossOver
  index, ITAD search/discounts, anticheat and SteamGridDB). The raw HTTP responses are recorded
  and committed with secrets redacted (ITAD and SteamGridDB keys, any token). The golden is what TS
  produced from those responses. Rust replays the same responses and must match the golden. CI
  stays offline and deterministic.
- **D-10:** **Requests are pinned as well as outputs.** The recorder stores each TS request. Rust
  must send the same URL, query, method and API-key / User-Agent headers, so an endpoint drift fails
  in CI and not in production.
- **D-11:** **The zero-test slices get a TS golden harness committed first (SC3).** These are
  `anticheat`, `recent_games`, `game_overrides` and `images_cache`. An early plan writes a TS harness
  that drives each one (inputs, plus disk state before and after through the StoreHost files) and
  emits golden JSON. The goldens are committed **before** any Rust for that slice. The Rust tests
  read the same files. The harness is deleted with its slice. The goldens need the Phase 82 D-05
  vacuous-pass guards (a floor on the fixture count, and a test that an empty input fails).
- **D-12:** **There is an opt-in live drift check, kept out of CI.** A `gamelib-info-cli` command
  (or an `#[ignore]` test) hits the live endpoints for a handful of known titles on demand.

### Rollback and live gate
- **D-13:** **No `GAMELIB_<SLICE>` flag, and each slice is deleted once proven.** These slices are
  read-mostly info and caches, and fixture parity is the proof. A slice's TS and sidecar
  registrations are deleted in the same plan as its port, or the next one, once its goldens pass.
  No flag helper gets built (83 D-05 still waits for a slice that needs a window). — **Reversibility:**
  costly — restoring a slice means reviving its TS and registrations from git.
- **D-14:** **An operator live gate on macOS, authored before coding, with four items:**
  1. **Game page info:** a few Steam, Epic and GOG game pages show the wiki block (ProtonDB, HLTB,
     Steam Deck, CrossOver rating) and the anticheat badge as before.
  2. **Store search and discounts:** a Store Search query and the Discounts screen show results,
     badges and prices as before, with the ITAD key working.
  3. **Artwork and recent games:** SteamGridDB artwork and cached images load. Launching a game
     updates recent games in the tray and the library's last played.
  4. **Upgrade with no data change (SC2):** recent games, overrides and the caches are untouched
     after the upgrade, and there is no Keychain prompt for the ITAD or SteamGrid keys.
  It follows the offline-UAT memory shape (network off only for the action) wherever an item tests
  offline behaviour.
- **D-15:** **The gate build is a signed Phase 86 build installed over a signed Phase 85 build.** It
  reuses 85's signed-release path (85 D-16). A dev build does not count for item 4. Items 1–3 run
  in the same session.
- **D-16:** **Windows and Linux are covered by CI only.** Golden replay runs on the three-OS CI
  matrix, including Windows path handling for `images_cache` / steamgrid. Their live check rides
  with Phase 99, as in 85 D-10.

### Carried forward (already decided, not re-asked)
- **D-17:** A native channel never falls back to the sidecar. Its Rust serde struct
  (`deny_unknown_fields`, camelCase) is the schema, and the channel's zod entry in `channelSchemas.ts`
  is deleted with its TS registration. The IPC snapshot is regenerated and committed (83 D-04, D-06,
  D-07).
- **D-18:** Persisted state goes through the Phase 85 Rust StoreHost (`gamelib-store`). That means
  byte-identical writes, the corrupt-file copy-aside and the existing TTLs (`wikigameinfo` 30 d,
  `crossover_index` 24 h, `itad_prices` / `itad_steam_gids` 30 d, `umu` 6 h, `gameOverridesStore`
  user-state), unchanged (85 D-05, D-18). The leaves read and write through it, never through their
  own file I/O, with the scratch-file caches (`areweanticheatyet.json`, image files) as the
  exception. Research must confirm each slice's on-disk files.
- **D-19:** The ITAD and SteamGridDB keys stay behind the shell's `keyring_dispatch` with the
  service and account names unchanged. The TS secret owners (`steamgridSecretStore.ts`,
  `storeSearch/itadSecrets.ts`, `steamgrid/secretStore.ts`) are re-pointed or deleted with their
  slice (`82-STATE-OWNERSHIP.md` `secret-owners:steamgrid-itad`). A `-cli` never touches the real
  Keychain (85 D-14).
- **D-20:** HTTP goes through `reqwest`, and every Rust task or timer follows the Rust shutdown
  contract: it holds a `gamelib_core::shutdown::global()` Registrant for in-flight work, keeps boot
  work bounded and spawns no child processes. Load `Skill("gamelib-conventions")` before planning.
- **D-21:** v0.11 rules: live gates are authored before coding, goldens are recorded from TS before
  porting, and the phase's last plan leaves no TS or registrations for any ported slice.

### Post-research amendments (2026-11-22, answers to 86-RESEARCH.md Open Questions)
- **D-22:** **`images_cache` is deleted, not ported.** It is dead under Tauri
  (`imageCacheSchemeAvailable()` is hard-coded `false`; `initImagesCache`/`getImageFromCache` have
  no callers). Delete the TS module and the `imageFetches` slot in `appRuntime`. SC2 covers recent
  games, overrides and the SteamGridDB artwork only; D-14 item 3 is reworded to SteamGridDB artwork.
  (Open Question 1, user-confirmed.)
- **D-23:** **Rust wiki makes the two unauthenticated GOG GETs itself**
  (`api.gog.com/v2/games/<id>?locale=en-US` for the HLTB store link, `gamesdb.gog.com/platforms/<store>/external_releases/<id>`
  for the steam id), takes the title from the renderer's `title` arg, and does **not** write GOG's
  `gog_api_info` cache (both are D-03 quirk todos). The D-10 request-pin comparison tolerates a
  documented "TS-only requests" list for the GOG calls the TS makes and Rust skips. (Open Question 2,
  user-confirmed.)
- **D-24:** **D-06 gains a second allowed shape: "resolver".** A resolver registration collects named
  TS-only inputs and makes exactly one typed Rust call, nothing else. `getCrossoverIndex` (per-library
  game enumeration) and `getGogDiscounts` with `hideOwned`/`wishlistOnly` (gogdl auth token) keep a
  resolver until their owning phase (89–92). Each shim and resolver is a row in the D-06 schedule
  test with its deleting phase. SC4 reads: every ported slice's TS logic and pure-forward
  registrations are deleted in 86; resolvers are the only survivors and are scheduled. The no-token
  `getGogDiscounts` path runs in Rust. (Open Question 3, user-confirmed.)
- **D-25:** **The baked ITAD key compiles into the Rust shell.** The shell crate (not
  `gamelib-info`) reads `option_env!("ITAD_API_KEY")` with a `build.rs` `rerun-if-env-changed` and
  passes it in the info context; `release-tauri.yml` passes `ITAD_API_KEY` to the tauri build step;
  `GAMELIB_ITAD_API_KEY` stays the runtime override. (Open Question 5, user-confirmed.)
- **D-26:** **Keys and the dev vault (research recommendation, adopted by default).** A `SecretSource`
  trait in the shell over the existing keyring functions; a Rust port of the dev-vault read/write
  for the `steamGridDbApiKey` and `itadApiKey` slots (same file, slot names and refuse-when-packaged
  rule) so `pnpm tauri:dev` keeps its no-Keychain-prompt property; and a port of the one-time
  `GlobalConfig.steamGridDbApiKey` plaintext migration with its read-back proof. (Open Question 4.)
- **D-27:** **The D-04 amendment to `82-STATE-OWNERSHIP.md` also moves the `macArchStore` and
  `runsForMeStore` "TS mirror deleted: 86" cells to their owning phases**, so the table and the D-06
  schedule test agree. (Open Question 6, adopted by default.)
- **D-28:** **Anticheat exposes two Rust ops**: `anticheat_status` (is a download needed, from the
  local MD5) then TS runs `runOnceWhenOnline(() => anticheat_download)`, preserving the
  check-then-wait order. (Open Question 7, adopted by default.)
- **D-29:** **Execution order:** 86 executes after Phase 85's StoreHost ships (85-19/20). 86's first
  plan is a checkpoint that re-reads the shipped `gamelib-store` host API against what 86's plans
  assume.
- **D-30:** **D-14 item 1 narrowed for ProtonDB and Steam Deck.** These are fetched only on Linux
  (`isLinux` in `wiki_game_info.ts`), so on the macOS live gate they are scored "absent as before".
  Their behaviour stays covered by the Linux CI golden cases (86-20, 86-22), and their live check
  moves to Phase 99 with the other Linux live checks (D-16). (Plan-checker warning, user-confirmed
  2026-11-22.)

### Claude's Discretion
- The order slices port within the phase. Research suggests `wiki_game_info` first. Smaller,
  zero-test slices may go early to prove the harness.
- Module layout inside `gamelib-info`, the op names and the channel shapes through the 83 native
  router.
- The format of the recorder and replay fixtures, where they live, and how redaction is applied
  and checked.
- How the `areweanticheatyet.json` MD5 skip check and the image-file caches map onto Rust (same
  paths, same behaviour).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/ROADMAP.md` § "Phase 86: Pure leaf services": goal and the 4 success criteria
- `.planning/ROADMAP.md` § "v0.11 Phase Details": the rules for every port phase (delete TS and registrations in-phase, flags removed in-phase, live gates first, goldens first)
- `.planning/REQUIREMENTS-v0.11.md`: SVC-01
- `.planning/research/v0.11/SUMMARY.md`: item 86 (the slice list, of which D-01 narrows), the hidden costs (low test-ratio dirs) and pitfall 5 (green suites don't prove parity)
- `.planning/research/v0.11/ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md`: the crate pattern, utility crates (reqwest, regex golden-tested), parity pitfalls

### State ownership and prior contracts
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`: the rows for `gameOverridesStore`, `crossover_index`, `itad_prices`, `itad_steam_gids`, `wikigameinfo`, `umu` (amend 87 → 86 per D-04), `info-caches:hltb`, `app-runtime:image-fetch`, `misc-runtime`, `secret-owners:steamgrid-itad`, `secret-keyring`
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-CONTEXT.md`: router, no-fallback, schema authority, the `*PortComplete` template, the shutdown contract
- `.planning/phases/84-logger/84-CONTEXT.md`: native logging that the Rust slices log through
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-CONTEXT.md`: the StoreHost API, byte compatibility, corrupt handling, keyring rules, the signed-build gate path (D-16)

### Patterns to copy
- `src/backend/__tests__/steamPollsPortComplete.test.ts`, `depotPortComplete.test.ts`, `loggerPortComplete.test.ts`, `nativeSeamPortComplete.test.ts`: the existing per-slice delete gates
- `src-tauri/crates/gamelib-steampoll` + `-cli`, `gamelib-store` + `-cli`: crate + dispatch + cli shape
- `CLAUDE.md` Conventions table + `Skill("gamelib-conventions")`: todo triage keys (D-03 todos), the Rust shutdown contract, the `<verify>` prettier check

</canonical_refs>

<code_context>
## Existing Code Insights

### Slices (TS source / test lines)
- `src/backend/wiki_game_info/` (1302 / 1288): 8 sources, `applegamingwiki`, `codeweavers`, `gamesdb`, `howlongtobeat`, `pcgamingwiki`, `protondb`, `steamdeck`, `umu`; `stores.ts`
- `src/backend/crossover_index/` (801 / 1192): `fetcher`, `normalize`, `schema`, `crossoverRatingMap`, `stores`
- `src/backend/storeSearch/` (1081 / 1202): ITAD `itad`, `itadCache`, `itadCoverage`, `itadKey`, `itadSecrets`, `handlers`; it already has `__tests__/fixtures/`
- `src/backend/discounts/` (181 / 401)
- `src/backend/anticheat/utils.ts` (101 / **0**): downloads `areweanticheatyet.json` into `appFolder` and skips when the MD5 matches; waits on `onlineMonitor.runOnceWhenOnline`
- `src/backend/recent_games/recent_games.ts` (85 / **0**): emits `recentGamesChanged` to the frontend and to `appRuntime.events`
- `src/backend/game_overrides/` (157 / **0**)
- `src/backend/steamgrid/` (322 / 375) + `src/backend/sidecar/steamgridSecretStore.ts`
- `src/backend/images_cache.ts` (66 / **0**), used by `appRuntime.ts`

### Sidecar registrations to delete
- `src/backend/sidecar/enrichmentFlowRegistration.ts`, `appShellFlowRegistration.ts`, `runnerMiscFlowRegistration.ts` (research must map every channel to its slice), plus the matching `src/common/types/ipc/` schemas (`enrichment.ts`, `appShell.ts`, `storeSearch.ts`)

### Integration points
- Rust tray `src-tauri/src/tray.rs` (~L140) rebuilds from `recentGamesChanged`. The sidecar relay comment is at `src-tauri/src/sidecar.rs` ~L485
- Renderer consumers: `src/frontend/components/UI/WikiGameInfo/`, `components/UI/Anticheat/`, `screens/StoreSearch/`, `screens/Discounts/`, `screens/Library/useNonSteamLastPlayed.ts`, `src/preload/api/library.ts` (`handleRecentGamesChanged`)
- TS callers that keep shims (D-05): `launcher.ts`, `storeManagers/steam/launchDispatch.ts`, `storeManagers/sideload/games.ts`, the `storeManagers/{gog,nile,legendary}/games.ts` and `library.ts` files, `store_backend.ts`, `appRuntime.ts`, `miscRuntime.ts`, `stores/createStores.ts`, `services/types.ts`, `testUtils/testServices.ts`

</code_context>

<specifics>
## Specific Ideas

- The live gate items are fixed by D-14, and the build counted for the upgrade item is fixed by
  D-15. The operator runs them on a signed build, not `pnpm tauri:dev`.
- Quirks found while porting become todos, not fixes (D-03).

</specifics>

<deferred>
## Deferred Ideas

- Porting `online_monitor` / `connectivityNow` and `gamedetails` → Phase 88; `macArch` → Phase 89;
  the `signInProbe` parsers → Phases 91/92; `runsForMe`, `appshell` and `cache.ts` → whichever
  phase ports their callers (they're not in 86 by D-01).
- Fixing any TS quirk the port copies → individual todos (D-03).

### Reviewed Todos (not folded)
- `todo.match-phase 86` returned only keyword matches (packaged-app blank render, GOG Windows
  elevation, the gamelib-log Windows path golden, TS-launched games dying on SIGKILL, the Amazon
  store-exit refresh, Steam move install, opt-in DLC). None is in this phase's domain.

</deferred>

---

*Phase: 86-pure-leaf-services*
*Context gathered: 2026-11-22*
