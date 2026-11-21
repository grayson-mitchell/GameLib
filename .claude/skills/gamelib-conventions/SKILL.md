---
name: gamelib-conventions
description: GameLib's six load-bearing repo conventions in full, with the measurements and incident history behind each — todo triage frontmatter (the three keys CI enforces), fake-HOME isolation (the two-profile rule), the sidecar's exit contract (unref every handle; bound in-flight boot work), the Rust shutdown contract (spawn through gamelib-proc, register with the Shutdown token, bound boot work), UAT item shape (inline `expected:`, `result:` opens with a status word), and the mandatory `npx prettier --check` in every task's `<verify>` block. Read this BEFORE writing a `.planning/todos/pending/` file, spawning a child process in `src/` or `meta/`, creating a timer/watcher/socket in the sidecar, spawning a process or adding a task, timer or exit work in Rust (`src-tauri/`), editing a `*-UAT.md` item, or writing a `<verify>` block. Auto-loaded during planning, todo, test-harness, UAT, and formatter work.
---

<context>

These are the full texts of GameLib's repo conventions. They were moved out of `CLAUDE.md` on
2026-10-04 (quick task: CLAUDE.md context trim) because they cost ~6,394 tokens on every turn of
every session while being relevant only to specific kinds of work.

**`CLAUDE.md` retains a six-line imperative index of these rules**, so every session still knows
the rules exist and when to load this file. What lives here is the rationale, the measurements,
and the incident history — the part that makes each rule stick and that you need before acting
on one. Three of the six are explicitly discipline-only (no gate can see them), and the Rust
shutdown contract is discipline at its call sites (its mechanism is tested, adoption is not), so
if your work touches one, read its section here in full rather than acting on the one-line summary.


## Conventions

### Todo triage frontmatter (enforced by CI)

**Every file you create in `.planning/todos/pending/` must carry all three of these keys.** The
`/gsd-add-todo` workflow's frontmatter template does **not** emit them — it stops at
`created`/`title`/`area`/`files` — so you have to add them by hand. Omitting them turns CI red.

```yaml
severity: medium # critical | major | medium | minor
platform: any # macos | windows | linux | any    (default: any)
ready: code # code | live-gate | human | blocked
```

Place `platform:` immediately after `severity:`, and `ready:` immediately after `platform:`.

Values are matched **bare, lowercase and exact**: `severity: minor`, never `severity: "minor"`,
never `severity: Minor`, never `severity: low`.

| key        | value       | means                                                              |
| ---------- | ----------- | ------------------------------------------------------------------ |
| `severity` | `critical`  | data loss, corruption, or a shipped claim that is false            |
|            | `major`     | a feature is broken or a measurement is silently contaminated      |
|            | `medium`    | real defect, bounded blast radius, workaround exists               |
|            | `minor`     | polish, rough edge, or a latent trap with no live consequence      |
| `platform` | `any`       | reproducible and fixable on any machine (**the default** — use it) |
|            | `macos`     | needs the operator's Mac specifically                              |
|            | `windows`   | needs the operator's Windows machine (not their primary OS)        |
|            | `linux`     | needs a Linux machine                                              |
| `ready`    | `code`      | desk-ready: edit and typecheck, no live gate and no other OS       |
|            | `live-gate` | needs a live app run on this Mac to verify                         |
|            | `human`     | needs a decision, credentials or a person — not code               |
|            | `blocked`   | parked, externally blocked, or gated on hardware not to hand       |

`ready:` is the one that earns its keep: `grep -l 'ready: code' .planning/todos/pending/*.md`
answers "what can I actually pick up right now?" without opening a single file.

`pnpm planning-gates` enforces this in CI via `.planning/todos/todo-frontmatter-gate.py`. When it
fails, **fix the todo's frontmatter** — add the missing key, or pick the vocabulary value that
fits. Never widen the vocabulary in the gate to admit the value that failed; a vocabulary that
grows to fit whatever was typed is free text with extra steps, which is the exact condition the
gate exists to end. Scope is `pending/` only — `completed/` is deliberately exempt.

### Fake-HOME isolation for direct binary runs (two-profile rule)

**The rule is NOT "always fake the HOME".** It is the **two-profile rule**, and it has two halves
that are both mandatory:

1. **Isolated by default** — every run whose purpose is _not_ profile-dependent (spawning the
   compiled sidecar or SEA binary from a test, a `meta/` harness, or a scratchpad command) gets a
   fresh, disposable fake profile.
2. **A named, deliberate real-profile arm** — for defects that can only arm under a _populated_
   profile. This arm is declared and justified where it lives; it is not an oversight to be
   tidied away.

**Both halves exist because both failure modes have been measured on this repo.**

- Isolation is needed: a direct run of the compiled sidecar with the real `HOME` wrote genuine
  local GOG session data (`userId`/`username`/`galaxyUserId`) into a scratchpad log — **twice**,
  in `260912-e6k` and again in `260913-901`, the second time despite a written threat-model entry
  saying to delete the captures.
- Isolation is also **dangerous**: the `major`, PR-blocking defect `260913-901` fixed — an
  un-`unref()`-ed 5-minute `setInterval` armed by `setPresence()` at `gog/presence.ts:39` — is
  created only behind `GOGUser.isLoggedIn()`. Measured same day, same tree, same command: real
  `HOME` **never exits** (no exit at 120s, reproduced twice); a cold empty fake `HOME` exits 0 in
  27.7s. An isolated-by-default gate would have been permanently, confidently green against it.

A convention saying only "always fake the HOME" would buy safety by making a whole class of
real-profile-only defects structurally invisible — the same failure mode as a gate that cannot see
the crash it was built for.

**What is enforced, and what is not.** In-repo spawn sites are enforced by
`src/backend/__tests__/fakeHomeIsolation.test.ts`: no file under `src/` or `meta/` may spawn a
child with a hand-rolled `env` literal assigning the home/config/state variables. Use
`createFakeHomeProfile()` from `src/backend/testUtils/fakeHomeProfile.ts`. The one exemption,
`meta/sidecarStartupSmoke.cjs`, is declared in that gate's `EXEMPTIONS` table with its reason, and
the gate re-reads the exempt file to prove the reason is still written there. The exemption is
from the convention (this file must inherit the operator's real profile), not from the detector:
the exempt file is still scanned, and the gate asserts it assigns none of the eight variables, so
adding an `env` block there turns the gate red on every OS (quick 260926-c07).

**The ad-hoc/scratchpad half rests on discipline and is NOT enforceable.** Nothing can observe a
command typed into a scratchpad, and a gate that appeared to cover it would be the
green-check-proving-nothing pattern this project keeps stamping out. This sentence is the whole
enforcement mechanism for that half. Do not read it as stronger than it is.

**The eight variables and the `mkdtemp 0700` reasoning are DERIVED from
`src/backend/jest.setupContainment.ts`**, not invented: `HOME`, `USERPROFILE`, `APPDATA`,
`LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`. That file
also records the measured correction worth keeping: `mkdtemp`'s 0700 is the **security control**
(umask can only ever _remove_ bits, so the directory can never carry group/other bits), and the
following `chmodSync` is **not** redundant — it restores owner-write, because `mkdtemp`'s
requested mode is masked and `umask 0277` yields 0500.

**Cleanup and redaction belong to the harness, not to your memory.** `createFakeHomeProfile()`
returns a disposing handle: `dispose()` shreds the profile and every path passed to
`registerCapture()`. Register raw diagnostic reports and `*.out` captures — a Node diagnostic
report embeds `environmentVariables`, `commandLine` and `cwd` verbatim. `260913-901` specified
deletion in writing and still left 103 MB of unredacted captures on disk until they were removed
by hand.

**Fresh profile per invocation, always.** No reuse-for-speed: a reused profile is a different
experiment carrying state capable of masking a defect. If a run is too slow, pin it offline or
stub the network — never recycle a profile. Reuse is permitted only as an explicitly-named opt-in
for a test whose _purpose_ is warm-path behaviour, justified at the call site.

### The sidecar's exit contract (stdin owns its lifetime)

> **No handle may hold a reference to the event loop past stdin EOF.**

The sidecar has **no explicit shutdown path, and does not need one.** Its lifetime is owned by
stdin — the RPC frame stream — and it exits by **event-loop drain** when the shell closes that
stream. `startRpcServer()` therefore has no `'end'`/`'close'` handler _by design_: there is
nothing to hang a teardown on, and adding one misunderstands the mechanism rather than hardening
it. **One narrow, measured amendment (debug/sidecar-survives-force-quit, 2026-10-26):**
`releaseOnStdinEof()` (`src/backend/sidecar/stdinEofRelease.ts`, wired from `bootstrap.init()`)
listens for stdin EOF to drop references the sidecar cannot `unref()` — it never calls
`process.exit`, so exit is still by drain. It (1) calls `SteamUser.releaseForShutdown()`, because a
logged-on `steam-user` client owns a library-internal CM socket and heartbeat timer (measured: an
anonymous-logged-on client keeps a bare node process alive past 60s; `logOff()` drains it in
~100ms, and an empty-profile sidecar already exits ~0.7s after EOF), and (2) pauses the download
queue (`pauseCurrentDownload()`) and then runs `callAllAbortControllers()` so in-flight depot
downloads stop (half 2 below). The pause comes first on purpose: a bare abort made the queue record
the download as finished and drop it, so it was not resumable (live gate 2026-10-26). Without it a
Force Quit (SIGKILL, which skips `shutdown_child()`) left a signed-in sidecar running as an
orphan. Any NEW library-owned handle that cannot be unref'd belongs in that function, not in
`startRpcServer()`. The Rust shell reaps the child separately — `shutdown_child()` (`src-tauri/src/main.rs:1182`,
called at `:9631` from the `RunEvent::Exit` arm) SIGTERMs the whole process group, polls
`try_wait()` through a bounded grace period, then SIGKILLs. That is the **backstop for a sidecar
that will not leave, not the normal path**; anything that ever misses that kill leaves an orphan
holding an authenticated session.

Because exit is by drain, that one invariant carries the whole design — and it has **two halves**.

**1. `unref()` every handle you create.** Timers, watchers, sockets, child handles: anything libuv
counts. `unref()` does not stop the handle working. It only says _"do not keep the process alive
FOR ME."_ For the whole of the sidecar's real life stdin holds the loop open, so behaviour with a
live Rust peer is unchanged; only the no-peer, stdin-EOF case can now exit. This half is derived
from the in-situ comment at `installedJsonWatcher.ts:133-149`, which states it in full.

**2. Do not leave unbounded in-flight work at boot.** This is the half that gets missed, and
`unref()` is the **wrong tool** for it. Parked, idle sockets are already unreferenced and hold
nothing; _in-flight_ requests are referenced by definition, and exit tracks their drain. A bare
`axios.get` with no agent and no timeout cannot be fixed by unref'ing anything — it has to be
bounded, or not issued at boot.

**The contract is load-bearing, not theoretical — it has broken three times in three weeks:**

| when                     | what referenced the loop                                     | how it was caught                                                  |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| 2026-08-29 (`ef77e4a1e`) | the `installed.json` `FSWatcher`                             | `smoke:sidecar` went red; bisection                                |
| 2026-09-13 (`9e8e1b224`) | an un-`unref()`-ed 5-minute `setInterval` in `setPresence()` | a full day — **invisible to `process._getActiveHandles()`**        |
| open (`260913-m9c`)      | ~5 in-flight boot downloads on `https.globalAgent`           | a `--report-on-signal` diagnostic report plus an async-hooks probe |

The second row is why half 1 alone is not enough to state: Node multiplexes every JS timer onto a
single internal `uv_timer_t` with no JS wrapper, so the obvious instrument reports nothing. The
third row is a **different class** entirely, and is why half 2 has to be written down — someone
reading only the in-situ comments would reach for `unref()` and it would not move the number.

**What enforces this, honestly: almost nothing.** `pnpm smoke:sidecar`
(`.github/workflows/test.yml:41`) is the only gate, and it is a blunt instrument for the job. It
catches **total** failure to exit via its `ETIMEDOUT` arm but **not slow exit**:
`STARTUP_TIMEOUT_MS` is 30s and `260913-m9c` measured cold boots at 27–39s, so the contract can be
substantially violated while the gate stays green. It is also the named real-profile exemption of
the two-profile rule above, so it runs warm locally and only ever sees the cold path in CI. **No
test asserts the invariant.** The 13 `unref()` call sites across `src/` and `meta/` are 13 places
someone had to remember this rule unprompted. This paragraph is most of the enforcement; do not
read it as stronger than it is.

**A gate is not obviously the answer, and is a separate, deliberate decision.** A source gate over
`setInterval`/`setTimeout`/watcher creation would have caught **none of the three breaks cleanly**,
and could not see the in-flight class at all — a gate that appears to cover more than it does is
the green-check-proving-nothing pattern this project keeps stamping out. Decide it on its merits;
do not add one reflexively.

**Grep trap when auditing this.** `.unref?.()` is the dominant spelling — **8 of the 13** sites use
the optional call, because jest's fake-timer substitute is not required to implement `unref()`. A
census grepping `\.unref()` returns **5** real sites and looks complete; grepping bare `unref`
sweeps in comment prose and inflates the count instead. Match both spellings _and_ strip comment
lines, or the number you get will be confidently wrong in one direction or the other.

### The Rust shutdown contract (gamelib-core Shutdown, gamelib-proc spawns)

> **Spawn through `gamelib-proc`, hold a `Shutdown` registrant for in-flight work, fit the one 5 s
> exit budget, and bound boot work.**

This is the Rust counterpart of the sidecar's exit contract above, for `src-tauri/`. The sidecar
section stays as it is until Phase 99 retires the sidecar; this one governs everything Rust.

**The rule.**

1. **Spawn through `gamelib-proc`.** `SpawnClass::Helper` (`ProcRunner::helper("<label>")`,
   `spawn_helper`, `spawn_helper_tokio`) for anything GameLib runs for its own purposes;
   `SpawnClass::Game` only for what must outlive GameLib (a user's game). Never a bare
   `Command::spawn` in a domain crate or the shell for a long-lived child. Short synchronous probes
   (`osascript`, `reg`, `pgrep`, `codesign`, `ps`) stay on `Command::output()`.
2. **Hold a registrant for in-flight work.** Work that must finish (or be cancelled) before exit
   holds a `gamelib_core::shutdown::global()` `Registrant` for exactly as long as it is in flight,
   and watches `global().token()` for cancellation. A registrant held after the work ends makes
   exit wait for nothing; one never taken makes exit not wait for something that needed it.
3. **Exit work fits one budget.** `ExitBudget::DEFAULT` is 5 s in total with a 1.5 s child grace,
   so drains get 3.5 s. Do not add a wait of your own to the exit path; add a drain to
   `handle_exit` or hold a registrant, and take the bound you are handed.
4. **Bound boot work.** Nothing started at boot may wait without a limit, for the same reason as
   half 2 of the sidecar's contract: unbounded in-flight work is what holds a process open.
5. **Never `PR_SET_PDEATHSIG`, never a hand-rolled kill.** Parent-death signals are per-thread and
   fire when the spawning thread ends, not when the process dies; a hand-rolled `libc::kill` skips
   the pgid <= 1 refusal that keeps `kill(-1)` and `kill(0)` out of reach. One implementation:
   `gamelib_proc::kill_tree::terminate_group`.

**Why it is a rule.**

- The `nettop` orphan (T-80-16, Phase 80) was **found only by a live Force Quit**: monitor
  children outlived GameLib. Nothing in unit tests could have seen it, because SIGKILL skips every
  exit path the process owns.
- SIGKILL skips every exit path, so a helper can only be reclaimed by something that survives
  GameLib: the reaper on unix and the per-helper kill-on-close Job on Windows.
- The old exit was serial: depot finalize (up to 5 s), steamcm logoff (up to 5 s), steampoll drain
  (up to 5 s), then the sidecar grace (2 s), about 17 s worst case. An OS logout waits about 5 s
  before it force-kills apps (research A5, assumed, not measured), so a slow subsystem lost the
  steamcm restore for everyone behind it.

**The mechanics.**

- `gamelib_core::shutdown::run_exit(global(), ExitBudget::DEFAULT, drains, children, finish)` spends
  the budget in three stages. **Drains** run concurrently on detached threads, each holding a
  registrant, within the 3.5 s drain budget (`depot`, `steamcm`, `steampoll` today). **Children**
  then get what is left, at most 1.5 s: the sidecar's process group (`shutdown_child(grace)` ->
  `terminate_group`) and the `ChildSet`'s helpers. **Finish** runs reaper disarm, wake-lock
  release and socket cleanup, handed a `FinishContext` (what overran, time spent, time left). A
  drain that overruns is abandoned, not joined, and named in
  `still running at exit deadline: <names> (<count>)`; `exit finished in <ms> ms` is always
  logged. Both go through `shell_log` (stderr and `gamelib.log`) inside the finish stage, names and
  counts only, never job detail, and the logger flushes last, within the budget
  (`gamelib_log::flush(ctx.remaining)`), holding no registrant: a permanent one would report
  `still running at exit deadline: logger` on every exit. The deadline starts at `handle_exit`,
  after the TS pending-operations confirm.
- A drain that detects it overran holds its registrant open (`hold_exit_drain_open`), because the
  drain's own timeout and the stage deadline are the same instant and would otherwise race, leaving
  the overrun unnamed.
- Helper vs Game: a helper gets its own process group (unix) or its own kill-on-close Job
  (Windows) and is registered in the `ChildSet`; a game gets its own session, no Job, and is never
  registered, so a game tree survives GameLib.
- The unix reaper is GameLib's own binary re-exec'd with `--gamelib-reaper`, holding the read end
  of a pipe GameLib keeps the write end of. When GameLib dies for any reason the pipe closes, and
  the reaper SIGTERMs every registered helper group, SIGKILLs the rest after 2 s and exits. A
  graceful quit sends `disarm` first (last, in the finish stage), so it signals nothing.
- **D-15 interim:** games launched from TS (not yet through `gamelib-proc`) still share the
  sidecar's fate: they die with the sidecar's group or Job on a SIGKILL. That ends when Phase 88
  moves launch into Rust (`.planning/todos/pending/2026-11-21-ts-launched-games-die-on-gamelib-sigkill-unix.md`).

**What is enforced, honestly.** `cargo test -p gamelib-proc` (its own CI step, three OS legs) runs
the orphan harness: a stand-in parent, a SIGKILL or a graceful quit, then probes from outside that
helpers and grandchildren are gone and the game tree is not. That proves the **mechanism**.
`83-HUMAN-UAT.md` proves the live app once. `run_exit`'s deadline is unit-tested in core, and the
TS source-text gates (`quitTeardownWiring`, `sidecarShutdownFlagSource`, `tauriShellSource`) pin
`handle_exit`'s shape. **Nothing checks that a new call site uses `gamelib-proc`**, and nothing
fails when an exit drain forgets its registrant. This section is most of the enforcement for that
half; do not read it as stronger than it is.

### UAT item shape (`expected:` inline by preference; `result:` opens with a status word)

**The shape.** In a `*-UAT.md` item, the `### N. <item name>` heading sits at column 0. `expected:`
carried inline on the same line as the key is the house preference, with `result:` as the next
column-0 line. `result:`'s value must open with a bare or bracketed status word (`pending`, `pass`,
`issue`, `skipped`, `blocked`, or `[pending — note]`); prose may follow the word.

Conforming — inline text, `result:` on the next line:

```yaml
expected: Games appear as cards with title, artwork, and an Install button.
result: pending
```

**Which parser, and when.** This repo is worked from three machines; each runs its own global
`@opengsd/gsd-core` install (`~/.claude/gsd-core/bin/lib/uat.cjs`, `parseUatItemsWithStats`).
Check `~/.claude/gsd-core/VERSION` rather than assuming one machine's version holds for the others.
The deprecated `get-shit-done-cc` 1.42.3 used an adjacency-matched `parseUatItems` under which a
single body `expected: |` block scalar hid every `### N.` item in its file; it is no longer used
anywhere. One machine was briefly back on it (reinstalled 2026-10-22, cause unknown, removed
2026-11-17); if `~/.claude/get-shit-done/` contains any files, or `gsd-sdk` is on `PATH`, that
machine has regressed. Measured 2026-09-26 under gsd-core 1.14.0: the parser slices each column-0
`### N.` heading to the next heading of any level and reads `expected: |` values dedented — probed
with an in-memory fixture, the item was returned with its multi-line body dedented,
`headingsSeen: 0`. `audit-uat --raw` then reported 418 outstanding items across 56 files, against
42 across 13 under 1.42.3; `34.3-UAT.md` (5 items) and `34.5-UAT.md` (17 items) went from 0 to
read in full. Block scalars are no longer a visibility hazard. Inline `expected:` stays the preference
because it is the shipped template's own `### N.` item shape and diffs cleanly — not because
anything breaks under gsd-core. The 26 existing `expected: |` blocks across `34.3-UAT.md`,
`34.5-UAT.md`, and `34.6-UAT.md` stay exactly as written; there is no reason to flatten them.

**What still goes unread, and it is now LOUD.** gsd-core reports what it cannot read itself:
`summary.parse_gap_files`, plus per-file `parse_gap: true` and `unparsed_blocks: N`. Two causes
were reproduced live on 2026-09-26. In `34.6-UAT.md` (`unparsed_blocks: 5`), every `result:` value
opened with bolded prose (e.g. `result: **PASS** (2026-08-26 19:26)...`) instead of a bare or
bracketed status word — probed directly: a fixture whose `result:` opens with `**PASS**` is
dropped from `items` and increments `headingsSeen`. In `32-HUMAN-UAT.md` (`unparsed_blocks: 1`), a
non-numbered `### CORRECTION 2026-08-22 ...` heading sat between item 1's heading and its own
`expected:`/`result:` pair, so item 1's block ended at that heading before it ever reached its
result. An audit with `parse_gap_files` above 0 is not a clean audit. Quick task 260926-ky9 closed
both: each of `34.6-UAT.md`'s five values gained a leading bare `pass — ` status word, with every
following character kept, because all five were passes on what the test asked and the issues
behind tests 3 and 4 live in its `## Gaps` entries; `32-HUMAN-UAT.md`'s `### CORRECTION` heading
became a bold paragraph line. Measured after: `parse_gap_files: 0`, 419 outstanding items across
55 files.

**What is enforced, honestly.** `.planning/uat-visibility-gate.py` (added in quick task 260912-csq)
was retired in quick task 260926-kkt: it copied 1.42.3's regex verbatim, so after the migration it
was counting against a parser nobody runs. The planning-gates floor moved from 13 to 12, and the
reason is recorded in `meta/runPlanningGates.py`. Nothing in CI now checks UAT item shape or
visibility — `audit-uat` runs from the global gsd-core install, which CI does not have, so
`parse_gap_files` is seen only by someone who actually runs it. The tool's reporting is not
enforcement.

**Upstream files.** `~/.claude/gsd-core/templates/UAT.md`, `workflows/verify-work.md`, and
`workflows/execute-phase.md` still write `expected: |`, but inside the `## Current Test` cursor
block, not inside a `### N.` item, and gsd-core reads it there — so a freshly scaffolded file needs
no hand-correction. Those files are outside this repo, unversioned, separate on each machine,
shared by every project on that machine, and overwritten by a `gsd-core` upgrade — the same
caveat the formatter section below records for the plan template.

### A formatter check belongs in every task's `<verify>`

**If a task writes a file that prettier actually sees, its `<verify>` block must run `npx prettier
--check` over the exact paths it wrote.** "Sees" means the probe below reports that path as **not
ignored**. Scope to explicit paths, never `.` — a bare `.` drags in unrelated repo debt and
`src/preload/.prettierrc` sets `printWidth: 120` against the root's default 80, so the directory a
path sits in changes the correct answer.

**Decide which case a path is in with `npx prettier --file-info <path>`** — do not guess from
`.prettierignore` alone. A path prettier sees reports `{ "ignored": false, ... }` with a real
`inferredParser`; a path prettier ignores reports `{ "ignored": true, "inferredParser": null }` and
matches nothing. Measured on this machine 2026-09-26 and re-measured 2026-09-27, both under
prettier 3.7.4: `src/preload/index.ts` and `src/backend/utils/uninstaller.ts` both report
`{ "ignored": false, "inferredParser": "typescript" }`; `package.json` reports
`{ "ignored": false, "inferredParser": "json-stringify" }`; `CLAUDE.md` reports
`{ "ignored": false, "inferredParser": "markdown" }`; `.planning/STATE.md` and
`public/locales/en/gamelib.json` both report `{ "ignored": true, "inferredParser": null }`.

**The spacing inside those braces is load-bearing.** prettier prints a space after each colon and
inside the braces. Until 2026-09-27 this section quoted a hand-normalised unspaced form — wrong
under the very 3.7.4 it cited, so a fixed-string grep for that spelling scored 0 against a correct
result. Do not flatten them back; match with a space-tolerant pattern such as
`grep -Eq '"ignored":[[:space:]]*false'`.

**Over an ignored path, `--check` is vacuous and must NOT be written into a `<verify>` block as
though it were assurance.** On 2026-09-26, `.planning/STATE.md`, `public/locales/en/gamelib.json`
and `CLAUDE.md` each printed `Checking formatting...` then
`All matched files use Prettier code style!` and exited 0 — byte-identical output and identical
exit code for the two ignored paths and the real one, zero files matched in the ignored cases.
Nothing in the output or the exit code distinguishes them; `.husky/pre-commit:20-22` already
records the same fact from the hook's own side. A task that writes only ignored paths should say
so in its verify block and omit the check,
rather than carry a green that proves nothing — this is what surfaced the problem: two consecutive
quick tasks, `260926-mja` and `260927-mh4`, had to hand-annotate their verify blocks as vacuous by
design to stay honest.

**The ignored trees tasks here actually write to** include at minimum `.planning` (every PLAN,
SUMMARY, STATE, todo and debug artifact), `public/locales/` (every l10n catalogue change),
`.claude`, and `graphify-out`. `public/locales/` matters most and has been the case actually
missed: unlike the others it is shipped source, not tooling state, so the mandated check has been
silently vacuous for every catalogue change and not just for planning artifacts. `.prettierignore`
is the full list (18 entries at time of writing) — treat this paragraph as a shortcut for the
common cases, not a second copy to keep in sync.

**Nothing mechanical keeps ignored files consistent, and no gate will.** What keeps them
consistent is hand-matching the surrounding corpus — the wrap, indentation and key order already
in the file being edited. That is weaker than a formatter, not equivalent to one; it is what there
is.

**Why this is a rule and not a nicety: no other gate in this repo sees formatting.** An executor
can run `pnpm codecheck` (exit 0), `pnpm lint` (both ceilings PASS), its jest project,
`lint-translations`, `i18n-churn-guard` and `pnpm planning-gates` — every one green — and still
have written an unformatted file. Measured three times, and the third was not a planned phase at
all but a `/gsd-debug` session that ran the full battery: 2026-09-02 (phase 39, 7 files),
2026-09-21 (two quick tasks), 2026-09-23 (the blank-render fix). Each cost a rejected push, a
separate formatting commit and a re-push.

`.husky/pre-commit` now checks prettier over the **staged content** of every file a commit
touches, so this is a backstop rather than the only line of defence — but the hook fires at
`git commit` only. `git rebase`, `cherry-pick` and `merge` create commits without running it, and
`--no-verify` skips it. The verify block is what keeps the file formatted in the first place.

**The plan templates can carry a reminder too, per machine.** Each machine's
`~/.claude/gsd-core/templates/phase-prompt.md` and `~/.claude/gsd-core/bin/lib/template.cjs` can
hold a hand-added reminder: a `<!-- FORMATTER CHECK IN <verify> ... -->` comment block above
Task 1 plus formatter wording in both example `<verify>` lines, and a `template.cjs` `<verify>`
string that reads "include the formatter check over any file this task writes". To check a
machine: `grep -ci 'prettier\|formatter'` returns 7 in `phase-prompt.md` and 1 in
`template.cjs` when it is present, and 0 in an unpatched install.

These files are outside this repo, unversioned, separate on each of the three machines, shared by
every project on that machine, and **overwritten by every gsd-core upgrade or reinstall**. The
installer parks locally modified files in `~/.claude/gsd-local-patches/`, and `/gsd-update
--reapply` merges them back. That is a MANUAL step after every upgrade; nothing runs it
automatically. Before reapplying, diff the parked files against the release they came from: on
2026-11-17 the move from `get-shit-done-cc` 1.42.3 back to gsd-core 1.21.0 parked 170 "modified"
files, and every one was only the old installer's own rewrites (`/gsd:` to `/gsd-`, `~` to
`$HOME`), not real edits. Wholesale loss happens too. The reminder was first written into the 1.42.3
copies (`38bcad5b1`), carried to gsd-core 1.14.0 by reapply, then lost on one machine when 1.42.3
was reinstalled over gsd-core on 2026-10-22. Its original text was never versioned, so it was
rewritten from this section on 2026-11-17 (quick task 261117-s78). If a machine's grep shows 0,
rewrite it from this section the same way.

This section is the durable copy of the requirement; treat the template text as a convenience,
not as the requirement.


</context>
