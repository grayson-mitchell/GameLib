---
slug: open-external-frame-noop
status: resolved
trigger: "Clicking a link opener in GameLib (Settings -> Logs -> 'Join our Discord') does nothing: no browser navigation and no diagnostic anywhere. Surfaced by Phase 34.3 live-gate item 1 (REQ-34.3-11 item 1) on 2026-08-23 after that item's original 'host has no http/https handler' root cause was WITHDRAWN as false."
created: 2026-08-23
updated: 2026-08-23T14:50:00-07:00
source_phase: 34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics
source_item: REQ-34.3-11 item 1
symptoms_prefilled: true
symptoms_source: "Phase 34.3 UAT re-run 3, 2026-08-23 — measured live"
---

# shell.openExternal is a silent no-op under Tauri

## Symptoms

**Expected:** Clicking a link opener opens the default browser at the target URL.

**Actual:** Nothing. No browser navigation, no error, no log line anywhere.

**Errors:** NONE — and their absence is itself the strongest clue. See Evidence.

**Timeline:** Reported as "nothing happens on click" on 2026-08-23. The 2026-07-27 live gate
recorded item 1 as PASS, but that was a tester attestation with no retained transcript, so it is
NOT safe to treat 2026-07-27 as a known-good point.

**Reproduction:** Settings -> Logs -> "Join our Discord". Reproduces every time.

## Evidence (already gathered — do not re-derive)

- timestamp: 2026-08-23
  finding: **THE HOST IS FINE — this is not an environment problem.**
  `NSWorkspace.urlForApplication(toOpen:)` returns Safari for BOTH `http` and `https`.
  Control, with GameLib not involved:
    $ /usr/bin/open "https://discord.gg/rHJ2uqdquK"     # the EXACT URL the button uses
    Safari front-window title before: "...Gmail"
    Safari front-window title after:  "https://discord.com/invite/rHJ2uqdquK"
    frontmost after: Safari
  OS, browser, default-handler registration and URL all work.

- timestamp: 2026-08-23
  finding: **No diagnostic fires — in BOTH directions.** A click produces neither
  `main.rs:5702`'s `[shell] openExternal failed: {e}` nor `main.rs:5710`'s "Unrecognized frame
  kind" line. Both print to stderr and DO surface in the `tauri:dev` log (other `[sidecar:err]`
  lines from the same run are present, so the log is live and capturing). Their JOINT absence
  suggests the frame never reaches the shell at all, rather than reaching it and failing.
  Also absent: `shellFilesFlowRegistration.ts:131`'s `logSendFailure` warning.

- timestamp: 2026-08-23
  finding: **DISCRIMINATOR — `openExternal` is the ONLY channel in this cluster that travels as
  a fire-and-forget `kind: "openExternal"` RPC frame.** Item 2's reveal
  (`shell_show_item_in_folder`), proven working 3/3 through the real button in the SAME session
  on the SAME build, uses `requestRustInvoke` instead. So clicks, the sidecar, the RPC pipe, the
  frontend->preload->sidecar hop and Rust dispatch are all demonstrably healthy. What is
  unproven is specifically the fire-and-forget FRAME path.

- timestamp: 2026-08-23
  finding: The chain is statically intact end to end (verified by direct read):
    `LogSettings/index.tsx:259` onClick={openDiscordLink}
    -> `frontend/helpers/index.ts:41` window.api.openDiscordLink
    -> `preload/api/helpers.ts:18` makeListenerCaller('openDiscordLink')
    -> `shellFilesFlowRegistration.ts:178` ipcMain.on('openDiscordLink')
       (registration IS invoked: `handlers.ts:163` calls registerShellFilesFlows())
    -> `utils.ts:421` openUrlOrFile() -- url.startsWith('http') so takes shell.openExternal
    -> `electronStub.ts:549` shell.openExternal
    -> `transport.openExternal` (bound at `bootstrap.ts:512` to requestOpenExternal)
    -> `sidecarRpc.ts:317` requestOpenExternal -> writeLine({kind:'openExternal', ...})
    -> `main.rs:5699` `if kind == Some("openExternal")` -> app.opener().open_url(url, None)

- timestamp: 2026-08-23 (round 2, checkpoint follow-up)
  finding: **All claims in the relayed checkpoint response INDEPENDENTLY VERIFIED true** before
  relying on them: (1) PIDs 14122/14179 were confirmed live via `pgrep` at the start of this
  round, matching the tauri:dev shell+sidecar. (2) Dev log was confirmed at exactly 359 lines
  with ZERO `DEBUG-TRACE` occurrences and 81 `[sidecar:err]` lines (log demonstrably live/
  capturing). (3) `build/main/sidecar.js` was grepped directly and contains exactly the 3
  expected `[DEBUG-TRACE]` string literals at the expected call sites. (4) The Rust binary
  (`strings src-tauri/target/debug/gamelib-shell | grep -c DEBUG-TRACE`) contains exactly 1
  occurrence of its marker, and binary mtime (13:52) matches main.rs mtime (13:52), confirming a
  fresh, matching build. The probe was real and live; its silence is real signal, not a dead
  probe.

- timestamp: 2026-08-23 (round 2)
  finding: **The three round-1 probes were all downstream of the actual dispatch decision.**
  `shell.openExternal` (electronStub.ts) is reached only via `openUrlOrFile()`'s
  `shell.openExternal(url)` call, which is only reached if the `ipcMain.on('openDiscordLink')`
  listener body executes, which only happens if `dispatchSend()` (sidecarRpc.ts) finds a
  listener for that channel and calls it. NONE of round 1's three probes instrumented
  `dispatchSend` itself or the INCOMING Rust `sidecar_send` command that delivers the frame INTO
  the sidecar's stdin — they only covered the OUTGOING `shell.openExternal` -> Rust-opener leg.
  Zero firing on all three is consistent with (and does not discriminate between) "listener
  never registered", "frame never arrives at dispatchSend", and "frame arrives at dispatchSend
  with zero listeners" — all of which would produce identical silence on the old probes.

- timestamp: 2026-08-23 (round 2)
  finding: **`dispatchSend` (sidecarRpc.ts:189-198) has NO logging on the zero-listener path** —
  read directly: `const listeners = listenerRegistry.get(request.channel) ?? []; for (const
  listener of listeners) { ... }`. An empty array loops zero times and returns with no trace of
  any kind. This is the exact "send channels fail silently" mechanism from project memory,
  confirmed present at this exact call site.

- timestamp: 2026-08-23 (round 2)
  finding: **`resetHeroic` is registered in the SAME function as `openDiscordLink`, strictly
  after it, and is proven to have fired via a real click earlier today.** Read
  `shellFilesFlowRegistration.ts` in full: `registerShellFilesFlows()` registers `openDiscordLink`
  at line 178 and `resetHeroic` at line 306, both via plain `ipcMain.on(...)`, no conditionals
  between them. `34.3-HUMAN-UAT.md` item 4 records `resetHeroic` PASSING via the real button on
  a fresh release build of current HEAD, machine-verified (PIDs, `GamesConfig/` deletion,
  `config.json` regeneration timestamp). This makes "the whole module / the whole function is
  dead" very unlikely — see Eliminated.

- timestamp: 2026-08-23 (round 2)
  finding: **`shell.showItemInFolder` (item 2, 3/3 PASSED on THIS exact dev session, same
  external-display/frontmost configuration as this bug) and `shell.openExternal` (broken) are
  both methods on the identical `shell` object** imported once via `utils.ts:17`'s
  `import { app, dialog, shell, Notification, BrowserWindow } from 'electron'`, redirected by
  `installElectronHook.ts`'s `Module._load` hook to `electronStub`'s namespace object as a
  single unit. `utils.ts`'s own `showItemInFolder()` (line 481-484) calls
  `shell.showItemInFolder(item)` on this same binding. Confirms `shell` resolution, the
  `require('electron')` hook, and the general `dispatchSend`/listener round trip are all healthy
  — see Eliminated.

- timestamp: 2026-08-23 (round 2)
  finding: **Zero duplicate export names across all 11 `preload/api/*.ts` modules** (grepped
  every `export const`/`export function` declaration). `openDiscordLink` is declared exactly
  once (`helpers.ts:18`), so `preload/api/index.ts`'s `{...Misc, ...Helpers, ...}` spread cannot
  be silently shadowing it with a different implementation.

- timestamp: 2026-08-23 (round 2)
  finding: **New bracketing instrumentation added and independently self-validated on live,
  unrelated traffic BEFORE spending the human's click.** Added `eprintln!` to Rust's
  `sidecar_send` command (main.rs, logs channel + write_frame Ok/Err for every invocation) and
  `console.error` to `dispatchSend` (sidecarRpc.ts, logs channel + listener count for every
  inbound send). After rebuild (fresh PIDs 16263/16333), the dev log immediately showed, for
  ambient `unlock` channel traffic (unrelated to this bug, generated by normal app polling):
  `[shell][DEBUG-TRACE] sidecar_send channel=unlock write_frame=OK id=867` immediately followed
  by `[sidecar:err] [DEBUG-TRACE] dispatchSend channel=unlock listenerCount=1 id=867`. Both new
  probes are proven to fire correctly and in the right order on known-good traffic — validated
  in the "fires on known-good" direction without waiting for the next human click.

- timestamp: 2026-08-23 (round 3, checkpoint follow-up)
  finding: **Every factual claim in the round-3 relayed checkpoint INDEPENDENTLY VERIFIED true**
  before relying on it: (1) PIDs 16263/16333 confirmed live via `pgrep` at round start,
  matching the report. (2) Dev log confirmed at exactly 504 lines (496+8, close enough to the
  claimed 496->504) with `grep -c openDiscordLink` = 0 across the whole file, and the only new
  traffic in lines 497-504 was 3x `unlock` (listenerCount=1) as claimed. (3) Both round-2 probes
  (`main.rs` `sidecar_send`: logs channel + write_frame Ok/Err + id, unconditionally, no
  early-return guard before it — read the full function body directly, confirmed; `sidecarRpc.ts`
  `dispatchSend`: logs channel + listenerCount + id for every inbound send) are still in place,
  unmodified, and correct. Conclusion "dies before Rust" independently reconfirmed valid.

- timestamp: 2026-08-23 (round 3)
  finding: **The relayed "naive module-eval ordering" theory is REFUTED by direct measurement —
  do not resurrect it.** `frontend/helpers/index.ts` already carries an explicit,
  spec-guaranteed dependency edge (`import '../../preload/tauriAttach'` as its OWN first
  import, added in the Phase 27 Plan 05 blank-screen fix specifically to survive Rollup
  chunking) that forces `tauriAttach`'s `window.api = api` assignment to complete before this
  file's own top-level statements run — this is true regardless of which other module first
  pulls in `helpers/index.ts`. Added a temporary module-eval-time probe immediately after the
  `const openDiscordLink = window.api.openDiscordLink` line, routed through the
  already-proven-live `window.api.logError` -> `dispatchSend` channel (piggybacking on the
  round-2 probe rather than trusting unroutable renderer `console.log`, per the checkpoint's
  own routing warning). After a full rebuild + restart (fresh PIDs 18140/18271, fresh log),
  the probe fired IMMEDIATELY on page load, with NO click required:
  `dispatchSend channel=logError listenerCount=1 id=1
  args=["[DEBUG-TRACE] helpers/index.ts module-eval typeof(openDiscordLink)=function
  typeof(window.api.openDiscordLink)=function typeof(window.api)=object apiKeyCount=250"]`
  `openDiscordLink` is captured as a genuine function, `window.api` is a fully-populated
  250-key object, at the exact module-eval instant. The const is NOT undefined. See
  Eliminated.

- timestamp: 2026-08-23 (round 3)
  finding: **The dispatchSend probe was extended to also log `args` (JSON.stringify), and this
  itself re-validates the whole send/invoke/dispatch pipeline end-to-end for the `send` shape**
  using the module-eval probe's own `logError` call as a live positive control: `sidecar_send
  channel=logError write_frame=OK id=1` (Rust) immediately followed by `dispatchSend
  channel=logError listenerCount=1 id=1 args=[...]` (sidecar) — both legs, full content
  visible, zero loss. This proves the `makeListenerCaller`-produced-function ->
  `tauriSend`/`invoke(SIDECAR_SEND)` -> Rust `sidecar_send` -> sidecar `dispatchSend` chain
  works correctly end-to-end for a function built the exact same way `openDiscordLink` is
  built (`makeListenerCaller('logError')` vs `makeListenerCaller('openDiscordLink')`, same
  factory, same shape). This rules out any generic breakage in `tauriInvoke`, the
  `SIDECAR_SEND` command name/registration, or `dispatchSend`'s general operation.

- timestamp: 2026-08-23 (round 3)
  finding: **New click-time probe added, not yet exercised.** `LogSettings/index.tsx`'s
  `onClick={openDiscordLink}` temporarily rewrapped as
  `onClick={(e) => { window.api.logError('[DEBUG-TRACE] discord onClick fired
  typeof(openDiscordLink)=' + typeof openDiscordLink); openDiscordLink?.(e) }}` — this fires
  unconditionally on any click reaching the element (regardless of whether `openDiscordLink`
  itself is callable), so it directly discriminates "click never reaches the element/handler at
  all" from "handler fires but something downstream no-ops". Awaiting the human's one click on
  PIDs 18140/18271, log baseline 243 lines.

- timestamp: 2026-08-23 (round 4)
  finding: **Direct code read confirms the exact mechanism, plus the transport implementation
  location.** `send()` lives at `src/preload/tauriTransport.ts:96-98`:
  `export function send(channel: string, args: unknown[]): void { void tauriInvoke(SIDECAR_SEND,
  { channel, args }) }` -- the leading `void` unconditionally discards any promise rejection.
  `openDiscordLink` is `makeListenerCaller('openDiscordLink')` (`preload/api/helpers.ts:18`) =
  `(...args) => { if (isTauri()) { tauriSend(channel, args); return } ... }` (`preload/ipc.ts:12-24`).
  `LogSettings/index.tsx:265`'s (currently-instrumented) click handler calls
  `openDiscordLink?.(e)`, so `args[0]` is the click's React SyntheticEvent. Confirmed contrast:
  the WORKING control `showLogFileInFolder` is bound at `LogSettings/index.tsx:226` to a LOCAL
  wrapper (`index.tsx:126-128`, `function showLogFileInFolder() { window.api.showLogFileInFolder
  (showLogOf) }`) that takes zero parameters -- the click event is never forwarded into the IPC
  call for that control. This matches the relayed report's contrast claim exactly, verified by
  direct read of both call sites (not accepted on the report's say-so).

- timestamp: 2026-08-23 (round 4)
  finding: **All claims in the relayed checkpoint response for round 4 INDEPENDENTLY VERIFIED
  true** before relying on them: (1) PIDs 18140/18271 (the round-3 PIDs) were confirmed live via
  `pgrep` at the start of this round. (2) Log tail at lines 244-259 (baseline 243) directly
  inspected -- confirmed exactly 2x `[DEBUG-TRACE] discord onClick fired
  typeof(openDiscordLink)=function` (ids 891, 899, both via `logError` channel,
  `dispatchSend...listenerCount=1`, both cleanly reaching the sidecar). (3) `grep -n
  openDiscordLink` over the WHOLE log returns exactly 3 hits (line 197 = the round-3 module-eval
  probe text, lines 253/255 = the two click-probe `logError` payload texts) -- confirmed NONE of
  these are `sidecar_send channel=openDiscordLink` or `dispatchSend channel=openDiscordLink`
  lines; a separate `grep openDiscordLink` restricted to would-be channel lines returns zero.
  This directly confirms the coordinator's own caution: the "3 hits" are the probe's own text
  payload, not real channel traffic. Nothing whatsoever reaches Rust or the sidecar for the
  `openDiscordLink` CHANNEL itself, even though the handler visibly fires twice.

- timestamp: 2026-08-23 (round 4)
  finding: **DECISIVE PROOF STEP EXECUTED -- theory converted from argument into measured fact.**
  Added instrumentation directly to `send()` (`tauriTransport.ts`): before the invoke, wraps
  `args` in `JSON.stringify` inside a try/catch and reports `argsStringifyOk`/`argsStringifyErr`
  via `window.api.logError`; attaches a real `.catch()` to the `tauriInvoke(SIDECAR_SEND, ...)`
  call that reports the actual rejection reason. GUARDED against infinite recursion by skipping
  this diagnostic entirely when `channel === 'logError'` (since `window.api.logError` itself
  routes through this same `send()` function -- an unconditional call would have looped forever).
  Full rebuild + restart performed; fresh PIDs 19765/19887 confirmed live via `pgrep`. Build
  freshness independently verified: `build/assets/themeLabels-Dwz5q9hT.js` (the chunk
  `index.html` actually references via `modulepreload`) has mtime 14:30 matching the rebuild,
  and contains the `send()` probe's exact source text
  (`` s.api?.logError?.(`[DEBUG-TRACE] send() channel=${e} argsStringifyOk=${i}
  argsStringifyErr=${o}`) `` ) plus the module-eval probe text; the lazy `LogSettings` chunk
  (`App-C6PEno9u.js`/`App-POJVBIp_.js`, also mtime 14:30) contains the click-probe text. Log
  baseline recorded at 306 lines before the click. Awaiting the human's one click to capture the
  actual rejection text.

- timestamp: 2026-08-23 (round 4)
  finding: **Blast-radius enumeration completed statically (per standing constraint 8, quit/kill
  NOT triggered).** Extracted all 57 `makeListenerCaller(...)`-derived export names across every
  `preload/api/*.ts` module (full list read directly). Two-pass grep of the ENTIRE
  `src/frontend` tree for every bare-identifier `on<Event>={name}` and `on<Event>={obj.prop}`
  JSX binding (plain identifier AND dotted member-expression forms, both passes cross-checked
  against each other) found exactly THREE matches against the 57-name list:
    1. `openDiscordLink` -- the confirmed-affected site (currently rewrapped for this
       investigation's own probing; originally a bare `onClick={openDiscordLink}` per round 1).
    2. `quit` at `ConsoleMode/index.tsx:456` -- READ DIRECTLY: this `quit` is a LOCAL
       `useCallback(() => navigate('/'), [navigate])` at line 239, NOT `window.api.quit` --
       completely unrelated to the IPC channel of the same name ("Quit Console" = return to
       library view). The SAME file's actual `window.api.quit()` call, at line 463, is already
       safely wrapped: `onClick={() => window.api.quit()}` (zero args forwarded). `quit` is NOT
       exposed to this defect by any code path.
    3. `showLogFileInFolder` at `LogSettings/index.tsx:226` -- already established as the SAFE
       local-wrapper control (see above), re-confirmed by this sweep, not a second finding.
  No other channel-based `send()` export is bound bare anywhere in the frontend. Blast radius is
  confirmed to be exactly ONE affected call site (`openDiscordLink`), not the wider set the
  relayed report worried about. `handleQuit`/`loginPage`/`sidInfoPage`/`sendKill` (the
  `helpers/index.ts` re-exports the report specifically flagged) were also checked by name
  against both grep passes -- zero matches anywhere as bare JSX handlers.

## Leading hypotheses (NAMED BUT UNTESTED — do not assume either)

1. **`electronStub.ts:549`'s optional chain.** `openExternal: async (url) => { transport?.openExternal(url) }`
   If `transport` is null this is a silent no-op that STILL RESOLVES, so
   `shellFilesFlowRegistration.ts:179`'s `.catch(logSendFailure)` can never fire. Note the
   sibling `openPath` (`electronStub.ts:578`) deliberately uses `requestRustInvoke` directly AND
   logs failures — the asymmetry is suspicious. `bindTransport` IS called at `bootstrap.ts:512`,
   so this requires an ordering/lifetime explanation to hold, not just the optional chain.
2. **The preload `send()` discards the invoke's rejection** (recorded in 34.3-HUMAN-UAT.md's own
   standing note). If the frame is rejected at the Tauri boundary, nothing anywhere reports it.

## Eliminated (REFUTED — do NOT re-litigate)

- hypothesis: "`window.api.openDiscordLink` is undefined at the moment `frontend/helpers/
  index.ts` captures it into the module-scope `const openDiscordLink`, because `tauriAttach`
  (which sets `window.api`) has not run yet — a stale/undefined value gets captured forever,
  and React's `onClick={undefined}` is a legal, permanently-silent no-op." (relayed checkpoint's
  leading candidate, round 3)
  refuted_by: DIRECT MEASUREMENT, not inference. A module-eval-time probe placed immediately
  after the capture line, on a freshly rebuilt+restarted process (new PIDs, empty log), fired
  automatically on page load (no click needed) and reported
  `typeof(openDiscordLink)=function typeof(window.api.openDiscordLink)=function
  typeof(window.api)=object apiKeyCount=250`. The const captures a genuine function, not
  undefined. This is also independently corroborated statically:
  `frontend/helpers/index.ts:15` has its OWN explicit `import '../../preload/tauriAttach'` as
  its first import (a real ES-module dependency edge, spec-guaranteed to evaluate before this
  file's own top-level statements, added specifically in Phase 27 Plan 05 to survive Rollup
  chunking) — so the ordering guarantee does not depend on which file happens to import
  `helpers/index.ts` first.

- hypothesis: "registerShellFilesFlows() never runs, or throws partway through, leaving every
  channel it owns (including openDiscordLink) unregistered." (raised by relayed checkpoint
  analysis as the leading candidate)
  refuted_by: `resetHeroic` is registered inside the SAME `registerShellFilesFlows()` function
  body (`shellFilesFlowRegistration.ts:306`), strictly AFTER `openDiscordLink`'s registration
  (line 178) with no conditional between them — every registration in the function is a plain,
  non-throwing `ipcMain.on(channel, callback)` call (callback bodies are not invoked at
  registration time). `resetHeroic` PASSED 3/3-equivalent via the real button on a fresh release
  build of current HEAD earlier the same day (34.3-HUMAN-UAT.md item 4, 2026-08-23 RE-RUN,
  machine-verified via PID/file/mtime evidence: exactly one sidecar process before/after,
  `GamesConfig/` deleted, `config.json` regenerated at the restart moment). If the function had
  thrown before reaching line 306, `resetHeroic` could not have registered or fired. Also, the
  function runs at module scope (`handlers.ts:163`, synchronous, unconditional) — a throw there
  would abort sidecar boot entirely, contradicting the sidecar's confirmed READY signal and the
  81 unrelated `[sidecar:err]` lines proving normal operation this session.

- hypothesis: "`shell` resolves to the wrong object (not electronStub's stub) for
  `openUrlOrFile`'s `shell.openExternal` call specifically, e.g. a require('electron') hook
  miss." (formed while tracing utils.ts's `import { app, dialog, shell, ... } from 'electron'`)
  refuted_by: `shell` is a SINGLE imported binding shared by both `shell.openExternal` (the
  broken path) and `shell.showItemInFolder` (the proven-working path, item 2 —
  `loggerFlowRegistration.ts:318` -> `utils.ts`'s `showItemInFolder()` at line 481-484 ->
  `shell.showItemInFolder(item)`, same `shell` from the same `import` statement at
  `utils.ts:17`). Item 2 passed 3/3 through the real button on this exact machine/window
  configuration (external display, GameLib frontmost) earlier today. `Module._load` hook
  (`installElectronHook.ts`) redirects the ENTIRE `electron` module to `electronStub`'s
  namespace object once, at process start — there is no per-symbol resolution that could
  succeed for one export and fail for a sibling export on the same object.

- hypothesis: "Two preload/api modules both export a symbol named `openDiscordLink` (or another
  colliding name), and object-spread order in `preload/api/index.ts` silently picks the wrong
  one." (raised while checking the api-object assembly)
  refuted_by: grepped all 11 `preload/api/*.ts` modules for every `export const|function`
  declaration — zero duplicate export names across the whole set. `openDiscordLink` appears
  exactly once, in `helpers.ts:18`.

- hypothesis: "This host registers no http/https handler, so no app can open a browser."
  refuted_by: `NSWorkspace.urlForApplication` returns Safari for both schemes, and
  `/usr/bin/open` on the exact URL works. This claim survived TWO re-runs and a commit before
  being challenged. It originated from reading `com.apple.launchservices.secure.plist` and
  finding no `http` entry — but that file records OVERRIDES only, so absence is the NORMAL state
  for a default browser. Do not re-derive anything from that plist.

- hypothesis: "A browser did not open" (as an observation).
  refuted_by: the observation itself was invalid — it queried Safari over Apple Events and got
  `-1743 Not authorised to send Apple events to Safari`. Automation permission is NOT granted on
  this host. Use an Accessibility-based probe instead (`System Events` -> `process "Safari"` ->
  `name of window 1`), which IS authorised and was used for every control above.

- timestamp: 2026-08-23 (round 5)
  finding: **RED-direction proof for the send() fix reuses round-4's real capture (log lines
  304-311 of the log baselined at 306 for round 4/5's shared PIDs 19765/19887, independently
  re-read this round before relying on it) -- decisive, not inference.** Two click events fired
  (ids 887-889 and 898-900); both show the identical sequence: `send() channel=openDiscordLink
  argsStringifyOk=false argsStringifyErr=TypeError: JSON.stringify cannot serialize cyclic
  structures.` immediately followed by `send() REJECTED channel=openDiscordLink err=TypeError:
  JSON.stringify cannot serialize cyclic structures.` -- both routed through the proven-live
  `logError` sink. This directly measures BOTH halves of the root cause at once: (a) the arg
  (the click's SyntheticEvent) is cyclic and fails `JSON.stringify`, confirming why Tauri's
  internal invoke serialization throws; (b) the `tauriInvoke(...)` promise genuinely rejects
  with that exact error, confirming `send()`'s discarded rejection is real, not theoretical.
  Per explicit operator sequencing instructions, this existing capture is treated as sufficient
  RED-direction proof for the permanent fix (materially identical `.catch()` shape, same
  channel name, same sink) -- no additional click spent.

- timestamp: 2026-08-23 (round 5)
  finding: **Implemented both fixes.** (1) `tauriTransport.ts`'s `send()`: replaced
  `void tauriInvoke(...)` with a permanent `.catch()` that logs `channel` + rejection reason via
  `window.api.logError`, with an explicit, commented recursion guard falling back to
  `console.error` only for `channel === 'logError'`. (2) `LogSettings/index.tsx`: added a local
  zero-arg `function openDiscord() { openDiscordLink() }` (matching the existing
  `showLogFileInFolder` pattern in the same file) and rebound `onClick={openDiscord}`, so no
  SyntheticEvent is ever forwarded into the IPC call. Removed ALL temporary DEBUG-TRACE
  instrumentation from every file it was added to this session: `src-tauri/src/main.rs`
  (`sidecar_send`'s eprintln! probe -- also simplified the now-unnecessary `channel.clone()` to
  a plain move), `src/backend/sidecar/sidecarRpc.ts` (`dispatchSend`'s console.error probe),
  `src/frontend/helpers/index.ts` (module-eval-time logError probe), `LogSettings/index.tsx`
  (click-time logError probe, replaced by the permanent `openDiscord` wrapper).
  `grep -rn "DEBUG-TRACE" src src-tauri` returns zero matches repo-wide. `tsc --noEmit` and
  `eslint` on all five touched files pass clean (0 errors; one pre-existing unrelated
  `react-hooks/exhaustive-deps` warning on `LogSettings/index.tsx:124`, not touched by this fix).

- timestamp: 2026-08-23 (round 5)
  finding: **Full rebuild + restart performed and independently verified fresh, NOT the
  auto-restarted-but-stale-JS state `tauri dev`'s cargo-watch produced after the Rust edit
  alone.** Killed the entire dev process tree (PIDs 19584/19682/20931/20990) and started clean
  via `pnpm tauri:dev` (fresh log). New PIDs 21463 (shell) / 21591 (sidecar) confirmed live via
  `pgrep`. Freshness independently verified by content, not just mtime: `strings
  src-tauri/target/debug/gamelib-shell | grep -c DEBUG-TRACE` = 0; `build/main/sidecar.js` grep
  DEBUG-TRACE = 0; the chunk `index.html` actually references via its `modulepreload`
  (`themeLabels-CadUotlb.js`, mtime 14:38, matching the binary/sidecar.js rebuild time) contains
  exactly 1 occurrence of `rejected for channel=` (the new permanent fix's log text) and 0
  occurrences of `DEBUG-TRACE`; the freshest lazy `App-*.js` chunk (`App-B-fwnIU3.js`, mtime
  14:38) contains the `join-heroic-discord` i18n key (proving the LogSettings chunk rebuilt too).

- timestamp: 2026-08-23 (round 5)
  finding: **SILENT-direction proof measured on real idle/boot traffic, not reasoning.** Full
  boot log (189 lines, from process start through app-ready) inspected: `grep -c DEBUG-TRACE` =
  0 (expected -- probes removed); `grep -c "rejected for channel"` = 0 across the WHOLE boot
  sequence, during which multiple real `send()`-routed channels fired successfully and visibly
  (`storeNew` for `legendary_library`, `gog_library`, `zoom_library`, `steam_library`,
  `nile_library`, plus sidecar-side handler traffic) with zero new failure diagnostics. The
  fixed `send()` produces no noise on healthy channels.

## Current Focus

hypothesis: Root cause CONFIRMED and BOTH fixes implemented, rebuilt, and self-verified in the
  RED (reused round-4 capture) and SILENT (idle boot traffic) directions. Only the GREEN-direction
  proof remains: one human click to confirm the Discord button now genuinely opens a browser via
  the real end-to-end `openExternal` RPC frame, with no new rejection diagnostic for
  `channel=openDiscordLink`.

test: CHECKPOINT -- awaiting one human click on Settings -> Logs -> "Join our Discord" on fresh
  PIDs 21463 (shell) / 21591 (sidecar), log baselined at 189 lines before the click.

expecting: (a) An Accessibility-probe (System Events, NOT Apple Events -- Automation to Safari is
  not authorised on this host) shows Safari's frontmost window title change to the Discord invite
  URL, matching the earlier `/usr/bin/open` control. (b) The log shows a genuine
  `sidecar_send channel=openDiscordLink write_frame=OK` / real RPC roundtrip (no such line has
  EVER appeared for this channel across the whole session -- see round-4 evidence), and NO
  `rejected for channel=openDiscordLink` line.

next_action: CHECKPOINT REACHED -- request the human click, then read the log tail from the new
  baseline and re-check Safari's frontmost window via the Accessibility probe. On confirmation,
  finalize Resolution and return DEBUG COMPLETE.

## Environment

- macOS 26.5.2 (build 25F84), arm64. Dual display; GameLib's window is on the EXTERNAL one.
- Build under test: `pnpm tauri:dev`, shell PID 18140, sidecar 18271 (round 3 restart), binary
  matches current working tree (includes round-3 DEBUG-TRACE instrumentation, to be reverted).
- The link-opener code path has NOT been modified this session (the only main.rs change is the
  +67-line Finder reveal workaround, in a different arm).
- Apple Events to Safari are NOT authorised; Accessibility (System Events) IS.
- `tauri:dev` log with live sidecar stderr:
  /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/e444d77b-68fe-4ab6-9bbc-90f505879a31/scratchpad/tauridev.log

## Resolution

root_cause: TWO compounding defects, neither of them the environment problem this item was
  twice recorded as being blocked on.
  1. **A non-serializable argument.** `openDiscordLink` (a `makeListenerCaller`-produced,
     `send()`-routed IPC caller) was bound BARE as a JSX handler: `onClick={openDiscordLink}`.
     React therefore invoked it with the click's SyntheticEvent, which `makeListenerCaller`'s
     `(...args)` forwarded straight into `tauriSend(channel, args)`. Tauri's `invoke()`
     JSON-serializes its payload internally, and the SyntheticEvent's cyclic references
     (`nativeEvent`/DOM back-references) made that serialization throw, rejecting the invoke
     BEFORE the Rust `sidecar_send` command was ever entered.
  2. **The rejection was discarded.** `preload/tauriTransport.ts`'s `send()` was
     `void tauriInvoke(SIDECAR_SEND, { channel, args })`. The leading `void` unconditionally
     threw away the rejection for ALL ~57 channels that route through `send()`. This is why the
     click produced no browser, no error, no log line, and no diagnostic in `main.rs` — nothing
     downstream ever ran, and nothing upstream reported why.

  Defect 2 is the more consequential and is why this took four rounds of instrumentation and
  roughly a dozen human clicks to localise: every layer was correctly silent about a failure
  that had already happened above it.

fix:
  - `src/preload/tauriTransport.ts` — `send()` keeps its fire-and-forget contract (still returns
    `void`, still throws nothing at the call site, still blocks nothing) but attaches a real
    `.catch` that reports the channel and reason via `window.api.logError`. Carries an explicit
    RECURSION GUARD: `logError` is itself a `send()`-routed channel, so a rejection on that
    channel falls back to `console.error` instead of recursing forever. The guard is commented
    in place with a do-not-simplify warning.
  - `src/frontend/screens/Settings/sections/LogSettings/index.tsx` — the call site now uses a
    local zero-arg `openDiscord()` wrapper, mirroring the existing `showLogFileInFolder` pattern
    two functions above, so React's event is never forwarded into the IPC frame.

verification:
  - RED direction: the new diagnostic fires with the correct channel name and error text on a
    real rejection.
  - SILENT direction: no spurious output across a full healthy boot (`storeNew` alone sends 36x).
  - ARTIFACT, not replica — the real button, clicked by the operator: Safari history records
    `https://discord.com/invite/rHJ2uqdquK` at **2026-08-23 14:42:45**.
    PROBE VALIDATED FIRST, in both directions: the plain `History.db` is stale by a day and shows
    nothing from today; only reading it WITH its `-wal` companion surfaces this session's own
    known-good control visits (`example.com` 13:40:39, `discord.com/invite` 13:44:20 via
    `/usr/bin/open`). The 14:42:45 visit is an hour after those controls and matches the click.
  - Corroborating negative-space evidence: the new send-rejection diagnostic stayed SILENT on
    that click. Before the fix this send rejected every time; its silence means the invoke
    resolved, so the frame really did reach `sidecar_send` -> `open_url`.
  - `tsc` 0 errors; `eslint` 0 severity-2 on both touched files; `prettier` clean.
  - ALL temporary instrumentation removed: 0 `DEBUG-TRACE` occurrences repo-wide AND in the
    built artifacts (`build/main/sidecar.js`, the Rust binary). `main.rs` verified BYTE-IDENTICAL
    to HEAD — it shares a file with a separately-committed fix, so leftover debris there would
    have been especially costly.

files_changed:
  - src/preload/tauriTransport.ts
  - src/frontend/screens/Settings/sections/LogSettings/index.tsx

## Blast radius (measured, after two false positives)

Exactly **one** call site was affected. An initial scan reported `quit` and `showLogFileInFolder`
as also at risk; BOTH were false positives from matching NAMES rather than resolving BINDINGS:
  - `quit` (`ConsoleMode/index.tsx:456`) is a local `useCallback(() => navigate('/'))`; the real
    "Quit App" button at :463 was already correctly wrapped as `() => window.api.quit()`.
  - `showLogFileInFolder` (`LogSettings:226`) is a local wrapper passing a string — which is
    exactly why it worked as this investigation's control.
Re-scanned properly against HEAD (`git archive`, resolving local shadows) across all 50
`makeListenerCaller` channels plus the 7 `frontend/helpers` re-exports: `openDiscordLink` is the
only direct-wired case. Scan limit, stated rather than glossed: it matches the literal
`onX={ident}` shape only, so a handler passed as a prop, held in an object, or wrapped in
`useCallback` around a raw passthrough would be missed.

## Follow-up NOT done (deliberate, recommended)

A guard inside `makeListenerCaller` rejecting or stripping non-serializable args would prevent
recurrence at the source rather than relying on every future call site being wired correctly.
Not done here because the blast radius turned out to be one, so it is prophylactic rather than
urgent — but it is the difference between fixing this bug and preventing its class.
