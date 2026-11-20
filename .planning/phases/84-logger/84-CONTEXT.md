# Phase 84: Logger - Context

**Gathered:** 2026-11-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Rust becomes the only process that writes log files. That covers `gamelib.log`, the runner logs (`runners/<runner>.log`), the per-game logs (`games/<app>_<runner>/<type>.log`) and the shell's own diagnostics, which today go to a separate `gamelib-shell.log`. Line format, file location, rotation, 0600 mode and renderer-message redaction stay as they are today. Log upload, delete-uploaded and "show in folder" work against the native logger. Diagnostics from steam-vent, reqwest and other crates land in the log, and a repeating error is rate-limited. The TS logger shrinks to a fire-and-forget forwarder. The shell's second log path (`shell_diag`) and the TS log registrations are deleted. Requirement: FND-05.

Not in scope: porting the code that spawns games or runners (Phases 88, 91 and 92). Those spawners keep running in TS and send their output to the native writer. Also out of scope is every store except `uploadedLogs` (Phase 85).

</domain>

<decisions>
## Implementation Decisions

### Shell diagnostics and sequencing with Phase 83
- **D-01:** **Shell diagnostics go into `gamelib.log`.** Every `shell_diag(...)` call site (`src-tauri/src/main.rs:581` and the other shell modules that call it) logs through the native logger with a new `Shell` prefix, in the standard line format. `gamelib-shell.log` and `shell_diag_log_path` are deleted, as criterion 4 requires. The old `epoch pid=N msg` format is not kept.
- **D-02:** **Phase 84 runs only after 83-11 (the live macOS gate) passes.** That gate's capture recipe scores `gamelib-shell.log` lines by process ID (83-01 decision), so deleting that file mid-gate would invalidate it. Planning 84 now is fine, but execution waits. Once 83 is closed, 84 owns any change to scripts or docs that grep `gamelib-shell.log`. It does not edit 83's gate files while 83 is open.
- **D-03:** **The panic log stays a separate, direct file append.** `install_panic_hook` / `shell_panic_log_path` keep their rules: never panic, and swallow every fallible step. They do not route through the logger, because the logger thread may be what died. Writing an extra best-effort line to `gamelib.log` is allowed but not required.
- **D-04:** **No process ID or origin field gets added to lines.** The source shows only through the existing `[Prefix]` tag, so the criterion 1 golden comparison pins the current format unchanged.

### Who writes game and runner logs
- **D-05:** **Rust writes every log file in this phase**, including the runner and per-game files. TS spawners (launcher, legendary, gogdl, nile, sideload, Steam provisioning, and so on) send their lines to the native writer, which owns the files, rotation and mode. When Phases 88, 91 and 92 later port those spawners, only the sender changes. — **Reversibility:** costly. Undoing it would put file writes back at every TS spawn site and leave two writers again.
- **D-06:** **High-volume game output is sent in batches.** The TS side coalesces stdout/stderr chunks into one IPC send per batch (per tick or per N KB; research picks the numbers from a real Wine launch). File contents are byte-identical to writing each line.
- **D-07:** **Upload and delete-uploaded move to Rust (reqwest)**, using the same dpaste endpoint (`https://dpaste.com/api/v2/`) and expiry behaviour as `src/backend/logger/uploader.ts`. `uploader.ts` and its store slice are deleted.
- **D-08:** **Rust decides where logs live.** The per-OS base log directory (macOS `~/Library/Logs/GameLib`, Windows `%LOCALAPPDATA%\GameLib\logs`, Linux `$XDG_STATE_HOME/GameLib/logs`, which falls back to `~/.local/state/GameLib/logs`) and the relative-path rules (`gamelib`, `runners/<runner>`, `games/<app>_<runner>/<type>`) move into gamelib-core `Paths`. TS `paths.ts` is deleted, and the renderer and "show in folder" ask the native side.
- **D-09 (resolves Phase 82 risk R1, option a):** **Phase 84 builds the minimal `StoreHost` core in gamelib-core:** open, atomic write and a change event, for the single cache store `uploadedLogs` (`store/uploadedLogs.json`). Phase 85 widens the same owner rather than replacing it. So `uploadedLogs` changes owner once, at 84, and the 82 ownership table has no double moves. — **Reversibility:** costly. Phase 85 builds on this StoreHost's API shape, so a later redesign has to touch both phases.

### Forwarder loss and ordering
- **D-10:** **Bounded buffer, then drop and count.** The TS forwarder never blocks its caller. Lines sent before the native writer is ready, or while it is busy, wait in a capped queue. On overflow the oldest lines are dropped, and a later line records `N lines dropped`. Lines logged early at boot are kept. The SidecarSendQueue freeze history is why blocking is ruled out.
- **D-11:** **Order is kept per source only.** Each source's lines (TS sidecar, renderer, Rust) arrive in order. Lines from different sources interleave in the order they reach the writer. This matches 83 D-02, which guarantees no ordering across the native/sidecar boundary.
- **D-12:** **A TS line's timestamp is taken where it originates**, so batching delay doesn't skew it.
- **D-13:** **The logger flushes last, inside the 83 D-12 exit deadline of about 5 s.** The logger registers with `Shutdown` as the final stage, so the `still running at exit deadline` line itself gets written. Anything still unflushed at the deadline is lost. The logger gets no extra budget of its own. It follows the 83 D-14 convention: register with `Shutdown`, and keep boot work bounded.

### Noise policy
- **D-14:** **Rate limiting suppresses identical lines and writes a summary.** It counts lines with the same prefix, level and message (after redaction) within a time window. The first N are written and the rest are counted. When the window closes, one `repeated K more times` line is written. Research/planning picks the window and N (the starting point is about 60 s). The behaviour must be testable with a golden comparison.
- **D-15:** **Rate limiting applies to `gamelib.log` only.** Game and runner logs are raw process transcripts that users upload, so they stay byte-faithful. Rotation keeps them bounded.
- **D-16 (amended by D-19):** **Crate diagnostics enter at WARN and above by default.** Only the environment variable `GAMELIB_LOG_LEVEL=debug` raises them to DEBUG (see D-19). They are not bound to `verboseLogs`.
- **D-17:** **A `tracing` Layer maps targets onto the existing `LogPrefix` values.** It uses the `tracing` facade, which gamelib-steamcm already depends on, with a fixed map from target to prefix: steam-vent and gamelib-steamcm map to `Steam`, the shell maps to the new `Shell`, and unknown targets map to `Backend`. Per STACK.md, the writer is GameLib's own port of `log_writer.ts`, not `tracing-appender`, `log4rs` or `tauri-plugin-log`.

### Resolved at planning (2026-11-20, research Open Questions)
- **D-18 (OQ1):** **New log files are created with mode 0600. This deliberately tightens today's behaviour.** Research found the TS writer never set a mode: today's files are `0o666 & ~umask` (usually 0644), and the roadmap's "keep 0600" describes a mode that never existed. Rust creates new log files 0600 on unix. Existing `.old` files from older releases are left alone. The golden comparison pins everything except mode. A separate unix test asserts 0600. Record the deviation in the golden notes and in SUMMARY.
- **D-19 (OQ2):** **Only the environment variable raises crate diagnostics to DEBUG.** The default is WARN, and `GAMELIB_LOG_LEVEL=debug` raises it. There is no settings coupling: no `verboseLogs` binding, no new setting and no `setLogVerbosity` channel. `verboseLogs` defaults to true, so binding to it would make DEBUG the default.
- **D-20 (OQ3):** **`gog-redist.log` becomes a typed Rust target in its current location.** The `gogRedist` target is resolved by Rust from `Paths` (it needs a games-config dir), and the file stays at `<userData>/GamesConfig/gog-redist.log`. The Rust writer never accepts an arbitrary path from TS.
- **D-13 amendment (plan check W1):** **The logger flushes through an explicit call, not as a `Shutdown` registrant.** D-13's intent stands: the logger flushes last, inside the 5 s budget, so the `still running at exit deadline` line is written, and the logger gets no extra budget. Only the mechanism changes. The logger holds **no** permanent `Shutdown` registrant, because one would report `still running at exit deadline: logger` on every exit (84-RESEARCH Pitfall 2). Instead, `run_exit`'s `finish` (D-21 `FinishContext`) calls an explicit `flush(remaining)` as the final step. This supersedes D-13's "registers with `Shutdown` as the final stage" wording.
- **D-21 (OQ4):** **Phase 84 owns the `run_exit` change.** `finish` receives `still_running` so the `still running at exit deadline` line is written inside the budget. This changes a Phase 83 API, which is safe because 83 is closed before 84 executes (D-02), and it is covered by the existing `shutdown::tests`.

### Claude's Discretion
- Whether the writer is its own `gamelib-log` crate or a module of gamelib-core (STACK.md allows either).
- Batch size and tick interval for D-06, and the buffer cap for D-10, with research measuring a real Wine launch.
- Where redaction runs. The current `sanitizeRendererLogMessage` / log-secret gate rules must hold for renderer messages. The planner picks TS-before-send or Rust-at-write, as long as the golden test proves the redaction output.
- Channel shapes for the forwarder (send-kind through the 83 native seam), the uploader, delete-uploaded, show-in-folder and log-path queries.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/REQUIREMENTS-v0.11.md`: FND-05
- `.planning/ROADMAP.md` §"Phase 84": goal, four success criteria; the v0.11 preamble rule that every port phase deletes its own TS and that live gates are authored before coding

### Research
- `.planning/research/v0.11/ARCHITECTURE.md`: slice B Logger (line ~164), gamelib-core component table (line ~99), the composition-root note "logger first" (line ~126), risk row for B (line ~254: rotation, uploader, secret scrubbing, ordering with early sidecar boot lines)
- `.planning/research/v0.11/STACK.md` §Logging (lines ~77–82, ~237): own writer plus a `tracing` Layer; rejected alternatives
- `.planning/research/v0.11/PITFALLS.md` Pitfall 15 (line ~106): exact-text log lines that live gates grep, redaction, Windows share-delete file handles, rate-limiting (80 A-IN-01), dropped tracing diagnostics (79 WR-03)
- `.planning/research/v0.11/FEATURES.md`: logger rows (lines ~44, ~104, ~179)

### Prior phase decisions
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-CONTEXT.md`: D-02 (FIFO per slice, no cross-boundary order), D-03 (log rejections by channel name only), D-07 (Rust serde struct is the schema authority), D-12/D-16 (5 s exit deadline), D-14 (Rust Shutdown convention)
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-HUMAN-UAT.md`: the live gate that greps `gamelib-shell.log` (why D-02 sequences after 83-11)
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`: rows `uploadedLogs` (R1, resolved by D-09), `app-logs`, `logger-writer`; §Sequencing rule
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UTILS-BOOTSTRAP-INVENTORY.md`: the logger boot step and its guard sinks

### Conventions
- `Skill("gamelib-conventions")`: fake-HOME isolation (tests that write real log dirs), `<verify>` prettier check
- `src-tauri/crates/README.md`: per-domain crate recipe, deletion and CI rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/logger/log_writer.ts` (272 lines): the behaviour to port. It rotates on first write, claiming the rotate gate synchronously before the first await, exactly once per writer, with its own directory-exists gate. It also covers the decompress-worker exception and the 0600 mode.
- `src/backend/logger/formatter.ts`, `constants.ts`: line format, `LogPrefix` set (adds `Shell`), `LogLevel` DEBUG/INFO/WARNING/ERROR, padding widths
- `src/backend/logger/paths.ts`: per-OS base path and relative-path rules (D-08)
- `src/backend/logger/sanitizeRendererLogMessage.ts`: renderer redaction rules
- `src/backend/logger/uploader.ts`: dpaste upload and the `uploadedLogs` slice (D-07, D-09)
- gamelib-core (`Paths`, `FrontendEmitter`, `Shutdown`, `Clock`) from Phase 83, and the native send seam (`openExternalUrl` FIFO slice queue, 83-06), which is the model for the forwarder channel
- `tracing` 0.1 already in `src-tauri/crates/gamelib-steamcm/Cargo.toml`

### Established Patterns
- `shell_diag` (`src-tauri/src/main.rs:581`): best-effort and infallible; it writes to stderr plus a file. The native logger must stay just as infallible from callers' point of view.
- A non-async Tauri command runs on the main thread, so forwarder sends must enqueue, never block (the 2026-10-05 freeze).
- Rust tests must pass on Windows: join path segments one at a time. Use share-delete-friendly opens and drop file handles before rename/delete during rotation.

### Integration Points
- `src/backend/sidecar/loggerFlowRegistration.ts` (~11 registrations): deleted, and its channels move native
- TS writers of game/runner logs, which switch to the forwarder: `src/backend/launcher.ts`, `commandRunner.ts`, `storeManagers/{gog,legendary,nile}/*`, `storeManagers/steam/provisionBottle.ts`, `sidecar/steamFlowRegistration.ts`, `sidecar/settingsFlowRegistration.ts`
- `src/backend/sidecar/bootstrap.ts`: the logger boot step (logger first)
- `handle_exit` / `run_exit` Shutdown stages (Phase 83 83-09): the logger registers as the final stage

</code_context>

<specifics>
## Specific Ideas

- Live-gate scripts and debug sessions grep exact log text (for example, the 63-UAT `scanner ... impl=rust` proof lines). The golden comparison must cover lines that gates and debug docs depend on, not just a synthetic sample.
- The 80 A-IN-01 unbounded log growth while hung is the failure the rate limiter exists for.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within the phase's scope.

### Reviewed Todos (not folded)
The todo matcher returned only keyword matches unrelated to logging, so they stay pending: packaged app blank render (fixed), x86 shim flat API parity, opt-in DLC enable path, fileStore test-mock migration, Phase 82 deferred review findings, protonfixes import tool, winebus IOHID PowerA wedge, GOG Windows elevation live check, Steam move install, Windows unsigned releases.

</deferred>

---

*Phase: 84-logger*
*Context gathered: 2026-11-20*
