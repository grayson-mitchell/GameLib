# Domain Pitfalls: Humble Bundle Key Management Integration

**Domain:** Undocumented-API key management in an Electron + React + TypeScript launcher
**Researched:** 2026-07-05
**Milestone:** v0.3 Humble Bundle Integration
**Confidence:** HIGH for Steam rate-limit mechanics and Electron secrets exposure; MEDIUM for Humble API fragility patterns (observed across community tools but not officially documented); MEDIUM for ToS risk assessment (no official Humble policy statement)

---

## Priority Note for Roadmap

Two pitfalls dominate in user harm severity and cannot be recovered from after the fact:

1. **Key wasting** (C2) — revealing a key for a game the user already owns is permanent waste; the key is consumed.
2. **Steam account rate-limit lockout** (C3) — "already owned" activations count as failed attempts; 10 failures lock the account for an hour. Both harms are magnified if auto-reveal or bulk-redeem patterns appear anywhere in the codebase.

Every phase that touches the claim or reveal flow must treat these as load-bearing constraints, not optional hardening.

---

## Critical Pitfalls

Mistakes with permanent or account-level consequences.

---

### Pitfall 1 (C1): Accidental Auto-Reveal via Prefetch or Retry Logic

**What goes wrong:**
A reveal call fires without an explicit per-key user action. Revealing exposes the key string, forfeits the Humble gift link, and — as of Humble's December 2024 ToS change — can advance the three-year expiration clock for previously unexpired keys. Common trigger patterns:

- A "prefetch all keys for caching" loop that calls the reveal endpoint to obtain key values for display.
- A retry wrapper around the reveal API call that re-submits on network error — if the first attempt succeeded server-side before the network error, the second call is a no-op but the reveal already happened. If the REVEALED flag was not persisted before the API call returned, the app now shows the key as UNREVEALED.
- A "reveal all Steam keys" or "claim ready keys" button that reveals without per-key user confirmation.
- An import flow that auto-reveals keys in order to compute their state (conflating "fetch state" with "perform action").

**Why it happens:**
Developers distinguish `REVEALED` from `REDEEMED` correctly in the data model but then look for key values at display time and reach for the reveal endpoint as the mechanism to get them. The spec's local REVEALED flag (§2, "Note on REVEALED") requires persistence discipline that is easy to shortcut.

**Consequences:**
- Gift link permanently forfeited for any auto-revealed key.
- Users who wanted to gift a spare key cannot recover the gift link.
- Once keys expire (three-year policy), an accidentally revealed key that was not activated is simply gone.

**Prevention:**
- The reveal endpoint must only ever be called from a single function, gated by an explicit user confirmation (modal with warning text about gift link loss). No other code path calls it.
- Persist the REVEALED flag to disk **before** the API call returns — write-then-call, not call-then-write. If the write fails, abort the reveal.
- The REVEALED flag must survive app restarts; in-memory state is insufficient.
- No "reveal all" button, no batch reveal loop, no reveal inside sync/fetch operations.
- Code review checklist: search for any call to the reveal endpoint outside the single guarded function.

**Warning signs:**
- Any loop that iterates over keys and calls reveal.
- Retry logic wrapping the reveal call without checking whether the first attempt already succeeded.
- `REVEALED` flag stored only in React state or in-memory cache.
- Tests that call reveal without a mock user confirmation.

**Phase to address:** Key claim flow phase (the phase that implements F5). The reveal gate must be the first thing implemented in that phase, before any UI is wired up.

---

### Pitfall 2 (C2 + C3): Wasting Keys on Already-Owned Games — and Triggering Steam Rate Limits in the Process

**What goes wrong:**
A user reveals and tries to activate a Steam key for a game they already own on Steam. Two harms occur simultaneously:

1. **Key waste**: The key is consumed (Steam returns "this account already owns this product"). The key cannot be un-revealed; the gift link is already gone.
2. **Rate limit advancement**: Steam counts "already owns this product" as a **failed activation attempt**, not a successful one. Steam's rate limit is approximately 50 successful activations per hour or approximately 10 failed activations — whichever cap is hit first. Each owned-game collision burns one failure slot. A user with a large Humble library and significant Steam overlap can hit the failure cap in a single session without revealing a single new game.

**Why it happens:**
- Ownership detection (`owned_elsewhere`) is computed from a cached or stale owned-games list.
- Name-based fuzzy matching produces false negatives (the guard says "not owned" when the game is owned under a different title).
- The `owned_elsewhere` flag is computed at last-sync time and not revalidated before reveal.
- The reveal flow shows a warning but still offers a "reveal anyway" path for already-owned games (the guard becomes advisory rather than blocking).

**Fuzzy name match false negative examples (real, observed in Playnite Humble plugin):**
- `"Assault Android Cactus+"` does not match `"Assault Android Cactus"` under simple equality.
- `"FRAMED Collection"` vs `"Framed Collection"` (case sensitivity).
- `"Into the Breach"` vs `"Into The Breach (Steam)"` (platform suffix appended by some libraries).
- DLC key titled `"Game X: Season Pass"` — the matcher sees no match against owned `"Game X"`, so it flags as unowned. The base game is owned; the DLC may or may not be. Treating this as "safe to redeem" can waste a key for already-owned DLC.
- Bundle pack titled `"Mega Pack"` — individual constituent games owned on Steam; the pack itself has no AppID match.

**Fuzzy match false positive examples (the opposite problem):**
- `"Batman"` matching against `"Batman: Arkham Knight"` when only the partial match is scored, flagging a key as owned when only a similarly-named game is owned.
- A non-Steam key for "Borderlands 3" matching against the owned Steam "Borderlands 3" — the key is for Epic; the guard correctly fires but for the wrong platform if platform is not checked first.

**Prevention:**
- Use Steam AppID as the primary match key, not title. Humble's `key_type` does not include AppID, but the Steam store API (`store.steampowered.com/api/appdetails?appids=N`) can be queried by title to resolve AppID. Build and cache a title→AppID lookup table.
- Fall back to fuzzy title matching only when AppID resolution fails. Set a conservative confidence threshold (~85% similarity). Treat unconfident matches as "unknown" — surface them for user review rather than auto-classifying.
- For DLC keys, check both the DLC title and the base game name separately. If the base game is owned, flag the DLC key for user review, not auto-block.
- Re-validate `owned_elsewhere` against a fresh Steam owned-games list immediately before showing the reveal confirmation — not just at sync time.
- Make the `owned_elsewhere == true` intercept a hard block on the primary claim path. Route to the giftable-spare view (F6) instead of offering "reveal anyway." The only way to override should be an explicit secondary action with a second warning.

**Warning signs:**
- Ownership check comparing only `title.toLowerCase()` without fuzzy scoring.
- `owned_elsewhere` computed once at sync time with no revalidation before reveal.
- A "reveal anyway" button in the owned-elsewhere warning dialog.
- No handling for DLC keys as a separate case from base-game keys.
- Missing `key_type` check before cross-referencing against the Steam library.

**Phase to address:** Ownership dedup phase (the phase that implements F3) sets up the data; the claim flow phase (F5) must enforce the guard. Both phases must address this; the dedup phase owns the accuracy, the claim phase owns the enforcement.

---

### Pitfall 3 (C3): Humble-Side API Rate Limiting and Access Denial

**What goes wrong:**
Humble's `api/v1/user/order` endpoint has a documented history of returning access denial (`UnauthorizedAccess`) to third-party tools even with valid sessions. Lutris reported this behavior across at least three separate incidents (2022, 2024, and March 2025). GameHub had a similar failure. The cause in each case appeared to be a backend change on Humble's side, not a bug in the client tool. Recovery required the tool to copy browser cookies manually, or wait for a community patch.

Separately, fetching every order detail in parallel at startup (N orders × 1 API call each) concentrates traffic into a burst that is likely to hit undocumented per-session rate limits.

**Why it happens:**
- Tools treat the undocumented API as if it were stable, with no fallback plan.
- Fan-out fetches (fetch all orders in parallel, no concurrency limit) look like bot traffic.
- Session expiry is not distinguished from access denial — both return auth errors, but the mitigation is different (re-login vs wait/retry).

**Consequences:**
- Entire Humble library becomes inaccessible if the API denies access.
- No way to reveal or track keys without a working Humble connection.

**Prevention:**
- Concurrency-bound the initial order fetch: fetch 3–5 orders concurrently, not all N in parallel.
- Cache every order response to disk immediately. On any API error during a sync, serve the cached data with a "last synced at X" notice rather than failing the UI.
- Distinguish auth errors (401/403 with session-expired signal) from Humble-side access denial (403 with no session-expired signal). The first requires re-login; the second requires a wait/retry with backoff.
- Back off exponentially on repeated 429 or 403 responses. Do not spam retry.
- The adapter layer (C5) must be the only place that makes this determination — callers get "data or error type" not raw HTTP status.

**Warning signs:**
- Parallel `Promise.all` over all order fetches with no concurrency limiter.
- A sync failure that shows an error to the user and clears the cached library view.
- Auth error and access-denied error handled by the same code path (both trigger re-login).

**Phase to address:** Library sync phase (F1). Concurrency bounding and cache-first fallback must be part of the initial sync implementation, not added later as a polish step.

---

### Pitfall 4 (C4): Secrets Leaking to Logs, DevTools, and IPC Payloads

**What goes wrong:**
The Humble `_simpleauth_sess` cookie, revealed Steam key strings (e.g., `XXXXX-XXXXX-XXXXX`), and Humble gift link URLs are all sensitive. In Electron applications, they can escape to:

1. **Log files**: `console.log` / `logInfo` of a full key object or API response body includes key values. Heroic's existing `logInfo`/`logError` utilities in `backend/logger.ts` likely do not scrub Humble-specific fields — they were not designed with key strings in mind.
2. **DevTools in production**: If `webContents.openDevTools()` is callable in production (or if a debug flag enables it), users or malware can inspect network requests and local state in the renderer. DevTools in production is a known Electron vulnerability pattern.
3. **IPC serialization**: If the full key record (including `redeemed_key_value` or `gift_link`) is sent over IPC to the renderer, it lives in renderer memory and is visible in DevTools. The renderer should receive only what it needs to display — status, title, expiration — not the raw key value.
4. **Crash dumps and error reports**: If the launcher reports errors (e.g., via Sentry), an exception that captures a key object in its stack context will send the key value to an external service.
5. **Electron `safeStorage` fallback on Linux**: On Linux systems without a configured keyring (common in server-like desktop environments, CI, or fresh installs), `safeStorage.isEncryptionAvailable()` returns `false` and `safeStorage` falls back to the `basic_text` backend — storing data in plaintext. The app must check `safeStorage.isEncryptionAvailable()` and warn the user if encryption is unavailable rather than silently storing the session cookie unencrypted.

**Why it happens:**
- Logger calls are copy-pasted from existing store managers; no one adds a scrubber for Humble-specific fields.
- "Send the full game object to the renderer" is the existing Heroic pattern for simpler stores; Humble key objects contain sensitive fields that other store game objects do not.
- `safeStorage` availability is not checked during development on macOS/Windows where it always succeeds.

**Consequences:**
- Session cookie in logs allows anyone with filesystem read access to hijack the Humble session.
- Revealed key strings in logs allow key theft if the log file is accessed.
- Gift links in logs enable unauthorized key gifting.

**Prevention:**
- Create a `scrubHumbleSecrets(obj)` utility that removes `_simpleauth_sess`, `redeemed_key_value`, `gift_link`, and any field containing a raw key string before logging.
- Apply this scrubber at the adapter layer boundary — nothing that crosses the adapter is logged with secrets in place.
- Define a separate `HumbleKeyDisplay` type that excludes all sensitive fields. IPC sends only this type to the renderer. The raw key string is only passed through IPC on an explicit "copy key" action, never as part of routine library sync data.
- Check `safeStorage.isEncryptionAvailable()` on startup. If false: show a warning ("Your session cannot be encrypted on this system — your Humble session is stored unprotected") and refuse to store the session, prompting re-login each session. Do not silently fall back to plaintext storage.
- Disable `webContents.openDevTools()` in production builds. GameLib inherits Heroic's existing build configuration; verify Heroic's production build does this and that Humble's renderer does not bypass it.
- Do not pass Humble session cookies through IPC from renderer to main. Only the main process touches the Humble adapter; the renderer makes named IPC calls.

**Warning signs:**
- `logInfo(JSON.stringify(humbleOrder))` anywhere in the codebase.
- IPC channel that sends the full `HumbleKey` object (with `redeemed_key_value`) to the renderer.
- No call to `safeStorage.isEncryptionAvailable()` in the auth initialization path.
- `console.log` in renderer components that receive key data.

**Phase to address:** Auth phase (session cookie storage) and adapter phase (IPC type boundaries, log scrubbing). Both must address this before any key data flows through the system.

---

### Pitfall 5 (C5): Undocumented API Shape Changes Breaking the Integration Silently

**What goes wrong:**
Humble's API is not versioned and has no official changelog. Known breaking-change patterns from community tools:

- **Field presence changes**: `tpkd_dict.all_tpks[n].redeemed_key_value` being absent is how `UNREVEALED` is detected (spec §2.1). If Humble renames this field or restructures `tpkd_dict`, the adapter will misclassify all revealed keys as unrevealed — potentially triggering reveal calls on keys that are already revealed.
- **Auth flow changes**: The `X-Requested-By: hb_android_app` header requirement was discovered through reverse engineering; Humble can add, change, or remove such headers without notice. Any auth flow change causes a blanket 401/403 that looks identical to a session expiry.
- **Endpoint path changes**: `api/v1/user/order` could become `api/v2/user/order`; existing integrations get 404s that are indistinguishable from network errors without careful status code handling.
- **`product.category` and `choice_url` semantics for UNPICKED detection**: Humble Choice subscription mechanics have changed at least twice (Humble Monthly → Humble Choice rebrand). These detection heuristics are fragile.

The December 2024 ToS change (retroactive three-year key expiration) was an example of a non-API change that broke integration semantics: tools that cached expiration state now served stale data showing keys as valid when Humble had expired them.

**Why it happens:**
The API is reverse-engineered; there is no vendor notification channel. Tools that inline Humble API calls throughout the codebase (rather than behind an adapter) must change in many places when anything breaks, and the breakage is often discovered only when users report problems.

**Consequences:**
- Silent misclassification of key states (revealed shown as unrevealed; redeemed shown as unrevealed; all keys shown as UNREDEEMABLE after an expiration field change).
- Launcher-wide failure if the API call is in a critical path with no fallback.

**Prevention:**
- Single adapter interface (C5 from spec). All Humble HTTP calls live in one module (`src/backend/storeManagers/humble/humbleAdapter.ts` or equivalent). No other file makes HTTP calls to Humble.
- The adapter validates response shape on every call using a schema validator (e.g., `zod`). If the response does not match the expected schema, the adapter returns a typed error rather than passing malformed data into the domain model.
- On schema mismatch: log the raw response shape (without secrets) to a debug log for diagnostics, surface a user-visible "Humble data format changed — please check for a GameLib update" message, and return the last valid cached data.
- Cache every successful response. The cache is the fallback for any API failure mode.
- Integration test the adapter against fixture responses captured from the real API. When the API shape changes, the fixture test fails, alerting the developer before users encounter the breakage.
- Expiration state is never cached as a final answer — it is recomputed from `expiration` dates on each sync because Humble applies expirations retroactively.

**Warning signs:**
- Humble API calls scattered across multiple files outside the adapter.
- No response shape validation — raw JSON cast to a type with `as HumbleOrder`.
- Expiration state stored as a boolean flag rather than computed from the expiration timestamp on each sync.
- No fallback to cached data on API error; instead, an error state that blanks the library view.

**Phase to address:** Adapter/library sync phase. The adapter isolation must be established as scaffolding before any feature code is written. Adding it later requires refactoring across the entire feature.

---

## Moderate Pitfalls

Mistakes that cause significant UX or data-correctness problems but are recoverable.

---

### Pitfall 6: Humble Guard Emailed-Code Auth Flow Gotchas

**What goes wrong:**
Humble Guard sends a one-time code to the user's email. Several failure modes:

- **Code TTL**: The emailed code has a short TTL (exact duration undocumented, likely minutes). If the user is slow to check email and the UI does not indicate TTL urgency, the code expires, and the submission returns an error that looks identical to "wrong code."
- **Retry on error submits stale code**: If the auth flow automatically retries on error (e.g., a network timeout during the code submission), the retry may submit the same code after the TTL has passed, entering a permanent failure loop.
- **No stored refresh mechanism**: Unlike `steam-session`'s refresh token model (valid ~200 days), Humble's session cookie (`_simpleauth_sess`) expires in approximately 2–3 days based on community tool observations. This is not a long-lived token. Users must re-authenticate frequently unless the cookie is refreshed by activity. The auth flow — including the Humble Guard email step — repeats on every expiry.
- **Rate limiting on Humble Guard codes**: Submitting multiple incorrect codes triggers temporary lockout of the Humble Guard step (duration undocumented). An auto-retry loop on wrong-code errors can lock the user out of their Humble account.

**Prevention:**
- Display a countdown timer on the Humble Guard code input field (or at minimum a "code expires soon" warning with a "resend code" option).
- Never auto-retry Humble Guard code submission. Each submission is a one-shot user action.
- On wrong-code or expired-code error, show a "request a new code" button — not an auto-retry.
- Treat session expiry as a routine event given the short cookie lifetime. The re-auth UX must be smooth: detect session expiry on the first API call that returns 401, suspend the pending operation, prompt re-login, then resume.
- Implement a "session health check" at app startup (a lightweight endpoint call) so the user is prompted to re-login at a predictable moment rather than in the middle of a reveal flow.

**Warning signs:**
- Humble Guard code input with no timer or resend mechanism.
- Catch block on the code-submission API call that automatically re-submits the same code.
- Re-login flow only triggered mid-operation (when sync or reveal fails) rather than at startup.
- Session cookie stored with an infinite TTL assumption; no expiry handling.

**Phase to address:** Auth phase.

---

### Pitfall 7: Expiration Dates Applied Retroactively — Cache Staleness

**What goes wrong:**
Humble's December 2024 ToS change demonstrated that keys which had no expiration when purchased can be assigned a retroactive three-year expiration. A key cached as `UNREVEALED` (no expiration) on Monday can be `UNREDEEMABLE` by Friday without any API field changing — the expiration field is simply added to the response on the next fetch.

More broadly, Humble and publishers add retroactive expirations "on a regular basis (going back years)" according to the community tracking repository. A launcher that caches expiration state as a fixed property will serve stale data to users, hiding urgency alerts and failing to surface keys that have become UNREDEEMABLE.

Additionally, keys already revealed and saved as key strings can still expire — a key over three years old that the user saved but didn't activate may now give "no longer available" on Steam activation.

**Prevention:**
- Always recompute UNREDEEMABLE status from the expiration date field on every sync, not from a cached boolean.
- After each sync, compare the new expiration set against the previous sync's expiration set and surface a "new expirations were added to your library" notification if any previously non-expiring key now has an expiration.
- Flag keys that are REVEALED but not yet REDEEMED with an urgency indicator if they are approaching or past expiration — these are the highest-risk keys (the user has the key string but has not yet activated it).
- Do not trust the cache for expiration state beyond the staleness window; force a sync if the cache is older than a reasonable threshold (e.g., 24 hours).

**Warning signs:**
- `expiration: null` stored as a final value in the key record rather than `expiration: Date | null` recomputed each sync.
- No notification logic for newly-expiring keys that were previously non-expiring.
- UNREDEEMABLE classification computed at import time only, not on each sync.

**Phase to address:** Data model phase (the phase that defines the key lifecycle model and persistence schema). The recomputation requirement must be designed into the model from the start.

---

### Pitfall 8 (C6): Reveal/Redeem Audit Log That Fails Under Network Errors

**What goes wrong:**
The audit requirement (C6) says every reveal and redeem is recorded locally (what, when, outcome). A naive implementation writes the audit record after the API call succeeds. If the network call succeeds but the write fails (disk full, app crash between call and write), there is no record — and the REVEALED flag is also not set. On next sync, the key appears UNREVEALED. The user may try to reveal again; the Humble response is inconsistent (the key is already server-side revealed but the local state says UNREVEALED).

Conversely, if the app crashes after the reveal API call but before writing the REVEALED flag, the spec's local tracking flag (§2 Note on REVEALED) is lost. The key stays UNREVEALED in the UI forever, and the user cannot see the key they just revealed.

**Prevention:**
- Use a write-ahead log pattern: write the audit record (with status: "in-progress") to disk first, then make the API call, then update the record to "succeeded" or "failed". On startup, scan for any "in-progress" records and reconcile with the Humble API.
- The REVEALED flag and the audit record are written in the same transaction (or at minimum the same synchronous write) before the API call returns.
- If the write fails: abort the reveal, show an error ("Could not save reveal record — please ensure disk is not full"), and do not call the reveal API.
- On startup, if an in-progress audit record exists with no corresponding REVEALED flag: query Humble for the current key state and reconcile. This is the recovery path for crash-during-reveal.

**Warning signs:**
- Audit log write is fire-and-forget (no error handling on the write).
- REVEALED flag set in React state and written to disk asynchronously without confirmation.
- No startup reconciliation for in-progress audit records.

**Phase to address:** Claim flow phase (F5, C6). Implement the write-ahead pattern from the first reveal implementation.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip AppID resolution, use name-only fuzzy match | Simpler implementation; no Steam store API calls | False negatives waste keys; false positives block valid reveals | Never — AppID match must be the primary strategy |
| Store `owned_elsewhere` as a persisted field | Avoid recomputing on every view | Stale ownership data after the user redeems a game on Steam; guard fires on already-redeemed keys | Only if recomputed on every sync, not persisted as truth |
| Inline Humble API calls in feature components | Faster initial development | All feature components break when Humble changes endpoints | Never — adapter isolation from day one |
| Skip Humble Guard code TTL UX | Simpler auth UI | Users confused by silent "wrong code" errors after code expires | Never — timer/resend is essential UX |
| Cache expiration as a boolean | Simpler data model | Retroactive expirations are silently missed | Never — always compute from timestamp |
| Log full Humble API responses for debugging | Faster debugging during development | Key strings and session cookies leak to log files | Only with a scrubber in place; never in production |
| `Promise.all` all order fetches at startup | Faster initial sync | Burst traffic looks like a bot; may trigger Humble access denial | Never — concurrency-bound always |

---

## Integration Gotchas

Common mistakes when connecting to Humble Bundle and Steam activation.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Humble auth | Store email/password for re-auth | Store only `_simpleauth_sess` cookie encrypted via `safeStorage`; re-authenticate via Humble Guard flow on expiry |
| Humble auth | Assume session cookie lasts weeks | Session expires in ~2–3 days; treat re-auth as routine; implement startup session health check |
| Humble API | Treat 401/403 as always "session expired" | Distinguish session expiry (re-login) from Humble-side access denial (backoff + user notification) |
| Humble API | Fetch all orders in parallel | Bound concurrency to 3–5 concurrent requests; exponential backoff on errors |
| Humble API | Cast raw JSON with `as HumbleOrder` | Validate response shape with `zod` or equivalent; return typed error on schema mismatch |
| Steam activation | Pass key directly to `steam://activateproduct` deep-link | User copies key string; deep-link opens Steam's "Activate a Product" dialog; app does not submit the key programmatically |
| Steam activation | Ignore "already owns product" as a safe state | "Already owns" counts as a failed activation attempt toward the rate limit; prevent it with ownership check before reveal |
| Steam rate limit | Treat rate limit as an infeasible edge case | With ~10 failed attempts triggering a 1-hour lockout, even 10 ownership-detection failures exhaust the failure budget |
| Expiration | Compute expiration state once at import | Recompute from timestamp on every sync; Humble adds retroactive expirations without notice |
| Gift link | Treat gift link as always present for UNREVEALED keys | Gift link is only present if `redeemed_key_value` is absent and the reveal has not happened; validate before surfacing |

---

## Security Mistakes

Domain-specific security issues.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Log the full Humble API response | Session cookie and key strings in log files; readable by malware or shared-account users | Scrub `_simpleauth_sess`, `redeemed_key_value`, `gift_link` before any log call at the adapter boundary |
| Send full `HumbleKey` record (including key value) over IPC to renderer | Key string exposed in renderer memory and DevTools | Define `HumbleKeyDisplay` (no sensitive fields) as the IPC type; send raw key string only on explicit user copy action |
| `safeStorage` without availability check | On Linux without keyring, falls back to plaintext | Check `safeStorage.isEncryptionAvailable()` at startup; warn user and refuse to persist session if unavailable |
| Store Humble email/password for re-authentication | Credential theft if app data directory is accessed | Store session cookie only, never credentials |
| DevTools accessible in production build | Users or malware can inspect renderer state including any IPC-delivered data | Verify Heroic's production build disables DevTools; confirm Humble renderer does not bypass this |
| Audit log containing key strings | Historical key values recoverable from audit log | Audit log records action metadata (title, timestamp, outcome), never the raw key string |

---

## UX Pitfalls

Common user experience mistakes in key management features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No differentiation between UNREVEALED and REVEALED in the library view | User thinks a key they already revealed is still giftable; tries to gift it | Clear per-key state badge; gift link action only shown for UNREVEALED keys |
| "Reveal" and "Redeem" presented as a single step | User reveals a key intending to redeem but abandons mid-flow; gift link is now gone | Two-step flow: reveal (with gift-link forfeit warning) → separate redeem action |
| Expiring-soon keys not sorted above non-expiring keys | User loses keys to expiration that were visible but not urgent-looking | Sort "Keys Waiting" by expiration urgency first; show countdown for keys expiring within 30 days |
| Non-Steam key types shown in the main claim flow | User attempts to claim an Epic or GOG key through the Steam path | Filter `key_type != 'steam'` into a "redeem on {platform}" link list; separate from the guided Steam claim flow |
| UNPICKED Choice months shown as individual keys | User confused by "month" entries mixed with individual keys | Group UNPICKED months separately with a "Pick games" deep-link to Humble, not a reveal action |
| No "why am I being blocked?" explanation on owned-elsewhere intercept | User frustrated that the launcher won't let them reveal a key | Show which Steam game entry caused the ownership match, with a link to the giftable-spare view |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Reveal flow**: Appears functional — verify gift link is actually forfeited (test with a real UNREVEALED key in staging), REVEALED flag survives app restart, and the write-ahead audit record is written before the API call fires.
- [ ] **Ownership guard**: Appears to work for obvious cases — verify DLC key titles, edition variants, and non-Steam key types are correctly excluded or handled; check behavior when Steam library is empty or stale.
- [ ] **Library sync**: Appears to load keys — verify behavior on Humble API 403 (serves cached data, not blank view), on session expiry mid-sync (prompts re-login, does not leave keys in a partial state), and on first run with zero cache (graceful loading state).
- [ ] **Expiration display**: Shows dates — verify that keys added after the last sync with new retroactive expirations surface a notification on the next sync, and that REVEALED+expired keys are flagged as high-urgency.
- [ ] **Secrets**: Keys appear in the UI — verify they do not appear in log files (search `humbleKey.redeemed_key_value` in logs after a test reveal), in IPC payloads (check DevTools Network tab for IPC messages), or in crash reports.
- [ ] **safeStorage**: Session is persisted — verify behavior on a Linux system without a keyring (`safeStorage.getSelectedStorageBackend()` === `'basic_text'`): confirm the app shows a warning and does not silently store plaintext.
- [ ] **Rate limiting**: Sync completes — verify with a large account (100+ orders) that the sync does not send all requests in parallel; check network tab for request timing.
- [ ] **Audit log**: Reveal action shows in audit — verify the log entry exists after a reveal, survives an immediate app restart, and records "failed" correctly when the API call fails after the log entry is written.

---

## Recovery Strategies

When pitfalls occur despite prevention.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Key accidentally auto-revealed | HIGH (irreversible) | No key recovery possible. The REVEALED flag must be set so the user can see the key string and attempt activation. Document in release notes that auto-reveal was a bug; consider compensating users with gift links if any were lost (not technically possible — inform only). |
| Steam rate limit lockout | LOW (time-bounded) | Wait 1 hour. No action required. If the lockout was triggered by owned-game collisions, fix the ownership guard before allowing further reveals. |
| Humble API access denied (403, not session) | MEDIUM | Serve cached library with "couldn't refresh — showing last sync" notice. Do not attempt immediate retry. Wait 10–30 minutes; retry with exponential backoff. If persistent, investigate whether Humble changed auth headers or endpoints. |
| Session cookie expired (401) | LOW | Prompt re-login via Humble Guard flow. Resume queued operations after re-auth. |
| API field name change (schema mismatch) | MEDIUM–HIGH | Adapter returns typed error; library shows cached data. A developer must update the adapter's schema and field mappings. If the REVEALED field mapping is wrong, all key states may be misclassified — requires a forced re-sync after the fix. |
| REVEALED flag lost on crash | MEDIUM | Startup reconciliation: find in-progress audit records, query Humble for current key state, set REVEALED flag if the API shows the key was revealed. Users get the key string back. |
| Secrets in logs | HIGH | Immediate patch to scrub logs; rotate the Humble session (log out and back in); notify users if logs were transmitted anywhere. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Auto-reveal via prefetch or retry (C1) | Claim flow phase | Code search for all reveal endpoint calls; confirm only one call site exists; audit log write-before-call confirmed in test |
| Key wasting on owned games (C2) | Ownership dedup phase + claim flow phase | Test with a Steam library fixture that includes games matching Humble keys by name and AppID; confirm guard fires correctly for DLC/edition variants |
| Steam activation rate limit (C3) | Claim flow phase | Verify ownership check fires before reveal; simulate "already owned" response; confirm no bulk reveal path exists in the codebase |
| Humble API rate limiting / access denial (C3) | Library sync phase | Test with a mock Humble API that returns 403; confirm library shows cached data, not error state |
| Secrets in logs / IPC / storage (C4) | Auth phase + adapter phase | Run a test reveal and grep logs for key-like strings; inspect IPC payloads in DevTools; check `safeStorage.isEncryptionAvailable()` path on Linux |
| API shape change breaks integration (C5) | Adapter/scaffold phase | Schema validation test against fixture responses; fixture update required when API shape changes |
| Missing / incomplete audit log (C6) | Claim flow phase | Simulate crash-after-reveal; verify startup reconciliation restores REVEALED state; verify audit record written before API call |
| Humble Guard TTL / retry loop | Auth phase | Test with a mock that returns "code expired" on first attempt; confirm UI shows resend option, not auto-retry |
| Retroactive expiration staleness | Data model phase | Inject a retroactive expiration into a fixture; verify recomputed-on-sync classification changes UNREVEALED → UNREDEEMABLE |

---

## Sources

- [Lutris — Humble Bundle api error (Issue #5958, March 2025)](https://github.com/lutris/lutris/issues/5958) — Access to api/v1/user/order denied; integration worked "a few weeks ago"
- [Lutris — Can not log into Humble Bundle account (Issue #4099, 2022)](https://github.com/lutris/lutris/issues/4099) — UnauthorizedAccess error pattern; session-persistence failure mode
- [Lutris — in version 0.5.11 no access to the humble bundle library (Issue #4448)](https://github.com/lutris/lutris/issues/4448) — Upgrade-induced integration breakage
- [castanley/humble-steam-redeem](https://github.com/castanley/humble-steam-redeem) — Rate limit documented: ~50 successful / ~10 failed keys per hour; ownership detection approach; gift link preservation pattern
- [Benjamin-Dobell/humble-bundle-key-redeemer](https://github.com/Benjamin-Dobell/humble-bundle-key-redeemer) — Ownership check via title match; record of previously redeemed keys to avoid rate limit waste
- [FailSpy/humble-steam-key-redeemer](https://github.com/FailSpy/humble-steam-key-redeemer) — Fetch-all-then-filter ownership approach; acknowledged limitations of title matching
- [Dasmius007/HumbleKeysLibrary (Playnite plugin)](https://github.com/Dasmius007/HumbleKeysLibrary) — Cache-to-JSON to prevent API spam; unredeemable/virtual order handling; redeemed key ignore setting
- [Playnite issue #1797 — Importing some third party store games from Humble when set to ignore them](https://github.com/JosefNemec/Playnite/issues/1797) — Name-matching false positives in real Humble titles (Assault Android Cactus+, FRAMED Collection, Into the Breach variants)
- [Steam "Too Many Activation Attempts" — Fanatical Support](https://support.fanatical.com/hc/en-us/articles/202260751--Too-Many-Activation-Attempts-reported-by-Steam) — ~25 key limit per hour; already-owned counts as failure
- [Steam Community — Valve changes rate limitations for Steam](https://www.steamgifts.com/discussion/rgj3q/valve-changes-rate-limitations-for-steam) — ~10 failed activations triggers lockout; "already owned" is a failure
- [SteamGifts — WARNING Some Humble Bundle Keys Now Unrevealable After Three Years](https://www.steamgifts.com/discussion/Dtclb/warning-some-humble-bundle-keys-now-unrevealable-after-three-years) — December 2024 retroactive expiration policy behavior
- [AlexanderTheGrey/humble-bundle-redemption-issues](https://github.com/AlexanderTheGrey/humble-bundle-redemption-issues) — Community tracking of retroactive expirations and publisher-side key exhaustion
- [ResetEra — Humble Bundle unused game codes expire after 3 yrs](https://www.resetera.com/threads/humble-bundle-unused-not-revealed-game-codes-expire-after-3-yrs-now-humble-is-not-obligated-to-provide-keys-in-case-of-them-being-out-of-stock.1112754/) — Community reaction confirming retroactive application
- [Hayden Schiff — Reverse engineering the Humble Bundle API](https://www.schiff.io/blog/2017/07/21/reverse-engineering-humble-bundle-api/) — Auth mechanism: `_simpleauth_sess` cookie; `X-Requested-By: hb_android_app` header; endpoint structure
- [saik0/humblebundle-python — client.py](https://github.com/saik0/humblebundle-python/blob/master/humblebundle/client.py) — `_simpleauth_sess` cookie name; session persistence pattern
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) — `isEncryptionAvailable()`, `getSelectedStorageBackend()`, Linux `basic_text` fallback behavior
- [Electron Security — IPC and contextBridge patterns](https://www.electronjs.org/docs/latest/tutorial/security) — `contextIsolation`, renderer access controls, DevTools in production

---
*Pitfalls research for: Humble Bundle key management integration in GameLib (v0.3)*
*Researched: 2026-07-05*
