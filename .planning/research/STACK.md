# Technology Stack: Humble Bundle Integration (v0.3)

**Project:** GameLib — Humble Bundle store manager
**Researched:** 2026-07-05
**Overall confidence:** HIGH for auth/adapter approach; MEDIUM for API stability (undocumented API is an ongoing fragility risk)

---

## Decision Summary

**Zero new runtime packages are needed.** The Humble Bundle adapter is built entirely on
libraries already in the repo: `axios` for HTTP, `electron-store` + `safeStorage` for
encrypted persistence, and Electron's built-in `BrowserWindow` + `session.cookies` API
for auth.

The critical constraint driving this decision: **Humble Bundle's `/processlogin` endpoint
requires a solved reCAPTCHA**, making direct programmatic email/password login impossible
in a desktop app. The only viable, user-friendly auth path is to open Electron's
`BrowserWindow`, let the user log in via Humble's own web form (where CAPTCHA and Humble
Guard email codes appear naturally), then extract the `_simpleauth_sess` session cookie
from `webContents.session.cookies` after login completes.

This is a deliberate divergence from the Steam auth pattern (`steam-session` flows). For
Steam, a client protocol exists that avoids the browser entirely. For Humble Bundle, no
such protocol exists — the browser path is the only clean option.

---

## Community Wrapper Audit

### Node.js wrappers

| Package | npm version | Last published | Verdict |
|---------|------------|----------------|---------|
| `humblebundle` (konsumer) | 1.0.5 | **2016-05-14** | ABANDONED — 9 years stale; no Humble Guard support; do not use |

No other Node.js package wrapping the Humble Bundle API has been published to npm. The
konsumer package predates Humble Guard, predates the `_simpleauth_sess`-expiry behavior,
and has no cookie-jar or session management. Using it would require a full rewrite of its
auth layer anyway, providing no value over writing the adapter from scratch.

### Python wrappers (informational only — wrong language)

| Project | Last release | Status | Notes |
|---------|-------------|--------|-------|
| `saik0/humblebundle-python` | May 2024 (PyPI) | Unmaintained | Supports Authy TOTP only; no Humble Guard email code in client.py; CAPTCHA still unsolved |
| `xtream1101/humblebundle-downloader` | 0.4.3 Aug 2024 | **Archived March 2025** | Cookie-import only; no programmatic login |
| `MestreLion/humblebundle` | Unknown | Unclear | Python; cookie-based |

Python libraries are not importable into Electron. They are referenced here only as
evidence that the API endpoints and cookie approach are correct.

**Conclusion on wrappers:** Build a from-scratch TypeScript adapter. The adapter is small
(auth + 2 endpoints) and the isolation requirement (spec constraint C5) means the adapter
boundary would be needed even if a wrapper existed.

---

## Recommended Stack

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Electron `BrowserWindow` | built-in (Electron 41.1.1) | Display Humble login UI | Only viable auth path — reCAPTCHA blocks all programmatic login. Opens `https://www.humblebundle.com/login`; user solves CAPTCHA and Humble Guard email code in the web form naturally. |
| Electron `session.cookies` | built-in (Electron 41.1.1) | Extract `_simpleauth_sess` after login | `webContents.session.cookies.get({ url: 'https://www.humblebundle.com', name: '_simpleauth_sess' })` returns the session cookie once user completes login. |
| `electron-store` | 8.2.0 (already present) | Persist encrypted session cookie | Follow existing `configStore` pattern. Serialize the `_simpleauth_sess` cookie value via `safeStorage.encryptString()` before writing. |
| Electron `safeStorage` | built-in (Electron 41.1.1) | Encrypt cookie at rest | Existing pattern from Steam auth. The `_simpleauth_sess` value is PII; treat it with the same care as the Steam refresh token. |

**Auth flow:**

```
User clicks "Connect Humble Bundle" in Manage Accounts
  → IPC call to main process: humbleUser.startLogin()
  → Open BrowserWindow loading https://www.humblebundle.com/login
  → User enters email + password in Humble's own web form
  → If Humble Guard triggered: user enters emailed code in the form (no app-side handling)
  → If reCAPTCHA: user solves it in the form (no app-side handling)
  → On login success, Humble sets _simpleauth_sess cookie in the BrowserWindow session
  → Listen for 'did-navigate' or 'will-redirect' to detect login completion
  → webContents.session.cookies.get({ url: 'https://www.humblebundle.com', name: '_simpleauth_sess' })
  → Encrypt and store in electron-store via safeStorage
  → Close BrowserWindow, notify renderer of auth success
```

**Session expiry:** `_simpleauth_sess` expires in approximately 2 days. Detect 401
responses from the order API and trigger re-auth (reopen the BrowserWindow). Show an
"Humble session expired — reconnect" banner rather than a hard error.

**Humble Guard handling:** No app-side implementation required. The user handles the
emailed one-time code directly in the BrowserWindow web form. This is an intentional
simplification: any programmatic interception of Humble Guard would require scraping the
Humble web response to detect the guard prompt, which is fragile. Let the browser do it.

---

### HTTP Adapter (Library Data)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `axios` | 1.13.5 (already present) | Order list + order detail API calls | Already in repo. Cookie passed as a `Cookie` request header (see below). No cookie jar library needed. |

**Humble Bundle API endpoints (undocumented, verified working as of community tools in 2025):**

```
GET https://www.humblebundle.com/api/v1/user/order
  → returns: string[] of gamekeys

GET https://www.humblebundle.com/api/v1/order/{gamekey}
  → returns: full order object including tpkd_dict.all_tpks[]
```

**Required request headers for every API call:**

```typescript
{
  'Cookie': `_simpleauth_sess=${storedCookieValue}`,
  'X-Requested-By': 'hb_android_app',      // required — API returns errors without this
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; GameLib)'  // avoid default axios UA
}
```

The `X-Requested-By: hb_android_app` header is mandatory. The API was reverse-engineered
from the Humble Bundle Android app and rejects calls that omit this header. The Lutris
and GameHub integration failures in 2024-2025 are likely caused by missing this header
(their implementations used Python `requests` without it), not by a blanket IP or
credential block — `humble-cli` (Rust, actively maintained 2025-2026) continues to work
using the cookie-based approach.

---

### Persistence (Library Cache + Revealed Flag + Audit Log)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `electron-store` | 8.2.0 (already present) | Cache order list, per-key state, audit log | Already in repo. Create a new `humbleStore` instance in `src/backend/storeManagers/humble/electronStores.ts`, following the Steam pattern. |

**What to store:**

```
humbleStore:
  auth:
    sessionCookieEncrypted: string      // safeStorage-encrypted _simpleauth_sess
    lastAuthAt: string                  // ISO timestamp for expiry detection

  library:
    cachedAt: string                    // ISO timestamp of last successful sync
    gamekeys: string[]                  // order ID list
    orders: Record<string, OrderData>   // gamekey → full order response

  keyState:
    revealed: Record<string, number>    // humbleKey (title+gamekey) → revealed_at epoch ms
    redeemed: Record<string, number>    // humbleKey → redeemed_at epoch ms

  auditLog: AuditEntry[]               // [{action, keyId, title, at, outcome}]
```

The `revealed` map is the critical local state — Humble's API does not distinguish a
revealed-but-unactivated key from an unrevealed one; only the local flag does.

---

### Steam Ownership Cross-Reference

**No new stack needed.** The existing `SteamLibraryManager` (v0.1) already exposes the
Steam owned-game set. The Humble adapter calls into it directly:

```typescript
import { libraryManagerMap } from 'backend/storeManagers'
const steamGames = libraryManagerMap['steam'].getLibrary()
// match by Steam AppID where key_type === 'steam'
```

AppID matching: `tpkd_dict.all_tpks[n].steam_app_id` is present on Steam-type keys (confirmed
in saik0/humblebundle-python source). Fall back to fuzzy title match (implement in adapter)
for keys where AppID is absent. Mark fuzzy matches with a `matchConfidence` flag so the UI
can surface low-confidence dedup.

---

## Installation

```bash
# No new runtime dependencies required.
# No new dev dependencies required.
#
# All needed packages are already present:
#   axios ^1.13.5
#   electron-store ^8.2.0
#   (Electron built-ins: BrowserWindow, session, safeStorage, shell)
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `humblebundle` npm (v1.0.5) | Published May 2016. No Humble Guard, no cookie jar, no TypeScript. Using it would require rewriting its entire auth layer — provides zero value over writing the adapter from scratch. | From-scratch TypeScript adapter (see above) |
| `axios-cookiejar-support` + `tough-cookie` | Not needed. The cookie is a single string value persisted in electron-store. Setting `Cookie: _simpleauth_sess=<value>` in axios headers is sufficient. A full cookie jar is over-engineering for one cookie. | Manual `Cookie` header in axios config |
| Any Python Humble library | Wrong runtime. Electron executes Node.js. | From-scratch TypeScript adapter |
| `electron-dl` or any download manager | v0.3 is key-management only — no DRM-free download support. Installing a download library now would create scope creep pressure. | Out of scope (future milestone) |
| `puppeteer` / `playwright` | No need to drive a browser headlessly — Electron BrowserWindow is a first-class auth surface available in-process. Puppeteer adds 300+ MB to the install size. | Electron `BrowserWindow` built-in |
| Any native module / node-gyp dep | Hard project constraint: must stay mergeable with Heroic upstream. Native modules break on Electron rebuild. | Pure-JS approach confirmed above |
| `steamworks.js` / `greenworks` | Rejected in v0.1 research — AppId required, game-developer SDK not a launcher SDK | Already rejected — steam-user is the correct approach |

---

## Architecture Fit

The Humble store manager follows the existing pattern in `src/backend/storeManagers/`:

```
src/backend/storeManagers/humble/
  user.ts           ← HumbleUser class (login, logout, session refresh)
  library.ts        ← HumbleLibraryManager (sync, classify, dedup)
  adapter.ts        ← HumbleApiAdapter (raw HTTP → typed responses; single isolation point per C5)
  keyStore.ts       ← local key state (revealed flag, audit log)
  electronStores.ts ← electron-store instance
  constants.ts      ← log prefix, store keys, API base URL, required headers
  types.ts          ← local TypeScript interfaces for Humble API response shapes
```

`BrowserWindow` for auth opens in the main process. The renderer sends an IPC request to
start auth; the main process manages the window and emits auth-success/failure events back
via IPC. This mirrors how Epic/GOG auth windows are managed in Heroic.

The `adapter.ts` file is the C5 isolation boundary. Every Humble API call goes through it.
If Humble changes an endpoint, field name, or authentication mechanism, only `adapter.ts`
changes — nothing else in the launcher touches the raw Humble HTTP layer.

The `libraryManagerMap` in `src/backend/storeManagers/index.ts` gains a `humble` key. The
`Runner` type in `common/types` gets `'humble'` added to its union. However: because Humble
is primarily a key-management feature (not a game-launching platform), the `LibraryManager`
interface implementation is partial — only `getLibrary()` and `getGame()` need real
implementations; install/launch/uninstall delegate to the underlying platform (Steam, Epic,
etc.) via `shell.openExternal()` deep-links.

---

## Open Risks

### Risk 1: API access restrictions (HIGH PRIORITY — validate in Phase 1)

Humble Bundle actively restricts API access from third-party software. Two confirmed
incidents:
- **Issue #4099** (lutris/lutris, ~2022): `/api/v1/user/order` denied
- **Issue #5958** (lutris/lutris, March 2025): same endpoint, same denial; manual
  cookie import also failed

**However:** `humble-cli` (Rust, smbl64) continues to work as of 2025-2026 using the
`_simpleauth_sess` cookie. The difference is likely the `X-Requested-By: hb_android_app`
header, which Lutris's implementation omits. GameLib's adapter will include this header.

**Mitigation:** Implement the adapter with all required headers. Validate against a live
Humble account in the first implementation phase — before building any UI. If access is
still denied, consider intercepting the BrowserWindow's own network requests (the webview
*is* a browser session, so its cookies will be accepted by Humble) via `webRequest.onBeforeRequest`
to proxy the API calls through the BrowserWindow session instead of axios.

### Risk 2: `_simpleauth_sess` expires in ~2 days (MEDIUM)

Short session lifetime means users will need to re-authenticate frequently. Design the
re-auth flow as a non-destructive overlay (banner + one-click reopen of the BrowserWindow)
so it does not disrupt library browsing while the session is stale.

### Risk 3: Humble Guard flow unknown at app level (LOW — mitigated by BrowserWindow approach)

Using the BrowserWindow for auth means Humble Guard is handled by the web form. No
app-side implementation of the email-code flow is required, and no future change to the
Humble Guard mechanism will break the integration.

### Risk 4: `steam_app_id` field may be absent on some Steam keys (LOW)

Fuzzy name matching needed as fallback. Flag low-confidence matches to avoid false dedup.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| BrowserWindow auth approach | HIGH | Standard Electron pattern; solves CAPTCHA/Humble Guard by design; used by GOG/Epic in Heroic |
| `_simpleauth_sess` cookie extraction | HIGH | Electron `session.cookies.get()` API is documented and stable |
| Cookie persistence via safeStorage | HIGH | Same pattern used for Steam refresh token in v0.1 |
| Order list endpoint | MEDIUM | Undocumented endpoint, confirmed working in multiple community tools; known to have been blocked in Lutris (likely header-based) |
| Order detail endpoint | MEDIUM | Same as above |
| `X-Requested-By` header effectiveness | MEDIUM | Required per 2017 reverse-engineering; humble-cli still works; Lutris failures correlate with omitting it |
| Zero new packages needed | HIGH | All required primitives confirmed present in repo; no gap identified |
| `steam_app_id` availability | MEDIUM | Present in saik0 code; not independently verified against live API response |

---

## Sources

- npm registry: [`humblebundle`](https://www.npmjs.com/package/humblebundle) — confirmed v1.0.5, published 2016-05-14
- npm registry: [`axios-cookiejar-support`](https://www.npmjs.com/package/axios-cookiejar-support) — v7.0.0, published May 6, 2026 (evaluated and rejected as unnecessary)
- npm registry: [`tough-cookie`](https://www.npmjs.com/package/tough-cookie) — v6.0.1, published March 12, 2026 (evaluated and rejected as unnecessary)
- [konsumer/humblebundle GitHub](https://github.com/konsumer/humblebundle) — confirmed minimal, 8 commits, no Humble Guard support
- [saik0/humblebundle-python GitHub](https://github.com/saik0/humblebundle-python) — Python; endpoint reference; no email-guard handling in client.py
- [xtream1101/humblebundle-downloader](https://github.com/xtream1101/humblebundle-downloader) — archived March 15, 2025; cookie-only auth
- [FailSpy/humble-steam-key-redeemer](https://github.com/FailSpy/humble-steam-key-redeemer) — Humble Guard email code via `guard` POST param; `/processlogin` endpoint; Python
- [Hayden Schiff — Reverse-engineering the Humble Bundle API (2017)](https://www.schiff.io/blog/2017/07/21/reverse-engineering-humble-bundle-api/) — `X-Requested-By: hb_android_app` header; endpoint list
- [lutris/lutris issue #4099](https://github.com/lutris/lutris/issues/4099) — `/api/v1/user/order` access denied
- [lutris/lutris issue #5958](https://github.com/lutris/lutris/issues/5958) — same denial, March 2025; confirmed ongoing fragility
- [smbl64/humble-cli README](https://github.com/smbl64/humble-cli) — `_simpleauth_sess` cookie-based auth still working (Rust, 2025-2026)
- [Electron session docs](https://www.electronjs.org/docs/latest/api/session) — `cookies.get()` API for post-login cookie capture
- [saik0/humblebundle-python issue #15](https://github.com/saik0/humblebundle-python/issues/15) — CAPTCHA requirement confirmed; no programmatic workaround

---
*Stack research for: Humble Bundle integration (v0.3 milestone)*
*Researched: 2026-07-05*
