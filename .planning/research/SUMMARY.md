# Project Research Summary

**Project:** GameLib — Humble Bundle Integration (v0.3)
**Domain:** Undocumented-API key management overlay on a multi-store Electron launcher
**Researched:** 2026-07-05
**Confidence:** HIGH for auth/architecture approach; MEDIUM for Humble API stability

---

## Executive Summary

Humble Bundle integration for GameLib is a key-management feature, not a store platform. Unlike Steam, Epic, or GOG — which contribute `GameInfo` objects to the unified library — Humble contributes a parallel domain: a pile of third-party keys (mostly Steam) in various claim states. The feature exists to solve two concrete user pains: never re-buying a game already owned, and never losing a key to expiration or Humble's buried order history. All three structural research files (STACK, ARCHITECTURE, PITFALLS) independently converged on the same six-phase build order with the same dependency rationale, which is strong evidence the ordering is correct and non-negotiable.

The technology story is unusually clean: zero new runtime packages are required. Electron's built-in `BrowserWindow` + `session.cookies` API handles authentication (reCAPTCHA and Humble Guard are handled by design, since the user completes them in a real browser window), `axios` makes API calls with the extracted cookie and the mandatory `X-Requested-By: hb_android_app` header, and `electron-store` + `safeStorage` persist credentials and library cache. Every new dependency evaluated was rejected: the only existing Node.js package (`humblebundle` v1.0.5, published May 2016) predates Humble Guard and provides no value over a from-scratch TypeScript adapter.

The dominant risks are not technical but behavioral. The Humble API is undocumented and has blocked third-party tools at least three times (Lutris issues #4099, #4448, #5958). The `_simpleauth_sess` session cookie expires in approximately 2-3 days requiring routine re-auth UX. The C5 adapter isolation boundary and the C1 no-auto-reveal constraint are load-bearing correctness requirements — not optional hardening. Key-wasting (revealing a key for an already-owned game) and Steam rate-limit lockout (~10 failed activations triggers a 1-hour ban; "already owns product" counts as a failure) are permanent or account-level consequences that must be prevented structurally.

---

## Key Findings

### Recommended Stack

Zero new dependencies are needed. The complete Humble integration is built on libraries already present in the repo. Electron's `BrowserWindow` is the only viable auth path: Humble's `/processlogin` endpoint requires a solved reCAPTCHA, making all programmatic login approaches impossible. Opening `https://www.humblebundle.com/login` in a `BrowserWindow` lets the user solve CAPTCHA and any Humble Guard email-code challenge naturally, then `webContents.session.cookies.get()` extracts the `_simpleauth_sess` cookie after login. Every HTTP call to Humble goes through `axios` with the cookie as a `Cookie` request header plus the mandatory `X-Requested-By: hb_android_app` header (reverse-engineered from the Humble Android app; omitting this header is the likely cause of all three Lutris integration failures). The session cookie is encrypted with `safeStorage.encryptString()` following the same `TOKEN_PREFIX` sentinel pattern used for the Steam refresh token in v0.1.

**Core technologies:**
- `Electron BrowserWindow` (built-in): Auth surface — CAPTCHA + Humble Guard handled by the browser with zero app-side logic required
- `Electron session.cookies` (built-in): Cookie extraction post-login via `cookies.get({ url, name: '_simpleauth_sess' })`
- `axios` v1.13.5 (already present): All Humble HTTP calls through the C5 adapter with `Cookie` + `X-Requested-By: hb_android_app` headers on every request
- `electron-store` v8.2.0 (already present): Encrypted credential persistence, `humble_library` CacheStore, audit log store
- `Electron safeStorage` (built-in): Cookie encryption at rest; `isEncryptionAvailable()` must be checked at startup; warn on Linux without a keyring rather than silently storing plaintext
- `@node-steam/vdf` v2.2.0 (already present): Local Steam data for dedup cross-reference where needed

**What NOT to add:**
- `humblebundle` npm (v1.0.5, May 2016): Abandoned; no Humble Guard; rewrites entire auth anyway — provides zero value
- `axios-cookiejar-support` / `tough-cookie`: Over-engineering for a single cookie; manual `Cookie` header is sufficient
- `puppeteer` / `playwright`: Adds 300+ MB; Electron `BrowserWindow` is the correct in-process auth surface
- Any native module: Project must stay mergeable with Heroic upstream; native modules break on Electron rebuild

### Expected Features

Features research confirmed the spec's 5-state model (UNPICKED / UNREVEALED / REVEALED / REDEEMED / UNREDEEMABLE) is correct and more complete than any existing tool. Playnite HumbleKeysLibrary uses binary state; FailSpy humble-steam-key-redeemer uses binary state. The local REVEALED flag has no reference implementation in the ecosystem — it is genuinely novel — which means there are no shortcuts to borrow for the three-way split.

**Must have (table stakes):**
- Library sync + Humble auth (F1) — nothing works without it; CAPTCHA + Humble Guard handled via BrowserWindow by design
- Claim-status classification with local REVEALED flag (F2) — the three-way UNREVEALED/REVEALED/REDEEMED split has no reference implementation; persistence design must be correct from the start
- Ownership-aware dedup — AppID path (F3 primary) — `steam_app_id` IS present in the Humble order API response (`tpkd_dict.all_tpks[n].steam_app_id`); AppID match is exact and authoritative
- "Keys waiting" view with expiration sort (F4 + F8) — Humble's December 2024 retroactive 3-year expiration policy (400+ documented title expirations) makes this urgent table stakes, not a differentiator
- Guided claim flow via web URL (F5) — `registerkey?key=XXXXX` pre-fills the key in browser; `steam://open/activateproduct` does NOT pre-fill and is unreliable on Linux Flatpak/Snap installs
- Non-Steam key link-out (F9) — non-Steam keys without a claim path are confusing dark matter in the UI

**Should have (competitive advantage):**
- Giftable-spares view (F6) — no existing launcher proactively surfaces gift links for owned-elsewhere unrevealed keys; genuinely differentiating
- Local REVEALED flag + audit record (C6) — prevents revealed-but-unactivated from appearing UNREVEALED; no existing tool does this
- Owned-elsewhere intercept on claim path (C2 guard) — routes to F6 instead of allowing wasteful reveal; structural safety
- Dedup collapse onto Steam library entry (F3 advanced) — redeemed keys appear as annotations on Steam entries rather than duplicates; Playnite does not do this

**Defer (v2+):**
- DRM-free Humble download management — separate download manager scope; not key-management
- Store overlay with ownership badges on game cards (F7) — real value but highest implementation cost; isolated from rest of feature set
- Expiration notifications via OS notification API (F8 extension) — the view is table stakes; the notification is the differentiator
- One-click activation for non-Steam key types — each platform requires its own auth/activation flow; enormous scope

**5 spec adjustments surfaced by features research:**
1. Flip F5 primary activation from `steam://open/activateproduct` to `https://store.steampowered.com/account/registerkey?key=XXXXX` + mandatory clipboard copy. The protocol does not pre-fill the key and is unreliable on Linux.
2. `steam_app_id` is confirmed present in `tpkd_dict.all_tpks[n]` — update spec Appendix A to document this field as the primary dedup key for Steam-type keys. AppID-first is fully available without external lookups.
3. Raise fuzzy match threshold from unspecified/community-norm 70% to 85%+ for `owned_elsewhere` determination. False positives waste gift links (DLC titles false-match base game titles). False negatives are safe — the user simply sees the key in "Keys waiting" and can decide.
4. Document accepted limitation: keys revealed on Humble's website (outside the launcher) appear UNREVEALED in GameLib until activation (when `redeemed_key_value` becomes present). Not a bug — accepted constraint of local-flag tracking.
5. `is_expired` must be recomputed from the expiration timestamp on every sync, never stored as a boolean. Humble applies retroactive expirations without notice; cached state goes stale.

### Architecture Approach

Humble is a keys domain, not a Runner. Adding `'humble'` to the `Runner` union type in `src/common/types.ts` would force implementation of 11 `LibraryManager` methods (install, launch, repair, syncSaves, etc.) that make no sense for a key-management overlay. Instead, Humble lives in a parallel `src/backend/humble/` domain. The `libraryManagerMap` in `storeManagers/index.ts` is not extended. The `Runner` union type is not extended. No existing store manager is modified.

`dedup.ts` reads `steamLibraryStore` from `steam/electronStores.ts` (the persisted cache), never importing `SteamLibraryManager` or `steam/user.ts` internals. This keeps coupling clean and ensures dedup works offline and survives a Steam CM disconnection.

**Major components:**
1. `adapter.ts` — C5 isolation wall; ALL Humble HTTP calls go through here; single file to update when the undocumented API breaks; includes required headers and `zod` response shape validation
2. `user.ts` — Auth: BrowserWindow login, cookie extraction, `safeStorage` persistence, session health check at startup, re-auth trigger on 401
3. `library.ts` — Sync: fetch gamekeys, fan-out order fetches with ~5-concurrent semaphore, normalize to 5-state model, preserve REVEALED flag across syncs, push via `sendFrontendMessage`
4. `dedup.ts` — Steam cross-reference: reads `steamLibraryStore` read-only; AppID primary match; normalized title fuzzy fallback at 85%+ threshold; `owned_elsewhere` + `matchConfidence` on every `HumbleKey`
5. `keys.ts` — Reveal action: single guarded function; write-ahead audit log before API call; C1/C2/C6 enforcement
6. `electronStores.ts` — Three stores: `humbleConfigStore` (auth + encrypted cookie), `humbleLibraryStore` (CacheStore: `humble_library` + `humble_sync`), `humbleAuditStore` (append-only reveal/redeem log)
7. `ipc_handler.ts` — All `humble:*` IPC channels via existing `addHandler()` pattern; typed in `AsyncIPCFunctions` and `FrontendMessages`
8. Frontend: `src/frontend/screens/Humble/KeysWaiting/`, `GiftableSpares/`, `ClaimFlow/` backed by a `humble` context slice in `ContextProvider`

**Key architectural constraints:**
- Never add 'humble' to Runner union — keys domain is not a game platform
- `dedup.ts` reads `steam/electronStores.ts` only — never imports SteamLibraryManager or SteamUser internals
- Store overlay (F7) on `GameCard` is an additive conditional overlay — GameInfo types and props stay clean
- Session cookie never stored unencrypted, never logged, never included in full IPC payloads to renderer

### Critical Pitfalls

1. **Accidental auto-reveal via prefetch or retry logic (C1)** — Revealing forfeits the gift link permanently and can start expiration clocks. Prevention: reveal endpoint callable from exactly one function gated by explicit user confirmation; REVEALED flag written to disk before the API call (write-ahead, not call-then-write); REVEALED flag persists across restarts in electron-store, not React state; no batch reveal, no reveal inside sync.

2. **Key wasting on already-owned games + Steam rate-limit lockout (C2 + C3)** — Steam counts "already owns product" as a failed activation. ~10 failures trigger a 1-hour lockout. Prevention: AppID-first ownership check (not fuzzy-only); re-validate `owned_elsewhere` immediately before reveal, not just at last-sync time; `owned_elsewhere == true` is a hard block routing to F6, not an advisory "reveal anyway" prompt.

3. **Humble API access denial (C5)** — Lutris lost access three separate times (2022, 2024, March 2025). The likely cause in each case was missing `X-Requested-By: hb_android_app`. Prevention: include all required headers; validate response shape with `zod` on every adapter call; on 403, serve cached data and backoff exponentially; distinguish session-expired 401 from Humble-side access denial 403.

4. **Secrets leaking to logs / IPC / storage (C4)** — Session cookie, revealed key strings, gift link URLs are all sensitive. Prevention: `scrubHumbleSecrets()` utility applied at the adapter boundary before any logging; IPC sends `HumbleKeyDisplay` (no sensitive fields); raw key string sent over IPC only on explicit user copy action; `safeStorage.isEncryptionAvailable()` checked at startup with warning/refusal on Linux without keyring.

5. **Retroactive expiration staleness** — Humble's December 2024 TOS change applied 3-year expirations retroactively to all prior purchases without notification (400+ titles documented). Prevention: UNREDEEMABLE classification always computed from the `expiration` timestamp on each sync, never stored as boolean; compare expiration sets between syncs and surface a notification when previously non-expiring keys gain an expiration.

---

## Implications for Roadmap

All three structural research files (STACK, ARCHITECTURE, PITFALLS) independently arrived at the same six-phase build order. The dependency chain is non-negotiable.

**The dependency lock:**
- Auth and adapter must be first — the C5 isolation boundary must be scaffolded before any feature code is written; the adapter is the single point that validates the cookie + header approach works against a live Humble account before anything else is built on top of it
- Library sync + key model must be second — everything in every subsequent phase reads from the normalized `HumbleKey[]` set; the REVEALED flag persistence design must be locked in before any data flows or it requires a migration later
- Dedup must come before the views — both Keys-Waiting and Giftable Spares filter on `owned_elsewhere`, which dedup sets; views built without dedup display incorrect data and require rework
- Keys-Waiting and Spares views must come before Guided Claim Flow — the C2 guard in the claim flow intercepts to the Giftable Spares view; that view must exist before the claim flow is wired
- Store overlay and expiration alerts are last — they depend on dedup data but have independent data sources (F7 uses the public bundle-listing endpoint, separate from the order API) and can ship after core key management is stable

### Phase 1: Humble Auth + Adapter Scaffold

**Rationale:** Auth-first is non-negotiable. This phase also contains the highest-risk validation in the entire integration: empirically confirming that an `axios` call with `Cookie: _simpleauth_sess=<value>` and `X-Requested-By: hb_android_app` reaches `api/v1/user/order` and returns a 200. If it is blocked, the fallback (proxying through `BrowserWindow webRequest.onBeforeRequest` so calls run inside the authenticated browser session) must be implemented here before Phase 2 proceeds. Secrets scaffolding (C4: log scrubbing, `HumbleKeyDisplay` IPC type, `safeStorage.isEncryptionAvailable()` check) must be established here — adding it later requires touching every file in the domain.
**Delivers:** Working Humble login/logout in Manage Accounts UI; encrypted session cookie storage; `adapter.ts` with both API endpoints callable; `humbleConfigStore`; IPC auth channels; Humble section visible in sidebar when logged in
**Features:** F1 (auth portion), C4, C5
**Avoids:** Humble Guard TTL/retry loop (resend option, no auto-retry); storing email/password (cookie only); plaintext session on Linux (availability check at startup)

### Phase 2: Library Sync + 5-State Key Model

**Rationale:** Once auth works, the normalized key set is the foundation every other phase reads from. The REVEALED flag persistence design must be locked in here — changing it later requires a data migration. Fan-out concurrency bounding (~5 in-flight orders at once) and the cache-first fallback on API errors must be part of the initial sync implementation, not retrofit later.
**Delivers:** `library.ts` sync loop with concurrency semaphore; 5-state classification; `humbleLibraryStore` CacheStore; REVEALED flag preserved across syncs; React `humble` context slice; `humbleKeysUpdated` frontend message; IPC sync channels; expiration recomputed on every sync
**Features:** F1 (library sync), F2, F8 (recomputation), C3 (concurrency bound)
**Avoids:** REVEALED flag in React state only; `Promise.all` over all orders; expiration as cached boolean; no fallback to cached library on API error

### Phase 3: Dedup + Ownership Annotation

**Rationale:** `owned_elsewhere` is a dependency of both the Keys-Waiting view (filter) and the Giftable Spares view (filter + gift link surface). Dedup must be complete before either view is built to avoid displaying incorrect states that require rework.
**Delivers:** `dedup.ts` with AppID-primary + fuzzy-fallback at 85%+ threshold; `owned_elsewhere` and `matchConfidence` flags on every `HumbleKey` in the persisted cache; all keys re-annotated on each sync; DLC/edition edge cases handled; low-confidence matches surfaced as "you may already own this" rather than definitive blocks
**Features:** F3 (ownership dedup), C2 guard data — enforcement comes in Phase 5
**Avoids:** Import of SteamLibraryManager internals (read `steamLibraryStore` only); fuzzy threshold too low; `owned_elsewhere` not recomputed on sync; name-match overconfidence

### Phase 4: Keys-Waiting + Giftable-Spares Views

**Rationale:** With auth, sync, and dedup in place, the two primary user-facing views can be built on real data. The Giftable Spares view must exist before Phase 5 since the claim flow's C2 guard routes to it.
**Delivers:** `KeysWaiting/` screen — unowned unredeemed keys sorted by expiration urgency then title; expiration countdown badges for keys expiring within 30 days; `GiftableSpares/` screen — owned-elsewhere + UNREVEALED keys with 1-click gift link copy + irreversibility warning; sidebar navigation; non-Steam key link-out section (F9)
**Features:** F4, F6, F8 (expiration sort), F9
**Avoids:** UNPICKED Choice months shown as individual keys; no state badge differentiation; expiring-soon keys not sorted above non-expiring keys

### Phase 5: Guided Claim Flow

**Rationale:** The claim flow depends on Phases 2 (UNREVEALED state), 3 (C2 guard requires `owned_elsewhere`), and 4 (C2 intercept routes to the Giftable Spares view). The C1/C2/C6 constraints are load-bearing — this phase must implement the write-ahead audit log, the single guarded reveal function, and the C2 hard block as structural elements.
**Delivers:** `keys.ts` reveal action with write-ahead audit record; C1 guard (explicit confirmation with gift-link-loss warning); C2 hard block (intercepts to Giftable Spares if `owned_elsewhere == true`; no "reveal anyway" override); post-reveal flow: mandatory clipboard copy + open `https://store.steampowered.com/account/registerkey?key=XXXXX` in default browser (NOT `steam://open/activateproduct`); "I activated it" confirmation button; `humble:revealKey` and `humble:markRedeemed` IPC channels; startup reconciliation for in-progress audit records after crash
**Features:** F5, C1, C2, C6
**Avoids:** `steam://open/activateproduct` as primary; REVEALED flag not surviving crash (write-ahead log reconciled at startup); auto-reveal via retry logic

### Phase 6: Store Overlay + Expiration Alerts

**Rationale:** F7 and the F8 notification extension have the lowest structural coupling to the rest of the feature and independent data source dependencies (F7 needs the Humble public bundle-listing endpoint, separate from the order API). Safe to build after core key management is stable; can be done in parallel by a second contributor once Phase 3's `owned_elsewhere` data is available.
**Delivers:** Optional `GameCard` badge overlay ("Owned" / "Unclaimed key available" / "New") as an additive conditional `<div>` when `humble.isLoggedIn`; no changes to GameInfo types or Runner coupling; OS notification for newly-expiring keys detected on sync; Humble public bundle listing (read-only) with "Buy on Humble" deep-links
**Features:** F7, F8 (notification extension)
**Avoids:** GameCard prop changes (additive overlay only); F7 using order API (use public bundle-listing endpoint); notification firing every sync for the same expiring keys (diff previous expiration set, notify only on new expirations)

### Phase Ordering Rationale

The six-phase order is driven by three hard dependency chains that all three research files identified independently:

1. Auth guards all data access. The `_simpleauth_sess` cookie must be obtainable before any API call is possible. The C5 adapter must be isolated before any feature code is written — this is the primary constraint from PITFALLS.md (C5 pitfall) and ARCHITECTURE.md ("Adapter-First Implementation").

2. Secrets and adapter scaffolding must precede features. C4 (secrets: log scrubbing, `HumbleKeyDisplay` IPC type, `safeStorage.isEncryptionAvailable()` check) must be established before any key data flows through the system. Adding it retroactively requires touching every file in the domain.

3. Dedup before claim flow (via the views). The C2 guard routes to the Giftable Spares view. The Giftable Spares view requires `owned_elsewhere` from dedup. The claim flow cannot be correctly implemented until both dedup (Phase 3) and the views (Phase 4) exist.

The convergence of all three research files on this exact ordering — independently, from different angles (stack selection vs. architecture design vs. pitfall prevention) — is the strongest indicator the ordering is correct.

### Research Flags

**Phase 1 requires live validation before Phase 2 begins:**
- Empirically confirm that `axios` with `Cookie: _simpleauth_sess=<value>` + `X-Requested-By: hb_android_app` successfully reaches `https://www.humblebundle.com/api/v1/user/order` from inside an Electron main process and returns order data. This is the top validation risk of the entire integration. If access is blocked despite correct headers, implement the fallback: intercept `BrowserWindow` network requests via `webRequest.onBeforeRequest` and proxy through the authenticated browser session.
- Confirm `steam_app_id` field is present in live API responses for Steam-type keys (confirmed in FailSpy source code, not independently verified against a captured live response fixture).

**Phases with established patterns (skip research-phase during planning):**
- Phase 4 (Keys-Waiting + Spares views): standard React context + filter/sort; no novel patterns
- Phase 5 (Claim Flow): mechanism defined; web URL activation confirmed; write-ahead log is a known pattern
- Phase 6 (Store Overlay): additive GameCard badge is low-risk; established pattern in the codebase

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new packages confirmed; all required primitives verified present; BrowserWindow auth is established Electron pattern; safeStorage pattern mirrors v0.1 Steam |
| Features | HIGH | Ecosystem well-studied across 5 community tools; `steam_app_id` field confirmed in FailSpy source; 5 spec adjustments are concrete and actionable |
| Architecture | HIGH | Codebase read directly; parallel `humble/` domain is structurally correct; IPC and store patterns match existing codebase exactly |
| Pitfalls | HIGH for rate-limit/secrets/C1; MEDIUM for API stability | Steam rate-limit mechanics confirmed from multiple sources; Humble API fragility confirmed from 3 Lutris incidents; exact Humble Guard TTL undocumented |

**Overall confidence:** HIGH for the build approach; MEDIUM for Humble API stability (undocumented API is an ongoing fragility risk independent of implementation quality)

### Gaps to Address

- **Live API validation (Phase 1, must resolve before Phase 2):** Confirm that `axios` + required headers can reach `api/v1/user/order` from inside Electron main process. Only unknown that could force the BrowserWindow webRequest proxy fallback.
- **`steam_app_id` field in live responses:** Confirmed in FailSpy source code but not against a captured live response fixture. Phase 3 dedup must degrade gracefully to fuzzy match if the field is absent on some orders.
- **`_simpleauth_sess` exact TTL:** Community tools observe ~2-3 days; exact TTL undocumented. Re-auth UX must treat this as a routine event; startup session health check is non-optional.
- **Humble Guard code TTL:** Duration undocumented (likely minutes). Auth UI must display a resend mechanism and must never auto-retry code submission.
- **REVEALED-outside-launcher edge case:** Accepted limitation; needs user-facing explanation in the UI when a key appears UNREVEALED unexpectedly.

---

## Sources

### Primary (HIGH confidence)
- ARCHITECTURE.md — codebase read directly: `src/backend/storeManagers/steam/`, `src/backend/storeManagers/index.ts`, `src/common/types/game_manager.ts`, `src/common/types/ipc.ts`, `src/common/types/electron_store.ts`
- [FailSpy/humble-steam-key-redeemer](https://github.com/FailSpy/humble-steam-key-redeemer) — `steam_app_id` field confirmed in Humble API; session-cookie auth flow
- [castanley/humble-steam-redeem](https://github.com/castanley/humble-steam-redeem) — Rate limit: ~50 successful / ~10 failed keys per hour; gift link preservation
- [AlexanderTheGrey/humble-bundle-redemption-issues](https://github.com/AlexanderTheGrey/humble-bundle-redemption-issues) — 400+ documented retroactive expiration issues
- [Dasmius007/HumbleKeysLibrary (Playnite)](https://github.com/Dasmius007/HumbleKeysLibrary) — State detection; binary model; active maintenance (last release March 2026)
- [Hayden Schiff — Reverse-engineering the Humble Bundle API (2017)](https://www.schiff.io/blog/2017/07/21/reverse-engineering-humble-bundle-api/) — `X-Requested-By: hb_android_app`; endpoint structure
- [smbl64/humble-cli README](https://github.com/smbl64/humble-cli) — `_simpleauth_sess` cookie-based auth still working (Rust, 2025-2026)
- [Electron session docs](https://www.electronjs.org/docs/latest/api/session) — `cookies.get()` API
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) — `isEncryptionAvailable()`, Linux `basic_text` fallback

### Secondary (MEDIUM confidence)
- [lutris/lutris issues #4099, #4448, #5958](https://github.com/lutris/lutris/issues/) — API access denial pattern; three separate incidents 2022-2025
- [Steam Community — `steam://open/activateproduct` reliability](https://steamcommunity.com/discussions/forum/1/4362375983952654017/) — confirmed does not pre-fill key
- [Steam Community — `registerkey?key=` activation](https://steamcommunity.com/discussions/forum/1/3729575905262032515/) — confirmed `?key=` parameter pre-fills field
- [ResetEra — Humble Bundle 3-year expiration policy](https://www.resetera.com/threads/humble-bundle-unused-not-revealed-game-codes-expire-after-3-yrs-now-humble-is-not-obligated-to-provide-keys-in-case-of-them-being-out-of-stock.1112754/) — TOS change December 2024
- [SteamGifts — Humble gift link discussion](https://www.steamgifts.com/discussion/sYPGI/humble-bundle-key-or-gift-link) — gift link mechanics confirmed
- [Steam activation rate limit](https://support.fanatical.com/hc/en-us/articles/202260751) — ~10 failed activations triggers lockout; "already owned" is a failure

### Tertiary (informational / rejected)
- `humblebundle` npm v1.0.5 (konsumer) — confirmed abandoned May 2016; no Humble Guard; do not use
- `saik0/humblebundle-python` — Python, wrong runtime; endpoint reference only; no Humble Guard in client.py
- `xtream1101/humblebundle-downloader` — archived March 2025; cookie-only auth; no claim flow

---
*Research completed: 2026-07-05*
*Ready for roadmap: yes*
