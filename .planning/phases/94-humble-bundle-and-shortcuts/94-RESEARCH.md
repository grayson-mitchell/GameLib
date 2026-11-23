# Phase 94: Humble Bundle and shortcuts - Research

**Researched:** 2026-11-24
**Domain:** Port of the Humble key stack (`src/backend/humble/`, ~6.2k lines) and the desktop-shortcut stack (`src/backend/shortcuts/`, ~1.9k lines) from the Node sidecar to Rust, in a worktree, parallel to Phase 87.
**Confidence:** MEDIUM-HIGH (code facts HIGH; three cross-boundary seams and one network-fingerprint risk are MEDIUM and listed as Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Timing and worktree
- **D-01:** **94 runs now, in parallel with Phase 87, in its own git worktree** (user direction, 2026-11-24). It uses the Lane C dependency (needs only Phase 86). It therefore lands **before 88–93**, so every TS caller of Humble or shortcuts that those phases have not yet ported still exists and must be shimmed (D-03).
- **D-02:** **The worktree rebases onto main before each wave** and resolves shared-file conflicts as they appear, then merges to main when 94 verifies. Expected conflict surface with 87: `src-tauri/src/rust_dispatch.rs`, `src-tauri/src/ipc_contract.rs`, the IPC snapshot, `src/backend/sidecar/handlers.ts`, `sidecarRpc.ts`, `channelSchemas.ts`, the shim schedule test (`src/backend/__tests__/engineWineShimSchedule.test.ts` / its 86 twin), `Cargo.toml` workspace members. Plans should keep edits to those files small and append-only where possible. **94's STATE is worktree-local:** its executor writes `.planning/STATE.md` / `state.json` only in the worktree. At merge, keep main's Current Position (87 or later) and fold in only 94's completion row (memory: phase.complete / planned-phase clobber a live executor's STATE). Fresh worktree needs build prep before `pnpm tauri:dev` (memory: `build:sidecar-sea` + `vite build`).

### Callers that outlive the TS
- **D-03:** **`humble/loginWindowSeam.ts` is relocated out of `humble/` unchanged** (e.g. `src/backend/login/loginWindowSeam.ts`) and becomes a scheduled survivor, deleted by Phase 92, because `oauthLoginCapture.ts` and the GOG/Epic/Amazon `user.ts` sign-in flows still drive it. Humble's own login poll/deadline loop (`watchForLogin`, `COOKIE_POLL_INTERVAL_MS`, `LOGIN_WATCH_TIMEOUT_MS`) moves to Rust. OAuth sign-in is not touched in 94. Amend `82-STATE-OWNERSHIP.md`'s `humble-services` row (it lists "login-window seam slot") with the reason. — **Reversibility:** reversible — a file move.
- **D-04:** **Remaining TS callers use same-signature `rustInvoke` shims or resolvers** (86 D-05, D-06, D-24; 87 D-15, D-23): `signInProbe/pass.ts` (`humbleUser.isLoggedIn`/`probeSession`), and the shortcuts callers in `storeManagers/{steam,gog,legendary,nile,sideload}/games.ts` and `sideload/library.ts`. Research must produce the complete list. Each shim is a row in the shim schedule test with the phase that deletes it (88–92 per owner).

### Humble parity oracle
- **D-05:** **Goldens come from the existing synthetic fixtures plus one real capture.** A TS harness (isolated with `createFakeHomeProfile()`) drives `__tests__/fixtures/tpks.ts` / `steamGames.ts` through sync, classify, dedup, Steam cross-reference, reveal, mark/undo redeemed, overrides and expiry alerts and emits golden JSON, committed before any Rust for that sub-slice. **Plus one recorded sync of the operator's real Humble account** (order list and a handful of orders), redacted of key values, gamekeys, email, account name, cookies and CSRF tokens, to pin real response shapes and the request URLs, methods and headers (86 D-10 request pinning). Goldens carry the Phase 82 D-05 vacuous-pass guards. — **Reversibility:** reversible.
- **D-06:** **Pure-logic suites port as Rust unit tests; stateful flows are covered by golden replay.** Port classify, dedup, expirationAlerts, viewFilters, urgencyBadge, keyTypePresentation, expirationDisplay, userAgent, validation and steamAppIdResolver as Rust tests. Cover the library/user flows (`library.test.ts`, `user.test.ts`, `probeSession`, `stores`, `library.realstore`) by golden replay. Source-text gate tests are deleted, not ported.
- **D-07:** **Non-refetchable Humble state round-trips byte for byte.** A golden loads today's files (`humble_library`, `humble_revealed`, `humble_ownership_override`, `humble_gifted_at`, `humble_audit`, `humble_local_redeemed`, `humble_notified_expiration`, `humble_settle_declined`, `humble_steam_appid`, `humble_sync`, `humbleConfigStore`), including a legacy pre-backfill file for the `expirationAlerts` one-time backfill, runs a no-op sync in Rust and must write back identical bytes. A corrupt file is copied aside, never reset (FND-06, 85 D-05). — **Reversibility:** one-way — a Rust writer that rewrote these files differently on a user's machine cannot be undone, and the state cannot be refetched from Humble.

### Live gate (macOS, authored before coding)
- **D-08:** **Reveal is proven live on one throwaway key.** The operator picks one unrevealed key they don't care about. The gate reveals it, sees the value, marks it redeemed, then undoes the mark. The C2 owned-elsewhere block and the ineligible refusal are pinned by goldens. Steam redeem is not exercised (Phase 90). Before the gate, the operator names the key in the gate file.
- **D-09:** **Gate items** (offline-UAT shape where relevant: network off only for the action):
  1. **Humble account:** after the upgrade the Keys screen is signed in with no Keychain prompt for `humble-session`/`humble-csrf`; Sync completes; expiry badges and Steam-owned markers show as before; reconnect and disconnect work (disconnect keeps user-state files, D-07).
  2. **Reveal/claim:** D-08 on the throwaway key.
  3. **Desktop + Applications `.app`:** create both for one game, the icon shows, double-click launches it through `gamelib://`, then remove both.
  4. **Add to Steam:** add a game as a non-Steam shortcut, it appears in Mac Steam after a restart, then remove it. shortcuts.vdf is written atomically.
  5. **Iconless fallback:** a game with no artwork still gets a `.app`, without the `CFBundleIconFile` key.
- **D-10:** **The gate build is a signed 94 build installed over a signed build of the main commit the worktree branched from**, with Humble signed in on the base build. This proves SC1/FND-07 (no new Keychain prompt). A dev build does not count for item 1.
- **D-11:** **Windows and Linux are covered by CI only** (86 D-16): golden replay on the three-OS matrix, including the `.lnk` writer argv/stdin and the `.desktop` file. Their live check rides with Phase 99.

### Shortcuts output
- **D-12:** **The Windows `.lnk` writer stays PowerShell.** The same fixed-argv `powershell.exe -Command -` with the C# helper on stdin and the same timeout, spawned through `gamelib-proc` as `SpawnClass::Helper`; `reg.exe` for the redirected Desktop folder likewise. The golden pins argv and stdin. The `windowsShortcutIcon` source chain (store exe → bounded install scan → shell exe; only `.exe/.ico/.dll`) ports as-is.
- **D-13:** **macOS icns parity is "valid icns, same geometry".** The golden checks a decodable `ic11` 512×512 icon (resize to 512 width, crop 0,0,512,512) and the Info.plist with or without `CFBundleIconFile`. Pixels may differ from the JS encoder. `@shockpkg/icon-encoder` and the `imageTools` dependency are dropped (STACK.md: `icns` + `image` crates).
- **D-14:** **Text outputs are byte-identical, including hostile names.** `run.sh`, `Info.plist` and the Linux `.desktop` file must match the TS output byte for byte. Goldens include app names and runners containing `;`, `$(...)`, backticks, single and double quotes, `&` and spaces (T-34.5-C6-17 injection fix: double-quoted exe path, single-quoted percent-encoded `gamelib://` URL).

### Carried forward (already decided, not re-asked)
- **D-15:** No `GAMELIB_HUMBLE` / `GAMELIB_SHORTCUTS` flag. Each sub-slice's TS is deleted once its goldens pass (86 D-13, 87 D-06).
- **D-16:** A native channel never falls back to the sidecar. Its Rust serde struct (`deny_unknown_fields`, camelCase) is the schema; the zod entry in `channelSchemas.ts` is deleted with its TS registration; the IPC snapshot is regenerated (83 D-04/D-06/D-07).
- **D-17:** Event names and payloads stay the same (Humble sync state, expiry notices, shortcut outcome toasts), so the renderer is untouched (86 D-08, 90 D-15).
- **D-18:** Secrets stay behind `keyring_dispatch` with slot names `humble-session` and `humble-csrf` unchanged, with the same read caching and invalidate-before-delete on disconnect. The dev vault's Humble slots are ported (86 D-26) so `pnpm tauri:dev` stays prompt-free. A `-cli` never touches the real Keychain (85 D-14).
- **D-19:** Persisted state goes through the Rust StoreHost (`gamelib-store`) with byte-identical writes (85 D-05, D-18).
- **D-20:** Quirks are copied for parity and each is filed as a `.planning/todos/pending/` todo with the three triage keys (86 D-03).
- **D-21:** Rust shutdown contract: PowerShell/reg.exe spawns through `gamelib-proc`; the login cookie poll, the sync, the bounded reveal and the appid resolve pass hold a `gamelib_core::shutdown::global()` Registrant; no unbounded boot work. Load `Skill("gamelib-conventions")` before planning.
- **D-22:** Destructive reads refuse on "unknown" (FND-02): shortcut removal never deletes a path it cannot prove it created.
- **D-23:** v0.11 rules: the live gate is authored before coding, goldens are recorded from TS before porting, and the phase's last plan leaves no TS or registrations for any ported slice beyond the scheduled survivors.

### Claude's Discretion
- Crate layout: research suggested `gamelib-humble` and `gamelib-shortcuts` (with `-cli` where `meta/` needs it), following the per-domain crate pattern of 63–87. Planner may merge or split.
- Whether the Humble HTTP client uses reqwest's `cookies` feature or passes the session cookie explicitly; it must send the same headers as the TS (D-05).
- Plan order inside 94 (Humble vs shortcuts first), chosen to minimise conflicts with 87 (D-02).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Automatic todo matching returned only keyword matches (Windows/Steam/test todos unrelated to Humble or shortcuts); none were folded.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SVC-04 | Humble key sync, claim and redeem work as before | The whole Humble inventory below: HTTP adapter (Next.js server actions, Section "Humble HTTP surface"), classify/dedup/title match, library sync, reveal, mark/undo, overrides, expiry digest, login watch, probe, disconnect, secrets owner, byte-exact state files (D-07), the three cross-boundary seams (sign-in probe, Steam ownership recompute, `timestampStore`), and the live gate. |
| SVC-05 | Shortcuts are created and removed as before | The shortcuts inventory: macOS `.app` writer, Windows `.lnk` through PowerShell, Linux `.desktop`, add/remove to Steam (`shortcuts.vdf` via `gamelib-steamfiles`, grid art, CRC32 ids), the complete caller list, the resolver registrations that survive, `sanitize-filename`, the sips-vs-`image` geometry finding, and the Windows hide-window gap. |
</phase_requirements>

## Summary

Phase 94 is two ports with very different shapes. **Shortcuts** is a stateless filesystem writer with three OS arms; it is small, its text outputs can be pinned byte for byte (D-14), and its only hard parts are (1) it cannot be reached without TS-owned game data (title, art URLs, install path, GOG executable and product-API icon), so the six renderer channels survive as **scheduled resolvers**, (2) the macOS icon path is currently `/usr/bin/sips`, not the JS encoder, and its crop is centred, and (3) removal currently `rm -rf`s a path it never proved it created, which D-22 forbids. **Humble** is a stateful, networked service with a 12.9k-line oracle: a Next.js server-action scraper (RSC "flight" parsing, action-id discovery from public JS chunks), a classifier/dedup stack with JS regex and fuzzy-match semantics, ten non-refetchable store files, a 10-minute login watch over the already-Rust webview, and a Keychain-backed secret pair with a process-lifetime cache and a 120 s failure memo. The proven shape from Phases 86 and 87 (Tauri-free domain crate + `Ctx` + `dispatch` + shell `*_dispatch.rs` + native channels + goldens + scheduled shims/resolvers + `*PortComplete` gate) applies unchanged.

Research found **four premises in CONTEXT.md that do not hold** and that the planner must resolve before writing plans: (a) `expirationDisplay`, `urgencyBadge`, `keyTypePresentation`, `viewFilters` and `loginChromeCss` tests sit under `src/backend/humble/__tests__/` but test **renderer/common modules** (`src/common/humble/*`) that stay TypeScript, so D-06 "port them as Rust tests" is a no-op: the tests move, the code stays; (b) the "hidden-window reveal post already in Rust" (`humble_reveal_post`) has **no production TS caller**: the shipped reveal is a plain Node `fetch` of the `redeemEntitlementAction` server action, so Rust reveal is a reqwest port, with a real Cloudflare TLS-fingerprint risk (A1); (c) the caller list in D-04 is **incomplete**: it also needs `signInProbe/verdict.ts` (reads and writes `humbleConfigStore`), the sign-in epoch/outcome notes (`noteSignInSucceeded('humble')`, `noteSignedOut('humble')`), and `steamFlowRegistration.ts` (`humble.library.recomputeOwnership()` twice), plus `processShortcut`, which is a **quit/hotkey channel misfiled in the shortcuts registration**; (d) the TS-mirror schedule cell `timestampStore: 94` would strand `launcher.ts` (Phase 88 writes it), and `humbleConfigStore: 94` would strand `verdict.ts`.

**Primary recommendation:** Two Tauri-free crates, `gamelib-humble` and `gamelib-shortcuts` (no `-cli` unless a recorder needs one), each with `Ctx` + `dispatch` and a copied `Http` seam; shell files `humble_dispatch.rs` and `shortcuts_dispatch.rs`; Humble renderer channels go **native** (new `humble` slice), shortcut renderer channels stay **scheduled TS resolvers** that make one typed Rust call each; goldens recorded from the TS first (fake-HOME harness + one redacted wire-level real capture); 94 amends the ownership table and mirror schedule for the three cross-boundary cells before any code; the live gate is authored first and run last on a signed-over-signed build.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Humble session HTTP (session-status, library page, action-id scrape, `filterUserLibrary`, `redeemEntitlementAction`) | Rust crate `gamelib-humble` | Shell supplies `Http` (reqwest) | Network + parsing with no TS-only input; secrets arrive through the shell `SecretSource` |
| Humble login watch (cookie poll, candidate validation, csrf capture, 10 min deadline) | Rust crate (orchestrator) | Shell implements `LoginWindow` trait over existing `login_window/humble_*` rpc fns | The webview and cookie reads are already Rust; only the loop and policy move |
| Humble persisted state (11 files) | StoreHost (`gamelib-store`) | — | 85 D-05: one owner; TS classes are write-through mirrors only for TS consumers |
| Humble secrets (`humble-session`, `humble-csrf`) | Shell `keyring_dispatch` (Keychain) | Crate owner with cache + memo over a `SecretSource` trait | FND-07: same slots, same ACL-bound binary; a `-cli` never reads the real Keychain |
| Steam ownership cross-reference input | StoreHost reads (`steam_library` games, `steamConfigStore.isLoggedIn`) | TS Steam mirror keeps writing until 90 | Rust reads the same files the TS mirror writes through |
| Sign-in probe pass, verdict, epoch fence | TS `signInProbe/` (survives until 91/92) | Rust ops for the Humble arm | Generic cross-store pass is owned by 91/92; Humble supplies one resolver |
| Humble renderer channels (15 invoke + 4 login + 1 send) | Rust native router, slice `humble` | — | D-16: exactly one owner; never falls back to the sidecar |
| Shortcut file writers (`.app`, `.lnk`, `.desktop`), icns, Steam grid art, shortcuts.vdf | Rust crate `gamelib-shortcuts` | `gamelib-steamfiles` (in-process via trait) | Pure filesystem work with injected paths |
| Shortcut game-data inputs (title, art URLs, install path, GOG exe, GOG product-API icon, settings merge) | TS library managers (until 89–92) | — | Game data and the `GlobalConfig` default merge are TS-owned; hence resolvers |
| `processShortcut` hotkeys (ctrl+q/k/j/l) | TS app shell (`quit.handleExit` owns the pending-operations confirm) | Rust emits `openScreen` | Not a desktop shortcut; relocate, do not port (Open Question 4) |
| Expiry digest notification text | Rust (`gamelib-i18n` + shell notification) | — | Same strings as i18next for every shipped locale (golden-tested) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gamelib-humble` (new, in-repo) | 0.1.0 | Humble crate: adapter, classify, dedup, library, user, secrets owner, alerts | Per-domain Tauri-free crate pattern [VERIFIED: src-tauri/crates/README.md §1] |
| `gamelib-shortcuts` (new, in-repo) | 0.1.0 | Shortcut writers + Steam non-Steam add/remove | Same pattern |
| `gamelib-store` / `gamelib-core` / `gamelib-proc` / `gamelib-steamfiles` / `gamelib-i18n` / `gamelib-log` | in tree | StoreHost, `ProcSpec`/`Shutdown`/`FrontendEmitter`, spawn, shortcuts.vdf, strings, log | Already shipped [VERIFIED: ls src-tauri/crates] |
| reqwest | 0.13, `default-features = false`, `features = ["rustls-no-provider"]` | HTTP | Workspace pin [VERIFIED: src-tauri/Cargo.toml:88]; HTTP/1.1 only (no `http2` feature), matching Node's HTTP/1.1; **do not enable `cookies`**: pass the `Cookie` header explicitly (the TS does, `libraryCookieHeader`) |
| rustls (ring) | 0.23 | TLS provider | `gamelib-info` pin [VERIFIED: gamelib-info/Cargo.toml] and `http::install_crypto_provider()` |
| icns | 0.5.0 | `.icns` writer for the macOS shortcut icon | STACK.md choice; cargo info confirmed version, MIT, **rust-version 1.87**, default features `pngio, jp2io` — use `default-features = false, features = ["pngio"]` to avoid the JPEG 2000 decoder [VERIFIED: cargo info icns] |
| image | 0.25.10 | PNG/JPEG decode, resize, PNG encode | Already in the lock via tauri [VERIFIED: src-tauri/Cargo.lock `image` 0.25.10]; declare `default-features = false, features = ["png","jpeg"]` for the new crate |
| crc32fast | 1.5.0 in lock | Steam non-Steam shortcut id | Equals zlib CRC32 (Node `zlib.crc32` is what `steamhelper.ts` calls) [VERIFIED: Cargo.lock; steamhelper.ts import `{ crc32 } from 'zlib'`] |
| jiff, regex, url, serde/serde_json, tokio, flate2 | as `gamelib-info` | Dates, JS-semantics regexes, URLs | Reuse the pins `gamelib-info` already carries [VERIFIED: gamelib-info/Cargo.toml] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gamelib-info` | in tree | Wiki lookup (`info_wiki_get`) for the Steam id when adding to Steam | Reach it **through a trait the shell implements**, never as a crate dependency (domain crates depend on core, not each other) [VERIFIED: README §2c] |
| `md-5`/`sha2` | as info | not needed | — |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `icns` + `image` | hand-written ICNS container (`icns` magic + `ic11` + PNG bytes) + `image` for resize | ~40 lines, no MSRV bump; decide at plan time. The crate is fine; its MSRV 1.87 requires `rust-version = "1.87"` on `gamelib-shortcuts` (the depot crates set precedent for a per-crate exception) |
| `sanitize-filename` crate (0.8.0-beta on crates.io, "based on Node's") | hand port of the npm 2-file algorithm with TS-recorded vectors | Recommended: hand port. Behaviour must be byte-identical for file names; a beta crate that is "based on" is not a proof [ASSUMED] |
| reqwest `cookies` feature | explicit `Cookie` header | Explicit header: exactly what the TS sends, no jar state, no `Set-Cookie` side effects |
| Windows `ico` crate (STACK.md) | PowerShell `IShellLinkW` helper | **D-12 keeps PowerShell**; STACK.md's `ico` row is obsolete for this phase |

**Installation (crate manifests only; nothing is `npm install`ed):** add `gamelib-humble`, `gamelib-shortcuts` (and `-cli` only if used) to `src-tauri/Cargo.toml` workspace members and to `EXPECTED_LOCKFILE_CRATE_NAMES` in `src/backend/__tests__/cargoFeatures.test.ts` in the same commit [VERIFIED: README §3 step 9]; add `-p gamelib-humble -p gamelib-shortcuts` to the explicit crate list in `.github/workflows/rust-test.yml` [VERIFIED: README §8, rust-test.yml:135].

**Version verification:** `cargo info icns` run this session: 0.5.0, MIT, rust-version 1.87. `image` 0.25.10 and `crc32fast` 1.5.0 read from `Cargo.lock`. rustc/cargo here: 1.99.1.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| icns | crates.io | first published 2016-05 | 17,875/wk | github.com/mdsteele/rust-icns | OK | Approved (`[VERIFIED: gsd-tools package-legitimacy check --ecosystem crates + cargo info]`) |
| image | crates.io | first published 2014-11 | 6,855,799/wk | github.com/image-rs/image | OK | Approved (already in lock) |
| crc32fast | crates.io | first published 2018-11 | 20,437,384/wk | github.com/srijs/rust-crc32fast | OK | Approved (already in lock) |
| sanitize-filename | crates.io | first published 2018-10 | 256,706/wk | github.com/kardeiz/sanitize-filename | OK | **Not recommended** (hand port instead, parity reasons); verdict is legitimacy only |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
No postinstall surface (crates). `icns`/`image` names came from STACK.md (in-repo, authored by the project) and were confirmed by the seam and `cargo info`.

## Architecture Patterns

### System Architecture Diagram

```
Renderer ──invoke──► native router (slice "humble") ──► humble_dispatch.rs ──► gamelib_humble::dispatch(op,args,&HumbleCtx)
 (Keys screen,                                                                      │
  login surface)                                         ┌──────────────────────────┼───────────────────────────────┐
                                                         ▼                          ▼                               ▼
                                                  Http (reqwest, no redirects)   StoreHost (gamelib-store)      SecretSource (shell, Keychain/dev vault)
                                                  humblebundle.com               11 files, byte-identical       humble-session / humble-csrf
                                                  store.steampowered.com         + reads steam_library,         cache + 120 s failure memo
                                                                                 steamConfigStore.isLoggedIn,
                                                                                 settings doc
                                                         │
                  login: LoginWindow trait ──► shell login_window/humble_* rpc fns (already Rust; webview + cookies)
                  events: FrontendEmitter ──► humbleKeysUpdated, humbleSyncStateChanged, humbleSyncProgress, humbleAuthState
                  digest: Notifier + gamelib-i18n ──► OS notification
                  cross-boundary: Rust ──SidecarState::invoke──► TS signIn outcomes (noteSignInSucceeded/noteSignedOut)   [scheduled, dies with signInProbe]

Renderer ──invoke──► sidecar TS resolver (shortcutsExists/addShortcut/removeShortcut/addToSteam/removeFromSteam/isAddedToSteam)
                      │ gathers: game title/appName/runner/art/install/GOG exe + GOG icon URL/settings (TS-only)
                      └──rustInvoke──► shortcuts_dispatch.rs ──► gamelib_shortcuts::dispatch ──► fs (.app/.lnk/.desktop, icons, grid art)
                                                                 ├─► ProcSpec via gamelib-proc (powershell.exe, reg.exe)  [Helper]
                                                                 ├─► gamelib-steamfiles (shortcuts.vdf read/apply, atomic)
                                                                 └─► WikiLookup trait ─► gamelib-info info_wiki_get (shell wires)
TS game managers (steam/gog/legendary/nile/sideload games.ts, sideload/library.ts) ──► same-signature shims ──► same rustInvoke ops
```

### Recommended Project Structure
```
src-tauri/crates/gamelib-humble/src/
├── lib.rs            # OPS, dispatch, guarded (copy gamelib-info's shape)
├── ctx.rs            # HumbleCtx: host, clock, http, secrets, emitter, login, notify, i18n, settings, steam reader, log, shutdown
├── http.rs           # copy of gamelib-info/http.rs with a redirect switch (Policy::none) and multipart body support
├── adapter/          # session_status, discover_action_id, library_action (flight parse), redeem_action
├── classify.rs  dedup.rs  title_match.rs  expiration_alerts.rs  app_id_resolver.rs
├── library.rs  user.rs  secrets.rs  stores.rs  sync_fence.rs  action_ids.rs  user_agent.rs  validation.rs
src-tauri/crates/gamelib-shortcuts/src/
├── lib.rs  ctx.rs  paths.rs (shortcut_files, sanitize)  mac.rs (run.sh, Info.plist, icns, link)  linux.rs
├── windows/ (lnk script+env, icon chain, reg query)  steam/ (nonesteamgame, ids, grid art)  icons.rs (get_icon)
src-tauri/src/humble_dispatch.rs  shortcuts_dispatch.rs  (+ one-line arms in rust_dispatch.rs, entries in nativeChannels.json)
```

### Pattern 1: Domain crate + Ctx + dispatch (Phase 86/87)
**What:** Tauri-free crate, `OPS` sorted const, `dispatch(op,&[Value],&Ctx)`, args structs `#[serde(deny_unknown_fields, rename_all="camelCase")]`, results not errors, `guarded` wrapper (registrant + token race + panic catch). **When:** every new service. **Example:** `gamelib-info/src/lib.rs` `dispatch`/`guarded`/`route` [VERIFIED: read this session].

### Pattern 2: Shim vs resolver (86 D-06/D-24; 87 D-23)
A shim is one typed `requestRustInvoke` call whose arguments are built from its parameters; a resolver gathers named TS-only inputs as `const` declarations then makes exactly one typed call. Each is a row `{name,file,shape,channel,callers,deletedBy[,inputs]}` in a schedule test [VERIFIED: infoShimSchedule.test.ts:1-60, row for `getWikiGameInfo`: `shape: 'resolver'`, `inputs: ['title', 'appName', 'runner']`, `channel: 'RUST_INFO_WIKI_GET'`, `deletedBy: 94`]. **94 deletes that row** (the shortcuts crate calls wiki through a trait in-process) and drops `src/backend/shortcuts/nonesteamgame/nonesteamgame.ts` from `WIKI_CALLERS` for the `getUmuId` and `clearWikiGameInfoCache` rows [VERIFIED: infoShimSchedule.test.ts:72-76].

### Pattern 3: Native channel (slice) registration
`nativeChannels.json` entry `{kind, slice, args[], returns, valid[], invalid[]}`, a Rust handler in the router, the `ipc.handle` and zod key deleted in the same commit, `pnpm gen:ipc-contract` + `check:ipc-contract`, native typing in `native.ts` [VERIFIED: 86-08-PLAN.md:147-179; nativeChannels.json `removeRecent` entry read this session]. Add slice `humble` (invoke-only, plus one send queue for `humbleDisconnect`/`humbleStopLogin` if kept as `send`).

### Pattern 4: Secrets through a `SecretSource`
`gamelib-info` has no `keyring` dependency; the shell's `KeyringSecretSource` makes the same `Entry` calls as `keyring_dispatch`, reads through `bounded_keyring_read(KEYRING_READ_TIMEOUT)`, resolves accounts through the allowlist `keyring_account`, and a `DevVaultSecretSource` gated on `GAMELIB_DEV_SECRET_VAULT=1` AND `tauri::is_dev()` [VERIFIED: info_secrets.rs header, read this session]. The allowlist already carries `"humble-session" => Ok("humble-session")` and `"humble-csrf" => Ok("humble-csrf")` [VERIFIED: main.rs:522-523]. **Extend the slot set** (Humble session/csrf) rather than add a second Keychain path.

### Pattern 5: Spawn through `gamelib-proc` with `ProcSpec`
`ProcSpec { program, argv, env, replace_env, cwd, stdin, timeout, max_buffer, cancel, label }` [VERIFIED: gamelib-core/src/process.rs:40-58]. PowerShell: `argv = ["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-Command","-"]`, `stdin = WRITE_SHORTCUT_SCRIPT` (CRLF-joined), `env` = the process env + `GAMELIB_LNK_*`, `replace_env: true` (TS passes `replaceEnv: true` with `{...baseEnv, GAMELIB_LNK_*}`), `timeout = 30 s`. **Pin env as well as argv/stdin in the golden**: CONTEXT D-12 names only argv and stdin, but every caller value reaches the script through `$env:GAMELIB_LNK_*` [VERIFIED: windowsShortcut.ts header + `buildShortcutEnv` + `WRITE_SHORTCUT_TIMEOUT_MS = 30_000` at :152].

### Anti-Patterns to Avoid
- **A `rustInvoke` per Humble renderer call from a TS wrapper.** The Humble renderer channels have no TS-only input; make them native (one owner), not shims.
- **Rewriting a store file "equivalently".** D-07: ordered JSON with JS number text through `gamelib-store` only; never `serde_json::to_string_pretty`.
- **Following redirects.** `ReqwestHttp` in `gamelib-info` uses `Policy::limited(5)` [VERIFIED: http.rs:199]; Humble's session-expired signal IS the redirect to `auth.humblebundle.com` (adapter.ts `maxRedirects: 0` at :251, :475; `redirect: 'manual'` at :601, :825). The copied seam needs a per-request `no_redirect`.
- **Deleting the TS mirror cell the schedule says is "94"** without checking the TS readers (see Pitfalls 1 and 2).
- **Using `reqwest::Request::query()`** (encodes differently from axios); use `axios_query` from the info seam for the Steam store search.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persisted JSON with JS number text and key order | A serde_json writer | `gamelib-store` `Json`/`Store`/`Op` + `cache_view` semantics from `gamelib-info` | 85 byte-identical goldens; one owner |
| Keychain access, dev vault, 45 s bounded read | New `keyring` calls | Shell `keyring_dispatch` fns via a `SecretSource` | FND-07, signed-binary ACL |
| shortcuts.vdf read/modify/atomic write | A VDF parser | `gamelib-steamfiles` `shortcuts` module (`steamfiles_shortcuts_read/apply`) | Lossless binary KV, atomic |
| Destructive path proof | `remove_dir_all` | `gamelib-safety` guards + a creation proof (below) | FND-02/D-22 |
| Child spawn, kill, Windows Job, reaper | `Command::spawn` | `gamelib-proc` `ProcSpec` via `SpecRunner` | Shutdown contract (shell-side convention 4) |
| i18next rendering incl. HTML escape and `en` fallback | `format!` | `gamelib-i18n` `Catalog::t` | Golden-proven against real i18next |
| Cross-store login webview + cookie reads | New webview code | Existing `login_window/humble_*` rpc fns, behind a `LoginWindow` trait | Already Rust and WKWebView-correct (domain/dot rules in `tauri-login-webview-cookies.md`) |
| axios query encoding | reqwest `.query()` | `http::axios_query` (copy) | Known encoding difference |
| Recorded-HTTP replay + request pinning | Ad hoc mocks | The `Replay`/`with_ts_only` machinery in `gamelib-info/src/http.rs` (copy or move to `gamelib-testutil`) | 86 D-09/D-10 |

**Key insight:** every piece of infrastructure this phase needs already exists in the tree; the risk is parity at edges (JS regex, JS date parsing, axios/fetch wire behaviour, sips geometry), not missing building blocks.

## Humble: complete inventory (what must be ported or deleted)

### Renderer channels (all in sidecar TS today)
`humbleFlowRegistration.ts` (16 handlers): `humbleGetUserInfo`, `humbleCheckHealth`, `humbleSync`, `humbleGetKeys`, `humbleGetSyncState`, `humbleGetGiftedAt`, `humbleMarkRedeemed`, `humbleUndoRedeemed`, `humbleGetRevealedKeyValue` (the C4 narrow-exposure channel: **no logging**), `humbleGetClaimAnnotations`, `humbleSetOwnershipOverride` (server-side fuzzy-only re-validation), `humbleClearOwnershipOverride`, `humbleGetOwnershipOverrides`, `humbleRecordGiftLinkOpened` (re-validates `ownedElsewhere` and `state === 'UNREVEALED'`), `humbleDisconnect` (a **send**, never rethrows), `humbleRunValidation` (dev only). `humbleLoginFlowRegistration.ts`: `humbleStartLogin`, `humbleReconnect` (both bounded by `LOGIN_WATCH_TIMEOUT_MS`, 10 min, so they appear in `EXPECTED_LONG_RUNNING_CHANNELS` [VERIFIED: longRunningChannels.test.ts:55-60]; native invoke has no 60 s sidecar bound, remove them from that list when native), `humbleRevealKey`, `humbleStopLogin` (send). The login registration also **installs the `LoginWindowSeam` slot** that `oauthLoginCapture.ts` and the GOG/Epic/Amazon user flows read [VERIFIED: humbleLoginFlowRegistration.ts `humble.loginWindowSeam.install(createRustLoginWindowSeam(deps.requestRustInvoke))`; handlers.ts:189,351,369] — relocating the seam (D-03) must also relocate this install call (it must not die with the Humble registration), plus the `GAMELIB_LOGIN_SEAM_SMOKE` block.
Events pushed to the renderer: `humbleAuthState`, `humbleKeysUpdated`, `humbleSyncProgress`, `humbleSyncStateChanged` [VERIFIED: grep of `sendFrontendMessage(` in `src/backend/humble`; `humbleAuthState` is also pushed from `signInProbe/verdict.ts`].

### Humble HTTP surface (hosts: `www.humblebundle.com`, `auth.humblebundle.com` as a redirect target, `store.steampowered.com`)
`HUMBLE_BASE_URL = 'https://www.humblebundle.com'`, `ORY_SESSION_COOKIE_PREFIX = 'ory_session_'` [VERIFIED: constants.ts:7,12]. `REQUEST_TIMEOUT_MS = 15_000` [adapter.ts:84], POST timeouts `AbortSignal.timeout(20_000)` [adapter.ts:612,836], `LIBRARY_PAGE_GAP_MS = 300`, `CHUNK_FETCH_GAP_MS = 150`, `HUMBLE_LIBRARY_MAX_PAGES = 200` [adapter.ts:286,287,279], `BROWSER_UA` is a fixed Safari string [adapter.ts:291], `HUMBLE_SYNC_CONCURRENCY = 3`, `HUMBLE_COOLDOWN_MS = 15 * 60 * 1000`, `HUMBLE_CLASSIFIER_VERSION = 7` [constants.ts:36,40,68].
1. `GET /api/auth/session-status` (JSON, `Cookie` = value if it starts with `ory_session_`, else `_simpleauth_sess=<value>`, `maxRedirects: 0`, any status accepted) → `authenticated | anonymous | unknown`.
2. `GET /home/library` and `GET /home/library/<gamekey>` (HTML, `Accept: text/html`, `User-Agent: BROWSER_UA`, no redirects: 401 → session_expired, 403/429 → access_denied, ≥500 throws, a redirect whose `Location` contains `auth.humblebundle.com` → session_expired) then **every `/_next/static/...js` chunk** found by regex is fetched (150 ms apart, previously-known chunk first) until `"<40-44 hex>",<≤60 chars>"<actionName>"` matches; the action id and chunk are cached in the per-boot `HumbleActionIdCache`.
3. `POST /home/library[?page=N]` with `Next-Action`, `Next-Router-State-Tree` (a fixed percent-encoded constant), `Origin`, `Referer`, `Accept: text/x-component`, a `FormData` body whose **entry order is load-bearing** (the `_1_*` fields first, root part `0` last — measured live per the source comment). Response is React Flight text, parsed line by line; page `results`, `pagination`, echoed query.
4. `POST /home/library/<gamekey>` with `Content-Type: text/plain;charset=UTF-8`, body `JSON.stringify([keyId, keyIntegrationId, '$undefined'])` → `redeemEntitlementAction` result `{success,key,errorKind,orderStatus}`.
5. `GET https://store.steampowered.com/api/storesearch/?term=…&l=english&cc=US` (`User-Agent: GameLib`, 8 s) for the Steam app-id resolver (350 ms gap, cap 40 per pass, 7-day miss TTL).

### Persisted Humble state (D-07 inventory) [VERIFIED: humble/stores.ts, read this session]
`humbleConfigStore` (cwd `humble_store`, kind user-state, `tokenBearing`), `humble_library` (user-state), `humble_sync` (cache), `humble_revealed`, `humble_ownership_override`, `humble_gifted_at`, `humble_audit`, `humble_local_redeemed`, `humble_notified_expiration`, `humble_settle_declined` (all user-state), `humble_steam_appid` (cache). `disconnect` clears config, library and sync stores but **not** the user-state ones (82-STATE-OWNERSHIP rows 67-76). `expirationAlerts` has a one-time **backfill**: a bare `machineName` entry is copied to the composite key `gamekey:machineName` when the composite is absent [VERIFIED: expirationAlerts.ts `detectAndNotifyExpirationTransitions`].

### Secrets
`SidecarHumbleSecretStore` over two `SidecarKeyringSlotStore`s (slots `humble-session`, `humble-csrf`): process-lifetime **success** cache, in-flight dedupe, a **120 s negative memo** (`KEYRING_FAILURE_MEMO_MS = 120_000`, keyringTokenStore.ts:62), totality (never throws, one warning per failure, never the value), `invalidateCache` before delete, `readSecret(key, context)` three-state read for the boot probe. At boot `startSidecarHumbleSecretStore` runs a **one-time plaintext → Keychain migration with read-back** (`migrateOneSecret`) which must move to Rust boot as bounded work holding a Registrant (the 86 analog is `start_sgdb_migration` in `info_dispatch.rs`). The renderer side `humbleConfigStore` still holds legacy `sessionCookie`/`csrfToken` keys until migrated.

## Shortcuts: complete inventory

### Channels (`shortcutsFlowRegistration.ts`)
`shortcutsExists`, `addShortcut(appName, runner, fromMenu?)`, `removeShortcut`, `addToSteam`, `removeFromSteam`, `isAddedToSteam`, plus `processShortcut` (misfiled, see Open Question 4). Each `addShortcut/removeShortcut` then **re-checks the disk** (`shortcutsExistOnDisk`) and raises one of several i18n toasts (`box.shortcuts.*`, `gamelib:box.shortcuts.messageMacDesktop`, `gamelib:box.shortcuts.messageRemoveMacDesktop`); add/remove to Steam raise `notify.finished.add.steam.*` toasts or an error dialog (`showDialogBoxModalAuto`, `box.error.add.steam.*`). The Rust ops must emit these through the shell notification/dialog primitives with the same text (extend `genI18nGolden.ts`, see Pitfall 11).

### Complete caller list (D-04 asked research to produce it) [VERIFIED: grep of src/backend, this session]
- `storeManagers/steam/games.ts:17-19,363-368` — `addShortcuts`/`removeShortcuts` class methods
- `storeManagers/gog/games.ts:55-57,64,271,564,603-608,1284,1286` — methods; post-install `this.addShortcuts()`; uninstall `removeShortcutsUtil` + `removeNonSteamGame`
- `storeManagers/legendary/games.ts:31-35,562-572,670,823-824,903`
- `storeManagers/nile/games.ts:37-41,173,306,333-343,608-609` (also `import type { ShortcutsDeps }`)
- `storeManagers/sideload/games.ts:14-16,35,91-96,232,241`
- `storeManagers/sideload/library.ts:7,80` — `addShortcuts(this.deps, new SideloadGame(...))`
- `sidecar/shortcutsFlowRegistration.ts` (the channels), `sidecar/handlers.ts`, `sidecar/bootstrap.ts`, `host/index.ts`/`services/managerDeps.ts`/`storeManagers/index.ts` (`imageTools`, `ShortcutsDeps` wiring), `common/types/game_manager.ts:65-66` (`addShortcuts`/`removeShortcuts` on `Game`).
Because these callers pass a `Game`, the shims are **resolvers** (D-24 shape): read `game.getGameInfo()` (title, `app_name`, `runner`, `art_square`/`art_cover`/`art_logo`, `install.install_path`, `install.executable`, `install.is_dlc`), for GOG `libraryManagers.gog.getExecutable()` and `getProductApi()` (icon URL), and `config.getSettings()` (`addDesktopShortcuts`, `addStartMenuShortcuts`, `addSteamShortcuts`, `defaultSteamPath`), then make one typed call. Schedule rows: `deletedBy` = the phase that ports each store manager (steam 90, legendary 91, gog/nile/sideload 92 per the 86 schedule's convention; confirm against ROADMAP at plan time).

### Behaviour facts the port must reproduce
- Paths (`shortcutFiles`): linux `${knownFolder('desktop')}/${title}.desktop` and `${userHome}/.local/share/applications/${title}.desktop`; win32 `<registry Desktop>\<title>.lnk` and `${appData}\Microsoft\Windows\Start Menu\Programs\<title>.lnk` (**no guessed Desktop**: absent registry value = no Desktop path, recorded as a failure); darwin `~/Applications/<title>.app` and a **symlink** `~/Desktop/<title>.app` → the Applications bundle. `title` goes through npm `sanitize-filename`.
- Linux `.desktop` text: `[Desktop Entry]\nName=…\nExec=xdg-open gamelib://launch?appName=…&runner=…\nTerminal=false\nType=Application\n[Icon=…\n]Categories=Game;\n` — **no percent-encoding on Linux** (differs from mac/Windows); Desktop file mode `0o777`.
- macOS `run.sh`: `"<exe>" --no-gui '<gamelib://launch?appName=<enc>&runner=<enc>>'` with the exact template whitespace (`#!/bin/bash\n    # autogenerated file - do not edit\n\n      <cmd>\n    `), `chmod 755`; `Info.plist` template has literal tab indentation and the conditional `CFBundleIconFile`/`shortcut.icns` pair [VERIFIED: shortcuts.ts generateMacOsApp, read this session — copy the template from source, do not retype].
- Windows: target `gamelib://launch?appName=<enc>&runner=<enc>` becomes an argument to `<SystemRoot>\explorer.exe` with the URL **quoted** (`"` inside → `%22`); icon chain store exe → bounded install scan (depth ≤3, entry budget 20,000, helper-exe regex, name tiers) → shell exe; `GAMELIB_LNK_*` env; success = exit 0 **and** the `.lnk` exists.
- Add to Steam: `shortcuts.vdf` per userdata folder (skip `0` and `ac`), validity messages, existing-title skip, `Exe`/`StartDir`/`LaunchOptions` rules (Flatpak, AppImage, portable exe, `--no-gui`, `--no-sandbox` off Windows), `appid` from CRC32, `LastPlayTime` from the `timestamp` store key `${appName}.lastPlayed` else now, grid art (`library_600x900_2x.jpg`, `header.jpg`, `library_hero.jpg`, `logo.png` from the Steam CDN when a Steam id is known, else the game's own art, else a transparent logo).
  `StartDir` is `process.cwd()` of the sidecar, which inherits the shell's cwd (`sidecar.rs` sets no `current_dir`) [VERIFIED: sidecar.rs:228-229 reads `std::env::current_dir()` only for logging; `Command` has no `.current_dir`], so Rust uses `std::env::current_dir()`; `Exe` uses `GAMELIB_SHELL_EXE` = the shell's `current_exe()` [VERIFIED: sidecar.rs:127-131].

## Common Pitfalls

### Pitfall 1: `timestampStore` mirror "deleted at 94" strands Phase 88
**What goes wrong:** `storeMirrorSchedule.test.ts` has `timestampStore: 94` [VERIFIED: :66], but `launcher.ts` (Phase 88) is a live **writer** (`tsStore.set(`${appName}.lastPlayed`, …)` [VERIFIED: launcher.ts:459]); 94 lands before 88 (D-01). Deleting the mirror breaks launch bookkeeping.
**How to avoid:** Rust reads the `timestamp` store through the host; **do not delete the TS mirror in 94**; move the cell to 88 in both `82-STATE-OWNERSHIP.md` and the schedule test (the 86 precedent amended cells the same way, D-27).
**Warning signs:** `storeMirrorSchedule` red, or `lastPlayed` stops updating after a launch.

### Pitfall 2: Humble config mirror vs `signInProbe/verdict.ts`
**What goes wrong:** `applySignInVerdict` reads and writes `stores.humble.configStore` **synchronously** (`flagOver(stores.humble.configStore,'expired')`, `get_nodefault('userData')`) [VERIFIED: verdict.ts:78,105], and `pass.ts` calls `humbleUser.isLoggedIn()` synchronously and `probeSession('boot-probe')` [VERIFIED: pass.ts:172-174]. Humble's own login/disconnect call `signInOutcomes.noteSignInSucceeded('humble')` / `noteSignedOut('humble')` [VERIFIED: user.ts:738,967], which bump the TS epoch fence and republish `signInProbeOutcomes`. None of this is in D-04.
**How to avoid:** Decide Open Question 1 before planning. Recommended: the Humble arm of the pass becomes one scheduled resolver (`isLoggedIn`, `probe`+verdict+epoch as Rust ops: `humble_is_logged_in`, `humble_sign_in_probe`), `noteSignInSucceeded/noteSignedOut` are reached from Rust through one scheduled sidecar callback channel, and `humbleConfigStore`'s mirror cell moves from 94 to the phase that ports the pass (91/92). The renderer's `authState.ts` reads `humbleConfigStore` from the renderer store layer, unaffected.

### Pitfall 3: Cloudflare and the TLS fingerprint (the reveal)
**What goes wrong:** The knowledge-base note in `online_monitor.ts` says Cloudflare-fronted hosts treat Node/axios TLS differently, and an earlier Humble reveal was blocked as a CF challenge (HTML 403) until the transport changed [VERIFIED: online_monitor.ts:185-189; user.ts comment block "Debug session humble-reveal-key-fails round 6"]. The shipped path today is Node `fetch`/axios to the Next.js actions and it works; rustls/ring has a different ClientHello. **Not provable offline.**
**How to avoid:** HTTP/1.1 only (no `http2` feature), the same header set (capture on the wire, Pitfall 4), same `User-Agent`, same ordering where possible. D-09 items 1 and 2 are the proof (sync and reveal on the signed build). Keep `humble_reveal_post` + `humble_login_clear_storage` untouched as the fallback until the gate passes (Open Question 3).

### Pitfall 4: Implicit wire headers and multipart framing
**What goes wrong:** axios adds `Accept-Encoding: gzip, compress, deflate, br` and decodes; undici `fetch` adds `accept: */*`, `accept-language: *`, `sec-fetch-mode`, its own multipart boundary; reqwest with default features off sends no `Accept-Encoding` and no decompression. The TS source does not show these headers, so "same headers as the TS" cannot be read from the TS.
**How to avoid:** the 86 D-10 recorder must capture **on the wire** (a local HTTP server the TS points at), pin method, URL, the headers the TS source sets, and **multipart field names and order** (not the boundary). Decide gzip/brotli features deliberately from the capture.

### Pitfall 5: Redirects
**What goes wrong:** copying `ReqwestHttp` as-is follows 5 redirects and turns every "session expired" into a 200 from the auth host. **How to avoid:** per-request `follow_redirects: false`, tested with a replay case asserting a `302 Location: https://auth.humblebundle.com/…` maps to `session_expired`.

### Pitfall 6: JS semantics inside the classifier and flight parser
`classify.ts` is 819 lines, `adapter.ts` has regexes (`/\/_next\/static\/[A-Za-z0-9_\-/()[\].%~]+\.js/g`, the `"([0-9a-f]{40,44})",[^"]{0,60}"<name>"` matcher, flight row regexes) and `flightDateToIso` uses `new Date(raw).toISOString()` (V8 accepts non-ISO strings Rust date parsers reject) [VERIFIED: adapter.ts:331-337]. **How to avoid:** regexes spelled with explicit classes and run against the recorded vectors (the `gamelib-info` `regex_vectors.rs` pattern, features off so a stray `\s`/`\d` fails to compile [VERIFIED: gamelib-info/Cargo.toml comment]); date edge cases go into the golden corpus; any divergence is a D-20 todo, not a fix.

### Pitfall 7: Fuzzy title match lives twice
`dedup.ts` imports `fuzzyMatch` from `common/matching/titleMatch.ts`, which the renderer (`RedeemSteamKeyDialog`) and `common/discounts/badges.ts` also use [VERIFIED: grep]. The TS stays; the Rust copy (normalise + Levenshtein with threshold 0.85) must be pinned to **shared vectors** both languages read (the 87 D-24 "pure twin" precedent) or it will drift. `fastest-levenshtein` is plain Levenshtein over UTF-16 units; after `normalizeTitle` only `[a-z0-9 ]` survive, so ASCII byte distance is exact — but the vectors must include non-ASCII input that normalises away.

### Pitfall 8: `toLocaleDateString()` in the digest copy
`buildDigestCopy` renders `new Date(expiration).toLocaleDateString()` [VERIFIED: expirationAlerts.ts]: locale-dependent, Node ICU, process locale. Rust cannot match byte for byte across locales. **How to avoid:** pin the en-US output (`M/D/YYYY`) the app produces today under the sidecar's locale, document the divergence for other process locales as a D-20 todo, and put both on the golden. Also `{{count}}` plural: only `en` defines `humble.notification.*` (including `_one`/`_other` with identical text) [VERIFIED: python read of `public/locales/*`], and `gamelib-i18n` does not implement plural suffixes [VERIFIED: gamelib-i18n/src/lib.rs:19] — it falls through to the base key, which has the same text, so the golden must include `count` cases to prove it.

### Pitfall 9: Hostile text and sanitisation
`sanitize(gameTitle)` (npm `sanitize-filename`) feeds every path. A Rust approximation silently changes which file a user's existing shortcut lives at, so removal misses it. **How to avoid:** hand port, vectors recorded from the TS for reserved names, trailing dots/spaces, control chars, >255-byte titles, surrogate pairs, `.`/`..`.

### Pitfall 10: Removal `rm -rf`s without proof (D-22)
TS `removeShortcuts` on macOS runs `rm(file,{recursive:true,force:true})` on `~/Applications/<title>.app` and the Desktop item with no proof GameLib created them [VERIFIED: shortcuts.ts removeShortcuts]. A user's own `Foo.app` with the same sanitized title is deleted. **How to avoid:** prove creation: the bundle's `Contents/MacOS/run.sh` exists, is not a symlink, contains the `# autogenerated file - do not edit` marker and a `gamelib://launch` URL, and `Contents/Info.plist` names `run.sh` as `CFBundleExecutable`; Desktop item must be a symlink whose target is the Applications bundle path (or a legacy bundle satisfying the same proof); Linux/Windows files: read and require the GameLib `Exec=xdg-open gamelib://` line / for `.lnk` accept only when the extension matches and the file is a regular file (a `.lnk` cannot be cheaply parsed; use the title+extension+regular-file rule and document it). "Unknown" refuses and is reported as not removed. This is a deliberate behaviour **change** from TS; file a D-20 todo only if the user wants the old behaviour back; the golden for removal must cover "proven" and "not proven".

### Pitfall 11: Notifications and i18n coverage
`genI18nGolden.ts` only renders Steam-poll cases [VERIFIED: meta/genI18nGolden.ts `POLL_CASES`]. Humble digest (`humble.notification.*`) and shortcut toasts (`box.shortcuts.*`, `gamelib:` namespace keys, `notify.finished.add.steam.*`, `box.error.add.steam.*`) must be added as cases (with `game`, `title`, `date`, `count`, `error`, `newLine` params and `interpolation.escapeValue: false` where the TS passes it) or Rust strings can drift from i18next. `showErrorInFrontend` passes `interpolation: { escapeValue: false }`: the Rust catalog escapes by default [VERIFIED: gamelib-i18n header] — a case needs a "no escape" path or an explicit pre-escape decision.

### Pitfall 12: Windows spawn hides nothing
TS passes `windowsHide: true` for `powershell.exe` and `reg.exe` [VERIFIED: windowsShortcut.ts:170, knownFolders.ts:134]. A grep of `src-tauri/src` and `src-tauri/crates` for `creation_flags|CREATE_NO_WINDOW` returns **nothing** [VERIFIED: grep this session]: `gamelib-proc` has no hide-window option, so a GUI-subsystem shell spawning `powershell.exe` can flash a console window [ASSUMED: Windows behaviour]. **How to avoid:** add `hide_window: bool` to `ProcSpec` and apply `CREATE_NO_WINDOW` in `gamelib-proc`'s Windows spawn — a small edit to `gamelib-core/process.rs` and `gamelib-proc/spawn.rs`, which 87 also touches (D-02 conflict surface; keep it append-only). CI cannot see a window; the live check rides Phase 99.

### Pitfall 13: macOS icon geometry is not what D-13 says
`convertPngToICNS` calls `.resize({ width: 512 }).crop({ x: 0, y: 0, width: 512, height: 512 })` [VERIFIED: shortcuts.ts:497-498] but the sidecar's `nativeImage` is a **`sips` shim** that maps `crop` to `sips -c <h> <w>` and **ignores x and y** [VERIFIED: nativeImageShim.ts:131]. Measured this session on this Mac: `sips --resampleWidth 200 -c 200 200` of a 100×300 three-band PNG returned the **middle** band, i.e. a **centred** crop [VERIFIED: sips run, scratchpad sipsprobe]. So today's macOS icons are centre-cropped (a tall 600×900 `art_square` loses top and bottom), not top-left. D-13 says "crop 0,0": resolve in Open Question 2; recommended: replicate the centred crop (that is what ships), file the top-left question as a todo.

### Pitfall 14: `humbleConfigStore.encryptionDegraded` and legacy plaintext keys
`storeHumbleSecret` writes `encryptionDegraded = !(await store.isAvailable('store-humble-secret'))` after every secret write; the plaintext migration deletes the legacy keys and sets it to `false`. Both are store writes the golden must pin; `isAvailable` is `keyring_available` on the `humble-session` slot.

### Pitfall 15: Worktree + 87 shared files
Both phases append to `rust_dispatch.rs`, `ipc_contract.rs` (generated: regenerate after every rebase, never hand-merge), `channelSchemas.ts`, `handlers.ts`, the IPC snapshot, `Cargo.toml`/`Cargo.lock`, `cargoFeatures.test.ts` `EXPECTED_LOCKFILE_CRATE_NAMES`, `nativeChannels.json`, `native_router.rs` (slice constants), `storeMirrorSchedule.test.ts`, `infoShimSchedule.test.ts`, `rust-test.yml`, and `genI18nGolden.ts`. Plans touch them in one small task each, in a fixed order, and **rebase + regenerate before each wave** (D-02).

## Code Examples

### Native manifest entry shape (from an existing channel)
```json
// Source: src/common/types/ipc/nativeChannels.json (removeRecent, read this session)
"removeRecent": {
  "kind": "invoke", "slice": "info",
  "args": [{ "name": "appName", "type": "string", "maxLength": 1024, "maxLengthUnit": "utf16" }],
  "returns": "void",
  "valid": [["abc"]],
  "invalid": [[], [1], ["a", "b"], [""]]
}
```
Add one such entry per Humble channel under slice `humble` (args from `common/types/ipc/humble.ts` `keyIdentity`/`machineName` shapes).

### Shim/resolver schedule row
```ts
// Source: src/backend/__tests__/infoShimSchedule.test.ts (getWikiGameInfo row, read this session)
{
  name: 'getWikiGameInfo',
  file: 'src/backend/info/wiki.ts',
  shape: 'resolver',
  inputs: ['title', 'appName', 'runner'],
  channel: 'RUST_INFO_WIKI_GET',
  callers: WIKI_CALLERS,
  deletedBy: 94   // 94 deletes this row and drops nonesteamgame.ts from WIKI_CALLERS
}
```

### Windows `.lnk` spawn (golden pins program, argv, env, stdin, timeout)
```rust
// Source: shape from gamelib-core ProcSpec (process.rs:40-58) + windowsShortcut.ts (read this session)
let mut spec = ProcSpec::new("shortcut-lnk", "powershell.exe");
spec.argv = ["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-Command","-"]
    .iter().map(|s| s.to_string()).collect();
spec.env = env_with_gamelib_lnk(base_env, lnk_path, details);   // GAMELIB_LNK_PATH/TARGET/ARGS/ICON/ICON_INDEX
spec.replace_env = true;
spec.stdin = Some(WRITE_SHORTCUT_SCRIPT.to_string());           // CRLF-joined, verbatim from TS
spec.timeout = Some(Duration::from_secs(30));
// hide_window = true (new field, Pitfall 12); success = exit 0 AND the .lnk exists
```

### Resolver registration (surviving TS), one typed call
```ts
// Pattern: 86 D-24. Gathers TS-only inputs as consts, then exactly one requestRustInvoke.
deps.ipc.handle('addShortcut', async (_e, appName, runner, fromMenu) => {
  const info = deps.managers.library[runner].getGame(appName).getGameInfo()
  const settings = deps.config.getSettings()
  const gogExecutable = isStore(info, 'gog') ? deps.libraryManagers.gog.getExecutable(appName) : undefined
  return requestRustInvoke(RUST_SHORTCUTS_ADD, [{ info: pickShortcutGameInfo(info), settings: pickShortcutSettings(settings), gogExecutable, fromMenu }])
})
```
(The renderer-facing channel stays a sidecar `ipc.handle` resolver; the exact names are the planner's, schedule rows are mandatory.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Humble legacy REST (`/api/v1/user/order`, `/humbler/redeemkey`) | Next.js server actions `filterUserLibrary`, `redeemEntitlementAction` | 2026-11 site move (commits `31a4f11df`, `a58e3e3e8`) | Port the server-action path only; the REST path and the hidden-window reveal are dead |
| Electron `net.request` reveal via hidden webview | Plain `fetch` with the Ory session cookie | `a58e3e3e8` | `humble_reveal_post` is unused in production |
| `@shockpkg/icon-encoder` + sips | `icns` + `image` | this phase (D-13) | Drops a macOS-only spawn |
| JS timers/handles with `unref()` | Rust Registrant + token | 83 | New work follows the Rust shutdown contract |

**Deprecated/outdated:** the `ico` crate row in STACK.md (D-12 keeps PowerShell); `GAMELIB_*` migration flags (D-15).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | reqwest/rustls (ring, HTTP/1.1) is accepted by Cloudflare for the Humble Next.js endpoints as Node's fetch is today | Pitfall 3 | Sync or reveal fails on the signed build; fallback = keep hidden-window reveal, or a different TLS stack; only the live gate can tell |
| A2 | `icns` 0.5.0 with only `pngio` writes an `ic11` element macOS renders for a 512×512 PNG | Standard Stack | Icon missing; D-09 item 3 shows it; fallback = hand-written container |
| A3 | A console window flashes for `powershell.exe`/`reg.exe` spawned without `CREATE_NO_WINDOW` from the GUI shell | Pitfall 12 | Cosmetic on Windows; fix is cheap; confirm at Phase 99 |
| A4 | The Rust `sanitize-filename` crate diverges from the npm package in some edge cases | Alternatives | If identical, a dependency would do; hand port is safe either way |
| A5 | The sidecar's locale for `toLocaleDateString()` is en-US-like in shipped builds | Pitfall 8 | Date text differs for the user's locale; golden must record the actual process locale |
| A6 | `windowsHide` semantics = `CREATE_NO_WINDOW` | Pitfall 12 | Equivalent behaviour on Windows may need `DETACHED_PROCESS` instead |
| A7 | Windows `.lnk` removal "proof" can only be title + extension + regular file | Pitfall 10 | A user's same-named `.lnk` is removed; accept or add a marker (e.g. `Description` field) at the writer |
| A8 | `humbleRunValidation` (dev only, no UI caller) is worth porting rather than deleting | Open Question 5 | Wasted effort if nobody uses it |

## Open Questions

1. **How does the sign-in probe reach a Rust-owned Humble?** (Pitfall 2.) What we know: `pass.ts` needs sync `isLoggedIn`, async `probe`; `verdict.ts` mutates `humbleConfigStore.expired` and pushes `humbleAuthState`; Humble login/disconnect bump the TS epoch. What's unclear: whether to (a) keep a TS-visible `humbleConfigStore` mirror alive to 92 and have Rust write through it plus a Rust→TS note channel, or (b) move verdict application for Humble fully into Rust and expose one resolver. Recommendation: (b) for the flag/userData/epoch (Rust is the sole writer; no dual-writer race), a scheduled `isLoggedIn` view cache in TS updated from a Rust event, and the schedule cell for `humbleConfigStore` moved 94 → 92. Needs a user decision because it amends the ownership table.
2. **macOS icon crop: replicate the shipped centred crop or implement D-13's "0,0"?** What we know: sips centres (measured). Recommendation: replicate centred, record top-left as a todo (D-20 "copy quirks").
3. **Keep or delete `humble_reveal_post` / `humble_reveal.rs` (and the seam's `revealPost`)?** What we know: no production caller [VERIFIED: grep `revealPost` over `src` finds only the seam, adapter comments and tests]. Recommendation: keep until the D-08 live reveal passes, then delete in the gate-closing plan (reduces the Cloudflare risk to a recoverable one). `humble_login_clear_storage` is **used** (disconnect) and stays.
4. **`processShortcut`:** relocate to `appShellFlowRegistration.ts` unchanged (a scheduled survivor, deleted by 98 with the quit path) rather than port. Needs confirmation because SC4 says the shortcuts registration dies.
5. **`humbleRunValidation`:** port as a dev-only op gated on `tauri::is_dev()` or delete? No UI caller [VERIFIED: grep]. Recommendation: delete the op and `validation.ts` unless the operator uses it (D-06 lists `validation` for port; ask).
6. **Crate shape:** one `gamelib-humble` or split `-adapter`? Recommendation: one crate; classify/dedup/title are internal modules.
7. **A `-cli` for Humble?** Only if the D-05 real-capture recorder or a drift check needs the Rust path headlessly; the recorder itself is TS (records the TS). Recommendation: none initially; add `gamelib-humble-cli` for the live drift/replay check if wanted (86 D-12 analog).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | TS harnesses, jest, gen scripts | ✓ | v22.23.4 | — |
| pnpm | all scripts | ✓ | 10.28.0 | — |
| cargo / rustc | crates | ✓ | 1.99.1 | — |
| `/usr/bin/sips` (macOS) | TS oracle for icon goldens only | ✓ (used this session) | system | the Rust path does not use it |
| powershell.exe / reg.exe | Windows `.lnk` and registry | ✗ (macOS host) | — | CI three-OS matrix + golden pins argv/env/stdin; live check Phase 99 |
| Signed build + Apple signing identity | D-10 signed-over-signed gate | [ASSUMED: operator machine, as 85/86 used it] | — | none for SC1 (a dev build does not count) |
| Operator's Humble account + a throwaway key | D-05 capture, D-08 | [ASSUMED] | — | none; blocks the gate |
| Mac Steam installed with a userdata dir | D-09 item 4 | [ASSUMED] | — | none |
| Network egress to humblebundle.com / Steam CDN | recorder, live gate | ✓ (not probed) | — | offline replay for CI |

**Missing dependencies with no fallback:** the operator-held items (account, throwaway key, signed build) are gate blockers, not code blockers; author the gate first (D-23).
**Missing dependencies with fallback:** Windows/Linux live checks → CI + Phase 99.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7 (TS) and `cargo test` (Rust 1.99.1) [VERIFIED: package.json, `cargo --version`] |
| Config file | `jest.config.js`, `src/backend/jest.config.js`, `src/backend/jest.setupContainment.ts` (fake-HOME containment) |
| Quick run command | `pnpm exec jest --runTestsByPath <file>` and `cd src-tauri && cargo test -p gamelib-humble` / `-p gamelib-shortcuts` |
| Full suite command | `pnpm test:ci`, `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil && cargo test -p gamelib-proc && cargo test -p gamelib-humble -p gamelib-shortcuts -p gamelib-steamfiles -p gamelib-info -p gamelib-i18n -p gamelib-core -p gamelib-store && cargo test --bin gamelib-shell`, plus `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm planning-gates` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SVC-04 | classify/dedup/title-match/alerts/app-id resolver port (pure) | Rust unit | `cargo test -p gamelib-humble classify dedup title_match expiration_alerts` | ❌ Wave 0 |
| SVC-04 | sync/reveal/mark/undo/overrides/gift/audit by golden replay (TS-recorded) | Rust golden + Jest oracle | `cargo test -p gamelib-humble --test golden_library`; TS harness | ❌ Wave 0 |
| SVC-04 | request pinning (URL/method/headers/multipart order/no-redirect) | Rust replay | `cargo test -p gamelib-humble --test http_replay` | ❌ Wave 0 |
| SVC-04 | state files round-trip byte for byte, legacy backfill, corrupt copy-aside (D-07) | Rust golden | `cargo test -p gamelib-humble --test state_roundtrip` | ❌ Wave 0 |
| SVC-04 | secrets owner: cache, 120 s memo, invalidate-before-delete, migration read-back, no value in logs | Rust unit | `cargo test -p gamelib-humble secrets` | ❌ Wave 0 |
| SVC-04 | shell wiring: native channel vectors, ownership, slice registered | Rust + Jest | `cargo test --bin gamelib-shell native_manifest_vectors humble_dispatch`; `pnpm exec jest --runTestsByPath src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts src/backend/sidecar/__tests__/rendererAllowList.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/sidecar/__tests__/ipcDomainCensus.test.ts src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts` | ✅ (existing gates) |
| SVC-04 | digest strings equal i18next | Rust + Jest | `cargo test -p gamelib-i18n`; `src/backend/__tests__/i18nGolden.test.ts` | ✅ extend |
| SVC-05 | `run.sh`/`Info.plist`/`.desktop` byte-identical incl. hostile names | Rust golden | `cargo test -p gamelib-shortcuts --test golden_text` | ❌ Wave 0 |
| SVC-05 | icns decodable `ic11` 512×512; iconless omits `CFBundleIconFile` | Rust test | `cargo test -p gamelib-shortcuts icns` | ❌ Wave 0 |
| SVC-05 | `.lnk` argv/env/stdin/timeout; reg query parse; icon chain | Rust golden | `cargo test -p gamelib-shortcuts --test golden_windows` (three-OS CI) | ❌ Wave 0 |
| SVC-05 | removal proof / refuse on unknown; symlink Desktop item | Rust test (FakeHome) | `cargo test -p gamelib-shortcuts remove` | ❌ Wave 0 |
| SVC-05 | add/remove to Steam: ids (CRC32), entry fields, atomic vdf, grid art | Rust golden | `cargo test -p gamelib-shortcuts --test golden_steam` | ❌ Wave 0 |
| both | deletion gates + schedule | Jest | `humblePortComplete.test.ts`, `shortcutsPortComplete.test.ts`, `humbleShortcutsShimSchedule.test.ts`, `storeMirrorSchedule.test.ts`, `infoShimSchedule.test.ts`, `longRunningChannels.test.ts` | ❌ new / ✅ amend |

### Sampling Rate
- **Per task commit:** the task's crate tests + `npx prettier --check` over the exact written paths (check `--file-info` first; `.planning` and `public/locales` are ignored, so omit the check there)
- **Per wave merge:** rebase on main, `pnpm gen:ipc-contract` then `pnpm check:ipc-contract`, the full suite above on macOS, push for the three-OS CI legs
- **Phase gate:** full suite green + CI three-OS green + the signed-over-signed live gate (D-10) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] TS golden harness for Humble (fake-HOME, `fixtures/tpks.ts`, `steamGames.ts`) emitting goldens; the wire-level recorder and one operator-redacted real capture (redaction check as a permanent test)
- [ ] TS golden harness for shortcuts: text outputs per OS, hostile names, `sanitize` vectors, icon chain, `.lnk` env/stdin, Steam entry/ids; sips icon geometry vectors
- [ ] `src-tauri/crates/gamelib-humble` and `gamelib-shortcuts` scaffolds, `Cargo.lock` names in `cargoFeatures.test.ts`, `rust-test.yml` `-p` entries
- [ ] Phase 82 D-05 vacuous-pass guards on every golden (fixture-count floor; empty input fails)
- [ ] `gamelib-proc` hide-window flag; `genI18nGolden.ts` cases for Humble and shortcut keys
- [ ] The live gate file authored before code (D-23), with the Structural Reachability Review (spike skill `live-gate-contract-authoring.md`: the authoring plan may not run it) and named log lines emitted by the Rust path (`[Shell]` vs crate diagnostics sinks differ)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Session cookie from the login webview, validated by `session-status` before it is stored; never logged |
| V3 Session Management | yes | Cookie only in Keychain slots `humble-session`/`humble-csrf`; invalidate cache before delete; disconnect clears the webview jar (existing `humble_login_clear_*`) |
| V4 Access Control | yes | Server-side re-validation in the handler of `humbleSetOwnershipOverride` (fuzzy only), `humbleRecordGiftLinkOpened` (owned elsewhere + UNREVEALED), C2 owned-elsewhere block in reveal; renderer is never trusted |
| V5 Input Validation | yes | serde `deny_unknown_fields` structs, `nativeChannels.json` valid/invalid vectors, `maxLength`; fixed `…:bad-args` errors that never echo input |
| V6 Cryptography | no new crypto | Keychain only; MD5/SHA not used for security |
| V8 Data Protection | yes | `humble_revealed`/key values: C4 narrow exposure, `humbleGetRevealedKeyValue` is the only value-bearing channel; logs carry statuses and counts only |
| V12 Files | yes | Shortcut writes only under resolved roots; removal needs creation proof (D-22); symlinks unlinked not followed; `run.sh` quoting (T-34.5-C6-17) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection through a game title/appName in `run.sh` | Tampering/EoP | Double-quoted exe, single-quoted percent-encoded URL, byte-identical goldens with `;`, `$()`, backticks, quotes |
| Script injection into PowerShell | EoP | Constant script on stdin, every value via `$env:` (data, never code) |
| Secret in a log/upload (`gamelib.log` is uploaded to a public paste) | Information disclosure | Category-only logs; `shellLogCategoryOnly` gate scope; no URL/cookie/body in `Http` errors (copy `map_error`) |
| Removing a user's own `.app`/file | Tampering/Denial | Creation proof + refuse on unknown (D-22) |
| Real Keychain touched from a `-cli` or test | Information disclosure | `SecretSource` env/memory implementations only in tests and CLIs (85 D-14) |
| Redirect to an attacker host carrying the cookie | Information disclosure | No redirects; fixed host allow-list (`www.humblebundle.com`, `store.steampowered.com`) |
| Recorded real capture leaks identifiers into git | Information disclosure | Redaction + a permanent test that scans fixtures for gamekeys, cookies, CSRF, email, account name |

## Runtime State Inventory

(Not a rename/migration phase, but the port moves ownership of live user state; recorded because D-07 is one-way.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 11 Humble store files + `timestamp` (read) + `steam_library`/`steamConfigStore` (read) + settings doc | Rust reads/writes through StoreHost byte-identically; goldens; corrupt = copy aside |
| Live service config | Humble session lives in the Keychain and the WKWebView cookie jar (outside git) | No change of slot names; reconnect/disconnect parity |
| OS-registered state | Existing shortcuts on disk from prior builds: `~/Applications/*.app`, `~/Desktop/*.app` symlinks, `.desktop`, `.lnk`, Steam `shortcuts.vdf` entries | New builds must find and remove what old builds wrote (same sanitized names; `shortcutsExists` parity) |
| Secrets/env vars | `humble-session`, `humble-csrf` (Keychain), dev vault slots in `<temp>/gamelib-dev-secret-vault.json`, `GAMELIB_DEV_SECRET_VAULT`, `GAMELIB_SHELL_EXE` | Port dev-vault Humble slots (86 D-26); shell exe path source unchanged |
| Build artifacts | Sidecar bundle contains the deleted TS; `package.json` deps `@shockpkg/icon-encoder`, `sanitize-filename` (check other users first), `fastest-levenshtein` (**stays**: `common/matching/titleMatch.ts`) | Drop only dependencies with no remaining importer (knip); keep the packages-that-must-stay assertion in the gate |

## Sources

### Primary (HIGH confidence — read in this session)
- `.planning/phases/94-humble-bundle-and-shortcuts/94-CONTEXT.md`, `.planning/REQUIREMENTS-v0.11.md`, `.planning/phases/86-pure-leaf-services/86-CONTEXT.md`, `87-CONTEXT.md` (D-15, D-22–D-25)
- `src/backend/humble/{adapter,user,library,expirationAlerts,constants,index,stores,steamAppIdResolver,userAgent}.ts`, `src/backend/sidecar/{humbleFlowRegistration,humbleLoginFlowRegistration,humbleSecretStore,keyringTokenStore,shortcutsFlowRegistration,knownFolders,nativeImageShim}.ts`
- `src/backend/shortcuts/{shortcuts/*,nonesteamgame/*,utils}.ts`, `src/backend/signInProbe/{verdict,pass,sessionEpoch,outcomes}.ts`, `src/backend/__tests__/{storeMirrorSchedule,infoShimSchedule,longRunningChannels}.test.ts`
- `src-tauri/crates/README.md`, `gamelib-info/{Cargo.toml,src/lib.rs,src/ctx.rs,src/http.rs,src/secrets.rs}`, `gamelib-core/src/process.rs`, `gamelib-i18n/src/lib.rs`, `src-tauri/src/{info_dispatch,info_secrets,keyring_dispatch,native_router,sidecar}.rs`, `src/common/types/ipc/{nativeChannels.json,humble.ts,humbleLogin.ts,shortcuts.ts}`
- `.claude/skills/gamelib-conventions/SKILL.md`, `.claude/skills/spike-findings-gamelib/references/{tauri-login-webview-cookies,live-gate-contract-authoring}.md`
- Tool runs: `gsd-tools package-legitimacy check --ecosystem crates`, `cargo info icns`, `cargo tree -i image`, `sips` experiment, `rustc/cargo --version`

### Secondary (MEDIUM confidence)
- `.planning/research/v0.11/{STACK,FEATURES,ARCHITECTURE,PITFALLS}.md` (STACK `icns`/`image`/`crc32fast`; its `ico` and `cookies` rows are superseded by D-12 and this research)
- 86 plan list (`86-01…27-PLAN.md` objectives) as the analog for plan decomposition

### Tertiary (LOW confidence)
- None used as authority; Cloudflare behaviour and Windows console-window behaviour are `[ASSUMED]` (A1, A3).

## Recommended plan shape (analog: Phase 86's 27 plans; expect ~28–34)

0. **Checkpoint plan:** rebase on main, re-read shipped StoreHost/`Http`/native-router/`ProcSpec` APIs against what plans assume; amend `82-STATE-OWNERSHIP.md` (`humble-services` login-seam row, `timestampStore` 94→88, `humbleConfigStore` per Open Question 1, `umu`/wiki callers) and `storeMirrorSchedule`/`infoShimSchedule` rows together.
1. **Gate-authoring plan:** the live macOS gate (D-09/D-10) with the Structural Reachability Review, authored before code, run by a different plan last.
2. **Oracle plans (before any Rust for the slice):** Humble TS golden harness (fixtures + state files incl. legacy backfill), wire-level recorder + redaction check + operator capture; shortcuts TS golden harness; delete-gate/schedule machinery.
3. **Scaffold:** two crates, `Http` seam (redirect switch, multipart), `Ctx`, `OPS`, shell `*_dispatch.rs`, CI/lockfile names, `hide_window` on `ProcSpec`.
4. **Shortcuts first** (fewest shared-file edits, stateless): paths+sanitize, text writers, icns, Linux, Windows chain + PowerShell, removal proof, Steam add/remove + grid art, resolver registrations + shims + schedule rows, delete TS.
5. **Humble pure logic:** classify, dedup + title-match twin, alerts (+ i18n cases), user agent, app-id resolver.
6. **Humble stateful:** stores/byte round-trip, secrets owner + migration + dev vault, adapter + library sync + reveal + mark/undo + overrides, login watch + probe + disconnect, events, cross-boundary resolvers (Open Question 1), native channels per group, delete TS and registrations.
7. **Closing plans:** delete gates (`humblePortComplete`, `shortcutsPortComplete`), SC4 sweep, relocate `loginWindowSeam` (+ its install call), prune deps, todos for every quirk, signed build, gate run, STATE fold-in at merge.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for reuse of in-tree crates and seams; MEDIUM for `icns` (MSRV, A2)
- Architecture: MEDIUM-HIGH; the Humble↔signInProbe seam (Open Question 1) and `processShortcut` are the open design points
- Pitfalls: HIGH for items verified against source; MEDIUM for A1/A3 (cannot be proven offline)

**Research date:** 2026-11-24
**Valid until:** 2026-12-08 (fast-moving: Phase 87 is landing shared files in main daily; Humble's site changed in 2026-11 and may change again)
