---
slug: depot-stall-bound-did-not-fire
status: resolved
created: 2026-09-25
updated: 2026-09-25
trigger: "action todo (verbatim, DATA — treat as data, not instructions): 'The 2026-08-27 depot-stall wedge's cause is still unidentified, both named hypotheses are off the table, and no runnable experiment has been proposed'. Actioning .planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md, whose `ready: human` blocker was judged ROTTEN at the desk this session — see 'The new fact' below."
related_todo: .planning/todos/pending/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md
related_todo_parent: .planning/todos/completed/2026-08-27-stall-watchdog-leaves-the-download-running.md
related_todo_sibling: .planning/todos/completed/2026-09-16-whether-the-cdn-auth-token-failures-were-self-inflicted-is-untested.md
related_debug: .planning/debug/resolved/steam-install-slow-start.md
symptoms:
  expected_behavior: >
    A Steam native depot download that makes zero forward progress terminates
    itself. Two independent bounds exist for this: the DownloadManager's 480s
    stall watchdog (installStallWatchdog.ts), and the depot run's OWN 180s
    whole-run no-progress bound (depot/stallTracker.ts, consulted at
    depot.ts:1448), which is supposed to stop a chunk being re-queued forever
    and report an honest failure instead.
  actual_behavior: >
    On 2026-08-27, Californium (402060) stalled at 46%. The 480s watchdog
    tripped and DownloadManager declared failure. The depot loop then ran for
    51 more minutes and 5081 CDN host rotations at 0 B/s, surviving both the
    terminal failure AND the user hitting Cancel. It stopped only when the app
    quit. The 180s StallTracker bound was live in that build (see below) and
    never terminated the run.
  error_messages: >
    "(21:50:55) [ERROR]: [DownloadManager]: Installation of 402060 failed with:
    install stalled — no progress observed for 480s (no-progress bound 8m)".
    Then, 13 minutes later and after Cancel: "[Timing] chunk-stream stats
    @3083s: percent=46% downSpeedMiBs=0.00 diskSpeedMiBs=0.00
    totalAttempts=6957 rotations=5081". Concurrently every CDN host was
    returning an empty auth token ("CdnAuthTokenCache: GetCDNAuthToken ...
    empty response", eresult=1).
  timeline: >
    Observed once, live, during the 34.13 UAT on the Electron shell,
    2026-08-27. Never reproduced. Abort DELIVERY was separately proven working
    on 2026-09-08 by a live pf packet-drop gate on Tauri (BATTLETECH 637090):
    the loop died in the same second as the abort. So whatever wedged on
    2026-08-27 is not a cancellation-delivery defect.
  reproduction: >
    None known. Three forcing methods have been measured to FAIL and must not
    be retried (see the todo's "Forcing methods already measured to FAIL").
    This session is DESK work — no live re-drive is required or wanted.
---

# Debug: the depot run's own 180s no-progress bound did not fire during a 51-minute 0 B/s wedge

## The new fact this session opens on (measured at the desk, 2026-09-25)

Neither the todo nor its completed parent records this, and it reframes the whole question.

**The depot download run already had a 180s whole-run no-progress bound on 2026-08-27, and it did
not fire.**

- `src/backend/storeManagers/steam/depot/stallTracker.ts` — `StallTracker`,
  `STALL_TIMEOUT_MS = 3 * 60 * 1000`.
- Wired in `depot.ts`: constructed at `:2261` (`new StallTracker()`), passed at `:1632` and
  `:2565`, `recordProgress()` called at `:1409` after every successful chunk write, and the guard
  at `:1448` — `if (stallTracker && !stallTracker.hasStalled()) { queue.push(chunk); continue }`,
  else throw an honest failure.
- All of it — the tracker file, the construction, `recordProgress`, and the `hasStalled` guard —
  landed in **one** commit, `33c108a0e`, dated **2026-07-18**: forty days BEFORE the wedge.
  `git log -S` over `depot.ts` for `hasStalled`, `stallTracker?.recordProgress` and
  `new StallTracker()` each return exactly that one commit. The only later touch is `269952344`
  (2026-09-22), a ts-prune un-export refactor with no behavioural change.

So the 2026-08-27 behaviour happened **with a live 180s give-up bound sitting in the re-queue
path**. That is an anomaly explainable by reading code and writing a deterministic unit test — not
by a live re-drive.

## Why this supersedes the todo's own framing

The todo states its discriminator as a live re-drive "in which the wedge sits inside the
empty-auth-token rotation loop specifically, with fallback to the non-token hosts also prevented",
and says nobody has specified how to prevent that fallback — which is why it carries `ready: human`
and "no runnable experiment". **That framing is on the wrong axis.** The question "why did an
existing 180s bound not stop a 51-minute zero-progress run?" is answerable at the desk, needs no
second Steam account, no `pf`, and no reproduction of the original network conditions.

## Current Focus

```yaml
hypothesis: "CONFIRMED (mechanism (c), with the swallow site named). The 180s bound is documented as a WHOLE-RUN terminator but is implemented as a PER-CHUNK decision whose only consequence is failing ONE FILE. downloadDepotFiles' file-worker loop (depot.ts:2526-2610) catches that throw, pushes a DepotDownloadFailure and pulls the NEXT job. `failures.length` is never a loop-exit condition, so a run with zero forward progress walks its entire remaining file queue at roughly one CHUNK_FETCH_ATTEMPTS exhaustion (8 x 15s timeout + 12s backoff = ~132s) per file per worker slot, bounded only by the 32-slot InflightLimiter. The bound fired; nothing acts on it at run scope."
test: "Deterministic unit test at downloadDepotFiles scope with fetchChunk mocked to always reject and an injected StallTracker: control arm (1h timeout) attempts every file; stalled arm (-1 timeout) must stop the run instead of grinding the queue."
expecting: "Stalled arm is RED before the fix (all N files attempted, N failures) and GREEN after (run stops, one honest stall failure, fetchChunk never called for the remaining files)."
next_action: "DONE — fix applied at depot.ts file-worker loop; see Resolution."

reasoning_checkpoint:
  hypothesis: "The run did not terminate because nothing in depot.ts terminates a RUN on a stall. StallTracker.hasStalled() is consulted at exactly one site (depot.ts:1448), inside downloadFileChunks' per-chunk catch, and its `true` branch throws a per-FILE error that downloadDepotFiles' per-file catch swallows into `failures` before continuing to the next job."
  confirming_evidence:
    - "`grep -n 'hasStalled' src/backend/storeManagers/steam/depot.ts` returns exactly ONE consult site: :1448. (Population: all of depot.ts; the stallTracker.ts definition at :80 is the declaration, not a consult.)"
    - "depot.ts:2577 catch { failures.push(...) } then falls through to the bottom of `while (queue.length)` — no rethrow, no break, no return."
    - "`grep -n 'failures.length' src/backend/storeManagers/steam/depot.ts` returns :1228 :2596 :2602 :2673 :2711 :2746 :3229 — ALL of them either a logging cap (2596/2602) or a POST-loop verdict. None is inside the worker loop. There is no failure ceiling that ends the run."
    - "CHUNK_FETCH_TIMEOUT_MS=15000 (decompress.ts:384), CHUNK_FETCH_ATTEMPTS=8 (depot.ts:1008), backoff 200+400+800+1600+3000+3000+3000=12000ms capped by CHUNK_FETCH_MAX_BACKOFF_MS=3000 (decompress.ts:717) => ~132s per exhaustion; TARGET_INFLIGHT_CHUNKS=32 (depot.ts:995) caps concurrent network attempts at 32."
    - "Arithmetic against the 2026-08-27 line: attempts at index 0 = 6957-5081 = 1876 fetchChunk invocations, mean 3.71 attempts each. Solving 8x+1(1-x)=3.71 gives x=0.387 => ~726 full 8-attempt exhaustions. 726 x 132s / 32 slots = ~2995s, against an observed 3083s run. The whole 51 minutes IS the grind."
  falsification_test: "If hasStalled() were consulted anywhere that ends the RUN (a break/return/throw out of the file-worker loop, or a failures-length ceiling), the run would have terminated ~180s after the last byte. A grep over depot.ts for hasStalled and for failures.length shows no such site. Any such site found would falsify this."
  fix_rationale: "Add the missing run-scoped consult: check stallTracker.hasStalled() at the TOP of downloadDepotFiles' file-worker loop, record ONE honest failure, and stop taking new files. This addresses the root cause (the bound has no run-scoped effect), not the symptom (a specific CDN condition)."
  blind_spots: "(a) is NOT eliminated — whether recordProgress() was still firing on 2026-08-27 cannot be settled from the preserved evidence (see Eliminated). The fix is deliberately chosen to be correct under BOTH branches: if recordProgress was NOT firing, the new gate ends the run at 180s; if it WAS firing (a genuine sub-1%/13min trickle), the gate never fires and behaviour is unchanged. The fix also does not interrupt files ALREADY in flight — they drain within one ~132s exhaustion. That residual is named, not fixed."
```

### The three candidate mechanisms — discriminate, do not assume

- **(a) `recordProgress()` WAS being called.** Bytes were landing somewhere, and
  `downSpeedMiBs=0.00` in the stats line is a rounding/windowing artefact of the stats reporter
  (`depot.ts:2416`; note the comment at `:2623` that attempts/timeouts/rotations "are always
  meaningful even at totalBytes=0"). If so the bound works as designed and the defect is elsewhere.
- **(b) No chunk ever reached the `catch` at `depot.ts:1409-1448`,** because the empty-auth-token
  host rotation retries below the `CHUNK_FETCH_ATTEMPTS` budget inside `fetchChunk`
  (`depot/decompress.ts:906`) and never exhausts it. `totalAttempts=6957` vs `rotations=5081` over
  3083s is the evidence to interrogate.
- **(c) The throw fired, was swallowed upstream, and the run restarted or continued.**

## Constraints on this session (inherited from the todo, and binding)

- **Do NOT re-run** anything in the todo's "What has been ruled out" table (hypotheses A registry
  clobber, B abort-blind CDN auth, C account/IP throttling) or in its "Forcing methods already
  measured to FAIL" list. Read them; do not repeat them.
- **Desk work is the route.** Prefer code reading and a deterministic unit test — `StallTracker`
  takes an injectable `now` on every method expressly so `hasStalled()` can be exercised without
  sleeping for real minutes.
- **Whatever the outcome, REWRITE** the todo's "Why `ready: human`" and "The discriminator that
  would settle it" sections rather than merely ticking it, so the rotten rationale does not outlive
  the todo. If (a) or (b) yields a corrective that is cheap and safe under every branch of the
  remaining unknown, ship it and close the todo — the unknown does not have to be dissolved, only
  made not worth knowing.
- Per CLAUDE.md: every task's verify step runs `npx prettier --check` over the **exact explicit
  paths written** (never `.`), and any file created or edited under `.planning/todos/pending/`
  carries `severity:` / `platform:` / `ready:` in that order.

## Evidence

- timestamp: 2026-09-25 (desk, this session)
  finding: >
    The entire 180s whole-run no-progress bound (StallTracker + its depot.ts wiring) predates the
    2026-08-27 wedge by forty days, landing in `33c108a0e` on 2026-07-18 and behaviourally
    untouched since. Therefore the wedge occurred WITH the bound live. Source: `git log -S` on
    `hasStalled`, `stallTracker?.recordProgress`, and `new StallTracker()` over
    `src/backend/storeManagers/steam/depot.ts`, each returning exactly one commit.

- timestamp: 2026-09-25 (desk)
  checked: "Line-number drift in this file's own citations, against HEAD."
  found: >
    NO drift. Every cited line is still correct at HEAD: depot.ts :1311 and :1498
    (the two `stallTracker?: StallTracker` optional params), :1409
    (`stallTracker?.recordProgress()`), :1448 (the `hasStalled()` guard), :1632
    (pass into downloadFileChunks), :2261 (`new StallTracker()`), :2416 (the
    `[Timing] chunk-stream stats` template literal), :2565 (pass into
    downloadSingleFile), :2623 (the "always meaningful even at totalBytes=0"
    comment); and depot/decompress.ts:906 (`export async function fetchChunk`).
  implication: "The session file's map of the code is trustworthy; no re-survey needed."

- timestamp: 2026-09-25 (desk)
  checked: "Every call site of the two functions carrying an OPTIONAL `stallTracker` param — the 'caller dropped the argument' trap."
  found: >
    PRODUCTION THREADING IS COMPLETE. `downloadFileChunks` has exactly 2
    occurrences in depot.ts (`grep -rn 'downloadFileChunks(' src/` => 2 in
    depot.ts, 6 in __tests__/depot.test.ts): the definition at :1274 and ONE
    call at :1617, inside `downloadSingleFile`, which passes `stallTracker` at
    :1632. `downloadSingleFile` has exactly one non-test call site, at :2530
    inside downloadDepotFiles' file-worker loop, which passes the run's
    `stallTracker` at :2565. `downloadDepotFiles` has exactly one non-test call
    site, `downloadSteamDepots` at :3211 (it constructs its own tracker at
    :2261, so nothing to thread). The six test call sites deliberately omit it
    — that omission is the documented pre-cycle-7 control and is asserted on by
    depot.test.ts:2978.
  implication: >
    The optional-parameter trap does NOT apply. The tracker reached the guard on
    the live 2026-08-27 path. The defect is NOT a dropped argument.

- timestamp: 2026-09-25 (desk)
  checked: "Where `totalAttempts` / `totalRotations` increment, and whether a CDN host rotation consumes a CHUNK_FETCH_ATTEMPTS attempt."
  found: >
    Both increment in ONE place, depot.ts:2302-2303, inside the `onAttempt`
    callback: `totalAttempts++` then `if (ev.attempt > 0) totalRotations++`.
    Rotations are therefore a STRICT SUBSET of attempts, derived from the same
    event — a rotation cannot exist without an attempt. And in
    `fetchChunk` (decompress.ts:906) host selection happens ONCE PER ITERATION
    of the bounded `for (let i = 0; i < attempts; i++)` loop
    (`hostHealth.pickHost(hosts, seed, i, workerSlot)` / the
    `hosts[(seed + i) % hosts.length]` fallback). There is no inner rotation
    loop anywhere below it.
  implication: >
    5081 rotations over 3083s were 5081 CONSUMED attempts out of 6957. The
    budget was being exhausted continuously, not bypassed.

- timestamp: 2026-09-25 (desk)
  checked: "The empty-auth-token path specifically — does it return THROUGH fetchChunk's attempt loop, or rotate inside it?"
  found: >
    THROUGH it, and it does not even fail the attempt. decompress.ts:1076-1079:
    `const token = wantsCdnAuthToken(meta) && cdnAuth ? await cdnAuth.getToken(depotId, host, signal) : ''`.
    Per cdnAuth.ts's own contract (quoted verbatim in the comment at
    decompress.ts:1054-1057) `getToken` NEVER throws and NEVER blocks past its
    own bounded 3000ms timeout — an empty/failed token degrades to `''` and the
    attempt PROCEEDS token-less against the same host. It is a URL-suffix
    decision, not a retry construct.
  implication: "There is no empty-token rotation loop to be wedged inside. Mechanism (b) is dead."

- timestamp: 2026-09-25 (desk)
  checked: "`hasStalled()` consult sites across the whole backend."
  found: >
    EXACTLY ONE: depot.ts:1448, inside `downloadFileChunks`' per-chunk `catch`.
    (Command: `grep -n 'hasStalled' src/backend/storeManagers/steam/depot.ts
    src/backend/storeManagers/steam/depot/*.ts` — population is depot.ts plus
    every file in depot/; hits are depot.ts:1448 and the declaration at
    stallTracker.ts:80.) Its `true` branch throws an Error whose message is the
    chunk's own error plus `(download stalled: no forward progress for Nms
    across the whole run)` — a PER-FILE rejection out of downloadFileChunks'
    `Promise.all`.
  implication: >
    The bound's ONLY power is to stop re-queuing one chunk and fail one file.
    Nothing consults it at run scope. The doc comment atop stallTracker.ts
    ("tracks whether the download run AS A WHOLE is still making forward
    progress ... give up honestly") describes an intent the wiring never
    implements.

- timestamp: 2026-09-25 (desk)
  checked: "What downloadDepotFiles' file-worker loop does with that throw."
  found: >
    depot.ts:2526-2610. `while (queue.length) { if (opts.signal?.aborted) return;
    const job = queue.shift()!; try { await downloadSingleFile(...) } catch (err)
    { failures.push({file, error, cause}); if (failures.length <= FAILURE_LOG_CAP)
    logWarning(...) } }`. No rethrow, no `break`, no `return`. Confirmed by
    census: `grep -n 'failures.length' src/backend/storeManagers/steam/depot.ts`
    returns :1228 :2596 :2602 :2673 :2711 :2746 :3229 — 2596/2602 are the
    FAILURE_LOG_CAP=10 logging cap, and every other hit is a POST-loop verdict
    (allModesApplied, runLooksComplete, allFilesVerifiedThisRun) or
    downloadSteamDepots' final classification. NONE is inside the worker loop.
  implication: >
    ROOT CAUSE. A genuinely dead run does not stop — it walks its entire
    remaining file queue, spending one full CHUNK_FETCH_ATTEMPTS exhaustion per
    file per worker slot. This is mechanism (c), with the swallow site named.

- timestamp: 2026-09-25 (desk)
  checked: "Does the arithmetic of the 2026-08-27 stats line fit that grind?"
  found: >
    CHUNK_FETCH_TIMEOUT_MS=15000 (decompress.ts:384) x CHUNK_FETCH_ATTEMPTS=8
    (depot.ts:1008) + backoff 200+400+800+1600+3000+3000+3000=12000ms (capped by
    CHUNK_FETCH_MAX_BACKOFF_MS=3000, decompress.ts:717) = ~132s per exhaustion,
    with at most TARGET_INFLIGHT_CHUNKS=32 (depot.ts:995) concurrent network
    attempts. Attempts at index 0 = 6957 - 5081 = 1876 fetchChunk invocations;
    mean 3.71 attempts each; solving 8x + 1(1-x) = 3.71 gives x = 0.387, i.e.
    ~726 full exhaustions. 726 x 132s / 32 slots = ~2995s of wall clock, against
    the observed 3083s.
  implication: >
    The predicted grind rate accounts for essentially the ENTIRE 51 minutes. The
    observation needs no extra ingredient — no restart, no second controller, no
    hidden loop. Treat the fit as corroboration, not proof (it assumes a clean
    two-population split of invocations); the code census above is the primary
    evidence.

- timestamp: 2026-09-25 (desk)
  checked: "Is there a SECOND, already-measured instance of this same non-termination? (Re-reading the parent todo's 2026-09-08 pf live gate.)"
  found: >
    YES, and nobody noticed it. That gate's own timeline records the last
    progress advance at 07:33:46 and the depot loop still emitting stats at
    07:41:41 — 475 SECONDS of established zero progress, on Tauri, on sidecar
    e08997f35, with the 180s bound live. The loop died only when the EXTERNAL
    abort arrived, not by its own bound. Under the ~132s-per-exhaustion figure
    that is 3-4 grind cycles.
  implication: >
    The 2026-08-27 wedge is NOT a one-off, and the "unreproducible" framing was
    wrong. The behaviour was reproduced on demand on 2026-09-08; it was simply
    read as "abort works" rather than "the self-bound still does not".

## Eliminated

- hypothesis: "A — registry clobber strands the first run's AbortController."
  by: "2026-09-08 live gate (quick 260908-asd). The controller was live, the abort was delivered, the loop died in the same second. Carried over from the todo; not re-tested here."
- hypothesis: "B — the abort-blind CDN auth path cannot be cancelled."
  by: "NEUTRALISED (not tested) by quick 260909-q2o, which threaded the existing signal through getToken. It can no longer produce the symptom even if it was true. Carried over from the todo."
- hypothesis: "C — account/IP throttling produced the wall of empty auth tokens."
  by: "ELIMINATED at the desk by quick 260923-vnv over five preserved captures spanning three titles, four depots and three dates: `CDN auth token acquired` appears ZERO times in any capture ever preserved, the control log shows all three hosts empty on the FIRST token request of a cold session with no prior cancel, and every response is eresult=1 (k_EResultOK) with a constant rawBodyBytes=8 — a deliberate tokenless OK, not a rejection. Carried over from the todo."

- hypothesis: "(b) No chunk ever reached the catch at depot.ts:1409-1448, because the empty-auth-token host rotation retries BELOW the CHUNK_FETCH_ATTEMPTS budget inside fetchChunk and never exhausts it."
  by: >
    ELIMINATED at the desk, 2026-09-25, on three independent grounds.
    (1) `fetchChunk` (decompress.ts:906) is a BOUNDED `for (let i = 0; i < attempts; i++)`
    loop that always falls out to a `throw` after `attempts` iterations — there is no
    inner retry construct anywhere below it.
    (2) Host selection happens ONCE PER ITERATION of that loop
    (`hostHealth.pickHost(hosts, seed, i, workerSlot)`, or the
    `hosts[(seed + i) % hosts.length]` fallback), so a rotation CONSUMES an attempt by
    construction; and `totalRotations` is literally derived from the same event as
    `totalAttempts` (`depot.ts:2302-2303`: `totalAttempts++; if (ev.attempt > 0)
    totalRotations++`), making rotations a strict subset of attempts. 5081 of the 6957
    attempts were rotations — the budget was being burned, not bypassed.
    (3) The empty-auth-token path is not a retry construct at all: `getToken` never
    throws and never blocks past its own 3000ms bound, an empty token degrades to `''`
    and the attempt proceeds token-less against the SAME host (decompress.ts:1076-1079).
    It decides a URL suffix, nothing more.

- hypothesis: "(a) recordProgress() WAS being called — bytes were landing and downSpeedMiBs=0.00 is a windowing artefact, so the bound worked as designed and the defect is elsewhere."
  by: >
    NOT ELIMINATED — and deliberately NOT relied upon. It cannot be settled from the
    preserved evidence: the watchdog re-arms on a CHANGE in `getFileSize(doneBytes)`, a
    ROUNDED string, and the stats line's `downSpeedMiBs` is a rolling one-second window
    (`rollingRateMiBs`, depot.ts:1044, `MIN_RATE_WINDOW_SEC=0.05`,
    `PROGRESS_HEARTBEAT_MS=1000`), so neither number strictly excludes a sub-1%-per-13-min
    trickle. It is MOOT, which is the point: the root cause below holds under BOTH
    branches, and so does the fix. If recordProgress was NOT firing, the new run-scoped
    bound ends the run at STALL_TIMEOUT_MS. If it WAS firing, the bound correctly stays
    silent (the run is progressing) and the separate 480s DownloadManager watchdog still
    trips and aborts — proven working on two paths by the 2026-09-08 live gate. There is
    no branch left in which a run continues indefinitely after being declared failed.

## Resolution

- root_cause: >
    The 180s no-progress bound is DOCUMENTED as a whole-run terminator
    (stallTracker.ts's own header: "tracks whether the download run AS A WHOLE is still
    making forward progress ... give up honestly") but is IMPLEMENTED as a per-chunk
    decision whose only consequence is failing ONE FILE. `hasStalled()` had exactly one
    consult site in the entire backend — `downloadFileChunks`' per-chunk catch at
    depot.ts:1448 — and its `true` branch throws a per-FILE error out of that function's
    `Promise.all`. `downloadDepotFiles`' file-worker loop catches it at depot.ts:2577,
    pushes a `DepotDownloadFailure`, and pulls the next job; `failures.length` is never a
    loop-exit condition anywhere in the file. So a run with zero forward progress did not
    stop — it walked its entire remaining file queue, spending one full
    CHUNK_FETCH_ATTEMPTS exhaustion (8 x 15s timeout + ~12s backoff = ~132s) per file per
    worker slot, bounded only by TARGET_INFLIGHT_CHUNKS=32. The 2026-08-27 "wedge" was
    not a wedge; it was a grind, and the arithmetic of its own stats line
    (~726 exhaustions x 132s / 32 slots = ~2995s vs the observed 3083s) accounts for
    essentially all 51 minutes. The bound fired the whole time. Nothing acted on it at
    run scope. Mechanism (c), with the swallow site named.

- fix: >
    Added the missing RUN-SCOPED consult. `downloadDepotFiles`' file-worker loop now
    checks `stallTracker.hasStalled()` at the top of `while (queue.length)`, immediately
    after the existing abort check: on a stalled run it records ONE honest failure naming
    how many files are being abandoned (one-shot latch, not one per worker — all
    FILE_CONCURRENCY workers share the event-loop thread, so it is race-free) and returns
    without taking another job. `DownloadDepotFilesOpts.stallTracker` was added as an
    optional caller-supplied tracker (the same testability rationale the `hosts` param
    already carries), defaulting to the exact `new StallTracker()` that line always
    constructed — production behaviour on the non-stalled path is byte-for-byte unchanged.
    Deliberately no stricter than the per-chunk guard it completes: a successful attempt
    is bounded at 15s and a full exhaustion at ~132s, so a merely-slow run cannot reach a
    180s zero-progress window. Scope limit, named not fixed: this stops the run taking NEW
    files; files already in flight drain through their own per-chunk guard within one
    ~132s exhaustion, since interrupting them needs an abort signal this function does not
    own.

- verification: >
    DESK-VERIFIED with a measured red->green, not an inspected one.
    RED (fix temporarily removed, plumbing left in place):
      "a run with ZERO forward progress stops taking new files instead of grinding the
       rest of the queue — the 2026-08-27 non-termination
         Expected number of calls: 32
         Received number of calls: 40"
    i.e. every file in a 40-file plan was attempted on a run whose progress clock had
    been dead for ten simulated minutes. GREEN with the fix restored.
    Control arm (hour-long window, resolving fetchChunk): all 40 files still attempted,
    zero failures — the new check never fires on a progressing run.
    Full battery, all green and all actually run (not inferred):
      - `npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam'`
        => 44 suites, 1502 tests passed (1500 at HEAD; +2 new). The
        "worker process has failed to exit gracefully" warning is PRE-EXISTING —
        reproduced identically at HEAD with these two files stashed.
      - `npx tsc --noEmit -p tsconfig.json` => exit 0
      - `pnpm lint` => exit 0, both ceilings at their exact HEAD values (1106 and 638).
        One `@typescript-eslint/require-await` warning was introduced by an
        `async () => throw` mock and pushed the 638 ceiling over; rewritten to return an
        already-rejected promise, restoring the baseline.
      - `pnpm find-deadcode` => "unreachable: 46 OK | used-in-module: 0 OK"
      - `npx prettier --check` over the two exact written paths => all conforming
      - `pnpm planning-gates` => 12/13. The single failure is
        `.planning/quick/260925-uok-.../` stray envelope tags, PRE-EXISTING at HEAD
        (those three files are tracked, unmodified by this session, and last touched by
        commit 20ffb98e7). `todo-frontmatter-gate.py` PASSES.
    NOT DONE, and not claimed: no live re-drive. Per this session's binding directive the
    route was desk work, and a live run cannot add anything the red->green measurement
    did not — but it would be the only way to observe the end-to-end termination on real
    hardware.

- files_changed:
    - "src/backend/storeManagers/steam/depot.ts — run-scoped hasStalled() check in downloadDepotFiles' file-worker loop; optional injectable stallTracker on DownloadDepotFilesOpts"
    - "src/backend/storeManagers/steam/__tests__/depot.test.ts — new 'run-scoped no-progress bound' describe: stalled arm (the red->green pin) + healthy control arm"
    - ".planning/todos/completed/2026-09-16-the-2026-08-27-depot-stall-cause-is-unidentified-with-no-proposed-experiment.md — 'Why ready: human' and 'The discriminator that would settle it' REWRITTEN, not ticked; closed"
