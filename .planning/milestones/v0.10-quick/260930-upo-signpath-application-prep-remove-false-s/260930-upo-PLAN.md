---
phase: quick-260930-upo
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - QUICK-260930-UPO
files_modified:
  - PRIVACY.md
  - README.md
  - .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - 'README.md makes no claim of any current SignPath relationship: the inherited SignPath credit, its campaign-tagged links and its logo image are gone, every line mentioning SignPath sits inside the "## Code signing policy" section, and none of those lines thanks, credits or says SignPath provides anything'
    - 'README.md has a "## Code signing policy" section, reachable from the Index, that says Windows release binaries are currently unsigned, says GameLib is applying to SignPath Foundation with the attribution to be added only on approval, lists the team roles (Grayson Mitchell: Author, Reviewer, Approver; sole maintainer), says which binaries would be signed, gives the macOS signing state exactly as measured (signed and notarized build verified on the v0.7.0 draft, no published release), and links PRIVACY.md'
    - 'The README stack badges match the real stack (Tauri and Rust shell, Node.js sidecar, React, TypeScript, MUI, Vite, Jest), and there are no Electron or electron-builder badges'
    - 'PRIVACY.md exists at the repo root. It says what GameLib stores locally and where (OS credential store vs. config files), what it sends and to whom, and whether any telemetry, analytics or crash reporting exists. Every claim traces to a source census recorded in the SUMMARY, and anything unverified is stated as a limit, not asserted'
    - 'The Windows signing todo has a dated "## STATUS 2026-09-30 (quick 260930-upo)" section directly above "## STATUS 2026-09-24". The diff is insertion only (0 deleted lines), severity/platform/ready/needs are unchanged, and pnpm planning-gates passes'
  artifacts:
    - path: PRIVACY.md
      provides: 'Privacy policy verified against source: local storage, network destinations, telemetry status, limits'
      contains: 'telemetry'
    - path: README.md
      provides: 'Code signing policy section, Privacy section, corrected stack badges, false SignPath credit removed'
      contains: '## Code signing policy'
    - path: .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md
      provides: 'Dated status record of the SignPath eligibility blockers, what closed them, and remaining operator steps'
      contains: '## STATUS 2026-09-30 (quick 260930-upo)'
  key_links:
    - from: README.md
      to: PRIVACY.md
      via: 'relative markdown link (PRIVACY.md) inside the Code signing policy section and the Index'
      pattern: '\(PRIVACY\.md\)'
    - from: README.md Index
      to: README.md Code signing policy section
      via: 'anchor link #code-signing-policy'
      pattern: '\(#code-signing-policy\)'
    - from: PRIVACY.md
      to: src-tauri/tauri.conf.json plugins.updater.endpoints
      via: 'the updater feed URL quoted in PRIVACY.md is byte-identical to the configured endpoint'
      pattern: 'releases/download/updater/latest.json'
---

<objective>
Prepare GameLib's public repo for a SignPath Foundation code-signing application. Remove a false
claim, publish the two documents SignPath's terms require, and record the state in the Windows
signing todo.

Purpose: a read-only check on 2026-09-30 against https://signpath.org/terms found three
eligibility blockers: (a) the only release, v0.7.0, is a Draft; (b) no code signing policy is
published; (c) no privacy policy exists. It also found that README.md:233-235 carries a SignPath
credit inherited from Heroic. GameLib has no SignPath relationship, so that credit is a shipped
false claim. This task closes (b) and (c), removes the false credit, and records what is left.
Only the operator can do what remains: publish a release, confirm MFA, and submit the application.

SignPath terms that constrain the text (fetched 2026-09-30 during planning; re-read them with
WebFetch before writing Task 2):
- The policy must appear under a heading or link titled exactly "Code signing policy" on the home
  page and on the download/release pages.
- It must list team roles:
  - Authors: trusted to modify source without additional review.
  - Reviewers: review changes from non-committers.
  - Approvers: authorise each signing request.
- It must carry privacy information, either as a link to a privacy policy or as SignPath's
  boilerplate "no information transferred unless requested" sentence. Use the link. The
  boilerplate sentence would be false for GameLib, which makes network requests without explicit
  per-request user action (store library sync, metadata and artwork fetches, and the update and
  CrossOver-index feeds; Task 1 measures the exact set).
- All team members need MFA on SignPath and on the source repo.
- Only binaries built from the project's own source are signed. Unsigned upstream OSS binaries may
  be bundled.

Ordering deviates from the operator's list on purpose. PRIVACY.md is Task 1 and README.md is
Task 2, so README's new link to PRIVACY.md never points at a missing file in any commit. The
content of each task is exactly what the operator specified.

Tracer-first decomposition is not applied. This is a documentation-only quick task with no layered
code path to slice through. The three tasks are independent, sequential, atomic commits.

Output: PRIVACY.md (new), README.md (edited), the Windows signing todo (appended section), and
260930-upo-SUMMARY.md.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@README.md
@.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md

Facts measured during planning on 2026-09-30. Re-measure any fact before relying on it; do not
copy these as evidence.
- Stack: `src-tauri/Cargo.toml` declares `tauri = { version = "2" ... }`, crate `gamelib-shell`, and
  `keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }`.
  `package.json` has no `electron` or `electron-builder` dependency. It has `react ^18.3.1`,
  `typescript ^5.8.3`, `@mui/material ^5.17.1`, `jest ^29.7.0`, `@tauri-apps/cli ^2.11.4`,
  `license: GPL-3.0-only`, and `version: 0.7.0`. Vite is not a direct dependency but it is the
  renderer build: `.github/workflows/release-tauri.yml:307` runs `pnpm exec vite build`, and
  `vite.config.ts` exists. The sidecar is a Node SEA (`build:sidecar-sea` script,
  `externalBin: ["binaries/gamelib-sidecar"]`).
- Updater: `src-tauri/tauri.conf.json` `plugins.updater.endpoints` =
  `https://github.com/grayson-mitchell/GameLib/releases/download/updater/latest.json`. Updater
  artifacts are minisign-signed (`createUpdaterArtifacts: true`, `pubkey`). A
  `CheckUpdatesOnStartup` setting exists at
  `src/frontend/screens/Settings/components/CheckUpdatesOnStartup.tsx`.
- Keyring slots (`src/backend/sidecar/keyringTokenStore.ts`): `steam-refresh-token`,
  `humble-session`, `humble-csrf`, `steamgrid-api-key`.
- Plausible telemetry was deleted (`.planning/todos/completed/2026-08-15-disable-plausible-telemetry-reporting-into-heroic-property.md`,
  "Net -298 lines").
- A log upload to dpaste.com exists at `src/backend/logger/uploader.ts`. Per
  `.planning/todos/completed/log-upload-has-no-redaction.md` it sits behind a confirm dialog. Read
  the current code rather than trusting either todo.
- Inherited Heroic endpoints are still in source: `src/backend/utils/releases.ts` fetches
  `raw.githubusercontent.com/Heroic-Games-Launcher/releases-info/...` (skipped on Windows).
  `src/backend/downloadmanager/utils.ts:506` fetches Heroic `known-fixes`. `src/backend/anticheat/utils.ts:46-47`
  fetches anticheat data. `src/backend/constants/urls.ts` holds `GITHUB_API` (Heroic releases).
  Maintainer-controlled: `src/backend/crossover_index/index.ts:19` (the crossover-index release
  asset). `src/backend/utils.ts` defines `GAMELIB_USER_AGENT` (app version plus repo URL).
- Releases (`gh release list -R grayson-mitchell/GameLib`): `GameLib v0.7.0` is a Draft. Two
  published Pre-releases hold data assets (`runners-onedir-macos`, `crossover-index`). No
  `updater` release was listed.
- `gh api user` returns `two_factor_authentication: null` for this token, so 2FA cannot be
  measured from here. It stays an operator step and must not be asserted anywhere.
- The macOS signing todo is at `.planning/todos/completed/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`,
  not under pending/ as the task brief said. Its STATUS 2026-09-23 and 2026-09-24 sections
  measured the v0.7.0 macOS build from the Draft release as `spctl` `accepted`,
  `source=Notarized Developer ID`, and `stapler validate` worked. They also say the release is
  still a Draft and has not been published.
- `npx prettier --file-info README.md` and `npx prettier --file-info PRIVACY.md` both report
  `{ "ignored": false, "inferredParser": "markdown" }` (measured). `.planning/**` is
  prettier-ignored.
- HEAD at planning time: `f32ad5aaa`. Tasks 1 and 2 do not touch the todo, so a diff of the todo
  from `f32ad5aaa` isolates Task 3's change.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write PRIVACY.md from a source census, asserting only what the code confirms</name>
  <files>PRIVACY.md</files>
  <action>
Work from source only. Do NOT launch the app, the sidecar or any compiled binary for this task.
The census is grep and graphify over source. That keeps the two-profile rule in CLAUDE.md
unengaged, and no real-profile session data can land in a capture. Orient with
`graphify query "<question>"` before raw grepping, as CLAUDE.md requires, for example
`graphify query "where are Epic GOG Amazon login tokens persisted"`. Record every census command
and its classified result in the SUMMARY under a "Privacy census" heading. PRIVACY.md itself
carries only conclusions.

Census steps (exclude `__tests__`, `*.test.ts(x)` and `testUtils` hits from every step):

1. Telemetry, analytics and crash reporting. Run a case-insensitive recursive grep over `src`,
   `src-tauri/src`, `src-tauri/Cargo.toml` and `package.json` for sentry, posthog, plausible,
   mixpanel, amplitude, bugsnag, datadog, crashpad, crash-report / crash_report, telemetry and
   analytics. Also list every dependency name in `package.json` (node -e over dependencies and
   devDependencies) and `src-tauri/Cargo.toml` that matches those names.
   - Classify each hit as a runtime reporter, a comment or doc, or an unrelated identifier.
   - Write "GameLib contains no telemetry, analytics or crash reporting" ONLY if there are zero
     runtime reporters. Otherwise describe exactly what exists.
   - Also check whether any Rust panic hook or sidecar crash path sends data anywhere. Grep
     `panic::set_hook` and `uncaughtException` handlers.

2. Outbound hosts. Run a URL-literal census: grep -rnoE for https?:// hostnames over
   `src/backend`, `src/common`, `src/frontend`, `src/preload` and `src-tauri/src` (ts, tsx, rs),
   then count per host. For every host that is not example.*/test/attacker placeholder, locate
   its call sites and classify each one:
   - (A) automatic request, with no user action beyond using the app normally. Examples: boot,
     library refresh, metadata or artwork fetch.
   - (B) request made only on an explicit user action. Examples: login, install, log upload,
     tool download.
   - (C) a link opened in the browser or a child window when clicked.
   - (D) comment, doc or dead constant with no caller. Prove "no caller" with a grep for the
     constant name.

   Also confirm Weblate (`weblateUrl`), Discord, Ko-fi and the Heroic wiki and support URLs are
   (C) or (D) only. Also determine which requests carry `GAMELIB_USER_AGENT`: find its consumers
   and state which client uses it.

3. Store credentials and where they live.
   - Read the keyring slot constants in `src/backend/sidecar/keyringTokenStore.ts` and the
     `keyring_account()` allowlist in `src-tauri/src/main.rs`.
   - The keyring crate features in `src-tauri/Cargo.toml` map to the platform store: apple-native
     is the macOS Keychain, windows-native is Windows Credential Manager, and sync-secret-service
     is the Secret Service on Linux.
   - Determine what happens when the OS credential store is unavailable or denied. Does anything
     fall back to a plaintext file? Check `src/backend/sidecar/fileStore.ts`,
     `src/backend/sidecar/devSecretVault.ts` (is it dev-only?) and the keyring-denied path.
   - For Epic, GOG, Amazon and any other store with a login in `src/backend/storeManagers/*/user.ts`
     (Zoom included if present), find where the session or refresh token is persisted. Usually
     this is a config file written by the bundled tool (legendary / gogdl / nile) or by GameLib's
     own config store. Name the location at directory level from `src/backend/constants/paths.ts`
     or the tool's config path. Do not guess.
   - Also note that embedded store login and store-browsing webviews keep those sites' cookies in
     the webview's own data directory, if the code confirms a persistent webview data dir.

4. Updater.
   - Read `plugins.updater.endpoints` from `src-tauri/tauri.conf.json`.
   - Find where the update check is triggered: trace the `CheckUpdatesOnStartup` setting and any
     updater `check` invoke through `src/frontend`, `src/preload` and `src-tauri/src`. Find the
     setting's default value.
   - State whether the check runs automatically at startup (and whether it can be turned off) or
     only on request.
   - State that the feed is a file hosted on GitHub in the maintainer's repository, so the request
     goes to GitHub's servers and GitHub sees the requester's IP address and User-Agent.
   - Do the same for the crossover-index release asset (`src/backend/crossover_index/index.ts`):
     which platforms and when.

5. Local data. From `src/backend/constants/paths.ts` and the logger (`src/backend/logger/paths.ts`),
   name the config, log and cache directories at directory level, per OS where the code
   distinguishes them. Say that logs stay on the device unless the user uploads them.

6. Log upload. Read `src/backend/logger/uploader.ts` and
   `src/frontend/components/UI/LogFileUploadDialog/index.tsx`. Record the destination host,
   whether a confirm step exists, the expiry and the size cap as the code states them, and
   whether any redaction runs today. If none runs, PRIVACY.md must say uploaded logs are not
   redacted and may contain account identifiers.

Then write PRIVACY.md at the repo root. It is a new file; match README's plain Markdown style.
Sections, in this order:
- "# GameLib Privacy Policy".
- A one-paragraph summary.
- "## What GameLib stores on your device": credentials (which go to the OS credential store and
  which go to config files, named per store), settings, library caches and logs.
- "## What GameLib sends, and to whom": a table with destination, when, what is sent and what
  triggers it. Only (A) and (B) rows from step 2. Group third-party data sources by purpose:
  - store services and accounts (Epic via legendary, GOG via gogdl, Amazon via nile, Steam via
    the Steam network and store.steampowered.com, Humble, and any others confirmed)
  - game metadata, artwork and compatibility data (ProtonDB, Steam Deck compatibility,
    PCGamingWiki, SteamGridDB, HowLongToBeat and the rest, as confirmed)
  - compatibility-tool and runtime downloads from GitHub
  - community data files hosted on GitHub by Heroic Games Launcher's repositories. These requests
    go to GitHub, not to a Heroic-operated server.
- "## Telemetry, analytics and crash reporting": the step-1 conclusion.
- "## Servers the maintainer controls": say plainly whether GameLib operates any server of its
  own. Name the grayson-mitchell/GameLib GitHub release assets it fetches (the updater feed, with
  the endpoint URL quoted byte-for-byte from tauri.conf.json, and the CrossOver index) and say
  they are served by GitHub.
- "## Things that happen only when you ask": log upload, opening store pages, links.
- "## Store pages shown inside GameLib": these are the stores' own pages, subject to those
  stores' privacy policies, including any analytics they run.
- "## Limits of this document": say that the census covered URL literals in GameLib's own source
  at a named commit. Say that endpoints built at runtime or used inside bundled third-party tools
  (legendary, gogdl, nile, comet, steam-user's server list) are described by purpose and not
  enumerated. Say that each third party's own privacy policy governs what it does with requests.
  Say that anything the census could not confirm is listed here instead of asserted.
- "## Contact": GitHub issues at https://github.com/grayson-mitchell/GameLib/issues.

End with a line saying the document was checked against the GameLib source at commit
`<git rev-parse --short HEAD at the time of writing>` on 2026-09-30.

Hard rules:
- Every sentence must trace to a census row.
- Put nothing in PRIVACY.md that the census did not confirm. Unconfirmed items go under Limits.
- Do NOT use SignPath's boilerplate no-transfer sentence anywhere.
- Do NOT claim GDPR or other legal compliance.
- Name no maintainer email address.

Format with `npx prettier --write PRIVACY.md` (exact path only), then run the verify below.
Commit only PRIVACY.md:
`docs(quick-260930-upo): add PRIVACY.md verified against source`. End the message with the
Co-Authored-By trailer from the session's attribution reminder.
  </action>
  <verify>
    <automated>npx prettier --file-info PRIVACY.md 2>/dev/null | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check PRIVACY.md && U=$(node -e 'console.log(require("./src-tauri/tauri.conf.json").plugins.updater.endpoints[0])') && grep -qF "$U" PRIVACY.md && grep -qi 'telemetry' PRIVACY.md && grep -qi 'keychain' PRIVACY.md && grep -qi 'credential manager' PRIVACY.md && grep -qi 'secret service' PRIVACY.md && grep -q 'grayson-mitchell/GameLib' PRIVACY.md && grep -qE '^## Limits' PRIVACY.md && grep -qE 'commit `?[0-9a-f]{7,40}' PRIVACY.md && { if grep -q 'dpaste' src/backend/logger/uploader.ts; then grep -q 'dpaste' PRIVACY.md; fi; } && git ls-files --error-unmatch PRIVACY.md >/dev/null && echo TASK1-OK</automated>
  </verify>
  <done>
PRIVACY.md is committed at the repo root and prettier-clean (a real check: `ignored: false`).
It quotes the updater endpoint byte-for-byte from tauri.conf.json. It names all three OS
credential stores, states the telemetry conclusion, names the maintainer's GitHub repo as the only
maintainer-controlled origin (or states otherwise if measured), mentions the log-upload
destination if uploader.ts still has one, and carries a Limits section and a commit anchor. The
SUMMARY holds the census commands and the (A)/(B)/(C)/(D) classification that backs every row.
  </done>
</task>

<task type="auto">
  <name>Task 2: README.md — remove the false SignPath credit, correct the stack badges, add the Code signing policy and Privacy sections</name>
  <files>README.md</files>
  <action>
Re-read https://signpath.org/terms with WebFetch first and confirm the role definitions and the
heading requirement quoted in this plan's objective still hold. If they have changed, follow the
live terms and note the difference in the SUMMARY.

1. Remove the false SignPath credit (README.md:233-235 at plan time): the credit sentence, its
   campaign-tagged SignPath link, the blank line and the linked SignPath logo image. Do NOT reword
   it into a new claim. Leave the Weblate credit and the "## Sponsors" heading as they are. Weblate
   is out of scope here; see step 6.

2. Badges (README.md:17-24).
   - Delete the Electron badge and the electron-builder badge.
   - Add a Tauri badge (shields.io `badge/Tauri-24C8D8`, `logo=tauri`, linking https://tauri.app/)
     and a Rust badge (`badge/Rust-CE422B`, `logo=rust`, linking https://www.rust-lang.org/).
     Use the same `style=for-the-badge&labelColor=gray` parameters as the surrounding badges.
   - Keep TypeScript, React, MUI, NodeJS, Jest and Vite. Each is verified in this plan's context
     block: Node is the sidecar runtime, Vite is the renderer build.
   - Before committing, confirm the two simple-icons slugs exist:
     `curl -s -o /dev/null -w '%{http_code}' https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/tauri.svg`
     and the same for `rust.svg` must both print 200. Record the result in the SUMMARY. If a slug
     returns non-200, drop that badge's `logo=` parameter rather than guess another slug.
   - Change the sentence above the badges ("GameLib is built with Web Technologies:") only if it
     no longer reads truthfully with the new badges. A minimal truthful form is "GameLib is built
     with:". Keep its two trailing spaces, which are a Markdown hard line break.

3. Add a "## Code signing policy" section immediately after the "### Windows / macOS" subsection
   of "## Installation", before "## Development environment". Use exactly that heading text;
   SignPath requires the title. Content, as short prose plus one roles table:
   - Windows: release binaries are currently NOT code-signed, so Windows SmartScreen will warn when
     you run the installer.
   - GameLib is applying to SignPath Foundation's free code-signing programme for open-source
     projects. Use present-progressive "is applying". Do not write "has been accepted" or "is
     signed by". State that nothing is signed through SignPath today. State that if the
     application is approved, Windows release binaries will be signed through SignPath and the
     attribution SignPath Foundation requires will be added to this section at that time. Do NOT
     write that attribution sentence itself into the README now. Per the operator, it is added
     only on approval.
   - What gets signed: only binaries built from this repository's source by the release workflow
     (`.github/workflows/release-tauri.yml`). That means the GameLib application executable, its
     Node.js sidecar and the installer. Before naming them, confirm each against
     `src-tauri/tauri.conf.json` (`externalBin`, bundle targets) and the workflow. Third-party
     open-source tools bundled with GameLib ship as built by their upstream projects and are not
     signed by GameLib on Windows. Name the ones the Windows bundle actually carries, confirmed
     from `src-tauri/tauri.windows.conf.json` `bundle.resources` and the
     `download-helper-binaries` script, for example legendary, gogdl and nile.
   - Update packages are also signed with GameLib's updater key, and the app verifies that
     signature before installing an update. That is separate from operating-system code signing.
     This is backed by `createUpdaterArtifacts` and the updater `pubkey` in tauri.conf.json.
   - macOS: builds produced by the release workflow are signed with an Apple Developer ID
     certificate and notarized by Apple. This was verified on the v0.7.0 build (Gatekeeper
     `accepted`, `source=Notarized Developer ID`). That release is still a draft, so no signed
     macOS release has been published yet. Source: the STATUS 2026-09-23 and 2026-09-24 sections of
     `.planning/todos/completed/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`. Do NOT
     write that signed macOS releases are shipped or available.
   - Linux: state the signing state only as measured from `release-tauri.yml`. If no Linux signing
     step exists, say Linux builds are not code-signed.
   - Team roles table with columns Role / Member / Responsibility. Grayson Mitchell
     (GitHub `grayson-mitchell`) holds all three roles:
     - Author: modifies source without additional review.
     - Reviewer: reviews changes from contributors outside the team.
     - Approver: approves each signing request.
     Add one sentence saying GameLib currently has a single maintainer.
   - Do NOT assert anything about two-factor or multi-factor authentication. It could not be
     measured from here (the `gh api user` 2FA field is null).
   - Privacy: one sentence linking [PRIVACY.md](PRIVACY.md). Do NOT use SignPath's boilerplate
     no-transfer sentence, which is false for GameLib (see the objective).

4. Add a "## Privacy" section directly after the Code signing policy section. One or two sentences
   say GameLib stores no telemetry and link [PRIVACY.md](PRIVACY.md). Only say "no telemetry" if
   Task 1's census concluded that; otherwise summarise Task 1's conclusion accurately.

5. Index (README.md:26-47). After the "- [Installation](#installation)" block and its children,
   insert "- [Code signing policy](#code-signing-policy)" and "- [Privacy](#privacy)" at the same
   indentation as the other top-level entries (two spaces, children of GameLib). Change no other
   Index entry.

6. Out of scope, do NOT fix: record each in the SUMMARY with a re-measured line number.
   - The Installation and Building sections reference `pnpm dist:linux` / `dist:win` / `dist:mac`
     scripts. Re-measure with node -e over `package.json` scripts; at plan time none existed.
   - The Development environment note about electron-builder and standalone pnpm (README.md:180).
   - The Weblate credit points at Heroic's Weblate project.
   - The "Back to top" badge links a `#heroic-games-launcher` anchor that no longer exists.
   A SignPath reviewer will read this page, so Task 3 records these residuals in the todo.

Format with `npx prettier --write README.md` (exact path only), then run the verify. Commit only
README.md: `docs(quick-260930-upo): README code signing policy, privacy link, stack badges; remove
false SignPath credit`. End the message with the session's Co-Authored-By trailer.
  </action>
  <verify>
    <automated>npx prettier --file-info README.md 2>/dev/null | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check README.md && test "$(grep -c 'heroicgameslauncher' README.md)" -eq 0 && test "$(grep -c '182468471' README.md)" -eq 0 && test "$(grep -ci 'code signing provided by' README.md)" -eq 0 && test "$(awk '/^## /{s=$0} tolower($0) ~ /signpath/ && s != "## Code signing policy" {n++} END{print n+0}' README.md)" -eq 0 && test "$(grep -i 'signpath' README.md | grep -ciE 'thanks|provided by|providing|sponsor')" -eq 0 && test "$(sed -n '1,/^## Index/p' README.md | grep -cE 'electronjs\.org|electron\.build')" -eq 0 && test "$(sed -n '1,/^## Index/p' README.md | grep -c 'logo=tauri')" -eq 1 && test "$(sed -n '1,/^## Index/p' README.md | grep -c 'logo=rust')" -eq 1 && grep -qx '## Code signing policy' README.md && grep -qx '## Privacy' README.md && grep -qF '[Code signing policy](#code-signing-policy)' README.md && grep -qF '[Privacy](#privacy)' README.md && S=$(awk '/^## /{s=$0} s=="## Code signing policy"' README.md) && echo "$S" | grep -qiE 'unsigned|not code-signed|not signed' && echo "$S" | grep -qi 'applying' && echo "$S" | grep -q 'Grayson Mitchell' && echo "$S" | grep -q 'Author' && echo "$S" | grep -q 'Reviewer' && echo "$S" | grep -q 'Approver' && echo "$S" | grep -qi 'notariz' && echo "$S" | grep -qiE 'draft|not (yet )?(been )?published' && echo "$S" | grep -qF '(PRIVACY.md)' && test -f PRIVACY.md && echo TASK2-OK</automated>
  </verify>
  <done>
README.md is committed and prettier-clean (a real check). The inherited SignPath credit, links and
logo are gone. SignPath appears only inside "## Code signing policy", in present-progressive or
conditional form, and nothing thanks or credits it. The Tauri and Rust badges replace the Electron
and electron-builder badges. The policy section states: Windows unsigned, SignPath application in
progress with attribution added only on approval, what gets signed and what is bundled unsigned,
updater-key signing, macOS signed and notarized build verified on the v0.7.0 draft with nothing
published, Linux as measured, the roles table for the sole maintainer, and a PRIVACY.md link. A
Privacy section exists. Both new sections are in the Index. The out-of-scope residuals are listed
in the SUMMARY with line numbers.
  </done>
</task>

<task type="auto">
  <name>Task 3: Append the dated STATUS 2026-09-30 section to the Windows signing todo</name>
  <files>.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md</files>
  <action>
Insert a new section headed exactly "## STATUS 2026-09-30 (quick 260930-upo)" immediately ABOVE
the existing "## STATUS 2026-09-24 (quick 260924-pm3)" line, with one blank line on each side. The
file runs newest first and never rewrites earlier sections. This must be a pure insertion: change
no existing line, including the frontmatter. `needs: signpath-foundation-application-then-verify`
and `ready: human` are both still accurate, because the application has not been submitted and
what remains needs the operator. Leave them, and severity/platform/status, byte-unchanged. The
CI gate reads severity/platform/ready.

Match the file's existing prose style: hard-wrapped near 100 columns, bold lead-ins, backticked
paths, `file:line` citations. Content:

1. An opening line in the file's own convention: this section does not revise anything below it.
2. The 2026-09-30 read-only eligibility check against https://signpath.org/terms found three
   blockers.
   - (a) The only GameLib release, v0.7.0, is a Draft; nothing is published. Re-measure with
     `gh release list -R grayson-mitchell/GameLib` and quote the row.
   - (b) No code signing policy was published.
   - (c) No privacy policy existed.
   The same check found a false claim: README.md carried a SignPath credit inherited from Heroic
   whose links bore Heroic's campaign tag, although GameLib has no SignPath relationship.
3. What this task closed, naming the short SHAs of Task 1's and Task 2's commits, each in
   backticks as the file already writes SHAs (get them with `git log --format='%h %s' -3`):
   - (b) is closed by README.md's "## Code signing policy" section.
   - (c) is closed by PRIVACY.md.
   - The false credit is removed in the README commit.
   State the privacy choice and why. The policy links PRIVACY.md instead of using SignPath's
   no-transfer boilerplate, because GameLib makes network requests without explicit per-request
   user action. List the confirmed kinds briefly, taken from Task 1's census in the SUMMARY.
4. What the policy deliberately does NOT contain yet: SignPath Foundation's attribution sentence.
   On approval, copy it verbatim from https://signpath.org/terms as it reads then. Do not
   paraphrase it and do not copy it from memory.
5. Remaining operator steps, numbered:
   1. Publish a real, non-Draft release, either the v0.7.0 draft or a new tag. SignPath requires
      the project to be already released. The release notes must carry a link titled "Code signing
      policy" pointing at the README section, because the terms require the policy on the
      download/release pages as well as the home page.
   2. Confirm MFA on GitHub for every team member (sole maintainer), and on SignPath once the
      account exists. The terms require MFA on both. It could not be measured from here: the
      `gh api user` `two_factor_authentication` field is null for this token.
   3. Submit the application at https://signpath.org/apply.
   4. On approval, add the attribution (item 4), then do Direction step 2 (the Finding 4
      build, sign, re-sign, upload ordering) BEFORE wiring any credentials.
6. One open question, recorded without asserting an answer. The terms bar signing modified
   upstream versions unless upstream publishes signed builds and the project is a visible fork.
   GameLib is a derivative of Heroic Games Launcher (README.md line 3, `UPSTREAM.md`). Whether
   SignPath's reviewers treat it as its own project or as a modified upstream is for the
   application to settle.
7. README residuals a SignPath reviewer will read, which this task deliberately did not fix: the
   four items from Task 2 step 6, with their re-measured line numbers.
8. A pointer correction: the macOS signing todo is at
   `.planning/todos/completed/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`. The
   README's macOS statement rests on its STATUS 2026-09-23 and 2026-09-24 sections: signed and
   notarized build verified on the v0.7.0 draft, nothing published.

This file is under `.planning/`, which prettier ignores, so `prettier --check` on it would be
vacuous. It is omitted from the verify by design (CLAUDE.md formatter rule). Consistency comes from
hand-matching the surrounding sections. Commit only the todo:
`docs(quick-260930-upo): record SignPath eligibility blockers closed and remaining operator steps`,
ending with the session's Co-Authored-By trailer. Then run `pnpm planning-gates`.
  </action>
  <verify>
    <automated>F=.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md && N=$(grep -n '^## STATUS 2026-09-30 (quick 260930-upo)$' "$F" | cut -d: -f1) && O=$(grep -n '^## STATUS 2026-09-24 (quick 260924-pm3)$' "$F" | cut -d: -f1) && test -n "$N" && test -n "$O" && test "$N" -lt "$O" && NS=$(git diff --numstat f32ad5aaa -- "$F") && test -n "$NS" && test "$(echo "$NS" | awk '{print $2}')" -eq 0 && test "$(echo "$NS" | awk '{print $1}')" -gt 0 && sed -n '1,15p' "$F" | grep -qx 'severity: major' && sed -n '1,15p' "$F" | grep -qx 'platform: windows' && sed -n '1,15p' "$F" | grep -qx 'ready: human' && sed -n '1,15p' "$F" | grep -qx 'needs: signpath-foundation-application-then-verify' && SEC=$(awk '/^## STATUS 2026-09-30/{f=1;next} /^## /{f=0} f' "$F") && echo "$SEC" | grep -q 'PRIVACY.md' && echo "$SEC" | grep -q 'Code signing policy' && echo "$SEC" | grep -q 'signpath.org/apply' && SHAS=$(echo "$SEC" | grep -oE '`[0-9a-f]{7,12}`' | tr -d '`' | sort -u) && C=0 && for s in $SHAS; do if git cat-file -e "$s^{commit}" 2>/dev/null; then C=$((C+1)); fi; done && test "$C" -ge 2 && pnpm planning-gates && echo TASK3-OK</automated>
  </verify>
  <done>
The todo carries "## STATUS 2026-09-30 (quick 260930-upo)" directly above the 2026-09-24 section.
The diff against f32ad5aaa is insertion only (0 deleted lines). Frontmatter severity, platform,
ready and needs are unchanged. The section names at least two resolvable commit SHAs (the
PRIVACY.md and README commits) and records:
- the three blockers and the false credit
- what closed (b) and (c)
- the attribution deferred to approval
- the four remaining operator steps
- the modified-upstream open question
- the README residuals
- the macOS pointer correction

`pnpm planning-gates` exits 0. No prettier check runs: the path is ignored, and that is stated.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo docs -> public readers and SignPath reviewers | README.md and PRIVACY.md are published claims that users and a certificate authority's reviewers will rely on |
| source census -> executor transcript | the census reads source only; no binary runs and no real profile is read |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260930-upo-01 | Spoofing | README.md SignPath credit | high | mitigate | Task 2 removes the credit, links and logo. The region-scoped awk gate proves every SignPath mention sits inside "## Code signing policy". A second gate forbids thanks/credit wording on any SignPath line, and a third forbids the attribution sentence before approval |
| T-260930-upo-02 | Information Disclosure | PRIVACY.md understating data flows | high | mitigate | Task 1 runs a four-way-classified host census, telemetry grep and credential-store trace. Every sentence must trace to a census row recorded in the SUMMARY, unconfirmed items go to a Limits section, and the updater URL is gated byte-identical to tauri.conf.json |
| T-260930-upo-03 | Repudiation | macOS / 2FA claims in README | medium | mitigate | macOS wording is pinned to the measured draft-only state and gated for draft/not-published language. 2FA is explicitly not asserted because `gh api user` returns null |
| T-260930-upo-04 | Information Disclosure | census capturing real session data | medium | mitigate | Task 1 forbids launching the app or sidecar. The census is grep/graphify over source only, so the two-profile rule is never engaged and no real-profile token can land in a capture |
| T-260930-upo-05 | Tampering | todo history and CI frontmatter gate | medium | mitigate | Task 3 gates a pure insertion (numstat deleted = 0 against f32ad5aaa), asserts the four frontmatter values unchanged, and runs `pnpm planning-gates` |
| T-260930-upo-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed by this plan. The only network actions are a WebFetch of signpath.org/terms and two HTTP status probes of simple-icons SVGs on jsdelivr, which install nothing |
</threat_model>

<verification>
After all three commits, from the repo root:
- `npx prettier --file-info README.md` and `npx prettier --file-info PRIVACY.md` each match
  `grep -Eq '"ignored":[[:space:]]*false'`. Then `npx prettier --check README.md PRIVACY.md`
  passes. The todo is under the prettier-ignored `.planning` tree, so no check runs on it, by
  design.
- `grep -c 'heroicgameslauncher' README.md` is 0. No line outside "## Code signing policy"
  mentions SignPath, and no SignPath line thanks or credits it.
- `pnpm planning-gates` exits 0.
- `git log --oneline -3` shows exactly the three task commits. Each touched only its one file:
  `git show --stat` per commit.
</verification>

<success_criteria>
- SignPath blockers (b) and (c) are closed by committed, prettier-clean README.md and PRIVACY.md
  content. (a) and the MFA and submission steps are recorded as operator steps.
- README.md contains no false SignPath claim and no stale Electron-era badges.
- Every PRIVACY.md statement is backed by the census recorded in 260930-upo-SUMMARY.md, and what
  could not be confirmed is stated as a limit.
- The todo's new section is insertion-only, sits above STATUS 2026-09-24, and the CI planning
  gates are green.
</success_criteria>

<output>
Create `.planning/quick/260930-upo-signpath-application-prep-remove-false-s/260930-upo-SUMMARY.md`
when done. Include:
- the privacy census: commands plus the (A)/(B)/(C)/(D) classification table
- the simple-icons slug probe results
- any SignPath-terms drift found on re-read
- the Task 2 out-of-scope README residuals with line numbers
- the three commit SHAs
</output>
