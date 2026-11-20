---
phase: quick-261117-pfj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 -- pins and censuses that moved with deliberate code changes, plus the one shell title fix
  - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
  - src/backend/sidecar/shellFilesFlowRegistration.ts
  - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/backend/__tests__/sidecarShutdownFlagSource.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src-tauri/src/store_embed/policy.rs
  # Task 2 -- real code fixes
  - src/backend/storeManagers/steam/gameUninstall.ts
  - src/backend/storeManagers/steam/steamInstallRuntime.ts
  - src/backend/storeManagers/steam/__tests__/pollsRustBranch.uninstallRunning.test.ts
  - src/backend/sidecar/steamPollEventRegistration.ts
  - src/backend/utils/boundedOutputCapture.ts
  - src/backend/signInProbe/classify.ts
  - src/backend/storeManagers/legendary/games.ts
  - src/backend/storeManagers/steam/bridge/shimCoverage.ts
  - meta/gen_vtables.ts
  - meta/__tests__/fixtures/callback_registry_harness.c
  - native/steam-bridge/generated/steam_api_shim.c
  # Task 3 -- i18n trio
  - public/locales/*/gamelib.json (48 non-en)
  - public/locales/*/gamelib.mt.json (48)
  - meta/i18nForkTouchedFiles.json
  - .planning/quick/261117-pfj-fix-13-red-test-ci-suites-outside-phase-/261117-pfj-i18n-fill.json
  - .planning/todos/pending/2026-11-16-full-suite-red-outside-debt-06.md
autonomous: true
requirements: [TODO-2026-11-16-full-suite-red-outside-debt-06]

must_haves:
  truths:
    - "All 13 suites named in the todo pass under jest, except moduleStateCensus's two directLaunch rows if quick 261117-p38 still owns those files (recorded hand-off, not a loosened gate)"
    - "No ceiling, floor or allowlist is widened to admit growth: every pin edit lowers to a measured count after a deliberate deletion, or raises only where a named deliberate feature commit added the sites, with the commit hash in the comment"
    - "The generated callback registry compiles on a non-Windows host again, and the Windows shim keeps InterlockedIncrement"
    - "The 14 new gamelib keys are translated in all 48 non-en catalogs and the orphan steam.bridge.route.missingSymbols is gone from all 48"
    - "The other in-progress task's files (games.ts, gameBridge*.ts, gameLaunchOverlay.ts, games.test.ts, everything under steam/directLaunch/, launchWithoutSteam.test.ts) are never staged or edited"
  artifacts:
    - path: "src/backend/utils/boundedOutputCapture.ts"
      provides: "store-neutral bounded output capture, so legendary/games.ts no longer imports signInProbe"
      exports: ["createBoundedOutputCapture", "BoundedOutputCapture"]
    - path: "meta/gen_vtables.ts"
      provides: "registry text that uses an embedder-supplied atomic increment macro instead of Win32 LONG/InterlockedIncrement"
      contains: "GL_CB_ATOMIC_INC"
    - path: ".planning/quick/261117-pfj-fix-13-red-test-ci-suites-outside-phase-/261117-pfj-i18n-fill.json"
      provides: "the 14 x 48 translation fill record"
  key_links:
    - from: "src/backend/storeManagers/steam/gameUninstall.ts"
      to: "SteamInstallRuntime.noticeSeq"
      via: "steamGame.deps.steamInstallRuntime"
      pattern: "steamInstallRuntime\\.noticeSeq"
    - from: "src-tauri/src/store_embed/policy.rs"
      to: "login_window_title"
      via: ".title(login_window_title(&origin, None))"
      pattern: "title\\(login_window_title\\("
---

<objective>
Close todo `2026-11-16-full-suite-red-outside-debt-06`: make each of the 13 red suites green by fixing the real cause, never by loosening a ceiling.

Re-measured at HEAD 053a72cc4 (planner run, 2026-11-17): all 13 still FAIL, 135 failing tests. Per-suite cause and verdict (deliberate change -> update the pin; regression -> fix the code):

| Suite | Current first failure | Cause | Verdict |
| --- | --- | --- | --- |
| flowRegistrationCensus | appShell send 13 (pin 14); shellFiles send 11 (pin 16); shellFiles docstring claims 19, actual 14 | 6254354b2 (quick 261115-tk8) deleted openWeblate/openSupportPage/openDiscordLink/openGithubSponsorsPage/openWikiLink/openReleases | deliberate -> lower pins + docstring |
| ipcDomainCensus | total 288, pin 294; floor 290 also fails | same 6 channels from ipc/appShell.ts (1) + ipc/shellFiles.ts (5) | deliberate -> lower pin to 288 and the measured-minus-6 floor to 282 |
| themeTokens | 34 is-text sites, pin 29 (GameSubMenu is-link 26, pin 21) | ac63566b2 (quick 261115-szs) added 5 menu entries for dots-menu parity | deliberate feature -> raise the census to the measured counts, with hash; the winning-rule/contrast tests in the same describe still cover them |
| sidecarShutdownFlagSource | `on_sidecar_eof(&state.shutting_down` not in sidecar.rs | a152a9caa (Phase 79 B/IN-02) routes EOF through `sidecar_eof_teardown(&state.shutting_down, ...)`, which calls `on_sidecar_eof` | deliberate refactor -> move the pin to the new call; keep D-01 (after drain, inside start_reader) and the non-vacuity tests |
| tauriShellSource (1/3) | `.title(format!("Sign in - {}", host))` in the store-embed link popup | d8682c350 added a remote OAuth popup with a composed literal title, breaking WR-07 | regression -> fix the Rust: `.title(login_window_title(&origin, None))` |
| tauriShellSource (2/3) | Gate 4: `?;` found in the repair fn region | the 261109-vdw split left repair_windows_gamelib_protocol_registration last in windows_protocol.rs; the local `fnRegion` helpers stop only at `\nfn ` / `\n#[cfg`, so the region runs into the next concatenated file | test helper bug -> bound the region with the existing `fnEndAfter` |
| tauriShellSource (3/3) | helper-scope gate flags meta/__tests__/gamelibSteamcmCli.test.ts | that test reads the gamelib-steamcm-cli CRATE's main.rs, not the shell's | false positive -> ALLOWED entry with that reason |
| moduleStateCensus | 4 unsanctioned sites | steamPollEventRegistration.ts:200 INSTALL_STATE_KINDS `new Set` and gameUninstall.ts:196 `let lastNoticeSeq` (Phase 80); directLaunchVerdict.ts:103 NOT_CACHED and machoSteamApi.ts:28 DYLIB_COMMANDS (quick 261117-p38, IN PROGRESS, machoSteamApi.ts is dirty) | regression -> remove the module state; the two directLaunch rows are p38's (see Task 2) |
| epicOfflineMode | Test 6c: legendary/games.ts matches /signInProbe/ | b57ac7e6f imports the generic `createBoundedOutputCapture` from backend/signInProbe/classify | coupling regression -> move the helper to a store-neutral module |
| shimCoverage | SteamAPI_SteamMatchmakingServers_v002 in steam_api.def, not in SHIM_EXPORTED_SYMBOLS | b8e5cb85e added the Facepunch alias to the generator/.def, not to the reviewed hand copy | stale copy -> add it |
| shimGenerate | 24-CR-02 `placed-miss` | same drift | follows the shimCoverage fix |
| callbackRegistryHost | `unknown type name 'LONG'` / `InterlockedIncrement` at gl_cb_registry.c:1174 | 01d78e5e3 put Win32 types into the portable registry text (`gl_stub_cr_seq`), breaking its embedder contract | regression, NOT platform-specific (fails on any non-Windows host; the harness defines no Win32 types anywhere) -> add an embedder macro |
| gamelibCatalogParity | `steam.bridge.route.missingSymbols` orphaned in 48 locales | 6ecc60d46 (quick 261113-8m6) removed it from en (replaced by notCoveredHeading) | delete the orphan from 48 catalogs + mt manifests |
| lintTranslations | 672 hard failures = 14 keys x 48 locales, plus R13 drift 672 | 14 en keys added since the last fill with no translation | translate (repo precedent 74-20, 261114-twk, 261105-*); recording them in the presence baseline would widen a ceiling and is NOT the fix |
| genI18nGateScope | committed i18nForkTouchedFiles.json has 6 entries the live derivation lacks | files deleted/reverted since the last regen | regenerate with `pnpm gen-i18n-gate-scope` |

Output: three commits (one per task), the todo closed (or narrowed to the p38 residual).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-11-16-full-suite-red-outside-debt-06.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/quick/261114-twk-reword-the-pre-launch-update-prompt-for-/261114-twk-PLAN.md

<repo_hygiene>
HARD RULES for the executor (worktrees are off; you run on main alongside another live task):
- Do NOT stage, edit or commit any of these (another task owns them): src/backend/storeManagers/steam/games.ts, gameBridgeLaunch.ts, gameBridgeLaunchGate.ts, gameBridgeWineLaunch.ts, gameLaunchOverlay.ts, steam/__tests__/games.test.ts, steam/__tests__/launchWithoutSteam.test.ts, anything under src/backend/storeManagers/steam/directLaunch/, and the dirty .planning/debug, .planning/spikes, .planning/todos/completed files, and "Schedule I Free Sample.dxvk-cache".
- Commit with `git add <explicit paths>` then `git commit`. Never `git add -A`, `git add .`, `git commit -a`, or `gsd-sdk query commit` (it sweeps every dirty .planning file). Before each commit, `git diff --cached --name-only` must list only this task's paths.
- Each commit message ends with the two attribution lines from the session (Co-Authored-By / Claude-Session).
- Prettier (convention 5): `--check` only the exact paths written. Already measured: public/locales/** is prettier-ignored (`--file-info` ignored:true); .rs, .c and .def files have no inferred parser, so they get no prettier check (say so in the SUMMARY). meta/i18nForkTouchedFiles.json is NOT ignored and must pass `--check`.
</repo_hygiene>

<interfaces>
From src/backend/storeManagers/steam/steamInstallRuntime.ts (current):
  export interface SteamInstallRuntime { appinfoOrder; sharedRedistLocks; depotJobs; updateStates: SteamUpdateStateCache; autoUpdateAttempts: Map<string, string> }
  export function createSteamInstallRuntime(transport: DepotTransport): SteamInstallRuntime   // returns an object literal
  ManagerDeps (src/backend/services/types.ts) carries `steamInstallRuntime: SteamInstallRuntime`; SteamGame has `readonly deps: ManagerDeps`.
  Hand-built partial literals exist in tests/updateDetection.ts (`steamInstallRuntime: { updateStates }`) -- they are Pick-typed or `as never`, so adding a field must not break them; confirm with codecheck.

From src/backend/storeManagers/steam/gameUninstall.ts:196-226:
  let lastNoticeSeq = 0                        // module state (the census row)
  export async function noticeSeq(steamGame: SteamGame): Promise<number>
    -- on success: lastNoticeSeq = max(lastNoticeSeq, seq); on failure: fallback = (last + floor(last) + 1) / 2; lastNoticeSeq = fallback
  Tests: steam/__tests__/pollsRustBranch.uninstallRunning.test.ts:88-102 call noticeSeq({ deps } as never) and rely on the counter carrying across two different deps objects (ok then failing).

From src/backend/signInProbe/classify.ts:
  export const SIGN_IN_PROBE_OUTPUT_CAP = 64_000          (line 63)
  export interface BoundedOutputCapture { ... }           (line 67)
  export function createBoundedOutputCapture(...)          (line 75; default cap = SIGN_IN_PROBE_OUTPUT_CAP)
  Importers: signInProbe/runnerProbes.ts, storeManagers/gog/user.ts, storeManagers/nile/library.ts (dynamic import with classifyNileLibrarySync), storeManagers/legendary/games.ts:41, signInProbe/__tests__/classify.test.ts.
  legendary/__tests__/launchFailure.test.ts:156 pins the string 'createBoundedOutputCapture(LEGENDARY_LAUNCH_OUTPUT_CAP)' -- keep that call text.

From meta/gen_vtables.ts:
  generateCallbackRegistryC() (line ~3175) -- portable text; embedder contract documented at ~3118-3135 (GL_CB_LOCK, GL_CB_UNLOCK, THISCALL, GL_CB_THREAD_ID, GL_CB_YIELD, gl_cb_now_ms, ...). Optional hooks use #ifndef defaults (GL_NET_CB_INTERCEPT ~3200, GL_MMS_ALLOC ~3647).
  Line ~4349: `static volatile LONG gl_stub_cr_seq;` and ~4356 `InterlockedIncrement(&gl_stub_cr_seq)` -- the Win32-only lines.
  The 64-bit shim embedder defines GL_CB_LOCK etc. at ~7187-7192 before `${generateCallbackRegistryC()}` (~7243).
  `pnpm gen-vtables` rewrites native/steam-bridge/generated/{steam_api_shim.c, steam_api.def, steam_api64.def, bridge_dispatch.h} and shimExports.generated.ts; meta/__tests__/gen_vtables.test.ts asserts the committed shim equals generator output.
  Harness: meta/__tests__/fixtures/callback_registry_harness.c defines the embedder macros (lines ~26-272) and `#include "gl_cb_registry.c"` at 274; it uses pthreads and `#define _GNU_SOURCE`.

From src/backend/__tests__/tauriShellSource.test.ts:
  function fnEndAfter(code, start): number   (line ~100) -- end just past the column-0 closing brace of the fn at `start`; throws if not at a fn
  two local `function fnRegion(code, fnToken)` copies at ~3060 and ~3368 (boundary = next `\nfn ` or `\n#[cfg`)
  helper-scope gate ALLOWED map at ~4762.
  WR-07 title test at ~1675: every non-App WebviewWindowBuilder chain's `.title(` argument must contain `login_window_title(` and must not start with a literal or `format!`.

From src-tauri/src/login_window/humble_helpers.rs:54:
  pub(crate) fn login_window_title(origin: &str, document_title: Option<&str>) -> String
  re-exported via `pub(crate) use humble_helpers::*` in login_window.rs; humble_open.rs:370 uses `builder.title(login_window_title(&origin, None))` with origin = `url.origin().ascii_serialization()`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-pin the censuses moved by deliberate changes, fix the two tauriShellSource test-helper faults, and route the link popup title through login_window_title</name>
  <files>src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts, src/backend/sidecar/shellFilesFlowRegistration.ts, src/backend/sidecar/__tests__/ipcDomainCensus.test.ts, src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts, src/backend/__tests__/sidecarShutdownFlagSource.test.ts, src/backend/__tests__/tauriShellSource.test.ts, src-tauri/src/store_embed/policy.rs</files>
  <action>
First confirm attribution: `git show --stat 6254354b2` (6 channels removed), `git show ac63566b2 -- src/frontend/screens/Game/GameSubMenu/index.tsx | grep -c 'is-text'` (5 new is-link buttons), `git show a152a9caa -- src-tauri/src/sidecar.rs` (EOF now via sidecar_eof_teardown). If any count disagrees with the objective table, stop and report rather than pin a number you cannot attribute.

flowRegistrationCensus: set appShellFlowRegistration.ts to { invoke: 7, send: 13 } and shellFilesFlowRegistration.ts to { invoke: 3, send: 11 }, each with a dated comment line in the existing style naming quick 261115-tk8 (6254354b2) and the removed channels (appShell: openReleases; shellFiles: openWeblate, openSupportPage, openDiscordLink, openGithubSponsorsPage, openWikiLink -- confirm against the diff). Fix the register*Flows() docstring in src/backend/sidecar/shellFilesFlowRegistration.ts so its claimed total is 14 (comment-only edit; read how claimedTotal() parses it first). If the appShell docstring also states a total, make it match too.

ipcDomainCensus: `expect(total).toBe(288)` with a comment line "Quick 261115-tk8: -6 (openWeblate, openSupportPage, openDiscordLink, openGithubSponsorsPage, openWikiLink, openReleases)". The floor is defined as measured-minus-6 at the last measurement; lower it to 282 and rewrite its comment to say it was re-measured at 288 after 261115-tk8's deliberate deletion (this keeps the parse-miss margin identical; it does not widen it). Do not touch the owner-less allowlist unless the test says it moved.

themeTokens: update the render-site census to the measured counts (34 total, 27 is-link, 26 GameSubMenu, MainButton 1, DownloadManager 1, SteamManagedItemView 2, EngineNotices 4 -- re-derive each with the test's own regexes before writing) and update the test title string to match. Add a comment naming quick 261115-szs (ac63566b2) and the five added dots-menu-parity entries. Before raising, confirm each new GameSubMenu button uses the same `button is-text is-link` className shape inside the `.gameTools` container the winning-rule test resolves, so the contrast assertions cover them; if any does not, stop and report (that would be a styling regression, not a pin move).

sidecarShutdownFlagSource: the production EOF call is now `sidecar_eof_teardown(` with `&state.shutting_down` as its first argument, and sidecar_eof_teardown calls `on_sidecar_eof(shutting_down, ...)`. Update the D-01 test so it pins `sidecar_eof_teardown(` inside start_reader after the drain (rewrite eofAfterDrainInReader to look for `sidecar_eof_teardown(`), asserts the call's first argument is `&state.shutting_down` (whitespace-tolerant regex over the stripped source), and asserts the production fn `sidecar_eof_teardown` body calls `on_sidecar_eof(shutting_down`. Update the NEEDLE and the two non-vacuity tests ("old whole-file pin passes with the production call removed; the new one fails" and "fails when moved out of start_reader") so they mutate the new call and still go RED under mutation -- run them and confirm both variants are actually rejected. Name a152a9caa in a comment. Keep `spawn_sidecar(` count == 1.

tauriShellSource: (a) in both local fnRegion helpers, bound the region with `fnEndAfter(code, start)` instead of the next-`\nfn`/`\n#[cfg` heuristic (comment: the vdw split made the repair fn the last item in windows_protocol.rs so the old bound ran into the next concatenated file). Check the fnRegion self-tests (absent token -> null; the synthetic `?;` RED proof at ~3198) still pass; fnEndAfter expects `start` at `fn ` or `pub(crate) fn ` -- if a token starts elsewhere, slice back to the line start. (b) add `'meta/__tests__/gamelibSteamcmCli.test.ts': "reads the gamelib-steamcm-cli crate's own src/main.rs, not the Tauri shell's"` to the helper-scope ALLOWED map -- before adding, read its lines 20-30 and confirm the path joins `crates/gamelib-steamcm-cli/src/main.rs`.

policy.rs (store_embed_open_link_popup): compute `let origin = url.origin().ascii_serialization();` and replace `.title(format!("Sign in - {}", ...))` with `.title(login_window_title(&origin, None))`, the same composer humble_open.rs uses for its provisional title (WR-07: a remote window's title is origin-derived, never composed by hand). Import via `crate::login_window::login_window_title` only if `use super::*` does not already reach it. Update the fn's doc comment in one sentence. Then run `cargo check --manifest-path src-tauri/Cargo.toml` (and `cargo clippy` on the same manifest if the repo's CI runs it -- check .github/workflows for the exact clippy command and use that).

Commit: `fix(quick-261117-pfj): re-pin censuses after tk8/szs/79, bound shell fn regions, origin title for the link popup`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/sidecar/__tests__/ipcDomainCensus.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/backend/__tests__/sidecarShutdownFlagSource.test.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/sidecar/__tests__/shellFilesFlows.test.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && cargo check --manifest-path src-tauri/Cargo.toml</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --check src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/sidecar/shellFilesFlowRegistration.ts src/backend/sidecar/__tests__/ipcDomainCensus.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/backend/__tests__/sidecarShutdownFlagSource.test.ts src/backend/__tests__/tauriShellSource.test.ts   # policy.rs: no inferred parser, no prettier check applies</automated>
  </verify>
  <done>The five suites pass; every changed pin carries the commit hash that moved it; the two sidecarShutdownFlagSource non-vacuity tests were seen to reject their mutated variants; cargo check is clean; one commit containing exactly the 7 listed paths.</done>
</task>

<task type="auto">
  <name>Task 2: Fix the code regressions -- module state, the signInProbe import, the shim export copy and the Win32 types in the portable registry</name>
  <files>src/backend/storeManagers/steam/gameUninstall.ts, src/backend/storeManagers/steam/steamInstallRuntime.ts, src/backend/storeManagers/steam/__tests__/pollsRustBranch.uninstallRunning.test.ts, src/backend/sidecar/steamPollEventRegistration.ts, src/backend/utils/boundedOutputCapture.ts, src/backend/signInProbe/classify.ts, src/backend/storeManagers/legendary/games.ts, src/backend/storeManagers/steam/bridge/shimCoverage.ts, meta/gen_vtables.ts, meta/__tests__/fixtures/callback_registry_harness.c, native/steam-bridge/generated/steam_api_shim.c</files>
  <action>
moduleStateCensus (do not edit SANCTIONED; D-66.4-02 makes it a reviewed list and none of these sites belongs there):
- steamPollEventRegistration.ts: replace the top-level `INSTALL_STATE_KINDS` Set with a frozen readonly tuple (`as const`) and `.includes(ev.kind)` in seqGuardKey; arrays only count when the file mutates them. Keep the doc comment tying it to the crate's `outbox::is_install_state_kind`.
- gameUninstall.ts `let lastNoticeSeq`: real per-process session state, so move it to the boot-owned per-instance runtime (the same pattern 66.4 used): add `noticeSeq: { last: number }` to SteamInstallRuntime (doc comment: highest notice seq handed out this boot, never persisted, C-WR-03 fallback input) and initialise `{ last: 0 }` in createSteamInstallRuntime; noticeSeq() reads/writes `steamGame.deps.steamInstallRuntime.noticeSeq.last` with the identical max/midpoint arithmetic. Update pollsRustBranch.uninstallRunning.test.ts so the ok and failing deps share one `noticeSeq` holder object (that is what the old module variable modelled) and the test at ~97-102 still proves the fallback is newer than 100. Run `pnpm codecheck` to catch any hand-built SteamInstallRuntime literal the new field breaks; fix test literals only by adding the field, never by casting more widely.
- directLaunch/directLaunchVerdict.ts:103 NOT_CACHED and directLaunch/machoSteamApi.ts:28 DYLIB_COMMANDS belong to quick 261117-p38, which is mid-flight (machoSteamApi.ts is dirty, sibling files untracked). Do NOT edit them. At the end of this task run `git status --short src/backend/storeManagers/steam/directLaunch/`: if it is empty (p38 has committed everything), convert both Sets the same way (frozen tuple + includes; for the numeric DYLIB_COMMANDS keep the hex comments) and include them in this commit; otherwise leave them and record in the SUMMARY that moduleStateCensus's only remaining rows are p38's two constants, with the exact fix, for p38 to apply before it closes.

epicOfflineMode (R8 Test 6c is correct as written; legendary/games.ts must not reach into signInProbe): create src/backend/utils/boundedOutputCapture.ts holding `BoundedOutputCapture`, `createBoundedOutputCapture` and the default cap it uses (move SIGN_IN_PROBE_OUTPUT_CAP's value there as a neutral name such as DEFAULT_OUTPUT_CAPTURE_LIMIT and keep `SIGN_IN_PROBE_OUTPUT_CAP` in classify.ts as an alias of it, so classify.test and other users are unchanged). classify.ts re-exports `createBoundedOutputCapture` and the type from the new module so runnerProbes.ts, gog/user.ts, nile/library.ts and classify.test.ts keep working untouched. legendary/games.ts:41 imports from 'backend/utils/boundedOutputCapture'; the call text `createBoundedOutputCapture(LEGENDARY_LAUNCH_OUTPUT_CAP)` stays byte-identical (launchFailure.test.ts pins it). Confirm `backend/utils/` is an existing directory and alias; if not, use the nearest existing neutral backend helper dir and say which. Run `pnpm knip` only if the repo's CI runs it on re-exports (check meta/knip-baseline.txt usage) and keep the baseline unchanged.

shimCoverage/shimGenerate: add `SteamAPI_SteamMatchmakingServers_v002: true` to SHIM_EXPORTED_SYMBOLS directly after the SDK-spelling MatchMakingServers entry (~line 117 area), with a comment citing b8e5cb85e (Facepunch-spelling flatAccessorAlias from meta/sdk/isteammatchmakingservers002.manifest.json). Confirm with `grep -c` that steam_api.def has no other symbol missing from the table (the test reports only the first set difference).

callbackRegistryHost (a regression on every non-Windows host, not a platform guard case -- do NOT skip or guard the suite): in generateCallbackRegistryC, replace the Win32-typed counter with an embedder hook. Add to the documented embedder contract an optional pair with `#ifndef` defaults in the same style as GL_NET_CB_INTERCEPT: `GL_CB_SEQ_T` (the counter type) and `GL_CB_ATOMIC_INC(p)` (atomically increments *p and returns the new value as an integer). Default them to a C11/GCC-builtin portable form (`volatile int32_t` and `__atomic_add_fetch((p), 1, __ATOMIC_SEQ_CST)`); in the 64-bit shim embedder block (~7187-7192, next to GL_CB_LOCK) define them as `volatile LONG` and `InterlockedIncrement(p)` so the Windows shim's emitted code is behaviourally unchanged. `gl_stub_cr_seq` and the handle mint use the macros. Check whether the 32-bit (i386) shim also embeds the registry; if it does, give it the same Win32 definitions. Leave the other InterlockedIncrement uses (~5379, ~7171, ~7228) alone -- they are in Windows-only embedder text, not the portable registry. Then `pnpm gen-vtables` to regenerate native/steam-bridge/generated/*; `git diff --stat native/steam-bridge/generated src/backend/storeManagers/steam/bridge/shimExports.generated.ts` must show only steam_api_shim.c changing, and only around the new defines and gl_stub_cr_seq (if the .def/.h/exports file changes, stop: the generator has other drift). The harness .c needs an edit only if it must define the macros explicitly; prefer relying on the defaults so the harness keeps proving the portable path. Then `pnpm build-steam-bridge` to prove both Windows shims still compile with the pinned zig toolchain; if the toolchain is not present and needs a network download that fails, record that in the SUMMARY rather than skipping silently.

Commit: `fix(quick-261117-pfj): drop new module state, decouple legendary from signInProbe, sync shim export copy, keep the callback registry host-portable`. Stage only the paths of this task (plus the two directLaunch files only under the condition above).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/moduleStateCensus.test.ts src/backend/storeManagers/legendary/__tests__/epicOfflineMode.test.ts src/backend/storeManagers/legendary/__tests__/launchFailure.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/__tests__/pollsRustBranch.uninstallRunning.test.ts src/backend/signInProbe/__tests__/classify.test.ts src/backend/sidecar/__tests__</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && npx eslint src/backend/storeManagers/steam/gameUninstall.ts src/backend/storeManagers/steam/steamInstallRuntime.ts src/backend/sidecar/steamPollEventRegistration.ts src/backend/utils/boundedOutputCapture.ts src/backend/signInProbe/classify.ts src/backend/storeManagers/legendary/games.ts src/backend/storeManagers/steam/bridge/shimCoverage.ts meta/gen_vtables.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --check src/backend/storeManagers/steam/gameUninstall.ts src/backend/storeManagers/steam/steamInstallRuntime.ts src/backend/storeManagers/steam/__tests__/pollsRustBranch.uninstallRunning.test.ts src/backend/sidecar/steamPollEventRegistration.ts src/backend/utils/boundedOutputCapture.ts src/backend/signInProbe/classify.ts src/backend/storeManagers/legendary/games.ts src/backend/storeManagers/steam/bridge/shimCoverage.ts meta/gen_vtables.ts   # .c files have no inferred parser: no prettier check applies</automated>
  </verify>
  <done>moduleStateCensus reports no rows outside SANCTIONED except, at most, p38's two directLaunch constants (documented hand-off); epicOfflineMode, shimCoverage, shimGenerate, callbackRegistryHost and gen_vtables pass on this macOS host; regenerated steam_api_shim.c differs only in the registry counter lines; build-steam-bridge result recorded; codecheck clean; one commit with only this task's paths.</done>
</task>

<task type="auto">
  <name>Task 3: i18n trio -- remove the orphan key, translate the 14 new keys into 48 catalogs, regenerate the fork-touched list, close the todo</name>
  <files>public/locales/*/gamelib.json (48 non-en), public/locales/*/gamelib.mt.json (48), meta/i18nForkTouchedFiles.json, .planning/quick/261117-pfj-fix-13-red-test-ci-suites-outside-phase-/261117-pfj-i18n-fill.json, .planning/todos/pending/2026-11-16-full-suite-red-outside-debt-06.md</files>
  <action>
Follow the 261114-twk / 74-20 mechanics (read 261114-twk-PLAN.md Task 2 and apply its byte-for-byte write rules: indent-4 ensure_ascii=False + newline for gamelib.json, indent-2 for gamelib.mt.json, abort before any write on a round-trip mismatch, never reorder existing keys). All helper scripts live in the session scratchpad and are never committed.

(1) Orphan: confirm `grep -rn "route.missingSymbols" src` finds no t() user (only `steam.bridge.setup.missingSymbols` should remain in use). Delete `steam.bridge.route.missingSymbols` from the 48 non-en gamelib.json and from each gamelib.mt.json `keys` list where present; assert per locale that only that key changed.

(2) Translations: the 14 keys are box.error.launch.epic.credentials, box.error.launch.epic.loginFailed, box.error.launch.epic.network, gamepage.moreActions, gamepage.update.downloadAbout, reportProblem.logsInstructions, reportProblem.openForm, steam.bridge.setup.steamClientUpdated, steam.engine.drmSwitchRefused, steam.engine.markerNewer, twoColTable.cancel, twoColTable.edit, twoColTable.remove, twoColTable.save. Re-derive the list first with `LINT_TRANSLATIONS_NAMESPACES=gamelib node meta/runTs.cjs --bundle --platform=node --target=node21 meta/lintTranslations.ts 2>&1 | grep "not recorded"` and stop if it is not exactly these 14. Write 14 x 48 translations into 261117-pfj-i18n-fill.json (locale -> key -> string), from the en values, using meta/i18nGlossary.json terms, meta/i18nTranslatorNotes.json context, and the upstream translation.json in each locale as translation memory for the short twoColTable verbs and "More actions". Every `{{title}}`, `{{download}}` and other placeholder must survive verbatim; brand names (GameLib, Epic Games, Steam, CrossOver) stay untranslated per the glossary. Validate every pair with the real `validateTranslation` from meta/machineFillGamelib.ts (run through meta/runTs.cjs as 261114-twk did) plus one sabotage control with a placeholder removed that must be rejected; 672 pairs, 0 failures. Apply: insert each key at its en-mirroring position (after the same predecessor key as in en/gamelib.json), add each to that locale's mt manifest `keys` at its sorted position, abort if a key already exists, and assert per locale that the parse minus the 14 keys equals the post-orphan-removal parse. en/gamelib.json must stay byte-identical (`git diff --quiet public/locales/en/gamelib.json`). Do NOT edit meta/i18nCatalogPresenceBaseline.json: recording these keys as blind spots would widen the ceiling; filling them is the fix.

(3) `pnpm gen-i18n-gate-scope` (it rewrites only meta/i18nForkTouchedFiles.json; never pass --rewrite-scope, and confirm `git diff --quiet meta/i18nGateScope.json` afterwards). Expect exactly the 6 removals the test showed (styleStub.ts, noticePreview.ts, Achievements.tsx, DotsMenu.tsx and two more); if it adds or removes anything else, stop and report.

(4) Run the full set of 13 suites. If all 13 pass, `git mv` the todo to .planning/todos/completed/ and append a `## Resolution` section listing each suite's cause and fix (the objective table, with commit hashes from Tasks 1-3). If moduleStateCensus is still red only on p38's two directLaunch rows, leave the todo in pending/, keep its three frontmatter keys (severity: major, platform: any, ready: code -- bare, lowercase, in that order), replace its table with that single residual and the exact fix, and say so in the SUMMARY.

Commit: `fix(quick-261117-pfj): translate 14 new gamelib keys, drop orphan route.missingSymbols, regenerate fork-touched list`. Stage explicitly: the 48 gamelib.json, the 48 gamelib.mt.json, meta/i18nForkTouchedFiles.json, the fill record, and the todo path(s). `git diff --cached --name-only` must show no translation.json, gamepage.json, login.json, nothing under src/, and none of the dirty debug/spikes/completed-todo files that predate this task.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/lintTranslations.test.ts meta/__tests__/genI18nGateScope.test.ts meta/__tests__/machineFillGamelib.test.ts && git diff --quiet public/locales/en/gamelib.json && git diff --quiet meta/i18nGateScope.json meta/i18nCatalogPresenceBaseline.json && echo "en, gate scope and presence baseline untouched"</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --maxWorkers=2 meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/genI18nGateScope.test.ts meta/__tests__/lintTranslations.test.ts src/backend/__tests__/moduleStateCensus.test.ts src/backend/__tests__/sidecarShutdownFlagSource.test.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/sidecar/__tests__/ipcDomainCensus.test.ts src/backend/storeManagers/legendary/__tests__/epicOfflineMode.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --check meta/i18nForkTouchedFiles.json && npx prettier --file-info public/locales/de/gamelib.json public/locales/de/gamelib.mt.json .planning/quick/261117-pfj-fix-13-red-test-ci-suites-outside-phase-/261117-pfj-i18n-fill.json   # locales and .planning expected ignored:true, so no --check applies to them; if any reports ignored:false, --check exactly that path</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates</automated>
  </verify>
  <done>gamelibCatalogParity, lintTranslations (R6 zero hard failures and R13 zero drift) and genI18nGateScope pass; 672 validated translations recorded in the fill file; presence baseline, gate scope and en catalog unchanged; the 13-suite run is fully green (or green except p38's documented residual); todo closed or narrowed; planning-gates passes; one commit with only this task's paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
| --- | --- |
| remote OAuth page -> link popup window title | a remote page's origin is shown in the popup's native title bar |
| game import table -> shim placement | a game's imported symbols decide whether the shim is placed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
| --- | --- | --- | --- | --- |
| T-pfj-01 | Spoofing | store_embed_open_link_popup title | mitigate | title comes from login_window_title(url.origin()) (WR-07), pinned by tauriShellSource's literal/format! rejection |
| T-pfj-02 | Tampering | test gates (censuses, pins) | mitigate | no ceiling widened: every pin move is tied to a named commit; SANCTIONED and the presence baseline stay unchanged; non-vacuity tests re-run and must still reject mutations |
| T-pfj-03 | Tampering | regenerated steam_api_shim.c | mitigate | diff limited to the registry counter lines; gen_vtables.test equality; build-steam-bridge compiles both shims |
| T-pfj-04 | Information disclosure | committing another task's in-progress files | mitigate | explicit-path staging only; `git diff --cached --name-only` checked before each commit |
</threat_model>

<verification>
- The 13-suite jest run in Task 3 is green (or green except the documented p38 residual).
- `pnpm codecheck` and `cargo check --manifest-path src-tauri/Cargo.toml` are clean.
- `git log -3 --stat` shows three commits touching only this plan's paths.
</verification>

<success_criteria>
- Every one of the 13 todo suites passes for a recorded, real cause; none by a widened ceiling, a skipped suite or a platform guard.
- The todo is closed with a per-suite resolution, or narrowed to p38's two-constant residual.
</success_criteria>

<output>
Create `.planning/quick/261117-pfj-fix-13-red-test-ci-suites-outside-phase-/261117-pfj-SUMMARY.md` when done (include the per-suite table with final status, the build-steam-bridge result, and any p38 hand-off).
</output>
