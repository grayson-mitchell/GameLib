---
phase: quick-260930-upo
plan: 01
subsystem: docs
tags: [signpath, code-signing, privacy, readme]
requires: []
provides:
  - PRIVACY.md verified against source at f32ad5aaa
  - README "Code signing policy" and "Privacy" sections, corrected stack badges, false SignPath credit removed
  - Windows signing todo STATUS 2026-09-30 section
affects: [README.md, PRIVACY.md, .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md]
key-files:
  created: [PRIVACY.md]
  modified: [README.md, .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md]
decisions:
  - Privacy information is a link to PRIVACY.md, never SignPath's no-transfer boilerplate (false for GameLib)
  - SignPath attribution sentence deliberately NOT written into README until approval
  - No 2FA/MFA claim anywhere (unmeasurable from here)
metrics:
  tasks: 3
  files: 3
status: complete
commits: 3
plan_head_before: f32ad5aaa1b824d54ccda98ce661284d3d3b29f8
plan_head_after: 9b42cce5865cf79e26048e071f4f657b17c3e232
actuals:
  tokens: 20000
  tasks: 3
  commits: 3
completed: 2026-09-30
---

# Phase quick-260930-upo Plan 01: SignPath application prep Summary

Removed the false inherited SignPath credit from README, published a source-verified PRIVACY.md and a
README "Code signing policy" section, and recorded the eligibility state and remaining operator steps
in the Windows signing todo.

## Commits

| Task | Commit      | Files                                                                               |
| ---- | ----------- | ----------------------------------------------------------------------------------- |
| 1    | `a646c6a9e` | PRIVACY.md                                                                          |
| 2    | `3b909eaf3` | README.md                                                                           |
| 3    | `9b42cce58` | .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md |

`commits: 3` is measured: `git rev-list --count f32ad5aaa..HEAD` = 3. No per-plan ledger file was
created before the first commit (protocol 0c was missed), so `plan_head_before` is the HEAD recorded
in the plan (`f32ad5aaa`); it equals the parent of the first task commit.

## Verification results

- Task 1 verify: `TASK1-OK`. Prettier `ignored: false`, check passed, updater URL byte-identical.
- Task 2 verify: `TASK2-OK` (all gates in the plan's automated block).
- Task 3 verify (pre-commit part): 78 insertions, 0 deletions vs `f32ad5aaa`; frontmatter unchanged;
  3 resolvable SHAs. `pnpm planning-gates`: 12/12 passed, exit 0.
- Final: `npx prettier --check README.md PRIVACY.md` passed. The todo is under the prettier-ignored
  `.planning` tree, so no formatter check ran on it (vacuous by design).

## simple-icons slug probe

`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/tauri.svg` returned 200; `rust.svg` returned 200.
Both badges keep their `logo=` parameters.

## SignPath terms re-read (2026-09-30)

WebFetch is not available to this agent, so the page was fetched with `curl` and stripped to text.
Confirmed unchanged: the exact heading "Code signing policy" on home and download/release pages; the
Authors / Reviewers / Approvers role definitions; the privacy-policy link-or-boilerplate requirement;
MFA on SignPath and the source repo; upstream OSS binaries may be bundled but not signed. The
attribution the terms require is "Free code signing provided by SignPath.io, certificate by
SignPath Foundation" (deferred; not written into README).

Drift found: one clause the plan did not list. Software that transfers user data to systems the
user did not specify must describe it in a privacy policy, display that policy during installation,
and include installation options to disable those functions. Recorded as an open item in the todo. It
was not acted on here; not checked: whether any installer step displays the policy or whether the
connectivity check can be disabled at install time.

## Privacy census

All by grep and reading source, at HEAD `f32ad5aaa`. The app, sidecar and any binary were not run
(two-profile rule not engaged). graphify was queried once for orientation ("where are Epic GOG Amazon
login tokens persisted"); its output was truncated and not relied on, and the census below is
grep/read based.

### Step 1: telemetry, analytics, crash reporting

- Recursive case-insensitive grep over `src`, `src-tauri/src`, `src-tauri/Cargo.toml`, `package.json`
  for sentry, posthog, plausible, mixpanel, amplitude, bugsnag, datadog, crashpad, crash[-_]report,
  telemetry, analytics (tests excluded). Every hit classified: all are comments/docs or unrelated
  identifiers (`plausible`/`Plausible` in `assertPlausibleAbsolutePath`, `isPlausibleCapturedAt` and
  prose; `sentry` = Steam `loginusers.vdf/sentry` files in comments; `analytics` in two comments in
  `depotErrors.ts`). Zero runtime reporters.
- `node -e` over `dependencies` + `devDependencies` for those names: `[]`. `grep` of
  `src-tauri/Cargo.toml` for the names plus `crash`: no match.
- `panic::set_hook`: one, `src-tauri/src/main.rs:11233` (`install_panic_hook`). It `eprintln!`s and
  appends to a local file (`shell_panic_log_path`, built from `HOME`); nothing is sent. Sidecar
  `uncaughtException`/`unhandledRejection` guards (`sidecar/processGuards.ts`) are log-only.
- Conclusion written: no telemetry, analytics or crash reporting. Plausible telemetry was deleted per
  `.planning/todos/completed/2026-08-15-disable-plausible-telemetry-reporting-into-heroic-property.md`
  (cited from the todo, not re-derived from git history).

### Step 2: outbound hosts (URL-literal census)

Command: `grep -rnoE 'https?://[A-Za-z0-9._-]+'` over `src/backend src/common src/frontend src/preload
src-tauri/src` (ts, tsx, rs), tests excluded, counted per host (about 90 distinct hosts). Placeholders
excluded (`*.example`, `example.com`, `evil.example`, `attacker.net`, `gamelib.invalid`,
`developer.mozilla.org`). The frontend directory was covered by the count but only backend/common/
preload/src-tauri lines were listed for call-site classification, plus targeted greps for the
frontend hosts. Classification (A automatic, B explicit user action, C link opened on click, D
comment/dead):

| Host(s) | Call site | Class | Notes |
| --- | --- | --- | --- |
| github.com, store.epicgames.com, gog.com, cloudflare-dns.com | `online_monitor.ts:80-83` | A | HEAD connectivity check at start, retried while offline |
| raw.githubusercontent.com Heroic `releases-info` | `utils/releases.ts:15`, called from `sidecar/bootstrap.ts:1191` | A | skipped on Windows and under `CI=e2e` |
| raw.githubusercontent.com `MacAnticheatData` / `AreWeAntiCheatYet` | `anticheat/utils.ts:46-47` | A | Linux/macOS only, skipped if local hash matches |
| raw.githubusercontent.com Heroic `known-fixes` | `downloadmanager/utils.ts:506`, from install flow `:237` | B | at game install |
| github.com/grayson-mitchell/GameLib crossover-index | `crossover_index/index.ts:19` | A | macOS only (`crossoverRatingMap.ts:48`), TTL 24h, 5 min failure back-off |
| updater endpoint (`tauri.conf.json`) | no call site | none | see below |
| api.github.com (Wine, Proton, DXVK, VKD3D, DXMT, nvapi) | `tools/index.ts`, `tools/dxmt.ts`, `wine/manager/downloader/constants.ts`, `wine/runtimes/util.ts` | B | tool downloads |
| raw.githubusercontent.com winetricks | `tools/index.ts:531` | B | |
| lutris.net | `wine/runtimes/runtimes.ts:18` | B | runtime download |
| umu.openwinecomponents.org | `wiki_game_info/umu/utils.ts:34` | A | Linux, on game page |
| www.pcgamingwiki.com, howlongtobeat.com, gamesdb.gog.com | `wiki_game_info/*` | A | on game page; cached |
| www.protondb.com, store.steampowered.com Deck report | `wiki_game_info/wiki_game_info.ts:161-170` | A | Linux only |
| www.applegamingwiki.com, www.codeweavers.com | `wiki_game_info/*` | A | macOS (Apple wiki), macOS/Linux (CodeWeavers) |
| store.steampowered.com appdetails, cdn.cloudflare.steamstatic.com | `steam/games.ts:92-93,518,711` | A | Steam metadata/artwork |
| cdn.cloudflare.steamstatic.com installers | `steam/clientSetup.ts:147`, `steam/constants.ts:30` | B | Steam client install |
| Steam network (steam-user, steam-session) | `steam/user.ts:14-15`, `steam/depot.ts` | A when signed in | server list chosen by library; not enumerated |
| launcher.store.epicgames.com, store-content.ak.epicgames.com | `legendary/games.ts:135,175,238` | A | game details |
| status.epicgames.com | `utils.ts:205` (via `isEpicServiceOffline`) | B | before launch/download |
| heroic.legendary.gl | `legendary/library.ts:725,742` | A/B | overrides, per-game SDL list; not GitHub-hosted |
| origin-a.akamaihd.net, static3.cdn.ubi.com | `legendary/games.ts:677,718` | B | EA app / Ubisoft Connect installers |
| GOG: api/users/gamesdb/galaxy-library/content-system/gameplay/remote-config.gog.com | `gog/library.ts`, `gog/games.ts`, `gog/user.ts`, `gog/redist.ts` | A/B | library, achievements, sessions, install |
| presence.gog.com | `gog/presence.ts:81,161` | A | POST every 5 min while signed in unless `disableGOGPresence`/`disablePlaytimeSync`; DELETE on quit |
| catalog.gog.com | `discounts/fetchDiscounts.ts:38` | A | discounts |
| auth.gog.com | `frontend/screens/WebView/loginRoutes.ts:48` | B | login page in webview |
| www.humblebundle.com | `humble/adapter.ts:160` | A/B | keys refresh, login |
| www.zoom-platform.com | `zoom/constants.ts:5-6` | A/B | login, library |
| www.cheapshark.com | `storeSearch/cheapshark.ts:25` | B | store search |
| www.steamgriddb.com, cdn2.steamgriddb.com | `steamgrid/utils.ts:5` | B | needs user API key |
| dpaste.com | `logger/uploader.ts:13` | B | log upload, confirm dialog |
| Discord (local RPC) | `utils.ts:694` (`@xhayper/discord-rpc`) | B | only when `discordRPC` setting on; not seen in config defaults |
| ko-fi.com, discord.gg, hosted.weblate.org, github.com Heroic wiki/support/sponsors, legendary.gl/epiclogin, wiki.winehq.org | `constants/urls.ts`, `shellFilesFlowRegistration.ts` | C | opened on click only |
| `GITHUB_API` (Heroic releases), `heroicGithubURL` | `constants/urls.ts:6` | D | `git grep`: no other reference to `GITHUB_API`; `getLatestReleases()` in `utils.ts:924` returns `[]` (suppressed) |
| store.gog.com, checkout.stripe.com, www.amazon.com, accounts.google.com, login.gog.com, embed.gog.com (src-tauri) | `main.rs` tests | D | test fixtures/comments only |

`GAMELIB_USER_AGENT`: defined `utils.ts:1775`, sole consumer is the `axiosClient` at `utils.ts:1778-1781`
(imported by about 20 backend files). Log upload sends `HeroicGamesLauncher/<version>` (`uploader.ts:20`).
PRIVACY.md states the first fact and does not claim every request carries it.

### Step 3: credentials

- Slots: `steam-refresh-token`, `humble-session`, `humble-csrf`, `steamgrid-api-key`
  (`keyringTokenStore.ts:20-23`), matched by the `keyring_account()` allowlist (`main.rs:1358-1366`).
- `Cargo.toml:44`: `keyring` with `apple-native`, `windows-native`, `sync-secret-service` = Keychain,
  Credential Manager, Secret Service.
- No fallback: `keyringTokenStore.ts` header states no env/in-memory/plaintext fallback. `devSecretVault.ts`
  is plaintext but opt-in via `GAMELIB_DEV_SECRET_VAULT === '1'` and refuses when `isPackagedSidecar()`
  is true or undeterminable (read from its header; the guard code itself was not re-read).
- Epic: `legendary/constants.ts:6-8` (`legendaryConfigPath` under `appFolder/legendaryConfig/legendary`,
  `user.json`). GOG: `gog/constants.ts:7` `gogdlAuthConfig` = `userData/gog_store/auth.json`; GameLib
  `configStore` stores `isLoggedIn` and `userData` (`gog/user.ts:196,293`). Amazon: `nile/constants.ts:4-7`
  `appFolder/nile_config/nile/current_user.json`. Zoom: `zoom/constants.ts:4-7` `.zoom.token` in
  `userData/zoom_store`, written plaintext (`zoom/user.ts:29`).
- Webview data directory: `grep` for `data_directory|incognito|partition` in `main.rs` returned nothing
  useful; NOT confirmed, listed under Limits.

### Step 4: updater

`tauri.conf.json` `plugins.updater.endpoints[0]` = `https://github.com/grayson-mitchell/GameLib/releases/download/updater/latest.json`.
`tauri_plugin_updater` is registered (`main.rs:11429`) and `updater:default` is in
`capabilities/default.json`, and `@tauri-apps/plugin-updater` is a dependency, but
`git grep -n 'plugin-updater\|check_update\|UpdaterExt'` (excluding lockfile, md, .planning) finds NO
call site. The `checkForUpdatesOnStartup` setting (default `!isFlatpak`, `config.ts:345`) only gates
`getLatestReleasesForStartup()` (`appshell/releases.ts:23`), which returns `[]`. So PRIVACY.md says
GameLib does not currently check for updates on its own; the plan expected an automatic check
("state whether the check runs automatically"), and the measured answer is "no code path exists".

CrossOver index: macOS only, at most once a day (see table).

### Step 5: local data

Config: `appFolder` = `<appData>/GameLib` (`constants/paths.ts:20`); `appData` per `sidecar/pathShim.ts:38-45`
(darwin `~/Library/Application Support`, win32 `%APPDATA%`, else `$XDG_CONFIG_HOME` or `~/.config`).
Logs: `logger/paths.ts:11-24` (macOS `~/Library/Logs/GameLib`, Windows `%LOCALAPPDATA%\GameLib\logs`, else
`$XDG_STATE_HOME/GameLib/logs` or `~/.local/state/GameLib/logs`). Snap/Flatpak variants exist and were
not described.

### Step 6: log upload

`logger/uploader.ts`: destination `https://dpaste.com/api/v2/`, `EXPIRY_DAYS = 2`, first 10 MiB, POST
of `content=` + `expiry_days`; `LogUploadDialog` shows a confirm step before `doUpload`; a
`grep -rn redact src/backend/logger` returned nothing, so no redaction runs. dpaste has no delete
(`uploader.ts` TODO comment). PRIVACY.md says the upload is unredacted and cannot be deleted.

## Task 2 out-of-scope README residuals (line numbers re-measured post-edit at `3b909eaf3`)

- `pnpm dist:linux/win/mac` at README.md:162, 174, 246, 252, 257. `node -e` over `package.json` scripts:
  no `dist*` script (only `clean:dist-*`).
- electron-builder note at README.md:227.
- Weblate credit points at Heroic's project: README.md:135 (and the Credits entry).
- "Back to top" badge links `#heroic-games-launcher` at README.md:305; the anchor does not exist.

All four are recorded in the todo. None were fixed.

## Deviations from Plan

**1. [Rule 3 - Blocking] WebFetch unavailable.** The plan says to re-read the SignPath terms with
WebFetch. This agent has no WebFetch tool, so `curl -sL https://signpath.org/terms` was used and the
HTML stripped. Terms confirmed as described above; one extra clause found and recorded.

**2. [Measured difference from plan expectation] Updater has no call site.** The plan's Task 1 step 4
anticipated an automatic startup check with a toggle. Measured: none. PRIVACY.md and the README updater
sentence are worded to the measured state (README: signed with the updater key and verified by the
updater plugin against the committed public key; it does not claim the app checks for or installs
updates).

**3. Ledger file.** Protocol 0c (per-plan head ledger) was not created before the first commit.
`plan_head_before` was taken from the plan's recorded HEAD and matches the first commit's parent.

Otherwise the plan was executed as written. No auto-fixes to source. No package installs. STATE.md,
ROADMAP.md and docs commits were left to the orchestrator per the task constraints.

## Known Stubs

None.

## Threat Flags

None. No code, endpoint or trust boundary was added; documentation only.

## Notes for the operator

- PRIVACY.md is a documented reading of source at `f32ad5aaa`, not a legal review. It lists what it
  could not confirm under "Limits of this document".
- The README updater wording and PRIVACY.md updater paragraph will become stale if an update check is
  wired in.
- MFA is not asserted anywhere.

## Self-Check: PASSED

- FOUND: PRIVACY.md, README.md, the todo, and this SUMMARY.
- FOUND commits: `a646c6a9e`, `3b909eaf3`, `9b42cce58` (`git log --oneline -4`).
