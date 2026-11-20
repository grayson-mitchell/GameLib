---
phase: quick-261026-jmm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - src/backend/__tests__/longRunningChannels.test.ts
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - .planning/todos/pending/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md
  - .planning/todos/completed/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md
autonomous: true
requirements: [TODO-2026-10-25-bridge-launch-invoke-timeout]

must_haves:
  truths:
    - "A `launch` invoke is not bounded by INVOKE_TIMEOUT: timeout_for(\"launch\") returns None, so a bridge launch that spends ~2 min installing redists no longer produces `sidecar invoke timed out: launch` and its real late response is delivered, not dropped"
    - "Every non-Steam (Epic/GOG/Amazon/sideload) launch whose handler awaits the whole game session now receives its real result instead of a 60 s rejection"
    - "A crashed sidecar still fails a pending launch fast (drain_pending_invokes is untouched)"
    - "A Library GameCard whose launch() rejects for any reason returns from the launching state (setIsLaunching(false) runs in finally)"
    - "The todo is closed in completed/ with an honest residual: the live done-when is NOT verified by this task"
  artifacts:
    - path: "src-tauri/src/main.rs"
      provides: "\"launch\" member of LONG_RUNNING_CHANNELS with measurement-backed inline rationale; rewritten dispatch_tray_launch doc paragraph; launch_is_exempt test"
      contains: "\"launch\","
    - path: "src/backend/__tests__/longRunningChannels.test.ts"
      provides: "EXPECTED_LONG_RUNNING_CHANNELS includes 'launch' (exact-set gate)"
      contains: "'launch'"
    - path: "src/frontend/screens/Library/components/GameCard/index.tsx"
      provides: "launch wrapped in try/finally"
      contains: "finally"
    - path: ".planning/todos/completed/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md"
      provides: "closed todo with Resolution section"
      contains: "resolved_by: quick-261026-jmm"
  key_links:
    - from: "src-tauri/src/main.rs timeout_for"
      to: "LONG_RUNNING_CHANNELS"
      via: "contains(&channel)"
      pattern: "LONG_RUNNING_CHANNELS.contains"
    - from: "src/backend/__tests__/longRunningChannels.test.ts"
      to: "src-tauri/src/main.rs LONG_RUNNING_CHANNELS array"
      via: "regex extraction + exact set equality"
      pattern: "EXPECTED_LONG_RUNNING_CHANNELS"
    - from: "meta/captureShellScrollback.ts"
      to: "src-tauri/src/main.rs LONG_RUNNING_CHANNELS array"
      via: "regex parse of the Rust array at import time"
      pattern: "const LONG_RUNNING_CHANNELS"
---

<objective>
Action todo `.planning/todos/pending/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md`
using the orchestrator's LOCKED decision: Option 1, add `"launch"` to the shell's
`LONG_RUNNING_CHANNELS` (Options 2 and 3 rejected; do not revisit). Also harden the Library
GameCard's launch path with try/finally, and close the todo honestly.

Purpose: a bridge first launch that installs shared redists (~2 min measured) and every non-Steam
session longer than 60 s currently get a spurious `sidecar invoke timed out: launch` rejection at
the shell's 60 s bound, with the real late response then dropped as an unknown id. No wall-clock
bound is correct for a game session.

Output: one Rust list entry + doc rewrite + named test, one JS gate list entry, one renderer
try/finally, one moved/closed todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md

Load `Skill("gamelib-conventions")` before writing — the `<verify>` prettier rule applies.

<interfaces>
src-tauri/src/main.rs (line numbers approximate, re-locate by grep):
- ~1456-1476: `/// Dispatch a recent-game launch to the sidecar, in-process.` doc comment on
  `fn dispatch_tray_launch(app: &AppHandle, app_name: String, known_runner: Option<String>)`.
  The paragraph to REWRITE is the one beginning
  "/// `launch` is not on `LONG_RUNNING_CHANNELS`, so for the runners whose handler awaits the whole"
  and ending "-- the tray has nothing to show the user either way." The worker body
  (`thread::spawn(move || { ... state.invoke("launch".to_string(), ...) ... })`) is NOT changed.
- ~1525: `const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);`
- ~1527-1550: LONG_RUNNING_CHANNELS doc comment (precedent: "Membership is not free and is not
  granted on reasoning ... the bound comes back on a MEASUREMENT").
- ~1551-1640: `const LONG_RUNNING_CHANNELS: &[&str] = &[ ... ];` — last group is the
  "Todo 2026-10-05 (long-running Wine and sync channels)" comment followed by
  "runWineCommand", "callTool", "installWineVersion", "downloadRuntime", "syncSaves",
  "syncGOGSaves", then `];`.
- ~1745: `fn timeout_for(channel: &str) -> Option<Duration>` — returns None for members. Unchanged.
- Test module near ~14540: precedent single-channel tests, e.g.
  `fn get_crossover_index_is_exempt() { assert_eq!(timeout_for("getCrossoverIndex"), None); }`
  and the iterating `every_long_running_channel_is_exempt_and_a_non_member_is_bounded`.
- ~18549 `handle_protocol_url_channel_is_bounded_at_invoke_timeout` — handleProtocolUrl must
  STAY bounded; do not touch it.

src/backend/__tests__/longRunningChannels.test.ts:
- line ~48: `const EXPECTED_LONG_RUNNING_CHANNELS = [ ... ]` ending with
  `'runWineCommand', 'callTool', 'installWineVersion', 'downloadRuntime', 'syncSaves', 'syncGOGSaves' ]`.
- line ~490: test "the exemption list is EXACTLY the expected set" — set equality AND length.
  Adding "launch" in main.rs WITHOUT adding it here fails this test (intended gate).

meta/captureShellScrollback.ts parses the Rust array at import; meta/__tests__/captureShellScrollback.test.ts
asserts on non-members ('someNonExemptChannel') and 'humbleStartLogin' only — no edit needed,
but run it as a regression check that the array still parses.

src/frontend/screens/Library/components/GameCard/index.tsx ~733-745 (current):
  if (isInstalled) {
    setIsLaunching(true)
    const isOffline = connectivity.status !== 'online'
    const notPlayableOffline = isOffline && !gameInfo.canRunOffline
    await launch({ appName, t, runner, hasUpdate, showDialogModal, notPlayableOffline })
    setIsLaunching(false)
  }

Mirror target, src/frontend/screens/Game/GamePage/index.tsx handlePlay:
  setPlayClicked(true)
  try { await launch({...}) } finally { setPlayClicked(false) }

Completed-todo house style (e.g. .planning/todos/completed/ entries with resolved_by): frontmatter
keeps the original keys and adds `status: RESOLVED`, `resolved: <date>`, `resolved_by: <quick id>`;
body ends with a `## Resolution` section of prose.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Exempt `launch` from INVOKE_TIMEOUT (Rust list + doc rewrite + test, and the JS exact-set gate)</name>
  <files>src-tauri/src/main.rs, src/backend/__tests__/longRunningChannels.test.ts</files>
  <action>
Per the locked decision (Option 1):

(a) In `LONG_RUNNING_CHANNELS`, append `"launch",` as the final member (after "syncGOGSaves"),
preceded by its own inline `//` comment block in the list's house style. The comment MUST record,
as prose: (1) the MEASUREMENT, per the list's precedent that exemption comes on a measurement —
quick 261025-rkj live check, Manor Lords (1363080), first bridge launch 2026-10-25: the shared
redist step (`installSteamBridgeSharedRedists`) downloaded the declared 228980 depots in about
50 s and ran three installers in about 70 s, click to game start about 2 min, and the renderer
logged `[BLANKPROBE-MARK] unhandled-rejection sidecar invoke timed out: launch t=101402ms` while
the sidecar carried on and the game started; (2) the structural reason, broader than the bridge:
`handleLaunch` (src/backend/sidecar/steamFlowRegistration.ts) routes every non-Steam runner
through `launchEventCallback`, which awaits the whole game session, so every Epic/GOG/Amazon/
sideload session longer than 60 s also hit this bound and had its real late response dropped as an
unknown id — there is no wall-clock value correct for a game session (same shape as openDialog's
"no wall-clock value that is correct"); (3) the trade: a wedged launch handler becomes a
never-settling promise rather than a 60 s rejection, the same trade already accepted for
install/repair/runWineCommand, and a crashed sidecar still fails fast via `drain_pending_invokes`;
(4) closes todo `2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install`,
and the two alternatives (decoupling the bridge launch via status events; renderer treating the
timeout as non-fatal) were rejected because each fixes only the bridge path and leaves non-Steam
sessions on the dropped-response bound. Keep it terse enough to read in one pass (roughly 10-16
comment lines). Keep the Rust string literal on a single line; avoid unbalanced double quotes in
comments' code (the JS quote-balance gate in longRunningChannels.test.ts scans main.rs code).

(b) Rewrite the `dispatch_tray_launch` doc paragraph that begins "`launch` is not on
`LONG_RUNNING_CHANNELS`" so it states the current truth: `launch` IS on `LONG_RUNNING_CHANNELS`
(quick 261026-jmm), so this call now waits for the real result; for runners whose handler awaits
the whole game session that means the spawned worker thread blocks for the session, which is fine
because it is this call's own thread (never the UI thread); the outcome is still only logged, not
surfaced, because the tray has nothing to show the user either way. Do NOT change the function
body or its log strings.

(c) In the Rust test module, next to `get_crossover_index_is_exempt`, add
`fn launch_is_exempt()` asserting `timeout_for("launch") == None`, with a one-line comment citing
quick 261026-jmm. The iterating test also covers it; the named test mirrors the per-channel
precedent. Do not touch `handle_protocol_url_channel_is_bounded_at_invoke_timeout`.

(d) In src/backend/__tests__/longRunningChannels.test.ts, append `'launch'` as the last element of
`EXPECTED_LONG_RUNNING_CHANNELS`, preceded by a short `//` comment (2-4 lines) in that list's
style: quick 261026-jmm / the todo name; a game launch awaits the whole session for non-Steam
runners and a bridge first launch measured ~2 min installing redists, so no 60 s bound is correct.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test exempt && cargo test every_long_running_channel && cargo fmt --check && cd .. && pnpm jest src/backend/__tests__/longRunningChannels.test.ts meta/__tests__/captureShellScrollback.test.ts && npx prettier --file-info src/backend/__tests__/longRunningChannels.test.ts && npx prettier --check src/backend/__tests__/longRunningChannels.test.ts && grep -v '^\s*//' src-tauri/src/main.rs | grep -c '"launch",'</automated>
  </verify>
  <done>`"launch"` is the last LONG_RUNNING_CHANNELS member with measurement + structural + trade rationale inline; `launch_is_exempt` and the iterating Rust test pass; the dispatch_tray_launch doc no longer claims launch is off the list; the JS exact-set gate and the captureShellScrollback meta test pass; cargo fmt clean (baseline was clean); prettier clean on the test file; the non-comment grep returns 1.</done>
</task>

<task type="auto">
  <name>Task 2: GameCard try/finally, then close the todo honestly</name>
  <files>src/frontend/screens/Library/components/GameCard/index.tsx, .planning/todos/pending/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md, .planning/todos/completed/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md</files>
  <action>
(a) In GameCard/index.tsx's `if (isInstalled)` branch, keep `setIsLaunching(true)` and the two
`isOffline`/`notPlayableOffline` consts before the try, then wrap `await launch({...})` in
`try { ... } finally { setIsLaunching(false) }`, mirroring GamePage's `handlePlay`. No catch: the
rejection still propagates exactly as today (do not swallow it); the fix is only that ANY
rejection (e.g. a sidecar crash draining pending invokes) no longer leaves the card stuck in the
launching state. No other behaviour change.

(b) Move the todo with `git mv` from `.planning/todos/pending/` to `.planning/todos/completed/`
(same filename). In its frontmatter, keep all existing keys and add `status: RESOLVED`,
`resolved: 2026-10-26`, `resolved_by: quick-261026-jmm` (house style of other completed todos;
completed/ is exempt from the pending-todo gate). Leave the body intact and append a
`## Resolution` section stating, plainly: Option 1 taken — `launch` added to
`LONG_RUNNING_CHANNELS` on the 261025-rkj Manor Lords measurement plus the structural reason that
non-Steam launch handlers await the whole session; options 2 and 3 rejected because each fixes
only the bridge path and option 3 also leaves the late real result dropped; the
`dispatch_tray_launch` doc was corrected; GameCard's launch is now try/finally. Then a
**Residual** paragraph that is honest: the live done-when (a continuous, correct Play-button
state from click to game start on a redist-installing first launch, with no unhandled rejection
logged) is NOT verified by this task — it is a live gate requiring a relaunch with the bottle's
`gamelib-shared-redists.json` ledger and HasRunKey values removed (or a title that has not yet
installed them), after restarting dev so the shell rebuilds; and the todo's unknown — what the
Play button actually showed during the redist install (`Installing Redistributables (...)` or
otherwise) — remains unobserved.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && pnpm jest src/frontend/screens/Library && npx prettier --file-info src/frontend/screens/Library/components/GameCard/index.tsx && npx prettier --check src/frontend/screens/Library/components/GameCard/index.tsx && test ! -e .planning/todos/pending/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md && grep -c 'resolved_by: quick-261026-jmm\|^## Resolution' .planning/todos/completed/2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install.md && pnpm planning-gates</automated>
  </verify>
  <done>GameCard resets `isLaunching` in a finally block; codecheck passes; prettier clean on GameCard/index.tsx; the todo exists only in completed/ with RESOLVED frontmatter and a Resolution section whose residual names the unverified live done-when and the unobserved Play-button state; planning-gates passes. The .planning todo path is prettier-ignored (`--file-info` reports ignored: true for .planning/todos/completed/), so no prettier check is run on it.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> shell -> sidecar invoke | `launch` channel payload crosses here; this plan changes only its timeout policy |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261026-jmm-01 | Denial of Service | `launch` invoke in SidecarState::pending | accept | A wedged launch handler now never settles instead of rejecting at 60 s — the same trade the list already accepts for install/repair/runWineCommand; a crashed sidecar still drains pending invokes via `drain_pending_invokes`; GameCard try/finally ensures a rejection never strands the UI |
| T-261026-jmm-02 | Tampering | LONG_RUNNING_CHANNELS widening | mitigate | Exact-set JS gate (`longRunningChannels.test.ts`) updated in the same task, so any further silent widening still fails CI; `handleProtocolUrl` stays bounded (its Rust test is untouched) |
</threat_model>

<verification>
- `cargo test exempt`, `cargo test every_long_running_channel`, `cargo fmt --check` in src-tauri
- `pnpm jest src/backend/__tests__/longRunningChannels.test.ts meta/__tests__/captureShellScrollback.test.ts`
- `pnpm codecheck`
- scoped `npx prettier --check` on the two TS files written (both confirmed not ignored); .planning paths ignored, check omitted
- `pnpm planning-gates`
</verification>

<success_criteria>
- `timeout_for("launch")` is None, with a measurement-backed inline rationale on the entry
- dispatch_tray_launch doc tells the truth about launch's new membership
- GameCard cannot be stranded in launching by a rejected launch
- Todo closed in completed/ with the live done-when explicitly recorded as unverified residual
</success_criteria>

<output>
Create `.planning/quick/261026-jmm-bridge-launch-invoke-timeout-during-redi/261026-jmm-SUMMARY.md` when done
</output>
