# Phase 91: Epic (legendary) runner - Context

**Gathered:** 2026-11-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Epic sign-in and sign-out, the library, install, update, repair, move, import and uninstall,
launch, and the EOS overlay run from Rust over the bundled `legendary` binary, and the legendary
TypeScript is deleted (STO-01). That covers `src/backend/storeManagers/legendary/` (about 4.1k
lines: `games.ts` 1.2k, `library.ts` 1.0k, `user.ts` 760, `eos_overlay/` 330, `setup.ts`,
`thirdParty.ts`, `launchFailure.ts`, `legendaryRuntime.ts`, `stores.ts`, `constants.ts`,
`commands/`), its sidecar registrations (`eosOverlayFlowRegistration`, the legendary arms of
`installFlowRegistration`, `enrichmentFlowRegistration`, `oauthLoginFlowRegistration`,
`appShellFlowRegistration`, `handlers.ts`, `installedJsonWatcher.ts`), legendary's arm of the 88
`ManagerHooks` channel, and the state rows `82-STATE-OWNERSHIP.md` flips in 91: the
`legendaryConfigStore`, `legendary_library`, `legendary_install_info`, `legendary_games_override`
and `legendary_gameinfo` mirrors, and the in-memory `legendary-runtime` and
`installed-json-watcher` owners. `legendary-installed-json` stays owned by the legendary binary.

Out of scope: GOG, Amazon and sideload (92), and the rest of the `ManagerHooks` channel, which 92
deletes. The TS download manager stays until 93 and reaches the Rust legendary install and update
through shims (D-12). The Epic protocol itself is not reimplemented (REQUIREMENTS Out of Scope).
Making the EOS overlay work in-game on macOS is a new capability (D-07).

</domain>

<decisions>
## Implementation Decisions

### Real transcript capture (SC3)
- **D-01:** **Claude captures the read-only transcripts by running the bundled legendary against
  a scratch copy of the operator's signed-in `legendaryConfig`.** Read-only means `list`, `info`,
  `status`, `launch --dry-run`, `install --info`/size queries and `eos-overlay info`. The operator's
  real `~/Library/Application Support/gamelib/legendaryConfig` is never written: the copy lives in
  the scratchpad and is passed through legendary's config-path env, so token refreshes land in the
  copy.
- **D-02:** **Claude also captures the commands that change state, into a scratch install
  folder.** That is install and uninstall of a small title (with its download progress lines),
  repair/verify, update, move and import. The operator picks the title. Update is captured live
  only if a title has a pending update at capture time; otherwise it is synthesized from the
  install progress format and labelled synthetic. The operator's real config and `installed.json`
  are never written.
- **D-03:** **Real transcripts are committed, redacted** (94 D-05 precedent). The account ID,
  display name, tokens, emails and home paths are scrubbed before commit, and a test fails if any
  known identifier from the capture machine shows up in a committed fixture. Each fixture records
  the legendary version it came from.
- **D-04:** **Failure transcripts are real where that is safe, and otherwise synthetic and
  labelled.** Network-down is captured live: the network is off only for the command (off, run,
  on, then report back). An expired or invalid login uses a scratch config copy with the token
  corrupted. Anything else (for example the launch login-failure marker that `launchFailure.ts`
  classifies) is built from the TS tests and markers and marked `synthetic` in the fixture
  metadata.
- **D-05:** **Windows and Linux transcripts are the Mac captures with the paths rewritten.**
  legendary logs through Python's logging on every OS, so the parsers replay the Mac captures with
  Windows and Linux paths substituted. Real Windows and Linux legendary output is checked in Phase
  99. Research confirms which lines, if any, differ by OS (for example the Windows-only overlay
  registry lines).

### EOS overlay (SC2)
- **D-06:** **SC2 is proven by the Mac lifecycle plus goldens, and the in-game overlay check moves
  to Phase 99.** Live on macOS: install, update check and remove of the overlay from Store
  Settings. Goldens: per-game enable and disable on Windows (registry) and Linux (Wine prefix), and
  the launch argv and env with the overlay on. **Amend ROADMAP SC2** to say so (done in this
  discussion's commit, the same shape as 88 D-16).
- **D-07:** **The in-game EOS overlay on macOS stays out of scope.** The Linux-only prefix lookup
  (`getWinePrefixFolder` returns null outside Linux) and the Windows-only per-game toggle are
  ported as they are. A pending todo records the macOS in-game overlay as a possible future
  capability (`2026-11-27-eos-overlay-in-game-on-macos-wine-prefixes.md`).

### Live gate
- **D-08:** **91 has its own operator gate: a signed 91 build installed over the signed 88.3
  build.** It is written as `91-HUMAN-UAT.md` before 91's coding, in the UAT item shape
  (gamelib-conventions), and any offline step follows the offline-UAT memory. Items:
  1. **Upgrade survival.** The 88.3 → 91 upgrade keeps the Epic sign-in (no Keychain prompt), the
     library, installed games and per-game settings. A `kill -9` of GameLib mid-install followed
     by reopening shows the game incomplete and resumable.
  2. **Install → launch → uninstall.** Install a small Epic title through the download queue,
     launch it (playtime recorded, game output in the per-game log through the 88 D-29 capture),
     then uninstall it: the files are gone and the entry returns to not installed. Two launches
     are covered: one native macOS Epic title and one Windows Epic title on CrossOver, both chosen
     by the operator.
  3. **Update, repair, move, import.** An update clears its badge and the badge stays cleared
     after a restart, repair finishes, a moved game still launches from its new folder, and import
     adopts an existing install folder.
  4. **Sign-out/in and the EOS lifecycle.** Sign out, then open the Epic login: it asks for
     credentials again (it does not sign in by itself), and the logged cookie census shows no Epic
     session cookies left. Sign in again and the library loads. Install the EOS overlay, run its
     update check and remove it from Store Settings (D-06).
- **D-09:** **One phase. The planner may propose a split.** Plan 91 as one phase. If the plan
  count goes over the planning context budget, the planner proposes a split at plan time for the
  user's approval (88 D-30 shape). A split shares this CONTEXT, and the gate stays at the end of the
  last sub-phase.

### Sign-in and sign-out
- **D-10:** **The sign-out wipe is ported as the exact sequence and pinned by a golden.** Rust
  runs `legendary auth --delete` and then the same wipe steps in the same order as `user.ts`
  `logout()`. That is `clearEpicStorage` first (a load of the real Epic login origin), then
  `clearEpicCookies` with its per-host cookie census and verdicts (on macOS through the no-window
  label, elsewhere through a hidden window), then the credential cleanup (`userInfo` delete and
  `clearCache('legendary')`), which a failed wipe step never skips. Per-step logging stays the same. A golden records the call sequence and the log lines. The
  `epicCookieCensus`, `epicLogoutDomains`, `expiryProbe` and `user` tests port as Rust tests.
  `.planning/debug/resolved/epic-cookie-clear-read-divergence.md` explains why the order matters:
  nothing opens a window at the Epic login URL after the sweep. Any simplification is filed as a
  todo, never mixed into the port (D-15).
- **D-11:** **Sign-in keeps its behaviour.** `legendary auth --code` with the same
  `ERROR: Logging in` stderr check, the `expired` flag cleared on success, and
  `noteSignInSucceeded('legendary')`. User info is read from legendary's own `user.json` as today.
  The live proof is gate item 4 (D-08).

### Download manager seam
- **D-12:** **The TS download manager reaches the Rust legendary install and update through typed
  shims until 93** (90 D-06 shape). Each shim is a schedule-test row with deleting phase 93. Every
  other legendary channel becomes a native Rust handler, with no sidecar fallback, the zod entry
  deleted and the IPC snapshot regenerated (83 D-04/D-06/D-07).

### Carried forward (already decided, not re-asked)
- **D-13:** Goldens are recorded from the TS before porting, in the 88 D-11 shape with the Phase 82
  D-05 vacuous-pass guards. Runner-command goldens record argv, env, the redacted log line and the
  streamed line sequence (88 D-14). The TS is deleted once its goldens pass. There is no flag, and a
  failure is fixed in Rust, never by bringing the TS back (87 D-06, 88 D-18).
- **D-14:** Event names and payloads stay the same, so the renderer is untouched (86 D-08, 88
  D-23).
- **D-15:** Quirks are copied for parity and each one is filed as a todo with the three triage
  keys. A golden diff never mixes a port with a fix (86 D-03, 88 D-20). The two folded status-check
  todos are the only deliberate changes in 91, and each is recorded in `deltas.json` (see Folded
  Todos).
- **D-16:** The launch funnel is already Rust (88.3). In 91, legendary's `launch()`, `syncSaves`,
  `forceUninstall`, `getSettings` and the settings write-back stop going through the TS
  `ManagerHooks` channel and become Rust implementations of the trait. The channel itself stays for
  gog, nile and sideload until 92 (88 D-26).
- **D-17:** Every spawn goes through `gamelib-proc`. Games are `SpawnClass::Game`. Legendary runner
  commands (auth, list, install, repair, move, import, uninstall, eos-overlay) are
  `SpawnClass::Helper` through the 88.2 runner, which already owns abort, redaction and the
  Windows Game Job kill. In-flight work (installs, the `installed.json` watcher) holds a Shutdown
  Registrant, exit work fits `ExitBudget::DEFAULT`, and boot work is bounded. Load
  `Skill("gamelib-conventions")` before planning.
- **D-18:** Two-profile rule: the TS golden harness is isolated with `createFakeHomeProfile()`. The
  D-01/D-02 captures are a named real-profile arm (a scratch copy of the operator's
  `legendaryConfig`), justified by SC3.
- **D-19:** macOS is the live platform. Windows and Linux are proven by golden replay on the
  three-OS CI matrix, and real-title checks (including the in-game EOS overlay, D-06) move to Phase
  99 (88 D-16).
- **D-20:** v0.11 rules: the gate is written before coding, and the phase's last plan leaves no TS
  or registration for the modules it ported, except the D-12 shims and the `ManagerHooks` channel
  that 92 deletes.

### Claude's Discretion
- The crate layout: a `gamelib-legendary` (+cli) crate as the `82-STATE-OWNERSHIP.md`
  "legendary crate" rows name it, depending on `gamelib-launch`, `gamelib-proc` and
  `gamelib-store` and never the reverse.
- The parser design (line-oriented state machine or regex table), the fixture format and the
  redaction tooling.
- How the Rust sign-out reaches the login-window cookie and storage ops: in-process calls in place
  of the TS `loginWindowSeam`, which stays for its gog, nile and Humble users until their phases.
- Whether library and `installed.json` reads parse legendary's on-disk JSON directly or go through
  `legendary list --json`, as long as the goldens match.
- The plan and wave breakdown, and the order of sub-slices (research suggests parsers first).

### Folded Todos
- **`2026-11-25-epic-status-check-only-treats-the-literal-major-as-offline`** (severity medium). The
  Rust status check (`gamelib-launch` `prepare/epic.rs`, ported in 88.1) counts only the literal
  `"major"` as offline, but Statuspage reports `major_outage`. In 91, decide and implement the
  rule (`major_outage`, and whether `partial_outage` counts) against a recorded live
  `components.json` response, and update the `epic_status` golden with a `deltas.json` entry.
  Close the todo when it lands.
- **`2026-11-25-epic-status-check-notifies-offline-when-the-component-is-missing`** (severity
  minor). An absent component triggers an "offline" notice, but the launch then goes ahead online.
  In 91, decide whether an absent component warns, and with what wording, in one deliberate change
  recorded in `deltas.json`. Close the todo when it lands.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/ROADMAP.md` § "Phase 91" (SC2 amended per D-06)
- `.planning/REQUIREMENTS-v0.11.md`: STO-01, and Out of Scope (no protocol reimplementation)
- `.planning/research/v0.11/SUMMARY.md`: item "91-92. Runners" (parsers first with real captured transcripts; Windows process-tree kill and quoting), open question 3
- `.planning/research/v0.11/PITFALLS.md`: the stale-snapshot write-back list and the concurrency model

### Ownership and prior contracts
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`: the 91 rows (`legendaryConfigStore`, `legendary_library`, `legendary_install_info`, `legendary_games_override`, `legendary_gameinfo`, `legendary-runtime`, `installed-json-watcher`, `legendary-installed-json` as ext), the `umu` shim row deleted by 91/92, and R5 (the Epic offline gate)
- `.planning/phases/88-launch-pipeline/88-CONTEXT.md`: D-01/D-02 (managers call Rust, the streaming runner shim), D-11/D-14 (golden shape, runner-command goldens), D-16 (live macOS, CI elsewhere), D-26 (`ManagerHooks`), D-29 (game output capture)
- `.planning/phases/90-steam-services-and-typescript-depot-path/90-CONTEXT.md`: D-06 (native channels; the download manager calls shims until 93), D-12 (gate shape)
- `.planning/phases/94-humble-bundle-and-shortcuts/94-CONTEXT.md`: D-05 (one real capture, redacted before commit)
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-CONTEXT.md`: D-06 (the legendary migration was deleted, not ported), StoreHost, no new Keychain prompt
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-CONTEXT.md`: router, no fallback, schema authority

### Sign-out incident history
- `.planning/debug/resolved/epic-cookie-clear-read-divergence.md`: why the wipe order matters (D-10)
- `src/backend/storeManagers/legendary/user.ts` header comments: `EPIC_LOGIN_ORIGIN` and the no-window label rationale

### Patterns to copy
- `src/backend/__tests__/engineWineShimSchedule.test.ts`, `humbleShortcutsShimSchedule.test.ts`, `storeMirrorSchedule.test.ts`, `*PortComplete.test.ts`: schedule rows and delete gates
- `src-tauri/crates/gamelib-launch/tests/fixtures/golden/` (`runner`, `redaction`, `error_handler`, `epic_status`): golden layout and `deltas.json`
- `src-tauri/crates/README.md`: per-domain crate recipe, §7 verification and deletion, §8 CI
- `CLAUDE.md` Conventions table + `Skill("gamelib-conventions")`; `Skill("spike-findings-gamelib")` for the login-webview and cookie surface

</canonical_refs>

<code_context>
## Existing Code Insights

### TS that is deleted
- `src/backend/storeManagers/legendary/`: `games.ts` (install, update, repair, move, import, uninstall, `installUbisoft`, `syncSaves`, `launch`, `forceUninstall`, `stop`, `isGameAvailable`), `library.ts` (init, refresh, `refreshInstalled`, `getInstallInfo`, `listUpdateableGames`, `changeGameInstallPath`, `getGameOverride`, `getGameSdl`, `toggleGamesSync` (EGL sync), `getLaunchOptions`, `changeVersionPinnedStatus`, `applyLegendaryMacArch`), `user.ts`, `eos_overlay/eos_overlay.ts`, `setup.ts`, `thirdParty.ts`, `launchFailure.ts`, `legendaryRuntime.ts`, `stores.ts`, `constants.ts`, `commands/`
- Sidecar: `eosOverlayFlowRegistration.ts`, `installedJsonWatcher.ts`, the legendary arms of `installFlowRegistration`, `enrichmentFlowRegistration`, `oauthLoginFlowRegistration`, `appShellFlowRegistration`, `handlers.ts` and `bootstrap.ts`. `devEpicCookieSweepRegistration` is research open question 9 (98); flag it if 91 makes it unreachable.
- Tests: `storeManagers/legendary/__tests__/*` and `src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts` port as Rust tests (behavioural) or are dropped (source-text gates, 87 D-08).

### Rust already in place
- `gamelib-launch`: the 88.x funnel, builders, runner (abort, redaction, `errorHandler`), Epic status check (`prepare/epic.rs`), and `ManagerHooks`
- `gamelib-proc`: Game/Helper spawns, the Windows Game Job and `kill_game_tree` (88.2-06), which answer the research flag's "Windows process-tree kill"
- `gamelib-store` (StoreHost) for the legendary mirrors; the Tauri login webview and cookie/storage ops in `src-tauri/src/main.rs` (`humble_login_clear_cookies`, `clear_default_data_store_cookies_for_domain`)

### Integration points
- Renderer Epic channels go native (D-12); the TS download manager calls install and update shims until 93
- The renderer's EOS panels: `src/frontend/screens/Settings/sections/StoreSettings/EosOverlay.tsx` (the per-game toggle is Windows-gated) and `components/EosOverlaySetting.tsx`; their channels are unchanged (D-14)
- Frontend `loginRoutes.ts` `EPIC_LOGIN_URL` and the OAuth login capture feed `legendary auth --code`

</code_context>

<specifics>
## Specific Ideas

- Capture title: a small free Epic game the operator owns, small enough to download and update
  quickly. The operator picks it.
- Gate launches: one native macOS Epic title and one Windows Epic title on CrossOver.
- Sign-out proof: a fresh login page plus the logged cookie census with no Epic session cookies.
- Network-down captures and any offline step: the network is off only for the action.

</specifics>

<deferred>
## Deferred Ideas

- The in-game EOS overlay on macOS (CrossOver/Wine prefixes): a new capability. Todo
  `2026-11-27-eos-overlay-in-game-on-macos-wine-prefixes.md` (D-07).
- The in-game EOS overlay check and real Windows/Linux legendary output → Phase 99 (D-05, D-06).
- Simplifying the sign-out wipe → a todo if research sees a simplification (D-10).
- Install and update shims → deleted in 93 (D-12). `ManagerHooks` channel → deleted in 92.

### Reviewed Todos (not folded)
`todo.match-phase 91` matched 68 pending todos, nearly all on generic keywords. Reviewed and left:
`2026-11-27-call-runner-trims-each-chunk-…`, `2026-11-27-error-handler-legendary-modal-html-escapes-…`
and `2026-11-27-redaction-only-redacts-the-first-occurrence-…` (88.2 runner quirks recorded by its
goldens and owned there), `2026-11-25-is-mac-sonoma-or-higher-…` (launch engine default, not Epic),
`2026-11-24-library-install-state-disagrees-with-disk-racine-bloody-hell` (GOG, Phase 92),
`2026-11-27-auth-log-sanitizers-leave-nested-tokens-…` (gog and nile, Phase 92),
`2026-11-25-gog-dummy-install-…` (92), and the CrossOver trial, bottled one-second exit, 87 owed
live checks, bridge abort controller, unsigned Windows releases and blank packaged render todos (not
Epic).

</deferred>

---

*Phase: 91-epic-legendary-runner*
*Context gathered: 2026-11-27*
