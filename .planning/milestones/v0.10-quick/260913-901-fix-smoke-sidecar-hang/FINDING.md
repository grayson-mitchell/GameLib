# FINDING — why the sidecar does not exit under the real HOME (quick-260913-901)

Measured 2026-09-13 against `43ae1eb969463d57b4da4795fc53802066fe362d`, Node v26.2.0, macOS.
Bundle under test: `build/main/sidecar.js`, sha256
`790b976f003d246534521c3ba01bed80b0fefc8df10ed1c7f2099f2ca5aec5e1`.
`pnpm planning-gates` baseline at that sha: **11/11**.

---

**HOLDER:** the repeating 5-minute `setInterval` armed by `setPresence()` in
`src/backend/storeManagers/gog/presence.ts:39`
(`interval = setInterval(setPresence, 5 * 60 * 1000)`) — never `.unref()`'d, so it references the
libuv event loop for the life of the process. Owner module:
`src/backend/storeManagers/gog/presence.ts`. Named by: the async_hooks timer probe extract
(Evidence 2), corroborated by the Node diagnostic report's single referenced+active `timer`
handle (Evidence 1).

---

## How the objective's contradiction resolved

The objective recorded a genuine paradox: at t=40s the process held "exactly two handles, both
stdio pipes" and `process._getActiveRequests()` returned 0, yet the process never exited.

That paradox was an **instrument artefact, not a property of the process**.
`process._getActiveHandles()` reports `libuv` handles that have a JS wrapper object. It does
**not** report JS timers: every `setTimeout`/`setInterval` in a Node process is multiplexed onto a
*single* internal `uv_timer_t` (`env->timer_handle()`) that has no JS wrapper and therefore never
appears in `_getActiveHandles()`. `_getActiveRequests()` does not report timers either.
`process.getActiveResourcesInfo()` would have shown it; `_getActiveHandles()` structurally cannot.

So "zero handles, zero requests, no exit" was always consistent with "one ref'd JS timer".

### Evidence 1 — Node diagnostic report, real HOME, SIGUSR2 at t=40s

Run exactly as the gate runs it (cwd = repo root, stdin = an immediately-closed pipe),
`--report-on-signal`. Process did **not** exit; SIGKILL at t=60s. Full `libuv` table:

```
type      is_active  is_referenced   address
async     true       false           0x0000000109b0f980
async     true       false           0x000000010695e0a0
timer     true       TRUE            0x0000000109b29188   <-- THE ONLY REFERENCED+ACTIVE HANDLE
check     true       false           0x0000000109b29220
idle      false      true            0x0000000109b29298   (inactive - cannot hold the loop)
prepare   true       false           0x0000000109b29310
check     true       false           0x0000000109b29388
async     true       false           0x0000000109b29400
signal    true       false           0x0000000109b2c2a8
fs_event  true       false           0x0000000c333d0228   (installed.json watcher - correctly unref'd)
tcp       true       false           0x0000000c33c28270  fd=18
tcp       true       false           0x0000000c33c28430  fd=15
timer     true       false           0x0000000c33c50c10
loop      true       -               0x000000010696ff00
```

Exactly **one** referenced-and-active handle: a `timer`. Its address `0x109b29188` sits inside the
same contiguous block as Node's other internal per-`Environment` handles (`check` `…9220`, `idle`
`…9298`, `prepare` `…9310`, `check` `…9388`, `async` `…9400`) — i.e. it is
`env->timer_handle()`, the one libuv timer that drives all JS timers. A ref'd JS timer was pending.

Note also what is **not** holding the loop: both `tcp` handles are unreferenced, and the
`fs_event` (the `installed.json` watcher) is unreferenced — its existing `unref()` in
`src/backend/sidecar/installedJsonWatcher.ts:150` is doing its job. The 2026-08-29 watcher
incident has **not** regressed.

### Evidence 2 — async_hooks timer probe, real HOME (names the timer)

Preloaded probe tracking every `Timeout` resource with its creation stack, dumping those still
alive **and** still `hasRef()`. The probe's own dump interval is `unref()`'d so it cannot be the
artefact the plan warns about. Identical output at t=10s, 20s, 30s **and** 40s:

```
--- REFD Timeout asyncId=1714 _idleTimeout=300000 _repeat=300000
    at initAsyncResource (node:internal/timers:170:5)
    at new Timeout (node:internal/timers:220:5)
    at setInterval (node:timers:161:19)
    at Object.setPresence (…/build/main/sidecar.js:2481:18)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
===== REFD_TIMER_COUNT=1 =====
```

`REFD_TIMER_COUNT=1`, stable across the whole run: **one** ref'd JS timer, repeating every
300000 ms (5 minutes), armed by `setPresence`. The bundle line maps to `presence.ts:38-40`:

```ts
if (!interval) {
  interval = setInterval(setPresence, 5 * 60 * 1000)
}
```

`beforeExit` **never fired** in this run — consistent with a ref'd timer: the loop never drains.

### Evidence 3 — why this is real-HOME-only

`setPresence()` returns early on
`disableGOGPresence || disablePlaytimeSync || !GOGUser.isLoggedIn() || !isOnline()`, and again on
a falsy `await GOGUser.getCredentials()`. Under the operator's real HOME a GOG account **is**
logged in, so the arm is reached; under an empty fake HOME `isLoggedIn()` is false and the
interval is never created. The real-HOME sidecar stdout confirms a live GOG session
(a `gogConfigStore` / `userData` frame — **redacted here, it carries the operator's GOG
username and userId**; see T-901-01). The fake-HOME stdout instead shows
`{"store":"configStore","key":"userInfo","deleted":true}`, i.e. no account.

That is exactly the observed shape: hangs forever under real HOME, exits under fake HOME.

---

## Falsified hypotheses (each with the measurement that killed it)

**1. stdout backpressure — FALSIFIED.**
A child writing past the ~64KB pipe buffer to an undrained stdout blocks forever. Three real-HOME
runs, identical env, differing only in where fd 1 goes:

```
pipe     -> NO EXIT (killed at 45.1s)
file     -> NO EXIT (killed at 45.1s)
devnull  -> NO EXIT (killed at 45.1s)
file-variant stdout bytes: 713      (backpressure threshold ~65536)
```

All three hang identically, including `/dev/null`, which cannot exert backpressure by
construction; total output is 713 bytes, ~1% of the pipe buffer. Not backpressure.

**2. Boot-time TLS sockets from `pingSites()` hold the loop under the real HOME — FALSIFIED.**
The todo's recorded root cause was "five live TLSSockets". At the timeout moment under the real
HOME the report shows **two** `tcp` handles and **both are `is_referenced: false`**. The pings had
already SUCCEEDED (`connectivity-changed {status:"online"}` was emitted). Sockets are not the
real-HOME holder. (The todo's snapshot was taken at t=3s, while the pings were still in flight —
it measured the boot transient, not the hang.)

**3. The `installed.json` FSWatcher regressed — FALSIFIED.**
The report's `fs_event` handle is `is_referenced: false`. The existing `unref()` holds.

**4. A blocked native thread / Keychain call (the plan's Step 1.3 leading hypothesis) —
FALSIFIED, and not investigated further.**
A blocked native call cannot be the cause when a referenced libuv timer is *already* sufficient to
explain non-exit, and the process is demonstrably live and responsive throughout (it emits frames,
completes pings, and services the probe's own 10s dump interval at t=10/20/30/40s — a process
blocked in native code on the main thread could not do that). `sample` was therefore not needed.
The project also ships no native keyring/keytar/fsevents addon (`package.json` has no `keytar`,
`chokidar` or `fsevents`); `graceful-fs` is pure JS.

**5. An un-unref'd `requestRustInvoke` timeout from the boot-time secret-store migrations —
FALSIFIED.** `REFD_TIMER_COUNT=1` and that one timer is `_repeat=300000` from `setPresence`. The
`rustInvoke` timers are already `.unref()`'d at `sidecarRpc.ts:392` and do not appear.

---

## Cold-boot cost attribution (the SECOND, separate defect)

A cold empty fake HOME exits in **27.6s / 28.2s** against the gate's 30s budget. This is a
**different holder** from the real-HOME hang and the presence fix does **not** address it.

Diagnostic report on a cold fake-HOME run at t=15s — five referenced+active `tcp` handles (vs
zero under real HOME). The async_hooks socket probe attributes them:

```
===== SOCKETPROBE t=5.0s  ===== REFD_SOCKET_COUNT=25
===== SOCKETPROBE t=10.0s ===== REFD_SOCKET_COUNT=25
===== SOCKETPROBE t=15.0s ===== REFD_SOCKET_COUNT=25
===== SOCKETPROBE t=20.0s ===== REFD_SOCKET_COUNT=25
===== SOCKETPROBE t=25.0s ===== REFD_SOCKET_COUNT=23
[SOCKETPROBE] beforeExit FIRED t=28.06s
[SOCKETPROBE] exit code=0 t=28.06s
```

Every one of the 25 is a pooled HTTP(S) keep-alive socket created through Node's shared agent:

```
at TLSSocket._wrapHandle (node:internal/tls/wrap:723:24)
at Agent.createConnection (node:https:367:18)
at Agent.createSocket (node:_http_agent:399:26)
at Agent.addRequest (node:_http_agent:339:10)
…
at RedirectableRequest._performRequest (node_modules/follow-redirects/index.js:337:24)
```

They are all born in the first **1.75 s** of boot (the `runOnceWhenOnline` fan-out), then sit
REFERENCED and idle in the agent's free-socket pool for ~25 s until the remotes close them. The
cold boot is not 27.6 s of *work* — it is ~2 s of work followed by ~26 s of waiting for idle
pooled sockets to be reaped. `beforeExit` fires 28.06 s in, immediately after the pool drains.

**This leaves CI a 2.3s margin on an always-cold runner, and it is a flake waiting to happen.**
Per the plan this is NOT in scope for Task 2's edit (different resource, different creation site);
it is filed as its own pending todo.

---

## Step 1.1 — what CI is actually hitting

`gh run list --workflow test.yml --limit 10` returns ten runs, all `success`, all
`pull_request` events on unrelated upstream-style branches (latest 2026-09-12T19:03Z). None is a
run of this branch, so **no CI run has yet exercised this defect**. The `Sidecar startup smoke`
step does exist (`.github/workflows/test.yml:31-32`, `run: pnpm smoke:sidecar`). CI runs cold, so
CI would have hit the 27.6s-vs-30s margin rather than the real-HOME never-exits; the never-exits
failure is reproducible only on a machine with a logged-in GOG account. Recorded, not blocked on.

---

## Which Task 2 branch this selects

**Branch A** — the report named a referenced+active libuv handle owned by our own code (a timer),
so the fix is to `.unref()` it at its creation site, `presence.ts:39`, with an in-situ comment.
This is the house pattern already used at `sidecarRpc.ts:392` and
`installedJsonWatcher.ts:130,150`. Not Branch B (the sockets are unreferenced under the real HOME
and are a separate, cold-boot-only issue), not Branch C (`beforeExit` never fired), not Branch D
(no blocked native thread), not Branch E (nothing here requires changing the gate's environment).

---

## Task 3 negative control — BLOCKING: THE GATE CANNOT DETECT ITS OWN FOUNDING REGRESSION CLASS

Protocol run as specified: `cp` backup + `shasum -a 256`
(`64cbc468979817a64ef2635fa4d4763166c5e47014d87cbc28bd821f6af5add7`), then
`throw new Error('NEGATIVE CONTROL 260913-901')` inserted as the first module-scope statement of
`src/backend/sidecar/bootstrap.ts` after its imports (line 173) — a backend module scope dying
during evaluation, exactly the 2026-08-23 `727be5dbb` class the gate was built for.

**Expected:** non-zero exit via the "exited N at startup" arm.
**Actual:**

```
NEGATIVE-CONTROL rc=0
[sidecar-smoke] PASS: built, started, exited 0 on stdin EOF.
```

The plan says a gate that exits 0 here is broken independently of this task and is a blocking
finding to be reported rather than worked around. It is reported, not worked around, and not
"fixed" opportunistically inside this quick task.

### Mechanism — proven, not theorised

The break really was compiled in, and the throw really did fire:

```
break present in SOURCE:            bootstrap.ts:173
break present in BUILT BUNDLE:      1 occurrence
direct run (fake HOME, stdin EOF):  EXITED rc=0 elapsed=0.52s
its STDERR:
  [sidecar] uncaught exception: Error: NEGATIVE CONTROL 260913-901
      at Object.<anonymous> (build/main/sidecar.js:38365:7)
      at Module._compile (node:internal/modules/cjs/loader:1873:14)
__GAMELIB_SIDECAR_READY__ present in STDOUT:   0
```

`src/sidecar/index.ts`'s FIRST import is `./installRejectionGuard`, which calls
`installUncaughtExceptionGuard()`. That guard's own doc comment in
`src/backend/sidecar/processGuards.ts:161-167` states the mechanism outright:

> LOG AND CONTINUE — DELIBERATE, and a deviation from Node's default. Registering ANY
> `uncaughtException` listener suppresses Node's default behaviour of printing the stack and
> exiting non-zero, so this listener is what keeps the process alive.

So a module-evaluation throw is caught, logged to stderr, and the process survives with `init()`
never having completed. It then exits **0** on stdin EOF. The sidecar is completely dead — it
never emits `__GAMELIB_SIDECAR_READY__` — and the gate reports PASS.

The guard is correct and must not be removed (it exists so a backend throw does not black-screen
the app). The defect is that **the gate's only success signal is the child's exit code**, and the
guard makes that exit code unconditionally 0. `meta/sidecarStartupSmoke.cjs` already captures the
child's stdout and never inspects it; asserting `__GAMELIB_SIDECAR_READY__` is present would
restore the gate with a one-line change. That is left to its own todo, deliberately not done here.

This also falsifies a claim currently shipped in `src/sidecar/installRejectionGuard.ts:42-46`,
which tells future readers that the boot-ordering invariant is checked by "`pnpm smoke:sidecar`,
which runs the real bundled sidecar — the only check that catches this class of regression".
It does not, and has not since the `uncaughtException` guard was added (D-35-10-01, after the
gate's founding incident).

**What the gate CAN still do:** its ETIMEDOUT arm works, and is what caught this task's hang
(`rc=1` at 30.7s before the fix). The blindness is specific to the "exited N at startup" arm.
That is why the presence fix below is still trustworthy: it was verified by direct measurement of
the bundle, not by the gate's exit code alone.

### Restore receipt (byte-for-byte)

```
actual:   64cbc468979817a64ef2635fa4d4763166c5e47014d87cbc28bd821f6af5add7
expected: 64cbc468979817a64ef2635fa4d4763166c5e47014d87cbc28bd821f6af5add7
git diff --stat -- src/   ->  (empty)
pnpm smoke:sidecar        ->  PASS
```

Restored with `cp`, never `git checkout --` (standing finding
`git-checkout-fires-post-checkout-hook`). No broken bundle left behind: the gate rebuilds and
passes.
