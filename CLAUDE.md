**These `<!-- GSD:*-start source:... -->` regions are hand-maintained.** The `source:` marker is
historical provenance, not live generation. No tool reads or rewrites these regions today —
`gsd-sdk` contains no reference to the markers and `get-shit-done-cc` is not installed — and the
conventions below were hand-written straight into this file (`c33f98771`, `d7d021a05`,
`67ed8767b`). Edit the regions here, directly; content written into a named source file will not
propagate. A region marked `source:hand-maintained` has no source document at all.

<!-- GSD:project-start source:.planning/PROJECT.md -->

## Project

**GameLib**

GameLib is a public fork of Heroic Games Launcher that adds Steam as a first-class supported platform. Where Heroic covers Epic Games, GOG, and Amazon Games, GameLib extends this with full Steam library integration — browse, install, and launch Steam games from the same interface. It targets gamers who want a single unified launcher instead of switching between clients.

**Core Value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

### Constraints

- **Tech stack**: React + TypeScript on a Rust/Tauri shell. GameLib is an independent project, not a fork tracking Heroic — upstream mergeability is not a constraint. Do not raise deviation from upstream Heroic as a concern or caveat.
- **Compatibility**: Linux, macOS, Windows (same as Heroic)
- **Steam auth**: Approach TBD during research phase — Steamworks SDK, steam-user npm package, or browser-based login
<!-- GSD:project-end -->

<!-- GSD:stack-start source:.planning/research/STACK.md -->

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

<!-- GSD:conventions-start source:hand-maintained -->

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

### Fake-HOME isolation for direct binary runs (two-profile rule)

**The rule is NOT "always fake the HOME".** It is the **two-profile rule**, and it has two halves
that are both mandatory:

1. **Isolated by default** — every run whose purpose is _not_ profile-dependent (spawning the
   compiled sidecar or SEA binary from a test, a `meta/` harness, or a scratchpad command) gets a
   fresh, disposable fake profile.
2. **A named, deliberate real-profile arm** — for defects that can only arm under a _populated_
   profile. This arm is declared and justified where it lives; it is not an oversight to be
   tidied away.

**Both halves exist because both failure modes have been measured on this repo.**

- Isolation is needed: a direct run of the compiled sidecar with the real `HOME` wrote genuine
  local GOG session data (`userId`/`username`/`galaxyUserId`) into a scratchpad log — **twice**,
  in `260912-e6k` and again in `260913-901`, the second time despite a written threat-model entry
  saying to delete the captures.
- Isolation is also **dangerous**: the `major`, PR-blocking defect `260913-901` fixed — an
  un-`unref()`-ed 5-minute `setInterval` armed by `setPresence()` at `gog/presence.ts:39` — is
  created only behind `GOGUser.isLoggedIn()`. Measured same day, same tree, same command: real
  `HOME` **never exits** (no exit at 120s, reproduced twice); a cold empty fake `HOME` exits 0 in
  27.7s. An isolated-by-default gate would have been permanently, confidently green against it.

A convention saying only "always fake the HOME" would buy safety by making a whole class of
real-profile-only defects structurally invisible — the same failure mode as a gate that cannot see
the crash it was built for.

**What is enforced, and what is not.** In-repo spawn sites are enforced by
`src/backend/__tests__/fakeHomeIsolation.test.ts`: no file under `src/` or `meta/` may spawn a
child with a hand-rolled `env` literal assigning the home/config/state variables. Use
`createFakeHomeProfile()` from `src/backend/testUtils/fakeHomeProfile.ts`. The one exemption,
`meta/sidecarStartupSmoke.cjs`, is declared in that gate's `EXEMPTIONS` table with its reason, and
the gate re-reads the exempt file to prove the reason is still written there.

**The ad-hoc/scratchpad half rests on discipline and is NOT enforceable.** Nothing can observe a
command typed into a scratchpad, and a gate that appeared to cover it would be the
green-check-proving-nothing pattern this project keeps stamping out. This sentence is the whole
enforcement mechanism for that half. Do not read it as stronger than it is.

**The eight variables and the `mkdtemp 0700` reasoning are DERIVED from
`src/backend/jest.setupContainment.ts`**, not invented: `HOME`, `USERPROFILE`, `APPDATA`,
`LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`. That file
also records the measured correction worth keeping: `mkdtemp`'s 0700 is the **security control**
(umask can only ever _remove_ bits, so the directory can never carry group/other bits), and the
following `chmodSync` is **not** redundant — it restores owner-write, because `mkdtemp`'s
requested mode is masked and `umask 0277` yields 0500.

**Cleanup and redaction belong to the harness, not to your memory.** `createFakeHomeProfile()`
returns a disposing handle: `dispose()` shreds the profile and every path passed to
`registerCapture()`. Register raw diagnostic reports and `*.out` captures — a Node diagnostic
report embeds `environmentVariables`, `commandLine` and `cwd` verbatim. `260913-901` specified
deletion in writing and still left 103 MB of unredacted captures on disk until they were removed
by hand.

**Fresh profile per invocation, always.** No reuse-for-speed: a reused profile is a different
experiment carrying state capable of masking a defect. If a run is too slow, pin it offline or
stub the network — never recycle a profile. Reuse is permitted only as an explicitly-named opt-in
for a test whose _purpose_ is warm-path behaviour, justified at the call site.

### The sidecar's exit contract (stdin owns its lifetime)

> **No handle may hold a reference to the event loop past stdin EOF.**

The sidecar has **no explicit shutdown path, and does not need one.** Its lifetime is owned by
stdin — the RPC frame stream — and it exits by **event-loop drain** when the shell closes that
stream. `startRpcServer()` therefore has no `'end'`/`'close'` handler _by design_: there is
nothing to hang a teardown on, and adding one misunderstands the mechanism rather than hardening
it. The Rust shell reaps the child separately — `shutdown_child()` (`src-tauri/src/main.rs:1182`,
called at `:9631` from the `RunEvent::Exit` arm) SIGTERMs the whole process group, polls
`try_wait()` through a bounded grace period, then SIGKILLs. That is the **backstop for a sidecar
that will not leave, not the normal path**; anything that ever misses that kill leaves an orphan
holding an authenticated session.

Because exit is by drain, that one invariant carries the whole design — and it has **two halves**.

**1. `unref()` every handle you create.** Timers, watchers, sockets, child handles: anything libuv
counts. `unref()` does not stop the handle working. It only says _"do not keep the process alive
FOR ME."_ For the whole of the sidecar's real life stdin holds the loop open, so behaviour with a
live Rust peer is unchanged; only the no-peer, stdin-EOF case can now exit. This half is derived
from the in-situ comment at `installedJsonWatcher.ts:133-149`, which states it in full.

**2. Do not leave unbounded in-flight work at boot.** This is the half that gets missed, and
`unref()` is the **wrong tool** for it. Parked, idle sockets are already unreferenced and hold
nothing; _in-flight_ requests are referenced by definition, and exit tracks their drain. A bare
`axios.get` with no agent and no timeout cannot be fixed by unref'ing anything — it has to be
bounded, or not issued at boot.

**The contract is load-bearing, not theoretical — it has broken three times in three weeks:**

| when                     | what referenced the loop                                     | how it was caught                                                  |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| 2026-08-29 (`ef77e4a1e`) | the `installed.json` `FSWatcher`                             | `smoke:sidecar` went red; bisection                                |
| 2026-09-13 (`9e8e1b224`) | an un-`unref()`-ed 5-minute `setInterval` in `setPresence()` | a full day — **invisible to `process._getActiveHandles()`**        |
| open (`260913-m9c`)      | ~5 in-flight boot downloads on `https.globalAgent`           | a `--report-on-signal` diagnostic report plus an async-hooks probe |

The second row is why half 1 alone is not enough to state: Node multiplexes every JS timer onto a
single internal `uv_timer_t` with no JS wrapper, so the obvious instrument reports nothing. The
third row is a **different class** entirely, and is why half 2 has to be written down — someone
reading only the in-situ comments would reach for `unref()` and it would not move the number.

**What enforces this, honestly: almost nothing.** `pnpm smoke:sidecar`
(`.github/workflows/test.yml:41`) is the only gate, and it is a blunt instrument for the job. It
catches **total** failure to exit via its `ETIMEDOUT` arm but **not slow exit**:
`STARTUP_TIMEOUT_MS` is 30s and `260913-m9c` measured cold boots at 27–39s, so the contract can be
substantially violated while the gate stays green. It is also the named real-profile exemption of
the two-profile rule above, so it runs warm locally and only ever sees the cold path in CI. **No
test asserts the invariant.** The 13 `unref()` call sites across `src/` and `meta/` are 13 places
someone had to remember this rule unprompted. This paragraph is most of the enforcement; do not
read it as stronger than it is.

**A gate is not obviously the answer, and is a separate, deliberate decision.** A source gate over
`setInterval`/`setTimeout`/watcher creation would have caught **none of the three breaks cleanly**,
and could not see the in-flight class at all — a gate that appears to cover more than it does is
the green-check-proving-nothing pattern this project keeps stamping out. Decide it on its merits;
do not add one reflexively.

**Grep trap when auditing this.** `.unref?.()` is the dominant spelling — **8 of the 13** sites use
the optional call, because jest's fake-timer substitute is not required to implement `unref()`. A
census grepping `\.unref()` returns **5** real sites and looks complete; grepping bare `unref`
sweeps in comment prose and inflates the count instead. Match both spellings _and_ strip comment
lines, or the number you get will be confidently wrong in one direction or the other.

### UAT item shape (`expected:` inline, never a block scalar)

**The shape.** In a `*-UAT.md` item, `expected:` carries its text **inline** on the same line as
the key, and `result:` is the **very next line** — both sitting directly under the item's numbered
heading (`### N. <item name>`, unchanged from how it is today). Never write `expected: |`.

Conforming — inline text, `result:` on the next line:

```yaml
expected: Games appear as cards with title, artwork, and an Install button.
result: pending
```

Non-conforming — a block scalar here silently deletes every item in the file, not just this one:

```yaml
expected: |
  Games appear as cards with title, artwork, and an Install button.
result: pending
```

**The mechanism, so it is not mistaken for style.** `parseUatItems`'s `testPattern`
(`uat.js:150`) requires inline `expected:` text **and** `result:` on the next line. A block
scalar puts the body text in between the two, the pattern never matches, and **every** `### N.`
item in that file disappears from `audit-uat` — not just the one item carrying the block.

**Suppression, not truncation — and strictly worse.** A flattening mistake elsewhere shows an
operator an obviously-wrong `"|"` in the output; that is at least visible. This defect shows a
clean, complete-looking audit with items missing and no indicator anything is gone. Phase 34.5 is
the live proof: it carries 22 items and 3 `blocked` results, all currently invisible to
`audit-uat`, whose `summary` reports its reduced count with nothing to signal the loss.

**What is enforced, honestly.** `.planning/uat-visibility-gate.py` ratchets: it fails on a new
invisible item, including in a file **absent from its ledger entirely** (its self-test "direction
2: a file ABSENT from the ledger carries an invisible item"). So CI does catch this — but only
**after** the item is written and the file is already suppressed. This convention exists so the
shape is right at authoring time; do not read the gate as preventing the mistake, only as
detecting it afterward.

**Prohibition — do not flatten the 26 existing blocks.** `34.3-UAT.md`, `34.5-UAT.md`, and
`34.6-UAT.md` carry 26 `expected: |` blocks between them, and they are staying that way.
`uatRenderCheckpoint` (`uat.js:81-82`) deliberately matches `expected: |` and dedents it
correctly — it reads these files right, today. Flattening them would regress a reader that
already works in order to repair one that does not, and both parsers live in the same upstream
npx package (`get-shit-done-cc`, pinned `v1.42.3`) that this repo does not control. If you hit the
`audit-uat` gate and are tempted to flatten an existing block to make it pass: don't — write the
new item inline instead and leave the old ones ledgered.

**The upstream trap.** A UAT file scaffolded from `~/.claude/get-shit-done/templates/UAT.md`
starts non-conforming out of the box — its line 23 emits `expected: |`, and
`workflows/verify-work.md:230` does the same — so a freshly scaffolded file must be hand-corrected
to the inline shape at authoring time. Those template files are outside this repo and are not
being changed here.

### A formatter check belongs in every task's `<verify>`

**If a task writes a file, its `<verify>` block must run `npx prettier --check` over the exact
paths it wrote.** Scope to explicit paths, never `.` — a bare `.` drags in unrelated repo debt and
`src/preload/.prettierrc` sets `printWidth: 120` against the root's default 80, so the directory a
path sits in changes the correct answer.

**Why this is a rule and not a nicety: no other gate in this repo sees formatting.** An executor
can run `pnpm codecheck` (exit 0), `pnpm lint` (both ceilings PASS), its jest project,
`lint-translations`, `i18n-churn-guard` and `pnpm planning-gates` — every one green — and still
have written an unformatted file. Measured three times, and the third was not a planned phase at
all but a `/gsd-debug` session that ran the full battery: 2026-09-02 (phase 39, 7 files),
2026-09-21 (two quick tasks), 2026-09-23 (the blank-render fix). Each cost a rejected push, a
separate formatting commit and a re-push.

`.husky/pre-commit` now checks prettier over the **staged content** of every file a commit
touches, so this is a backstop rather than the only line of defence — but the hook fires at
`git commit` only. `git rebase`, `cherry-pick` and `merge` create commits without running it, and
`--no-verify` skips it. The verify block is what keeps the file formatted in the first place.

Both halves of the upstream plan template now carry a reminder
(`~/.claude/get-shit-done/templates/phase-prompt.md`, `bin/lib/template.cjs`). **Those files are
outside this repo, unversioned, shared by every project on the machine, and a `gsd` upgrade will
overwrite them** — the same caveat this file already records for the UAT template. This section is
the durable copy; treat the template text as a convenience, not as the requirement.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:.planning/research/ARCHITECTURE.md -->

## Architecture

No whole-app architecture is mapped. That is the honest state, not a placeholder awaiting a tool.

The repo's one architecture study is `.planning/research/ARCHITECTURE.md` (391 lines, researched
2026-07-05) — read it, but read it in scope. It is titled _Architecture Research — Humble Bundle
Integration_ and describes a key-management overlay on an **Electron** launcher. It predates the
Rust/Tauri shell, which landed 2026-07-20 in `83dc57a76`, by fifteen days: it mentions Electron
13 times and Tauri 0. Treat its process, IPC and packaging model as pre-rearchitecture.

For current structure, orient with `graphify query` (see the graphify section at the end of this
file) and follow the patterns already in the codebase.

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:.claude/skills/ -->

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
