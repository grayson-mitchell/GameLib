# Phase 86: Pure leaf services - Research

**Researched:** 2026-11-22
**Domain:** Porting eight TypeScript "leaf" services (wiki game info + umu, CrossOver index, ITAD store search, GOG discounts, anti-cheat, recent games, per-game overrides, SteamGridDB + image cache) from the Node sidecar to the Rust shell, behind recorded-fixture parity gates.
**Confidence:** MEDIUM. The TS source and the Phase 85 host contract are read first-hand (HIGH). Three coupling findings (GOG context, TS-only inputs, dead `images_cache`) change the phase shape and need a user decision before planning (MEDIUM). Phase 85 is only 7 of 25 plans executed, so the StoreHost API 86 builds on is specified, not shipped (the 85 interface is ASSUMED at its not-yet-built parts).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scope and crate layout**
- **D-01:** **86 ports the slice set in the roadmap's success criteria, nothing more:** `wiki_game_info`, `crossover_index`, `storeSearch` + `discounts`, `anticheat`, `recent_games`, `game_overrides`, `steamgrid` + `images_cache` (about 4.1k TS source lines). The research summary's extra items do not belong to 86 (see the Phase Boundary). This is one phase, not 86 + 86.1.
- **D-02:** **One `gamelib-info` crate.** It has a module per slice, one `dispatch(op, args)` and one `gamelib-info-cli`, following the Tauri-free per-domain crate pattern of Phases 63–80. It does not use eight tiny crates. Each slice still has its own `*PortComplete` delete gate.
- **D-03:** **Rust copies TS quirks for parity, and each quirk gets a todo.** The fixtures pin current behaviour, including any wrong TTL, lenient parse or odd sort order. Each quirk found is filed as a `.planning/todos/pending/` todo (with the three triage keys) and fixed later as its own change, so a golden diff never mixes a port with a fix.
- **D-04:** **The umu lookup (`wiki_game_info/umu`, `getUmuId`) ports with wiki in 86** as a `gamelib-info` module, because Rust wiki calls it. Its other callers (`storeManagers/gog/games.ts`, `nile/games.ts`, `legendary/games.ts`) go through a shim under D-05. **Amend `82-STATE-OWNERSHIP.md`:** the `umu` row's mirror deletion moves from 87 to 86, recorded as an amendment with the reason.

**Slices that still have TypeScript callers**
- **D-05:** **TS backend callers reach a ported slice through a thin `rustInvoke` shim with the same signature.** The TS implementation is deleted in 86, and callers don't change. Known callers: `launcher.ts` (`addRecentGame`, `gameAnticheatInfo`), `steam/launchDispatch.ts` (`addRecentGame`), `sideload/games.ts` (`removeRecentGame`), the GOG, Epic and Amazon `games.ts`/`library.ts` files (wiki info, umu, overrides, steamgrid), and `store_backend.ts` / `appRuntime.ts` / `miscRuntime.ts`. Research must produce the complete list. Each shim dies when its last caller ports (88 / 91 / 92). — **Reversibility:** reversible — the shims are one-line wrappers.
- **D-06:** **The delete gate counts the shims.** A slice's `*PortComplete` gate fails if the old TS implementation survives, or if a shim contains anything beyond the typed `rustInvoke` call. A schedule test, modelled on 85's `storeMirrorSchedule`, lists every shim with the phase that deletes it, so a shim can't outlive its schedule unnoticed.
- **D-07:** **Rust has no online logic in 86.** The online signal comes from TS. `anticheat`'s download currently waits on `onlineMonitor.runOnceWhenOnline`, which stays in TS until 88. TS keeps that hook and calls a Rust op (e.g. `anticheat.refresh`) when it fires. The same pattern applies to any other ported fetcher that waits for connectivity. Phase 88 rewires the trigger when `online_monitor` ports.
- **D-08:** **Rust emits `recentGamesChanged`.** Once Rust owns recent games, it emits to the renderer through `FrontendEmitter` and updates the Rust tray directly (`src-tauri/src/tray.rs`). The sidecar relay of this event (`src-tauri/src/sidecar.rs` around L485) goes away for this event. If research finds a TS backend listener on `appRuntime.events` `'recentGamesChanged'`, that listener gets a relay that dies with it.

**Fixtures and parity oracle**
- **D-09:** **The oracle is recorded real responses plus TS-output goldens.** The TS runs once against the live services for the network-backed slices (the 8 wiki sources, the CrossOver index, ITAD search/discounts, anticheat and SteamGridDB). The raw HTTP responses are recorded and committed with secrets redacted (ITAD and SteamGridDB keys, any token). The golden is what TS produced from those responses. Rust replays the same responses and must match the golden. CI stays offline and deterministic.
- **D-10:** **Requests are pinned as well as outputs.** The recorder stores each TS request. Rust must send the same URL, query, method and API-key / User-Agent headers, so an endpoint drift fails in CI and not in production.
- **D-11:** **The zero-test slices get a TS golden harness committed first (SC3).** These are `anticheat`, `recent_games`, `game_overrides` and `images_cache`. An early plan writes a TS harness that drives each one (inputs, plus disk state before and after through the StoreHost files) and emits golden JSON. The goldens are committed **before** any Rust for that slice. The Rust tests read the same files. The harness is deleted with its slice. The goldens need the Phase 82 D-05 vacuous-pass guards (a floor on the fixture count, and a test that an empty input fails).
- **D-12:** **There is an opt-in live drift check, kept out of CI.** A `gamelib-info-cli` command (or an `#[ignore]` test) hits the live endpoints for a handful of known titles on demand.

**Rollback and live gate**
- **D-13:** **No `GAMELIB_<SLICE>` flag, and each slice is deleted once proven.** These slices are read-mostly info and caches, and fixture parity is the proof. A slice's TS and sidecar registrations are deleted in the same plan as its port, or the next one, once its goldens pass. No flag helper gets built (83 D-05 still waits for a slice that needs a window). — **Reversibility:** costly — restoring a slice means reviving its TS and registrations from git.
- **D-14:** **An operator live gate on macOS, authored before coding, with four items:**
  1. **Game page info:** a few Steam, Epic and GOG game pages show the wiki block (ProtonDB, HLTB, Steam Deck, CrossOver rating) and the anticheat badge as before.
  2. **Store search and discounts:** a Store Search query and the Discounts screen show results, badges and prices as before, with the ITAD key working.
  3. **Artwork and recent games:** SteamGridDB artwork and cached images load. Launching a game updates recent games in the tray and the library's last played.
  4. **Upgrade with no data change (SC2):** recent games, overrides and the caches are untouched after the upgrade, and there is no Keychain prompt for the ITAD or SteamGrid keys.
  It follows the offline-UAT memory shape (network off only for the action) wherever an item tests offline behaviour.
- **D-15:** **The gate build is a signed Phase 86 build installed over a signed Phase 85 build.** It reuses 85's signed-release path (85 D-16). A dev build does not count for item 4. Items 1–3 run in the same session.
- **D-16:** **Windows and Linux are covered by CI only.** Golden replay runs on the three-OS CI matrix, including Windows path handling for `images_cache` / steamgrid. Their live check rides with Phase 99, as in 85 D-10.

**Carried forward (already decided, not re-asked)**
- **D-17:** A native channel never falls back to the sidecar. Its Rust serde struct (`deny_unknown_fields`, camelCase) is the schema, and the channel's zod entry in `channelSchemas.ts` is deleted with its TS registration. The IPC snapshot is regenerated and committed (83 D-04, D-06, D-07).
- **D-18:** Persisted state goes through the Phase 85 Rust StoreHost (`gamelib-store`). That means byte-identical writes, the corrupt-file copy-aside and the existing TTLs (`wikigameinfo` 30 d, `crossover_index` 24 h, `itad_prices` / `itad_steam_gids` 30 d, `umu` 6 h, `gameOverridesStore` user-state), unchanged (85 D-05, D-18). The leaves read and write through it, never through their own file I/O, with the scratch-file caches (`areweanticheatyet.json`, image files) as the exception. Research must confirm each slice's on-disk files.
- **D-19:** The ITAD and SteamGridDB keys stay behind the shell's `keyring_dispatch` with the service and account names unchanged. The TS secret owners (`steamgridSecretStore.ts`, `storeSearch/itadSecrets.ts`, `steamgrid/secretStore.ts`) are re-pointed or deleted with their slice (`82-STATE-OWNERSHIP.md` `secret-owners:steamgrid-itad`). A `-cli` never touches the real Keychain (85 D-14).
- **D-20:** HTTP goes through `reqwest`, and every Rust task or timer follows the Rust shutdown contract: it holds a `gamelib_core::shutdown::global()` Registrant for in-flight work, keeps boot work bounded and spawns no child processes. Load `Skill("gamelib-conventions")` before planning.
- **D-21:** v0.11 rules: live gates are authored before coding, goldens are recorded from TS before porting, and the phase's last plan leaves no TS or registrations for any ported slice.

### Claude's Discretion
- The order slices port within the phase. Research suggests `wiki_game_info` first. Smaller, zero-test slices may go early to prove the harness.
- Module layout inside `gamelib-info`, the op names and the channel shapes through the 83 native router.
- The format of the recorder and replay fixtures, where they live, and how redaction is applied and checked.
- How the `areweanticheatyet.json` MD5 skip check and the image-file caches map onto Rust (same paths, same behaviour).

### Deferred Ideas (OUT OF SCOPE)
- Porting `online_monitor` / `connectivityNow` and `gamedetails` → Phase 88; `macArch` → Phase 89; the `signInProbe` parsers → Phases 91/92; `runsForMe`, `appshell` and `cache.ts` → whichever phase ports their callers (they're not in 86 by D-01).
- Fixing any TS quirk the port copies → individual todos (D-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SVC-01 | Wiki game info, the CrossOver compatibility index, store search and discounts, anti-cheat info, recent games, per-game overrides and the artwork caches work as before (`.planning/REQUIREMENTS-v0.11.md:25`) | Per-slice inventory (Architecture Patterns), the on-disk file table, the oracle/replay design (Validation Architecture), the TS-only-input findings (Open Questions 1-4), and the per-slice delete-gate lists |
</phase_requirements>

## Summary

All eight slices are pure functions of (renderer args or TS-resolved inputs, recorded HTTP, store files, clock), which is why a recorded-response oracle can pin them. The work divides into three layers. **(1) Shared infrastructure** in `gamelib-info`: an `Http` trait with a `reqwest` impl and a replay impl, a `CacheView` that reimplements TS `CacheStore` semantics (`__timestamp.<key>` entries, a JS `Date()` string, TTL plus `invalidateCheck`) on top of the Phase 85 `StoreHost`, a runner-capability table, and a secret source. **(2) Eight slice modules**, each with a TS oracle golden recorded first. **(3) Shell wiring**: native router channels for renderer-called ops, `rustInvoke` ops for TS callers, the tray and `FrontendEmitter` for recent games, and per-slice deletion gates.

Four findings change the phase shape and need a user decision before planning (all under Open Questions):
- **`images_cache` is dead code under Tauri.** `imageCacheSchemeAvailable()` is hard-coded `false`, `initImagesCache` and `getImageFromCache` have no caller, and the `images-cache` folder is never created. Porting it has no oracle (the TS never ran in production). Recommend deleting it, not porting it, with user confirmation.
- **Wiki and discounts depend on GOG-manager state that stays TS until Phase 92.** HowLongToBeat's GOG branch needs `game.getExtraInfo().storeUrl` (three GOG API calls), the GamesDB source calls `libraryManagers.gog.getGamesdbData` (which also writes GOG's `gog_api_info` cache), and `getGogDiscounts` needs a bearer token that only exists via a `gogdl auth` child-process spawn. D-05's "thin shim" covers callers, but these three renderer channels need either Rust re-implementing two unauthenticated GOG GETs (wiki) or a TS-side resolver registration that survives 86 (discounts, CrossOver rating map).
- **SC4 ("TS and sidecar registrations are deleted") cannot hold literally for resolver channels.** `getCrossoverIndex` (enumerates every TS library manager) and `getGogDiscounts` (GOG token) must keep a TS registration that collects inputs and makes one typed Rust call until Phases 89-92. D-06's gate needs a second allowed shape ("resolver") with its own schedule row.
- **Phase 85 is mid-flight (plan 7 of 25).** 86 depends on `StoreHost` (widened in 85-09), the cache-family and user-state flips (85-12, 85-13), the config flip (85-15, `games.recent` lives in `store/config.json`), and the signed Phase 85 build (85-19/20). The 86 plans must re-verify the host API at plan time.

**Primary recommendation:** Build `gamelib-info` as one Tauri-free crate on an injected `Http` trait, `StoreHost` handle, `Clock`, `SecretSource` and `Emitter`, prove the harness on the two store-backed, no-HTTP slices (`recent_games`, `game_overrides`) and the smallest HTTP slice (anticheat) before the big ones (wiki, ITAD), record every oracle golden from the TS before writing any Rust for the slice, and delete each slice's TS the moment its goldens pass. Resolve the four findings above with the user first.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Wiki info, umu, HLTB, ProtonDB, Steam Deck lookups | Rust `gamelib-info` (shell process) | Renderer (reads `wikigameinfo` store directly) | Network fetch plus cache; the renderer already reads the `wikigameinfo` store via `storeGet` (`useWikiMetacriticScores.ts:102`) |
| CrossOver index fetch, cache and lookup | Rust `gamelib-info` | TS resolver (game list), Renderer | The index fetch and lookup are pure; the per-library enumeration is TS-only until the managers port (Open Question 3) |
| ITAD store search, deals, steam gids | Rust `gamelib-info` | Keyring (user key) | Pure HTTP plus a `StoreHost` cache; key from keyring, baked key from the build |
| GOG catalog discounts | Rust `gamelib-info` | TS resolver (GOG token) | Public catalog GET; the optional bearer token comes from a `gogdl auth` spawn in TS |
| Anti-cheat data download and lookup | Rust `gamelib-info` | TS (online hook, D-07) | Plain file in `appFolder`; TS keeps `runOnceWhenOnline` until Phase 88 |
| Recent games list | Rust `gamelib-info` over `StoreHost` (`configStore` `games.recent`) | Shell tray, `FrontendEmitter`, renderer | The shell already owns the tray; the list is a key in the Rust-owned config store |
| Per-game metadata overrides | Rust `gamelib-info` over `StoreHost` (`store/game-overrides.json`) | Renderer, TS `gamedetails` callers (shim) | A user-state store plus an image-file cleanup |
| SteamGridDB search, grids, heroes, key status | Rust `gamelib-info` | Keyring, Renderer | Authenticated HTTP; key stays behind the keyring slot |
| Image cache (`images-cache`, `imagecache://`) | None: dead under Tauri | — | Not served by any shell (see Open Question 1) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `reqwest` | 0.13.4 (locked; shell pins `default-features = false, features = ["rustls-no-provider"]`) | All HTTP | Already the project's HTTP client for `gamelib-steamcm`, `gamelib-depot` and `log_upload.rs`; D-20 mandates it [VERIFIED: `src-tauri/Cargo.toml:80`, `Cargo.lock`] |
| `serde` / `serde_json` | 1 (locked) | Args, wire shapes, results | Project-wide; Phase 85's ordered `Json` lives in `gamelib-store` for anything byte-compared |
| `regex` | 1.13.1 (locked) | Wikitext and HLTB HTML scraping | Same engine every regex in the TS is ported to; needs JS-parity care (Pitfall 4) [VERIFIED: `Cargo.lock`] |
| `flate2` | 1.1.9 (locked) | Gunzip the bundled and fetched `crossover-index.json.gz` | Already locked [VERIFIED: `Cargo.lock`] |
| `unicode-normalization` | 0.1.26 (locked) | NFKD for slugs and CrossOver match keys | Matches JS `String.prototype.normalize('NFKD')` [VERIFIED: `Cargo.lock`] |
| `sha2` | 0.10.9 (locked) | ITAD search cache key (`sha256 ... slice(0, 32)`) | Already locked [VERIFIED: `Cargo.lock`] |
| `url` | 2.5.8 (locked) | WHATWG URL parsing for raw request URLs and `isHttpsUrl` | Same WHATWG algorithm Node's `new URL` uses [VERIFIED: `Cargo.lock`] |
| `jiff` | 0.2.46 (locked) | Parse and format the JS `Date()` timestamp string | Replaced `chrono` in `gamelib-log` (RUSTSEC-2026-0543) [VERIFIED: `Cargo.lock`, git log `8fcadab94`] |
| `tokio` | 1.54.1 (locked) | Async runtime, `select!` against the shutdown token | Used by steamcm, depot, steampoll [VERIFIED: `Cargo.lock`] |
| `gamelib-store` (in-repo) | 85 | `StoreHost`, ordered `Json`, `Obj::insert_js`, dot-prop 6 | Sole disk writer for every store this phase touches [VERIFIED: `gamelib-store/src/json.rs:77`, `ops.rs:19-31`] |
| `gamelib-core` (in-repo) | 83 | `FrontendEmitter`, `Clock`, `Shutdown`, `paths` | The shared composition-root traits |
| `md-5` | 0.10 (new) | The anticheat MD5 skip check (`createMD5` hex digest) | Only new crate; RustCrypto, shares `digest` with locked `sha2` 0.10 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `indexmap` | 2 (locked via `gamelib-store`) | Ordered objects | Only through `gamelib_store::json::Obj`; do not use `serde_json::Value` for anything that is byte-compared |
| `tempfile` | 3 (dev) | Replay-test scratch dirs | Inside `gamelib_testutil::FakeHome` |
| reqwest features `gzip`, `brotli`, `deflate` | 0.13.4 | Decode compressed HowLongToBeat responses | Only if the HLTB `Accept-Encoding` header is sent (Pitfall 3); changes the lockfile name set, so re-pin `EXPECTED_LOCKFILE_CRATE_NAMES` |
| reqwest feature `stream` | 0.13.4 | Streamed bodies | Not needed if `images_cache` is dropped |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| reqwest `.query()` | Hand-built query string with an axios-compatible encoder | `.query()` needs the opt-in `query` feature [VERIFIED: `reqwest-0.13.4/Cargo.toml` `query = [...]`, `request.rs:364 #[cfg(feature = "query")]`] and encodes differently from axios (Pitfall 2). Build the query string yourself. |
| A mock HTTP server crate (`wiremock`, `httpmock`) | An `Http` trait with a replay impl | None of the mock crates are in `Cargo.lock` [VERIFIED: grep]; a trait seam also gives request pinning for free and adds no dependency. `log_upload.rs` already uses a localhost stand-in for its end-to-end check. |
| `icu_collator` | A hand-written `localeCompare` subset proved on fixtures | ITAD sorts deals by `a.storeName.localeCompare(b.storeName)` (Pitfall 6). ICU is heavy; the fixtures decide whether a subset suffices. |
| `md5` crate | `md-5` | `md-5` is the RustCrypto one and shares `digest` with the locked `sha2`. |

**Installation:**
```bash
# src-tauri/crates/gamelib-info/Cargo.toml: path deps gamelib-core, gamelib-store; crates as above
cd src-tauri && cargo add -p gamelib-info md-5@0.10
```

**Version verification:** every "locked" version above was read from `src-tauri/Cargo.lock` this session. `md-5` is not in the lock; `gsd-tools query package-legitimacy check --ecosystem crates` returned `OK` for it (12.3M weekly downloads, repo `RustCrypto/hashes`).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| md-5 | crates.io | first published 2017-04 | 12.3M/wk | github.com/RustCrypto/hashes | OK | Approved (new to the lockfile; update `EXPECTED_LOCKFILE_CRATE_NAMES` in the same commit) |
| regex | crates.io | 2014 | 27.0M/wk | github.com/rust-lang/regex | OK | Approved (already locked) |
| flate2 | crates.io | 2014 | 19.2M/wk | github.com/rust-lang/flate2-rs | OK | Approved (already locked) |
| unicode-normalization | crates.io | 2015 | 12.4M/wk | github.com/unicode-rs/unicode-normalization | OK | Approved (already locked) |
| sha2 | crates.io | n/a | n/a | RustCrypto | OK (seam) | Approved (already locked) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

The seam output for `serde_urlencoded` was cut off in this session; it is not needed (the plan builds query strings by hand, so the `query` feature is not enabled).

## Architecture Patterns

### System Architecture Diagram

```
Renderer (React)                         Sidecar (Node, until 99)
  window.api.getWikiGameInfo(...)          launcher.ts / launchDispatch.ts / sideload/games.ts
  searchStores / steamgriddb.* / ...       gog|nile|legendary games.ts (umu) / nonesteamgame (wiki)
  removeRecent / getAnticheatInfo          gamedetails (overrides, 88)   bootstrap 'releasesInfoReady' hook
        |                                     |  typed shim / resolver call (rustInvoke frame)
        | native channel (83 router)          v
        v                              +--------------------+
   native_router.rs  ---------------->|  info_dispatch.rs  |  (shell: validates args via generated
   (serde deny_unknown_fields)        |  rustInvoke + native|   structs, builds InfoCtx once)
                                       +---------+----------+
                                                 | gamelib_info::dispatch(op, args, &InfoCtx)
                                                 v
   +------------------------ gamelib-info (Tauri-free) ------------------------+
   |  wiki(+umu, hltb, pcgw, agw, protondb, deck, gamesdb)   crossover           |
   |  itad(search, deals, gids, gate)   discounts   anticheat   recent   overrides|
   |  steamgrid(+key ops)      shared: http | cache_view | runner_caps | secrets  |
   +--+-----------+------------+-------------+-------------+--------------------+
      |           |            |             |             |
  Http trait   StoreHost    SecretSource   Clock        Emitter / TraySink
  (reqwest |   (gamelib-    (shell: keyring  (gamelib-   (FrontendEmitter,
   Replay)    store: cache   slots +          core)       shell tray.rs)
              + user-state   dev vault)
              stores)
      |           |
   Internet   <userData>/store_cache/*.json, store/{config,game-overrides}.json,
              areweanticheatyet.json (plain file), game_overrides_images/
```

Primary flow (store search): renderer `searchStores(query, country)` -> native router validates args -> `gamelib_info::dispatch("itad.search")` -> `CacheView` read of `itad_prices` (fresh? return) -> rate-limit gate check -> key resolve (user keyring key, then env, then baked) -> `Http` GET `/games/search/v1` -> `Http` POST `/games/prices/v3` -> map, sort, write `CacheView` -> return. On a 429 or network error with a stale entry, serve it with `cachedAt`.

### Recommended Project Structure

```
src-tauri/crates/gamelib-info/
├── Cargo.toml            # rust-version 1.77.2, clippy dbg_macro/todo deny, no tauri, no keyring
├── src/
│   ├── lib.rs            # dispatch(op, args, &InfoCtx), OPS, CLI_ONLY_OPS, catch_unwind
│   ├── ctx.rs            # InfoCtx { http, store, clock, secrets, emitter, paths, app_version, platform }
│   ├── http.rs           # trait Http, Request, Response, ReqwestHttp (timeouts, redirect policy), url helpers
│   ├── cache_view.rs     # CacheView: TS CacheStore semantics over StoreHost
│   ├── runner_caps.rs    # appNameIsSteamAppId, hasStoreCatalog, storeMap, umu store map (+ shared JSON)
│   ├── secrets.rs        # trait SecretSource; ItadKey / SgdbKey owners; SGDB plaintext migration
│   ├── wiki/{mod,pcgw,agw,hltb,title_match,protondb,deck,gamesdb,gog_ctx,codeweavers_slug}.rs
│   ├── umu.rs
│   ├── crossover/{mod,fetcher,normalize,schema,rating_map}.rs
│   ├── itad/{mod,cache,coverage,key,gate,mapping}.rs      # storeSearch
│   ├── discounts.rs
│   ├── anticheat.rs
│   ├── recent.rs         # trait RecentSink
│   ├── overrides.rs
│   └── steamgrid.rs
├── tests/{golden_<slice>.rs, requests_<slice>.rs, roundtrip_<slice>.rs, vectors.rs, common/}
│   └── fixtures/{recorded/<slice>/<case>/{request.json,response.*}, golden/<slice>/*.json, state/<slice>/*}
src-tauri/crates/gamelib-info-cli/{src/main.rs, tests/cli.rs}      # D-12 live drift command, FakeHome only
src-tauri/src/info_dispatch.rs                                     # native + rustInvoke arms, InfoCtx builder, RecentSink impl
```

Registration checklist (copy 84-02 / 85-06, from `85-PATTERNS.md`): add both crates to `src-tauri/Cargo.toml` members and the path dep; add `-p gamelib-info -p gamelib-info-cli` to `.github/workflows/rust-test.yml` and its step name; update `meta/__tests__/rustTestWorkflow.test.ts`, `EXPECTED_LOCKFILE_CRATE_NAMES` in `src/backend/__tests__/cargoFeatures.test.ts`, and `src-tauri/crates/README.md`.

### Pattern 1: Tauri-free dispatch with injected seams

**What:** `pub async fn dispatch(op: &str, args: &[Value], ctx: &InfoCtx) -> Result<Value, String>` (or a sync facade that `block_on`s), `OPS` sorted, args as `#[serde(deny_unknown_fields, rename_all = "camelCase")]` structs, `catch_unwind` around the op, "results not errors" for a normal miss. This is the documented crate contract [CITED: `src-tauri/crates/README.md` section 2 "Library contract"].
**When to use:** every op, for both the native router (async handlers, `InvokeHandler = fn(Arc<NativeCtx>, Vec<Value>) -> NativeFuture`) and `rustInvoke` (a worker thread that is never a tokio thread, so `block_on` is legal; `steamcm_dispatch.rs` header).
**Example:**
```rust
// Source: src-tauri/src/steamcm_dispatch.rs (pattern), README section 2
pub(crate) fn rpc_info_recent_add(args: &[Value]) -> Result<Value, String> {
    InfoRecentAddArgs::from_args(args)?;          // generated deny_unknown_fields struct
    gamelib_info::dispatch_sync("info_recent_add", args, &info_ctx())
}
```

### Pattern 2: `CacheView` reimplements TS `CacheStore` over `StoreHost`

**What:** the TS `CacheStore` (`src/backend/cache.ts`, read in full) is not part of `StoreHost`; it is a TTL layer on top of conf. Its observable behaviour, which the Rust must reproduce:
- `set(key, value)` writes `key` and `__timestamp.<key>` (a JS `Date()` string) as two dot-notation writes, so with dot paths on, a key containing `.` nests (`S.T.A.L.K.E.R.` becomes nested objects) and the timestamps nest under one top-level `__timestamp` object.
- `get(key, fallback)` returns the fallback if the key is absent; if `lifespan` is set, it also returns the fallback when `__timestamp.<key>` is absent; when `minutesSinceUpdate > lifespan` **and** `invalidateCheck(value)` is true, it deletes both keys and returns the fallback.
- Default `invalidateCheck` is `() => true`.
**Per-store parameters** (all `kind: 'cache'`, all under `<userData>/store_cache/<name>.json`):

| Store | Name | Lifespan (minutes) | `invalidateCheck` | Key |
|-------|------|--------------------|-------------------|-----|
| wiki info | `wikigameinfo` | `60 * 24 * 30` | default (true) | `removeSpecialcharacters(title)` |
| umu | `umu` | `60 * 6` | `(data) => !data` | `` `${runner}_${appName}` `` |
| CrossOver | `crossover_index` | `60 * 24` | `() => false` | `'index'` |
| ITAD prices | `itad_prices` | `60 * 24 * 30` | `() => false` | `search:<country>:<hash>`, `deals:<country>:<gid>`, `index` |
| ITAD gids | `itad_steam_gids` | `60 * 24 * 30` | `() => false` | `app<id>` |

[VERIFIED: `wiki_game_info/stores.ts`, `crossover_index/stores.ts`, `storeSearch/stores.ts`, `cache.ts`, all read this session; the constants are quoted from those files]
**Timestamp format:** TS writes `Date()`, the local-time long form, e.g. `Sat Nov 21 2026 13:07:08 GMT-0500 (Eastern Standard Time)`. Rust cannot reproduce long timezone names. Write the UTC form `Sat Nov 21 2026 18:07:08 GMT+0000 (Coordinated Universal Time)` (what Node prints under `TZ=UTC`); a JS `new Date()` parses it identically, and the parenthetical is ignored on parse [VERIFIED: node run this session: both the UTC form and a form with a nonsense parenthetical parsed to the same instant]. On read, accept this form and ISO 8601. Record the divergence as a quirk todo (D-03) and have the goldens run the TS oracle under `TZ=UTC` with a pinned clock.
**When to use:** all five cache stores above. Do not re-derive TTL semantics per slice.

### Pattern 3: Recorded-response oracle (TS side) and replay (Rust side)

**What:** a TS oracle test, behind an env flag, sets `axios.defaults.adapter` **before importing the slice modules**, because `axios.create()` copies `axios.defaults` at creation, so the shared `axiosClient` and bare `axios` both go through it [VERIFIED: node run this session, axios 1.20.0: an instance created after the assignment used the replaced adapter]. The adapter records `{method, axios.getUri(config), headers, data}` and the real response, then returns it. In replay mode the same adapter serves recorded responses. Goldens are what the TS functions returned and wrote (store bytes via the oracle's StoreHost-shaped fixture files). Follow `src/backend/stores/__tests__/storeOracle.test.ts` (`GAMELIB_WRITE_STORE_GOLDEN=1` write mode) and the 84 logger golden shape: `cases.json`, `expected/<case-id>/`, a `MANIFEST.json` with a count and a floor, and a test that an empty case list fails (`assertAtOrAboveFloor`, `src/backend/testUtils/censusFloor.ts`).
**Redaction:** the recorder replaces the ITAD `key` query value, the SteamGridDB `Authorization` header and any `x-auth-token` before writing; a redaction test fails on a `key=` value, a `Bearer ` token or the HLTB token pattern in any committed fixture.
**Rust side:** `Replay` implements `Http` from the recorded files and **asserts** each request equals the recorded request under the pinned-field comparison below.
**Pinned fields (D-10):** method, scheme+host+path, the **decoded** query pairs in order, request body, and these headers if present: `User-Agent`, `Authorization`, `Referer`, `Content-Type`, `x-auth-token`, `x-hp-key`, `x-hp-val`, `Accept-Language`, `X-GOG-Library-Cert`. Exclude transport headers (`Accept-Encoding`, `Connection`, `Host`, `Content-Length`): axios and reqwest add these differently and servers decode them the same.

### Pattern 4: Delete gate per slice and a shim/resolver schedule

**What:** copy `src/backend/__tests__/loggerPortComplete.test.ts`. Per slice: `DELETED` file list, `KEPT` list (golden dirs), `FORBIDDEN_IDENTIFIERS`, the slice's channels from `nativeChannels.json` (`slice: "info"`) must not be registered by any `ipc.on|handle` literal, every scan over comment-stripped text with a walk floor and self-tests that each scan can fail. D-06 adds: the gate fails if a shim or resolver body contains anything beyond the typed call, and `infoShimSchedule.test.ts` lists each shim/resolver with its deleting phase, modelled on 85's `storeMirrorSchedule`.

### Anti-Patterns to Avoid
- **File I/O of your own for any store-backed slice.** Go through `StoreHost` (D-18). The only exceptions: `areweanticheatyet.json` and override image files.
- **`serde_json::Value` for anything byte-compared.** Key order is lost. Build objects with `gamelib_store::json::Obj::insert_js` so integer-like keys (numeric Steam appNames) land in JS order.
- **`reqwest::Error` in a log line.** Its `Display` includes the URL with the `key=` query. Call `.without_url()` first [VERIFIED: `reqwest-0.13.4/src/error.rs:91`].
- **A process-global `static` HTTP client built before the rustls provider is installed.** The shell installs the provider in `run_setup`; steamcm builds its client lazily after `install_crypto_provider` [VERIFIED: `facade.rs:702-710`].
- **Mixing a port and a fix in one golden diff.** Copy the quirk, file the todo (D-03).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ordered JSON, JS number text, JS integer-key order, dot-prop 6 paths | A new serializer or path walker | `gamelib_store::{json, dotpath, ops}` | Byte-identical writes are the whole point of 85; `Obj::insert_js` already reproduces JS key order [VERIFIED: `json.rs:73-77`] |
| Atomic write, 0600/0700, corrupt copy-aside, backups | Per-slice write code | `StoreHost` (85-09) | One writer, one lock, one drain |
| Keyring access | A second `keyring` dependency | The shell's `keyring_dispatch` functions behind a `SecretSource` trait | Slot names are an allowlist (`steamgrid-api-key`, `itad-api-key`); a `-cli` must never reach the real Keychain (D-19, 85 D-14) |
| Process spawning | Anything | Nothing: 86 spawns no child | D-20; the GOG `gogdl auth` spawn stays TS |
| Exit/shutdown waits | A custom timeout | `gamelib_core::shutdown::global()` Registrant plus `token()` in a `tokio::select!` | Contract rows 2-4 in `gamelib-conventions` |
| JS `String.prototype.normalize` | Hand tables | `unicode-normalization` NFKD | Same Unicode data |
| Gunzip | Manual inflate | `flate2` | Already locked |
| HTTP mock server | A custom TCP server per test | The `Http` trait with `Replay` | Pins requests as well as responses |

**Key insight:** the leaves look trivial because the HTTP is simple, but their parity risk is in the small JS-isms around it: query encoding, regex dialect, `localeCompare`, `Date()` strings, object key order and dot-path nesting. Each has a ready primitive or a named test below; none should be re-invented per slice.

## Per-slice inventory (what actually has to port)

| Slice | TS (src / test lines) | Renderer channels | TS callers | On-disk state | Notes |
|-------|----------------------|-------------------|------------|---------------|-------|
| wiki + umu | 1302 / 1288 | `getWikiGameInfo(title, appName, runner, forceRefresh?)` | `shortcuts/nonesteamgame/nonesteamgame.ts:260` (`getWikiGameInfo`); `storeManagers/{gog,nile,legendary}/games.ts` (`getUmuId`, lines 747, 463, 1073); `utils.ts:356` (`wikiGameInfoStore.clear()` in `clearCache`); `sidecar/runnerAuthFlowRegistration.ts:90` and `shortcutsFlowRegistration.ts:126` (deps types) | `store_cache/wikigameinfo.json`, `store_cache/umu.json` | 8 sources; the GOG branches need TS-only context (Open Question 2); the renderer also reads `wikigameinfo` directly |
| crossover_index | 801 / 1192 | `getCrossoverIndex()` (60 s invoke bound exempt in `main.rs` `LONG_RUNNING_CHANNELS` per the registration header) | `wiki_game_info.ts` (`getCodeweaversFromIndex`, `crossoverIndexHas`), `appRuntime.ts` | `store_cache/crossover_index.json`; bundled `<publicDir>/crossover-index.json.gz` (gitignored; release-time download) | `NAME_MATCHING_SHIPS` gate; per-library enumeration is TS (Open Question 3) |
| storeSearch (ITAD) | 1081 / 1202 | `searchStores`, `getStoreSearchDeals`, `getItadSteamGids`, `itad.getKeyStatus`, `itad.setApiKey` | none other than the handlers | `store_cache/itad_prices.json`, `store_cache/itad_steam_gids.json`; keyring slot `itad-api-key` | Baked key (Open Question 5); in-memory rate-limit gate and single-flight; existing `__tests__/fixtures/itad/*` |
| discounts (GOG catalog) | 181 / 401 | `getGogDiscounts(locale, hideOwned?, wishlistOnly?)` | `storeManagers/gog/user.ts` references the module | none | Token via TS (Open Question 3) |
| anticheat | 101 / **0** | `getAnticheatInfo(appNamespace)` | `launcher.ts:787` (`gameAnticheatInfo`); `sidecar/bootstrap.ts:3026` (`downloadAntiCheatData`, listener on `releasesInfoReady`) | `<appFolder>/areweanticheatyet.json` (plain file) | Windows: no-op. D-07 online hook stays TS |
| recent_games | 85 / **0** | `removeRecent(appName)`; push `recentGamesChanged` | `launcher.ts:471`, `steam/launchDispatch.ts:102,173` (`addRecentGame`), `sideload/games.ts:233` (`removeRecentGame`) | `store/config.json` key `games.recent` | No TS listener on `appRuntime.events` `'recentGamesChanged'` [VERIFIED: grep of `.on(`/`once(` found none; only the typed declaration in `backend_events.ts:13`] |
| game_overrides | 157 / **0** | `getGameMetadataOverride`, `getAllGameOverrides` (read), `setGameMetadataOverride` (stays in `gamedetails`, 88) | `gamedetails/dispatch.ts:113` (`attachOverrides`, sync), `gamedetails/overrides.ts:93-94` (`setGameOverrides` + `getAllGameOverrides`, sync) | `store/game-overrides.json` key `overrides`; `<userData>/game_overrides_images/` files named `<appName>-...` | Shims are async, callers are sync (Pitfall 9) |
| steamgrid + images_cache | 322 / 375 + 66 / **0** | `steamgriddb.hasApiKey`, `.setApiKey`, `.searchGame`, `.getGrids`, `.getHeroes` | none other than the handlers | keyring slot `steamgrid-api-key`; legacy `GlobalConfig.steamGridDbApiKey` plaintext migration | `images_cache` is dead (Open Question 1) |

Channel-to-registration map (the context asked for this): all 17 in-scope channels except overrides and the three `gameDetails` ones are in `src/backend/sidecar/enrichmentFlowRegistration.ts`; `getGameMetadataOverride` and `getAllGameOverrides` are in `gameDetailsFlowRegistration.ts:247,254`. `appShellFlowRegistration.ts` and `runnerMiscFlowRegistration.ts` register **no** channel of these eight slices (grep found none; `appShellFlowRegistration.ts` only holds the tray runner-resolution channel and a comment on `games.recent`). `enrichmentFlowRegistration.ts` also registers four channels that are out of scope (`getKnownFixes`, `getGamelibFixStatus`, `getRunsForMeMap`, `setRunsForMe`), so the file **shrinks but is not deleted** in 86. The zod entries to delete are in `src/common/types/ipc/enrichment.ts` (the 17 keys at lines 48-85) and `appShell.ts:98` (`recentGamesChanged`, which becomes a Rust-emitted push).

## Runtime State Inventory (persisted state this phase must leave untouched, SC2)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The six cache and user-state stores in the table above; `games.recent` inside `store/config.json`; `areweanticheatyet.json`; `game_overrides_images/*`. After Phase 85 the Rust `StoreHost` owns every store file [VERIFIED: `82-STATE-OWNERSHIP.md` legend "All rows flip at 85 except `uploadedLogs`"] | No data migration: Rust reads and writes the same files. Code edit only: the TS stores for these rows are deleted in 86 (mirror deletion column) |
| Live service config | None. | None |
| OS-registered state | Keyring slots `steamgrid-api-key` and `itad-api-key` [VERIFIED: `sidecar/keyringTokenStore.ts:29,31`]; dev-only vault file `<tmp>/gamelib-dev-secret-vault.json` slots `steamGridDbApiKey`, `itadApiKey` [VERIFIED: `devSecretVault.ts:70-85`] | Names and the keyring service stay; the dev vault needs a Rust reader or the dev flow loses its no-prompt property (Open Question 4) |
| Secrets/env vars | `GAMELIB_ITAD_API_KEY` (runtime), `ITAD_API_KEY` baked at build via esbuild `__ITAD_API_KEY__` (`meta/esbuildWorkerBundleShared.ts:85`), the release workflow's secret check at `.github/workflows/release-tauri.yml:337-347` | The baked key must be compiled into the **shell** build, not only the sidecar bundle (Open Question 5); `GAMELIB_DEV_SECRET_VAULT` |
| Build artifacts | `images-cache/` folder under `<appFolder>`; the SEA sidecar bundle (`pnpm build:sidecar-sea`) | `images-cache/` is never created under Tauri; the sidecar bundle shrinks (rebuild before live-testing, per the memory note that `tauri dev` does not rebuild the sidecar) |

Also stale-reference sweep (not state, but breaks CI if missed): census and source-shape tests that name the deleted modules: `src/backend/sidecar/__tests__/enrichmentFlows.test.ts`, `storeLayer.test.ts`, `bootSourceShape.test.ts`, `shortcutsFlows.test.ts`, `gameDetailsFlows.test.ts`, `src/backend/__tests__/diPhaseGates.test.ts`, `storeKinds.test.ts`, `appRuntime.test.ts`, `cache.test.ts`, `tauriShellSource.test.ts`, `src/backend/stores/__tests__/createStores.test.ts` and `fixtures/registeredStores.json`, `src/backend/testUtils/testServices.ts`, `src/backend/services/types.ts`, plus the `meta/backendDiCeilings` baselines (`jestMock`, `childProcess` ratchets drop when files are deleted) and the electron-reach ledger (`BASELINE_ELECTRON_REACHING_MODULES` names `discounts/fetchDiscounts`). Grep every deleted path across `src/` and `meta/` before deleting.

## Common Pitfalls

### Pitfall 1: Building on a StoreHost that is not built yet
**What goes wrong:** 86 plans reference `StoreHost::open_cache`, `apply`, `get`, `on_change`, `Origin`, the ownership flags and the boot hand-off, but Phase 85 is at plan 7 of 25 (`STATE.md`: "Completed 85-07-PLAN.md").
**Why it happens:** the research is written against `85-PATTERNS.md` and the 85-09 plan text, which describe the target API [CITED: `85-09-PLAN.md` must_haves and Task 1/2 text; `gamelib-store/src/lib.rs` shows modules `atomic, backup, dotpath, engine, envelope, json, migrate, ops, table` only, no `host`].
**How to avoid:** make plan 1 of 86 a "re-read the shipped 85 host API" checkpoint, and sequence 86 execution after 85-19/20 (the signed 85 baseline D-15 needs). Do not write Rust against `gamelib_core::store::StoreHost` (it moves).
**Warning signs:** `cargo check` failing on `gamelib_store::host`.

### Pitfall 2: axios query encoding is not reqwest's
**What goes wrong:** recorded TS requests carry `?dimensions=460x215,920x430&q=a+b:c$%5B%5D'!()*~`; `reqwest`'s `.query()` would send `%2C`, `%3A`, `%27` and so on, and a literal-string comparison fails.
**Why it happens:** axios keeps `, : $ ' ! ( ) * ~` literal, encodes a space as `+`, but encodes `[ ]` as `%5B%5D` [VERIFIED: `axios.getUri` run this session, axios 1.20.0]. `serde_urlencoded` (behind reqwest's `query`) does not.
**How to avoid:** build the query string yourself with a small `axios_encode` function proved against the recorded goldens, and compare **decoded pairs** in `Replay` so the pin survives either encoding. The wiki sources build raw URL strings with `%20` replaced by hand (`pcgamingwiki/utils.ts` `title.replaceAll(' ', '%20')`) and are parsed by `new URL`; use `url::Url::parse` on the identical string.
**Warning signs:** a golden that passes locally but a live request that 400s.

### Pitfall 3: Compressed responses and the HowLongToBeat `Accept-Encoding`
**What goes wrong:** the TS sends `'Accept-Encoding': 'gzip, deflate, br'` explicitly for HLTB (`howlongtobeat/utils.ts` `BROWSER_HEADERS`). With the shell's reqwest (`default-features = false`, no `gzip`, `brotli` or `deflate`), a compressed body is returned raw and the `__NEXT_DATA__` regex fails.
**How to avoid:** either do not send `Accept-Encoding` from Rust (it is excluded from the pin) or enable the three decompression features and re-pin `EXPECTED_LOCKFILE_CRATE_NAMES`. Also note `http2`, `system-proxy` and `charset` are off in the shell build [VERIFIED: `reqwest-0.13.4/Cargo.toml` `default = [default-tls, charset, http2, system-proxy]`], so axios's honouring of `HTTP(S)_PROXY` env is not reproduced, and non-UTF-8 pages are decoded as UTF-8 only. Record as quirks.
**Warning signs:** HLTB returns data in TS but `null` in Rust against the live site.

### Pitfall 4: JS regex semantics vs the `regex` crate
**What goes wrong:** the wikitext and HLTB patterns (`/steam appid {2}= ([0-9]+)/m`, `/direct3d versions {6}= (.+)/m`, `/game\/row\/taxonomy\/genres\s*\|\s*(.*?)\s*}}/`) behave differently on edge input. JS `.` excludes LF, CR, U+2028 and U+2029; Rust `.` excludes only `\n`. JS `\s` includes U+FEFF; Rust's does not. JS `m` flag makes `^`/`$` line anchors; Rust needs `(?m)`.
**How to avoid:** write each pattern with `[^\n\r\u{2028}\u{2029}]` in place of `.` and an explicit `[\s\u{FEFF}]` where `\s` is used, copy the patterns into one `regexes.rs`, and add a vector test per pattern with `\r\n` and BOM inputs. The 83 research SUMMARY already lists "regex golden-tested" as a requirement.
**Warning signs:** a golden over real wikitext passes but a `\r\n` input differs.

### Pitfall 5: `CacheStore` semantics hide in `cache.ts`, not in `StoreHost`
**What goes wrong:** treating a cache store as a plain key-value map loses TTL expiry, the `invalidateCheck` asymmetry, and the `__timestamp.<key>` nested write. `umu` is the sharp case: `invalidateCheck: (data) => !data` means an expired entry is only evicted if its value is falsy, and `getUmuId` does `if (cachedValue) return cachedValue`, so a cached `null` (a confirmed miss) is re-fetched every time (a quirk to pin and todo, D-03).
**How to avoid:** one `CacheView` module (Pattern 2) with unit tests ported from `src/backend/__tests__/cache.test.ts`, and goldens that include a dotted title (`S.T.A.L.K.E.R.`-shaped) so dot-prop nesting is pinned.
**Warning signs:** a renderer read of `wikigameinfo` returns the fallback because `__timestamp.<key>` is missing (the renderer's mirror reads **both** keys, `cache.ts` comment on `set`).

### Pitfall 6: `localeCompare` and `Intl` in the ITAD mapper
**What goes wrong:** `mapDeals` sorts `Number(a.price) - Number(b.price) || a.storeName.localeCompare(b.storeName)`; ICU collation differs from Rust `str::cmp`. `priceString` uses `Intl.NumberFormat` only when `ITAD_PRICE_AMOUNT_SOURCE !== 'amount'`; it is `'amount'` today [VERIFIED: `itadCoverage.ts:73`], so `String(price.amount)` applies, which prints JS number text (`4.5` not `4.50`).
**How to avoid:** use `gamelib_store::json::js_number_text` for number-to-string; prove the comparator on every recorded multi-store fixture and add a vector for mixed case and accents; if the fixtures cannot decide, file the divergence as a todo rather than pulling in ICU.
**Warning signs:** deal order differs between two stores with equal price.

### Pitfall 7: Concurrent read-modify-write of one list
**What goes wrong:** `addRecentGame` and `removeRecentGame` read `games.recent`, filter, `unshift`, then write the whole list. Two overlapping calls (a launch and a tray removal) lose one update if Rust interleaves them; TS was effectively serialised by the single event loop.
**How to avoid:** a per-service `Mutex` around the RMW (or a `StoreHost` compare-and-set if 85 ships one); same for `setGameOverrides`. Entry shape and key order must stay `appName, title, runner` (`recent_games.ts` `updatedList.unshift({appName, title, runner})`) and the filter `a.appName && a.appName !== game.app_name` drops entries with a falsy `appName`.
**Warning signs:** a test with two concurrent adds ends with one entry.

### Pitfall 8: The shell reads `config.json` itself for the tray seed
**What goes wrong:** `src-tauri/src/tray/recent.rs:431` `load_recent_games_from_disk` reads `<appFolder>/store/config.json` directly at boot (seed called from `main.rs:1815`). Once `StoreHost` owns that file, a raw read can precede the host's open/migration.
**How to avoid:** read through `StoreHost` after `open_all`, or order the seed after it; the live relay in `sidecar.rs:480-513` is deleted (D-08) and the `RECENT_GAMES_CHANGED_CHANNEL` special case and its tests go with it; update `tauriShellSource.test.ts`, which names `recent_games`.
**Warning signs:** an empty tray list on first launch after upgrade.

### Pitfall 9: A `rustInvoke` shim is async, three callers are sync
**What goes wrong:** D-05 says "same signature, callers don't change." `getGameOverrides`, `getAllGameOverrides`, `attachOverrides` and `setGameOverrides` are synchronous, and `gamedetails/dispatch.ts:113` and `gamedetails/overrides.ts:93-94` use them synchronously (`setGameOverrides(...)` then `notifyChanged(getAllGameOverrides(deps))`). A shim must return a `Promise`.
**How to avoid:** make these four shims `async` and add `await` at the two call sites (a deliberate, tiny signature ripple recorded in the schedule test). Also the shim needs the typed Rust client: callers' `deps` types must gain a `rustInfo` (or `RustInvokeDeps`) slice (`launcher.ts`, `launchDispatch.ts`, `sideload/games.ts`, gog/nile/legendary `games.ts`, `nonesteamgame.ts`).
**Warning signs:** `tsc` errors at `gamedetails/*`.

### Pitfall 10: Secrets in fixtures and logs
**What goes wrong:** the ITAD `key` is a query parameter, so it appears in the recorded URL and in `reqwest::Error`'s `Display`; SteamGridDB sends `Authorization: Bearer`. The TS never logs them (`itad.ts` `logFailure` logs `{endpoint, status}` only).
**How to avoid:** redact in the recorder, add the redaction test, call `.without_url()` on every reqwest error before it is mapped, and keep the error mapping to a fixed `[storeSearch:<code>]` marker (`STORE_SEARCH_ERROR_MARKER`, rethrown so the renderer sees the same string).
**Warning signs:** `key=` in any file under `tests/fixtures`.

### Pitfall 11: Live-service behaviour the offline goldens cannot see
**What goes wrong:** Cloudflare-fronted sites (HowLongToBeat, AppleGamingWiki, PCGamingWiki) already 403 on the wrong `User-Agent` in the TS history. A rustls client differs from Node's OpenSSL in TLS fingerprint, which a recorded replay cannot detect.
**How to avoid:** the D-12 opt-in drift command and the D-14 live gate item 1 are the only proof; run the drift command for a handful of titles during development, not only at the gate. Treat a Rust-only 403 as a phase-blocking finding.

## Code Examples

### Replay `Http` with a pinned request check
```rust
// Source: design for D-09/D-10; trait shape follows gamelib-steampoll's Clock/ProcessRunner injection
#[async_trait::async_trait]   // or a boxed-future fn; avoid a new crate if the codebase already boxes futures
pub trait Http: Send + Sync {
    async fn send(&self, req: Request) -> Result<Response, HttpError>;
}
// Replay: look up the recorded request for `case`, assert pinned fields equal, return the recorded response.
```

### Native channel entry (spec in `nativeChannels.json`, handler in `native_router.rs`)
```json
// Source: src/common/types/ipc/nativeChannels.json (shape read this session: kind, slice, args[{name,type,strict,maxLength}], returns, valid[], invalid[])
"removeRecent": { "kind": "invoke", "slice": "info",
  "args": [{ "name": "appName", "type": "string", "maxLength": 1024 }],
  "returns": "void", "valid": [["abc"]], "invalid": [[], [1], ["a","b"]] }
```

### Emitting `recentGamesChanged` and updating the tray (D-08)
```rust
// Source: FrontendEmitter::emit(&self, channel: &str, args: Vec<Value>) (native_router.rs test emitter, read this session)
fn changed(&self, list: &[RecentGame]) {
    self.emitter.emit("recentGamesChanged", vec![serde_json::to_value(list).unwrap_or_default()]);
    let games = tray_recent_games_from_value(&list_value, tray_settings().max_recent_games);
    let _ = self.app.run_on_main_thread(move || update_tray_recent_games(&app, games));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sidecar relays `recentGamesChanged` and the shell sniffs the frame for the tray (`sidecar.rs:485`) | Rust owner emits and updates the tray directly (D-08) | this phase | Delete the sniff and its tests |
| Per-store TS `CacheStore` over conf | Rust `StoreHost` plus `CacheView` | 85 (host), 86 (leaf views) | TTL logic must be re-expressed in Rust |
| axios everywhere for HTTP | reqwest 0.13, no default features | 79 onward | Header, compression, proxy and query differences (Pitfalls 2, 3) |

**Deprecated/outdated:**
- `src/backend/images_cache.ts`: its `imagecache://` protocol registration was Electron-only and "is gone"; the module is knip-baselined and unreferenced [VERIFIED: `images_cache.ts:27-28` comment and grep for callers].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Phase 85 host API (`StoreHost::open_cache`, `apply`, `get`, `on_change`, `Origin`, `open_all`, ownership flags) ships as 85-09 specifies | Pitfall 1, Standard Stack | 86 plans need rework; mitigated by a plan-1 re-read checkpoint |
| A2 | `anticheatFiles.shaMac/shaLinux` in the releases JSON are MD5 hex digests (the code compares them to `createMD5` output) | Standard Stack (`md-5`) | Wrong hash crate; one fixture check settles it |
| A3 | `getGameMetadataOverride`/`getAllGameOverrides` can be native read channels with no TS-only input | Per-slice inventory | If `attachOverrides` or the 88 `gamedetails` work needs sync reads, the shim ripple widens |
| A4 | Override image deletion (`unlink` of `<appName>-*` in a GameLib-owned dir) is exempt from the `gamelib-safety` destructive-path rule, which targets user install trees | Security Domain | If the user wants it through `safety_remove_tree`, one more dependency and tri-state plumbing |
| A5 | The shell can supply `publicDir` (Tauri `resource_dir()`) to `gamelib-info` for the bundled `crossover-index.json.gz` | Per-slice inventory | The bundled-snapshot fallback silently never loads in Rust |
| A6 | Deleting these TS modules lowers, never raises, the `backendDiCeilings` `jestMock`/`childProcess` ratchets, so only baseline regeneration is needed | Runtime State Inventory | A ratchet increase needs a justified exception |
| A7 | HLTB, AppleGamingWiki and PCGamingWiki accept a rustls client with the same headers the TS sends | Pitfall 11 | A live 403 the offline goldens cannot catch |

## Open Questions

1. **`images_cache` is dead under Tauri: port it or delete it?**
   - What we know: `imageCacheSchemeAvailable()` returns a hard-coded `false` (`preload/tauriTransport.ts`), `CachedImage` therefore never uses `imagecache://`, `initImagesCache()` and `getImageFromCache()` have no callers (only `appRuntime.ts:62` constructs the object), and `images_cache.ts:27-28` says the registration is gone and the module is knip-baselined. The `images-cache` folder is never created, so SC2's "no data change" is vacuous for it, and D-14 item 3's "cached images load" cannot be exercised.
   - What's unclear: whether the user wants a Tauri `imagecache://` handler (new capability) or just the cleanup.
   - Recommendation: delete the TS (and the `imageFetches` slot in `appRuntime`) in 86, do not port, record the decision in the 86 context as an amendment, and reword D-14 item 3 to SteamGridDB artwork only.

2. **How does Rust wiki get the GOG-only inputs?**
   - What we know: the HLTB GOG branch needs `game.getExtraInfo().storeUrl`, which in TS is three GOG API calls (`createReqsArray`, `getProductApi`, `getGamesData`) plus a hostname rewrite to `af.gog.com` with `as=1838482841`; the GamesDB source calls `libraryManagers.gog.getGamesdbData(storeName, appName, true)`, an unauthenticated GET that also writes GOG's `gog_api_info` cache. `getWikiGameInfo`'s renderer `title` arg is ignored by TS (the title comes off the resolved `Game`), but the renderer passes `gameInfo.title` from the same library state.
   - Recommendation (A4): Rust implements the two unauthenticated GETs itself (`https://api.gog.com/v2/games/<id>?locale=en-US` for the store link, `https://gamesdb.gog.com/platforms/<store>/external_releases/<id>` for the steam id), uses the renderer's `title`, and does not write GOG's cache (record both as quirk todos). The recorded requests then differ from the TS in the extra GOG calls the TS makes; the pin comparison must tolerate a documented "TS-only requests" list. The fallback (A2) is a two-phase op where TS resolves context only on a Rust "needs context" reply. Ask the user.

3. **Resolver registrations vs SC4.**
   - What we know: `getCrossoverIndex` must enumerate `Object.values(libraryManagers).getListOfGames()`; `getGogDiscounts(hideOwned|wishlistOnly)` needs `GOGUser.getCredentials`, which spawns `gogdl auth`. Both must keep a sidecar registration that gathers TS-only inputs and makes one typed Rust call, until Phases 89-92. SC4 says registrations are deleted.
   - Recommendation: amend D-06 to allow two shapes, "shim" (pure forward) and "resolver" (collect named TS-only inputs, one typed Rust call, nothing else), each a row in `infoShimSchedule.test.ts` with its deleting phase (89/91/92); have the user confirm this reading of SC4. The no-argument `getGogDiscounts` path (no token) can still run in Rust.

4. **How does Rust read the two API keys, and what about dev builds?**
   - What we know: the keys sit in keyring slots with an allowlist in `keyring_dispatch.rs`; the TS owners add a session `rejected` flag (ITAD), whitespace-trim-and-clear on set, a read cache, a dev-only plaintext vault (`GAMELIB_DEV_SECRET_VAULT === '1'`, refused in packaged builds) that is shared with the Steam and Humble slots, and a one-time `GlobalConfig.steamGridDbApiKey` plaintext migration with a keyring read-back proof.
   - Recommendation: a `SecretSource` trait implemented in the shell over the existing keyring functions, plus a Rust port of the vault read/write for the two slots (same file, same slot names, same refuse-when-packaged rule) so `pnpm tauri:dev` keeps its no-Keychain-prompt property, plus a ported migration. Confirm with the user that the dev-vault port is in scope.

5. **The baked ITAD key is a sidecar build-time define today.**
   - What we know: `meta/esbuildWorkerBundleShared.ts:85` bakes `ITAD_API_KEY` into the sidecar bundle; the release workflow passes it only to the `build:sidecar-sea` step (`release-tauri.yml:346-348`) and the secret presence check runs at line 337.
   - Recommendation: the shell crate (not `gamelib-info`) reads `option_env!("ITAD_API_KEY")` with a `build.rs` `rerun-if-env-changed`, and passes it in `InfoCtx`; add `ITAD_API_KEY` to the tauri build step's env in `release-tauri.yml`; keep `GAMELIB_ITAD_API_KEY` as the runtime override. Without this the signed live gate shows "not set up in this build".

6. **86's slice list vs the 82 ownership table.** Rows `macArchStore` and `runsForMeStore` say "TS mirror deleted: 86" in `82-STATE-OWNERSHIP.md`, but D-01 defers those leaves. The D-04 amendment should also move these two cells to their owning phases (89 for macArch; the runsForMe owner), otherwise the schedule test (D-06) and the table contradict each other.

7. **Which ops does the anticheat online hook call?**
   - Today `downloadAntiCheatData` checks the local MD5 first and only then waits for online. To keep that order, expose two Rust ops (`anticheat_status` returns whether a download is needed, then TS runs `runOnceWhenOnline(() => anticheat_download)`), rather than registering an online callback on every `releasesInfoReady`. Recommendation: two ops.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| cargo / rustc | all Rust work | yes | cargo 1.99.1 | — |
| Node | TS oracle, jest | yes | v22.23.4 | — |
| pnpm | `pnpm codecheck`, `pnpm lint` | yes | 10.28.0 | — |
| Live internet + real ITAD and SteamGridDB keys | one-time oracle recording (D-09) | not probed (operator step) | — | Operator records once, commits redacted fixtures; CI never needs it |
| Signed Phase 85 and Phase 86 builds | D-15 upgrade gate | depends on 85-19/20 | — | None: a dev build does not count for item 4 |
| macOS operator machine | D-14 live gate | operator | — | Windows/Linux covered by CI only (D-16) |

**Missing dependencies with no fallback:** the signed Phase 85 baseline (blocks the D-15 gate until Phase 85 completes).
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test` (workspace, rust-version 1.77.2); TS: jest 29.7 (projects `Backend`, `Common`, `Frontend`, `Preload`, `Meta`) |
| Config file | `src-tauri/Cargo.toml`, `jest.config.js`, `src/backend/jest.config.js` |
| Quick run command | `cd src-tauri && cargo test -p gamelib-info <module>` ; `npx jest src/backend/__tests__/<slice>PortComplete.test.ts` |
| Full suite command | `cd src-tauri && cargo test -p gamelib-info -p gamelib-info-cli -p gamelib-store && cargo test --bin gamelib-shell` ; `pnpm codecheck && pnpm lint && pnpm test:ci && pnpm check:ipc-contract && pnpm planning-gates` |

### Phase Requirements -> Test Map

| Req / SC | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|--------------|
| SVC-01 / SC1 | Wiki, CrossOver, ITAD, discounts, anticheat results equal TS goldens on recorded responses | golden replay | `cargo test -p gamelib-info --test golden_wiki` (and `_crossover`, `_itad`, `_discounts`, `_anticheat`, `_steamgrid`) | Wave 0 |
| SVC-01 / SC1 | Rust sends the same method, URL, decoded query, body and pinned headers as the TS | request pin | `cargo test -p gamelib-info --test requests_<slice>` (the `Replay` assertion) | Wave 0 |
| SVC-01 / SC2 | Recent games, overrides and the five cache stores round-trip the existing bytes; a write after a read of real-shape files equals the TS golden | file round-trip | `cargo test -p gamelib-info --test roundtrip_<slice>` over `tests/fixtures/state/` (v0.10-shaped files, tab + `__internal__` envelope) | Wave 0 |
| SVC-01 / SC2 | `CacheView` TTL, `invalidateCheck`, dotted keys, UTC `Date()` write and JS-form read | unit | `cargo test -p gamelib-info cache_view::` | Wave 0 |
| SVC-01 / SC3 | Zero-test slices have a TS golden harness committed before Rust | oracle | `GAMELIB_WRITE_INFO_GOLDEN=1 npx jest src/backend/info/__tests__/infoOracle.test.ts` (write), without the flag (verify) | Wave 0 |
| SVC-01 / SC3 | Goldens cannot pass vacuously | guard | `MANIFEST.json` count and floor test, `assertAtOrAboveFloor`, an empty-input test that must fail | Wave 0 |
| SVC-01 / SC4 | Each slice's TS, registrations, zod entries and stores are gone; shims/resolvers contain only the typed call | delete gate | `npx jest src/backend/__tests__/infoPortComplete.test.ts` (one `describe` per slice) and `infoShimSchedule.test.ts` | Wave 0 |
| SVC-01 / SC4 | Native channel args validated, one owner per channel, IPC snapshot regenerated | contract | `pnpm check:ipc-contract`, `npx jest src/backend/__tests__/nativeSeamPortComplete.test.ts`, per-channel negative tests from `nativeChannels.json` | exists; extend |
| D-08 | `recentGamesChanged` emitted by Rust, tray updated, sidecar sniff removed | unit + source gate | `cargo test --bin gamelib-shell tray::`, `npx jest src/backend/__tests__/tauriShellSource.test.ts` | exists; update |
| D-17/D-19 | No Keychain access from a `-cli`; keys never in fixtures or logs | secrets | `cargo tree -p gamelib-info \| grep -c keyring` == 0; redaction test over `tests/fixtures` | Wave 0 |
| D-12 | Live drift check on demand | manual/opt-in | `cargo run -p gamelib-info-cli -- drift` (or `cargo test -p gamelib-info -- --ignored`) | Wave 0 |
| D-14/D-15 | Live macOS gate on signed builds | manual-only | `86-HUMAN-UAT.md` four items, authored before coding; justified manual because Keychain prompts and signing cannot run in CI | Wave 0 |

### Sampling Rate
- **Per task commit:** `cargo test -p gamelib-info <touched module>` plus the scoped jest file; `cargo clippy -p gamelib-info --all-targets -- -D warnings`; `cargo fmt -p gamelib-info --check`; for TS files, `npx prettier --check <exact paths>` after `npx prettier --file-info` (per the conventions row, never `.`).
- **Per wave merge:** the full Rust command plus `pnpm codecheck && pnpm check:ipc-contract`.
- **Phase gate:** full suite green on the three-OS CI matrix, the signed-build live gate recorded, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src-tauri/crates/gamelib-info{,-cli}` scaffold plus the CI/Cargo/README/`cargoFeatures` registration checklist
- [ ] `src/backend/info/__tests__/infoOracle.test.ts` and the recorder (sets `axios.defaults.adapter` before importing slice modules; redaction)
- [ ] Recorded fixtures per network slice (operator run with live keys), then TS goldens; TS golden harnesses for `anticheat`, `recent_games`, `game_overrides` (D-11); `images_cache` harness only if Open Question 1 keeps it
- [ ] State fixtures: v0.10-shaped store files for the five caches, `game-overrides.json`, and a `config.json` with a populated `games.recent`, taken from the 85 corpus harvest where possible
- [ ] `86-HUMAN-UAT.md` (four D-14 items, `### N.` headings at column 0, inline `expected:`, `result:` starting with a status word, per the UAT-shape convention)
- [ ] `infoPortComplete.test.ts`, `infoShimSchedule.test.ts`
- [ ] A `runnerCapabilities.json` (or equivalent) shared by TS and Rust with a drift test, for `appNameIsSteamAppId`, `hasStoreCatalog`, `storeMap`, umu store map

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no sign-in here; the GOG bearer token is passed in, never stored) | — |
| V3 Session Management | no | — |
| V4 Access Control | partly | Renderer args validated in Rust before use (D-17); the keyring slot is a compile-time allowlist |
| V5 Input Validation | yes | `serde(deny_unknown_fields)` structs; the TS bounds carry over (`getStoreSearchDeals` id regex `^[0-9a-fA-F-]{1,64}$`, `getItadSteamGids` digits-only `\d{1,10}` max 5000, key length 256, string max 1024) [VERIFIED: `enrichment.ts:62-80`] |
| V6 Cryptography | yes | No hand-rolled crypto: `sha2` for the cache key, `md-5` only as a change check (not a security control) |
| V8 Data Protection | yes | API keys never logged, never in fixtures or error strings; `.without_url()` on reqwest errors |
| V9 Communications | yes | HTTPS only (`assertHttps` for the index; ITAD `buyUrl` must be `https:` and is passed through byte for byte); timeouts (10-15 s as in TS) |
| V12 Files | yes | Override-image deletion only inside the fixed `game_overrides_images` dir, entry names from `read_dir` never joined from renderer text, no symlink follow (assumption A4) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leaked via URL in a log or error | Information disclosure | `.without_url()`, fixed error markers, redaction test over fixtures |
| Poisoned remote index drives a user-facing claim | Tampering | Port the schema bounds exactly (`version == 1`, `rating` 1..=5, `entries >= 1000`, 5 MB cap) and keep-last-good (`crossover_index/schema.ts` header, "do not loosen") |
| Oversized or malicious response body | Denial of service | Body caps in `ReqwestHttp` (the TS has none for the wiki sources; adding a generous cap is a safe, documented deviation) |
| Path traversal via `appName` | Tampering | Prefix match against `read_dir` names only |
| Renderer-controlled key store write | Elevation | `itad.setApiKey`/`steamgriddb.setApiKey` reject non-strings and trim; empty value clears (WR-01/WR-02 behaviour copied) |
| Plaintext key in dev vault | Information disclosure | Dev vault stays gated on `GAMELIB_DEV_SECRET_VAULT === '1'` and refused in packaged builds |

## Project Constraints (from CLAUDE.md)

- **Tech stack:** React + TypeScript on Rust/Tauri; GameLib is independent of Heroic, so do not raise upstream mergeability as a concern.
- **Conventions (load `Skill("gamelib-conventions")`, which was loaded for this research):**
  - New `.planning/todos/pending/*.md` files (every D-03 quirk todo) carry `severity:`, `platform:`, `ready:` bare, lowercase, in that order; `pnpm planning-gates` enforces it. The `/gsd-add-todo` template omits them.
  - Any Rust spawn goes through `gamelib-proc`; none is needed here. In-flight work holds a `gamelib_core::shutdown::global()` Registrant for exactly its lifetime and watches `token()`; exit work fits `ExitBudget::DEFAULT` (5 s, drains 3.5 s); bound boot work. Never `PR_SET_PDEATHSIG`, never a hand-rolled kill.
  - Fake-HOME isolation for any spawned child in `src/` or `meta/` (`createFakeHomeProfile()`); the oracle harness spawns none. A `-cli` never touches the real Keychain (D-19).
  - Every task `<verify>` that writes a prettier-visible file runs `npx prettier --check` over the exact paths; check `--file-info` first. `.planning/**`, `public/locales/**`, `.claude`, `graphify-out` are ignored (omit the check and say so). Rust files use `cargo fmt --check`.
  - UAT item shape for `86-HUMAN-UAT.md`.
- **GSD workflow:** work enters through a GSD command. Memory notes that matter: use `/gsd-execute-phase` (hyphen); `gsd-tools commit` with a path commits **all** dirty `.planning` unless `--files` is used; `tauri dev` does not rebuild the sidecar (rebuild `pnpm build:sidecar` before live-testing); the dev launch is `pnpm tauri:dev`, never `tauri:dev:run`; offline UAT turns the network off only for the action.
- **Graph tools:** `graphify query` for code, `gsd-graph` for planning; never read `GRAPH_REPORT.md` or `graph.json`.

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `86-CONTEXT.md`, `85-PATTERNS.md`, `85-09-PLAN.md`, `85-12-PLAN.md`, `82-STATE-OWNERSHIP.md`, `83-CONTEXT.md`, `src-tauri/crates/README.md`, `gamelib-store/src/{lib,json,ops}.rs`, `native_router.rs`, `rust_dispatch.rs`, `steamcm_dispatch.rs`, `sidecar.rs:470-520`, `src/backend/{cache,images_cache,appRuntime}.ts`, every file under `wiki_game_info/`, `crossover_index/`, `storeSearch/`, `discounts/`, `anticheat/`, `recent_games/`, `game_overrides/`, `steamgrid/`, `sidecar/{enrichmentFlowRegistration,steamgridSecretStore,itadSecretStore,devSecretVault}.ts`, `loggerPortComplete.test.ts`, `censusFloor.ts`, `nativeChannels.json` (head), `release-tauri.yml:325-350`, `rust-test.yml:100-150`.
- Executed this session: `axios.getUri` encoding check (axios 1.20.0); `axios.defaults.adapter` capture check; JS `Date()` parse check; reqwest 0.13.4 feature list and `without_url`/`query` in `~/.cargo/registry/src/*/reqwest-0.13.4/`; `Cargo.lock` version lookups; `gsd-tools query package-legitimacy check`.

### Secondary (MEDIUM confidence)
- The 85 host API as described by 85-09/85-12 plan text (not yet built).

### Tertiary (LOW confidence)
- None used. No web search was needed: the live-service behaviours are recorded by the oracle, not researched here.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Every crate and version read from the lockfile; one new crate checked.
- Architecture: MEDIUM. The pattern follows 63-85 precedent, but the GOG/resolver/`images_cache` findings need decisions and the 85 host is unbuilt.
- Pitfalls: HIGH for the JS-parity items verified by running Node (query encoding, `Date()` parse, adapter capture) and reading reqwest; MEDIUM for the live-service ones (11).

**Research date:** 2026-11-22
**Valid until:** 2026-12-06 (14 days: Phase 85 is moving, and the host API, `storeOwnership.json` and the config flip may change under it)
