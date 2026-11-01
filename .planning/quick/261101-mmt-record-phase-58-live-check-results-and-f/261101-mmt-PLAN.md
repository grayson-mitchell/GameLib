---
phase: quick-261101-mmt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md
  - .planning/todos/pending/2026-11-01-main-menu-invite-is-a-supported-host-path.md
  - .planning/todos/pending/2026-11-01-invite-dialog-with-lobby-0-refuses-every-invite.md
  - .planning/todos/pending/2026-11-01-quitting-gamelib-kills-a-hosted-bridge-session.md
  - .planning/todos/pending/2026-11-01-invite-picker-raises-whole-main-window.md
autonomous: true
requirements: [QUICK-261101-mmt]

must_haves:
  truths:
    - "58-REVIEW-FIX.md records WR-03 and WR-04 as live-verified 2026-11-01, with the original applied-fix text unchanged and status all_fixed kept"
    - "Three new pending todos exist (main-menu host path, lobby-0 invite dialog, quit kills hosted session), each with severity/platform/ready from the gate vocabulary"
    - "The existing whole-window-raise todo carries a reciprocal Related line to the quit todo"
    - "No lobby id or SteamID appears in any committed artifact"
    - "pnpm planning-gates passes"
  artifacts:
    - path: ".planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md"
      provides: "WR-03/WR-04 live-verification notes"
      contains: "Live-verified 2026-11-01"
    - path: ".planning/todos/pending/2026-11-01-main-menu-invite-is-a-supported-host-path.md"
      provides: "Spec-change todo superseding 58-33 scope decision 5 / item 2(e)"
    - path: ".planning/todos/pending/2026-11-01-invite-dialog-with-lobby-0-refuses-every-invite.md"
      provides: "Lobby-0 invite dialog defect todo"
    - path: ".planning/todos/pending/2026-11-01-quitting-gamelib-kills-a-hosted-bridge-session.md"
      provides: "Silent session-kill-on-quit todo"
  key_links:
    - from: ".planning/todos/pending/2026-11-01-quitting-gamelib-kills-a-hosted-bridge-session.md"
      to: ".planning/todos/pending/2026-11-01-invite-picker-raises-whole-main-window.md"
      via: "Related line, both directions"
      pattern: "Related"
---

<objective>
Record the 2026-11-01 Phase 58 live-check results and file three follow-up todos. This is docs only: no file under `src/`, `src-tauri/`, `native/` or `meta/` is edited.

Purpose: WR-03 and WR-04 carry "requires human verification" and the live check has now done that verification. The same session turned up a spec change and two defects that need to be tracked for the next gate or phase.
Output: an updated 58-REVIEW-FIX.md, three new pending todos, and a Related line on the existing whole-window-raise todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md
@.planning/todos/pending/2026-11-01-invite-picker-raises-whole-main-window.md

Load `Skill("gamelib-conventions")` before writing todos or `<verify>` checks.

Facts below come from `~/Library/Logs/GameLib/gamelib.log` (and `gamelib.log.old` for the 15:2x session), read by the orchestrator on 2026-11-01. The helper and sidecar.js were rebuilt at 15:16, which is newer than fix commits 3c76c1cf5..0453435c9. Do NOT re-derive these facts from the logs. HARD RULE: never copy a lobby id or SteamID into any file. Use only fixed literals, times and counts.

Todo gate vocabulary (`.planning/todos/todo-frontmatter-gate.py:90-94`):
- severity: critical | major | medium | minor
- platform: macos | windows | linux | any
- ready: code | live-gate | human | blocked

The three keys go after `files:`, bare, lowercase, in the order severity, platform, ready, exactly as in the exemplar todo.

Prettier: `npx prettier --file-info` reports `"ignored": true` for both 58-REVIEW-FIX.md and the exemplar todo, so `.planning/` markdown is prettier-ignored. Each task re-checks `--file-info` on the exact paths it wrote. If every path is ignored, the task records "all paths prettier-ignored; prettier check omitted" in the SUMMARY rather than run a check that proves nothing.

58-33-LIVE-GATE.md is a closed contract and is NOT edited. The relevant parts are scope decision 5 (line 29) and the item 2(e) criterion plus its operator amendment (lines 245-246). The amendment already let the picker open at the main menu, but it still required the menu-press send to be refused.

Code anchors for todo `files:` lists (cite them, do not edit them):
- `native/steam-bridge/helper/bridge_helper.c`: `g_invite_lobby` at ~2252, `gl_friends_invite_dialog` at ~2278 (stores the lobby at ~2288), the `refused reason=no-pending` branch at ~2406. The 513 (LobbyCreated_t) relay comes from quick 261031-ixa.
- `src/backend/storeManagers/steam/bridge/helperProcess.ts` (`stopBridgeHelper`), `src/backend/storeManagers/steam/games.ts`, `src-tauri/src/main.rs` (the shell quit path that logs `[shell] quit (window close): handed to the sidecar handleExit`; executor greps for `handleExit` to confirm the file and does not cite a line number it has not checked).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Mark WR-03 and WR-04 live-verified in 58-REVIEW-FIX.md</name>
  <files>.planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md</files>
  <action>
Edit only the WR-03 and WR-04 sections. Leave every other section and all Applied fix text as it is.

For each of the two sections:
- Change the `**Status:**` line from `fixed: requires human verification` to `fixed: live-verified 2026-11-01`.
- Append a new paragraph that starts `**Live-verified 2026-11-01:**`, placed after the Applied fix paragraph. Keep the existing `**Human check:**` sentence inside the Applied fix paragraph so the original request stays on record.

WR-03 note content:
- Two Schedule I: Free Sample (3205720) sessions, TCP shim mode, hosted on the Mac with the PC peer: 16:00:48-16:03:27 (2m39s) and 16:07:40-16:09:45 (2m05s).
- No mid-session callback 1221 state change until the host's own LeaveLobby.
- One `HELLO shim attached` per launch across 3 launches, so the shim never reconnected.
- 0 `connection table full`, 0 AUTH refused.
- The operator reported the game worked.
- Caveat, stated plainly: a send-timeout drop writes no log line, so this is evidence from session continuity, not a direct drop counter.
- Build: the helper and sidecar.js were rebuilt at 15:16, after the fix commits.

WR-04 note content:
- `INVITE sent ok=1` at 15:24:58, 16:00:34 and 16:06:47.
- Each send came from a freshly listed snapshot taken after an earlier list in the same launch, so an earlier generation had been superseded.
- 0 `refused reason=bad-ordinal`.
- The token round-tripped through the UI unchanged.

Frontmatter: `status: all_fixed` stays. If the frontmatter has a human-verification marker, update it to say live-verified. If it has none (it currently has none), add a single key `live_verified: 2026-11-01` after `status:`. Add no lobby ids or SteamIDs.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test "$(grep -c 'requires human verification' .planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md)" = 0 && test "$(grep -c 'Live-verified 2026-11-01' .planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md)" = 2 && grep -q '^status: all_fixed$' .planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md && grep -q 'Human check:' .planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md && ! grep -En '[0-9]{15,}' .planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md && npx prettier --file-info .planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md</automated>
    The last command must print `"ignored": true`. If it does, prettier --check is omitted because the path is prettier-ignored, and the SUMMARY says so. If it prints `false`, run `npx prettier --check .planning/phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md` and it must pass.
  </verify>
  <done>Both WR sections read `fixed: live-verified 2026-11-01` with their evidence notes. Applied fix text is unchanged, status is all_fixed, and the file contains no 15+ digit ids.</done>
</task>

<task type="auto">
  <name>Task 2: File the three follow-up todos and add the reciprocal Related line</name>
  <files>.planning/todos/pending/2026-11-01-main-menu-invite-is-a-supported-host-path.md, .planning/todos/pending/2026-11-01-invite-dialog-with-lobby-0-refuses-every-invite.md, .planning/todos/pending/2026-11-01-quitting-gamelib-kills-a-hosted-bridge-session.md, .planning/todos/pending/2026-11-01-invite-picker-raises-whole-main-window.md</files>
  <action>
Write each new todo by hand with the same shape as the exemplar: frontmatter with `created: 2026-11-01`, a quoted `title:`, `area: steam-bridge`, a `files:` list, then `severity:`, `platform:`, `ready:` in that order. Follow with `## Trigger`, `## Likely cause` (or `## What changed` for todo A), `## What done looks like` and `## Verify` sections, and a `## Related` section where noted. Use plain prose. No lobby ids or SteamIDs anywhere.

Todo A, main-menu-invite-is-a-supported-host-path. Frontmatter: severity: medium, platform: macos, ready: live-gate.
- Files: `.planning/phases/58-steam-bridge-multiplayer/58-33-LIVE-GATE.md`, `native/steam-bridge/helper/bridge_helper.c`.
- Content: spec change. The game's main-menu '+' invite is a supported Direction A host path.
- Evidence (launch 2, 2026-11-01):
  - invite sent from the main menu at 16:06:47, before Continue;
  - the PC accepted and sat at the game's menu;
  - Mac Continue at 16:07:37 (`CALL SteamNetworkingSockets013.CreateListenSocketP2P`);
  - the PC auto-loaded and connected at 16:07:40 (`AcceptConnection`, `NET role=game kind=join iface=Sockets cb=1221 path=relayed`).
- This supersedes 58-33-LIVE-GATE scope decision 5 and item 2(e), "refuses cleanly", including its operator amendment, which still required the menu send to be refused. State that the closed 58-33 contract is deliberately not edited and that this todo targets the next gate or phase.
- Operator observations: in-game '+' visibility is flaky. That is the game's own logic; the operator disproved the "Windows must load first" hypothesis. The main-menu '+' always shows.
- Done: the next live gate scores the main-menu invite as a Direction A pass path (invite sent before Continue, PC joins once Continue creates the listen socket). It no longer scores that path as a refusal, and in-game '+' is not required as the only scored gesture.
- Related: todo B. Lobby 0 is what makes the first menu press fail.

Todo B, invite-dialog-with-lobby-0-refuses-every-invite. Frontmatter: severity: major, platform: macos, ready: code.
- Severity is major because this is now the reliable host path.
- Files: `native/steam-bridge/helper/bridge_helper.c`, `src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts`, `src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c`.
- Trigger: Schedule I calls `ActivateGameOverlayInviteDialog` in the same instant as `CreateLobby` and passes lobby id 0. `gl_friends_invite_dialog` (~line 2278, stores at ~2288) sets `g_invite_lobby = 0`. The picker still opens, and every Invite returns `refused reason=no-pending` (the ~2406 branch): 3 times at 16:06:29, 16:06:37 and 16:06:41, and also at 15:24:23. A second '+' press works.
- Fix direction:
  - When lobby is 0, keep the dialog pending and adopt the lobby id from the LobbyCreated_t (513) call result or broadcast for that CreateLobby. The helper already relays 513 (quick 261031-ixa).
  - Alternative: do not fire the picker until a lobby is known.
- Done: a single first '+' press that arrives with lobby 0 leads to a successful `INVITE sent ok=1`, with no `refused reason=no-pending`. A harness case covers dialog-with-0 followed by 513.
- Related: todo A.

Todo C, quitting-gamelib-kills-a-hosted-bridge-session. Frontmatter: severity: major, platform: macos, ready: code.
- Files: `src-tauri/src/main.rs`, `src/backend/storeManagers/steam/bridge/helperProcess.ts`, `src/backend/storeManagers/steam/games.ts`. Confirm the shell quit file with a grep for `handleExit`; if it lives elsewhere, list that file instead.
- Trigger: at 15:25:33 the main window was closed (`[shell] quit (window close): handed to the sidecar handleExit`). The sidecar ran `stopBridgeHelper`, and the PC saw "game no longer being hosted". GameLib gave no warning.
- Options:
  - (1) show a confirm-quit while a bridged game is running;
  - (2) keep the helper alive until the game exits.
  The todo does not decide between them.
- Done: closing GameLib while a bridged game hosts does not silently end the session.
- Related: `2026-11-01-invite-picker-raises-whole-main-window.md`. The whole-window raise puts the main window in front of the game, which makes an accidental close likely.

Existing todo `2026-11-01-invite-picker-raises-whole-main-window.md`: append a `## Related` section at the end with one line pointing to `2026-11-01-quitting-gamelib-kills-a-hosted-bridge-session.md`. The line says the raised main window is how the accidental close in that todo happens. Change nothing else in that file.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates && P=.planning/todos/pending && for f in 2026-11-01-main-menu-invite-is-a-supported-host-path 2026-11-01-invite-dialog-with-lobby-0-refuses-every-invite 2026-11-01-quitting-gamelib-kills-a-hosted-bridge-session; do test -f $P/$f.md || exit 1; done && grep -q 'quitting-gamelib-kills-a-hosted-bridge-session' $P/2026-11-01-invite-picker-raises-whole-main-window.md && grep -q 'invite-picker-raises-whole-main-window' $P/2026-11-01-quitting-gamelib-kills-a-hosted-bridge-session.md && ! grep -En '[0-9]{15,}' $P/2026-11-01-*.md && npx prettier --file-info $P/2026-11-01-main-menu-invite-is-a-supported-host-path.md $P/2026-11-01-invite-dialog-with-lobby-0-refuses-every-invite.md $P/2026-11-01-quitting-gamelib-kills-a-hosted-bridge-session.md $P/2026-11-01-invite-picker-raises-whole-main-window.md</automated>
    `--file-info` must print `"ignored": true` for all four paths. In that case prettier --check is omitted and the SUMMARY states the reason. If any path prints `false`, run `npx prettier --check` on exactly the non-ignored paths and it must pass.
  </verify>
  <done>Three new todos with gate-valid frontmatter exist. The quit todo and the whole-window-raise todo link to each other. `pnpm planning-gates` is green, there are no 15+ digit ids, and 58-33-LIVE-GATE.md is untouched (`git diff --quiet -- .planning/phases/58-steam-bridge-multiplayer/58-33-LIVE-GATE.md`).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local log -> committed docs | Data from the operator's Steam session flows into public repo artifacts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mmt-01 | Information disclosure | 58-REVIEW-FIX.md and the new todos | mitigate | Only fixed literals, times and counts are copied. Each task's verify fails on any 15+ digit run (SteamID64 and lobby ids are 17+ digits) |
| T-mmt-02 | Tampering | unrelated dirty files (.planning/spikes/*, untracked) | mitigate | Stage only the five files_modified paths by explicit path; never `git add -A` or `.` |
</threat_model>

<verification>
- `pnpm planning-gates` passes.
- `git diff --name-only` for the commit lists only the five files_modified paths, plus this quick dir's SUMMARY and STATE.md bookkeeping.
- No file outside `.planning/` is modified.
</verification>

<success_criteria>
WR-03 and WR-04 are recorded as live-verified with their evidence and the caveat. The three todos are filed with valid triage frontmatter and cross-links. The 58-33 contract is unedited. The gates are green. Commits stage explicit paths only and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
</success_criteria>

<output>
Create `.planning/quick/261101-mmt-record-phase-58-live-check-results-and-f/261101-mmt-SUMMARY.md` when done.
</output>
