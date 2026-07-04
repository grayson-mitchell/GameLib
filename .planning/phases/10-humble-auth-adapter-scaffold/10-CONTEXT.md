# Phase 10: Humble Auth + Adapter Scaffold - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can connect a Humble Bundle account from Manage Accounts via an in-app browser
login (email/password + reCAPTCHA + Humble Guard emailed code, all completed inside the
browser window), with the session cookie persisted encrypted across restarts; users can
disconnect and remove their session data; and the C5 adapter boundary
(`src/backend/humble/adapter.ts`) exists and is **empirically validated against the live
Humble API before any Phase 11 feature work proceeds**.

Delivers HACCT-01, HACCT-02, HACCT-03. No library sync, no key views, no dedup — those
are Phases 11–15. Humble is a keys domain, NOT a Runner (locked v1.2 decision).

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 10: Humble Auth + Adapter Scaffold" — goal + 5 success criteria (incl. Linux no-keyring warning).
- `.planning/REQUIREMENTS.md` § "Humble Account" — HACCT-01/02/03 wording.

### v1.2 research basis (auth path, C5 boundary, API details)
- `.planning/research/SUMMARY.md` — executive synthesis: BrowserWindow-only auth, zero new deps, C5 adapter isolation, `X-Requested-By: hb_android_app` on every request, 401-vs-403 handling.
- `.planning/research/ARCHITECTURE.md` — `src/backend/humble/` component breakdown (adapter.ts, user.ts, electronStores.ts, ipc_handler.ts) and the never-a-Runner constraint.
- `.planning/research/PITFALLS.md` — C5 (API access denial history: Lutris 2022/2024/2025) and session-cookie handling rules (never logged, never in full IPC payloads).
- `.planning/research/STACK.md` — library-level detail for BrowserWindow/session.cookies/axios/safeStorage usage.
- `.planning/research/HUMBLE-SPEC-SOURCE.md` — endpoint/field reference (gamekeys, order detail, `tpkd_dict.all_tpks[n].steam_app_id`).

### Existing patterns to follow
- `src/backend/storeManagers/steam/user.ts` — the `safeStorage` + `TOKEN_PREFIX` sentinel encryption pattern, including the plaintext-fallback warning path that satisfies success criterion 5 (Linux no-keyring warning).
- `.planning/phases/08-new-steam-surfaces/` (`08-VALIDATION.md`) — the VALIDATION.md artifact pattern D-15 follows.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/frontend/screens/Login/components/Runner` — the Manage Accounts tile component; Humble reuses it directly (D-01).
- `src/backend/storeManagers/steam/user.ts` — `safeStorage.isEncryptionAvailable()` check, `encryptString` → base64 with `TOKEN_PREFIX` sentinel, plaintext-fallback warning. Copy this pattern for the `_simpleauth_sess` cookie.
- `src/backend/storeManagers/steam/electronStores.ts` — the `configStore`/CacheStore layout the three Humble stores (`humbleConfigStore`, later `humbleLibraryStore`/`humbleAuditStore`) should mirror.

### Established Patterns
- IPC via `addHandler()` typed in `AsyncIPCFunctions` / `FrontendMessages` — all `humble:*` channels follow this.
- Existing runner logins use an in-app `/loginweb/:runner` WebView route; **Humble deviates by design** (BrowserWindow, D-05/D-07) because cookie extraction needs `webContents.session.cookies` from the main process. Do not add a `/loginweb/humble` route.
- Steam login tile state management in GlobalState/ContextProvider — the Humble tile's connected/expired/disconnected states follow the same context-slice approach (a `humble` slice, not a runner entry).

### Integration Points
- New parallel domain `src/backend/humble/` — adapter.ts (C5 wall), user.ts (auth), electronStores.ts, ipc_handler.ts. `storeManagers/index.ts` and the `Runner` union are NOT touched.
- Manage Accounts screen (`src/frontend/screens/Login/index.tsx`) — where the Humble tile mounts.
- Toast/notification surface for the expiry prompt (D-09) — reuse the existing frontend toast mechanism.

</code_context>

<specifics>
## Specific Ideas

- Auto-close login window the instant `_simpleauth_sess` is captured — the login should
  feel as seamless as the existing Epic/GOG WebView logins despite being a separate window.
- The validation gate must exercise the **exact production code path** (real adapter,
  real stored encrypted cookie, Electron main process) — an approximation via a Node
  script does not count as gate evidence.
- Session partition name suggestion: `humble-login`; kept across expiry re-logins,
  cleared on Disconnect.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Audit-log/REVEALED-flag wipe exemption
(D-04) sets policy for Phases 11/14 stores but requires no Phase 10 work beyond not
wiping stores that don't exist yet.)

</deferred>

---

*Phase: 10-humble-auth-adapter-scaffold*
*Context gathered: 2026-07-05*
