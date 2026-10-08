# Phase 49: Cross-store signed-out / offline mode - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-08
**Phase:** 49-cross-store-signed-out-offline-mode
**Areas discussed:** Probe pass: bound and concurrency; State shape and selector home; Notice
component, dismiss, strings; Sign in routing and Steam trigger

SPEC.md (9 requirements) was loaded first, so every question below is about HOW, not WHAT. The
SPEC's own "next step" line named the five open implementation choices; all five are settled.

---

## Todo cross-reference

Twelve pending todos keyword-matched the phase. Ten were noise (tile size, sort menu, login
sheet corner, LZMA, F-9 RPC timeout, audit-uat, Windows signing, blank render, locale keys,
Windows shortcuts). Two were presented.

| Option                                        | Description                                                           | Selected |
| --------------------------------------------- | --------------------------------------------------------------------- | -------- |
| Humble keyring slots prompt at boot (2026-08-17) | SPEC already says to close it when R3 lands; carries measured evidence | ✓        |
| Epic in-embed Sign in button (2026-09-15)     | Webview path is out of scope per SPEC; todo itself blocked            |          |

**User's choice:** Fold the Humble todo; the Epic one is reviewed, not folded.

---

## Probe pass: bound and concurrency

### Probe bound

| Option                             | Description                                                              | Selected |
| ---------------------------------- | ------------------------------------------------------------------------ | -------- |
| 45 s, one value for all five       | Exactly the Rust keyring floor; ignored prompt and keyring give up together | ✓      |
| 60 s, one value for all five       | Matches the RPC timeout; margin above the keyring limit; slower unknown  |          |
| Two tiers                          | 45 s keyring stores, shorter HTTP stores; would need a SPEC amendment    |          |

**User's choice:** 45 s, one value for all five.

### Concurrency

| Option                                      | Description                                                        | Selected |
| ------------------------------------------- | ------------------------------------------------------------------ | -------- |
| All five in parallel                        | One 45 s window; prompts queue at the OS; stacking is dev-only     | ✓        |
| HTTP parallel, keyring stores sequential    | Humble then Steam one at a time; worst case ~135 s                 |          |
| Strictly sequential, canonical order        | Lowest peak load; last verdict minutes after boot                  |          |

**User's choice:** All five in parallel.

### Unknown retry

| Option                              | Description                                                      | Selected |
| ----------------------------------- | ---------------------------------------------------------------- | -------- |
| Only on a connectivity transition   | SPEC read literally; no timers beyond the bound                  | ✓        |
| Also when the user signs in         | Whole pass re-runs on any sign-in; second trigger for no-overlap |          |
| Also on a deliberate Steam trigger  | Steam-only re-probe via existing gate triggers                   |          |

**User's choice:** Only on a connectivity transition.

### Dev prompts

| Option                                     | Description                                                      | Selected |
| ------------------------------------------ | ---------------------------------------------------------------- | -------- |
| No special casing                          | One code path; `GAMELIB_DEV_SECRET_VAULT=1` is the dev remedy    | ✓        |
| Skip keyring stores when the dev vault is off | Dev-only branch; tests cover it twice                         |          |
| Env var to disable the whole pass          | Escape hatch; second behaviour for ordering tests to pin         |          |

**User's choice:** No special casing.

---

## State shape and selector home

### Flag storage

| Option                              | Description                                                                | Selected |
| ----------------------------------- | -------------------------------------------------------------------------- | -------- |
| Per-store config stores             | `expired` on gog/nile stores plus a new legendary store; mirrors Steam/Humble | ✓     |
| One new signInStateStore for all five | Single store keyed by runner; two sources of truth for Steam and Humble  |          |

**User's choice:** Per-store config stores.

### Selector home

| Option                                   | Description                                                   | Selected |
| ---------------------------------------- | ------------------------------------------------------------- | -------- |
| src/common, shared by both sides         | One pure module; R7 parity test becomes trivial               | ✓        |
| Backend computes, renderer receives map  | State is an event rather than a derivation                    |          |

**User's choice:** src/common, shared by both sides.

### Stale flags

| Option                                                   | Description                                                        | Selected |
| -------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Latched flag wins; unknown only without a prior verdict  | Row shows at boot; denial never hides a proven expiry              | ✓        |
| Unknown wins; show nothing until proven this launch      | Cleaner semantics; up to 45 s flicker; denial hides known expiry   |          |
| Latched before the pass, unknown after a failed probe    | Row can vanish mid-session without user action                     |          |

**User's choice:** Latched flag wins; unknown only without a prior verdict.

### Outcome path

| Option                                       | Description                                                       | Selected |
| -------------------------------------------- | ----------------------------------------------------------------- | -------- |
| Pushed message with a per-store outcome map  | In-memory, sent on pass completion and each rerun; restart resets | ✓        |
| Persist the outcome next to the expired flag | More allow-list keys; stale outcome survives restart              |          |

**User's choice:** Pushed message with a per-store outcome map.

---

## Notice component, dismiss, strings

### Component

| Option                                          | Description                                                        | Selected |
| ----------------------------------------------- | ------------------------------------------------------------------ | -------- |
| New LibrarySignInNotice beside SteamSyncNotice  | Borrows the in-flow contract and CSS family; two clear jobs        | ✓        |
| Generalise SteamSyncNotice into a LibraryNotice | One component, rows for sync and sign-in; sync tests rewritten     |          |

**User's choice:** New LibrarySignInNotice beside SteamSyncNotice.

### Dismiss store

| Option                                     | Description                                                            | Selected |
| ------------------------------------------ | ---------------------------------------------------------------------- | -------- |
| GlobalConfig AppSettings key               | Phase 48 focus-row home; pass never touches settings, backstop trivial | ✓        |
| configStore key allow-listed in storePolicy | Pass writes config stores; backstop must prove no collision           |          |
| Renderer localStorage                      | Per-machine, invisible to the sidecar, no migration path              |          |

**User's choice:** GlobalConfig AppSettings key.

### Row tone

| Option                                       | Description                                                          | Selected |
| -------------------------------------------- | -------------------------------------------------------------------- | -------- |
| Two visual weights, one layout               | expired = warning + triangle; not-connected = neutral + store icon   | ✓        |
| Warnings only; not-connected rows plain text | Muted single line, no icon                                           |          |
| Both neutral                                 | Expired looks no more urgent than never-used                         |          |

**User's choice:** Two visual weights, one layout.

### i18n keys

| Option                        | Description                                                                 | Selected |
| ----------------------------- | --------------------------------------------------------------------------- | -------- |
| gamelib:library.signIn.*      | Beside library.steamSync; tile strings under existing login.*               | ✓        |
| gamelib:signIn.* top-level    | One namespace for notice and tiles; breaks screen-per-namespace convention  |          |

**User's choice:** gamelib:library.signIn.* (tiles under login.*).

---

## Sign in routing and Steam trigger

### Route param

| Option                                   | Description                                                           | Selected |
| ---------------------------------------- | --------------------------------------------------------------------- | -------- |
| Query param: /login?open=steam           | Readable, survives refresh, cleared after opening once                | ✓        |
| Navigation state                         | Nothing in URL; invisible to URL-rendered tests; lost on refresh      |          |
| Path segment: /login/steam               | Nested route; changes the Login route definition                      |          |

**User's choice:** Query param.

### Steam trigger

| Option                                   | Description                                                           | Selected |
| ---------------------------------------- | --------------------------------------------------------------------- | -------- |
| 'boot-probe', deliberate, sticky unlock  | Distinct label; honest given the SPEC reversed the deferral           | ✓        |
| 'boot-probe', deliberate, non-sticky     | Third gate state to preserve an already-reversed deferral             |          |
| Reuse 'user-refresh'                     | Log lines would claim a user action that did not happen               |          |

**User's choice:** 'boot-probe', deliberate, sticky unlock.

### Humble label

| Option                                              | Description                                               | Selected |
| --------------------------------------------------- | --------------------------------------------------------- | -------- |
| Yes, pass a 'boot-probe' label through the slot store | Folded todo asked for Humble's own label; no Steam import | ✓        |
| No, leave Humble unlabeled                          | Log position already identifies the read                  |          |

**User's choice:** Yes, label the Humble reads.

### Humble sync

| Option                                              | Description                                            | Selected |
| --------------------------------------------------- | ------------------------------------------------------ | -------- |
| Renderer keeps the sync on mount, drops the health call | Smallest change; sync keeps its own 401 handling    | ✓        |
| Pass triggers the sync after a healthy probe        | Sync waits on the pass, up to 45 s                     |          |

**User's choice:** Renderer keeps the sync on mount, drops the health call.

---

## Closing check

Offered "Explore more gray areas" (HTTP probe calls, Epic offline wiring, parity test shape).
User chose "I'm ready for context". Those three items are recorded under Claude's Discretion.

## Claude's Discretion

- What each HTTP-store probe calls (legendary / gogdl / nile or a direct endpoint)
- Shape and ipc name of the pushed outcome message
- Selector module and function naming; retirement of `steamTileState.ts`
- Exact row wording within the two-weight tone rule
- Structure of the `unref()`'d bound timer and per-store promise race

## Deferred Ideas

- Epic in-embed Sign in button todo (2026-09-15) — reviewed, not folded; webview path is out of
  scope and the todo is itself blocked.
