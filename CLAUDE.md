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
the gate re-reads the exempt file to prove the reason is still written there. The exemption is
from the convention (this file must inherit the operator's real profile), not from the detector:
the exempt file is still scanned, and the gate asserts it assigns none of the eight variables, so
adding an `env` block there turns the gate red on every OS (quick 260926-c07).

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

### UAT item shape (`expected:` inline by preference; `result:` opens with a status word)

**The shape.** In a `*-UAT.md` item, the `### N. <item name>` heading sits at column 0. `expected:`
carried inline on the same line as the key is the house preference, with `result:` as the next
column-0 line. `result:`'s value must open with a bare or bracketed status word (`pending`, `pass`,
`issue`, `skipped`, `blocked`, or `[pending — note]`); prose may follow the word.

Conforming — inline text, `result:` on the next line:

```yaml
expected: Games appear as cards with title, artwork, and an Install button.
result: pending
```

**What changed, and when.** This section used to describe `get-shit-done-cc` 1.42.3's
adjacency-matched `parseUatItems`, under which a single body `expected: |` block scalar hid every
`### N.` item in its file. The machine has since moved to `@opengsd/gsd-core` 1.14.0
(`~/.claude/gsd-core/bin/lib/uat.cjs`, `parseUatItemsWithStats`). Measured 2026-09-26: the new
parser slices each column-0 `### N.` heading to the next heading of any level and reads
`expected: |` values dedented — probed directly with an in-memory fixture (a block-scalar
`expected:` plus a separate `## Current Test` block scalar elsewhere in the document): the item
was returned, its multi-line body dedented, `headingsSeen: 0`. Live `audit-uat --raw` reported 418
outstanding items across 56 files, `parse_gap_files: 2` — against the attributed 1.42.3 comparison
figure of 42 items across 13 files, measured by the 260926-kkt orchestrator before the old tool
was removed (`~/.claude/get-shit-done/` no longer exists, so that figure cannot be re-measured).
`34.3-UAT.md` (5 items) and `34.5-UAT.md` (17 items) were both 0 under 1.42.3 and are read in full
now. Block scalars are no longer a visibility hazard. Inline `expected:` stays the preference
because it is the shipped template's own `### N.` item shape and diffs cleanly — not because
anything breaks under gsd-core. The 26 existing `expected: |` blocks across `34.3-UAT.md`,
`34.5-UAT.md`, and `34.6-UAT.md` stay exactly as written; there is no reason to flatten them.

**What still goes unread, and it is now LOUD.** gsd-core reports what it cannot read itself:
`summary.parse_gap_files`, plus per-file `parse_gap: true` and `unparsed_blocks: N`. Two causes
were reproduced live on 2026-09-26. In `34.6-UAT.md` (`unparsed_blocks: 5`), every `result:` value
opened with bolded prose (e.g. `result: **PASS** (2026-08-26 19:26)...`) instead of a bare or
bracketed status word — probed directly: a fixture whose `result:` opens with `**PASS**` is
dropped from `items` and increments `headingsSeen`. In `32-HUMAN-UAT.md` (`unparsed_blocks: 1`), a
non-numbered `### CORRECTION 2026-08-22 ...` heading sat between item 1's heading and its own
`expected:`/`result:` pair, so item 1's block ended at that heading before it ever reached its
result. An audit with `parse_gap_files` above 0 is not a clean audit. Quick task 260926-ky9 closed
both: each of `34.6-UAT.md`'s five values gained a leading bare `pass — ` status word, with every
following character kept, because all five were passes on what the test asked and the issues
behind tests 3 and 4 live in its `## Gaps` entries; `32-HUMAN-UAT.md`'s `### CORRECTION` heading
became a bold paragraph line. Measured after: `parse_gap_files: 0`, 419 outstanding items across
55 files.

**What is enforced, honestly.** `.planning/uat-visibility-gate.py` (added in quick task 260912-csq)
was retired in quick task 260926-kkt: it copied 1.42.3's regex verbatim, so after the migration it
was counting against a parser nobody runs. The planning-gates floor moved from 13 to 12, and the
reason is recorded in `meta/runPlanningGates.py`. Nothing in CI now checks UAT item shape or
visibility — `audit-uat` runs from the global gsd-core install, which CI does not have, so
`parse_gap_files` is seen only by someone who actually runs it. The tool's reporting is not
enforcement.

**Upstream files.** `~/.claude/gsd-core/templates/UAT.md`, `workflows/verify-work.md`, and
`workflows/execute-phase.md` still write `expected: |`, but inside the `## Current Test` cursor
block, not inside a `### N.` item, and gsd-core reads it there — so a freshly scaffolded file needs
no hand-correction. Those files are outside this repo, unversioned, shared by every project on the
machine, and overwritten by a `gsd-core` upgrade — the same caveat the formatter section below
records for the plan template.

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

The gsd-core plan template files, `~/.claude/gsd-core/templates/phase-prompt.md` and
`~/.claude/gsd-core/bin/lib/template.cjs`, do not carry this reminder — measured 2026-09-26, a
case-insensitive grep for prettier or formatter returns 0 in each. The reminder this paragraph
used to cite (added with it in `38bcad5b1`) was a
hand edit to the pre-migration `get-shit-done-cc` 1.42.3 install's copies, and it did not survive
the move to `@opengsd/gsd-core`. **Those gsd-core files are outside this repo, unversioned,
shared by every project on the machine, and a `gsd-core` upgrade will overwrite them** — the same
caveat this file already records for the UAT template, so a reminder re-added there would
therefore not be durable either. This section is the only copy of the requirement; treat the
template text as a convenience, not as the requirement.

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
