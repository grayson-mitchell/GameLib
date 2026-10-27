# Phase 54 Live Gate: Mac Steam Friends survive GameLib

Authored by: plan 54-10. Run by: plan 54-11. Decision D-E: the author never runs the gate. The author of
this contract did not run any item; every verdict below is from reading source and the sibling
contracts, not from a live run. A green test suite never closes this gate
(live-gate-contract-authoring Section 4 ii).

Reference: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`.
Precedent: `55-LIVE-GATE.md` (authored 55-06, run 55-07). Wrap behaviour and timings: spike 046b
(`.planning/spikes/046b-wrap-around-logon/README.md`).

## Done-when being gated (ROADMAP)

- **SC4:** launch, browse, game page and Play leave Mac Steam Friends signed in with status
  changeable; the anonymous session alone does not flip Friends.
- **SC6 (live half):** an explicit Refresh and a depot install with Mac Steam online leave Friends
  signed in with status changeable.

Also covered: P54-SC5 (the guided fallback and the already-offline path) and the sidecar exit contract.

## Oracles

1. `GAMELOG` = `~/Library/Logs/GameLib/gamelib.log`. The sidecar `logInfo`/`logWarning` sink. Every
   `[Steam] CM logon mode=...`, `CM session closed`, `CM session reused`, `go-offline wrap:` and
   `CM logon skipped` line lands here and nowhere else.
2. `CONNLOG` = `~/Library/Application Support/Steam/logs/connection_log.txt`. Mac Steam's own log
   (`user initiated logoff`, `RecvMsgClientLogOnResponse() : processing complete`,
   `[Logged On, ...]` / `[Logged Off, ...]`). Read from a byte offset recorded before each item.
3. The operator's eyes on Friends & Chat: signed in, and status changeable (set Away, then back to
   Online, and the change sticks). **Friends is judged only by the operator; logs are corroboration.**

Privacy (T-54-41): captures live in the session directory under `/tmp`, never committed. CONNLOG
lines carry `[U:1:<accountid>]`; when quoting into the UAT, quote only the state/message part and
record counts and timestamps, not raw lines.

## 1. Preconditions

| ID  | Precondition | Command / confirmation | Positive observable |
| --- | --- | --- | --- |
| PC1 | Mac Steam freshly restarted, Friends signed in, status changeable | Operator quits and reopens Mac Steam, waits for Friends, sets Away then Online | Operator confirms both. Then `tail -c 600 "$CONNLOG"` ends with a `[Logged On, ...]` state |
| PC2 | No GameLib instance and no stray sidecar | `pgrep -f 'target/debug/gamelib-shell'; pgrep -f 'build/main/sidecar.js'` | both print nothing |
| PC3 | Tree contains every Phase 54 feat commit | `git log --oneline --grep='54-0'` (and `--grep='feat(54-'`) | feat commits for 54-01 through 54-08 listed; `git status --short` shows no unstaged `src/` edits |
| PC4 | Dev restarted so the sidecar is rebuilt (`tauri dev` does not rebuild the sidecar: restart it, `pnpm tauri:dev` runs `build:sidecar` first) | `stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' build/main/sidecar.js`; `git log -1 --format=%ci --grep='feat(54-'`; `grep -c 'CM logon mode=authenticated' build/main/sidecar.js` | sidecar mtime is newer than the newest `feat(54-` commit time AND the grep count is >= 1. If not: stop, restart dev, re-check |
| PC5 | Signed in to Steam inside GameLib | Steam appears in the sign-in state of the app | the library shows Steam titles (operator records the Steam library count N0) |
| PC6 | At least one installed Steam title; record whether any is a bridge title (CrossOver bottle `GameLibSteamBridge-<appId>`) | `ls ~/Library/Application\ Support/CrossOver/Bottles/ \| grep GameLibSteamBridge` plus the library view | names recorded. A bridge title present decides whether item 4 can pass or is blocked |
| PC7 | A small not-installed Steam title for item 6 | operator picks one | name and appId recorded |
| PC8 | A game available to start from Mac Steam for item 8 | operator picks one | name recorded |

External state (Test 6): PC1 is the Mac Steam external-state premise for items 1-6 and PC8's game
must not already be running. Fresh-Steam Friends state is confirmed positively by the operator, never
inferred from GameLib's stores.

## 2. Session procedure

One session directory, one GameLib launch for the whole run (launch ordinal 1 covers items 1 to 9).
There is no mid-run relaunch, so nothing truncates `gamelib.log` between items and the transcript
cannot be destroyed by a restart.

```
SESSION=/tmp/gamelib-gate-$(date -u +%Y-%m-%dT%H-%M-%SZ); mkdir -p "$SESSION"
GAMELOG=~/Library/Logs/GameLib/gamelib.log
CONNLOG=~/Library/Application\ Support/Steam/logs/connection_log.txt
# archive any pre-existing .old on the very first pass (may hold evidence from before the session)
cp -p ~/Library/Logs/GameLib/gamelib.log.old "$SESSION/gamelib-pre-existing.old" 2>/dev/null
cp -p "$GAMELOG" "$SESSION/gamelib-pre-existing.log" 2>/dev/null
# assert zero instances (PC2), then:
N=1
echo "=== GATE LAUNCH ${N} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$SESSION/terminal.log"
pnpm tauri:dev 2>&1 | tee -a "$SESSION/terminal.log"
```

- The terminal transcript is **appended** (`tee -a`), never truncated.
- Exact delimiter text: `=== GATE LAUNCH ${N} — <UTC> ===`. Find boundaries with
  `grep -n '^=== GATE LAUNCH' "$SESSION/terminal.log"`.
- `gamelib.log` rotates to `.old` at the next launch's first write (`log_writer.ts:72-74`); this
  session has one launch, but the runner still copies it at the end of the run and **before any
  further launch**: `cp "$GAMELOG" "$SESSION/gamelib-launch-${N}.log"`.
- **One instance asserted, not assumed.** Before launch: `pgrep -f 'target/debug/gamelib-shell'`
  empty. After the window appears: `pgrep -f 'target/debug/gamelib-shell' | tee -a "$SESSION/terminal.log"`
  prints exactly one PID. Record it again at teardown. A count other than 1 aborts the launch;
  its evidence is not scorable.
- **Per-item offsets.** Before each item, record both file sizes into `$SESSION/offsets.txt`:
  `echo "item <K> $(date -u +%H:%M:%S) conn=$(stat -f %z "$CONNLOG") gl=$(stat -f %z "$GAMELOG")" >> "$SESSION/offsets.txt"`.
  Slice an item's evidence with `tail -c +$((OFFSET+1)) "$CONNLOG"` and the same for `$GAMELOG`.
  Save each slice as `$SESSION/item-<K>-conn.txt` and `$SESSION/item-<K>-gl.txt`.
- **Closing inventory** after teardown: `ls -la "$SESSION"/` and `wc -l "$SESSION"/*`, recorded in the
  write-up, so a missing or empty capture is visible during the run.

Literal sinks: every scored literal below is a sidecar `logInfo`/`logWarning` and is scored from
`$GAMELOG` slices (or CONNLOG where stated), **never** from `terminal.log`. The sidecar's logger does
not reach the dev transcript.

## 3. Items

Each item: launch ordinal 1 unless stated. "No authenticated logon" means zero lines containing
`CM logon mode=authenticated` in that item's `$GAMELOG` slice, and zero `RecvMsgClientLogOnResponse`,
`user initiated logoff` or `[Logged Off` lines in that item's CONNLOG slice that were caused by GameLib.

### Item 1. Cold launch, idle 90 s (SC4 launch)

Steps: record offsets, launch per Section 2 (after PC1-PC8), wait for the window, then leave the app
idle 90 s with Mac Steam Friends visible.
Pass: the `$GAMELOG` slice from launch has **no** `CM logon mode=authenticated`; the CONNLOG slice has
no `user initiated logoff` and its last state is still `Logged On`; the operator confirms Friends
signed in and status changeable at 90 s. An `CM logon mode=anonymous reason=` line may appear
(anonymous does not flip Friends; the operator is the judge).
Fail: any `CM logon mode=authenticated` line, a CONNLOG `user initiated logoff`, or Friends signed out.

### Item 2. Browse the library and open three game pages (SC4 browse and game page)

Steps: record offsets; scroll the Steam library; open three different Steam game pages (record
names); wait 30 s.
Pass: no `CM logon mode=authenticated` and no `go-offline wrap:` line in the slice (the wrap fires
only on an authenticated logon, so its presence means a logon attempt); CONNLOG shows no new
`user initiated logoff`; Friends signed in and changeable.
Fail: any of those lines, or Friends changed.

### Item 3. Play an installed title (SC4 Play; SC2 launch target)

Steps: record offsets; Play one installed title, a bridge title if PC6 found one; let it reach a
window or error; record which of Recorded behaviour changes (i) and (ii) the title hit; quit the game.
Pass: no `CM logon mode=authenticated` in the slice; CONNLOG no `user initiated logoff`; Friends signed
in and changeable. If a bridge title was played: `CM logon mode=anonymous reason=launch-target`
appears in the slice (it is logged when the anonymous PICS client opens; if an anonymous session was
already open from item 1 or 2 within 60 s idle, the line can be absent, so wait 70 s after the last
anonymous activity or accept `CM session closed mode=anonymous cause=idle` before the Play).
Fail: any authenticated logon, or Friends changed.

### Item 4. The anonymous session alone (SC4)

Evidence is item 3's slice. Pass: `CM logon mode=anonymous reason=launch-target` present AND no
`mode=authenticated` line AND Friends unchanged by the operator's judgment, so the anonymous session
alone did not flip Friends. **Blocked (not failed)** if PC6 found no bridge title: record that reason
and mark the item `blocked`.

### Item 5. Explicit Refresh with Mac Steam online (SC6)

Steps: record offsets (note the time `T5`); press the Refresh button in the header; wait for the sync
to finish; wait 60 s more; record the library count N5.
Pass, all of:
- CONNLOG slice has `user initiated logoff` at a position **before** GameLib's
  `CM logon mode=authenticated reason=user-refresh wrap=toggled` line in `$GAMELOG` (compare
  timestamps; the logoff precedes the logon);
- CONNLOG slice afterwards has `RecvMsgClientLogOnResponse() : processing complete` (Mac Steam is back
  online) and its last state is `Logged On`;
- Friends signed in and status changeable 60 s after the Refresh finished (operator);
- N5 equals N0 (library count unchanged).
Fail: the authenticated logon lands before the logoff, `wrap=` is not `toggled` on an online Steam,
Friends stays out, or the count changed.
If the dialog appears instead (`CM logon skipped`), record it as the item 8 outcome, mark item 5
`blocked`, and see item 8.

### Item 6. Depot install with Mac Steam online (SC6)

Steps: wait until at least 70 s after item 5's Refresh finished so the idle grace has closed the
session; confirm `CM session closed mode=authenticated cause=idle` is in `$GAMELOG` after item 5's
offset (if absent, wait and re-check; the grace is 60000 ms). Record offsets; install the PC7 title
from GameLib; wait for the install to complete; then wait at least 60 s.
Pass, all of:
- same wrap evidence as item 5 with `reason=user-install` (`CM logon mode=authenticated reason=user-install wrap=toggled`
  after CONNLOG `user initiated logoff`; afterwards `processing complete` and `Logged On`);
- install completes (the title shows Installed / Play);
- Friends signed in and status changeable;
- at least 60 s after the install completes, `CM session closed mode=authenticated cause=idle`
  appears in `$GAMELOG`.
Fail: any of the above missing, or the session never closes.

### Item 7. Mac Steam offline by hand, then Refresh

Precondition: item 6's `CM session closed mode=authenticated cause=idle` is already seen, so Refresh
opens a cold session. Steps: operator sets Mac Steam offline (Steam > Go Offline > Go Offline, wait for
`[Logged Off` in CONNLOG); record offsets; press Refresh in GameLib; wait for it to finish; wait 60 s.
Pass: `$GAMELOG` slice has `go-offline wrap: Mac Steam state=Logged Off, no toggle needed` and
`CM logon mode=authenticated reason=user-refresh wrap=already-offline`; the CONNLOG slice has **no**
new `user initiated logoff` and no `processing complete` caused by GameLib's action; Steam stays
offline (last state `Logged Off`).
Fail: `wrap=toggled`, a GameLib-caused `goonline`, or Steam comes back online.
After the item: the operator restores Steam online by hand (Steam > Go Online) and waits for Friends
and a `[Logged On` state before item 8.

### Item 8. Guided fallback (conditional)

Conditional on Mac Steam's behaviour with a game running (not measured in spike 046; an open
question). Steps: wait until any open authenticated session has closed; start the PC8 game from Mac
Steam; with it running, press Refresh in GameLib; record offsets before.
Pass if EITHER:
- (a) the wrap succeeds: `wrap=toggled` with the logoff before the logon. Record that the URL verb
  works with a game running; or
- (b) the dialog appears: `CM logon skipped: Mac Steam did not go offline` is in `$GAMELOG` and there is
  **no** `mode=authenticated` line before it. Then the operator clicks Steam > Go Offline, presses
  Continue in the dialog, and the refresh logs on with `wrap=guided-restore`, and Mac Steam comes back
  online afterwards (`processing complete`, `Logged On`).
Fail only if a `CM logon mode=authenticated` line lands while CONNLOG's last state is `Logged On`
(an authenticated logon without the wrap), or in (b) Steam does not return online.
Quit the Mac Steam game afterwards.

### Item 9. Sidecar exit

Steps: quit GameLib (Cmd+Q). Within 10 s: `pgrep -f 'build/main/sidecar.js'` is empty and
`pgrep -f 'target/debug/gamelib-shell'` is empty. (The sidecar exits by event-loop drain at stdin EOF;
`smoke:sidecar` misses slow exit, so this live check is the measurement.) Then
`cp "$GAMELOG" "$SESSION/gamelib-launch-1.log"` and take the closing inventory.
Pass: both empty by 10 s. Fail: an orphan sidecar remains (record its PID and kill it).

## 4. Recorded behaviour changes (not items to pass or fail)

(i) A bridge title installed before Phase 54 with an unsettled shared-redist ledger logs
`shared redists: Steam client offline, skipping for <appId> (no open session and logon not allowed here)`
at Play (`depot.ts:1355`, plans 05/08) and launches without the redists until a Play follows a
session-holding action. Not a failure.

(ii) A pre-Phase-54, license-gated bridge title Played before any Refresh shows the SteamBridgeSetup
dialog with `Reason: launch-exe-not-resolved` (`games.ts:1712`, `games.ts:3026`); one Refresh backfills
its launch target (plans 06/08). Item 3 records which of these the operator's titles hit.

## 5. Structural Reachability Review

All seven tests applied by the author before publishing. Verdicts: REACHABLE, IMPOSSIBLE, CONDITIONAL.

Sinks confirmed by the author (Test 3): the scored literals are all `logInfo`/`logWarning` calls in
sidecar code, so they reach `~/Library/Logs/GameLib/gamelib.log` and never the dev transcript.

| Item / sub-check / precondition | Surface it names | What it asks for | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| T1 origin/scheme, all items | steam:// URL verbs, local files | no https-only origin gate sits on these routes; `STEAM_GO_OFFLINE_URL = 'steam://open/gooffline'` is opened through the shell, not a webview | REACHABLE | `macSteamOffline.ts:9-10`; no `login_window_url_arg` in any route |
| T2 concurrency, items 1-9 | one window, sequential gestures | no item drives two UI gestures at once; item 8's dialog is a sequential step after Refresh | REACHABLE | no concurrent gesture in Section 3; dialog is `Dialog` in `SteamGoOfflineNotice.tsx` |
| T3 `CM logon mode=anonymous reason=launch-target` (items 3, 4) | gamelib.log | emitted at `anonymousClient.ts:131` via `logInfo`, called with reason `launch-target` at `launchTarget.ts:175` from Play at `games.ts:1703/3017/3570/3825` | CONDITIONAL | emitter exists; fires only when no anonymous client is cached (`getAnonymousPicsClient` returns the cache silently while idle < 60 s, `anonymousClient.ts:139-142`) and only for a bridge title. Contract waits for the 60 s idle close (`ANON_IDLE_CLOSE_MS = 60000`) before item 3 |
| T3 `CM logon mode=authenticated reason=<r> wrap=<w>` (items 5-8) | gamelib.log | emitted at `user.ts:930`, one site, pinned by Rule K of `steamAuthSessionPolicy.test.ts` | REACHABLE | `grep -n 'CM logon mode=authenticated' src/backend/storeManagers/steam/user.ts` -> 930; `reason=user-refresh` from `library.ts:979` grant; `reason=user-install` from `depot.ts:797` default |
| T3 `CM session closed mode=authenticated cause=idle` (items 6, 7) | gamelib.log | emitted at `user.ts:620`, `endSession('idle')` from the idle timer at `user.ts:410-413` after the last lease release | REACHABLE | `AUTH_SESSION_IDLE_GRACE_MS = 60000` (`user.ts:59`); refresh and install both hold leases (`library.ts:979`, `depot.ts:796`) so release arms the timer |
| T3 `CM session reused mode=authenticated` | gamelib.log | `user.ts:383` | REACHABLE (not scored; informational) | `acquireOpenAuthenticated` |
| T3 `CM logon skipped` (item 8b) | gamelib.log | `user.ts:596` `logWarning` on `GuidedOfflineRequiredError` | REACHABLE | `macSteamOffline.ts:214,266` throw it; `user.ts:594-600` logs it |
| T3 `go-offline wrap:` lines (items 2, 7) | gamelib.log | `macSteamOffline.ts:214-289` | REACHABLE | `logInfo/logWarning` at those lines |
| T3 `wrap=toggled / already-offline / guided-restore` | gamelib.log | `MacSteamWrapKind` values in the `user.ts:930` interpolation | REACHABLE | `macSteamOffline.ts:35-39` |
| T3 CONNLOG literals `user initiated logoff`, `processing complete`, `[Logged On/Off` | Mac Steam's file | written by Mac Steam, not GameLib; `LOGOFF_EVIDENCE_RE = /user initiated logoff/` is the same literal GameLib's wrap reads | REACHABLE | `macSteamOffline.ts:14-15`; spike 046b README |
| T3 `shared redists: Steam client offline ... logon not allowed here` (note i) | gamelib.log | `depot.ts:1355` | REACHABLE | `logInfo` |
| T4 absence: "no `mode=authenticated`" (items 1-4) | gamelib.log | an authenticated logon always logs this line (single site `user.ts:930`), and the source gate counts that site once, so a regression opening a logon elsewhere trips the gate; absence in this sink is observable. CONNLOG is a second, independent oracle | REACHABLE (falsifiable absence) | Rule K of `steamAuthSessionPolicy.test.ts` (54-09); CONNLOG `user initiated logoff` would also show an unwrapped toggle |
| T4 absence: "no new `user initiated logoff` from GameLib" (item 7) | CONNLOG | Mac Steam logs the logoff on presence; the sink would show it | REACHABLE (falsifiable) | spike 046b |
| T4 absence: `go-offline wrap:` absent in item 2 | gamelib.log | the wrap runs only inside an authenticated logon (`user.ts:586`); its lines would be present if it ran. This is a structural guarantee of the same fact as the authenticated-logon absence, recorded as confirmation of an existing guarantee, not a novel discovery | REACHABLE (structural) | `user.ts:582-600` |
| T5 pair pass | whole contract | reduction applied: every state-mutating requirement against every evidence-bearing requirement. Mutating: M1 launch (rotates `.old`), M2 Refresh/install (toggles Mac Steam), M3 operator sets Steam offline (item 7), M4 start a Steam game (item 8), M5 quit (item 9). Evidence-bearing: E1 `terminal.log`, E2 `gamelib.log`, E3 CONNLOG offsets, E4 Friends state, E5 session-closed lines. 5 x 5 = 25 pairs considered | CONDITIONAL, 3 flagged and fixed in the contract | see the three rows below |
| T5 pair M1 x E1/E2 | launch vs transcript / log | one launch only, `tee -a`, copy at end; no truncation, no `.old` rotation mid-run | REACHABLE | Section 2 |
| T5 pair M2 (item 5) x E4/E5 (item 6) | Refresh toggles Steam; item 6 needs Friends recovered and the session closed | item 6 waits >= 70 s and confirms `cause=idle`; Friends re-judged | REACHABLE | Item 6 steps |
| T5 pair M3 (item 7 leaves Steam offline) x item 8 premise | item 8 assumes Steam online | item 7 ends with the operator restoring Steam online and waiting for `[Logged On` | REACHABLE | Item 7 closing step |
| T5 pair M4 x E4 | a running Steam game vs Friends judgement | item 8 does not score Friends; it scores logs and the dialog | REACHABLE | Item 8 |
| T5 pair M5 (quit) x E2 | quit vs archived log | copy taken after quit; session dir keeps it | REACHABLE | Item 9 |
| T6 PC1 Friends premise | Mac Steam external state | positive observable: operator sets Away then Online; CONNLOG `Logged On`. App-side stores are never used as the premise | REACHABLE | PC1 |
| T6 item 3/4 premise "no anonymous session cached" | process-internal state | idle close line `CM session closed mode=anonymous cause=idle` is the positive observable | CONDITIONAL | `anonymousClient.ts:105,168` |
| T6 item 7 premise "Steam offline" | Mac Steam external state | positive observable: CONNLOG last state `Logged Off` | REACHABLE | `readMacSteamCmState` regex `macSteamOffline.ts:13` |
| T6 PC5 / PC8 | keychain / running game | PC5: library visible; PC8 game must not already be running | REACHABLE | PC5, PC8 |
| T7 Refresh button | `Header/index.tsx` | `refreshLibrary({ origin: 'action-icons-refresh-button' })`; origin maps to `user-refresh` | REACHABLE | `Header/index.tsx:407`; `authTrigger.ts:75` |
| T7 Install button | game page / library | Install gesture for a not-installed Steam title opens the install modal; the install path reaches `acquireAuthenticated` with `guidedAction: 'install'` | REACHABLE | `depot.ts:796-800`; `InstallGameModal` import in `SteamGoOfflineNotice.tsx` |
| T7 Go Offline dialog (item 8b) | `SteamGoOfflineNotice` | mounted in `App.tsx` at the app root, opened by the backend push `steamGoOfflineRequired`; Continue calls `steamGoOfflineRetry` then re-runs `refreshLibrary` with origin `steam-go-offline-retry` (maps to `user-refresh`) | REACHABLE | `App.tsx:38,134`; `SteamGoOfflineNotice.tsx:41-60`; `authTrigger.ts:83` |
| T7 Play button / game pages | library UI | standard Play and card gestures | REACHABLE | existing screens |
| T7 quit gesture (item 9) | OS menu | Cmd+Q | REACHABLE | OS |
| Item 1 | cold launch | no new gesture | REACHABLE | Section 2 |
| Item 2 | browse, three pages | `getExtraInfo` opens no session (`games.ts:1022-1030`) | REACHABLE | `games.ts` |
| Item 3 | Play | `launch()` bridge branch passes no `allowLogon` (`games.ts:3471`) | REACHABLE | `games.ts` |
| Item 4 | anonymous alone | blocked if no bridge title | CONDITIONAL | PC6 |
| Item 5 | Refresh online | wrap `toggled` path | REACHABLE | `macSteamOffline.ts:253-273` |
| Item 6 | depot install | 70 s spacing, lease release arms the idle timer | REACHABLE | `user.ts:398-414` |
| Item 7 | already-offline | `macSteamOffline.ts:230-240` | REACHABLE | state read |
| Item 8 | guided fallback | Mac Steam's behaviour with a game running was not measured in spike 046 | CONDITIONAL | contract accepts both outcomes (wrap succeeds, or dialog + `guided-restore`) |
| Item 9 | sidecar exit | exit by stdin EOF drain (`releaseOnStdinEof`) | REACHABLE | CLAUDE.md sidecar exit contract |
| PC1-PC8 | preconditions | each has a command or operator confirmation | REACHABLE | Section 1 |
| PC4 | stale sidecar | mtime vs newest feat commit and a literal grep of `build/main/sidecar.js` (author checked at authoring: sidecar mtime 2026-10-27 22:44, newest feat commit 22:18, so it passes now; the runner re-checks) | REACHABLE | Section 1 |
| Evidence capture | whole pipeline | dual sink, session dir, appended transcript, delimiter, per-item offsets, one-instance assertion, closing inventory | REACHABLE | Section 2 |

IMPOSSIBLE verdicts: none. CONDITIONAL rows (item 3/4 anonymous line, item 4 bridge title, item 8) each
state the condition and what the runner records if it does not hold. Count of structural impossibilities
and unresolved requirement interactions found at authoring: 0 unresolved (3 interactions flagged and
resolved in the contract text).
