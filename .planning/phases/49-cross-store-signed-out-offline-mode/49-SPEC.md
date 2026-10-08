# Phase 49: Cross-store signed-out / offline mode — Specification

**Created:** 2026-10-08
**Ambiguity score:** 0.17 (gate: ≤ 0.20)
**Requirements:** 9 locked

## Goal

The Library gains one inline notice, above the games grid, that names every store the user is
signed out of or whose session has expired — across Epic, GOG, Amazon, Humble and Steam — with a
per-store Sign in action, fed by a single bounded boot-time probe pass, while cached libraries
still render and installed games stay launchable. Today that information exists only on the
Manage Accounts tiles (for all five) and in two store-specific surfaces (Humble's toast and
Steam's Library sync notice); nothing is proactive and nothing is cross-store.

## Background

Measured against the codebase on 2026-10-08 (scout report, this session).

**"Connected" is already cheap for every store.** All five `isLoggedIn()` implementations read a
config flag or check a file, with no network and no keyring: Epic
`existsSync(legendaryUserInfo)` (`src/backend/storeManagers/legendary/user.ts:692-694`), GOG
`get_nodefault('isLoggedIn')` (`gog/user.ts:386-388`), Amazon `get_nodefault('userData')`
(`nile/user.ts:306-308`), Humble a configStore flag (`src/backend/humble/user.ts:138-140`), Steam
a configStore flag (`steam/user.ts:87-89`).

**"Expired" is detected for only two stores, and surfaced differently for each.** Humble's
`checkHealthAndFlagExpiry()` (`humble/user.ts:754`) reads the `humble-session` keyring slot,
calls `getGamekeys`, and on a 401 latches `configStore.expired=true` and pushes
`humbleAuthState{expired:true}` (`:777-785`); a network error changes nothing (`:759-776`), a
403 deliberately changes nothing (`:786-787`). Steam's `ensureConnected()` (`steam/user.ts:103ff`)
latches `configStore.credentialsMissing=true` only when `readTokenOutcome()` returns `absent` — a
successful read of an empty slot (`:213-226`); an `unreadable` outcome keeps the session and is
NOT evidence of absence (`:199-212`, the rule quick task 260822-vov made load-bearing). Both flags
are allow-listed to the renderer in `src/common/types/storePolicy.ts:122-125,138-142`. Epic finds
out only at launch, when legendary stderr contains "No saved credentials" and `errorHandler`
opens a modal (`src/backend/utils.ts:363-417`, called from `launcher.ts:1766,1840`). GOG's
`getUserDetails()` (`gog/user.ts:227-298`) logs failures and tells nobody. Amazon has no expiry
concept at all.

**The existing surfaces are scattered and store-specific.** Manage Accounts (`screens/Login/`
— it IS the Login screen, `NavTabs/index.tsx:90`) shows "Connected" per tile for all five
(quick task 260815-kt0) and an expired state for Steam ("Sign-in expired — Reconnect",
`Login/index.tsx:428` via `steamTileState.ts:22-24`) and Humble (`:443-444`) only; the shared
`Runner` tile has no third state for the other three (`Login/index.tsx:93-95`, noted by
260822-vov). `HumbleExpiryToast` is a snackbar mounted in `App.tsx`. `SteamSyncNotice` renders
inline in the Library (`screens/Library/index.tsx:1039-1051,1171`) with a `signedOut` mode added
by 260823-ai6, decided by the pure module `screens/Library/librarySyncIndicator.ts`. `LoginWarning`
is a modal fired from store webviews for epic/gog/amazon/zoom (`screens/WebView/index.tsx:357-377`).
Since quick task 261003-s04 all five stores sign in through one `OAuthLogin` overlay on Manage
Accounts (`Login/components/OAuthLogin/`).

**Network connectivity is a separate, working surface and stays that way.** `OfflineMessage`
(`components/UI/OfflineMessage/index.tsx`) is mounted at the top of the non-console tree
(`App.tsx:123`) and driven by `src/backend/online_monitor.ts` (`online | offline | check-online`).
Under Tauri `net.isOnline()` always returns `true` (`platform/index.ts:880-893`), so boot always
starts in `check-online`. Every store except Epic already launches installed games offline without
a flag (`canRunOffline: true` in `gog/library.ts:492`, `nile/library.ts:90`,
`steam/library.ts:1191`); Epic passes `--offline` when `offlineMode` (`legendary/games.ts:1025`),
which `prepareLaunch` sets from `gameSettings.offlineMode || !isOnline()` (`launcher.ts:519-530`).

**The only keyring read at boot today is Humble's, and it is renderer-triggered.**
`GlobalState.tsx:1669-1671` runs `humbleCheckHealth().then(humbleSync)` on mount when Humble is
connected; that reads `humble-session` then `humble-csrf`. Two independent launches on macOS
under an ad-hoc signature measured ~12.5 s of unattended Keychain prompt latency across those two
slots (`.planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md`).
Steam's startup read was deferred by quick task 260817-d61: `authTrigger.ts:26-141` treats
`'startup'` as the one non-deliberate trigger that does not unlock the keyring. On Windows and
Linux the same keyring reads are silent. The sidecar `init()` (`src/backend/sidecar/bootstrap.ts:774`)
installs the secret stores without reading them (`:1085-1093`), starts the online monitor
(`:1151`), runs `reconcileStoreUsersWhenOnline` (`:1274`, Epic `existsSync` + GOG `getUserDetails`),
and emits the READY sentinel at `:1320`.

**Boot-time auth was the open design question, and this spec settles it.** The ROADMAP entry
(and the two keyring todos it parked) framed a tension: an accurate boot-time banner needs
boot-time auth state, which costs Keychain prompts on macOS. The operator chose to probe all
five stores at boot in one bounded pass (Interview Log, round 2), on the grounds that a banner
with two freshness semantics is unexplainable and a latched "connected" can be stale in exactly
the way 260822-vov fixed. That decision reverses 260817-d61's Steam deferral as a recorded
choice, and it permanently closes the parked Humble todo's unpark condition ("lands in a shape
that does not need boot-time auth state" — it does need it).

**Why the probe pass is bounded rather than avoided.** The prompt cost is macOS-and-signing
specific and the shipped prompt count is governed by Apple code signing, not read timing
(the Humble todo's finding 2). A bound keeps a dismissed or ignored Keychain prompt from holding
a store's verdict hostage: it degrades that store to `unknown`, which the notice does not show.

**Localisation shape.** 49 locale directories under `public/locales`, each with a fork-owned
`gamelib.json`; upstream `translation.json` is never written (`meta/__tests__/i18nCatalogChurnGuard.test.ts`).
`pnpm i18n` writes only `en`; the other 48 are filled by hand and stamped in per-locale
`gamelib.mt.json` manifests; `pnpm lint-translations:gamelib` treats an empty string as missing.
Phase 48's `48-01-PLAN.md` is the most recent worked example. The Frontend jest project has no
jsdom, which is why render decisions live in pure modules (`librarySyncIndicator.ts`).

## Requirements

1. **Per-store sign-in state**: A per-store sign-in state with exactly four values —
   `connected`, `not-connected`, `expired`, `unknown` — is computed for each of Epic, GOG,
   Amazon, Humble and Steam from the store's existing logged-in flag plus the latest probe
   outcome, and exposed to the renderer through the store-policy allow-list.
   - Current: five independent `isLoggedIn()` flags; an expired signal exists only for Humble
     (`expired`) and Steam (`credentialsMissing`), each with its own shape; no `unknown`.
   - Target: one pure selector yields exactly one of the four states per store; every flag it
     reads is allow-listed in `storePolicy.ts`; `unknown` is the result of a timeout, keyring
     denial or offline probe, never of an authentication failure.
   - Acceptance: a unit test enumerates every (logged-in flag × probe outcome) tuple for each of
     the five stores and asserts exactly one state; `storePolicy.test.ts` covers every new key.

2. **Expiry probe for Epic, GOG and Amazon**: Each of the three gains an expiry probe whose
   proven-expired verdict — an authentication failure, never a network error or timeout — is
   persisted as a per-store expired flag, cleared on a successful sign-in or a healthy probe.
   - Current: Epic learns of expiry only from legendary stderr at launch; GOG's refresh failure
     in `getCredentials()` is logged and dropped; Amazon has no expiry concept.
   - Target: a probe per store, each with a persisted expired flag of the same shape Steam and
     Humble already use, set only in the proven-expired branch and cleared at every
     proven-present site (successful sign-in, healthy probe).
   - Acceptance: per store, three tests: auth failure sets the flag; network error or timeout
     leaves it unchanged; successful sign-in clears it. A fourth test pins that the flag is
     never set from a non-auth failure branch (the 260822-vov negative).

3. **Bounded boot probe pass**: A single pass runs once per launch for all five stores after
   the READY sentinel and once online; each store's probe is time-bounded; a timeout, Keychain
   denial or offline state yields `unknown` for that store; the pass never delays READY and
   runs again when connectivity returns.
   - Current: only Humble is probed at boot, from the renderer on mount; Steam's `'startup'`
     trigger deliberately does not unlock the keyring; Epic/GOG/Amazon are never probed.
   - Target: one bootstrap block owns the pass; Humble's renderer-mount health check is folded
     into it (not run in addition); Steam's read goes through `authTrigger` under a new
     deliberate trigger, not around it; every probe handle is bounded and `unref()`'d so the
     sidecar still exits at stdin EOF.
   - Acceptance: a bootstrap ordering test proves READY is emitted before any probe starts; a
     probe that never resolves yields `unknown` within the bound; at most one pass per
     connectivity transition, and passes never overlap; the sidecar exit test shows no
     unbounded in-flight work from the pass.

4. **Library sign-in notice**: An inline notice above the Library games grid lists one row per
   store that is `expired`, or `not-connected` and not dismissed, each with a Sign in action;
   the notice does not render when the list is empty; `unknown` stores produce no row;
   `SteamSyncNotice`'s `signedOut` mode is removed so the Library has one sign-in surface.
   - Current: `SteamSyncNotice` shows a Steam-only `signedOut` mode; no other store has any
     Library surface.
   - Target: a pure render-decision module (no jsdom) produces the row list in canonical store
     order (Epic, GOG, Amazon, Humble, Steam); the component renders rows or nothing;
     `resolveSteamSyncIndicator` no longer has a `signedOut` branch.
   - Acceptance: tests for 0 rows → nothing rendered; one expired store → one row with Sign in;
     `unknown` → no row; two stores in the same state → two rows; order stable; a test asserts
     `signedOut` is absent from `librarySyncIndicator.ts` and its indicator union.

5. **Per-store persisted dismiss for never-connected rows**: A `not-connected` row carries a
   dismiss control whose choice is persisted across restarts; `expired` rows carry no dismiss;
   a dismissed store re-appears only if it later becomes `connected` and then `expired`.
   - Current: no dismiss concept; nothing to dismiss.
   - Target: one persisted dismissed-set keyed by store, independent of the state flags;
     re-armed by the connected→expired transition.
   - Acceptance: dismissed store omitted across a simulated restart; an expired row has no
     dismiss control; dismissing twice equals once; connect-then-expire re-shows the row
     exactly once; a held-out test pins that a dismiss persisted during a running pass survives.

6. **Sign in action**: The row's Sign in action navigates to Manage Accounts and opens that
   store's `OAuthLogin` overlay immediately; the row disappears when the store returns to
   `connected`.
   - Current: the overlay opens only from a tile click on Manage Accounts (261003-s04).
   - Target: the Manage Accounts route accepts a store parameter that opens the overlay for
     that runner on mount, once; row visibility is derived from state, not from an event.
   - Acceptance: navigation test from a row lands on Manage Accounts with the overlay open for
     that runner; a repeated click or a repeated route parameter opens one overlay; a sign-in
     completing while the Library is unmounted still yields no row when the Library returns.

7. **Manage Accounts tiles for all five**: Epic, GOG and Amazon tiles show an expired state with
   a Reconnect action, matching the existing Steam and Humble tiles, driven by the same
   per-store state as the notice.
   - Current: the shared `Runner` tile has no expired state for those three
     (`Login/index.tsx:93-95`).
   - Target: all five tiles derive their connected/expired display from Requirement 1's
     selector.
   - Acceptance: tile-state tests per store for connected and expired; a parity test asserts the
     tile and the notice read one selector and cannot disagree (the shape 260924-g7r used for
     `steamVisibility`).

8. **Signed-out stays playable**: For each of the five stores in the `expired` state, the cached
   library still renders and launching an installed game is not blocked by the notice or the
   probe; for Epic the launch proceeds in offline mode when the game can run offline.
   - Current: true today for GOG/Amazon/Humble/Steam by `canRunOffline: true`; Epic with expired
     credentials while online fails at launch with the stderr modal.
   - Target: no new code path consults the expired state to gate rendering or launch; Epic's
     launch treats an `expired` store like `offlineMode` for games with `canRunOffline`.
   - Acceptance: per store, with the expired flag set, the library selector returns the cached
     games and the launch path is not gated; an Epic launch under `expired` passes `--offline`
     when `canRunOffline`; a probe flipping a store to `expired` mid-launch does not abort it.

9. **Localisation**: Every new user-facing string lives in the `gamelib` namespace and is present
   and non-empty in all 49 locale catalogues, with each non-English fill stamped in that
   locale's `gamelib.mt.json` manifest.
   - Current: no strings exist for the notice, the dismiss control, or the three new tile states.
   - Target: keys under `gamelib:library.signIn.*` (or the namespace discuss-phase settles) in all
     49 `gamelib.json` files, including the six locales the picker never offers; store names
     enter strings via i18n interpolation variables, never concatenation.
   - Acceptance: `pnpm lint-translations:gamelib` passes; an explicit check shows 49 catalogues
     × every new key non-empty and 48 manifests stamped; `translation.json` is untouched.

## Boundaries

**In scope:**

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

**Out of scope:**

- Network connectivity reporting — `OfflineMessage` and `online_monitor.ts` stay as they are;
  round 1 kept the two concerns separate
- Zoom — a separate async credential check and not a roadmap store
- Console mode — a separate tree with no Library notice slot
- Removing or changing `HumbleExpiryToast` — round 2 kept it
- The `LoginWarning` modal fired from store webviews — unrelated trigger path
- Removing Epic's launch-time "credentials expired" stderr modal — it stays as the fallback for
  the window between a probe and a launch
- Redesigning the `Runner` tile beyond adding the expired state
- Any new OS notification for sign-in state
- Choosing the probe bound's value — a discuss-phase decision, constrained below
- macOS signing and notarization — governs how many prompts the user sees, tracked elsewhere

## Constraints

- **READY first.** The pass starts after the READY sentinel (`bootstrap.ts:1320`) and after the
  online monitor reports online; it may never be awaited by anything READY depends on.
- **Finite, explicit bound.** Each store's probe has a bound chosen in discuss-phase; it must be
  finite and no shorter than the existing bounded `keyring_get` timeout (REQ-34.4.1-GAP-11).
- **Sidecar exit contract** (`Skill("gamelib-conventions")`): every timer, watcher or child
  handle the pass creates is `unref()`'d, and the pass leaves no unbounded in-flight work; exit is
  by event-loop drain at stdin EOF.
- **`unreadable` is not `absent`.** A denied or timed-out keyring read yields `unknown`, never
  `expired` or `not-connected` (260822-vov).
- **Steam goes through `authTrigger`.** The boot read uses a new deliberate trigger, not a bypass
  of `authTrigger.ts`; the deferral this reverses (260817-d61) is recorded in the plan.
- **One pass, one Humble read.** The existing `GlobalState.tsx:1669-1671` health check is folded
  in, not duplicated; no keyring slot is read more than once per store per pass (P3).
- **Renderer tests have no jsdom.** Render decisions live in pure modules, as
  `librarySyncIndicator.ts` does.
- **Fake-HOME isolation** for every test that spawns legendary, gogdl or nile:
  `createFakeHomeProfile()`, never a hand-rolled `env` (`Skill("gamelib-conventions")`).
- **Fork-owned catalogues only.** `gamelib.json` in all 49 locales; `translation.json` untouched;
  the hardcoded-string gate (`meta/hardcodedStringGate.ts`) covers the new components.
- **Formatter check** in every task's `<verify>` block over the exact paths written.

## Acceptance Criteria

Core:

- [ ] For each of the five stores, every (logged-in flag × probe outcome) tuple maps to exactly
      one of `connected | not-connected | expired | unknown` (R1)
- [ ] Every new persisted key is allow-listed in `storePolicy.ts` and covered by its test (R1)
- [ ] Epic, GOG and Amazon each set their expired flag on an authentication failure, leave it
      unchanged on a network error or timeout, and clear it on successful sign-in (R2)
- [ ] READY is emitted before any probe starts (R3)
- [ ] A probe that never resolves yields `unknown` within the bound (R3)
- [ ] The pass runs at most once per connectivity transition and passes never overlap (R3)
- [ ] The Library notice renders nothing with zero rows, one row per `expired` or
      undismissed `not-connected` store, and no row for `unknown` (R4)
- [ ] `signedOut` is absent from `librarySyncIndicator.ts` and its indicator type (R4)
- [ ] A dismissed `not-connected` store stays hidden across restart; `expired` rows have no
      dismiss (R5)
- [ ] Sign in from a row lands on Manage Accounts with that store's `OAuthLogin` overlay open (R6)
- [ ] Epic, GOG and Amazon tiles show an expired state with Reconnect (R7)
- [ ] Tile and notice derive from one selector, pinned by a parity test (R7)
- [ ] For each of the five stores in `expired`, cached library renders and installed-game launch
      is not gated; Epic passes `--offline` when the game can run offline (R8)
- [ ] All new keys present and non-empty in 49 `gamelib.json` catalogues, 48 manifests stamped,
      `pnpm lint-translations:gamelib` green, `translation.json` unchanged (R9)

Edge criteria (from Edge Coverage, explicit rows):

- [ ] The state selector is pure: identical inputs yield identical state (R1 idempotency)
- [ ] A sign-in completing after a stale expired verdict yields `connected` (R1 concurrency)
- [ ] Two identical probe results set the flag once and emit one state change (R2 idempotency)
- [ ] A probe that began before a sign-in completed cannot re-set `expired` afterwards
      (R2 concurrency)
- [ ] A probe resolving at or after the bound yields `unknown`; one resolving just before yields
      its verdict (R3 boundary)
- [ ] The pass leaves no unbounded in-flight work; the sidecar exits at stdin EOF within the
      bound (R3 concurrency)
- [ ] Two stores in the same state are two rows, never merged (R4 adjacency)
- [ ] Rows follow the canonical order Epic, GOG, Amazon, Humble, Steam, stably (R4 ordering)
- [ ] Dismissing twice equals once; connect-then-expire re-arms the row exactly once
      (R5 idempotency)
- [ ] A repeated Sign in click or repeated route parameter opens one overlay (R6 idempotency)
- [ ] Row visibility is state-derived: a sign-in completing while the Library is unmounted
      leaves no row on return (R6 concurrency)
- [ ] A probe flipping a store to `expired` mid-launch does not abort the launch
      (R8 concurrency)
- [ ] An empty string in any catalogue counts as missing (R9 empty)
- [ ] Store names enter strings via interpolation variables, never concatenation (R9 encoding)

Negative criteria (from Prohibitions):

- [ ] MUST NOT report a store as `expired` on a timeout, Keychain denial or network error (P1)
- [ ] MUST NOT be modal, emit an OS notification, or open any login overlay or webview without an
      explicit Sign in click (P2)
- [ ] MUST NOT read a keyring slot more than once per store per pass, and MUST NOT re-probe on
      Library mount or navigation (P3)
- [ ] A never-connected row MUST NOT be worded or styled as an error or failure (P4, judgment)

## Edge Coverage

**Coverage:** 23/23 applicable edges resolved · 0 unresolved
(17 explicit · 1 backstop · 5 dismissed)

| Category    | Requirement | Status       | Resolution / Reason                                                                   |
| ----------- | ----------- | ------------ | ------------------------------------------------------------------------------------- |
| idempotency | R1          | ✅ covered   | AC: selector is pure                                                                  |
| concurrency | R1          | ✅ covered   | AC: later sign-in beats stale expired verdict                                         |
| idempotency | R2          | ✅ covered   | AC: identical results set flag once, one state change                                 |
| concurrency | R2          | ✅ covered   | AC: pre-sign-in probe cannot re-set expired                                           |
| boundary    | R3          | ✅ covered   | AC: at/after bound → unknown; just before → verdict                                   |
| precision   | R3          | ⛔ dismissed | The bound is a coarse timer; no arithmetic is performed on its value                  |
| idempotency | R3          | ✅ covered   | AC: one pass per connectivity transition, no overlap                                  |
| concurrency | R3          | ✅ covered   | AC: no unbounded in-flight work; stdin-EOF exit within bound                          |
| adjacency   | R4          | ✅ covered   | AC: same-state stores are separate rows                                               |
| empty       | R4          | ✅ covered   | AC: zero rows renders nothing                                                         |
| ordering    | R4          | ✅ covered   | AC: canonical store order, stable                                                     |
| idempotency | R5          | ✅ covered   | AC: dismiss twice = once; re-arm exactly once                                         |
| concurrency | R5          | 🧪 backstop  | Held-out test: dismiss persisted during a running pass survives the pass's state write |
| idempotency | R6          | ✅ covered   | AC: repeated click/param opens one overlay                                            |
| concurrency | R6          | ✅ covered   | AC: visibility is state-derived across unmount                                        |
| idempotency | R7          | ⛔ dismissed | Tile is a pure render of R1's state; idempotency is R1's                              |
| concurrency | R7          | ✅ covered   | AC: parity test, one selector for tile and notice                                     |
| idempotency | R8          | ⛔ dismissed | Launch idempotency belongs to the existing launcher, unchanged by this phase          |
| concurrency | R8          | ✅ covered   | AC: mid-launch expiry does not abort launch                                           |
| adjacency   | R9          | ⛔ dismissed | Flat key namespace; `lint-translations:gamelib` fails on duplicate or missing keys    |
| empty       | R9          | ✅ covered   | AC: empty string counts as missing                                                    |
| encoding    | R9          | ✅ covered   | AC: interpolation variables, never concatenation                                      |
| ordering    | R9          | ⛔ dismissed | JSON key order is irrelevant to i18next lookup                                        |

The `🧪 backstop` row must be carried into plan-phase `must_haves`.

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved
(3 test · 1 judgment). Canon breadcrumb: credential or token leakage into logs or probe
payloads is canon security — owned by `/gsd-secure-phase` and eslint; not minted here.

| Prohibition (must-NOT statement)                                                                                                | Requirement | Status   | Verification / Reason                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------- |
| MUST NOT report a store as `expired` on a timeout, Keychain denial or network error; only an authentication failure counts     | R1, R2, R3  | resolved | test — negative branch tests per store (the 260822-vov negative)                                  |
| MUST NOT be modal, emit an OS notification, or open any login overlay or webview without an explicit Sign in click             | R4, R6      | resolved | test — notice is not a `Dialog`; no `notify()` call site; overlay opens only from the row action |
| MUST NOT read a keyring slot more than once per store per pass, and MUST NOT re-probe on Library mount or navigation          | R3          | resolved | test — keyring read counter per pass; Library mount triggers no probe                             |
| A never-connected row MUST NOT be worded or styled as an error or failure; it is informational, only `expired` rows are warnings | R4          | resolved | judgment — routes to UI/judgment review                                                           |

No wired-check descriptors captured yet (the negative tests do not exist until plan-phase);
`test`-tier rows stay fail-closed downstream until plan-phase names them.

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                              |
| ------------------- | ----- | ----- | ------ | ------------------------------------------------------------------ |
| Goal Clarity        | 0.88  | 0.75  | ✓      | One Library notice, five stores, bounded boot pass                 |
| Boundary Clarity    | 0.85  | 0.70  | ✓      | Network, Zoom, Console mode, Humble toast explicitly out           |
| Constraint Clarity  | 0.76  | 0.65  | ✓      | Bound value deferred to discuss-phase, but bounded below by GAP-11 |
| Acceptance Criteria | 0.78  | 0.70  | ✓      | 14 core + 14 edge + 4 negative checkboxes                          |
| **Ambiguity**       | 0.17  | ≤0.20 | ✓      |                                                                    |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective             | Question summary                                              | Decision locked                                                                                                              |
| ----- | ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | Researcher              | Which conditions: never-connected, expired, network offline?  | Never-connected + expired; network stays with `OfflineMessage`                                                                |
| 1     | Researcher              | Consolidate existing detection, or add expiry for Epic/GOG/Amazon? | Add detection for all three                                                                                              |
| 1     | Researcher              | What is the felt gap?                                         | Nothing proactive outside Manage Accounts                                                                                    |
| 2     | Researcher + Simplifier | When is expiry probed, given the Keychain cost?               | Boot, all five, bounded. Operator challenged the initial keyring-free recommendation as inconsistent; recommendation revised |
| 2     | Simplifier              | Where does the surface live?                                  | Inline notice at top of Library, `SteamSyncNotice` shape                                                                     |
| 2     | Simplifier              | Fate of Humble toast, Steam notice, tiles?                    | Absorb Steam `signedOut`; keep Humble toast; extend tiles to all five                                                        |
| 3     | Boundary Keeper         | Never-used stores shown forever?                              | Per-store persisted dismiss on `not-connected` rows only                                                                     |
| 3     | Boundary Keeper         | Zoom and Console mode?                                        | Five stores, main tree only                                                                                                  |
| 3     | Boundary Keeper         | What shows for timeout/denied/offline?                        | Nothing — `unknown` is not a warning                                                                                         |
| 4     | Failure Analyst         | Where does Sign in go?                                        | Manage Accounts with the store's `OAuthLogin` overlay pre-opened                                                             |
| 4     | Failure Analyst         | Is "still playable" a requirement or a baseline?              | Locked requirement, tested per store                                                                                         |
| 4     | Failure Analyst         | Persist Epic/GOG/Amazon expiry verdicts?                      | Persisted per-store flag, Steam/Humble shape                                                                                 |
| 5.5   | Edge probe              | 23 engine-raised edges                                        | 17 explicit, 1 backstop, 5 dismissed with reasons — accepted as proposed                                                     |
| 5.6   | Prohibition probe       | 4 kept, 1 canon breadcrumb                                    | P1–P3 test tier, P4 judgment — accepted as proposed                                                                          |

**Consequence recorded:** the round-2 decision permanently closes the unpark condition of
`.planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` — this
phase does need boot-time auth state. That todo's measured evidence (the ~12.5 s of prompts) is
not withdrawn; it is the reason R3 is bounded.

---

_Phase: 49-cross-store-signed-out-offline-mode_
_Spec created: 2026-10-08_
_Next step: /gsd-discuss-phase 49 — implementation decisions (probe bound value, state storage
shape, notice component and dismiss persistence, Steam `authTrigger` trigger name, i18n key
namespace)_
