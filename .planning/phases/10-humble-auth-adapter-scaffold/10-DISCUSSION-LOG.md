# Phase 10: Humble Auth + Adapter Scaffold - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 10-humble-auth-adapter-scaffold
**Areas discussed:** Manage Accounts presentation, Login window UX, Session expiry & reconnect prompt, Live validation gate

---

## Manage Accounts presentation

### How should Humble appear on the Manage Accounts screen?

| Option | Description | Selected |
|--------|-------------|----------|
| Standard tile (Recommended) | Runner-style tile identical to Epic/GOG/Amazon/Steam; "not a Runner" stays backend-only | ✓ |
| Tile + keys subtitle | Same tile with a "Key management" subtitle | |
| Separate section | Distinct "Key services" section below the store runners | |

**User's choice:** Standard tile

### What should the tile show once connected?

| Option | Description | Selected |
|--------|-------------|----------|
| Generic 'Connected' (Recommended) | Connected state with Disconnect action, no identity string | |
| Show account email/name | Adapter fetches an account identifier post-login; adds one endpoint to validate | ✓ |
| You decide | Claude picks during planning | |

**User's choice:** Show account email/name — accepts the extra endpoint in the validation gate

### How should Disconnect behave?

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm, wipe everything (Recommended) | Confirmation dialog; wipe session + identity now, cached library/sync state in later phases | ✓ |
| Confirm, keep local cache | Wipe auth only; cached key data survives | |
| Instant, wipe everything | No confirmation dialog | |

**User's choice:** Confirm, wipe everything

### Exempt audit log + write-ahead REVEALED flags from the wipe?

| Option | Description | Selected |
|--------|-------------|----------|
| Exempt audit + REVEALED flags (Recommended) | Append-only audit log and REVEALED flags survive disconnect (C1/C6 protection) | ✓ |
| Wipe truly everything | Literal "remove all data"; accepts re-reveal risk on reconnect | |
| Ask at disconnect time | Checkbox in the confirm dialog | |

**User's choice:** Exempt audit + REVEALED flags

---

## Login window UX

### How should the login window detect success and close?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-close on cookie (Recommended) | Watch navigation/poll cookies for `_simpleauth_sess`; extract, encrypt, auto-close | ✓ |
| Show a done state first | Brief "Connected" state, close after delay | |
| User closes manually | Extract in background, window stays open | |

**User's choice:** Auto-close on cookie

### What happens if the user closes the window before completing login?

| Option | Description | Selected |
|--------|-------------|----------|
| Silent return (Recommended) | Tile stays disconnected, no error; closing = cancel | ✓ |
| Cancelled toast | Silent return + a "login cancelled" toast | |
| Confirm before closing | Intercept close with a confirm dialog | |

**User's choice:** Silent return

### Isolated session partition or shared default session?

| Option | Description | Selected |
|--------|-------------|----------|
| Isolated partition (Recommended) | Dedicated `humble-login` partition; Disconnect clears it wholesale | ✓ |
| Shared default session | Same session as other web content | |
| You decide | Claude picks after checking loginweb WebView sessions | |

**User's choice:** Isolated partition

---

## Session expiry & reconnect prompt

### When should expiry be detected?

| Option | Description | Selected |
|--------|-------------|----------|
| Startup check + 401s (Recommended) | Health check at startup + any 401 mid-request marks expiry | ✓ |
| 401-only, lazy | Discovered only when a real request fails | |
| You decide | Informed by validation-gate findings | |

**User's choice:** Startup check + 401s

### What form does the non-disruptive reconnect prompt take?

| Option | Description | Selected |
|--------|-------------|----------|
| Tile state + toast (Recommended) | "Session expired — Reconnect" tile state + one-time dismissible toast | ✓ |
| Persistent banner | Dismissible banner on Humble views until reconnected | |
| Tile state only | Quietest; risk of unnoticed expiry | |

**User's choice:** Tile state + toast

### How much reconnect machinery ships in Phase 10?

| Option | Description | Selected |
|--------|-------------|----------|
| Full machinery now (Recommended) | Detection + tile state + toast + reconnect flow all in Phase 10 | ✓ |
| Detection now, UX in 11 | Detection + tile state only | |

**User's choice:** Full machinery now

### Keep or clear the login partition on reconnect after expiry?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep partition (Recommended) | Browser state may reduce re-login friction; cleared only on Disconnect | ✓ |
| Clear every login | Pristine state every ~2–3 days | |
| You decide | Verify empirically during validation | |

**User's choice:** Keep partition

---

## Live validation gate

### How should the live API validation be run?

| Option | Description | Selected |
|--------|-------------|----------|
| In-app debug trigger (Recommended) | Dev-only IPC/menu trigger through the real adapter + stored cookie in Electron main | ✓ |
| Standalone dev script | Committed Node script; doesn't prove the Electron main path | |
| Both | Script for iteration + in-app trigger as gate | |

**User's choice:** In-app debug trigger

### What counts as PASS?

| Option | Description | Selected |
|--------|-------------|----------|
| Endpoints + shape (Recommended) | user/order 200 + order/{gamekey} 200 + zod schema parse incl. `steam_app_id` + identifier endpoint | ✓ |
| Reachability only | Authenticated 200s only | |
| Endpoints + shape + expiry | Adds a manufactured 401-vs-403 distinction test | |

**User's choice:** Endpoints + shape

### If the axios transport fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback in-phase (Recommended) | Build webRequest-proxy transport behind the same adapter interface; phase completes only with ONE validated transport | ✓ |
| Stop and reassess | Halt and discuss before building fallback | |
| Build both up front | Both transports from the start | |

**User's choice:** Fallback in-phase

### How is the gate result recorded?

| Option | Description | Selected |
|--------|-------------|----------|
| VALIDATION.md artifact (Recommended) | Redacted structured report saved as `10-VALIDATION.md`; canonical ref for Phase 11 | ✓ |
| UAT note in SUMMARY | Pass/fail + date only | |
| You decide | Claude picks format | |

**User's choice:** VALIDATION.md artifact

---

## Claude's Discretion

- Login window sizing/modality
- Cookie-detection mechanism (navigation hook vs polling cadence)
- Toast copy and expired-tile visual treatment (semantic tokens)
- IPC channel naming and store key shapes (follow existing conventions)
- Exact shape of the dev-only debug trigger

## Deferred Ideas

None — discussion stayed within phase scope.

---

# Revision Session — 2026-07-05 (mid-execution)

**Trigger:** Phase parked at the 10-05 live-validation checkpoint. Login window never
auto-closed (identity endpoint `/api/v1/user/info` kept rejecting candidate cookies)
and the user questioned the popup BrowserWindow vs the embedded WebView used by
Epic/GOG/Amazon.
**Areas discussed:** Login surface, Login-success detection, Transport posture (D-14), Partition persistence (D-11)

---

## Login surface

### Popup BrowserWindow or embedded Stores WebView?

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded WebView | Add `/loginweb/humble` route reusing the WebView screen; consistent with Epic/GOG/Amazon; main process still captures cookies via `session.fromPartition()` | ✓ |
| Keep BrowserWindow | Keep the popup as built (matches Steam's pattern in this fork) | |
| Let Claude decide | Planner weighs rework cost vs consistency | |

**User's choice:** Embedded WebView (revises D-05/D-07)
**Notes:** Framing fact stated up front: the surface switch does not itself fix the auto-close bug — that lives in the validation step.

### Post-validation behavior (auto-close equivalent)?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-return to accounts | Navigate back to Manage Accounts on validation (translation of D-05 auto-close) | |
| Stay + success toast | Remain on Humble page, user navigates back | |
| Let Claude decide | Match existing Epic/GOG post-login behavior | ✓ |

**User's choice:** Let Claude decide

---

## Login-success detection

### Authoritative login-success signal?

| Option | Description | Selected |
|--------|-------------|----------|
| Gamekeys endpoint (Recommended) | `GET /api/v1/user/order` 200 + zod parse = logged in; shares one proven call with D-13 gate criterion #1 | ✓ |
| Diagnose user/info first | Run the parked rejection-log diagnostic before deciding | |
| Page/URL signal | Detect authenticated navigation; brittle, proves nothing about API access | |

**User's choice:** Gamekeys endpoint (new D-16)

### Connected tile when identity fetch fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Generic "Connected" (Recommended) | No name shown; retry identity on later startups; login never blocks on flaky endpoint | ✓ |
| Scrape from page | Extract account email from the logged-in page DOM | |
| Let Claude decide | Planner picks during replanning | |

**User's choice:** Generic "Connected" (D-02 softened to best-effort)

### D-13 gate criterion #4 (identity endpoint) still blocking?

| Option | Description | Selected |
|--------|-------------|----------|
| Demote to advisory (Recommended) | Gate = gamekeys 200 + order detail 200 + zod parse incl. steam_app_id; identity recorded but non-blocking | ✓ |
| Keep it blocking | Phase can't complete until an identity source works | |

**User's choice:** Demote to advisory (D-13 revised)

---

## Transport posture (D-14)

### Transport prioritization after the rejections?

| Option | Description | Selected |
|--------|-------------|----------|
| Axios first, retest (Recommended) | Axios stays primary; gamekeys-based login validation doubles as the transport retest | ✓ |
| Session transport primary | Route all adapter calls through `ses.fetch()` now | |
| Build both in-phase | Both transports behind the adapter interface up front | |

**User's choice:** Axios first, retest
**Notes:** The earlier rejections may have been the assumed `/api/v1/user/info` URL, not the transport.

### Fallback mechanism if axios fails?

| Option | Description | Selected |
|--------|-------------|----------|
| ses.fetch (Recommended) | `ses.fetch()` on the Humble partition; browser-equivalent requests, no hidden window; same adapter signatures | ✓ |
| Keep webRequest proxy | Original D-14 hidden-BrowserWindow mechanism | |
| Let Claude decide | Pick when/if the gate fails | |

**User's choice:** ses.fetch (D-14 revised)

---

## Partition persistence (D-11)

### Should the login partition persist across restarts?

| Option | Description | Selected |
|--------|-------------|----------|
| persist:humble (Recommended) | Matches WebView convention; D-11's Humble-Guard-skip works across restarts; enables ses.fetch fallback after restart | ✓ |
| Keep in-memory | Only the encrypted store survives; every reconnect is a from-scratch login | |

**User's choice:** persist:humble (new D-18; discovered during scout that `humble-login` had no `persist:` prefix and was silently in-memory)

---

## Claude's Discretion (revision session)

- Post-validation navigation in the WebView flow (match Epic/GOG)
- Cookie-detection wiring for the WebView surface (poll vs relayed navigation events)
- Disposition of the retired BrowserWindow login code (preserve the validation state machine per D-17)

## Deferred Ideas (revision session)

None — discussion stayed within phase scope.
