# Phase 49: Cross-store signed-out / offline mode - Research

**Researched:** 2026-10-08
**Domain:** Sidecar boot-time auth probing (Node sidecar under Tauri), per-store session-expiry detection via CLI runners (legendary / gogdl / nile), OS-keyring reads (Steam, Humble), renderer notice + Manage Accounts routing, 49-locale i18n
**Confidence:** MEDIUM-HIGH. All in-repo wiring is HIGH (files opened this session). The three runner classifications (Epic / GOG / Amazon) are MEDIUM: derived from runner source at the pinned tags, but never exercised against a real expired account from this Windows box. They need a live gate on the operator's Mac (see Open Questions).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Probe pass: bound and concurrency**

- **D-01:** Every store's probe bound is **45 s**, one value for all five. That is exactly the Rust `KEYRING_READ_TIMEOUT` (`src-tauri/src/main.rs:3079`, `Duration::from_secs(45)`), which is the floor the SPEC's "no shorter than the bounded `keyring_get` timeout" constraint (REQ-34.4.1-GAP-11) names. A Keychain prompt that is ignored therefore degrades its store to `unknown` at the same moment the keyring read itself gives up. The sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS` (`src/backend/sidecar/sidecarRpc.ts:60`) is the ceiling, not the bound. Name the constant once; the R3 boundary test reads it rather than a literal. **Reversibility:** reversible — one constant.
- **D-02:** The five probes run **in parallel**: one 45 s window for the whole pass, not five sequential windows. Keychain prompts queue at the OS level anyway, and a signed release build prompts at most once per slot, so prompt stacking is a dev-build concern only. The pass is "complete" when every probe has resolved or the bound has elapsed, whichever is first per store.
- **D-03:** Within one launch the pass re-runs **only on a connectivity transition** (the online monitor flipping back to `online`). No re-run on sign-in, on a deliberate Steam trigger, on Library mount, or on a timer. This is the SPEC's "at most one pass per connectivity transition, passes never overlap" read literally, and it keeps the sidecar exit contract to a single bounded timer per probe. A successful sign-in clears that store's expired flag at the proven-present site (R2); it does not need the pass to notice.
- **D-04:** **No dev special-casing.** The pass has one code path on every platform and build. Dev-build Keychain prompts under an ad-hoc signature are addressed by `GAMELIB_DEV_SECRET_VAULT=1` (`src/backend/sidecar/devSecretVault.ts`), which serves the slots from the vault with no Keychain read. No env var disables the pass; no branch skips the keyring stores when the vault is off.

**State shape and selector home**

- **D-05:** The new Epic, GOG and Amazon expired flags live in **per-store config stores**, mirroring `steamConfigStore.credentialsMissing` and `humbleConfigStore.expired`: an `expired` key on `gogConfigStore` and `nileConfigStore`, plus a **new small legendary-side config store** for Epic, which today has no store at all (its logged-in check is `existsSync` on `legendaryUserInfo`). Each new key is one line in `STORE_ALLOWLIST` (`src/common/types/storePolicy.ts`) and one case in `storePolicy.test.ts`. The single `signInStateStore` alternative was rejected because Steam and Humble would then have two sources of truth. **Reversibility:** costly — three persisted keys and one new store file become part of the on-disk config shape; moving them later means a migration like `focusRowMigration.ts`.
- **D-06:** The pure four-value selector lives in **`src/common`**, one module consumed by the bootstrap pass, the Manage Accounts tiles (`Login/index.tsx`, replacing `steamTileState.ts`'s Steam-only `isSteamConnected`) and the Library notice. The R7 parity test then pins that both surfaces call the same function. Backend-computes-and-pushes-state was rejected because the state would become an event rather than a derivation.
- **D-07:** **A latched expired flag beats a pending or `unknown` probe.** Input tuple rule for the selector: `expired` flag set → `expired`, regardless of whether this launch's probe is still running, timed out, was denied or was offline. `unknown` applies only to a store whose logged-in flag is set and which has **no latched verdict** and whose probe is pending or returned `unknown`. Consequences the planner must carry: the row for a known-expired store shows at boot before the pass finishes; a Keychain denial never hides a proven expiry; a row never vanishes mid-session without a user action or a healthy probe. `not-connected` is the logged-in flag being false and needs no probe at all.
- **D-08:** This launch's probe outcomes reach the renderer as **one pushed message carrying a per-store outcome map** (`sendFrontendMessage`, the channel `humbleAuthState` already uses), kept in sidecar memory, sent when the pass completes and again after each connectivity re-run. Nothing new is persisted beyond the expired flags, so a restart resets every outcome to pending by construction. The renderer stores the map in `GlobalState` and feeds it to the D-06 selector.

**Notice component, dismiss, strings**

- **D-09:** The notice is a **new `LibrarySignInNotice` component** beside `SteamSyncNotice`, not a generalisation of it. It inherits `SteamSyncNotice`'s structural contract verbatim: one `<div>` in normal document flow, never `position: absolute/fixed`, never an early return that replaces siblings, so it can never cover the grid (the 34.15 defect 2b rule). It reuses the same CSS family. `SteamSyncNotice` keeps `syncing` and `failed` only; its `signedOut` mode and the `signedOut` branch of `resolveSteamSyncIndicator` are deleted (R4). The row-list decision is a pure module beside `librarySyncIndicator.ts` with the same no-jsdom rationale.
- **D-10:** The per-store dismissed set persists as a **`GlobalConfig` AppSettings key** (an array of runner names, e.g. `dismissedSignInNotices`), the same home Phase 48 gave `focusRow` (`src/common/types.ts:155`, `src/backend/config.ts`). The pass writes only per-store config stores and never touches AppSettings, which is what makes the SPEC's held-out backstop test (a dismiss persisted during a running pass survives) structurally true rather than racy. Re-arm on the connected→expired transition (R5) is a removal from this array at the proven-present site. **Reversibility:** costly — a persisted settings key; removing it later needs the same retired-setting handling `libraryTopSection` got in 48-05.
- **D-11:** **Two visual weights, one layout.** `expired` rows use the existing warning styling with the `faExclamationTriangle` icon and a Reconnect-flavoured Sign in; `not-connected` rows are neutral — store icon, plain text of the shape "GOG is not connected", Sign in, and the dismiss control. One row component with a `kind` prop that picks the class. This is the concrete form of prohibition P4 (a never-connected row must not read as an error).
- **D-12:** i18n keys for the notice live under **`gamelib:library.signIn.*`**, beside the `library.steamSync.*` keys this notice partly replaces. The three new tile strings (Epic, GOG, Amazon expired/Reconnect) live under the existing **`gamelib:login.*`** namespace next to `login.steamReconnect`. Store names enter every string through an interpolation variable (R9). All 49 `gamelib.json` catalogues, 48 `gamelib.mt.json` stamps, `translation.json` untouched — `48-01-PLAN.md` is the worked example.

**Sign in routing and Steam trigger**

- **D-13:** A row's Sign in navigates to **`/login?open=<runner>`** (query param via `useSearchParams`). The Manage Accounts mount effect reads the param, calls the existing `openLoginOverlay` for that runner **once**, and clears the param from the URL so back navigation or a repeat visit does not reopen the overlay (R6 idempotency). Navigation state and a path segment were rejected: state is invisible to URL-rendered tests and lost on refresh; a path segment changes the route definition every existing `navigate('/login')` caller depends on.
- **D-14:** The new Steam auth trigger is **`'boot-probe'`**, added to `SteamAuthTrigger` and to `DELIBERATE_TRIGGERS` in `src/backend/storeManagers/steam/authTrigger.ts`, with the **sticky unlock** every deliberate trigger has. Reusing `'user-refresh'` was rejected because the `trigger=` label exists to measure which action caused a keyring read, and a boot read is not a user refresh. A non-sticky variant was rejected because it adds a third gate state to a module built around two, to preserve a deferral (260817-d61) the SPEC has already reversed. The plan records the reversal explicitly, as the SPEC's constraint requires.
- **D-15:** Humble's keyring reads during the pass carry a **`trigger=boot-probe` label** too. Thread an optional trigger string through the Humble slot read (`src/backend/sidecar/humbleSecretStore.ts` / `keyringTokenStore.ts`) so the log line no longer reads `trigger=unspecified` — **without** importing the Steam gate module, which the folded todo explicitly asked for. The Steam gate stays Steam-only.
- **D-16:** `GlobalState.tsx:1669-1671` currently runs `humbleCheckHealth().then(humbleSync)` on mount. The **health call is removed from the renderer** (folded into the pass, R3); the **`humbleSync` call stays on mount** unchanged. The pass never triggers library sync for any store. Humble's sync keeps its own 401 handling, so it still latches expiry if it runs before the probe lands.

### Claude's Discretion

- What each HTTP-store probe actually calls (legendary / gogdl / nile invocation or a direct token endpoint), subject to the SPEC's rule that only an authentication failure is a verdict and the fake-HOME isolation convention for any spawned child.
- The exact shape of the pushed outcome message and its `common/types/ipc` name.
- The `common` selector's module and function names, and how `steamTileState.ts` is retired.
- Exact wording of the row strings within D-11's tone rule.
- How the probe's `unref()`'d bound timer and the per-store promise race are structured, within the sidecar exit contract.

### Deferred Ideas (OUT OF SCOPE)

- `.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md` — the store webview's Sign in button. Out of scope: the SPEC excludes the webview `LoginWarning` path, and the todo is itself blocked because `/store/epic` is gated off the embed.
- Out of scope per SPEC: `OfflineMessage` / `online_monitor.ts` changes, Zoom, console mode, `HumbleExpiryToast`, the webview `LoginWarning`, removing Epic's launch-time "credentials expired" stderr modal, redesigning the `Runner` tile beyond the expired state, any new OS notification, macOS signing and notarization.

**Folded todo (in scope):** `.planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` — the plan that lands R3 must set `resolves_phase: 49` on it and close it.
</user_constraints>

<phase_requirements>
## Phase Requirements

No REQ-IDs are minted in REQUIREMENTS.md for this phase. The SPEC's numbered requirements are the IDs (49-SPEC.md `## Requirements`).

| ID | Description | Research Support |
|----|-------------|------------------|
| R1 | Four-value per-store sign-in state (`connected`/`not-connected`/`expired`/`unknown`), pure selector, flags allow-listed | §Pattern 2 (selector rule table), §Persistence (allow-list + new store touch-points), Pitfall 3 (Epic precedence) |
| R2 | Expiry probe + persisted expired flag for Epic, GOG, Amazon | §Probe Discretion Answers 1a/1b/1c with branch tables, Pitfalls 1, 2, 5, 6 |
| R3 | One bounded boot pass after READY and once online, folded Humble health, Steam via `authTrigger` | §Bootstrap pass shape, §Steam read path, §Humble read path, Pitfalls 4, 8, 9, 10, 11 |
| R4 | Library sign-in notice, pure row module, `signedOut` removed | §Library notice, Pitfall 13 |
| R5 | Per-store persisted dismiss on `not-connected` rows | §AppSettings recipe, Pattern 5 |
| R6 | Sign in routes to Manage Accounts with overlay pre-opened | §Manage Accounts routing |
| R7 | Epic/GOG/Amazon expired tiles, one selector for tile + notice | §Tiles, Pattern 2 |
| R8 | Signed-out stays playable; Epic launches `--offline` when expired and `canRunOffline` | §Epic offline launch |
| R9 | Strings in all 49 catalogues, stamped | §i18n recipe, Pitfall 12 |
</phase_requirements>

## Summary

The phase is mostly wiring, but six findings from reading the code change the shape of the plan and contradict premises in CONTEXT. The planner should treat these as locked-in facts, not options:

1. **Nothing in the repo can currently distinguish an Epic/GOG/Amazon auth failure from a network failure through the normal runner path.** `callRunner` (`launcher.ts:1650`) throws away the child's stderr whenever the exit code is non-zero (it substitutes `Process exited with code N`), runs the modal-raising `errorHandler` on every close, and de-duplicates identical in-flight commands so a second caller's `onOutput` never fires. The probe therefore needs a small, deliberate extension of `callRunner`/`CallRunnerOptions` (capture via `onOutput`, a `skipErrorHandler` option, single-flight awareness). This is the single biggest hidden cost in the phase.
2. **Legendary deletes `user.json` itself the moment it sees an invalid refresh token.** So after the Epic probe proves expiry, `LegendaryUser.isLoggedIn()` flips to `false`. The selector must therefore let a latched `expired` flag win over `loggedIn=false` (otherwise a proven-expired Epic reads `not-connected`, gets a dismiss button, and the "Reconnect" promise is lost).
3. **Amazon (`nile 1.2.0`) has no cheap auth check.** `nile auth --status` is local-only and never refreshes. A token refresh only happens inside `library sync`, `install`, `list-updates`, `import` and `auth --logout`, and only when the access token is already expired. The least-bad probe is `nile list-updates --json` (already used by the app). It is the weakest of the three and needs a live gate.
4. **GOG (`gogdl v1.3.0`) cannot separate a 4xx refresh failure from a 5xx one.** `gogdl auth` prints `null` for any non-OK refresh response with no log line; only a connection error logs `Failed to refresh credentials`. The honest verdict rule is "stdout `null` AND no connection-error line", with a documented residual: an auth.gog.com 5xx during the probe reads as expired until the next healthy probe or sign-in.
5. **CONTEXT D-16's premise is wrong.** Humble's library sync does **not** latch expiry. Both `session_expired` branches in `humble/library.ts` (`:1014`, `:1137`) return `{ status: 'failed' }` with the comment "Phase 10 owns expiry". Only `checkHealthAndFlagExpiry()` ever sets `humbleConfigStore.expired=true` (`humble/user.ts:778`). After D-16 the pass is the only latch site.
6. **D-14's sticky unlock removes the Steam deferral for the whole session**, including `SteamLibraryManager.refresh()`'s own gate (`steam/library.ts:921`), which will then CM-connect on any later automatic refresh. The pass itself must read the keyring only (`readTokenOutcome`), never `ensureConnected()`, or boot will open a Steam CM connection on every launch.

**Primary recommendation:** Build one new backend module family `src/backend/signInProbe/` (pure classifiers + a bounded single-flight pass + session-epoch fence), one pure selector `src/common/signInState.ts`, one pure notice-row module beside `librarySyncIndicator.ts`, and one `LibrarySignInNotice` component. Probe Epic with `legendary status --json`, GOG by classifying `gogdl auth` output inside `GOGUser.getCredentials`'s single spawn site, Amazon with `nile list-updates --json`, Steam and Humble with the existing slot-store `readToken(context)` outcome. Capture child output through `onOutput` with a new `skipErrorHandler` option, abort the child when the 45 s bound elapses, and make every verdict flow through one place that checks a per-store session epoch before latching.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Expiry probing (spawn runners, read keyring) | Sidecar (Node backend) | Rust shell (`keyring_get`) | Only the sidecar holds the runner binaries and the store config; keyring access is a Rust invoke |
| Persisted expired flags | Sidecar config stores | Renderer snapshot (read-only, via STORE_CHANGED_CHANNEL) | D-05; flags survive restart, renderer only reads |
| Per-launch probe outcomes | Sidecar memory | Renderer `GlobalState` (copy) | D-08; never persisted |
| Four-value state derivation | `src/common` pure module | Called by both sidecar (optional) and renderer | D-06; derivation, not event |
| Notice row decision | Renderer pure module | Renderer component | No-jsdom rule |
| Dismissed set persistence | `GlobalConfig` AppSettings (sidecar-owned file) | Renderer `GlobalState` writer via `setSetting` | D-10; pass never writes it |
| Sign in routing | Renderer router (`/login?open=`) | `Login` screen overlay state | D-13 |
| Epic offline launch decision | Sidecar `launcher.ts` `prepareLaunch` | — | Only place that builds legendary argv |
| i18n catalogues | Static `public/locales` | Renderer `t()` | R9 |

## Standard Stack

### Core

No new external packages. Everything is in-repo or already installed. [VERIFIED: package.json:123 `"react-router-dom": "^6.30.6"` provides `useSearchParams`; `"i18next": "^22.5.1"`; jest `^29.7.0` at package.json:172]

| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| `react-router-dom` | ^6.30.6 (installed) | `useSearchParams` for `/login?open=<runner>` | Already a dependency; app uses `createHashRouter` (`App.tsx:6,231`) so the query lives inside the hash and works unchanged |
| legendary | pinned `0.21.0` | Epic probe (`status --json`) | [VERIFIED: meta/releaseTags.ts:44 `legendary: '0.21.0'`] |
| gogdl | pinned `v1.3.0` | GOG probe (`auth`) | [VERIFIED: meta/releaseTags.ts:45 `gogdl: 'v1.3.0'`] |
| nile | pinned `v1.2.0` | Amazon probe (`list-updates --json`) | [VERIFIED: meta/releaseTags.ts:46 `nile: 'v1.2.0'`] |
| `SidecarKeyringSlotStore.readToken(context?)` | in-repo | Steam + Humble keyring read with `present/absent/unreadable` | Already trigger-labelled, cached, in-flight-deduped, failure-memoised |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/backend/testUtils/fakeHomeProfile.ts` `createFakeHomeProfile()` (`:193`) | Any test that spawns a runner binary | Convention: never a hand-rolled `env` literal. The new unit tests should NOT spawn at all (they mock `runRunnerCommand`), so this applies only if a spike spawns |
| `backend/testUtils/stripSourceComments` | Source-text gates (the Frontend project has no jsdom) | READY-ordering gate, structural gates on the notice |
| `storeChangeNotifier` (`backend/storeChangeNotifier.ts`) | Sidecar `TypeCheckedStoreBackend.set/delete` already patches the renderer snapshot | Flags written by the pass reach the renderer snapshot with no extra code |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `legendary status --json` for Epic | Read `refresh_expires_at` from `user.json` locally | [VERIFIED: 35-LIVE-GATE.md:1344 `refresh_expires_at` 2027-08-30] shows a ~1-year refresh lifetime, so a clock check almost never fires and cannot see server-side revocation (password change). It also trusts the local clock. Rejected as the verdict; acceptable only as a cheap pre-filter |
| `legendary auth` | — | Rejected outright. With stale creds it falls through to the interactive login flow (`cli.py auth`: after `InvalidCredentialsError` / `False` it continues "with login..."). Never run it as a probe |
| Direct `oauth/verify` HTTP call for Epic | — | Rejected. Needs a non-expired access token (an 8h token), and refreshing it ourselves would rotate the refresh token legendary stores |
| `nile library sync` for Amazon | `nile list-updates --json` | `library sync` is a full library fetch, forbidden by D-16 ("the pass never triggers library sync for any store") |
| `SteamUser.ensureConnected()` for Steam | `readTokenOutcome(getTokenStore(), 'boot-probe')` | `ensureConnected` opens a CM connection (up to ~15 s + 20 s grace, `steam/user.ts:229-274`). Not a probe |

**Installation:** none.

**Version verification:** runner tags above were read from `meta/releaseTags.ts` this session, and the runner source strings were fetched at the matching tags (`legendary-gl/legendary@0.21.0`, `heroic-gogdl@v1.3.0`, `imLinguin/nile@v1.2.0`). No npm packages added, so no `npm view` step.

## Package Legitimacy Audit

No external packages are installed by this phase. Nothing to audit. **Packages removed due to SLOP verdict:** none. **Packages flagged SUS:** none.

## Architecture Patterns

### System Architecture Diagram

```
                        SIDECAR (Node)                                   RENDERER
                                                                       
 init() ──► ... Blocks A-H ... ──► output.write(READY) ──► startSignInProbePass()   (sync part: register listener only)
                                                              │
        online_monitor.setStatus('online')  ──emit 'online'──►│  (also fires on repeat 'online' with no prior offline!)
                                                              ▼
                                              gate: prev status != 'online' ?  and no pass in flight ?
                                                              │ yes
                                                              ▼
                              ┌────────────── runPass() ── one 45 s window, five parallel probes ──────────────┐
                              │ for each store: loggedIn flag false -> SKIP (no probe, no read)                 │
                              │                                                                                 │
                              │ Epic   ─► runRunnerCommand(status --json, onOutput capture, skipErrorHandler)   │
                              │ GOG    ─► GOGUser.getCredentials() single spawn site classifies stdout+stderr    │
                              │ Amazon ─► runRunnerCommand(list-updates --json, onOutput capture)                │
                              │ Steam  ─► noteSteamAuthTrigger('boot-probe'); readTokenOutcome(store,'boot-probe')│
                              │ Humble ─► HumbleUser.checkHealth (session slot read 'boot-probe' -> getGamekeys) │
                              │                                                                                 │
                              │ each: Promise.race(probe, unref'd 45 s timer)  [+ callAbortController on bound] │
                              │ verdict ∈ healthy | expired | unknown   (auth failure only -> expired)          │
                              └──────────┬──────────────────────────────────────────────────────────────────────┘
                                         │ session-epoch check, then:
                         expired ─► store.set('expired', true)  (write-if-changed)  ─► STORE_CHANGED push (snapshot patch)
                         healthy ─► store.delete('expired')
                         unknown ─► no write
                                         │
                                         ▼
                      sendFrontendMessage('signInProbeOutcomes', { outcomes })  ─────────────────────►  GlobalState.setState
                      addHandler('get-signin-probe-outcomes')  ◄───── pull on mount (push may precede listener) ──┘
                                                                                                                   │
                                                          selector(loggedIn, expiredFlag, outcome) ◄───────────────┤
                                                                   │ same pure fn                                  │
                                              ┌────────────────────┴───────────────┐                              │
                                              ▼                                    ▼                              │
                                   LibrarySignInNotice rows               Login tiles (5 stores)                  │
                                   (expired | not-connected & !dismissed)  (expired -> Reconnect)                 │
                                              │ Sign in                                                           │
                                              └──► navigate('/login?open=<runner>') ──► Login consumes ?open once, openLoginOverlay(runner), clears param
```

### Recommended Project Structure

```
src/common/
├── signInState.ts                 # pure selector + SignInStore/SignInProbeOutcome/SignInState types (D-06)
└── signInDismissal.ts             # pure dismiss/re-arm helpers (idempotent add, prune-on-expired)
src/backend/signInProbe/
├── classify.ts                    # PURE: classifyLegendaryStatus / classifyGogdlAuth / classifyNileOutput
├── pass.ts                        # bounded single-flight pass, connectivity re-run, outcome map
├── sessionEpoch.ts                # per-store epoch fence (bump on login/logout; probe refuses to latch if moved)
└── __tests__/
src/backend/storeManagers/legendary/electronStores.ts   # + legendaryConfigStore (new TypeCheckedStoreBackend)
src/frontend/screens/Library/
├── librarySignInRows.ts           # pure row-list decision (no jsdom)
└── components/LibrarySignInNotice/{index.tsx,index.scss}
src/frontend/screens/Login/
└── loginOpenParam.ts              # pure ?open= resolver + consume-once reducer
```

### Pattern 1: Probe outcome and the "only an authentication failure is a verdict" rule

**What:** every probe returns exactly one of three outcomes; only one branch per runner maps to `expired`.

```ts
// Proposed names (Claude's discretion). Values below are NEW, not repo claims.
export type SignInProbeOutcome = 'healthy' | 'expired' | 'unknown'
```

**When to use:** classifiers are pure functions over `{ exitCode, output, aborted }` so the P1 negative is table-testable without spawning anything.

### Pattern 2: The selector rule table (D-07, resolved)

Inputs: `loggedIn: boolean`, `expiredFlag: boolean`, `outcome: SignInProbeOutcome | undefined` (undefined = pending this launch).

| # | Condition (first match wins) | State |
|---|------------------------------|-------|
| 1 | `expiredFlag` | `expired` |
| 2 | `!loggedIn` | `not-connected` |
| 3 | `outcome === 'healthy'` | `connected` |
| 4 | anything else (`unknown`, pending, `expired` outcome without a flag) | `unknown` |

Rule 1 before rule 2 is a **research addition to D-07** (see Pitfall 3). D-07 says "`not-connected` is the logged-in flag being false" but also "`expired` flag set → `expired`, regardless"; the two collide for Epic, because legendary deletes `user.json`. Order the rows as above and have logout clear the flag.

Tiles must render `unknown` as "Connected" (today's tiles show "Connected" from flags alone; rendering `unknown` as a warning would regress every offline launch). Only the notice treats `unknown` as "no row".

The `loggedIn` input per store should reuse the gates the tiles and `makeLibrary` already use, so the parity test in `connectedStoresParity.test.ts` stays meaningful: Epic `Boolean(epic.username)`, GOG `Boolean(gog.username)`, Amazon `Boolean(amazon.user_id)`, Humble `Boolean(humble?.isLoggedIn)`, Steam `Boolean(steam?.username)` [VERIFIED: Login/index.tsx:126-131,141-142,155-157 and `connectedStoresParity.test.ts` `SHOW_LOCAL_TO_STORE`].

### Pattern 3: Bounded probe with a deterministic boundary

The bound must be a hard "verdict only if elapsed < BOUND" check, not a bare `Promise.race`, so the SPEC's "at or after the bound yields `unknown`; just before yields its verdict" is deterministic under fake timers (a probe resolving in the same tick as the timer is otherwise order-dependent).

```ts
export const SIGN_IN_PROBE_BOUND_MS = 45_000 // D-01; the R3 boundary test imports this

async function boundedProbe(run: (signal: AbortSignal) => Promise<SignInProbeOutcome>): Promise<SignInProbeOutcome> {
  const started = Date.now()
  const ac = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const bound = new Promise<'unknown'>((resolve) => {
    timer = setTimeout(() => { ac.abort(); resolve('unknown') }, SIGN_IN_PROBE_BOUND_MS)
    timer.unref?.() // optional call: jest fake timers are not required to implement unref
  })
  try {
    const verdict = await Promise.race([run(ac.signal), bound])
    return Date.now() - started >= SIGN_IN_PROBE_BOUND_MS ? 'unknown' : verdict
  } catch {
    return 'unknown'
  } finally {
    if (timer) clearTimeout(timer)
  }
}
```

`unref?.()` is the dominant spelling in this repo (8 of 13 sites) [CITED: Skill gamelib-conventions, "Grep trap"]. For spawn-based probes the abort must reach the child: map the signal to `callAbortController(abortId)` (`utils/aborthandler/aborthandler.ts`), otherwise the child outlives the bound and holds the event loop open at stdin EOF.

### Pattern 4: Connectivity-gated re-run (never on repeat `online`)

`onConnectivityChange` and `runOnceWhenOnline` are the only exports [VERIFIED: online_monitor.ts:128-142]. `setStatus('online')` can fire repeatedly with no intervening `offline` (the renderer sends `connectivity-changed` and `set-connectivity-online`, `online_monitor.ts:101-125`), so the pass must keep its own `previousStatus` and run only on a **non-online → online** edge, plus once at start if already online. `onConnectivityChange` registers three permanent listeners with no remover, so register it once behind an `Initialized` flag like the other blocks.

```ts
let last: ConnectivityStatus | undefined = isOnline() ? 'online' : undefined
onConnectivityChange((status) => {
  const edge = status === 'online' && last !== 'online'
  last = status
  if (edge) requestPass()           // coalesces: at most one pending re-run while one is in flight
})
if (isOnline()) requestPass()
```

### Pattern 5: Dismiss is renderer-owned, re-arm is a pure prune

See §AppSettings recipe. `expired` rows ignore the dismissed set entirely; the set only filters `not-connected`. Re-arm = remove the runner from the array once its state is observed `expired` (idempotent, so "exactly once").

### Pattern 6: Session-epoch fence (R2 concurrency)

Copy the shape of `SidecarKeyringSlotStore.cacheEpoch` (`keyringTokenStore.ts:197-202`, T-34.5-G6-14): capture the store's epoch when the probe starts, bump it on sign-in success and sign-out, and refuse to latch `expired` if the epoch moved. Humble already has a fence (`library.ts:955` area: `HumbleUser.disconnect()` bumps it); Steam, Epic, GOG, Amazon need one.

### Anti-Patterns to Avoid

- **A second spawn site for `gogdl auth`.** Classify inside `GOGUser.getCredentials`, the one function that owns the spawn (Pitfall 2).
- **Re-probing from the renderer.** There must be no IPC invoke that starts a pass; the only new invoke is a read-only pull. That is the structural proof of P3's "Library mount triggers no probe".
- **Writing AppSettings from the pass.** D-10; also makes the held-out backstop true by construction.
- **`position: absolute/fixed` or a `Dialog` in the notice** (34.15 defect 2b; P2).
- **Reading stdout into logs.** `gogdl auth` stdout is a token exchange object. Pass `authLogSanitizer`-equivalent handling and never log captured output.

## Probe Discretion Answers (CONTEXT "Claude's Discretion" items 1a-1c)

### 1a. Epic

**Today:** `LegendaryUser.isLoggedIn()` is `existsSync(legendaryUserInfo)` [VERIFIED: `src/backend/storeManagers/legendary/user.ts:692-694` — `return existsSync(legendaryUserInfo)`]. `login()` is `user.ts:111-148` (success return at `:143-144`). `logout()` is `:150-690` with `configStore.delete('userInfo')` at `:678`. There is no validity check anywhere. The existing library refresh would never catch it at boot: `refreshLegendary` returns early when `isEpicServiceOffline()` is true, and that function's first line is `if (!isOnline()) return true` [VERIFIED: utils.ts:205], so at boot (`check-online`) it skips, once per session (35-LIVE-GATE.md D-35-19-13).

**What legendary exposes** [CITED: legendary-gl/legendary@0.21.0 `core.py` `_login`, `cli.py` `status`]:

| Call | Network? | Notes |
|------|----------|-------|
| `legendary status --offline` | no | Reads local `userdata` only. Cannot detect expiry |
| `legendary status [--json]` | yes | `core.login()` (resume via `/oauth/verify` if the access token has >10 min left, else refresh via `start_session`), then `check_for_updates(force=True)` and `get_game_list(update_assets=True)`. Not cheap, but it is the only login-only entry that is safe to run |
| `legendary auth` | yes | **Unsafe** as a probe: falls through to the interactive login flow when creds are stale |
| `legendary list` | yes | What the library refresh already uses |

**Recommended probe:** `legendary status --json`. Guard it with `LegendaryUser.isLoggedIn()` (no `user.json` → skip, `not-connected`).

**Verdict table** (strings are from `_login`; confirm against a real log in the live gate):

| Evidence | Verdict | Sets flag? |
|----------|---------|------------|
| exit 0 and stdout JSON `account` is not `<not logged in>` | `healthy` | clears |
| output contains `Stored credentials are no longer valid! Please login again.` | `expired` | **yes** |
| output contains `HTTP request for login failed:` (HTTPError / ConnectionError branch, creds NOT cleared) | `unknown` | no |
| exit 0 but `account` is `<not logged in>` | `unknown` (creds vanished mid-probe) | no |
| any other non-zero exit, timeout, abort, spawn error | `unknown` | no |

Both failure branches exit 1 with the same trailing `Log in failed!` line, so **the exit code cannot be the discriminator; the preceding log line is.**

**Consequence (confirmed):** on the `expired` branch legendary runs `lock.clear()`; `LockedJSONData.clear()` sets `_data = None` and `__exit__` then does `os.remove(self._file_path)` [CITED: legendary-gl/legendary@0.21.0 `lfs/utils.py`]. `user.json` disappears. The Epic cached library (`legendary_library`, `installed.json`) is untouched, so R8 holds. Block E's `reconcileStoreUsersWhenOnline` will delete `configStore.userInfo` on the next boot (`bootstrap.ts:464-471`), which is why the selector must put the flag ahead of `loggedIn`.

**Where the flag is cleared:** `LegendaryUser.login()` success branch (after `getUserInfo()`, `user.ts:143`), `LegendaryUser.logout()` (next to `configStore.delete('userInfo')` at `:678`), and the `healthy` branch.

**Spawn convention:** production code spawns via `runRunnerCommand`; tests mock it. The fake-HOME rule governs tests that spawn real binaries (`fakeHomeIsolation.test.ts` scans `src/` and `meta/` for hand-rolled home/config `env` literals). New code must not assign `HOME`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/`XDG_*`. Note `runRunnerCommand` already sets `LEGENDARY_CONFIG_PATH` (`legendary/library.ts:705`), which is not one of the eight variables.

### 1b. GOG

**Today:** `GOGUser.getCredentials()` is `gog/user.ts:303-341`. It returns `undefined` offline (`:304-309`), serves a TTL cache (`:312-319`), otherwise spawns `runRunnerCommand(['auth'], …)` (`:323-329`) and `JSON.parse(stdout)` (`:331`). **The refresh failure is dropped here:** a failed refresh prints `null`, `JSON.parse('null')` is `null`, `getCredentials` returns it, and `getUserDetails` then logs `"No credentials, can't get login information"` (`:241-244`) and returns. Nothing is persisted. `login()` sets `configStore.set('isLoggedIn', true)` at `:196`; `logout()` does `configStore.clear()` at `:359` (so an `expired` key on `gogConfigStore` is cleared by logout for free).

**What gogdl does** [CITED: Heroic-Games-Launcher/heroic-gogdl@v1.3.0 `gogdl/auth.py`]:

| Situation | stdout of `gogdl auth` | stderr |
|-----------|-----------------------|--------|
| Stored token not expired | credentials JSON | — |
| Expired, refresh OK | credentials JSON (rewritten with new `loginTime`) | — |
| Expired, refresh raises `ConnectionError`/`Timeout` | `null` | `Failed to refresh credentials` |
| Expired, refresh returns non-OK HTTP (any 4xx **or 5xx**) | `null` | **nothing** |
| No stored credentials entry | `null` | — |

**Recommended verdict rule** (inside `getCredentials`, the single spawn site; see Pitfall 2):

| Evidence | Verdict | Sets flag? |
|----------|---------|------------|
| parsed JSON object with `access_token` | `healthy` | clears |
| stdout `null`, output has **no** `Failed to refresh credentials`, spawn exited 0, `isOnline()` true, auth config file exists | `expired` | yes |
| stdout `null` and output contains `Failed to refresh credentials` | `unknown` | no |
| offline early return, timeout, abort, unparsable stdout, spawn error | `unknown` | no |

**Known residual:** gogdl 1.3.0 cannot separate an invalid_grant 400 from a 5xx/429 on auth.gog.com. Treating the silent-`null` as expired will mislabel a rare GOG 5xx. The flag self-heals on the next healthy probe or sign-in, the row is non-modal, and the alternative (reimplementing the refresh in Node) would rotate GOG's refresh token behind gogdl's back. **Decision needed from the operator** (Open Question 2).

**Boot interaction:** Block E already calls `GOGUser.getUserDetails()` at init, which calls `getCredentials()` and spawns `gogdl auth` once online (`bootstrap.ts:472-479`). The pass starts near-simultaneously after READY. `callRunner` joins identical in-flight commands (Pitfall 2), and a successful result populates the TTL cache so the pass's call is free; a `null` result is not cached, so the pass would spawn a second time. Measured spawn tax is 5-13 s per spawn (`gog/user.ts:105-111` comment citing `resolved/gogdl-spawn-tax.md`), well inside 45 s.

### 1c. Amazon

**Today:** `NileUser.isLoggedIn()` is `configStore.get_nodefault('userData') || false` [VERIFIED: `nile/user.ts:306-308`]. `login()` is `:199-246`, `logout()` is `:248-279` with `configStore.delete('userData')` at `:271`. There is no expiry concept.

**What nile offers** [CITED: imLinguin/nile@v1.2.0 `cli.py`, `api/authorization.py`]:

| Command | Refreshes token? | Network beyond refresh? |
|---------|------------------|-------------------------|
| `nile auth --status` | **no** (prints `{Username, LoggedIn}` from local config) | no |
| `nile auth --logout` | only if expired, then logs out | no |
| `nile library sync` | only if expired | yes (full sync) |
| `nile install` / `import` | only if expired | yes |
| `nile list-updates [--json]` | only if expired | yes (`get_versions`) |

`refresh_token()` logs `Failed to refresh the token {e}` on `ConnectionError` and `Failed to refresh the token {response}` on a non-OK response; `str(response)` is `<Response [NNN]>`, so **the HTTP status is recoverable from the log line**. It returns `None` and the command carries on with the stale token.

**Recommended probe:** `nile list-updates --json` (already used: `nile/library.ts:173-197`, which already tolerates empty stdout for "nothing installed"). Guard with `NileUser.isLoggedIn()`.

| Evidence | Verdict | Sets flag? |
|----------|---------|------------|
| no `Failed to refresh the token` line, exit 0 | `healthy` (either refreshed OK or the access token was still valid) | clears |
| `Failed to refresh the token <Response [4xx]>` where 4xx is 400/401/403 | `expired` | yes |
| `Failed to refresh the token <Response [5xx]>`, `[429]`, `[408]` | `unknown` | no |
| `Failed to refresh the token` with no `<Response [` (connection error text) | `unknown` | no |
| timeout, abort, spawn error, unparsable | `unknown` | no |

Limits to state plainly in the plan: (a) nile only attempts a refresh when the access token has expired, so a revoked refresh token is invisible until the access token ages out; at a cold boot after a long gap that is the normal case. (b) Which 4xx Amazon returns for a dead refresh token is `[ASSUMED]` (A3). (c) Whether `list-updates` exits non-zero after a failed refresh is unknown, which is why classification must come from captured output, not the exit code.

**Where the flag is cleared:** `NileUser.login()` success (after `getUserData()` returns a user, `:233-246`), `NileUser.logout()` next to `configStore.delete('userData')` (`:271`), and the `healthy` branch.

## Bootstrap Pass Shape (item 2)

**Existing facts** [VERIFIED by reading `src/backend/sidecar/bootstrap.ts`]:
- Module-level guard flags sit at `:186-257`; the pattern is `if (!xInitialized) { xInitialized = true; xWhenOnline() }` (e.g. `:1272-1275`, `:1316-1319`).
- Block E: `reconcileStoreUsersWhenOnline()` at `:460-493`, invoked `:1272-1275`. Shape: outer `try` around `runOnceWhenOnline`, inner `try` in the callback, `.catch` on the floated promise, all logging via `logWarning('[bootstrap] …', LogPrefix.Backend)`. The pass must copy these two guard layers.
- `initOnlineMonitor()` runs at `:1150-1153` behind `onlineMonitorInitialized`.
- READY is `output.write(\`${READY_SENTINEL}\n\`)` at `:1320`; `deliverStartupProtocolUrl()` at `:1325` is documented as "the LAST statement of init()".
- Block C is guarded by `process.env.JEST_WORKER_ID === undefined` (`:1239`) because `init()` is called by many suites.

**Recommended placement:** a new `startSignInProbePass()` call **immediately after the READY write at `:1320`**, before `deliverStartupProtocolUrl()`, doing only synchronous registration (connectivity listener + `setImmediate(...).unref?.()` for the first run if already online). Amend the `:1321-1325` comment so "last statement" stays true. Add a module flag `signInProbeInitialized` and a test-reset export, like the other blocks.

**Jest guard (important):** many suites call `init()` with logged-in fixtures (e.g. `bootstrapUserReconcile.test.ts` sets store users). An unguarded pass could reach a real `runRunnerCommand` spawn or a real keyring RPC. Follow Block C: skip the automatic start when `JEST_WORKER_ID` is set, and test `startSignInProbePass()` directly. Prove `init()` still calls it with the existing "by-construction source gate" idiom (`bootstrapWirings.test.ts:531-575`, which slices `init()` out of the stripped source) extended with an ordering assertion: in the stripped `init()` body, the index of `startSignInProbePass(` is greater than the index of the `READY_SENTINEL` write.

**Existing tests the plan must extend or mirror:**

| Test | Why |
|------|-----|
| `src/backend/sidecar/__tests__/bootstrapWirings.test.ts` (Test B gate, `:531-575`) | add the READY-before-pass ordering gate |
| `gogPresenceBootWire.test.ts`, `bootstrapUserReconcile.test.ts`, `playtimeQueueBootDrain.test.ts`, `rosettaBootWiring.test.ts` | the dedicated-file idiom: a virgin file gets a virgin module registry and guard flag; **banned: `expect(runOnceWhenOnline).toHaveBeenCalled()`** (vacuous). Assert on effects inside the callback |
| `src/backend/sidecar/__tests__/bootstrap.test.ts` | existing "reaches READY" cases must stay green with the jest guard |
| `meta/sidecarStartupSmoke.cjs` / `pnpm smoke:sidecar` (`package.json:79`, `test.yml:57`) | only real stdin-EOF exit gate; see Pitfall 9 |
| `src/backend/sidecar/__tests__/electronReachLedger.test.ts` | pins the count of electron-importing modules; the new module must import from `backend/platform`, never `electron` |

**Exit-contract checklist for the pass** [CITED: Skill gamelib-conventions]: one `unref?.()`'d timer per probe, cleared in `finally`; no timer for the re-run (it is event-driven); child processes aborted at the bound via `callAbortController`; Rust-invoke timers are already `unref`'d (`sidecarRpc.ts:430`); no module-level `setInterval`. There is no gate that asserts the invariant, so the unit test should spy on `setTimeout` and assert `unref` was called on every handle the pass created, as `getDefaultLegendarySavePathRefresh.test.ts` and `fakeHomeIsolation.test.ts` do for their own cases.

## Steam Read Path (item 3)

- `SteamAuthTrigger` union and `DELIBERATE_TRIGGERS` [VERIFIED: authTrigger.ts:26-47]:
  ```ts
  export type SteamAuthTrigger =
    | 'startup'
    | 'user-refresh'
    | 'game-page'
    | 'user-install'
    | 'user-play'
    | 'login'
  ```
  `DELIBERATE_TRIGGERS` is `new Set(['user-refresh','game-page','user-install','user-play','login'])`. Adding `'boot-probe'` is a one-line change to the union and the set. `ORIGIN_TO_TRIGGER` (`:54-61`) maps renderer `origin` strings and needs no change; `'boot-probe'` is a backend-only trigger and must NOT be added to that allow-list (it would let a renderer string unlock the gate).
- `readTokenOutcome(store, context?)` delegates to `store.readToken(context)` when present [VERIFIED: tokenStore.ts:118-125]; `TokenReadOutcome` is `{status:'present';token}|{status:'absent'}|{status:'unreadable';reason}` [VERIFIED: tokenStore.ts:54-57]. `unreadable` vs `absent` is already distinguished: `steam/user.ts:200-212` (unreadable, keep session) and `:213-227` (absent, `configStore.set('credentialsMissing', true)` at `:225`).
- **Do not call `ensureConnected()`** (Pitfall 8). Add a thin `SteamUser.probeCredentialPresence()`:
  1. `if (!this.isLoggedIn()) return` (skip; `not-connected`);
  2. `noteSteamAuthTrigger('boot-probe')`;
  3. `readTokenOutcome(getTokenStore(), currentTriggerLabel())`;
  4. `present` → `healthy` and `configStore.delete('credentialsMissing')`; `absent` → set `credentialsMissing` (the existing proven-absent write) and outcome `expired`; `unreadable` → `unknown`, no write.
- `credentialsMissing` clear sites that already exist: `steam/user.ts:132` (canary), `:332` (logout), `:365` (finishAuth), `:542` (QR). New healthy-probe clear is the fifth.
- The `SidecarKeyringSlotStore` already serves cached / joined / memoised reads (`keyringTokenStore.ts:341-356`, failure memo `:357+`), so P3's "no slot read more than once per store per pass" holds even if the renderer's own Steam refresh reads concurrently. Count **issued** `keyring_get` invokes (`RUST_KEYRING_GET` via `requestRustInvoke`), not calls.
- Existing tests to extend: `steam/__tests__/authTrigger.test.ts` (the sticky unlock for the new value; the `startup` non-unlock case must stay), `steam/__tests__/credentialsMissing.test.ts` (healthy-clear and unreadable-no-write branches).

## Humble Read Path (item 4)

- `HumbleUser.checkHealthAndFlagExpiry()` is `humble/user.ts:754-…`. It calls `HumbleUser.getCredentials()` (lossy `getSecret` → `''` for absent AND unreadable), `if (!cookie) return` (`:755-756`), `getGamekeys` in a try/catch that logs and returns on any throw (`:758-776`, health unknown), then on `result.status === 'session_expired'` does `configStore.set('expired', true)` (`:778`) and `sendFrontendMessage('humbleAuthState', {isLoggedIn:true, username, expired:true})` (`:780-784`). `access_denied` changes nothing (`:786-787`). On `ok` with no csrf it opens a **hidden login-window** to backfill `csrf_cookie` (`:801-…`).
- Sites that write the flag: `configStore.set('expired', true)` at `user.ts:778`, `configStore.set('expired', false)` at `user.ts:694` (finishLogin). `disconnect()` calls `configStore.clear()` at `:864`. That is every site; there is no clear on a healthy health check today.
- **Required changes for the pass:**
  1. Return an outcome instead of `void` (`healthy`/`expired`/`unknown`); existing tests only `await` it (`humble/__tests__/user.test.ts:932-1050`, `:1816-1931`), so a return value is compatible.
  2. Distinguish `unreadable` from `absent`. `HumbleSecretStore` has only `getSecret(key)` [VERIFIED: humble/secretStore.ts:85]. Add an optional `readSecret?(key, context?)` (mirroring the optional `TokenStore.readToken`) implemented in `SidecarHumbleSecretStore` as `SLOT_STORES[key].readToken(context)` (`humbleSecretStore.ts:64-67,84-86`). `unreadable` → `unknown`. `absent` → recommended `unknown` with no write (Humble has no `credentialsMissing` analogue, and inventing `expired` from an empty slot is exactly the false state 260822-vov removed).
  3. D-15 label: add optional `context` to `getSecret`/`readSecret`, `HumbleUser.getCredentials(context?)` and `getCsrfToken(context?)`, passing `'boot-probe'` from the pass. This needs no import of the Steam gate. The dev-vault store (`devSecretVault.ts:224-231`) ignores extra args.
  4. Clear `expired` on a healthy `ok` result (R2 "cleared by a healthy probe").
- **Renderer-mount call:** `GlobalState.tsx:1669-1671` is `if (this.state.humble.isLoggedIn) { void window.api.humbleCheckHealth().then(() => window.api.humbleSync()) }`. IPC chain: preload `humble.ts:6` `humbleCheckHealth = makeHandlerInvoker('humbleCheckHealth')` → `ipc.ts:359` → `sidecar/humbleFlowRegistration.ts:169-170` `ipcMain.handle('humbleCheckHealth', …)` → `ipc_handler.ts:24`. D-16 removes only the renderer call (becomes `void window.api.humbleSync()`). **Recommendation: leave the channel registered** — removing it forces edits to `humbleFlows.test.ts:152,356,383,404,475` for no behavioural gain; note it as retained-but-uncalled.
- **Hidden-window csrf backfill vs P2** (Open Question 3): P2 says "MUST NOT … open any login overlay or webview without an explicit Sign in click". The backfill opens a hidden webview via the seam at boot. Recommendation: the pass runs the session-read + `getGamekeys` verdict only, and the csrf backfill moves out of the boot path (it is opportunistic; reveal flows already tolerate a missing csrf).
- **D-16 correction:** see Summary finding 5. With the renderer health call gone, `humbleSync` runs concurrently with the pass; on an expired session it returns `{status:'failed'}` without latching. Mitigation without reopening D-16: none needed beyond accepting that the pass is the only latch site; optionally add a latch in the two `session_expired` branches of `library.ts` (`:1014`, `:1137`).

## Persistence and Allow-list (item 5)

**`STORE_ALLOWLIST` today** [VERIFIED: storePolicy.ts:118,125,134,138-143]:
```ts
gogConfigStore: ['userData', 'isLoggedIn'],
steamConfigStore: ['isLoggedIn', 'userData', 'credentialsMissing'],
nileConfigStore: ['userData'],
humbleConfigStore: ['isLoggedIn','userData','encryptionDegraded','expired'],
```
Required: `gogConfigStore` + `'expired'`, `nileConfigStore` + `'expired'`, a new `legendaryConfigStore: ['expired']`.

**Touch-points for the new legendary-side store** (the header at `storePolicy.ts:67-69` says every `StoreStructure` key has an entry; the anti-drift test enforces it):
1. `src/common/types/electron_store.ts` `StoreStructure` — add `legendaryConfigStore: { expired?: boolean }` and `expired?: boolean` on `gogConfigStore` (`:75-79`) and `nileConfigStore` (`:102-104`).
2. `src/common/types/storePolicy.ts` — allow-list entries; add `'legendaryConfigStore'` to `BOOT_SET_STORES` (`:379-392`) because the Library notice reads it synchronously at render (a lazy store hydrates on first fetch; an unhydrated sync read returns undefined and would hide the row).
3. `src/common/types/__tests__/storePolicy.test.ts` — `ALL_VALID_STORE_NAMES` (hard-coded; "21" in the comment and header), the partition tests at `:229-262`, and one case per new key (mirror `allows legitimate neighbour fields`, `:165`).
4. `src/backend/storeManagers/legendary/electronStores.ts` — `new TypeCheckedStoreBackend('legendaryConfigStore', { cwd: 'legendary_store' })`. Closest analogues: `nile/electronStores.ts:12` (`'nileConfigStore', { cwd: 'nile_store' }`) and `gog/electronStores.ts` (`cwd: 'gog_store'`). Name the export so it does not shadow the global `configStore` that `legendary/user.ts:10` already imports from `backend/constants/key_value_stores`. Keep it distinct from `legendaryConfigPath` (legendary's own data dir).
5. `src/backend/sidecar/storeRegistration.ts` — import it (`:72-76` pattern) and add to the `touched` array (`:150-200`); `storeLayer.test.ts` covers registration.
6. `src/frontend/helpers/electronStores.ts` — a `TypeCheckedStoreFrontend('legendaryConfigStore', …)` next to `:145,:164,:173,:181` and add to the export list (`:209-222`).
7. Optional hardening: add `expired` to `WRITE_DENIED_FIELDS` (`storePolicy.ts:313-320`) so the renderer cannot clear a verdict. Precedent says no (`humbleConfigStore.expired` and `credentialsMissing` are renderer-writable today), so this is a judgment call, not a requirement.

**Write/clear sites for every flag (to implement and to test):**

| Flag | Set (proven branch only) | Cleared |
|------|--------------------------|---------|
| `humbleConfigStore.expired` | `humble/user.ts:778` | `:694` finishLogin; `:864` disconnect (`clear()`); NEW healthy probe |
| `steamConfigStore.credentialsMissing` | `steam/user.ts:225` | `:132`, `:332` logout, `:365`, `:542`; NEW healthy probe |
| `gogConfigStore.expired` | NEW: pass, rule 1b | NEW: `GOGUser.login` after `:196`; `logout()` (`configStore.clear()` at `:359` already covers it); healthy probe |
| `nileConfigStore.expired` | NEW: pass, rule 1c | NEW: `NileUser.login` success; `NileUser.logout` beside `:271`; healthy probe |
| `legendaryConfigStore.expired` | NEW: pass, rule 1a | NEW: `LegendaryUser.login` success; `logout` beside `:678`; healthy probe |

Write-if-changed (`if (store.get_nodefault('expired') !== true) store.set(…)`) so "two identical probe results set the flag once and emit one state change" holds; every `set` on a `TypeCheckedStoreBackend` notifies the renderer.

## Frontend Message Channel (item 6)

Steps for a new push message `signInProbeOutcomes` (the channel fails silently if any step is missed; see the ledgered `sidecar-send-channels-fail-silently` note at `preload/api/steam.ts:40-51`):

1. **Declare** in `FrontendMessages` (`common/types/ipc.ts`, beside `humbleAuthState: (state: HumbleAuthState) => void` at `:756` and `steamSyncStatus` at `:727-730`).
2. **Preload slot:** `export const handleSignInProbeOutcomes = frontendListenerSlot('signInProbeOutcomes')` in an `api/` file (pattern `preload/api/humble.ts:10`, `steam.ts:51`). A new file must also be spread into `preload/api/index.ts`.
3. **Emit** in the sidecar with `sendFrontendMessage` from `backend/ipc` (same call `humble/user.ts:742,780` uses). Payload must be display-safe: store keys and the three outcome strings, no tokens or error text.
4. **Subscribe** in `GlobalState.componentDidMount` next to `handleHumbleAuthState` (`GlobalState.tsx:1613-1622`) and `handleSteamSyncStatus` (`:1571-1573`); add the state field + `ContextProvider.tsx` default (`:62` is the `steamSyncStatus` default) + `frontend/types.ts`.
5. **Pull handler (needed, not in D-08):** the pass can finish before `componentDidMount` registers its listener, and a lost push means no row until the next transition. Add a read-only `addHandler('get-signin-probe-outcomes', …)` (pattern: `get-connectivity-status` at `online_monitor.ts:116-121`, declared `ipc.ts:559`, preload `helpers.ts:49`, called at `GlobalState.tsx:1826-1829`) and call it on mount. This is a pure getter, so it does not violate P3.
6. **Ordering:** write flags first, then push the map, so a re-render triggered by the push reads a snapshot that already has the flag (store-change frames and message frames share one ordered pipe from the sidecar).

## AppSettings Recipe (item 7)

Phase 48's `focusRow` is heavy because it migrates a legacy key. A fresh array key needs far less:

1. `src/common/types.ts` `AppSettings` (`:140-165`, `focusRow: FocusRowSelection` at `:155`): add `dismissedSignInNotices: SignInStore[]`.
2. `src/backend/config.ts` `getFactoryDefaults()` (`:355-…`, `focusRow: null` at `:357`): add `dismissedSignInNotices: []`. `getSettings()` spreads factory defaults under on-disk values (`:309-312`), so existing profiles get `[]` with no migration. Also update `src/backend/__mocks__/config.ts` if it enumerates defaults.
3. Renderer seed: `const globalSettings = configStore.get_nodefault('settings')` is read at module load (`GlobalState.tsx:62`); read `globalSettings?.dismissedSignInNotices ?? []` (the mirror may lack the key until first write).
4. Writer: a `GlobalState` handler modelled on `handleFocusRow` (`:815-819`): `setState` + `window.api.setSetting({ appName: 'default', key: 'dismissedSignInNotices', value })`. `setSetting` is send-kind, registered `ipcMain.on` (`settingsFlowRegistration.ts:160`), and writes through `GlobalConfig.get().setSetting` (`:176`). Dedupe in a pure helper so "dismissing twice equals once".
5. Expose through `ContextProvider.tsx` default (`:52` is the `focusRow` default) and `frontend/types.ts`.

**Re-arm (D-10 vs R5):** D-10 says the pass never touches AppSettings and "re-arm … is a removal from this array at the proven-present site". The cleanest way to honour both is renderer-side: a pure `rearmDismissals(dismissed, states)` that drops a runner once its derived state is `expired`, applied in a `GlobalState` effect. Idempotent, so connect-then-expire re-shows exactly once; the sidecar never writes AppSettings. Because `expired` rows ignore the dismissed set (R4/R5), the set only ever suppresses `not-connected`.

**Backstop test shape (SPEC `🧪 backstop`, must be a `must_have`):** run the pass against fake stores while calling `GlobalConfig.setSetting('dismissedSignInNotices', ['gog'])` mid-pass; assert the value survives and add a source gate that `signInProbe/**` never imports `GlobalConfig`/`setSetting`.

## Manage Accounts Routing (item 8)

- Route: `path: 'login'` at `App.tsx:245`, router is `createHashRouter` (`App.tsx:6,231`). `/login?open=gog` becomes `#/login?open=gog`; `useSearchParams` works unchanged under react-router-dom 6.30.
- **`useSearchParams` is not used anywhere in the renderer today** [VERIFIED: grep of `src/frontend` returns only a Humble Keys test asserting a different file does NOT use it, `Humble/Keys/__tests__/index.test.tsx:1104`]. This will be its first use.
- `Login/index.tsx` facts: `type LoginOverlay = 'steam' | 'humble' | OAuthOverlayRunner` (`:58`); `OAUTH_OVERLAY_RUNNERS = ['legendary','gog','nile']` (`:56`); state `mountedOverlay`/`openOverlay`/`overlayMountKey` (`:97-108`); `openLoginOverlay(which)` (`:228-243`) bumps the mount key and sets both states; tile call sites at `:371-460`. The five Login runners are exactly the five SPEC stores, so `?open=` values are `legendary | gog | nile | humble | steam`.
- **Frontend tests have no render path** (`Login/__tests__/index.test.tsx` header: "SOURCE-TEXT gates, not render tests"). So R6's "navigation test" must be (a) a pure `resolveLoginOpenParam(search): LoginOverlay | null` that allow-lists values, (b) a pure consume-once reducer, and (c) a source gate that `Login/index.tsx` reads `open`, calls `openLoginOverlay` and clears the param, and that `LibrarySignInNotice` navigates to `/login?open=`.
- Once-only: guard with a `useRef` consumed flag and `setSearchParams(next, { replace: true })` after opening, so back-navigation does not reopen. `openLoginOverlay` while an overlay is already open must be a no-op (`loginInFlight` already disables the tiles; apply the same guard to the param path so a repeated param opens one overlay).
- `loading` gate: `Login` returns `<UpdateComponent />` until `setLoading(false)` runs (`:183-185,284-286`). Consume the param in an effect that does not depend on `loading`, or the overlay open call races the unmount of the placeholder.

## Library Notice (item 9)

- Mount site: `Library/index.tsx:1171` `{steamSyncMode !== 'hidden' && <SteamSyncNotice mode={steamSyncMode} />}`, after `{showAlphabetFilter && <AlphabetFilter />}` (`:1167`) and the `UpdateComponent` line (`:1169`); resolver call at `:1039-1051`.
- **Exact `signedOut` removals:**
  - `librarySyncIndicator.ts`: `'signedOut'` from `SteamSyncIndicatorMode` (`:37-41`); branch 1b (`:80-98`); the `steamCredentialsMissing` input field (`:47-58`) **if** you accept Open Question 4's alternative.
  - `SteamSyncNotice/index.tsx`: `'signedOut'` in the props union (`:46`); the whole `mode === 'signedOut'` branch (`:71-104`); the now-unused `useNavigate` import and `navigate` const (`:32,52`). `faExclamationTriangle` stays (used by `failed`).
  - `Library/index.tsx:1048-1050` read of `steamConfigStore.get_nodefault('credentialsMissing')`; check whether the `steamConfigStore` import at `:50` is still used elsewhere in the file (it is the only other use found by grep, so it likely becomes unused and trips lint).
  - Catalogue keys `library.steamSync.signedOutTitle|signedOutBody|signedOutAction` become orphaned. Precedent from 48-05 is to leave orphaned keys (48-01 notes `keepRemoved: true` in `i18next-parser.config.js`); do not delete them across 49 files unless the operator asks.
- **Tests that must change** [VERIFIED by reading]: `Library/__tests__/librarySyncIndicator.test.ts` — the 12-row truth table carries `steamCredentialsMissing: false` on every row (`:17-141`) and asserts `toHaveLength(12)` (`:144-146`); the `describe('signedOut mode (260823-ai6)')` block (`:261-330`) must be deleted (or rewritten per Open Question 4); add a test asserting the string `signedOut` is absent from the source and the union. `librarySyncNoticeSource.test.ts` G1-G5 (`:86-233`) pin `<SteamSyncNotice` placement; extend with a parallel gate set for `<LibrarySignInNotice` (mounted; not within 300 chars of `ErrorComponent`; after `<AlphabetFilter`; before the main `<GamesList`).
- **Structural contract to copy** (SteamSyncNotice header + SCSS): one outer `<div>`, flows in the document, no `position` other than static, every selector nested under the root class (the "unscoped-selector lesson"). Rows are one `<div>` each inside one container, `margin-block-end` on the container, the same CSS custom properties (`--navbar-background`, `--neutral-04`, `--space-*`, `--status-danger`). Because the container returns `null` for zero rows (the caller can also simply not mount it), there is no early return that replaces siblings.
- Pure row module: `rows = STORE_ORDER.filter(...).map(...)` with `STORE_ORDER = ['legendary','gog','nile','humble','steam']` (canonical Epic, GOG, Amazon, Humble, Steam). Inputs: the five derived states + dismissed set. Output: `{ store, kind: 'expired' | 'not-connected', dismissible: boolean }[]`.

## Tiles (item 10)

- `Runner` has no third state [VERIFIED: Login/components/Runner/index.tsx props `isLoggedIn`, `buttonText` at `:13,18`; it renders `buttonText` only when `!isLoggedIn` (`:181-192`)]. Steam today: `buttonText = steamCredentialsMissing ? tGamelib('gamelib:login.steamReconnect', 'Sign-in expired — Reconnect') : t('login.steam', …)` (`Login/index.tsx:428-445`) with `isLoggedIn={isSteamLoggedIn}` from `isSteamConnected(steam?.username, credentialsMissing)` (`steamTileState.ts:22-25`: `return Boolean(username) && !credentialsMissing`). Humble: `humble?.expired ? t('login.humble_reconnect', …) : t('login.humble', …)` (`:446-460`), `isLoggedIn = Boolean(humble?.isLoggedIn) && !humble?.expired` (`:155-157`).
- For Epic (`:371-394`), GOG (`:395-405`), Amazon (`:406-416`): drive `isLoggedIn={state === 'connected' || state === 'unknown'}` and `buttonText = state === 'expired' ? tGamelib('gamelib:login.<store>Reconnect', …) : t('login.<store>', …)`. Epic keeps its `alternativeLoginAction`.
- Retire `steamTileState.ts`: `isSteamConnected` has exactly two callers (`Login/index.tsx:141-143,196`) plus `steamTileState.test.ts` and `steamTileRefreshOnDismiss.test.ts` (which asserts the `openOverlay` re-read effect, `:206-216` — the effect that re-reads flags on overlay dismiss must survive the refactor because a Steam sign-in does not change `steam?.username`). Replace with the shared selector, migrate the tests.
- **Parity test (R7):** copy `Library/__tests__/connectedStoresParity.test.ts` (source gate, because nothing renders): assert both `Login/index.tsx` and `Library/index.tsx` import and call the same `signInState` selector by name and that neither re-inlines a flag comparison. Note its documented failure mode (a matching pair of text expressions can still diverge), so also pin the selector by name in each file, as 260924-g7r did for `steamVisibility`.

## Epic Offline Launch (item 11)

- `prepareLaunch` is `launcher.ts:512-…`; the decision is `let offlineMode = gameSettings.offlineMode || !isOnline()` (`:519`), then `if (!offlineMode && gameInfo.runner === 'legendary') { offlineMode = await isEpicServiceOffline() }` (`:521-523`), then a warning if `!gameInfo.canRunOffline && offlineMode` (`:526-530`); `offlineMode` is returned at `:604` and `:751`; `prepareLaunch` is exported (`:2099-2100`). `legendary/games.ts:1025` is `if (offlineMode) command['--offline'] = true`.
- Add, after `:523`: `if (!offlineMode && gameInfo.runner === 'legendary' && gameInfo.canRunOffline && epicSessionExpired()) offlineMode = true`, where the read is a single synchronous config read (`legendaryConfigStore.get_nodefault('expired')`). Reading once at prepare time satisfies "a probe flipping to expired mid-launch does not abort it".
- `canRunOffline` sources: legendary `customAttributes?.CanRunOffline?.value === 'true'` (`legendary/library.ts:543`, set `:642`); GOG `true` (`gog/library.ts:492,1163`); Amazon `true` (`nile/library.ts:90`); Steam `true` (`steam/library.ts:1191`); Zoom `true` (`zoom/library.ts:170`). Humble has no launchable games here. For GOG/Amazon/Steam there is **no code change**; R8 is satisfied by not adding any consumer of the state in render or launch.
- **Testing:** there is no unit test for `prepareLaunch` (only `gogImportGame.test.ts` mentions it) and its dependency graph is large. Extract a pure `resolveEpicOfflineMode({ settingOffline, online, serviceOffline, storeExpired, canRunOffline })` and test that; add a source gate that only `launcher.ts` `prepareLaunch` reads the Epic expired flag and that no file under `screens/Library` or `storeManagers/*/games.ts` imports the selector for gating.
- Epic's launch-time "credentials expired" modal (`utils.ts:363-416`, string `No saved credentials` at `:370,406`) stays as the fallback; do not touch it.

## callRunner Extension (the hidden cost)

`launcher.ts:1650-1864` facts [VERIFIED by reading]:

| Behaviour | Lines | Consequence for the probe |
|-----------|-------|---------------------------|
| `errorHandler(stdout+stderr, appName, runner)` runs on every `close` and again in `.catch` | `:1766-1770`, `:1840` | can raise a modal (`utils.ts:395,406`) during a boot probe, violating P2. Needs `skipErrorHandler` |
| Non-zero exit rejects with `Process exited with code N`; the `.catch` returns `stderr: errorMessage` | `:1793-1796`, `:1847-1852` | the child's real stderr is **discarded** for exactly the legendary/nile failures we must classify |
| `onOutput(data, child)` receives every raw stdout and stderr chunk | `:1743-1745`, `:1758-1760` | the supported way to capture output regardless of exit code |
| Identical in-flight command (same `runner.name` + argv) returns the existing promise | `:1713-1720` | a joiner's `onOutput` never fires; a classification must live in the function that owns the spawn |
| No timeout; killed only by the `AbortController` registered under `abortId` | `:1722-1729` | bound = `callAbortController(abortId)` (`utils/aborthandler/aborthandler.ts`) |
| Not `unref`'d | `:1726` | an un-aborted child holds the event loop open at stdin EOF |

Add to `CallRunnerOptions` (`common/types.ts:559-568`): `skipErrorHandler?: boolean`, honour it at both call sites. Extend `launcher_callRunner.test.ts` (the existing callRunner suite). Captured output must be held in a bounded buffer (cap length) and never logged; for gogdl pass the existing `authLogSanitizer`-style sanitizer so the runner log writers stay clean.

## Test Infrastructure (item 12)

- Root `jest.config.js` projects: `src/backend` (displayName `Backend`), `src/common` (`Common`), `src/frontend` (`Frontend`), `src/preload` (`Preload`), `meta` (`Meta`) [VERIFIED: jest.config.js `projects`; displayName lines in each project config].
- Backend `testMatch` is `**/__tests__/**/*.test.ts` only (**no `.tsx`**); `resetMocks: true` strips `jest.fn(...)` implementations before every test, so re-arm mock implementations in `beforeEach` (explained in `gogPresenceBootWire.test.ts`); `setupFiles` contains `jest.setupContainment.ts` (HOME etc. redirected for every backend suite).
- Frontend: `testEnvironment: 'node'`, no jsdom; tests are pure-module or source-text gates; `*.test.ts` and `*.test.tsx` both match.
- `createFakeHomeProfile()` lives at `src/backend/testUtils/fakeHomeProfile.ts:193`; the gate is `src/backend/__tests__/fakeHomeIsolation.test.ts`. Unit tests here mock `runRunnerCommand` and should not spawn.
- Scoped runs (the operator's Windows box fails ~40 suites unrelated to any change; CI is ubuntu-only [CITED: MEMORY.md]): `npx jest --selectProjects Backend --testPathPattern signInProbe`, similarly `Common`, `Frontend`, `Meta`. Never rely on a full green run locally.
- Prettier: every `<verify>` block needs `npx prettier --check` over exact written paths after a `--file-info` check; `public/locales/**` and `.planning/**` are ignored, so omit the check for catalogue-only tasks [CITED: Skill gamelib-conventions].

## i18n Recipe (item 12, R9)

Facts [VERIFIED: 48-01-PLAN.md, public/locales listing]:
- 49 `public/locales/*/gamelib.json` (en + 48), 48 `gamelib.mt.json` (all but en). `gamelib.json` is **nested** objects (`library.filterPanel.*`), sorted alphabetically, **4-space indent, LF**.
- A `gamelib.mt.json` is `{ locale, model, filledAt, keys: [...] }`; add each new dotted key to `keys[]`; **never change `model` or `filledAt`** (changing `filledAt` relabels every key already recorded).
- `pnpm i18n` only writes `en` (`i18next-parser.config.js` `locales: ['en']`, `keepRemoved: true`). The other 48 are filled in-session. `pnpm machine-fill-gamelib` returns HTTP 401 in this environment (`ANTHROPIC_BASE_URL` is ignored by `meta/machineFillGamelib.ts`); do not spend turns on it.
- Gates: `pnpm lint-translations:gamelib` must print `0 findings, 0 hard failures` (an empty string counts as missing); `meta/i18nCatalogPresenceBaseline.json` must stay at `totalPairs: 0`; `pnpm i18n-churn-guard` fails on any `translation.json` edit; `meta/__tests__/machineFillGamelib.test.ts:1124` checks notes→en direction only, so translator notes are optional.
- Land the catalogue keys as their own early plan (48-01's rationale: a source plan can then reference keys freely). Every path written there is prettier-ignored.
- **Proposed keys** (wording is discretion; store name always `{{store}}`):

| Key | English (proposal) | Notes |
|-----|-------------------|-------|
| `library.signIn.notConnected` | `{{store}} is not connected` | neutral tone, P4 |
| `library.signIn.expired` | `Your {{store}} sign-in expired` | reuses the Steam tone CONTEXT keeps |
| `library.signIn.signIn` | `Sign in` | not-connected action |
| `library.signIn.reconnect` | `Reconnect` | expired action |
| `library.signIn.dismiss` | `Dismiss {{store}} notice` | `aria-label` for the dismiss button |
| `login.epicReconnect`, `login.gogReconnect`, `login.amazonReconnect` | `Sign-in expired — Reconnect` | D-12 asks for three; one shared key would be simpler, planner's call |

- **Hardcoded-string gate scope is a snapshot, not a glob.** `meta/hardcodedStringGate.ts` `scanScope()` reads `meta/i18nGateScope.json` (`:1926`); `SteamSyncNotice/index.tsx` (`:136`) and `Login/index.tsx` (`:144`) are listed by hand ("hand-edited" provenance). A new `LibrarySignInNotice/index.tsx` and any new `.ts` with strings are **not covered until added** to `files` (sorted, must exist on disk: `genI18nGateScope.test.ts` checks both) and to `meta/i18nForkTouchedFiles.json`. Without that edit the gate passes vacuously for the new component.
- Store display names: pass the existing brand strings via `{{store}}`; do not translate them and do not concatenate (R9 encoding).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyring read with prompt-safe caching | a new read path | `SidecarKeyringSlotStore.readToken(context)` | already caches, joins in-flight reads, memoises failures for 120 s, labels `trigger=` |
| present/absent/unreadable | boolean read | `readTokenOutcome` / `TokenReadOutcome` | 260822-vov rule: unreadable is never absence |
| Renderer snapshot sync of flags | a custom push for each flag | `TypeCheckedStoreBackend.set/delete` (auto `notifyStoreChanged`) | the single-push-site invariant forbids a second producer |
| Stale-result fence | ad-hoc booleans | session-epoch counter (copy `cacheEpoch`) | the established T-34.5-G6-14 shape |
| Child kill at the bound | `child.kill()` bookkeeping | `callAbortController(abortId)` | already wired to `callRunner`'s signal and quit handling |
| Persisted setting | a new file | `GlobalConfig` AppSettings key | D-10; `getSettings()` merges factory defaults |
| Text-source assertions | regexes over raw text | `backend/testUtils/stripSourceComments` | comment-prose false positives have bitten this repo before |
| Anything that re-implements an OAuth refresh for GOG/Epic/Amazon | direct token calls | the runner CLIs | refresh tokens rotate; doing it outside the runner invalidates the runner's stored token |

**Key insight:** every bespoke shortcut in this phase (a clock check, a direct refresh, a second spawn site, a renderer-triggered probe) either produces a false `expired` (violating P1) or silently changes credentials the runner owns.

## Common Pitfalls

### Pitfall 1: Classifying from `ExecResult.stderr`
**What goes wrong:** the verdict is always `unknown` for Epic/Amazon, or worse, an unrelated string matches. **Why:** `callRunner` replaces stderr with `Process exited with code N` on any non-zero exit (`launcher.ts:1793-1796,1847-1852`). **Avoid:** capture through `onOutput`; classify with pure functions. **Warning sign:** a classifier unit test passes on hand-written stderr but the live gate shows `unknown`.

### Pitfall 2: Joined spawns and a second `gogdl auth` site
**What goes wrong:** the pass's `gogdl auth` joins Block E's in-flight spawn (identical key, `launcher.ts:1715-1720`); its `onOutput` never fires; no verdict. **Avoid:** keep the verdict logic inside `GOGUser.getCredentials` and expose `{ credentials, verdict }` to both Block E and the pass. Same for Epic (`legendary status` key) and Amazon.

### Pitfall 3: `expired` and `not-connected` collide for Epic
**What goes wrong:** legendary deletes `user.json` on invalid creds; `isLoggedIn()` goes false; Block E removes `userInfo` next boot; with the logged-in check first the tile says "Epic Games Login" and the row offers a dismiss. **Avoid:** selector rule 1 (flag first); clear the flag on login success and logout.

### Pitfall 4: Errors surfaced as modals during the probe
**What goes wrong:** `errorHandler` shows `showDialogBoxModalAuto` for `legendary…py` tracebacks (`utils.ts:389-403`) or `No saved credentials` (`:406-414`). Violates P2. **Avoid:** `skipErrorHandler`. Add a test that the probe path never reaches `showDialogBoxModalAuto`.

### Pitfall 5: Treating a latch as safe across a sign-in
**What goes wrong:** a probe started before a sign-in finishes after it and re-sets `expired` on a fresh session (R2 concurrency). **Avoid:** session-epoch capture/compare, bumped on login success and logout for all five stores. Test with a deferred probe promise resolved after a simulated login.

### Pitfall 6: Network errors that look like auth failures
**What goes wrong:** `HTTP request for login failed` (Epic), `Failed to refresh credentials` (GOG), `Failed to refresh the token <no Response>` (Amazon), 5xx/429 (Amazon), and offline early returns (`getCredentials` returns `undefined` when `!isOnline()`) must never reach the latch. **Avoid:** a classifier table with an explicit negative row per runner (the 260822-vov negative) and a source gate that `set('expired', true)` appears only under the `expired` verdict.

### Pitfall 7: Re-running on a repeat `online` event
**What goes wrong:** `setStatus('online')` can fire with no intervening offline; a naive `onConnectivityChange('online')` re-run probes (and may prompt a Keychain) on every refocus. **Avoid:** Pattern 4 edge detection.

### Pitfall 8: Un-deferring Steam by accident
**What goes wrong:** calling `ensureConnected()` from the pass opens a CM connection each boot; D-14's sticky unlock then lets `SteamLibraryManager.refresh()` (`steam/library.ts:921`) proceed on later automatic triggers (`init()` registers `runOnceWhenOnline(() => this.refresh())` at `:843-846`, and the renderer's `origin: 'mount'` maps to `'startup'`). Whether that first refresh sees the gate locked depends on listener order (Steam's `once('online')` is registered earlier, so it normally runs first). **Avoid:** the pass reads the keyring only; the plan records, in prose, that after the pass the Steam gate is unlocked for the process (the reversal the SPEC requires); add a test that a pass never calls `ensureConnected`.

### Pitfall 9: The 45 s bound exceeds the smoke gate's 30 s
**What goes wrong:** `STARTUP_TIMEOUT_MS = 30_000` (`meta/sidecarStartupSmoke.cjs:78`), measured cold boots 27-39 s (`260913-m9c`). On CI the profile is cold: no store is logged in, so the pass probes nothing and the sidecar exits. On the operator's warm real profile (the named real-profile exemption) a logged-in store spawns a child that can outlive stdin EOF for up to 45 s, tripping the smoke `ETIMEDOUT`. **Avoid:** keep the skip-when-not-logged-in rule (it is also the P3 and prompt-count rule), abort children at the bound, and state in the plan that a warm local smoke run can exceed 30 s by design; do not "fix" it by shortening the bound (D-01). Consider raising only the smoke gate's timeout in a separate, explicit decision.

### Pitfall 10: Boot-time `init()` re-entrancy in tests
**What goes wrong:** unguarded automatic start makes dozens of existing suites call real runner/keyring code. **Avoid:** the `JEST_WORKER_ID` guard (Block C precedent) plus direct-call tests.

### Pitfall 11: The renderer misses the push
**What goes wrong:** pass finishes before `GlobalState` registers `handleSignInProbeOutcomes`; the notice never shows until the next transition. **Avoid:** the pull handler (Frontend Message Channel step 5).

### Pitfall 12: Catalogue edits that look done but are not gated
**What goes wrong:** keys added to `en` only (presence-baseline hard fail), or new component not in `i18nGateScope.json` (vacuous hardcoded-string gate). **Avoid:** i18n recipe; assert 49 × key non-empty and 48 manifests stamped with a node script, as 48-01 did.

### Pitfall 13: Double banner for a Steam credentials failure
**What goes wrong:** removing branch 1b means `failed` + `credentialsMissing` now renders the generic "Couldn't sync / Retry Steam sync" next to the new "Your Steam sign-in expired" row, and Retry "re-enters the same path … and fails identically" (the 260823-ai6 rationale). **Avoid / decide:** Open Question 4.

### Pitfall 14: Hidden webview at boot
See Humble Read Path and Open Question 3.

## Code Examples

### Epic classifier (pure)

```ts
// Strings: [CITED: legendary-gl/legendary@0.21.0 core.py _login] — confirm in the live gate.
const EPIC_AUTH_FAIL = 'Stored credentials are no longer valid'
const EPIC_NET_FAIL = 'HTTP request for login failed'

export function classifyLegendaryStatus(i: {
  exitCode: number | null
  output: string
  aborted: boolean
}): SignInProbeOutcome {
  if (i.aborted) return 'unknown'
  if (i.output.includes(EPIC_AUTH_FAIL)) return 'expired'
  if (i.output.includes(EPIC_NET_FAIL)) return 'unknown'
  if (i.exitCode === 0 && /"account"\s*:\s*"(?!<not logged in>)/.test(i.output)) return 'healthy'
  return 'unknown'
}
```

### GOG classifier (pure)

```ts
export function classifyGogdlAuth(i: {
  stdout: string
  output: string
  exitCode: number | null
  online: boolean
  authConfigExists: boolean
  aborted: boolean
}): SignInProbeOutcome {
  if (i.aborted || !i.online || i.exitCode !== 0) return 'unknown'
  let parsed: unknown
  try { parsed = JSON.parse(i.stdout.trim()) } catch { return 'unknown' }
  if (parsed && typeof parsed === 'object' && 'access_token' in parsed) return 'healthy'
  if (parsed === null && !i.output.includes('Failed to refresh credentials') && i.authConfigExists) return 'expired'
  return 'unknown'
}
```

### Amazon classifier (pure)

```ts
export function classifyNileOutput(i: { output: string; aborted: boolean }): SignInProbeOutcome {
  if (i.aborted) return 'unknown'
  const m = /Failed to refresh the token <Response \[(\d{3})\]>/.exec(i.output)
  if (m) return ['400', '401', '403'].includes(m[1]) ? 'expired' : 'unknown' // 4xx set is [ASSUMED] A3
  if (i.output.includes('Failed to refresh the token')) return 'unknown'      // connection error text
  return 'healthy'
}
```

### Capturing output without losing it to `callRunner`

```ts
// `onOutput` receives every raw chunk, stdout and stderr (launcher.ts:1743-1745, 1758-1760).
const chunks: string[] = []
let total = 0
const res = await libraryManagerMap['nile'].runRunnerCommand(['list-updates', '--json'], {
  abortId: 'signin-probe-nile',
  skipErrorHandler: true, // NEW option
  onOutput: (data) => { if (total < 64_000) { chunks.push(data); total += data.length } }
})
const outcome = classifyNileOutput({ output: chunks.join(''), aborted: Boolean(res.abort) })
```

### `?open=` consumer (pure part)

```ts
const OPENABLE = ['legendary', 'gog', 'nile', 'humble', 'steam'] as const
export function resolveLoginOpenParam(search: string): (typeof OPENABLE)[number] | null {
  const v = new URLSearchParams(search).get('open')
  return (OPENABLE as readonly string[]).includes(v ?? '') ? (v as (typeof OPENABLE)[number]) : null
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Steam keyring read deferred past startup (`'startup'` never unlocks) | Boot read under deliberate `'boot-probe'` | this phase (reverses 260817-d61) | prompt count at boot rises on unsigned/dev macOS builds; D-04 says `GAMELIB_DEV_SECRET_VAULT=1` is the dev answer |
| Humble health check on renderer mount (`trigger=unspecified`) | Sidecar pass, `trigger=boot-probe` | this phase | closes the folded todo |
| `signedOut` mode inside `SteamSyncNotice` | `LibrarySignInNotice` rows for all five | this phase | one sign-in surface |
| Per-store expired state for 2 of 5 | Uniform flag shape for all 5 | this phase | |

**Deprecated/outdated:** the CONTEXT claim that Humble sync latches expiry (D-16); `steamTileState.isSteamConnected` once the selector exists.

## Runtime State Inventory

Not a rename/refactor/migration phase. New persisted state only: three `expired` keys and one new store directory (`legendary_store`) plus the `dismissedSignInNotices` AppSettings key. Existing profiles need no data migration because absent keys read as falsy / `[]` via factory-default merge (`config.ts:309-312`). Stored data: none to migrate. Live service config: none. OS-registered state: none. Secrets/env vars: none new. Build artifacts: none.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Legendary 0.21.0 emits exactly `Stored credentials are no longer valid! Please login again.` and `HTTP request for login failed:` to the stream `onOutput` sees, and `status --json` stdout carries `account` | Probe 1a | Epic classifier returns `unknown` forever (safe failure, feature dead). Verify from a real `gamelib.log` runner log in the live gate |
| A2 | gogdl `auth` non-OK refresh response is predominantly 4xx invalid_grant, so silent `null` ≈ expired | Probe 1b | a GOG 5xx mislabels as expired until next healthy probe (P1 violation in a rare case). Operator decision needed |
| A3 | Amazon returns 400/401/403 (not another 4xx) for a dead refresh token via `/auth/token` | Probe 1c | Amazon expiry never detected (false negative) or a transient 4xx latches (false positive) |
| A4 | `nile list-updates --json` attempts a refresh before any network use even with zero installed games | Probe 1c | Amazon probe is a no-op for users with nothing installed |
| A5 | `legendary status` with `--json` prints JSON to stdout and logs go to stderr, both visible in `onOutput` | Probe 1a | classifier regexes need adjusting |
| A6 | Amazon `<Response [NNN]>` is the `repr` of a `requests.Response` (true for `requests`), so it appears verbatim in the log line | Probe 1c | status unrecoverable → only `unknown` |
| A7 | `BOOT_SET_STORES` (not lazy) is right for `legendaryConfigStore` because the notice reads it synchronously at render | Persistence | row hidden until hydration if wrong |
| A8 | Rendering `unknown` as "Connected" on tiles matches current behaviour for every store | Pattern 2 | tile regression on offline launches |
| A9 | Humble `absent` session slot should be `unknown` (no latch) | Humble | a connected-flag-but-empty-slot account is never surfaced |
| A10 | Pass start placed between the READY write and `deliverStartupProtocolUrl()` does not delay protocol-URL delivery | Bootstrap | startup deep link latency (microseconds if registration-only) |
| A11 | Renderer-side re-arm satisfies D-10's "removal … at the proven-present site" | AppSettings | operator may have meant a sidecar write |

## Open Questions

1. **Sticky Steam unlock vs `SteamLibraryManager.refresh()` (D-14).**
   - Known: after `noteSteamAuthTrigger('boot-probe')` the gate stays unlocked; renderer `origin: 'mount'` maps to `'startup'` and then passes the gate; the first Steam refresh depends on listener order.
   - Unclear: whether the operator wants Steam's automatic CM refresh back at every launch.
   - Recommendation: accept per D-14, write the reversal into the plan prose, and add a test pinning that the pass itself never connects. Surface the behaviour change in the verification notes.

2. **GOG 5xx ambiguity (Probe 1b).** Accept "silent `null` = expired" with the stated residual, or require a second confirming signal? Recommendation: accept; self-healing, non-modal, and any alternative rotates GOG's refresh token.

3. **Hidden csrf-backfill webview inside the Humble health check vs P2.** Recommendation: the pass does the session read + `getGamekeys` only; drop the boot-time backfill. If the operator wants it kept, state that "webview" in P2 means a visible login surface.

4. **Steam `failed` + `credentialsMissing` double banner (Pitfall 13).** Options: (a) delete the input and branch 1b entirely (matches SPEC text literally; shows a wrong "Retry" next to the expired row); (b) keep a suppress-only branch that returns `'hidden'` when `steamSyncStatus==='failed' && steamCredentialsMissing` (no `signedOut` token anywhere; preserves 260823-ai6's intent). Recommendation: (b). The R4 acceptance test only forbids the `signedOut` word.

5. **Dismiss re-arm location (A11).** Recommendation: renderer-side prune effect.

6. **Epic and the optional central latch.** Any legendary invocation that hits invalid creds deletes `user.json`; only the probe latches. A central stderr hook in `callRunner` would catch launch/list too but widens scope. Recommendation: probe-only; the existing launch modal stays the fallback.

7. **Smoke gate timeout (Pitfall 9).** Leave at 30 s and document, or raise? Out of this phase's SPEC; flag to the operator.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | all builds/tests | yes | v24.19.0 | — |
| pnpm | scripts | yes | 10.28.0 | — |
| Runner binaries (`public/bin/{arm64,x64}/…`) | live gate only | present in repo (`public/bin/x64` lists `linux`, `win32`, `darwin`; `arm64` has `darwin`, `linux`, `win32`) | pinned tags above | unit tests mock `runRunnerCommand` |
| macOS machine with an expired Epic/GOG/Amazon session | live gate for A1-A6 | not on this Windows box (this profile has no `user.json`) | — | none; schedule as a `ready: live-gate` task |
| Anthropic API for `machine-fill-gamelib` | 48-locale fill | no (401) | — | in-session authorship (48-01 precedent) |

**Missing dependencies with no fallback:** a real expired account per runner for the live gate. **With fallback:** everything else.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7 via `ts-jest`, multi-project (`Backend`, `Common`, `Frontend`, `Preload`, `Meta`) |
| Config file | `jest.config.js` (root, `projects`), per-project `src/*/jest.config.js`, `meta/jest.config.js` |
| Quick run command | `npx jest --selectProjects <Project> --testPathPattern <pattern>` |
| Full suite command | `pnpm test:ci` (CI only; ~40 suites fail on the operator's Windows box regardless of change) |

### Phase Requirements → Test Map

Test file names are proposals; paths follow the existing `__tests__` conventions.

| Req ID | Behavior | Test Type / Project | Automated Command | File Exists? |
|--------|----------|---------------------|-------------------|-------------|
| R1 | exhaustive (loggedIn × expiredFlag × outcome) × 5 stores yields exactly one state; pure; stale-expired beaten by sign-in | unit / Common | `npx jest --selectProjects Common --testPathPattern signInState` | ❌ Wave 0 `src/common/__tests__/signInState.test.ts` |
| R1 | every new key allow-listed; `legendaryConfigStore` in universe, boot set; count 22 | unit / Common | `npx jest --selectProjects Common --testPathPattern storePolicy` | ✅ `src/common/types/__tests__/storePolicy.test.ts` (must change: `ALL_VALID_STORE_NAMES`, new cases) |
| R2 | per runner: auth failure sets, network/timeout leaves unchanged, sign-in clears, never set from non-auth branch; idempotent set; epoch fence | unit / Backend | `npx jest --selectProjects Backend --testPathPattern "signInProbe\|storeManagers/(legendary\|gog\|nile)/__tests__/expiry"` | ❌ Wave 0 `signInProbe/__tests__/classify.test.ts`, `…/legendary\|gog\|nile/__tests__/expiryProbe.test.ts` |
| R2 | existing user tests keep passing after login/logout clear the flag | unit / Backend | `npx jest --selectProjects Backend --testPathPattern "(legendary\|gog\|nile)/__tests__/user"` | ✅ `legendary/__tests__/user.test.ts`, `gog/__tests__/user.test.ts`, `nile/__tests__/user.test.ts` (extend) |
| R2 | `callRunner` `skipErrorHandler` + `onOutput` capture preserved on non-zero exit | unit / Backend | `npx jest --selectProjects Backend --testPathPattern launcher_callRunner` | ✅ `src/backend/__tests__/launcher_callRunner.test.ts` (extend) |
| R3 | READY before any probe (source order gate + behavioural); probe never resolving → `unknown` at bound, verdict just before; no overlap; one pass per edge, none on repeat `online`; unref on every timer; abort child at bound; one issued `keyring_get` per slot | unit / Backend | `npx jest --selectProjects Backend --testPathPattern "signInProbe\|signInProbeBootWire"` | ❌ Wave 0 `signInProbe/__tests__/pass.test.ts`, `sidecar/__tests__/signInProbeBootWire.test.ts` |
| R3 | existing boot wiring unchanged | unit / Backend | `npx jest --selectProjects Backend --testPathPattern "bootstrap"` | ✅ `bootstrap.test.ts`, `bootstrapWirings.test.ts` (extend Test B), `bootstrapUserReconcile.test.ts` |
| R3 | `'boot-probe'` sticky unlock; `'startup'` still locked; Steam probe branches | unit / Backend | `npx jest --selectProjects Backend --testPathPattern "steam/__tests__/(authTrigger\|credentialsMissing)"` | ✅ both (extend) |
| R3 | Humble optional label threaded, no Steam gate import; `unreadable` → unknown; healthy clears | unit / Backend | `npx jest --selectProjects Backend --testPathPattern "humbleSecretStore\|humble/__tests__/user"` | ✅ `humbleSecretStore.test.ts`, `humble/__tests__/user.test.ts` (extend) |
| R3 | sidecar exits at stdin EOF | smoke | `pnpm smoke:sidecar` | ✅ `meta/sidecarStartupSmoke.cjs` (CI only meaningful; see Pitfall 9) |
| R3 | `GlobalState` no longer calls `humbleCheckHealth`; `humbleSync` stays | source gate / Frontend | `npx jest --selectProjects Frontend --testPathPattern globalStateHumbleMount` | ❌ Wave 0 |
| R4 | 0 rows → none; expired → row; unknown → none; same-state stores → separate rows; canonical order; `signedOut` absent from union and source | unit / Frontend | `npx jest --selectProjects Frontend --testPathPattern "librarySignInRows\|librarySyncIndicator"` | ❌ `librarySignInRows.test.ts` Wave 0; ✅ `librarySyncIndicator.test.ts` (must change: drop `steamCredentialsMissing`/12-row table/signedOut block per OQ4) |
| R4 | mount placement, not a full-screen replacement, no Dialog/notify (P2) | source gate / Frontend | `npx jest --selectProjects Frontend --testPathPattern "librarySyncNoticeSource\|librarySignInNoticeSource"` | ✅ `librarySyncNoticeSource.test.ts` (extend); ❌ Wave 0 `librarySignInNoticeSource.test.ts` |
| R5 | dismiss omitted across restart (seed from persisted); expired has no dismiss; dismiss twice = once; connect-then-expire re-arms exactly once; backstop: dismiss during pass survives | unit / Common + Backend | `npx jest --selectProjects Common --testPathPattern signInDismissal`; `npx jest --selectProjects Backend --testPathPattern signInProbe` | ❌ Wave 0 `common/__tests__/signInDismissal.test.ts`, `signInProbe/__tests__/dismissBackstop.test.ts` |
| R5 | factory default `[]` | unit / Backend | `npx jest --selectProjects Backend --testPathPattern config` | ✅ (extend) |
| R6 | `?open=` allow-list; once-only; repeated param/click opens one overlay; Library unmount yields no stale row (derivation) | unit + source gate / Frontend | `npx jest --selectProjects Frontend --testPathPattern "loginOpenParam\|Login/__tests__"` | ❌ Wave 0 `loginOpenParam.test.ts`; ✅ `Login/__tests__/index.test.tsx` (extend) |
| R7 | per-store connected/expired tile state; parity (tile and notice call one selector) | unit + source gate / Frontend | `npx jest --selectProjects Frontend --testPathPattern "signInTileState\|signInStateParity\|steamTileState"` | ❌ Wave 0; ✅ `steamTileState.test.ts` (migrate/retire), `steamTileRefreshOnDismiss.test.ts` (keep effect) |
| R8 | pure `resolveEpicOfflineMode`; no other consumer gates render/launch | unit + source gate / Backend | `npx jest --selectProjects Backend --testPathPattern "epicOfflineMode\|launcher"` | ❌ Wave 0 |
| R9 | 49 catalogues × every new key non-empty; 48 manifests stamped; `translation.json` unchanged | script + gates / Meta | `pnpm lint-translations:gamelib && pnpm i18n-churn-guard`; `npx jest --selectProjects Meta --testPathPattern "hardcodedStringGate\|genI18nGateScope"` | ✅ gates exist; ❌ node assertion script per 48-01; scope JSON edits |

**Existing tests that MUST change:** `librarySyncIndicator.test.ts`; `storePolicy.test.ts`; `humbleFlows.test.ts` only if the `humbleCheckHealth` channel is removed (recommendation: don't); `steamTileState.test.ts`; `genI18nGateScope.test.ts` is data-driven (edit the JSON, not the test).

### Sampling Rate
- **Per task commit:** the scoped `npx jest --selectProjects … --testPathPattern …` for the files touched, plus `npx prettier --check` over written, non-ignored paths.
- **Per wave merge:** all Backend + Common + Frontend + Meta tests matching `signIn|signInProbe|storePolicy|librarySync|Login|bootstrap|authTrigger|credentialsMissing|humble`, plus `pnpm codecheck`, `pnpm lint-translations:gamelib`, `pnpm i18n-churn-guard`, `pnpm planning-gates`.
- **Phase gate:** CI full suite green (ubuntu) + `pnpm smoke:sidecar` in CI + the macOS live gate for A1-A6 and Keychain behaviour before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/common/signInState.ts` + test; `signInDismissal.ts` + test.
- [ ] `src/backend/signInProbe/{classify,pass,sessionEpoch}.ts` + tests; `sidecar/__tests__/signInProbeBootWire.test.ts`.
- [ ] `CallRunnerOptions.skipErrorHandler` + `launcher_callRunner.test.ts` cases.
- [ ] `legendaryConfigStore` plumbing (6 files) before any probe task.
- [ ] Catalogue keys plan first (48-01 shape), then `meta/i18nGateScope.json` + `i18nForkTouchedFiles.json` edits when the component lands.
- [ ] Live-gate task (macOS, `ready: live-gate`) for runner strings (A1-A6) and the Keychain-denial path; follow `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.
- [ ] Todo closure: set `resolves_phase: 49` on `2026-08-17-humble-slots-still-prompt-unattended-at-startup.md`, keeping `severity`/`platform`/`ready` frontmatter intact for `pnpm planning-gates`.

## Security Domain

`security_enforcement` is absent from `.planning/config.json`, so it is treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (consumes auth state; never handles credentials directly) | probes read tokens only through existing stores/CLIs; no new credential handling |
| V3 Session Management | yes | session-epoch fence so a stale verdict cannot override a fresh session; flags cleared on logout |
| V4 Access Control | yes | renderer gets read access only via `STORE_ALLOWLIST`; consider `WRITE_DENIED_FIELDS` for the three flags |
| V5 Input Validation | yes | classify CLI output with strict substring/regex tables; allow-list `?open=` values; validate the outcome-map payload keys against the five-store union |
| V6 Cryptography | no | no new crypto; refresh tokens stay with the runners/keyring |
| V7 Logging | yes | never log captured runner output (gogdl stdout is a token object); log verdict + store only; keep `authLogSanitizer`-style handling |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token/secret leakage via captured runner stdout into logs | Information Disclosure | bounded capture buffer, never logged; sanitizer on runner log writers |
| Renderer-controlled `?open=` value reaching `openLoginOverlay` | Tampering | allow-list resolver; unknown value ignored |
| Renderer writing `expired=false` to hide a verdict | Tampering | optional `WRITE_DENIED_FIELDS` entry; low impact (UI only) |
| Probe children outliving the sidecar (orphaned authenticated process) | Denial of Service / Elevation | abort at the bound; sidecar exit contract; Rust process-group reap is the backstop |
| False `expired` from a network/5xx error forcing needless re-login | Denial of Service (usability) | classifier negative rows; flag self-heals on healthy probe |
| Command injection via probe args | Tampering | argv are constant literals; no user input in probe commands |
| Modal/OS notification spoofing a system prompt | Spoofing | notice is inline, non-modal; no `notify()`/`Dialog` (P2 source gate) |

Credential or token leakage into logs is explicitly canon security owned by `/gsd-secure-phase` and eslint (SPEC Prohibitions breadcrumb); the controls above are the research-level inputs to it.

## Project Constraints (from CLAUDE.md)

- Tech stack is React + TypeScript on Rust/Tauri; **do not raise deviation from upstream Heroic as a caveat** (applies to the i18n fork-touched ratchet files: edit them as hand-edited provenance, do not frame it as upstream drift).
- Conventions (load `Skill("gamelib-conventions")` before acting): todo frontmatter keys `severity`/`platform`/`ready` bare, lowercase, in that order; `createFakeHomeProfile()` for any test spawning a child; sidecar timers/handles `unref()`'d and no unbounded boot work; UAT item shape; `npx prettier --check` over exact written paths in every `<verify>` after `--file-info` (catalogues and `.planning` are ignored, omit the check there).
- Graphify: run `graphify query` before grepping; never read `graphify-out/GRAPH_REPORT.md` or `graph.json`; run `graphify update .` after code changes.
- GSD workflow enforcement: file changes go through a GSD command.
- Steam stack is frozen (steam-session / steam-user / @node-steam/vdf / axios / `steam://rungameid`); this phase adds no Steam dependency.
- Frontend jest project has no jsdom: render decisions in pure modules, structural claims as source gates.

## Sources

### Primary (HIGH confidence)
- In-repo files opened this session (line ranges cited inline): `launcher.ts`, `utils.ts`, `bootstrap.ts`, `online_monitor.ts`, `authTrigger.ts`, `steam/user.ts`, `steam/library.ts`, `tokenStore.ts`, `keyringTokenStore.ts`, `humbleSecretStore.ts`, `humble/user.ts`, `humble/library.ts`, `legendary/user.ts`, `gog/user.ts`, `nile/user.ts`, `nile/library.ts`, `storePolicy.ts`, `electron_store.ts`, `Login/index.tsx`, `steamTileState.ts`, `Library/index.tsx`, `SteamSyncNotice`, `librarySyncIndicator.ts` and tests, `GlobalState.tsx`, `ipc.ts`, `config.ts`, `meta/*`.
- `src-tauri/src/main.rs:3079` `const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs(45);`
- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md:1344` (real `user.json` fields) and the D-35-19-13 startup-race trace.
- `.planning/phases/48-…/48-01-PLAN.md` (i18n landing recipe).

### Secondary (MEDIUM confidence)
- legendary-gl/legendary@0.21.0 `legendary/core.py` (`_login` strings, `lock.clear()`), `legendary/lfs/utils.py` (`LockedJSONData.clear` → `os.remove`); derrod/legendary master `cli.py` (`status`, `auth`), `api/egs.py` (error propagation). Fetched via WebFetch summarisation, so verbatim strings should be re-confirmed from a real log.
- Heroic-Games-Launcher/heroic-gogdl@v1.3.0 `gogdl/auth.py`.
- imLinguin/nile@v1.2.0 `nile/api/authorization.py`; nile `cli.py` (`main`) for command/refresh call sites.

### Tertiary (LOW confidence)
- Amazon `/auth/token` status for a revoked refresh token (A3); `list-updates` exit code after refresh failure (A4); gogdl 5xx frequency (A2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; pinned runner versions read from `releaseTags.ts`.
- Architecture: HIGH for wiring and touch-points (all opened), MEDIUM for the pass-vs-existing-spawn interactions (derived by reading `callRunner`, not run).
- Pitfalls: HIGH for the callRunner / D-16 / user.json / hardcoded-gate-scope findings (read directly); MEDIUM for Steam listener-order and smoke-timing interactions.
- Runner classification (Epic/GOG/Amazon): MEDIUM — source-derived at the right tags, unproven against a real expired account.

**Research date:** 2026-10-08
**Valid until:** 2026-11-07 for repo facts (fast-moving branch); runner strings are stable until a `releaseTags.ts` bump (re-check on any runner upgrade).
