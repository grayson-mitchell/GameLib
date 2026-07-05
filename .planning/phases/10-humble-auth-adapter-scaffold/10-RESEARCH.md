# Phase 10: Humble Auth + Adapter Scaffold - Research

**Researched:** 2026-07-05
**Domain:** Electron BrowserWindow session-cookie auth + undocumented-API adapter isolation
**Confidence:** HIGH for stack/architecture/persistence pattern; MEDIUM for live-API behavior (blocked by design until the D-12 validation gate runs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Manage Accounts presentation
- **D-01:** Humble appears as a **standard Runner-style tile** on Manage Accounts,
  visually identical to Epic/GOG/Amazon/Steam (reuse
  `src/frontend/screens/Login/components/Runner`). The "not a Runner" distinction stays
  backend-only.
- **D-02:** Connected state shows the **account email/name** — the adapter fetches an
  account identifier from a Humble API endpoint after login (mirrors how Steam/GOG tiles
  show a username). This endpoint is part of the live validation gate (D-13).
- **D-03:** Disconnect shows a **confirmation dialog**, then wipes the session cookie +
  stored identity. Policy for later phases: cached Humble library and sync state are
  wiped too — clean-slate disconnect; reconnecting re-syncs from scratch.
- **D-04:** **Exception to the wipe:** the append-only reveal/redeem audit log and the
  write-ahead REVEALED flags (Phase 11+) **survive disconnect**. They are the only record
  that a key was revealed but not activated; wiping them would let a re-connected account
  show a revealed key as UNREVEALED again (C1/C6 key-waste risk).

### Login window UX
- **D-05:** Login BrowserWindow opens `https://www.humblebundle.com/login` and
  **auto-closes on cookie detection** — watch navigation events / poll `session.cookies`
  for `_simpleauth_sess`; the moment it appears, extract + encrypt it and close the
  window. No manual "I'm done" step.
- **D-06:** Closing the window before login completes is a **silent cancel** — tile
  stays disconnected, no error/toast; the user can just click Connect again.
- **D-07:** The login window uses an **isolated Electron session partition** (e.g.
  `humble-login`), keeping Humble cookies out of the app's shared session. Explicit
  Disconnect clears the whole partition (HACCT-03 "remove all session data").

### Session expiry & reconnect (HACCT-02)
- **D-08:** Expiry detection = **startup health check + 401s**: one cheap authenticated
  adapter call at app startup, plus any 401 on a live request marks the session expired.
  401 (session expired) must be distinguished from 403 (Humble-side access denial — C5
  serve-cache-and-backoff path).
- **D-09:** Reconnect prompt = **expired tile state + one-time toast**: the Manage
  Accounts tile flips to "Session expired — Reconnect" and a dismissible toast fires when
  expiry is detected. Clicking Reconnect reopens the login window. No persistent chrome;
  cached views untouched.
- **D-10:** **Full reconnect machinery ships in Phase 10** (detection, tile state, toast,
  reconnect flow) even though no Humble library views exist yet — Phase 11 consumes the
  existing expiry signal for its "couldn't refresh" state.
- **D-11:** On reconnect after expiry, the `humble-login` partition is **kept** (browser
  state may reduce re-login friction, possibly skipping Humble Guard on a remembered
  browser). Partition is fully cleared only on explicit Disconnect (D-07).

### Live validation gate (blocks Phase 11)
- **D-12:** Validation runs via a **dev-only in-app debug trigger** (IPC/menu) that
  exercises the REAL adapter + stored encrypted cookie from the Electron main process and
  emits a structured pass/fail report. User runs it once during UAT with their real
  Humble account. No standalone Node script as gate evidence (Node CLI ≠ Electron main).
- **D-13:** **PASS = endpoints + shape:** (1) `GET /api/v1/user/order` (gamekeys list)
  returns 200; (2) at least one `GET /api/v1/order/{gamekey}` detail returns 200;
  (3) responses parse against the adapter's zod schemas, including
  `tpkd_dict.all_tpks[n].steam_app_id` presence; (4) the account-identifier endpoint
  (D-02) works.
- **D-14:** If the axios transport fails, the **fallback is built in-phase**: implement
  the BrowserWindow webRequest-proxy transport behind the same adapter interface and
  validate that instead. Phase 10 does not complete until ONE validated transport works —
  Phase 11 never starts on an unproven transport.
- **D-15:** Gate evidence is recorded as **`10-VALIDATION.md`** in the phase directory —
  structured report (endpoints hit, status codes, schema-parse results), **redacted** (no
  cookie values, no key values). Canonical ref for Phase 11 planning. Follows Phase 8's
  `08-VALIDATION.md` pattern.

### Claude's Discretion
- Login window sizing/modality (child-of-main vs independent, dimensions).
- Exact cookie-detection mechanism (navigation-event hook vs polling cadence).
- Toast wording/copy and expired-tile visual treatment (use existing semantic tokens).
- IPC channel naming (`humble:*` per research architecture) and store key shapes,
  following existing `addHandler()` / `electron-store` conventions.
- Exact shape of the dev-only debug trigger (hidden menu item vs IPC-only).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Audit-log/REVEALED-flag wipe exemption
(D-04) sets policy for Phases 11/14 stores but requires no Phase 10 work beyond not
wiping stores that don't exist yet.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|--------------|--------------------|
| HACCT-01 | User can connect a Humble Bundle account via an in-app browser login (email/password + "Humble Guard" emailed one-time code) from Manage Accounts | Pattern 1 (BrowserWindow + isolated partition), Pattern 2 (safeStorage encryption), Manage Accounts Runner-tile reuse (D-01), existing `steam/user.ts`/`Runner`/`SteamLogin` precedents |
| HACCT-02 | The Humble session persists encrypted (login once); when it expires (~2-3 day TTL) a non-disruptive reconnect prompt appears without breaking library browsing | Pattern 3 (401/403-distinguishing adapter), D-08/D-09/D-10/D-11 mapped to Validation Architecture test map, Pitfall 2 (session TTL as routine, not exceptional) |
| HACCT-03 | User can disconnect and remove their Humble account | Code Example "Isolated partition wipe on Disconnect" (mirrors `legendary/user.ts`), D-07 partition-clear semantics, D-04 audit-log exemption noted for forward compatibility with Phase 11+ |
</phase_requirements>

## Summary

Phase 10 has two deliverables that must both be true before Phase 11 can start: (1) a working, encrypted, restart-surviving Humble login/logout/reconnect flow wired into Manage Accounts, and (2) an empirically-validated `adapter.ts` — the C5 isolation boundary — proven against the live Humble API with a real account via a dev-only in-app debug trigger (D-12/D-13), recorded in `10-VALIDATION.md` (D-15). Nothing in Phase 11+ can be planned safely until that validation artifact exists, because the entire six-phase Humble build depends on the axios+cookie+header transport actually working from inside Electron's main process.

The technology story requires **zero new npm packages** `[VERIFIED: package.json]` — `axios@^1.13.5`, `electron-store@^8.2.0`, and `zod@^3.24.3` are already dependencies, and `BrowserWindow`, `session.cookies`, `session.fromPartition`, and `safeStorage` are Electron 41.1.1 built-ins already used elsewhere in this codebase (`session.fromPartition('persist:epicstore')` in `legendary/user.ts` is the direct precedent for D-07's isolated `humble-login` partition). The auth mechanism is dictated by an external constraint, not a preference: Humble's `/processlogin` requires a solved reCAPTCHA, so BrowserWindow-based login (not the existing `/loginweb/:runner` in-app WebView route used by Epic/GOG/Amazon/Zoom/Steam) is the only viable path — and it is also the only way to get `webContents.session.cookies` access from the main process for the auto-close cookie-detection flow D-05 requires.

The codebase already has a complete, provenance-clear template for every piece of this phase: `src/backend/storeManagers/steam/user.ts` for the `safeStorage` + `TOKEN_PREFIX` sentinel encryption pattern (including the plaintext-fallback warning path required by success criterion 5), `src/backend/storeManagers/steam/electronStores.ts` for the `TypeCheckedStoreBackend`/`CacheStore` store-layout pattern, `legendary/user.ts` for the isolated-session-partition wipe-on-logout pattern, and `src/backend/storeManagers/steam/__tests__/user.test.ts` for the jest mock-boundary structure to reuse for `humble/user.ts` unit tests. One codebase-convention correction to research's own ARCHITECTURE.md: **IPC channels in this repo use camelCase, not colon-namespaced names** (`steamStartQR`, `checkSteamInstalled`, `getSteamUserInfo`) — the planner should name Humble channels `humbleStartLogin`, `humblePollLogin`, `humbleGetUserInfo`, `humbleDisconnect`, etc., not `humble:login` as ARCHITECTURE.md's illustrative table suggests.

**Primary recommendation:** Build `src/backend/humble/{adapter.ts,user.ts,electronStores.ts,ipc_handler.ts,constants.ts}` following the Steam pattern exactly (zero new deps), wire a Manage Accounts Runner tile per D-01, and treat the `10-VALIDATION.md` live-API gate as a hard phase-completion blocker, not a nice-to-have test.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Humble login UI (Manage Accounts tile) | Frontend (Renderer) | — | Reuses existing `Runner` component; state comes from IPC + context slice |
| Login BrowserWindow + cookie extraction | Backend (Electron main) | — | `session.cookies` is only reliably accessible from main process; must not be proxied through renderer |
| Session cookie encryption/persistence | Backend (Electron main) | Database/Storage (electron-store) | `safeStorage` is main-process-only API; `humbleConfigStore` is the storage tier |
| Humble HTTP adapter (C5 wall) | Backend (Electron main) | — | All Humble API calls; single isolation point, no renderer HTTP access |
| Session expiry detection (401 vs 403) | Backend (Electron main) | — | Requires raw HTTP status from the adapter; renderer never sees raw Humble responses |
| Reconnect prompt / expired-tile state | Frontend (Renderer) | Backend (push via IPC) | Backend detects and pushes `humbleAuthState`; renderer renders the tile/toast |
| Dev-only validation trigger | Backend (Electron main) | Frontend (trigger surface) | Must exercise the real adapter + real stored cookie in Electron main (D-12); a hidden menu item or IPC-only trigger initiates it |
| Disconnect / partition wipe | Backend (Electron main) | — | `session.fromPartition().clearStorageData()` is main-process-only |

## Package Legitimacy Audit

**Not applicable — zero new packages required for this phase.** `axios@^1.13.5`, `electron-store@^8.2.0`, and `zod@^3.24.3` are already present dependencies `[VERIFIED: package.json]`; `@types/node`/Electron built-ins (`BrowserWindow`, `session`, `safeStorage`) require no installation. No `npm install` step belongs in this phase's plan. If the planner or a later phase considers adding a package (e.g. a cookie-jar library), treat that as a deviation from research and re-run the legitimacy gate at that time — research explicitly rejects `axios-cookiejar-support`/`tough-cookie` as over-engineering for a single cookie value `[CITED: .planning/research/STACK.md]`.

## Standard Stack

### Core (all already present — no installation needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `axios` | ^1.13.5 (installed) `[VERIFIED: package.json]` | Humble HTTP calls in `adapter.ts` | Already used for Steam store metadata; manual `Cookie` header is sufficient for a single session cookie |
| `electron-store` | ^8.2.0 (installed) `[VERIFIED: package.json]` | `humbleConfigStore` persistence | Existing `TypeCheckedStoreBackend`/`CacheStore` wrapper pattern in `backend/electron_store.ts` / `backend/cache.ts` |
| `zod` | ^3.24.3 (installed) `[VERIFIED: package.json]` | Validate adapter response shapes (D-13 point 3, gamekeys/order/steam_app_id) | Already a dependency; PITFALLS.md's C5 mitigation explicitly calls for schema validation on every adapter call |
| Electron `BrowserWindow` | built-in, Electron ^41.1.1 (installed) `[VERIFIED: package.json]` | Login window (D-05) | Only viable auth surface — Humble `/processlogin` requires solved reCAPTCHA `[CITED: .planning/research/STACK.md]` |
| Electron `session.cookies` / `session.fromPartition` | built-in, Electron ^41.1.1 | Cookie extraction + isolated partition (D-07) | `legendary/user.ts` already uses `session.fromPartition('persist:epicstore')` + `clearStorageData()` as direct in-repo precedent |
| Electron `safeStorage` | built-in, Electron ^41.1.1 | Encrypt `_simpleauth_sess` at rest | Exact pattern already implemented in `steam/user.ts` (`TOKEN_PREFIX` sentinel, plaintext-fallback warning) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `graceful-fs` | already present | Only if any filesystem existence checks are needed (unlikely for Phase 10; Steam uses it for install-path detection, Humble has no equivalent) | Not expected to be needed this phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BrowserWindow + cookie extraction | Existing `/loginweb/:runner` in-app WebView route (Epic/GOG/Amazon/Zoom/Steam pattern) | Rejected by design (D-05/D-07): the WebView route's session is harder to reach from main process for cookie extraction on the exact "just logged in" event; a dedicated BrowserWindow with its own partition gives direct `session.cookies` access and a clean wipe-on-disconnect boundary |
| axios + manual Cookie header | `axios-cookiejar-support` + `tough-cookie` | Rejected `[CITED: .planning/research/STACK.md]` — one cookie value does not need a full cookie jar; adds two dependencies for no functional gain |
| axios transport | BrowserWindow `webRequest.onBeforeRequest` proxy transport | This is the **explicit D-14 fallback**, not a rejected alternative — build it in-phase, behind the same `HumbleAdapter` interface, only if the live validation gate (D-12/D-13) shows axios+cookie+header is blocked by Humble |

**Installation:**
```bash
# No new dependencies. All required packages are already in package.json.
```

**Version verification:** Confirmed directly via `package.json` (dependencies already installed in this repo, not fetched from registry) — `axios ^1.13.5`, `electron-store ^8.2.0`, `zod ^3.24.3`, Electron `^41.1.1`. `[VERIFIED: package.json]`

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│ Renderer: Manage Accounts (Login screen)                           │
│                                                                      │
│  Runner tile ("Humble") ──click Connect──▶ IPC humbleStartLogin()   │
│       ▲                                          │                  │
│       │ humbleAuthState push (connected/expired) │                  │
│       └──────────────────────────────────────────┼──── IPC ────────┤
└──────────────────────────────────────────────────┼──────────────────┘
                                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│ Backend (Electron main): src/backend/humble/                        │
│                                                                       │
│  ipc_handler.ts ──▶ user.ts                                          │
│                        │                                             │
│                        ├─▶ opens BrowserWindow                       │
│                        │     partition: 'humble-login'               │
│                        │     loads humblebundle.com/login             │
│                        │                                             │
│                        ├─▶ watches session.cookies for                │
│                        │     _simpleauth_sess (poll or nav hook)      │
│                        │     → found: extract, close window           │
│                        │                                             │
│                        ├─▶ safeStorage.encryptString()                │
│                        │     → humbleConfigStore.sessionCookie        │
│                        │                                             │
│                        ├─▶ adapter.getUserIdentity() (D-02)           │
│                        │     → humbleConfigStore.userData             │
│                        │                                             │
│                        └─▶ startup health check / 401 detection       │
│                              → humbleAuthState: 'expired'             │
│                              → humbleAuthState push to renderer       │
│                                                                       │
│  adapter.ts (C5 wall) ─────────────────────────────────────────────  │
│    every call: axios + Cookie header + X-Requested-By header          │
│    zod-validates response shape                                       │
│    distinguishes 401 (session expired) from 403 (access denied)       │
│         │                                                             │
│         ▼                                                             │
│  humblebundle.com/api/v1/user/order   (D-13 endpoint 1)               │
│  humblebundle.com/api/v1/order/{id}   (D-13 endpoint 2)               │
│  account-identifier endpoint          (D-02 / D-13 endpoint 4)        │
│                                                                        │
│  electronStores.ts: humbleConfigStore (isLoggedIn, sessionCookie,     │
│                      userData)                                        │
│                                                                        │
│  Dev-only debug trigger (D-12) ──▶ exercises real adapter + real      │
│    stored cookie from Electron main ──▶ writes 10-VALIDATION.md-      │
│    shaped structured report (redacted)                                │
└────────────────────────────────────────────────────────────────────┘
```

A reader can trace the primary use case (Connect → BrowserWindow → cookie → encrypted store → adapter call → identity fetch → tile shows connected) end-to-end by following the arrows above; the validation gate is a separate, parallel path exercised on-demand from the same `adapter.ts`.

### Recommended Project Structure
```
src/backend/humble/
├── adapter.ts            # C5 isolation wall — ALL Humble HTTP calls, zod validation, 401/403 split
├── user.ts                # BrowserWindow login, cookie extraction, safeStorage persist, health check
├── electronStores.ts      # humbleConfigStore (TypeCheckedStoreBackend, mirrors steam/electronStores.ts)
├── ipc_handler.ts          # humbleStartLogin / humblePollLogin / humbleGetUserInfo / humbleDisconnect / etc.
├── constants.ts            # endpoint URLs, X-Requested-By header, TOKEN_PREFIX, partition name
└── __tests__/
    ├── user.test.ts        # mirrors steam/__tests__/user.test.ts mock-boundary structure
    └── adapter.test.ts     # zod schema pass/fail fixtures, 401 vs 403 branching

src/common/types/
└── humble.ts               # HumbleAdapter interface, auth result types (no HumbleKey/HumbleOrder yet — Phase 11)

src/frontend/screens/Login/
└── index.tsx                # add Humble Runner tile (modify, not new file)
```

Note: per ARCHITECTURE.md and the locked v1.2 decision, **do not** add `library.ts`, `dedup.ts`, `keys.ts`, or the Humble frontend screens subtree yet — those belong to Phases 11–15. Phase 10 touches only auth + adapter + Manage Accounts.

### Pattern 1: BrowserWindow Auth with Isolated Session Partition (D-05/D-07)
**What:** Open a dedicated `BrowserWindow` with `webPreferences.session = session.fromPartition('humble-login')`, load `https://www.humblebundle.com/login`, and detect login completion by watching for the `_simpleauth_sess` cookie to appear rather than any DOM/URL signal.
**When to use:** Any auth flow where reCAPTCHA blocks programmatic login and the cookie itself (not a redirect URL, unlike Epic's OAuth code capture) is the completion signal.
**Example:**
```typescript
// Source: pattern synthesized from Electron session docs + legendary/user.ts precedent
import { BrowserWindow, session } from 'electron'

const HUMBLE_LOGIN_PARTITION = 'humble-login'

async function openHumbleLoginWindow(): Promise<string | null> {
  const ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
  const win = new BrowserWindow({
    width: 480,
    height: 640,
    webPreferences: { session: ses, contextIsolation: true }
  })
  win.loadURL('https://www.humblebundle.com/login')

  return new Promise((resolve) => {
    let settled = false
    const checkCookie = async () => {
      if (settled) return
      const cookies = await ses.cookies.get({
        url: 'https://www.humblebundle.com',
        name: '_simpleauth_sess'
      })
      if (cookies.length > 0) {
        settled = true
        win.close()
        resolve(cookies[0].value)
      }
    }
    win.webContents.on('did-navigate', checkCookie)
    win.webContents.on('did-navigate-in-page', checkCookie)
    win.on('closed', () => {
      if (!settled) resolve(null) // D-06: silent cancel, no error
    })
  })
}
```
**Note on cookie-detection cadence:** `did-navigate`/`did-navigate-in-page` alone may not fire on every SPA-style post-login state change on humblebundle.com; the planner has discretion (per CONTEXT.md) to add a short poll (e.g. every 1–2s) as a supplement, not a replacement, for the navigation hook. This is `[ASSUMED]` — Humble's login page's exact post-auth navigation behavior was not independently verified in this research session.

### Pattern 2: Session Cookie Encryption (reuse steam/user.ts exactly)
**What:** Encrypt `_simpleauth_sess` using the identical `safeStorage` + `TOKEN_PREFIX` sentinel pattern already proven in `steam/user.ts`.
**When to use:** Any credential/session value persisted via `electron-store`.
**Example:**
```typescript
// Source: src/backend/storeManagers/steam/user.ts (existing, in-repo — copy pattern exactly)
const HUMBLE_TOKEN_PREFIX = 'humble:v1:'

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptCookie(plain: string): string {
  if (!plain) return ''
  if (!encryptionAvailable()) {
    // Success criterion 5: warn, do not silently store plaintext.
    logWarning('safeStorage unavailable — Humble session cannot be encrypted', LogPrefix.Backend)
    return plain // caller must surface the warning to the user per D-13/success-criterion-5
  }
  const ciphertext = safeStorage.encryptString(plain).toString('base64')
  return `${HUMBLE_TOKEN_PREFIX}${ciphertext}`
}
```
**Important divergence from Steam pattern:** Steam's `encryptToken` silently falls back to storing plaintext with only a log warning (`logWarning`, not user-facing). Success criterion 5 for Phase 10 requires a **user-visible** warning on Linux without a keyring, and PITFALLS.md (C4) recommends refusing to persist the session at all if encryption is unavailable rather than storing it in plaintext. **The planner must decide and document which behavior Phase 10 implements** — this is a meaningful deviation from the copy-exact Steam pattern and should not be silently inherited. This is flagged in Open Questions below.

### Pattern 3: C5 Adapter with 401/403 Distinction and zod Validation
**What:** All Humble HTTP calls in one file; every response validated against a zod schema; 401 (session expired) handled differently from 403 (Humble-side access denial).
**When to use:** Every Humble API call, no exceptions (C5).
**Example:**
```typescript
// Source: synthesized from .planning/research/{STACK,PITFALLS,ARCHITECTURE}.md
import axios from 'axios'
import { z } from 'zod'

const HUMBLE_BASE_URL = 'https://www.humblebundle.com'
const REQUIRED_HEADERS = {
  'X-Requested-By': 'hb_android_app',
  Accept: 'application/json'
}

const GamekeysSchema = z.array(z.string())

export type AdapterResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'session_expired' }   // 401
  | { status: 'access_denied' }     // 403 — C5 backoff path, not re-login
  | { status: 'schema_error'; raw: unknown }

export async function getGamekeys(cookie: string): Promise<AdapterResult<string[]>> {
  try {
    const res = await axios.get(`${HUMBLE_BASE_URL}/api/v1/user/order`, {
      headers: { ...REQUIRED_HEADERS, Cookie: `_simpleauth_sess=${cookie}` }
    })
    const parsed = GamekeysSchema.safeParse(res.data)
    if (!parsed.success) return { status: 'schema_error', raw: res.data }
    return { status: 'ok', data: parsed.data }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 401) return { status: 'session_expired' }
      if (err.response?.status === 403) return { status: 'access_denied' }
    }
    throw err
  }
}
```

### Pattern 4: Existing IPC + Preload Conventions (follow exactly, camelCase)
**What:** Add channels to `AsyncIPCFunctions`/`FrontendMessages` in `src/common/types/ipc.ts`, register handlers via `addHandler()` in `humble/ipc_handler.ts`, expose via `makeHandlerInvoker`/`makeListenerCaller` in `src/preload/api/humble.ts`.
**Example:**
```typescript
// Source: src/preload/api/steam.ts (existing, in-repo)
import { makeHandlerInvoker, makeListenerCaller } from '../ipc'

export const humbleStartLogin = makeHandlerInvoker('humbleStartLogin')
export const humblePollLogin = makeHandlerInvoker('humblePollLogin')
export const humbleGetUserInfo = makeHandlerInvoker('humbleGetUserInfo')
export const humbleDisconnect = makeListenerCaller('humbleDisconnect')
```
**Correction to ARCHITECTURE.md:** That file's illustrative IPC table uses colon-namespaced names (`humble:login`, `humble:sync`). This repo's actual convention — verified directly in `src/common/types/ipc.ts` and `src/preload/api/steam.ts` — is unprefixed camelCase (`steamStartQR`, `checkSteamInstalled`). Follow the codebase convention, not the illustrative research diagram. `[VERIFIED: src/common/types/ipc.ts, src/preload/api/steam.ts]`

### Anti-Patterns to Avoid
- **Adding a `/loginweb/humble` WebView route:** Explicitly rejected by D-05/D-07 and confirmed correct by codebase inspection — the existing `/loginweb/:runner` catch-all route is for OAuth-redirect-style flows (Epic/GOG/Amazon/Zoom) where a specific runner route must be placed *before* the catch-all to avoid capture (see STATE.md decision log for the Steam precedent of this exact routing bug). Humble does not use this route at all.
- **Reusing `steamConfigStore` cwd/instance:** Each store manager gets its own `TypeCheckedStoreBackend('humbleConfigStore', { cwd: 'humble_store' })` — never share a store instance across domains.
- **Silent plaintext fallback with no user-facing warning:** Steam's existing pattern only logs a warning; success criterion 5 requires a **user-visible** warning. Copying the Steam pattern verbatim under-delivers on this criterion (see Open Questions).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Cookie jar / multi-cookie management | Custom cookie parser/jar | Single `Cookie: _simpleauth_sess=<value>` header string | Only one cookie is ever needed; a jar is over-engineering `[CITED: .planning/research/STACK.md]` |
| Response shape validation | Manual `if (typeof x === ...)` checks or `as HumbleOrder` casts | `zod` schemas (already a dependency) | C5 pitfall: undocumented API shape changes must fail typed/loud, not silently misclassify data `[CITED: .planning/research/PITFALLS.md]` |
| Session encryption | Custom AES/crypto wrapper | Electron `safeStorage` (already used for Steam) | `safeStorage` handles OS-keychain integration (macOS Keychain, Windows DPAPI, Linux libsecret) correctly; hand-rolled crypto would need to solve the same problem worse |
| CAPTCHA / Humble Guard handling | Any app-side CAPTCHA-solving or emailed-code scraping logic | Let the user complete both inside the BrowserWindow's real web form | Both are explicitly designed to be a no-op for the app (D-05, STACK.md) — building logic here would be solving an already-solved problem badly |
| reconnect UX state machine | A generic multi-store "auth state" abstraction shared with Epic/GOG | A `humble` context slice, following the existing per-store slice pattern (`steam`, `gog`, `epic`) | The codebase already has one context slice per store; introducing a shared abstraction now is premature generalization for a single new consumer |

**Key insight:** Every piece of this phase already has a working, in-repo reference implementation from the Steam integration (v1.0) or the Epic partition-wipe pattern. The engineering risk in Phase 10 is not "how do we build this" — it's "does the live Humble API actually accept these headers from our origin," which only the D-12 validation gate can answer.

## Common Pitfalls

### Pitfall 1: Humble API access denial despite correct implementation (C5)
**What goes wrong:** `api/v1/user/order` returns `UnauthorizedAccess`/403 even with a valid cookie and correct headers. Documented in Lutris issues #4099 (2022), #4448, and #5958 (March 2025) `[CITED: .planning/research/PITFALLS.md]`.
**Why it happens:** Undocumented API; the most likely (but unconfirmed) cause is a missing/wrong `X-Requested-By: hb_android_app` header, since `humble-cli` (Rust, actively maintained through 2025-2026) continues to work with the cookie + header approach.
**How to avoid:** This is precisely why D-12/D-13/D-14 exist. Implement the adapter with the header, validate live (D-12), and have the BrowserWindow `webRequest.onBeforeRequest` proxy transport ready as a same-interface fallback (D-14) if axios is blocked.
**Warning signs:** 403 responses with no session-expiry signal; requests that work when made from the BrowserWindow's own webContents but fail from a bare axios instance with the same cookie value.

### Pitfall 2: Humble Guard / session-cookie TTL treated as an edge case instead of routine (Pitfall 6, PITFALLS.md)
**What goes wrong:** `_simpleauth_sess` expires in ~2–3 days (community-observed, undocumented exact TTL). If re-auth is only handled as an error path, users hit a jarring "everything broke" experience every few days.
**Why it happens:** Developers build the happy-path login once and treat expiry as exceptional rather than routine.
**How to avoid:** D-08 (startup health check + 401 detection) and D-09 (expired-tile + one-time toast) are structural fixes, not polish — implement them in Phase 10 itself per D-10, even though there's no library view yet to protect.
**Warning signs:** No startup call to verify session validity; re-login only triggered by a failed data-fetch deep in Phase 11+ code that doesn't exist yet.

### Pitfall 3: Auto-retry on Humble Guard code submission (Pitfall 6)
**What goes wrong:** A network-error retry wrapper resubmits a Humble Guard code after it's expired or already consumed, potentially triggering Humble-side lockout of the guard step.
**Why it happens:** Generic retry-on-error middleware applied uniformly across all API calls without considering one-shot semantics.
**How to avoid:** Not directly Phase 10's concern in the BrowserWindow-only auth design (D-05 delegates Guard entirely to the web form, so the app never submits a Guard code itself) — but the planner should confirm no auto-retry/auto-refresh logic is added around the BrowserWindow load itself that could resubmit a stale form.
**Warning signs:** Any `catch` block around the login window flow that reloads or resubmits without full user awareness.

### Pitfall 4: Secrets in logs/IPC (C4)
**What goes wrong:** `_simpleauth_sess` value or full cookie objects get logged, or flow to the renderer in an IPC payload.
**Why it happens:** Copy-paste of existing `logInfo`/`logError` call patterns without a Humble-specific scrubber; sending "the full object" to the renderer is the existing Heroic pattern for simpler stores.
**How to avoid:** Never call `logInfo`/`logError`/`logWarning` with the raw cookie value or full HTTP response body. `humbleAuthState` pushed to the renderer must be `{ isLoggedIn, username?, expired? }` only — never the cookie. Apply this discipline in `user.ts` and `adapter.ts` from the first line of code, not retrofitted later (PITFALLS.md: "adding it later requires touching every file in the domain").
**Warning signs:** `logInfo(JSON.stringify(...))` anywhere touching Humble data; any IPC return type that includes `sessionCookie`.

### Pitfall 5: safeStorage availability not checked, or checked but silently degraded (C4, success criterion 5)
**What goes wrong:** On Linux without a configured keyring, `safeStorage.isEncryptionAvailable()` returns `false` and `safeStorage` falls back to `basic_text` (plaintext) storage. Steam's existing `encryptToken()` only logs a warning (developer-facing, not user-facing) and proceeds to store plaintext anyway.
**Why it happens:** `safeStorage` always succeeds during development on macOS/Windows, so the fallback path is rarely exercised or tested until a Linux user without a keyring hits it.
**How to avoid:** Success criterion 5 explicitly requires the app to **warn the user** about reduced encryption — verify `safeStorage.getSelectedStorageBackend()` at startup (returns `'basic_text'` on the degraded path) and surface a user-visible warning distinct from Steam's dev-log-only behavior. See Open Questions for the exact behavior the planner must decide (warn-and-store vs. warn-and-refuse).
**Warning signs:** Copy-pasting `steam/user.ts`'s `encryptToken` verbatim without adding a renderer-facing signal.

### Pitfall 6: IPC channel naming drift from codebase convention
**What goes wrong:** Following ARCHITECTURE.md's illustrative `humble:*` colon-namespaced channel names literally, creating an inconsistent style versus every other store manager in this codebase.
**Why it happens:** Research documents (written before this codebase-convention check) used a namespacing convention that reads as "best practice" but isn't what this repo actually does.
**How to avoid:** Name channels `humbleStartLogin`, `humblePollLogin`, `humbleGetUserInfo`, `humbleDisconnect`, `humbleGetSyncedAt`-equivalent, etc. — camelCase, no colon, matching `steamStartQR`/`checkSteamInstalled`/`getSteamUserInfo`.
**Warning signs:** Any new channel string containing a `:` character.

## Code Examples

### Isolated partition wipe on Disconnect (D-07, mirrors legendary/user.ts logout)
```typescript
// Source: src/backend/storeManagers/legendary/user.ts (existing, in-repo)
import { session } from 'electron'

export async function disconnectHumble(): Promise<void> {
  const ses = session.fromPartition('humble-login')
  await ses.clearStorageData()
  await ses.clearCache()
  await ses.clearAuthCache()
  await ses.clearHostResolverCache()
  await ses.clearData()
  // D-07: full partition clear only on explicit Disconnect.
  // D-11: on mere session-expiry reconnect, the partition is KEPT — do not call this path.
  humbleConfigStore.clear()
}
```

### electronStores.ts layout (mirrors steam/electronStores.ts exactly)
```typescript
// Source: pattern from src/backend/storeManagers/steam/electronStores.ts (existing, in-repo)
import { TypeCheckedStoreBackend } from '../../electron_store'

const configStore = new TypeCheckedStoreBackend('humbleConfigStore', {
  cwd: 'humble_store'
})

export { configStore }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Steam Web OAuth / API-key based library access (rejected for Steam itself in v1.0) | steam-session refresh token, BrowserWindow for Humble | v1.0/v1.2 research | Not directly relevant to Phase 10 but confirms this codebase's general pattern: prefer the auth mechanism the platform's real client protocol/web form supports over reverse-engineered token exchange |
| Community tools treating 401/403 identically | Distinguish session-expiry (401) from access-denial (403) with different recovery paths | Established as a hard requirement by D-08 and PITFALLS.md Pitfall 3, informed by the 3 Lutris incidents | Wrong handling here means a user whose account is fine gets told to re-login (401 UX) when the real problem is Humble blocking the app (403), or vice versa — the retry/backoff strategy differs |

**Deprecated/outdated:**
- The `humblebundle` npm package (v1.0.5, 2016) is not a viable base for anything in this phase — confirmed abandoned, predates Humble Guard entirely `[CITED: .planning/research/STACK.md]`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `_simpleauth_sess` cookie expires in ~2–3 days | Summary, Pitfall 2 | If materially shorter/longer, the startup health-check cadence and reconnect UX assumptions (D-08/D-09) may need retuning, but the mechanism itself (401-driven detection) is TTL-agnostic and still correct |
| A2 | Exact cookie-detection signal (`did-navigate`/`did-navigate-in-page` events) reliably fires after Humble's login form succeeds | Pattern 1 | If Humble's post-login page is a pure SPA state change with no navigation event, the auto-close (D-05) would hang; a polling fallback (also noted) mitigates this and should be built regardless |
| A3 | `X-Requested-By: hb_android_app` is the correct/sufficient header to avoid the Lutris-style 403 denial | Pitfall 1, Standard Stack | This is exactly what the D-12/D-13 live validation gate exists to confirm or refute before Phase 11 begins — if wrong, D-14's BrowserWindow-proxy fallback is the built-in mitigation |
| A4 | `tpkd_dict.all_tpks[n].steam_app_id` is present in live API responses | D-13 (canonical ref, not this phase's data model yet) | Phase 10 only needs the account-identifier and gamekeys/order endpoints to respond with valid shape per D-13; this specific field matters starting Phase 11's dedup work, but D-13's validation criteria already require confirming its presence now as part of the gate |
| A5 | Steam's `encryptToken()` plaintext-fallback behavior (log-only warning, no user-facing signal) is acceptable to copy as-is for Humble | Pattern 2, Pitfall 5 | Success criterion 5 explicitly requires a user-visible warning — copying Steam's pattern verbatim would fail this criterion; flagged as an Open Question requiring an explicit planning decision |
| A6 | An account-identifier endpoint distinct from gamekeys/order exists and is stable for D-02/D-13 point 4 | D-02, D-13 | If no such endpoint exists cleanly, the tile's "connected state shows account email/name" (D-02) may need to derive identity from another response (e.g., a field embedded in the order list response) — this must be confirmed during the D-12 validation run itself, not assumed at planning time |

**If this table is empty:** N/A — six assumptions require validation, five of which are explicitly resolved by the D-12/D-13 live validation gate this phase already mandates. A5 requires a distinct planning decision (see Open Questions), not a live-API test.

## Open Questions

> **Resolution status (updated during planning, 2026-07-05):** Q1 RESOLVED — warn-and-store (see Plans 02/04). Q2 DEFERRED to the D-12/D-13 live validation gate (Plan 05) by design. Q3 RESOLVED — navigation-hook primary + ~1.5s cookie poll backstop (Plan 02).

1. **[RESOLVED — warn-and-store]** **Does the Linux no-keyring warning refuse to store the session, or warn-and-store-plaintext?** Resolved by Plans 02/04: warn-and-store — `HumbleUser` calls `logWarning` AND sets a user-visible `encryptionDegraded` flag that the Manage Accounts tile renders (success criterion 5), then proceeds to store. Does not refuse.
   - What we know: Steam's existing `encryptToken()` warns via `logWarning` (dev log only) and proceeds to store plaintext. PITFALLS.md's C4 mitigation recommends refusing to persist and prompting re-login every session instead. Success criterion 5 says "the app warns about reduced encryption rather than storing the session cookie silently in plaintext" — this reads as "warn, then still store" (the word "silently" is the operative constraint), not "refuse to store."
   - What's unclear: The exact warning surface (toast? banner in Manage Accounts? blocking modal?) and whether storage proceeds after the warning is acknowledged.
   - Recommendation: Treat success criterion 5's wording as authoritative — implement warn-then-store (not refuse), with the warning rendered wherever the Manage Accounts Humble tile lives, and log it as `logWarning` (dev) + a distinct renderer-facing signal (new behavior, not copied from Steam). The planner should make this an explicit task, not an inherited side effect of copying `steam/user.ts`.

2. **[DEFERRED — resolved empirically at the D-12/D-13 live gate, Plan 05]** **What exact endpoint/response shape does the account-identifier lookup (D-02/D-13 point 4) use?** Intentionally not fixed at plan time: Plan 05's validation task probes for the identity source against the real API and records the confirmed endpoint in 10-VALIDATION.md before Phase 11 relies on it.
   - What we know: D-02 requires "an account-identifier endpoint" works; D-13 requires it as pass criterion 4. HUMBLE-SPEC-SOURCE.md documents gamekeys and order endpoints in detail but does not name a distinct user-identity endpoint.
   - What's unclear: Whether this is a dedicated endpoint (e.g. some `/api/v1/user` profile endpoint) or whether identity must be derived from a field already present in the order-list response, or from parsing the logged-in Humble page's HTML/JS state after the BrowserWindow login completes (before closing it).
   - Recommendation: This must be resolved empirically during the D-12 validation run — the planner should scope a validation task that explicitly probes for this endpoint (or confirms deriving identity from the BrowserWindow's own post-login page) before committing to an adapter interface signature for it.

3. **[RESOLVED — nav-hook + poll backstop]** **Exact cookie-detection mechanism cadence (navigation hook vs. polling)?** Resolved by Plan 02: `did-navigate`/`did-navigate-in-page` as the primary trigger plus a ~1.5s `session.cookies.get` poll as a backstop, satisfying D-05's no-manual-step requirement even if navigation events do not fire.
   - What we know: CONTEXT.md leaves this to Claude's discretion.
   - What's unclear: Whether Humble's login flow reliably fires `did-navigate`/`did-navigate-in-page` at the moment the cookie is set, or whether a supplementary poll (checked against `session.cookies.get()` every 1-2s) is required for robustness.
   - Recommendation: Implement both — the navigation hook as the primary trigger, a low-frequency poll (e.g. every 1.5s, capped at a reasonable timeout) as a backstop, matching the "no manual I'm-done step" requirement of D-05 even in edge cases where navigation events don't fire as expected.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Live Humble Bundle API (network service) | D-12/D-13 validation gate | Not verifiable from this research session — requires a real user account and live network access during UAT | — | None — this is precisely why D-12 is a manual, dev-only, real-account gate; there is no automated substitute |
| Electron `safeStorage` OS keyring backend | Success criterion 5 (Linux) | Varies per user's OS/desktop environment; not verifiable generically | — | Warn-and-(store or refuse, per Open Question 1) — this fallback IS the feature, not a gap |
| Steam client (for later phases' redemption flow) | Not required by Phase 10 | N/A this phase | — | N/A |

**Missing dependencies with no fallback:**
- None that block Phase 10's own scope. The live Humble API's actual behavior toward this app's requests is unknown until D-12 runs — that uncertainty is the reason the phase's success criteria include the validation gate rather than assuming a clean build is sufficient.

**Missing dependencies with fallback:**
- Live Humble API access via axios+cookie+header (fallback: BrowserWindow `webRequest.onBeforeRequest` proxy transport, D-14 — built in-phase if needed, not deferred).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29.x `[VERIFIED: package.json / jest.config.js]` |
| Config file | `jest.config.js` (`resetMocks: true`) |
| Quick run command | `npx jest src/backend/humble/__tests__/user.test.ts --no-coverage` (create alongside `adapter.test.ts`) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| HACCT-01 | BrowserWindow opens correct URL, isolated partition used, silent-cancel on premature close (D-06) | unit (mock BrowserWindow/session) | `npx jest src/backend/humble/__tests__/user.test.ts -t "login"` | ❌ Wave 0 |
| HACCT-01 | Cookie encryption uses `safeStorage` + `TOKEN_PREFIX` sentinel, plaintext fallback with user-facing warning | unit | `npx jest src/backend/humble/__tests__/user.test.ts -t "encrypt"` | ❌ Wave 0 |
| HACCT-01 | Live BrowserWindow login end-to-end (real reCAPTCHA/Humble Guard) | manual | — | N/A — inherently manual, real account required |
| HACCT-02 | Startup health check calls adapter once and interprets 401 as expired | unit | `npx jest src/backend/humble/__tests__/user.test.ts -t "health check"` | ❌ Wave 0 |
| HACCT-02 | Adapter distinguishes 401 (session_expired) from 403 (access_denied) | unit (mock axios) | `npx jest src/backend/humble/__tests__/adapter.test.ts -t "401 403"` | ❌ Wave 0 |
| HACCT-02 | Reconnect flow reopens BrowserWindow with `humble-login` partition kept (D-11) | unit | `npx jest src/backend/humble/__tests__/user.test.ts -t "reconnect"` | ❌ Wave 0 |
| HACCT-03 | Disconnect wipes `humble-login` partition fully + clears `humbleConfigStore` | unit (mock session.fromPartition) | `npx jest src/backend/humble/__tests__/user.test.ts -t "disconnect"` | ❌ Wave 0 |
| HACCT-01/02/03 | Manage Accounts Humble tile renders connected/expired/disconnected states | manual (no React test infra in this project, per Phase 8's `08-VALIDATION.md` precedent) | — | N/A — frontend has no unit-test infrastructure |
| D-13 (validation gate) | Live adapter call to gamekeys/order/identity endpoints returns 200 + zod-valid shape from real Electron main + real stored cookie | manual (dev-only debug trigger, D-12) | — | N/A by design — this is the phase's core deliverable, not a bypassable test |

### Sampling Rate
- **Per task commit:** `npx jest src/backend/humble/__tests__/*.test.ts --no-coverage`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`, **and** `10-VALIDATION.md` recorded with a PASS verdict per D-13 before Phase 11 planning begins

### Wave 0 Gaps
- [ ] `src/backend/humble/__tests__/user.test.ts` — covers HACCT-01/02/03 (login, encryption, health check, reconnect, disconnect); mirror `steam/__tests__/user.test.ts`'s mock-boundary structure (mock `electron` safeStorage + BrowserWindow/session, mock `backend/logger`, mock `./electronStores`)
- [ ] `src/backend/humble/__tests__/adapter.test.ts` — zod schema pass/fail fixtures, 401/403 branching, X-Requested-By header presence assertion on every outgoing call
- [ ] No new jest config or fixture directories needed — existing `jest.config.js` + mock patterns apply directly

*(This project's frontend has no React test infrastructure — per Phase 8's `08-VALIDATION.md` precedent, the Manage Accounts tile and BrowserWindow-driven UX are manual-only, covered by a HUMAN-UAT pass plus the D-12 debug-trigger's structured report.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | yes | BrowserWindow delegates credential handling entirely to Humble's own web form (no app-side password handling); only the resulting session cookie is app-managed |
| V3 Session Management | yes | `_simpleauth_sess` cookie treated as a bearer session token; 401-based expiry detection; explicit Disconnect clears the isolated partition entirely (D-07) |
| V4 Access Control | no | Single-user desktop app; no multi-tenant access control surface in this phase |
| V5 Input Validation | yes | `zod` schema validation on every adapter response (C5); Humble Guard code / credentials themselves are never touched by app code (entered directly into the real web form) |
| V6 Cryptography | yes | Electron `safeStorage` (OS-backed: Keychain/DPAPI/libsecret) for cookie encryption at rest — never hand-rolled crypto |

### Known Threat Patterns for Electron + undocumented-session-API auth

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Session cookie exfiltration via logs | Information Disclosure | Never log the raw cookie value in `logInfo`/`logError`/`logWarning`; no full-response logging (PITFALLS.md C4) |
| Session cookie exposure via IPC to renderer | Information Disclosure | `humbleAuthState` IPC payload contains only `{ isLoggedIn, username?, expired? }` — never the cookie itself |
| Plaintext credential storage on Linux without keyring | Information Disclosure | `safeStorage.isEncryptionAvailable()` check + explicit user-facing warning (success criterion 5; see Open Question 1 for warn-vs-refuse decision) |
| Cross-domain cookie bleed between Humble and the app's shared session | Tampering / Elevation of Privilege | Isolated `humble-login` partition (D-07) keeps Humble cookies out of the app's default session entirely |
| Undocumented API silently changing response shape and misclassifying auth state | Tampering (data integrity) | `zod` schema validation at the adapter boundary; typed error returned on mismatch rather than blind `as` casts |

## Sources

### Primary (HIGH confidence)
- `.planning/research/SUMMARY.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `.planning/research/HUMBLE-SPEC-SOURCE.md` — in-repo v1.2 research basis, read in full for this phase
- `src/backend/storeManagers/steam/user.ts`, `src/backend/storeManagers/steam/electronStores.ts` — read directly; safeStorage/TOKEN_PREFIX/store-layout patterns
- `src/backend/storeManagers/steam/__tests__/user.test.ts` — read directly; jest mock-boundary structure for the equivalent Humble tests
- `src/backend/storeManagers/legendary/user.ts` — read directly; `session.fromPartition` + `clearStorageData/clearCache/clearAuthCache/clearHostResolverCache/clearData` wipe pattern, direct precedent for D-07/D-11
- `src/backend/main_window.ts`, `src/backend/ipc.ts`, `src/common/types/ipc.ts`, `src/preload/api/steam.ts` — read directly; `BrowserWindow` construction convention, `addHandler`/`makeHandlerInvoker` IPC pattern, confirmed camelCase channel naming (correction to ARCHITECTURE.md's colon-namespaced illustration)
- `src/frontend/screens/Login/index.tsx`, `src/frontend/screens/Login/components/Runner/index.tsx`, `src/frontend/screens/Login/components/SteamLogin/index.tsx` — read directly; Runner tile reuse (D-01) and the existing per-store login-panel pattern
- `.planning/phases/08-new-steam-surfaces/08-VALIDATION.md` — read directly; VALIDATION.md artifact pattern that `10-VALIDATION.md` (D-15) follows, and precedent for "no frontend test infra, manual-only" classification
- `package.json` — read directly; confirmed `axios ^1.13.5`, `electron-store ^8.2.0`, `zod ^3.24.3`, Electron `^41.1.1` already installed, zero new packages needed

### Secondary (MEDIUM confidence)
- None beyond what's cited in the in-repo research files above (those files' own MEDIUM-confidence claims — e.g. exact `_simpleauth_sess` TTL, `X-Requested-By` header effectiveness — are carried forward into this phase's Assumptions Log rather than re-verified independently, since Phase 10's own D-12/D-13 validation gate is the mechanism designed to resolve them)

### Tertiary (informational / rejected)
- `humblebundle` npm v1.0.5 (2016) — confirmed abandoned per STACK.md; not used

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; every primitive (BrowserWindow, session.fromPartition, safeStorage, axios, zod, electron-store) confirmed present and already used analogously elsewhere in this exact codebase
- Architecture: HIGH — every component maps to a direct, read-in-full in-repo precedent (Steam auth, Epic partition wipe, existing IPC/preload conventions)
- Pitfalls: HIGH for secrets/session-management/IPC-naming pitfalls (verified against this codebase directly); MEDIUM for live Humble API behavior (access denial, header effectiveness, exact cookie TTL, account-identifier endpoint) — all five are explicitly gated behind this phase's own D-12/D-13 live validation, which is the correct place to resolve them, not this research pass

**Research date:** 2026-07-05
**Valid until:** 30 days for the stack/architecture/pattern findings (stable, in-repo-verified); the live-API-behavior findings are only as valid as the next D-12 validation run — re-validate immediately if Humble changes its login flow or API responses before Phase 11 begins
