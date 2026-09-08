<!-- GSD:project-start source:PROJECT.md -->

## Project

**GameLib**

GameLib is a public fork of Heroic Games Launcher that adds Steam as a first-class supported platform. Where Heroic covers Epic Games, GOG, and Amazon Games, GameLib extends this with full Steam library integration — browse, install, and launch Steam games from the same interface. It targets gamers who want a single unified launcher instead of switching between clients.

**Core Value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

### Constraints

- **Tech stack**: React + TypeScript on a Rust/Tauri shell. GameLib is an independent project, not a fork tracking Heroic — upstream mergeability is not a constraint. Do not raise deviation from upstream Heroic as a concern or caveat.
- **Compatibility**: Linux, macOS, Windows (same as Heroic)
- **Steam auth**: Approach TBD during research phase — Steamworks SDK, steam-user npm package, or browser-based login
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Decision Summary

## Recommended Stack

### Authentication

| Technology        | Version | Purpose                               | Why                                                                                                                                                                                                |
| ----------------- | ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| steam-session     | 1.9.4   | Obtain Steam refresh token            | Handles all auth flows: credentials+SteamGuard, QR-code via mobile app, TOTP. Pure JS (no native modules). Last published July 2025 by DoctorMcKay. steam-user already depends on it transitively. |
| steam-user        | 5.3.0   | Connect to Steam CM network           | Core library protocol client. Authenticates with refresh token, exposes `ownershipCached` + `getOwnedApps()`. Pure JS (all deps are JS or WASM — no node-gyp). Last published December 2025.       |
| electron-store    | 8.2.0   | Persist refresh token                 | Already in project. Follow existing `configStore` pattern from gog/user.ts. Store token encrypted via Electron `safeStorage`.                                                                      |
| @types/steam-user | 5.1.1   | TypeScript definitions for steam-user | DefinitelyTyped, last published December 2025. Covers steam-user v5.x API.                                                                                                                         |

### Library Data

| Technology      | Version | Purpose                        | Why                                                                                                                                                                                                     |
| --------------- | ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| steam-user      | 5.3.0   | Fetch owned game list          | After `ownershipCached` event fires, call `getOwnedApps()` → returns `number[]` of AppIDs. Works for private profiles because we are authenticated as the user.                                         |
| @node-steam/vdf | 2.2.0   | Read local Steam installation  | Already in project. Parse `libraryfolders.vdf` to find all Steam library paths. Parse `appmanifest_{appId}.acf` files to determine install status, install path, and install size. No network required. |
| axios           | 1.13.5  | Steam store metadata + artwork | Already in project. `https://store.steampowered.com/api/appdetails?appids={id}` (public, no auth) for game description, tags, genres. CDN artwork (`header.jpg`, `capsule_616x353.jpg`) is public.      |

### Game Launching

| Technology                      | Version                    | Purpose            | Why                                                                                                                                                                                         |
| ------------------------------- | -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron `shell.openExternal()` | built-in (Electron 41.1.1) | Launch Steam games | `steam://rungameid/{appId}` works on Windows, macOS, Linux. Honors per-game launch options set in Steam. Requires Steam client installed — a valid assumption for this launcher's audience. |

### Supporting Libraries (no new installs required)

| Library               | Already Present | Role in Steam Manager                                       |
| --------------------- | --------------- | ----------------------------------------------------------- |
| @node-steam/vdf       | Yes (^2.2.0)    | Parse Steam VDF config files (library paths, app manifests) |
| electron-store        | Yes (^8.2.0)    | Persist refresh token, cache library data                   |
| axios                 | Yes (^1.13.5)   | Game metadata from Steam store API, artwork URLs            |
| steam-shortcut-editor | Yes (^3.1.3)    | Exists for "add to Steam" — not used in store manager       |

## Installation

# Runtime dependency

# Type definitions (devDependency)

## Alternatives Rejected

| Option                                                         | Verdict               | Reason                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| steamworks.js v0.4.0                                           | DO NOT USE            | Requires `steamworks.init(AppId)` — your app must be a game published on Steam with a Valve-assigned AppId. This is an SDK for game developers, not for launchers. Also a native Rust/NAPI module requiring Electron rebuild. Last published August 2024.                                                       |
| greenworks v0.1.0                                              | DO NOT USE            | Abandoned. Last npm publish June 2022. Requires you to download the Steamworks SDK binary separately and place it in the project. Same AppId restriction as steamworks.js. This repo is archived.                                                                                                               |
| electron-steam-openid v1.2.0                                   | DO NOT USE            | Last published June 2022, unmaintained. Steam OpenID only yields a SteamID64 — it does not give you any credentials usable for library access. You'd still need a Steam Web API key, and that only works for public profiles.                                                                                   |
| Steam OAuth (partner.steamgames.com/doc/webapi_overview/oauth) | DO NOT USE            | Requires contacting Valve to obtain a Client ID. Scoped to specific AppIds. Intended for games/apps published through Valve, not third-party launchers.                                                                                                                                                         |
| Steam Web API alone (IPlayerService/GetOwnedGames)             | DO NOT USE as primary | Fails silently for private Steam profiles unless the API key is linked to the same SteamID being queried. Would require every user to register an API key at steamcommunity.com/dev/apikey, adding friction. Valid as a fallback for users who prefer it (Playnite model), but steam-user is better as primary. |
| Browser-based Steam login (follow GOG/Epic pattern)            | SKIP                  | Steam's OpenID only returns SteamID64, not a session token usable for library API calls. Heroic's GOG/Epic patterns use OAuth tokens from the browser; Steam OpenID does not provide this. steam-session's QR/credential flow is cleaner and more powerful.                                                     |

## Architecture Fit

## Confidence Assessment

| Area                             | Confidence | Basis                                                                                                                                                       |
| -------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| steam-user as core library       | HIGH       | npm-verified v5.3.0 (Dec 2025), active maintenance (DoctorMcKay), Node >=14, no native modules confirmed by reviewing full dep tree                         |
| steam-session for auth           | HIGH       | npm-verified v1.9.4 (July 2025), QR/credentials/SteamGuard flows confirmed in GitHub README                                                                 |
| `getOwnedApps()` API             | MEDIUM     | Method exists and is documented, but PICS cache population time for large libraries is a known open issue (#144 on GitHub) — needs timeout/caching strategy |
| steam:// protocol for launching  | HIGH       | Valve-documented browser protocol, widely used by existing launchers, cross-platform                                                                        |
| @node-steam/vdf for local data   | HIGH       | Already in project and working for existing features                                                                                                        |
| steamworks.js rejection          | HIGH       | Verified from their own README: `steamworks.init(480)` takes an AppId; not usable without Steam store listing                                               |
| Steam Web API privacy limitation | HIGH       | Confirmed by multiple sources including Playnite docs and Steam community discussions                                                                       |

## Sources

- npm registry: [steam-user](https://www.npmjs.com/package/steam-user), [steam-session](https://www.npmjs.com/package/steam-session), [steamworks.js](https://www.npmjs.com/package/steamworks.js), [@types/steam-user](https://www.npmjs.com/package/@types/steam-user)
- [node-steam-user GitHub README](https://github.com/DoctorMcKay/node-steam-user)
- [node-steam-session GitHub README](https://github.com/DoctorMcKay/node-steam-session)
- [steamworks.js GitHub README](https://github.com/ceifa/steamworks.js) — confirmed AppId requirement
- [Steam Web API privacy documentation](https://developer.valvesoftware.com/wiki/Steam_Web_API)
- [Steam OAuth documentation](https://partner.steamgames.com/doc/webapi_overview/oauth) — confirmed partner-only
- [IPlayerService/GetOwnedGames](https://partner.steamgames.com/doc/webapi/iplayerservice)
- [Playnite Steam integration source](https://github.com/JosefNemec/Playnite) — reference for two-path approach (browser login vs API key)
- [Steam browser protocol (Valve DevWiki)](https://developer.valvesoftware.com/wiki/Steam_browser_protocol)
- [node-steam-user issue #144: getOwnedApps() performance](https://github.com/DoctorMcKay/node-steam-user/issues/144)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

### Todo triage frontmatter (enforced by CI)

**Every file you create in `.planning/todos/pending/` must carry all three of these keys.** The
`/gsd-add-todo` workflow's frontmatter template does **not** emit them — it stops at
`created`/`title`/`area`/`files` — so you have to add them by hand. Omitting them turns CI red.

```yaml
severity: medium # critical | major | medium | minor
platform: any # macos | windows | linux | any    (default: any)
ready: code # code | live-gate | human | blocked
```

Place `platform:` immediately after `severity:`, and `ready:` immediately after `platform:`.

Values are matched **bare, lowercase and exact**: `severity: minor`, never `severity: "minor"`,
never `severity: Minor`, never `severity: low`.

| key        | value       | means                                                              |
| ---------- | ----------- | ------------------------------------------------------------------ |
| `severity` | `critical`  | data loss, corruption, or a shipped claim that is false            |
|            | `major`     | a feature is broken or a measurement is silently contaminated      |
|            | `medium`    | real defect, bounded blast radius, workaround exists               |
|            | `minor`     | polish, rough edge, or a latent trap with no live consequence      |
| `platform` | `any`       | reproducible and fixable on any machine (**the default** — use it) |
|            | `macos`     | needs the operator's Mac specifically                              |
|            | `windows`   | needs the operator's Windows machine (not their primary OS)        |
|            | `linux`     | needs a Linux machine                                              |
| `ready`    | `code`      | desk-ready: edit and typecheck, no live gate and no other OS       |
|            | `live-gate` | needs a live app run on this Mac to verify                         |
|            | `human`     | needs a decision, credentials or a person — not code               |
|            | `blocked`   | parked, externally blocked, or gated on hardware not to hand       |

`ready:` is the one that earns its keep: `grep -l 'ready: code' .planning/todos/pending/*.md`
answers "what can I actually pick up right now?" without opening a single file.

`pnpm planning-gates` enforces this in CI via `.planning/todos/todo-frontmatter-gate.py`. When it
fails, **fix the todo's frontmatter** — add the missing key, or pick the vocabulary value that
fits. Never widen the vocabulary in the gate to admit the value that failed; a vocabulary that
grows to fit whatever was typed is free text with extra steps, which is the exact condition the
gate exists to end. Scope is `pending/` only — `completed/` is deliberately exempt.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

- **Spike findings for GameLib** (implementation patterns, constraints, gotchas for Steam native install + macOS native Steam bridge + the Rust/Tauri rearchitecture and its login-webview/cookie surface + login-window UX on macOS: modal attachment, Keychain autofill channels, and the local OAuth test store) → `Skill("spike-findings-gamelib")`
- **Sketch findings for GameLib** (validated design decisions, CSS patterns, visual direction: app-level card/folder tabs replacing the sidebar, the two-tier nav structure, the 78px macOS traffic-light inset, multi-theme survival rules, and the Games library filter panel) → `Skill("sketch-findings-gamelib")`
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.

<!-- GSD:profile-end -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
