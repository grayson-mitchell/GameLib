# Phase 49: Cross-store signed-out / offline mode - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

One inline notice above the Library games grid that names every store the user is signed out of
or whose session has expired — Epic, GOG, Amazon, Humble, Steam — each with a Sign in action, fed
by a single bounded boot-time probe pass that runs after READY and once online, while cached
libraries still render and installed games stay launchable. Network connectivity reporting stays
with `OfflineMessage`; this phase is about store sessions, not the wire.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**9 requirements are locked.** See `49-SPEC.md` for full requirements, boundaries, and acceptance
criteria.

Downstream agents MUST read `49-SPEC.md` before planning or implementing. Requirements are not
duplicated here.

**In scope (from SPEC.md):**

- A four-value per-store sign-in state for Epic, GOG, Amazon, Humble and Steam, allow-listed to
  the renderer
- Expiry probes and persisted expired flags for Epic, GOG and Amazon
- One bounded boot-time probe pass after READY, covering all five stores, including the Steam
  and Humble keyring reads; Humble's renderer-mount health check folded into it
- The inline Library sign-in notice with per-store rows, Sign in actions and canonical ordering
- Per-store persisted dismiss for never-connected rows
- Sign in routing to Manage Accounts with the `OAuthLogin` overlay pre-opened
- Expired tile state for Epic, GOG and Amazon on Manage Accounts
- Removal of `SteamSyncNotice`'s `signedOut` mode
- Epic launch in offline mode when its store is `expired` and the game can run offline
- Strings in all 49 catalogues with provenance stamps

**Out of scope (from SPEC.md):**

- Network connectivity reporting — `OfflineMessage` and `online_monitor.ts` stay as they are
- Zoom — a separate async credential check and not a roadmap store
- Console mode — a separate tree with no Library notice slot
- Removing or changing `HumbleExpiryToast`
- The `LoginWarning` modal fired from store webviews
- Removing Epic's launch-time "credentials expired" stderr modal — it stays as the fallback
- Redesigning the `Runner` tile beyond adding the expired state
- Any new OS notification for sign-in state
- macOS signing and notarization

The SPEC left five implementation choices to this discussion (probe bound value, state storage
shape, notice component and dismiss persistence, Steam `authTrigger` trigger name, i18n key
namespace). All five are settled below. No SPEC amendment was needed.

</spec_lock>

<decisions>
## Implementation Decisions

### Probe pass: bound and concurrency

- **D-01:** Every store's probe bound is **45 s**, one value for all five. That is exactly the
  Rust `KEYRING_READ_TIMEOUT` (`src-tauri/src/main.rs:3079`, `Duration::from_secs(45)`), which is
  the floor the SPEC's "no shorter than the bounded `keyring_get` timeout" constraint
  (REQ-34.4.1-GAP-11) names. A Keychain prompt that is ignored therefore degrades its store to
  `unknown` at the same moment the keyring read itself gives up. The sidecar's 60 s
  `RUST_INVOKE_TIMEOUT_MS` (`src/backend/sidecar/sidecarRpc.ts:60`) is the ceiling, not the
  bound. Name the constant once; the R3 boundary test reads it rather than a literal.
  **Reversibility:** reversible — one constant.
- **D-02:** The five probes run **in parallel**: one 45 s window for the whole pass, not five
  sequential windows. Keychain prompts queue at the OS level anyway, and a signed release build
  prompts at most once per slot, so prompt stacking is a dev-build concern only. The pass is
  "complete" when every probe has resolved or the bound has elapsed, whichever is first per store.
- **D-03:** Within one launch the pass re-runs **only on a connectivity transition** (the online
  monitor flipping back to `online`). No re-run on sign-in, on a deliberate Steam trigger, on
  Library mount, or on a timer. This is the SPEC's "at most one pass per connectivity transition,
  passes never overlap" read literally, and it keeps the sidecar exit contract to a single bounded
  timer per probe. A successful sign-in clears that store's expired flag at the proven-present
  site (R2); it does not need the pass to notice.
- **D-04:** **No dev special-casing.** The pass has one code path on every platform and build.
  Dev-build Keychain prompts under an ad-hoc signature are addressed by
  `GAMELIB_DEV_SECRET_VAULT=1` (`src/backend/sidecar/devSecretVault.ts`), which serves the slots
  from the vault with no Keychain read. No env var disables the pass; no branch skips the keyring
  stores when the vault is off.

### State shape and selector home

- **D-05:** The new Epic, GOG and Amazon expired flags live in **per-store config stores**,
  mirroring `steamConfigStore.credentialsMissing` and `humbleConfigStore.expired`: an `expired`
  key on `gogConfigStore` and `nileConfigStore`, plus a **new small legendary-side config store**
  for Epic, which today has no store at all (its logged-in check is `existsSync` on
  `legendaryUserInfo`). Each new key is one line in `STORE_ALLOWLIST`
  (`src/common/types/storePolicy.ts`) and one case in `storePolicy.test.ts`. The single
  `signInStateStore` alternative was rejected because Steam and Humble would then have two sources
  of truth. **Reversibility:** costly — three persisted keys and one new store file become part of
  the on-disk config shape; moving them later means a migration like `focusRowMigration.ts`.
- **D-06:** The pure four-value selector lives in **`src/common`**, one module consumed by the
  bootstrap pass, the Manage Accounts tiles (`Login/index.tsx`, replacing `steamTileState.ts`'s
  Steam-only `isSteamConnected`) and the Library notice. The R7 parity test then pins that both
  surfaces call the same function. Backend-computes-and-pushes-state was rejected because the
  state would become an event rather than a derivation.
- **D-07:** **A latched expired flag beats a pending or `unknown` probe.** Input tuple rule for
  the selector: `expired` flag set → `expired`, regardless of whether this launch's probe is still
  running, timed out, was denied or was offline. `unknown` applies only to a store whose
  logged-in flag is set and which has **no latched verdict** and whose probe is pending or
  returned `unknown`. Consequences the planner must carry: the row for a known-expired store
  shows at boot before the pass finishes; a Keychain denial never hides a proven expiry; a row
  never vanishes mid-session without a user action or a healthy probe. `not-connected` is the
  logged-in flag being false and needs no probe at all.
- **D-08:** This launch's probe outcomes reach the renderer as **one pushed message carrying a
  per-store outcome map** (`sendFrontendMessage`, the channel `humbleAuthState` already uses),
  kept in sidecar memory, sent when the pass completes and again after each connectivity re-run.
  Nothing new is persisted beyond the expired flags, so a restart resets every outcome to pending
  by construction. The renderer stores the map in `GlobalState` and feeds it to the D-06 selector.

### Notice component, dismiss, strings

- **D-09:** The notice is a **new `LibrarySignInNotice` component** beside `SteamSyncNotice`,
  not a generalisation of it. It inherits `SteamSyncNotice`'s structural contract verbatim: one
  `<div>` in normal document flow, never `position: absolute/fixed`, never an early return that
  replaces siblings, so it can never cover the grid (the 34.15 defect 2b rule). It reuses the
  same CSS family. `SteamSyncNotice` keeps `syncing` and `failed` only; its `signedOut` mode and
  the `signedOut` branch of `resolveSteamSyncIndicator` are deleted (R4). The row-list decision
  is a pure module beside `librarySyncIndicator.ts` with the same no-jsdom rationale.
- **D-10:** The per-store dismissed set persists as a **`GlobalConfig` AppSettings key** (an
  array of runner names, e.g. `dismissedSignInNotices`), the same home Phase 48 gave
  `focusRow` (`src/common/types.ts:155`, `src/backend/config.ts`). The pass writes only
  per-store config stores and never touches AppSettings, which is what makes the SPEC's held-out
  backstop test (a dismiss persisted during a running pass survives) structurally true rather than
  racy. Re-arm on the connected→expired transition (R5) is a removal from this array at the
  proven-present site. **Reversibility:** costly — a persisted settings key; removing it later
  needs the same retired-setting handling `libraryTopSection` got in 48-05.
- **D-11:** **Two visual weights, one layout.** `expired` rows use the existing warning styling
  with the `faExclamationTriangle` icon and a Reconnect-flavoured Sign in; `not-connected` rows
  are neutral — store icon, plain text of the shape "GOG is not connected", Sign in, and the
  dismiss control. One row component with a `kind` prop that picks the class. This is the
  concrete form of prohibition P4 (a never-connected row must not read as an error).
- **D-12:** i18n keys for the notice live under **`gamelib:library.signIn.*`**, beside the
  `library.steamSync.*` keys this notice partly replaces. The three new tile strings (Epic, GOG,
  Amazon expired/Reconnect) live under the existing **`gamelib:login.*`** namespace next to
  `login.steamReconnect`. Store names enter every string through an interpolation variable
  (R9). All 49 `gamelib.json` catalogues, 48 `gamelib.mt.json` stamps, `translation.json`
  untouched — `48-01-PLAN.md` is the worked example.

### Sign in routing and Steam trigger

- **D-13:** A row's Sign in navigates to **`/login?open=<runner>`** (query param via
  `useSearchParams`). The Manage Accounts mount effect reads the param, calls the existing
  `openLoginOverlay` for that runner **once**, and clears the param from the URL so back
  navigation or a repeat visit does not reopen the overlay (R6 idempotency). Navigation state and
  a path segment were rejected: state is invisible to URL-rendered tests and lost on refresh; a
  path segment changes the route definition every existing `navigate('/login')` caller depends on.
- **D-14:** The new Steam auth trigger is **`'boot-probe'`**, added to `SteamAuthTrigger` and to
  `DELIBERATE_TRIGGERS` in `src/backend/storeManagers/steam/authTrigger.ts`, with the **sticky
  unlock** every deliberate trigger has. Reusing `'user-refresh'` was rejected because the
  `trigger=` label exists to measure which action caused a keyring read, and a boot read is not a
  user refresh. A non-sticky variant was rejected because it adds a third gate state to a module
  built around two, to preserve a deferral (260817-d61) the SPEC has already reversed. The plan
  records the reversal explicitly, as the SPEC's constraint requires.
- **D-15:** Humble's keyring reads during the pass carry a **`trigger=boot-probe` label** too.
  Thread an optional trigger string through the Humble slot read
  (`src/backend/sidecar/humbleSecretStore.ts` / `keyringTokenStore.ts`) so the log line no longer
  reads `trigger=unspecified` — **without** importing the Steam gate module, which the folded
  todo explicitly asked for. The Steam gate stays Steam-only.
- **D-16:** `GlobalState.tsx:1669-1671` currently runs `humbleCheckHealth().then(humbleSync)` on
  mount. The **health call is removed from the renderer** (folded into the pass, R3); the
  **`humbleSync` call stays on mount** unchanged. The pass never triggers library sync for any
  store. Humble's sync keeps its own 401 handling, so it still latches expiry if it runs before
  the probe lands.

### Research-driven decisions (added 2026-10-08 after `49-RESEARCH.md`)

- **D-17:** **GOG expiry rule.** `gogdl auth` prints a bare `null` for any non-OK refresh and
  logs `Failed to refresh credentials` only on a connection error. The GOG probe latches
  `expired` when: stdout is `null`, no connection-error line was logged, the online monitor says
  online, and the GOG auth config file is present. A rare GOG 5xx is therefore read as expired
  until the next healthy probe or sign-in clears it; the operator accepted that residual over the
  alternative, which rotates GOG's refresh token. The verdict logic lives inside
  `GOGUser.getCredentials` because `callRunner` joins identical in-flight commands and Block E
  already spawns `gogdl auth` at boot.
- **D-18:** **Humble csrf backfill is dropped from the boot pass.** The pass does the
  `humble-session` read plus `getGamekeys` only; it never opens the hidden csrf-backfill webview
  `checkHealthAndFlagExpiry()` opens today (that would violate P2). The csrf token is backfilled by
  the first deliberate Humble action that needs it. Correction to D-16's premise: Humble's library
  sync does **not** latch expiry (`humble/library.ts` `session_expired` branches return
  `{ status: 'failed' }` only), so after D-16 the pass is the only Humble latch site; the health
  check must return an outcome that keeps `unreadable` distinct from `absent`.
- **D-19:** **Steam sync notice under missing credentials: suppress-only.**
  `resolveSteamSyncIndicator` keeps `steamCredentialsMissing` as an input and returns `'hidden'`
  when `steamSyncStatus === 'failed' && steamCredentialsMissing`, so the generic "Couldn't sync /
  Retry" notice never renders beside the new expired row. The `signedOut` mode and token are still
  deleted everywhere (R4); the acceptance test forbids the word, not the suppression.
- **D-20:** **Smoke gate stays at 30 s.** `meta/sidecarStartupSmoke.cjs` is not changed. The plan
  documents that the gate measures a cold profile (nothing logged in, nothing probed) and that a
  warm local run can exceed 30 s only because the 45 s bound is still draining; the abort at the
  bound `unref()`s every handle.
- **D-21:** **Steam probe reads the keyring only, never `ensureConnected()`.** The pass issues the
  bounded `keyring_get` through `authTrigger` with `'boot-probe'` and classifies
  `absent` → expired, `unreadable` → unknown, present → connected; it never opens a CM connection.
  The sticky unlock means later automatic `SteamLibraryManager.refresh()` calls may connect; that
  is the recorded reversal of 260817-d61 and the plan prose states it.

### Claude's Discretion

- What each HTTP-store probe actually calls (legendary / gogdl / nile invocation or a direct token
  endpoint), subject to the SPEC's rule that only an authentication failure is a verdict and the
  fake-HOME isolation convention for any spawned child.
- The exact shape of the pushed outcome message and its `common/types/ipc` name.
- The `common` selector's module and function names, and how `steamTileState.ts` is retired.
- Exact wording of the row strings within D-11's tone rule.
- How the probe's `unref()`'d bound timer and the per-store promise race are structured, within
  the sidecar exit contract.

### Folded Todos

- **`.planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md`** —
  "Humble's two keyring slots still read unattended at bootstrap." Original problem: ~12.5 s of
  unattended Keychain prompt latency across `humble-session` and `humble-csrf`, measured on two
  launches, with `trigger=unspecified`. The SPEC's round-2 decision permanently supersedes its
  remedy (deferring the read) and the file says to close it when the R3 plan lands. In this phase:
  D-01's bound carries its measured evidence forward as the reason R3 is bounded; D-15 delivers the
  Humble-specific trigger label it asked for; D-04 records that the dev-mode symptom belongs to
  `GAMELIB_DEV_SECRET_VAULT=1`. The plan that lands R3 must set `resolves_phase:` on this file and
  close it.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope

- `.planning/phases/49-cross-store-signed-out-offline-mode/49-SPEC.md` — Locked requirements —
  MUST read before planning. Nine requirements, boundaries, constraints, edge coverage
  (including the one `🧪 backstop` row that must become a `must_have`), prohibitions P1–P4, and
  the Interview Log recording why boot-time probing was chosen.
- `.planning/ROADMAP.md` § Phase 49 — the goal statement, the dependency on Phase 35, and the
  history of how the two keyring todos were parked.

### Folded evidence

- `.planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` — the
  measured prompt latency, the three 2026-09-04 findings, the Keychain-only nature of the Humble
  slots, and the request for a Humble-specific trigger label (D-15). Close with `resolves_phase:`
  when R3 lands.
- `.planning/quick/260817-d61-defer-the-steam-keyring-read-from-startu/260817-d61-LIVE-GATE.md`
  — the Steam deferral this phase reverses (D-14) and the evidence logs.

### Conventions and worked examples

- `Skill("gamelib-conventions")` — sidecar exit contract (every handle `unref()`'d, no unbounded
  boot work), fake-HOME isolation for spawned children, `<verify>` formatter check, todo
  frontmatter for the closure in Folded Todos.
- `.planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-01-PLAN.md`
  — the most recent worked example of landing keys across all 49 `gamelib.json` catalogues with
  `gamelib.mt.json` stamps (D-12).
- `.planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-CONTEXT.md`
  — the AppSettings persistence pattern (`focusRow`) D-10 reuses, and the retired-setting handling
  from 48-05.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/frontend/screens/Library/components/SteamSyncNotice/index.tsx` + `index.scss` — the
  in-flow notice contract and CSS family `LibrarySignInNotice` copies (D-09); loses `signedOut`.
- `src/frontend/screens/Library/librarySyncIndicator.ts` — the pure render-decision pattern
  (no jsdom) the row-list module follows; loses its `signedOut` branch.
- `src/backend/storeManagers/steam/authTrigger.ts` — leaf gate module; `DELIBERATE_TRIGGERS` set
  and `ORIGIN_TO_TRIGGER` allowlist; gains `'boot-probe'` (D-14).
- `src/backend/sidecar/keyringTokenStore.ts` — slot-agnostic keyring read with `trigger=`
  logging and the timeout/unavailable classification; D-15 threads a Humble label through it.
- `src/common/types/storePolicy.ts` `STORE_ALLOWLIST` — one line per new persisted key (D-05);
  `storePolicy.test.ts` must cover each.
- `src/frontend/screens/Login/index.tsx` — `openOverlay` state and `openLoginOverlay`; the
  `OAuthLogin` overlay for all five runners (261003-s04); D-13 adds the `?open=` consumer.
- `src/frontend/screens/Login/steamTileState.ts` — the pure tile-state function the D-06
  selector replaces.
- `src/backend/config.ts` + `src/common/types.ts` `AppSettings` — Phase 48's `focusRow` shows
  how a persisted setting with migration/default is added (D-10).
- `src/backend/sidecar/bootstrap.ts` `reconcileStoreUsersWhenOnline()` (`:460`, invoked `:1274`)
  — the existing after-READY, when-online block whose catch-arm shape the pass follows; READY
  sentinel at `:1320`.
- `src/backend/humble/user.ts` `checkHealthAndFlagExpiry()` (`:754`) — the only existing boot
  probe; its 401-latches / network-error-no-op / 403-no-op branches are the template for the three
  new probes.

### Established Patterns

- **Expired-flag shape:** `humbleConfigStore.expired` and `steamConfigStore.credentialsMissing`
  are latched only in a proven branch and cleared at proven-present sites (260822-vov). D-05
  extends this shape; D-07 makes the latched flag authoritative over an unresolved probe.
- **`unreadable` is not `absent`:** `steam/user.ts:199-226` — a denied or timed-out keyring read
  is never evidence of absence. The pass maps it to `unknown` (P1).
- **Pure modules for render decisions** because the Frontend jest project has no jsdom.
- **Sidecar exit by event-loop drain:** every timer the pass creates is `unref()`'d; the 45 s
  bound is the only in-flight work and it is bounded by construction.
- **Fork-owned catalogues:** `gamelib.json` only; `pnpm i18n` writes `en`; the other 48 are hand
  filled and stamped; `meta/hardcodedStringGate.ts` covers new components.

### Integration Points

- Bootstrap: a new block after `:1274`/before or after READY at `:1320` that starts the pass only
  once online and never delays READY (R3 ordering test).
- Renderer: `GlobalState.tsx` receives the D-08 outcome map; `Library/index.tsx:1039-1051,1171`
  swaps the Steam `signedOut` mount for `LibrarySignInNotice`; `GlobalState.tsx:1669-1671` drops
  `humbleCheckHealth` (D-16).
- Launch: `launcher.ts:519-530` `prepareLaunch` offline decision gains the Epic `expired` case for
  `canRunOffline` games (R8); no other launch or library path reads the state.
- Manage Accounts: `Login/index.tsx:93-95` `Runner` tile gains the expired state for the three
  stores, driven by the D-06 selector (R7).

</code_context>

<specifics>
## Specific Ideas

- The Steam client is the reference UX (ROADMAP): say plainly what is not signed in, then get out
  of the way. The notice is a list of rows, not a banner with a paragraph.
- "GOG is not connected" is the tone for a never-connected row; "Your Steam sign-in expired" is
  the existing tone for an expired row and is kept.
- Row order is canonical and stable: Epic, GOG, Amazon, Humble, Steam.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)

- `.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md`
  — the store webview's Sign in button. Out of scope: the SPEC excludes the webview `LoginWarning`
  path, and the todo is itself blocked because `/store/epic` is gated off the embed.

No other ideas came up; the discussion stayed within phase scope.

</deferred>

---

_Phase: 49-cross-store-signed-out-offline-mode_
_Context gathered: 2026-10-08_
