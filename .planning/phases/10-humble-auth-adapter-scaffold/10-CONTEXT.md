# Phase 10: Humble Auth + Adapter Scaffold - Context

**Gathered:** 2026-07-05
**Updated:** 2026-07-05 (mid-execution revision — plans 10-01..10-04 executed, 10-05 parked at its checkpoint)
**Status:** Ready for planning (replan of the login surface + 10-05 gate required)

<domain>
## Phase Boundary

Users can connect a Humble Bundle account from Manage Accounts via an in-app browser
login (email/password + reCAPTCHA + Humble Guard emailed code, all completed inside the
embedded browser surface), with the session cookie persisted encrypted across restarts;
users can disconnect and remove their session data; and the C5 adapter boundary
(`src/backend/humble/adapter.ts`) exists and is **empirically validated against the live
Humble API before any Phase 11 feature work proceeds**.

Delivers HACCT-01, HACCT-02, HACCT-03. No library sync, no key views, no dedup — those
are Phases 11–15. Humble is a keys domain, NOT a Runner (locked v0.3 decision).

</domain>

<decisions>
## Implementation Decisions

> **Revision note (2026-07-05):** D-02, D-05, D-07, D-11, D-13, D-14 were revised
> mid-execution after the 10-05 checkpoint surfaced (a) the login window never
> auto-closing because the assumed `/api/v1/user/info` identity endpoint kept rejecting
> validated-looking cookies, and (b) the user's design question about why Humble uses a
> popup when Epic/GOG/Amazon log in inside the embedded Stores WebView. Decisions below
> are the CURRENT truth; superseded wording is struck through in spirit, not preserved.
> New decisions from the revision are D-16..D-18.

### Manage Accounts presentation
- **D-01:** Humble appears as a **standard Runner-style tile** on Manage Accounts,
  visually identical to Epic/GOG/Amazon/Steam (reuse
  `src/frontend/screens/Login/components/Runner`). The "not a Runner" distinction stays
  backend-only.
- **D-02 (revised):** Connected state shows the **account email/name when available,
  falling back to a generic "Connected" label**. The identity fetch is **best-effort**:
  it must never block login completion, and a failed identity fetch is retried on later
  app startups. (Originally the identity endpoint was a hard part of the validation
  gate; see D-16/D-17.)
- **D-03:** Disconnect shows a **confirmation dialog**, then wipes the session cookie +
  stored identity. Policy for later phases: cached Humble library and sync state are
  wiped too — clean-slate disconnect; reconnecting re-syncs from scratch.
- **D-04:** **Exception to the wipe:** the append-only reveal/redeem audit log and the
  write-ahead REVEALED flags (Phase 11+) **survive disconnect**. They are the only record
  that a key was revealed but not activated; wiping them would let a re-connected account
  show a revealed key as UNREVEALED again (C1/C6 key-waste risk).

### Login surface & UX
- **D-05 (revised):** Humble login happens in the **embedded Stores WebView** via a new
  **`/loginweb/humble` route** (reusing `src/frontend/screens/WebView/index.tsx`),
  matching the Epic/GOG/Amazon login UX. The popup BrowserWindow approach (built in
  plans 10-02..10-05) is retired. Cookie detection still runs from the **main process**
  — `session.fromPartition()` cookies are readable regardless of which surface hosts the
  page. The moment a candidate `_simpleauth_sess` cookie **validates** (D-16), extract +
  encrypt it. Post-validation navigation (auto-return to Manage Accounts vs other) is
  Claude's discretion — match existing Epic/GOG post-login behavior.
- **D-06 (carried, retranslated):** Abandoning the login (navigating away from the
  login route / closing the surface) before validation is a **silent cancel** — tile
  stays disconnected, no error/toast; the user can just click Connect again.
- **D-07 (revised):** The login WebView uses the dedicated partition **`persist:humble`**
  (renamed from in-memory `humble-login` — see D-18), keeping Humble cookies out of the
  app's shared session. Explicit Disconnect clears the whole partition (HACCT-03 "remove
  all session data").
- **UA note (carried from execution):** the standard-Chrome user-agent override
  (`standardBrowserUserAgent()` in `src/backend/humble/user.ts`, commit `f824e9a3`)
  remains required for Google SSO; on a `<webview>` it is applied via the `useragent`
  attribute instead of `webContents.userAgent`.

### Login-success detection
- **D-16 (new):** The **authoritative login-success signal is the gamekeys endpoint**:
  a candidate `_simpleauth_sess` cookie is accepted iff `GET /api/v1/user/order`
  returns 200 AND parses against the adapter's zod schema. This replaces the assumed
  `/api/v1/user/info` identity check as the login gate — login validation and D-13 gate
  criterion #1 now share one proven call. The identity/username fetch runs after
  acceptance, best-effort only (D-02).
- The existing candidate-cookie discipline from execution **carries forward**: Humble
  sets `_simpleauth_sess` for anonymous visitors, the same value may persist across the
  anonymous→authenticated transition, so rejected values are throttled (not blacklisted)
  on the poll path and always re-validated on top-level navigations (commits `3e6a141b`,
  `701fdf9d`).

### Session expiry & reconnect (HACCT-02)
- **D-08:** Expiry detection = **startup health check + 401s**: one cheap authenticated
  adapter call at app startup, plus any 401 on a live request marks the session expired.
  401 (session expired) must be distinguished from 403 (Humble-side access denial — C5
  serve-cache-and-backoff path).
- **D-09:** Reconnect prompt = **expired tile state + one-time toast**: the Manage
  Accounts tile flips to "Session expired — Reconnect" and a dismissible toast fires when
  expiry is detected. Clicking Reconnect navigates to the `/loginweb/humble` route. No
  persistent chrome; cached views untouched.
- **D-10:** **Full reconnect machinery ships in Phase 10** (detection, tile state, toast,
  reconnect flow) even though no Humble library views exist yet — Phase 11 consumes the
  existing expiry signal for its "couldn't refresh" state.
- **D-11 (revised):** On reconnect after expiry, the `persist:humble` partition is
  **kept** so the remembered browser can reduce re-login friction (possibly skipping
  Humble Guard). **D-18 makes this real across restarts** — the old `humble-login`
  partition had no `persist:` prefix and was silently in-memory. Partition is fully
  cleared only on explicit Disconnect (D-07).
- **D-18 (new):** Login partition is **`persist:humble`** (Chromium-persistent, matching
  the WebView screen's `persist:${store}` convention). Accepted trade-off: a second
  on-disk copy of the Humble session lives in Chromium's cookie store, same as every
  other runner's login partition. The encrypted electron-store cookie remains the
  canonical credential for the adapter.

### Live validation gate (blocks Phase 11)
- **D-12:** Validation runs via a **dev-only in-app debug trigger** (IPC/menu) that
  exercises the REAL adapter + stored encrypted cookie from the Electron main process and
  emits a structured pass/fail report. User runs it once during UAT with their real
  Humble account. No standalone Node script as gate evidence (Node CLI ≠ Electron main).
- **D-13 (revised):** **PASS = endpoints + shape, identity advisory:**
  (1) `GET /api/v1/user/order` (gamekeys list) returns 200;
  (2) at least one `GET /api/v1/order/{gamekey}` detail returns 200;
  (3) responses parse against the adapter's zod schemas, including
  `tpkd_dict.all_tpks[n].steam_app_id` presence.
  The account-identifier endpoint result is **recorded in 10-VALIDATION.md but is
  advisory — it cannot fail the gate** (demoted from blocking criterion #4, consistent
  with D-02's generic-"Connected" fallback).
- **D-14 (revised):** Axios (+ cookie + `X-Requested-By: hb_android_app`) **stays the
  primary transport**; the D-16 gamekeys-based login validation doubles as the live
  transport retest (the earlier rejections may have been the assumed `/api/v1/user/info`
  URL, not the transport). If axios is confirmed blocked against the documented
  endpoints, the **in-phase fallback is `ses.fetch()` on the `persist:humble` partition**
  (browser-equivalent requests through Chromium's network stack, same adapter function
  signatures) — this replaces the original hidden-BrowserWindow webRequest-proxy design.
  Phase 10 does not complete until ONE validated transport works — Phase 11 never starts
  on an unproven transport.
- **D-15:** Gate evidence is recorded as **`10-VALIDATION.md`** in the phase directory —
  structured report (endpoints hit, status codes, schema-parse results), **redacted** (no
  cookie values, no key values). Canonical ref for Phase 11 planning. Follows Phase 8's
  `08-VALIDATION.md` pattern.
- **D-17 (new):** Migration/rework scope for the surface switch: the planner decides
  what happens to the retired BrowserWindow login code (delete vs refactor into the
  WebView-backed flow) — the cookie-validation state machine in
  `src/backend/humble/user.ts` (throttle, navigation-forced re-validation,
  single-flight) should be preserved and re-pointed at the new partition/surface, not
  rewritten from scratch.

### Claude's Discretion
- Post-validation navigation in the WebView flow (auto-return to Manage Accounts vs
  other) — match existing Epic/GOG behavior.
- Exact cookie-detection wiring for the WebView surface (main-process poll vs webview
  navigation events relayed over IPC; current poll+navigation hybrid is a good baseline).
- Disposition of the retired BrowserWindow code (per D-17).
- Toast wording/copy and expired-tile visual treatment (use existing semantic tokens).
- IPC channel naming (`humble:*` per research architecture) and store key shapes,
  following existing `addHandler()` / `electron-store` conventions.
- Exact shape of the dev-only debug trigger (hidden menu item vs IPC-only).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 10: Humble Auth + Adapter Scaffold" — goal + 5 success criteria (incl. Linux no-keyring warning).
- `.planning/REQUIREMENTS.md` § "Humble Account" — HACCT-01/02/03 wording.

### v0.3 research basis (auth path, C5 boundary, API details)
- `.planning/research/SUMMARY.md` — executive synthesis: zero new deps, C5 adapter isolation, `X-Requested-By: hb_android_app` on every request, 401-vs-403 handling. (Its "BrowserWindow-only auth" framing is superseded by D-05-revised: embedded WebView surface, main-process cookie capture unchanged.)
- `.planning/research/ARCHITECTURE.md` — `src/backend/humble/` component breakdown (adapter.ts, user.ts, electronStores.ts, ipc_handler.ts) and the never-a-Runner constraint.
- `.planning/research/PITFALLS.md` — C5 (API access denial history: Lutris 2022/2024/2025) and session-cookie handling rules (never logged, never in full IPC payloads).
- `.planning/research/STACK.md` — library-level detail for session.cookies/axios/safeStorage usage.
- `.planning/research/HUMBLE-SPEC-SOURCE.md` — endpoint/field reference (gamekeys, order detail, `tpkd_dict.all_tpks[n].steam_app_id`). NOTE: `/api/v1/user/info` was an ASSUMED endpoint and is demoted to best-effort (D-02/D-16); the documented gamekeys/order endpoints are the load-bearing ones.

### Execution artifacts from plans 10-01..10-05 (partial)
- `.planning/phases/10-humble-auth-adapter-scaffold/10-01-SUMMARY.md` .. `10-04-SUMMARY.md` — what exists already (adapter, user service, stores, IPC, tile UI).
- `.planning/phases/10-humble-auth-adapter-scaffold/10-05-PLAN.md` — the parked validation-gate plan; must be replanned against D-13/D-14/D-16 revisions.
- `src/backend/humble/user.ts` — current login/validation state machine (commits `dec7910d`, `3e6a141b`, `f824e9a3`, `701fdf9d`); D-17 says preserve its validation discipline when re-surfacing.

### Existing patterns to follow
- `src/frontend/screens/WebView/index.tsx` — the `/loginweb/:runner` embedded login pattern (route → `<webview>` with `persist:` partition) that `/loginweb/humble` extends.
- `src/backend/storeManagers/steam/user.ts` — the `safeStorage` + `TOKEN_PREFIX` sentinel encryption pattern, including the plaintext-fallback warning path that satisfies success criterion 5 (Linux no-keyring warning).
- `.planning/phases/08-new-steam-surfaces/` (`08-VALIDATION.md`) — the VALIDATION.md artifact pattern D-15 follows.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/frontend/screens/Login/components/Runner` — the Manage Accounts tile component; Humble reuses it directly (D-01). Already wired in plans 10-01..10-04.
- `src/frontend/screens/WebView/index.tsx` — the embedded login surface; already maps `/loginweb/:runner` → login URL with `partition={persist:...}`. Humble adds its route + `useragent` attribute here (D-05-revised).
- `src/backend/humble/user.ts` — built login/validation machinery: `standardBrowserUserAgent()`, candidate-cookie validation with throttle + navigation-forced re-validation + single-flight guard, safeStorage encryption with degraded-encryption flag. Re-point at the WebView partition rather than rewriting (D-17).
- `src/backend/humble/adapter.ts` — `getGamekeys`/`getOrderDetail`/`getAccountIdentity` behind the C5 wall; `getGamekeys` becomes the login validator (D-16).

### Established Patterns
- IPC via `addHandler()` typed in `AsyncIPCFunctions` / `FrontendMessages` — all `humble:*` channels follow this.
- Runner logins use the in-app `/loginweb/:runner` WebView route with `persist:` partitions — **Humble now follows this pattern too** (D-05-revised; the earlier "Humble deviates by design" note is retracted). Cookie extraction happens main-process-side via `session.fromPartition('persist:humble').cookies`; the surface hosting the page is irrelevant to capture.
- Steam login tile state management in GlobalState/ContextProvider — the Humble tile's connected/expired/disconnected states follow the same context-slice approach (a `humble` slice, not a runner entry).

### Integration Points
- Parallel domain `src/backend/humble/` — adapter.ts (C5 wall), user.ts (auth), electronStores.ts, ipc_handler.ts, validation.ts. `storeManagers/index.ts` and the `Runner` union are NOT touched.
- Manage Accounts screen (`src/frontend/screens/Login/index.tsx`) — where the Humble tile mounts (done in 10-03/10-04).
- `src/frontend/screens/WebView/index.tsx` — new `/loginweb/humble` entry + Humble partition/useragent handling.
- Toast/notification surface for the expiry prompt (D-09) — reuse the existing frontend toast mechanism.

</code_context>

<specifics>
## Specific Ideas

- Login should feel identical to the Epic/GOG embedded logins — same surface, same
  post-login return; the popup was the thing the user explicitly pushed back on.
- The validation gate must exercise the **exact production code path** (real adapter,
  real stored encrypted cookie, Electron main process) — an approximation via a Node
  script does not count as gate evidence.
- Cookie-validation discipline stays status-only in logs: never log the cookie value;
  the `Humble identity check rejected candidate session: <status>` line remains the
  diagnostic breadcrumb for transport problems.
- Partition: `persist:humble` — kept across expiry re-logins, cleared on Disconnect.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Audit-log/REVEALED-flag wipe exemption
(D-04) sets policy for Phases 11/14 stores but requires no Phase 10 work beyond not
wiping stores that don't exist yet.)

</deferred>

---

*Phase: 10-humble-auth-adapter-scaffold*
*Context gathered: 2026-07-05 (revised mid-execution, same day)*
