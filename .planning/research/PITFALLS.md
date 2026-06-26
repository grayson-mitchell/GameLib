# Domain Pitfalls: Steam Integration in a Third-Party Electron Launcher

**Domain:** Steam store manager in a public fork of Heroic Games Launcher
**Researched:** 2026-06-26
**Scope:** GamerLib — Electron + React + TypeScript, targeting Linux/macOS/Windows

---

## Critical Pitfalls

Mistakes that cause rewrites, legal exposure, or permanent user account damage.

---

### Pitfall 1: Using Steamworks SDK in a Publicly Distributed Launcher

**What goes wrong:** A developer assumes Steamworks SDK is a generic "talk to Steam" library and bundles it into GamerLib. The Steamworks SDK Access Agreement grants a "nonexclusive, royalty-free, terminable, **nontransferable** license" strictly for developers creating games or applications that ship through Steam. A standalone launcher distributed outside Steam has no path to legally sign this agreement. Additionally, the agreement prohibits reverse engineering, developing replacement functionality, and any implication of Valve partnership.

**Why it happens:** Steamworks.js and greenworks are both well-documented, which makes them appear to be the obvious integration path. They are not — they are designed for games calling Steam APIs from inside the game process, requiring `steam_appid.txt` in the working directory and an already-running Steam client. A launcher is not a game.

**Consequences:**
- Distributing the SDK violates the Access Agreement; Valve can terminate the license
- steamworks.js requires `steam_api.dll`/`steam_api64.dll` to ship alongside your binary — this is an SDK redistributable, not an open public library
- steamworks.js had a fatal incompatibility with Electron 21+ due to the V8 memory cage / sandbox (external ArrayBuffer backing stores are disallowed). GamerLib uses Electron ^41.1.1. Even if this specific issue was fixed in newer steamworks.js releases, the pattern of native module fragility against Electron's rapid release cadence is a structural liability

**Prevention:**
- Use `steam-user` (npm) + `node-steam-session` (npm) — both are part of the SteamRE project and implement the Steam client protocol at the application layer, with no SDK dependency
- For launching games, use the `steam://rungameid/<appid>` URI scheme — this delegates entirely to the installed Steam client
- Never bundle or ship any file from the Steamworks SDK redistributables

**Detection (warning signs):**
- `import SteamUser from 'steam-user'` is correct; `import Steamworks from 'steamworks.js'` is wrong for this use case
- Any reference to `steam_appid.txt` or `steam_api.dll` in build scripts is a red flag

**Phase:** Authentication phase (Phase 1). Establish the correct integration path before writing any auth code.

---

### Pitfall 2: Storing Passwords or Triggering Repeated 2FA Logins

**What goes wrong:** The app stores the user's Steam password (to re-authenticate on startup) or fails to persist a refresh token, causing repeated interactive logins. On each fresh login with 2FA enabled, a TOTP code is required. If the app submits a code that was already used (e.g., from the previous 30-second window) and does not check the `lastCodeWrong` event, it enters a login loop. Steam detects this and issues a temporary IP-level ban (error code 84: RateLimitExceeded), which blocks all Steam activity from that IP — including normal Steam client usage — for up to 24 hours.

Separately, the Steam Web API Terms of Use explicitly prohibit storing end-user passwords: *"You may not intercept or store the end user's Steam password on log in."*

**Why it happens:** Developers treat Steam like a username/password service and try to re-login with credentials on every app start. This is the wrong model.

**Consequences:**
- Temporary IP ban affecting the user's actual Steam client usage
- ToS violation for password storage
- Login loops generate flood traffic toward Steam's auth servers, risking more aggressive rate limiting

**Prevention:**
- Use `node-steam-session` to obtain a refresh token on first login; store only the refresh token
- Refresh tokens are JWTs valid for ~200 days; decode the `exp` field to know when to prompt re-authentication
- Use Electron's built-in `safeStorage` API (`safeStorage.encryptString` / `decryptString`) to store the token encrypted at rest — it uses OS keychain/credential store without requiring an additional native module like node-keytar
- On the `steamGuard` event with `lastCodeWrong === true`: wait the full 30 seconds before generating and submitting a new TOTP code; never immediately retry
- For machine authorization (new device/IP), present clear UI for the email confirmation step; do not attempt to automate this step

**Detection (warning signs):**
- `loginKey` or password appearing in app config files
- Login called on every app startup rather than session restore
- No handling of the `refreshToken` event from `steam-user`

**Phase:** Authentication phase (Phase 1). The token lifecycle strategy must be designed before any UI is built around it.

---

### Pitfall 3: Launching Steam Games by Executing the Binary Directly

**What goes wrong:** A developer implements "launch game" by finding the game's executable path in `steamapps/common/<game>/` and spawning the process directly. Most Steam games protected with SteamStub DRM (which covers the majority of commercial titles) verify that Steam is running and that the process was launched through Steam before initializing. Direct execution fails silently or with cryptic errors. DRM-free Steam games will launch, but cloud saves, achievements, and overlay will not function. This creates an inconsistent experience where some games work and others don't, confusing users.

**Why it happens:** Heroic's architecture for other stores (Legendary/Epic, GOG via gogdl, Nile/Amazon) involves spawning the game executable directly through Heroic's own process management. A developer following this same pattern for Steam will hit DRM failures.

**Consequences:**
- Games fail to launch for the majority of users (most commercial Steam games use DRM)
- Users blame GamerLib; reputation damage
- No overlay, achievements, or cloud saves even for games that do launch

**Prevention:**
- Launch Steam games exclusively via the `steam://rungameid/<appid>` URI scheme: `shell.openExternal('steam://rungameid/570')` in Electron
- This triggers the running Steam client to handle the launch, DRM check, overlay injection, and cloud save sync
- Accept the constraint: Steam client must be installed and running. Document this explicitly. Detect whether Steam is installed on startup and show an actionable prompt if not

**Detection (warning signs):**
- `spawn(steamapps/common/GameName/game.exe)` in the Steam game manager
- Copying the `games.ts` pattern from Heroic's `legendary/` or `gog/` manager verbatim without understanding the launch path difference

**Phase:** Launch implementation (likely Phase 3 or 4). The `games.ts` implementation must consciously deviate from Heroic's other store manager launch patterns.

---

## Moderate Pitfalls

Mistakes that cause significant user-facing bugs or require substantial rework.

---

### Pitfall 4: Adding 'steam' to the Runner Union Creates Merge Conflict Landmines

**What goes wrong:** The current `Runner` type in `src/common/types.ts` is `'legendary' | 'gog' | 'sideload' | 'nile' | 'zoom'`. Every file in the codebase that uses exhaustive `switch` statements or type guards on `Runner` will become a merge conflict when upstream Heroic adds new features. The `src/backend/storeManagers/index.ts` `libraryManagerMap` and all IPC handler registrations are the hottest zones.

When Heroic merges upstream, any change to these central type files will conflict with GamerLib's `'steam'` addition. If conflicts are resolved carelessly, the Steam runner can silently disappear from maps, causing undefined behavior at runtime rather than a compile error.

**Why it happens:** TypeScript's `satisfies` constraint on `libraryManagerMap` and the union type model mean any new member requires touching multiple central files. These same files are touched by upstream in nearly every Heroic release.

**Consequences:**
- Silent runtime failure when `libraryManagerMap['steam']` is `undefined` after a bad merge resolution
- Wasted time resolving the same conflict zones on every upstream sync

**Prevention:**
- Use TypeScript's exhaustive checking as a guard: after adding `'steam'` to the `Runner` union, run a build immediately and fix all compile errors — do not let unhandled switch cases accumulate
- Document all files that were modified to add the 'steam' runner (in a `FORK_CHANGES.md` or similar). This becomes the merge checklist
- Consider keeping GamerLib's fork on a separate branch that is periodically rebased on upstream rather than merged — rebasing surfaces conflicts more granularly than merge commits
- Add a CI check that fails if `libraryManagerMap` does not have a key for every `Runner` value

**Detection (warning signs):**
- `runner === 'steam'` returning undefined from `libraryManagerMap`
- After an upstream rebase, Steam games suddenly appearing as sideload entries or disappearing

**Phase:** Architecture/scaffolding phase (Phase 1). The Runner union extension should happen once with full audit, not incrementally.

---

### Pitfall 5: Steam Library Returns Empty for Private Profiles (Silent Failure)

**What goes wrong:** `IPlayerService/GetOwnedGames` via the Steam Web API returns `{"response":{}}` — an empty object with no error — for any profile where the game library visibility is set to "Friends Only" or "Private". This is the default for many Steam users. The launcher silently shows an empty library, and the user thinks GamerLib is broken.

**Why it happens:** Developers test with their own public Steam account and don't encounter the issue. The API returns HTTP 200 with an empty body, so error handling code doesn't trigger.

**Consequences:**
- Large proportion of real users see an empty library
- Support burden with no obvious diagnostic path

**Prevention:**
- When using `steam-user`, request the owned games via the authenticated Steam CM connection (not the public Web API) — the CM protocol returns the full library regardless of profile visibility setting
- If using Web API: explicitly detect the `{"response":{}}` pattern and surface a specific "Your Steam library is set to private" error with a link to the Steam privacy settings page
- Test with a Steam account that has its library set to private during development

**Detection (warning signs):**
- Library works in dev but users report empty library
- `response.games` is `undefined` rather than an array after a successful API call

**Phase:** Library implementation (Phase 2).

---

### Pitfall 6: Steam on Linux Requires the Steam Client — But This Isn't Obvious to Users

**What goes wrong:** On Linux, games launched via `steam://rungameid/` require a running Steam client, which in turn provides Proton and the Steam Linux Runtime. GamerLib already detects Proton paths at `~/.local/share/Steam/steamapps/common` (existing code in `compatibility_layers.ts`). A user on a fresh Linux system who installs GamerLib expecting it to replace Steam will not have Steam installed and will get cryptic failures when trying to launch games.

Additionally, the Steam Linux Runtime container system (Scout/Soldier/Sniper) is managed entirely by the Steam client. There is no supported way to use it independently. Proton can be obtained and invoked via `umu-launcher` outside of Steam for non-Steam games, but Steam-DRM games still require Steam running.

**Consequences:**
- Poor first-run experience for users who install GamerLib expecting to avoid installing Steam
- Silent failure if `steam://` URI handler is not registered (Steam not installed)

**Prevention:**
- Detect Steam installation on startup across all three platforms:
  - Linux: check for `~/.local/share/Steam/steam.sh` or `flatpak list` for Steam Flatpak
  - macOS: check `/Applications/Steam.app`
  - Windows: check registry `HKCU\Software\Valve\Steam` or `C:\Program Files (x86)\Steam\steam.exe`
- If Steam is not installed, show a prominent onboarding message: "Steam integration requires the Steam client to be installed" with a download link
- Document the constraint prominently in GamerLib's README and onboarding screens

**Detection (warning signs):**
- `shell.openExternal('steam://...')` silently does nothing (URI handler not registered)
- Steam game shows as "installed" but fails to launch

**Phase:** Authentication/onboarding (Phase 1). The detection logic should be in place before any Steam features are enabled.

---

### Pitfall 7: macOS Notarization Fails Due to Native Module Signing

**What goes wrong:** GamerLib distributes on macOS. Any native Node module (`.node` binary) must be individually code-signed with Hardened Runtime enabled and the `com.apple.security.cs.allow-unsigned-executable-memory` entitlement. If a native dependency is added (e.g., for credential storage or Steam protocol parsing), it must be explicitly included in the signing configuration. The Electron builder's default configuration often misses `.node` files from native dependencies added during development.

**Consequences:**
- macOS notarization failure blocks distribution
- If an unsigned `.node` binary ships, Gatekeeper blocks launch for end users on macOS 10.15+

**Prevention:**
- Prefer Electron's built-in `safeStorage` API over node-keytar for credential storage — it's already distributed as part of Electron and requires no additional signing
- Audit all native dependencies before the first macOS release; add explicit signing rules in `electron-builder.yml`
- Test notarization in CI before shipping, not just before release

**Detection (warning signs):**
- `xcrun stapler validate` fails on the `.app` bundle
- "App is damaged and can't be opened" errors in user reports

**Phase:** Distribution/packaging phase. Revisit any time a new native module is introduced.

---

## Minor Pitfalls

Annoyances or edge cases that cause confusion but are straightforward to fix.

---

### Pitfall 8: Refresh Token Expiry Causes Silent Logout After ~200 Days

**What goes wrong:** Refresh tokens expire after approximately 200 days. Without proactive expiry checking, users will be silently logged out after their first six months of use. The `steam-user` connection will fail and the error surface is not obvious.

**Prevention:** Decode the refresh token JWT on load; compare `exp` (Unix timestamp) against `Date.now()`. If within 30 days of expiry, prompt a re-authentication flow during a non-disruptive moment (e.g., app startup, not mid-launch). The steam-user `refreshToken` event emits a new token — persist it on each emission.

**Phase:** Authentication (Phase 1). Implement token expiry awareness from the start.

---

### Pitfall 9: Steam Web API Key Exhaustion in Multi-User Public Distribution

**What goes wrong:** The Steam Web API is capped at 100,000 calls/day per API key. A single hardcoded key in a public launcher exhausts this limit quickly at scale. Some per-endpoint limits are tighter and trigger HTTP 429 before the daily cap is reached.

**Prevention:** Each user authenticates with their own Steam account. Use the authenticated CM connection (via `steam-user`) for user-specific calls like owned games, rather than the public Web API. When Web API is needed (e.g., game metadata, cover art via SteamGrid which Heroic already uses), cache responses aggressively. Do not make Web API calls on every app startup; use a time-based cache invalidation strategy.

**Phase:** Library implementation (Phase 2).

---

### Pitfall 10: Steam Web API Terms Prohibit Affiliation Implication

**What goes wrong:** The Steam Web API Terms of Use state apps must not "present...so that it appears that your Application is endorsed or affiliated with Valve or Steam." Using Steam logos, the Steam wordmark, or Steam-branded UI patterns in ways that imply partnership violates these terms.

**Prevention:** Use Steam-related branding only in ways clearly consistent with "powered by Steam" / "requires Steam" attribution, not partnership. Do not use Valve's trademarks in GamerLib's app name, promotional materials, or UI chrome in a way that implies affiliation.

**Phase:** Design/branding (any UI phase).

---

### Pitfall 11: installscript.vdf Not Processed Breaks Some Games

**What goes wrong:** If GamerLib ever attempts to manage Steam game installation independently (rather than delegating to the Steam client), many games ship `installscript.vdf` files that run VC++ redistributable installers, DirectX setup, and registry key creation. These scripts are executed by the Steam client as part of first-run setup. Skipping them causes games that require specific runtime versions to fail to launch.

**Prevention:** Delegate all game installation to the Steam client via `steam://install/<appid>`. Do not attempt to replicate Steam's installer logic. This is consistent with the launch strategy (delegate via URI) and avoids a large surface area of edge cases.

**Phase:** Install implementation. Recognize the boundary: GamerLib shows what's installed and triggers installs, but never manages Steam's install pipeline directly.

---

## Phase-Specific Warning Summary

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Auth: choosing integration library | Steamworks SDK vs steam-user confusion | Use steam-user + node-steam-session; never Steamworks SDK |
| Auth: 2FA/SteamGuard flow | Login loop → IP ban | Persist refresh token; handle `lastCodeWrong`; use `safeStorage` |
| Auth: token storage | Password stored in plaintext | `safeStorage.encryptString` only; never store raw password |
| Auth: new machine flow | Email auth step automated | Show explicit UI for email confirmation; do not attempt automation |
| Fork scaffolding: Runner type | Merge conflicts at every upstream sync | Add 'steam' once with full audit; document all touched files |
| Library: GetOwnedGames | Empty response for private profiles | Use CM connection for auth'd user; detect and surface privacy error |
| Library: Web API rate limits | 429 errors at scale | Per-user auth, aggressive caching, no polling on startup |
| Launch: game execution | Direct binary spawn breaks DRM | Always use `steam://rungameid/<appid>` URI |
| Linux: Steam client dependency | Silent failure if Steam not installed | Detect Steam on startup; actionable prompt if missing |
| macOS: distribution | Notarization fails for native modules | Prefer `safeStorage` over keytar; explicit signing config |
| Branding | Implied Valve/Steam affiliation | No partnership implication in UI or marketing |

---

## Sources

- [Valve Corporation Steamworks SDK Access Agreement](https://partner.steamgames.com/documentation/sdk_access_agreement/) — Nontransferable license, prohibition on reverse engineering and redistribution
- [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms) — No password storage, no affiliation implication, 100K/day limit
- [DoctorMcKay/node-steam-user — GitHub](https://github.com/DoctorMcKay/node-steam-user) — `lastCodeWrong`, refresh token lifecycle, machine auth
- [DoctorMcKay/node-steam-session — GitHub](https://github.com/DoctorMcKay/node-steam-session) — Refresh token generation and ~200-day validity
- [ceifa/steamworks.js — Incompatibility with Electron 21](https://github.com/ceifa/steamworks.js/issues/51) — V8 memory cage issue with native modules
- [Electron and the V8 Memory Cage](https://www.electronjs.org/blog/v8-memory-cage) — Root cause of native module incompatibilities in Electron 21+
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) — Recommended encrypted credential storage
- [Steam Rate Limits — McKay Development Forum](https://dev.doctormckay.com/topic/973-steam-rate-limits/) — IP-level rate limit enforcement
- [IPlayerService/GetOwnedGames Privacy Behavior — Steam Community](https://steamcommunity.com/discussions/forum/1/1729827777339922602/) — Empty response for private libraries
- [Steam DRM — PCGamingWiki](https://www.pcgamingwiki.com/wiki/User:Cyanic/Steam_DRM) — SteamStub DRM requires Steam client running
- [Creating and using InstallScripts — Steamworks Documentation](https://partner.steamgames.com/doc/sdk/installscripts) — installscript.vdf and redistributable management
- [Electron Notarization — macOS Hardened Runtime](https://github.com/electron-userland/electron-builder/issues/4040) — Signing requirements for native modules
- [Heroic storeManagers refactor — PR #2578](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/pull/2578) — Module-level functional pattern for store managers
