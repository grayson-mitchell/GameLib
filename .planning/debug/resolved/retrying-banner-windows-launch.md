---
status: resolved
trigger: "Intermittent 'Retrying (Ignore)' banner on launch of the packaged Windows build"
created: 2026-11-01
updated: 2026-11-01
source_todo: .planning/todos/pending/2026-10-29-retrying-banner-on-packaged-windows-launch.md
---

## Symptoms

- expected: No connectivity banner at launch when the machine is online.
- actual: A strip across the top of the window reads "Retrying (Ignore)" with a `?` hint at the right. It is
  present at launch, before Stores is opened, and stays for at least ~48s (sampler window
  2026-10-28T19:27:51Z to 19:28:39Z). The Steam and GOG store embeds loaded fine while it showed, so the
  network was actually up.
- errors: None captured. No `gamelib.log` was collected.
- timeline: Operator: "that banner was there on launch... intermittently happens, seen it before". Seen in
  the packaged debug build at ae9cb5f36 (quick 261029-bv7, W9/W10 run). Earlier sightings: build/OS not recorded.
- reproduction: Launch the packaged Windows build. Intermittent.
- evidence: `.planning/quick/261029-bv7-record-windows-stores-embed-w9-w10-live-/evidence/w10-hwnd/shot-001.png`,
  `shot-006.png`, `shot-013.png` (same directory).

## Suspected components (string match only, unconfirmed)

- `src/frontend/components/UI/OfflineMessage/index.tsx` renders `offline-message.retrying` + `offline-message.ignore`
  + `retry-hint` when `connectivity.status === 'check-online'` with no `retryIn`.
- State comes from `src/backend/online_monitor.ts` and `src/frontend/helpers/onlineMonitor.ts`.

## Questions to answer

1. How does `online_monitor.ts` decide `check-online` at boot (hosts, timeout, retry cadence)?
2. Can the probe false-negative at launch on packaged Windows (Tauri shell + Node sidecar), e.g. probe
   starts before network/proxy is ready, a timeout too tight for cold start, a fetch/agent that is
   unavailable in the sidecar, or a state that never transitions out of `check-online` when there is no `retryIn`?
3. Is anything gated while the status is `check-online`?
4. Why would `check-online` stay showing with no `retryIn` for ~48s+ (stuck state vs. slow probe)?

## Current Focus

bug_class: Mandelbug / concurrency (order-violation across two delivery routes); no deterministic repro, operator cannot
  trigger on demand, the Oct 28/29 sidecar log was rotated away
status_of_root_cause: NOT PROVEN for the 2026-10-29 sighting (see Resolution). Defects below are each demonstrated by a
  test that is red on the old code.
reasoning_checkpoint:
  hypothesis: "The renderer applies whatever connectivity message arrived last. A pull reply (invoke route) taken while the
    sidecar was still probing can arrive after the `online` push (event route), leaving {check-online, retryIn 0} forever,
    because nothing changes on a healthy connection to correct it."
  confirming_evidence:
    - "GlobalState applied `.then(connectivity => setState)` and the push listener with no ordering (read, git diff)."
    - "Rust: reply = oneshot -> spawn_blocking -> async command -> IPC; push = app.emit from the reader thread (read,
      main.rs 2128-2138, 12536-12583). tauriTransport.ts:170-175 already records 'no ordering guarantee' for the same pair."
    - "Screenshots: 3/3 samples across 48s show the no-countdown 'Retrying' text, which a failing probe loop would not."
    - "First launch after install + reboot + VPN is the slow-ping case that puts the pull inside the probe."
  falsification_test: "If the sidecar log of a stuck launch shows `Connectivity: online` before the frontend mounted, or a
    stuck banner with a `[connectivity] ignored a stale ...`/`resync recovered` line never appearing after this fix, the
    mechanism is wrong (the new log lines exist to tell these apart)."
  fix_rationale: "Order by a per-process epoch + monotonic seq so a stale snapshot cannot overwrite a newer one, and re-pull
    after 20s of silence while not online so ANY lost message (not only a reordered one) heals. Backend defects that make the
    sidecar itself report false offline are fixed alongside (403-as-failure, overlapping rounds, zombie countdowns)."
  blind_spots: "Never observed the stuck state live; cannot measure the Rust-route latency gap from here; do not know whether
    the 10/29 launch had a slow ping or an early pull; VPN/Cloudflare 403 channel is inferred from a 1-of-4 measurement."
  candidate_causes:
    - "code: unordered pull-vs-push in GlobalState (fixed)"
    - "code: overlapping probe rounds + zombie countdown in online_monitor.ts (fixed; causes transient false 'Offline. Retrying in N')"
    - "environment/code: probe counts 403 as failure; VPN exit IP / Cloudflare fingerprint blocks could fail all four (fixed)"
    - "environment: sidecar event loop blocked >48s right after the first push (not excluded; would need the log)"
  and_gate: "no single required co-condition proven; plausible AND of (slow ping or early pull) AND (cross-route reorder)."
test: hardening tests written first (red on old code), then fix, then guardrail (done, see Resolution.verification)
next_action: AWAITING HUMAN VERIFY. Live packaged-build confirmation is a follow-up (intermittent; cannot be forced). On a
  recurrence, read gamelib.log for the new connectivity lines to attribute it; if it never recurs over a few cold first
  launches, archive (move to resolved/, move the todo to .planning/todos/completed/, append knowledge-base entry).

## Evidence

- timestamp: 2026-11-01
  checked: src/backend/online_monitor.ts (full), src/frontend/helpers/onlineMonitor.ts, OfflineMessage/index.tsx
  found: banner text "Retrying" + "(Ignore)" == `status==='check-online' && !retryIn`. That state is sent by
    (a) setStatus('check-online') at boot / on every DOM `online` event echo, (b) retry(0) just before each re-ping.
    pingSites() = Promise.any of 4 axios.head (github.com, store.epicgames.com, gog.com, cloudflare-dns.com), `timeout: 10000`.
    On success -> setStatus('online'); on all-fail -> retry(5,10,15..) which pushes `retryIn>0` ("Offline. Retrying in N seconds.").
  implication: a banner that shows "Retrying" without a countdown means the frontend is in the ping-in-flight phase, or
    stranded there. Countdown phases would show different text.

- timestamp: 2026-11-01
  checked: the three kept screenshots (shot-006 viewed) + summary 261029-bv7-SUMMARY.md
  found: shot-001/006/013 all read "Retrying (Ignore)", none shows "Offline. Retrying in N seconds". Debug packaged build.
  implication: 3/3 samples in the no-countdown phase. Consistent with a stuck frontend state OR a long in-flight ping
    (a 21s connect-timeout round + 5s countdown would be ~80% "Retrying" so 3/3 is not conclusive either way).

- timestamp: 2026-11-01
  checked: local %LOCALAPPDATA%/GameLib/logs/gamelib.log and gamelib.log.old (Oct 29 launches; Oct 28 run was rotated away)
  found: in both retained launches `Connectivity: check-online` -> `Pinging external endpoints` -> `Connectivity: online`
    all within the SAME second at sidecar boot (12:04:04 and 09:45:17); the webview does not mount GlobalState until
    ~3s later (BLANKPROBE after-root-render t=3100ms, 12:04:06). Only ONE check-online per launch (no DOM 'online' echo).
  implication: in healthy launches the backend is already 'online' ~2s BEFORE the frontend's one-time pull, so the
    pull-vs-push race (H2) needs a ping slower than ~3s to even arm. The Oct 28 sighting log is gone: root cause of that
    specific run cannot be read from logs.

- timestamp: 2026-11-01
  checked: src/frontend/state/GlobalState.tsx:1961-1969, src/preload/tauriTransport.ts listen(), src-tauri start_reader (12458-12584)
  found: frontend initial state is {status:'offline'}; it subscribes to pushes then pulls `get-connectivity-status` once and
    applies `.then(connectivity => setState({connectivity}))` with no ordering check. In Rust, a sidecar RESPONSE is routed
    through a oneshot to an async command (invoke reply) while a sidecar PUSH is `app.emit(...)` directly from the reader
    thread: two different delivery routes. tauriTransport.ts:170-175 itself documents "A push and a fetch result take
    different routes from the shell with no ordering guarantee" for the store snapshot and guards it with changesDuringFetch;
    connectivity has no such guard.
  implication: a stale pull reply landing AFTER a newer 'online' push would strand the UI on {check-online,0} until the
    next connectivity change (none comes). Real defect class, but narrow window (see previous entry).

- timestamp: 2026-11-01
  checked: gating (Q3) via grep of isOnline()/connectivity.status consumers
  found: backend isOnline() === (status==='online') gates: download queue (downloadmanager/utils.ts:144,434), launcher
    (launcher.ts:535 `offlineMode = settings.offlineMode || !isOnline()`; save sync 163/338), GOG/Epic/Steam library refresh,
    GOG user/presence/redist, tools installs, runOnceWhenOnline blocks. Frontend gates on `status !== 'online'`: GameCard:769,
    GamePage:211, DownloadSizeInfo:51, Header:192.
  implication: 'check-online' is NOT cosmetic. While stuck, games launch in offline mode, installs/updates/save-sync are refused.
    Severity should be re-rated above 'minor' if the stuck state is real.

- timestamp: 2026-11-01
  checked: repo axios 1.20.0 + Node 24 probe on this box (scratchpad/probe.cjs, blackhole.cjs)
  found: HEAD github.com 200/130ms, gog.com 200/2.2-3.3s, cloudflare-dns.com 200/50ms, **store.epicgames.com 403/30-70ms every
    time**. axios counts the 403 as a failure (default validateStatus), so 1 of the 4 probe targets can never succeed.
    Blackholed connect (192.0.2.1, timeout:3000) rejected ECONNABORTED at 3012ms: axios 1.20 bounds connect+DNS with a
    wall-clock timer, so one probe round is bounded at ~10s.
  implication: "a round hangs for 48s" is ELIMINATED. A probe that is failing would cycle round(<=10s) -> "Offline. Retrying in
    N seconds" countdown(5,10,15..), so 3/3 screenshots in the no-countdown "Retrying" text (t=0,20,48s) is hard to produce
    from a failing probe (checked the 10s-timeout cycle schedule against t=0/20/48: no consistent phase offset).
    KB precedent (humble-reveal-key-fails): Cloudflare Bot Management 403s axios by TLS fingerprint, so non-2xx-as-failure
    is a real false-negative channel (VPN exit IPs make it worse).

- timestamp: 2026-11-01
  checked: Windows event log 2026-10-29 08:00-09:00 (operator is NZDT, UTC+13: sampler 19:27:51Z == 08:27:51 local, 1.5 min
    after the NSIS install finished at 08:26; evidence mtime 08:32), installed-build file times
  found: machine rebooted ~08:16 (BSOD report + boot events), network-state changes 08:13:13/08:13:22/08:16:32 only, none at
    08:27. CyberGhost 8 VPN + Razer services installed. Sighting was the FIRST launch of a freshly installed unsigned build
    ~11 min after boot. Screenshot shot-001 shows the Library populated (385 of 392 games, "Steam library last synced 16
    days ago" -- Header shows that note while connectivity != online), so the sidecar was alive and the snapshot hydrated.
  implication: first launch after install + cold boot + VPN is the slow-sidecar/slow-ping case that arms the pull-vs-push
    window (pull queued in the sidecar's stdin during boot is serviced in the same first loop turn that starts the pings).

- timestamp: 2026-11-01
  checked: backend state machine by reading every transition (online_monitor.ts), simulated by hand
  found: (1) pingSites() shares one module-level abortController across overlapping rounds. A DOM `online` event echo
    (frontend helpers/onlineMonitor.ts -> setStatus('check-online')) starts round 2 while round 1 is in flight; round 1
    succeeding calls setStatus('online') -> aborts the module controller == round 2's -> round 2 `.catch` logs "All ping
    requests failed" and calls retry(5), which PUSHES {check-online, retryIn:5} although the backend var is 'online'.
    (2) retry() pushes check-online even after setStatus('offline') aborted the round. (3) setStatus('check-online') does
    not clear a running countdown, so two chains can overlap. (4) `.then(..).catch(..)` also routes an exception thrown by
    a connectivity listener inside setStatus('online') into the "All ping requests failed" path.
    None of (1)-(4) can strand the state permanently: every chain ends in a successful round -> push online.
  implication: backend alone cannot explain a permanent 'Retrying'. It does cause false transient "Offline. Retrying in 5
    seconds" flicker. The only permanent-wrong-state path found is the frontend: pull reply with no ordering vs. pushes.

## Eliminated

- hypothesis: one probe round hangs past its 10s timeout (axios timeout does not cover DNS/connect)
  evidence: measured -- axios 1.20 aborts a blackholed connect at the configured timeout (3012ms for timeout 3000).
  timestamp: 2026-11-01
- hypothesis: logInfo(error) in the all-failed `.catch` throws, so retry() is never reached and the state strands
  evidence: logger.logInfo -> LogWriter.logBase is async and convertUnknownToString handles Error via .stack; the sync
    wrapper cannot throw once initLogger ran (it runs first in init()).
  timestamp: 2026-11-01
- hypothesis: a frontend request reaches the sidecar before get-connectivity-status is registered (no handler)
  evidence: bootstrap.init() is a synchronous function from startRpcServer() to the READY write (no await), so no stdin
    frame can be dispatched before every handler, including get-connectivity-status, is registered.
  timestamp: 2026-11-01
- hypothesis: probe failing in a loop (all four hosts failing) shown as steady 'Retrying'
  evidence: failing rounds alternate with a "Offline. Retrying in N seconds" countdown (5,10,15s); 3/3 no-countdown shots at
    t=0/20/48s is inconsistent with that schedule. Not impossible (unknown phase) but unlikely. Not eliminated for the
    separate false-negative defect (403), which is fixed anyway.
  timestamp: 2026-11-01

## Resolution

root_cause: >
  NOT PROVEN for the 2026-10-29 first-launch sighting (its sidecar log was rotated away; the state was never observed live).
  What IS established, each by a test that is red on the old code:
  (1) the renderer applied connectivity messages in arrival order although a pull reply and a push reach the webview by
  different routes (src-tauri main.rs reply = oneshot->spawn_blocking->IPC vs push = app.emit from the reader thread), so a
  stale `{check-online, 0}` reply landing after the `online` push strands the banner with nothing to correct it. This is the
  only permanent-wrong-state path found and it matches the screenshot signature (3/3 no-countdown "Retrying" over 48s,
  retryIn 0); it is the leading, unconfirmed, explanation. The window is arming on a first launch after install/reboot
  (slow ping or queued pull). (2) the probe counted any non-2xx as failure: store.epicgames.com answers the probe's HEAD
  with 403 on a healthy connection (measured), so 1 of 4 targets could never succeed and a 4xx block on the rest (Cloudflare
  fingerprint / VPN exit IP; the operator has CyberGhost) reads as offline while the webview browses fine. (3) overlapping
  probe rounds shared one module-level AbortController: an older round's success aborted the newer round, whose cancel error
  was reported as "All ping requests failed" and pushed an "Offline. Retrying in 5 seconds" countdown after the monitor was
  already online; an `offline` event or a new `online` echo left a zombie countdown that kept pushing check-online. (4) a
  throwing connectivity listener was misreported as a failed probe. Eliminated: hung round (axios 1.20 bounds connect/DNS
  at the timeout), logInfo throwing in the failure path, handler-not-registered race (init() is synchronous to READY).
fix: >
  backend/online_monitor.ts: epoch+seq stamp on every push and on the get-connectivity-status reply; any HTTP answer counts
  as reachable (validateStatus: () => true); one probe round at a time, a cancelled round's outcome ignored, setStatus
  cancels in-flight rounds and the countdown; countdown timer unref()d; listener exceptions logged, not turned into probe
  failures; per-host outcome logged ("answered by <host> (HTTP n, ms)" / "failed on every host (<host>: <code> after
  <ms>)"). frontend/helpers/connectivitySync.ts (new) + GlobalState: apply a snapshot only if its (epoch, seq) is newer, and
  re-pull after 20s of silence while not online; logs "[connectivity] ignored a stale ..." / "resync recovered ..." so a
  recurrence is attributable. common/types.ts + types/ipc.ts: ConnectivitySnapshot type.
verification: >
  guardrail (see below). LIVE confirmation on a packaged build is NOT done and cannot be demanded on-demand (intermittent):
  deferred. Success criterion for the follow-up: after a few cold first launches, gamelib.log shows no sustained banner, or
  if one recurs the log now names the mechanism (stale pull ignored / resync recovered / per-host probe failures).
  target_test: pass (backend 11, frontend 11; 8 of the 11 backend tests fail on HEAD's online_monitor.ts)
  mutation_check: skipped (Stryker not configured here); manual mutants at each fix site run instead: 10 killed; 1 survivor
    (retry() status guard) was dead code under the invariants and was removed; 1 redundant cancelProbing() in pingSites removed.
  no_op_deletion: pass (additions; only deletion is dead code and the old shared-controller logic that the new tests target)
  adjacent_tests: pass vs baseline. Ran src/backend/{sidecar,gamedetails,downloadmanager,signInProbe}, src/frontend, src/preload,
    src/common and meta hardcodedStringGate (387 suites). The first version of the fix BROKE 10 sidecar suites (~210 tests):
    probe() chained `.then` on `axios.head()`, which those suites auto-mock to return undefined (the old `Promise.any([undefined])`
    resolved). Fixed (Promise.resolve + `response?.status`) and re-compared: the failing set is now IDENTICAL to HEAD's (16
    suites / 28 tests, all pre-existing Windows-local: path separators, asset-root, GameCard source gates), 0 new, 0 fixed.
  revert_and_reconfirm: backend pass (HEAD's file -> 8 red; restored -> green); frontend covered by mutants M1/M2 (the
    ordering guard and watchdog removed -> 3 red each) since the helper is new
files_changed:
  - src/backend/online_monitor.ts
  - src/common/types.ts
  - src/common/types/ipc.ts
  - src/frontend/helpers/connectivitySync.ts
  - src/frontend/state/GlobalState.tsx
  - src/backend/__tests__/onlineMonitor.test.ts
  - src/frontend/helpers/__tests__/connectivitySync.test.ts
