# Phase 92: GOG runner (and 92.1: Amazon and sideloaded runners) - Context

**Gathered:** 2026-11-27
**Status:** Ready for planning

<domain>
## Phase Boundary

The ROADMAP's single Phase 92 ("GOG, Amazon and sideloaded runners") is **split in this discussion
into 92 and 92.1** (D-01). This CONTEXT governs both. ROADMAP.md and the REQUIREMENTS traceability
were amended in this discussion's commit.

**Phase 92 (STO-02):** GOG sign-in and sign-out, the library, install, update, repair, move, import
and uninstall, launch (with comet and GOG presence), cloud saves and the Windows elevation path run
from Rust over the bundled `gogdl` and `comet` binaries, and the GOG TypeScript is deleted. That
covers `src/backend/storeManagers/gog/` (about 5.4k lines: `library.ts` 1.8k, `games.ts` 1.7k,
`setup.ts` 530, `user.ts` 435, `redist.ts`, `windowsElevation.ts`, `presence.ts`, `gogRuntime.ts`,
`stores.ts`, `resumeProgress.ts`, `constants.ts`), `src/backend/save_sync.ts`, the GOG arms of the
sidecar flow registrations, gog's arm of the 88 `ManagerHooks` channel, and the GOG state rows
`82-STATE-OWNERSHIP.md` flips in 92. It also removes the dead Discord presence toggle (SC2, D-08).

**Phase 92.1 (STO-03):** Amazon (nile: about 1.9k lines in `storeManagers/nile/`) and sideloaded
apps (about 0.5k lines in `storeManagers/sideload/`) run from Rust, `storeManagerCommon/` is
deleted, and the `ManagerHooks` channel itself is deleted once no manager is left on it (91 D-16).
92.1 ends with the one operator gate covering both sub-phases (D-02).

Out of scope: the download manager (93; it reaches the Rust GOG and nile install and update through
shims until then, D-12). The GOG, Amazon and comet protocols are not reimplemented (REQUIREMENTS Out
of Scope). The PyInstaller spawn tax is not fixed (REQUIREMENTS Out of Scope). Real Windows and
Linux gogdl/nile output and the live Windows UAC check move to Phase 99 (D-15).

</domain>

<decisions>
## Implementation Decisions

### Split and gate placement
- **D-01:** **Split now: 92 = GOG, 92.1 = Amazon + sideload + `storeManagerCommon` + the
  `ManagerHooks` deletion.** About 8.1k lines in total, twice 91. 92 carries `save_sync`, comet,
  GOG presence and the Windows elevation path; 92.1 carries nile, sideload, `storeManagerCommon` and
  the channel deletion, which can only land once gog, nile and sideload are all off it. Phase 93 now
  depends on 92.1. Both sub-phases share this CONTEXT; each gets its own RESEARCH and plans. The
  planner may still propose a further split at plan time if a sub-phase goes over the planning
  context budget (91 D-09 shape).
- **D-02:** **One operator gate at the end of 92.1, covering GOG, Amazon and sideload.** It is
  written as `92.1-HUMAN-UAT.md` **before 92's coding** (v0.11 rule: gates before coding), in the
  UAT item shape (`Skill("gamelib-conventions")`), on a signed 92.1 build installed over the
  previous signed build. 92 closes on goldens, three-OS CI and its delete gates, with no signed
  build of its own (the 88.1 shape). Offline steps follow the offline-UAT memory (network off only
  for the action). Items:
  1. **Upgrade survival.** The upgrade keeps the GOG and Amazon sign-ins (no Keychain prompt), both
     libraries, installed games, sideloaded apps and per-game settings. A `kill -9` of GameLib
     mid-GOG-install followed by reopening shows the game incomplete and resumable.
  2. **GOG install → launch → uninstall.** Install a small GOG title through the download queue,
     launch it (playtime recorded, game output in the per-game log through the 88 D-29 capture),
     then uninstall it. Two launches: one native macOS GOG title and one Windows GOG title on
     CrossOver, both chosen by the operator (D-07).
  3. **GOG update, repair, move, import.** An update clears its badge and the badge stays cleared
     after a restart, repair finishes, a moved game still launches from its new folder, and import
     adopts an existing install folder. The Racine and Bloody Hell install state is correct (folded
     todo, D-09).
  4. **GOG cloud-save round trip** (D-04).
  5. **GOG sign-out/in.** Sign out, then open the GOG login: it asks for credentials again. Sign in
     again and the library loads.
  6. **Amazon.** Sign in, the library loads, then install, launch (on CrossOver; Amazon titles are
     Windows-only) and uninstall an Amazon title the operator picks (D-06).
  7. **Sideload.** Add a sideloaded app, launch it, remove it.
  8. **Discord.** General Settings no longer shows a Discord presence toggle (D-08).

### Cloud saves (SC1)
- **D-03:** **The save-sync transcripts are captured live in both directions on a throwaway title.**
  Claude runs gogdl save-sync download and upload against a scratch local save folder for a GOG
  title whose cloud saves the operator does not care about (the operator picks it). Upload does
  write to the operator's real GOG cloud, for that title only, and is allowed. Conflict and
  timestamp-skew cases are built from the TS tests and gogdl's behaviour and are marked `synthetic`
  (91 D-04 shape).
- **D-04:** **The gate proves one round trip on one title.** Play a GOG title with cloud saves,
  quit (upload runs), delete the local save, launch again: the save comes back from the cloud. Also
  check the save path GameLib shows is correct. The Wine-prefix save-path resolution
  (`getDefaultGogSavePaths` under a bottle, the redirected Documents lookup) is proven by goldens
  only, not live.

### Transcript capture (carried from 91 D-01..D-05, applied to gogdl, comet and nile)
- **D-05:** **Claude captures the read-only and state-changing transcripts against scratch copies
  of the operator's signed-in GOG and Amazon credentials and a scratch install folder.** The
  operator's real `gog_store` / nile config, `installed.json` and library files are never written;
  token refreshes land in the copies. Fixtures are redacted before commit (account IDs, user
  names, tokens, emails, home paths), a test fails if a known identifier from the capture machine
  shows up in a committed fixture, and each fixture records the binary version it came from.
  Network-down is captured live with the network off only for the command. An expired login uses a
  copy with a corrupted token. Anything else is synthetic and labelled. Windows and Linux reuse the
  Mac captures with the paths rewritten. Research confirms which lines differ by OS, for example
  the Windows elevation and redist lines.
- **D-06:** **Amazon is captured and gated on a real title.** The operator has an Amazon account
  with installable games and picks the capture and gate title. It runs on CrossOver.

### Launch coverage
- **D-07:** **GOG launches in the gate: one native macOS GOG title and one Windows GOG title on
  CrossOver.** Comet (`experimentalFeatures.cometSupport`, the GalaxyCommunication dummy step) is
  proven by goldens, not a gate launch.

### Discord (SC2)
- **D-08:** **Remove the dead toggle; keep the key.** The Discord client is already gone
  (`launchAdapters.ts`: "without the Discord client, which is gone"), but
  `src/frontend/screens/Settings/components/DiscordRPC.tsx` still renders a working-looking
  "Enable Discord presence" toggle in General Settings. 92 deletes the component, its export, its
  `GeneralSettings` use, its i18n strings and the `discordRPC` entry in the settings schema / IPC
  snapshot. An existing `discordRPC` value in a user's `config.json` is **kept as an unknown key**
  (FND-06), with no migration. A gate test fails if a Discord client dependency or the toggle comes
  back. The phase records the operator decision of 2026-11-17 (REQUIREMENTS Out of Scope) as the
  reason. GOG's own online presence (`presence.ts`, `disableGOGPresence`) is a different feature
  and is ported as it is.

### Folded Todos
Each folded todo is one deliberate change recorded in the relevant golden's `deltas.json`, never
mixed into a parity diff (D-13). The golden is recorded from the TS first, then the change lands as
its own commit. Each todo is closed when its change lands.
- **D-09:** `2026-11-24-library-install-state-disagrees-with-disk-racine-bloody-hell` (medium,
  live-gate; 92). `gog_library.json` says Racine is not installed while `gog_store/installed.json`
  and the disk say installed, and Bloody Hell's path is broken. Research finds the cause. The Rust
  GOG library reconciles install state against `installed.json` and the disk. Live proof is gate
  item 3.
- **D-10:** `2026-11-27-auth-log-sanitizers-leave-nested-tokens-and-add-absent-keys` (minor; gog in
  92, nile in 92.1). The Rust sanitizers redact token keys at any depth and add no keys a line
  never carried. Update the 88.2 `redaction` golden with a `deltas.json` entry. This is
  security-relevant: a nested token currently reaches the log.
- **D-11:** The GOG refresh races (minor; 92):
  `2026-11-25-gog-double-refresh-on-reconnect` (two back-to-back library refreshes when the
  connection returns) and `2026-11-25-version-change-clear-races-startup-gog-refresh` (the
  version-change cache clear empties `gog_api_info.json` under the startup refresh). The Rust GOG
  library refresh is single-flight, and the version-change clear is ordered before or serialized
  with the startup refresh. See `.planning/debug/resolved/gog-offline-empties-cache.md`.
- **D-12a:** The small runner and sideload quirks (minor):
  `2026-11-27-call-runner-finds-the-nile-app-name-before-dropping-empty-arguments` (92.1: derive
  the nile app name after empty arguments are dropped; 88.2 `runner` golden delta),
  `2026-11-25-gog-dummy-install-copies-to-an-empty-path-when-winepath-answers-nothing` (92: the
  GalaxyCommunication dummy step stops with a logged error when `winepath` answers empty; 88.1
  `prepare_wine` golden delta), and
  `2026-11-25-known-fix-readers-read-undefined-store-file-for-sideload` (92.1: the known-fix readers
  do not look up `<id>-undefined.json` for sideload; the 88 known-fix golden delta).

### Download manager seam
- **D-12:** **The TS download manager reaches the Rust GOG (92) and nile (92.1) install and update
  through typed shims until 93** (90 D-06, 91 D-12 shape). Each shim is a schedule-test row whose
  deleting phase is 93. Every other GOG, nile and sideload channel becomes a native Rust handler
  with no sidecar fallback; the zod entry is deleted and the IPC snapshot regenerated (83
  D-04/D-06/D-07).

### Carried forward (already decided, not re-asked)
- **D-13:** Goldens are recorded from the TS before porting (88 D-11 shape, Phase 82 D-05
  vacuous-pass guards). Runner-command goldens record argv, env, the redacted log line and the
  streamed line sequence (88 D-14). The TS is deleted once its goldens pass, with no flag; a
  failure is fixed in Rust, never by bringing the TS back (87 D-06, 88 D-18). Quirks not folded
  above are copied for parity and each one is filed as a todo with the three triage keys (86 D-03,
  88 D-20).
- **D-14:** Event names and payloads stay the same, so the renderer is untouched apart from D-08
  (86 D-08, 88 D-23).
- **D-15:** macOS is the live platform. Windows and Linux are proven by golden replay on the
  three-OS CI matrix. Real Windows/Linux gogdl and nile output, and the live UAC check
  (`2026-11-20-gog-windows-elevation-live-check`), move to Phase 99 (88 D-16, 91 D-19).
- **D-16:** The launch funnel is already Rust (88.3). gog's (92), nile's and sideload's (92.1)
  `launch()`, `syncSaves`, `forceUninstall`, `getSettings` and the settings write-back become Rust
  implementations of the trait, and 92.1 deletes the `ManagerHooks` channel (88 D-26, 91 D-16).
- **D-17:** Every spawn goes through `gamelib-proc`. Games are `SpawnClass::Game`. gogdl, comet and
  nile runner commands are `SpawnClass::Helper` through the 88.2 runner, which already owns abort,
  redaction and the Windows Game Job kill (`kill_game_tree`, 88.2-06), the answer to the research
  flag's "Windows kill". Comet runs beside the game: research decides whether it is a Helper tied
  to the game session or a Game, and it must not outlive the game. In-flight work holds a Shutdown
  Registrant, exit work fits `ExitBudget::DEFAULT`, and boot work (the startup GOG refresh, D-11)
  is bounded. Load `Skill("gamelib-conventions")` before planning.
- **D-18:** Two-profile rule: the TS golden harness is isolated with `createFakeHomeProfile()`. The
  D-03/D-05 captures are a named real-profile arm (scratch copies of the operator's GOG and Amazon
  credentials), justified by SC1 and the parsers.
- **D-19:** v0.11 rules: the gate is written before coding (D-02), and each sub-phase's last plan
  leaves no TS or registration for the modules it ported, except the D-12 shims (and, at the end of
  92, the `ManagerHooks` channel that 92.1 deletes).

### Claude's Discretion
- The crate layout: `gamelib-gog` and `gamelib-nile` (+cli) crates, or one runner crate per store
  as the `82-STATE-OWNERSHIP.md` rows name them, following the `gamelib-legendary` shape from 91;
  where sideload lives (small: possibly in `gamelib-launch` or its own crate). Dependencies point
  at `gamelib-launch`, `gamelib-proc` and `gamelib-store`, never the reverse.
- Where `save_sync`'s Rust lands (the GOG crate, or a shared save-path module that 91's legendary
  `syncSaves` also uses), as long as the legendary goldens stay green.
- The parser design, the fixture format and the redaction tooling (reuse 91's if it fits).
- How GOG sign-out reaches the login-window cookie and storage ops; the TS `loginWindowSeam` keeps
  only its Humble user after 92.1.
- The plan and wave breakdown inside each sub-phase (research suggests parsers first).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/ROADMAP.md` § "Phase 92: GOG runner" and § "Phase 92.1: Amazon and sideloaded runners" (both written in this discussion, D-01)
- `.planning/REQUIREMENTS-v0.11.md`: STO-02 (92), STO-03 (92.1), and Out of Scope (Discord presence dropped 2026-11-17; no protocol reimplementation; the PyInstaller spawn tax)
- `.planning/research/v0.11/SUMMARY.md`: item "91-92. Runners" and open question 1 (Discord presence: decided by D-08)
- `.planning/research/v0.11/PITFALLS.md`: the stale-snapshot write-back list and the concurrency model
- `.planning/debug/resolved/gogdl-spawn-tax.md`: why the spawn tax is out of scope

### Ownership and prior contracts
- `.planning/phases/91-epic-legendary-runner/91-CONTEXT.md`: the closest template: capture rules D-01..D-05, the gate shape D-08, the shim seam D-12, D-13..D-20
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`: the 92 rows (GOG and nile config stores and library mirrors, the in-memory gog/nile runtime owners, the `umu` shim row 91/92 deletes)
- `.planning/phases/88-launch-pipeline/88-CONTEXT.md`: D-01/D-02, D-11/D-14 (golden shape), D-16, D-26 (`ManagerHooks`), D-29 (game output capture)
- `.planning/phases/90-steam-services-and-typescript-depot-path/90-CONTEXT.md`: D-06 (native channels; download manager shims until 93)
- `.planning/phases/94-humble-bundle-and-shortcuts/94-CONTEXT.md`: D-05 (real captures redacted before commit)
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-CONTEXT.md`: StoreHost, unknown keys kept (FND-06), no new Keychain prompt
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-CONTEXT.md`: router, no fallback, schema authority

### Incident history behind folded todos
- `.planning/debug/resolved/gog-offline-empties-cache.md`: the refresh races (D-11)
- `.planning/todos/pending/2026-11-24-library-install-state-disagrees-with-disk-racine-bloody-hell.md` and the other six folded todo files (D-09..D-12a)

### Patterns to copy
- `src/backend/__tests__/engineWineShimSchedule.test.ts`, `humbleShortcutsShimSchedule.test.ts`, `storeMirrorSchedule.test.ts`, `*PortComplete.test.ts`: schedule rows and delete gates
- `src-tauri/crates/gamelib-launch/tests/fixtures/golden/` (`runner`, `redaction`, `prepare_wine`, `epic_status`): golden layout and `deltas.json`
- The `gamelib-legendary` crate and fixtures from 91, once they exist
- `src-tauri/crates/README.md`: per-domain crate recipe, §7 verification and deletion, §8 CI
- `CLAUDE.md` Conventions table + `Skill("gamelib-conventions")`; `Skill("spike-findings-gamelib")` for the login-webview and cookie surface

</canonical_refs>

<code_context>
## Existing Code Insights

### TS that is deleted
- **92:** `src/backend/storeManagers/gog/` (`games.ts`: `getExtraInfo`, `getAchievements`, `importGame`, `install`, `launch`, `moveInstall`, `repair`, `syncSaves`, `uninstall`, `update`, `forceUninstall`, `stop`, `isGameAvailable`, `updateGOGPlaytime`/`getGOGPlaytime`; `library.ts`; `user.ts`; `setup.ts`; `redist.ts`; `windowsElevation.ts`; `presence.ts`; `gogRuntime.ts`; `resumeProgress.ts`), `src/backend/save_sync.ts`, `getCometBin` and the gogdl rows of `src/backend/utils.ts`, the GOG arms of the sidecar flow registrations, and `src/frontend/screens/Settings/components/DiscordRPC.tsx` (D-08).
- **92.1:** `src/backend/storeManagers/nile/`, `src/backend/storeManagers/sideload/`, `src/backend/storeManagers/storeManagerCommon/` (`games.ts`, `umuGameId.ts`), the nile and sideload arms of the flow registrations, and the `ManagerHooks` channel.
- Tests under each `__tests__/` port as Rust tests (behavioural) or are dropped (source-text gates, 87 D-08).

### Rust already in place
- `gamelib-launch`: the 88.x funnel, builders (including the GOG dummy-install prepare step), the runner (abort, redaction with the gog/nile `authLogSanitizer`), and `ManagerHooks`
- `gamelib-proc`: Game/Helper spawns, the Windows Game Job and `kill_game_tree`
- `gamelib-store` (StoreHost) for the GOG and nile mirrors; the Tauri login webview and cookie/storage ops in `src-tauri/src/main.rs`
- `gamelib-legendary` (from 91): the closest crate to copy

### Integration points
- Renderer GOG, Amazon and sideload channels go native (D-12); the TS download manager calls the install and update shims until 93
- `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx` loses the `DiscordRPC` row (D-08)
- `experimentalFeatures.cometSupport` and `altCometBin` settings feed comet's launch (D-07, D-17)

</code_context>

<specifics>
## Specific Ideas

- Save-sync capture title: a GOG title with cloud saves the operator does not care about (D-03).
- Gate launches: one native macOS GOG title and one Windows GOG title on CrossOver. For Amazon, a
  real title on CrossOver. The operator picks all of them.
- The Discord removal records the decision itself, so "absent" can be traced to a decision rather
  than an accident.

</specifics>

<deferred>
## Deferred Ideas

- Real Windows/Linux gogdl and nile output, and the live GOG Windows UAC check → Phase 99 (D-15).
- Install and update shims → deleted in 93 (D-12).
- A comet launch in the live gate → not planned; goldens only (D-07).

### Reviewed Todos (not folded)
`todo.match-phase 92` matched 72 pending todos, nearly all on generic keywords. Reviewed and left:
`2026-11-20-gog-windows-elevation-live-check` (Windows live check, Phase 99),
`2026-11-25-offline-library-shows-no-cover-art` (renderer art caching, not a runner port),
`2026-11-25-wrapper-args-unbalanced-quote-throws-out-of-setup-wrappers` and the other 88.x runner
and launch quirks (owned by their recording phases), the 94 Humble and shortcut todos, and the
CrossOver trial, packaged blank render and unsigned Windows releases todos (not 92).

</deferred>

---

*Phase: 92-gog-amazon-and-sideloaded-runners (governs 92 and 92.1)*
*Context gathered: 2026-11-27*
