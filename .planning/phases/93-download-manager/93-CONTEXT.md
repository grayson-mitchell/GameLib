# Phase 93: Download manager - Context

**Gathered:** 2026-11-27
**Status:** Ready for planning

<domain>
## Phase Boundary

The download queue runs in Rust and keeps every behaviour users rely on (STO-04). That covers
`src/backend/downloadmanager/` (about 1.5k lines: `downloadqueue.ts` 679, `utils.ts` 570 with
`installQueueElement` / `updateQueueElement`, `installStallWatchdog.ts` 166, `finishedList.ts`,
`updateElement.ts`, `stores.ts`), the queue's sidecar registrations
(`src/backend/sidecar/downloadQueueFlowRegistration.ts`, the queue arm of
`installFlowRegistration.ts`, the boot-time `initQueue` call in `appShellFlowRegistration.ts`'s
`frontendReady` handler, the queue pause in `stdinEofRelease.ts`), the install and update shims
that 90/90.1, 91, 92 and 92.1 left with deleting phase 93, `downloadFile` in `src/backend/utils.ts`
and the `easydl` dependency. The `downloadManager` store (`store/download-manager`) flips to Rust
here (`82-STATE-OWNERSHIP.md` row: TS mirror deleted in 93).

Success criteria (ROADMAP): pause and resume, resume after quit without restarting from zero; a
stalled download detected and recovered without wedging the queue (the Steam and GOG regression
scenarios); the finished list and persisted queue survive restart; the TS download manager,
`easydl` and their sidecar registrations are deleted in this phase.

Depends on 90.1 (Steam install code the queue calls: `cancelDelete`, `queueHeadRevalidation`,
`gameRequirements`) and 92.1 (the last runner shims).

Out of scope: no new queue capability (parallel downloads, reordering, bandwidth limits). The
renderer is untouched (D-10). No live operator gate in 93 (D-08); the live checks are owed to the
Phase 98 gate (D-09).

</domain>

<decisions>
## Implementation Decisions

### Resume on relaunch
- **D-01:** **A pause the user pressed is persisted, and a paused download stays paused after a
  relaunch.** This is a deliberate change from the TS, where queue state is not persisted and the
  startup `initQueue(true)` restarts the GOG/Epic/Amazon head even if the user had paused it.
  Recorded as a `deltas.json` entry on the queue golden, landing as its own commit after the
  golden is recorded from the TS. The persisted shape must load the existing `download-manager.json`
  unchanged (FND-06: unknown keys kept, no reset). — **Reversibility:** costly — the persisted
  pause flag becomes part of `download-manager.json`; undoing it means reading and ignoring that
  key and re-recording the delta.
- **D-02:** **Only an explicit user pause is persisted. The pause that quitting performs and the
  offline auto-pause are interruptions**, so on relaunch an interrupted GOG/Epic/Amazon head
  resumes (once the app is online). The Rust queue therefore has to tell a user pause apart from
  the quit pause (the TS `stdinEofRelease.ts` pauses first so the element stays queued; that
  ordering is kept, 2026-10-26 live gate) and from the `onConnectivity` auto-pause (`autoPaused`).
- **D-03:** **A Steam queue head after a restart is still surfaced as resumable, never
  auto-started (parity).** The `isStartup` rule in `initQueue` (`debug/steam-install-slow-start`
  Thread B) is ported as it is: `installManagedExternally` runners are deferred on the startup
  call only; the Resume button, a fresh enqueue while idle and the online reconnect process it
  normally. The `steamQueueHeadAlreadyInstalled` drop (todo 2026-11-09) is ported too.
- **D-04:** **The startup auto-resume keeps its 5 s delay after `frontendReady` (parity).** It is
  boot work and must be bounded and cancellable under the Rust shutdown contract. The persisted
  queue head is cancellable before the queue starts, as the TS `currentElement` seed guarantees
  (`steam-dm-queue-wedge` fix #1).

### Stall recovery
- **D-05:** **On a stall the install is stopped and recorded as an error, and the queue moves on
  to the next item (parity).** The error reason keeps the i18n key `gamelib:box.error.install.stalled`,
  and the log line keeps its stable English text (`install stalled — no progress observed for Ns
  (no-progress bound Mm)`), which a live gate greps. The stall trip aborts through the abort
  registry keyed by `appName`, gated on a registered controller (no false `Aborting not possible`
  error for sideload or a CLI gap).
- **D-06:** **The no-progress window stays 8 minutes for every runner (parity).** It sits above
  the Steam depot layer's own 180 s stall bound and the Steam plan-building time.
- **D-07:** **Only an observed advance re-arms the watchdog (percent up, or the bytes value
  changed), never the arrival of a progress event.** A runner that never reports progress
  (sideload) keeps the fixed 8-minute ceiling. A Rust test fails if a Steam-style heartbeat with
  no progress ever re-arms it.

### Gate
- **D-08:** **93 closes on goldens, the regression-scenario tests and three-OS CI, with no
  signed build or operator gate of its own** (the 92 / 88.1 shape). The regression scenarios
  are tests, each shown red against a reverted fix where practical:
  - `steam-dm-queue-wedge`: a persisted queue head can be cancelled and paused before the
    startup resume runs, and the cancel removes it from the persisted queue; a cancel during the
    Steam pre-download and plan-building steps takes effect promptly and resolves `cancelled`,
    not `error`.
  - `gog-download-resume-from-zero`: the queue does not reset progress that the runner (the 92
    `resumeProgress` port) reports across a pause and resume.
  - The quit pause keeps the element in the queue (not recorded as finished).
  - D-01/D-02: a user pause survives restart; a quit or offline pause resumes.
  - The stall watchdog (D-05..D-07) on a controllable clock.
- **D-09:** **93 hands four live checks to the Phase 98 shell-cutover gate as owed items**,
  written as a pending todo with the three triage keys (`severity:`, `platform:`, `ready:`) and
  named in 93's verification:
  1. **Pause stays paused.** Pause a GOG or Epic download, quit, reopen: it is still paused; Resume
     continues from where it was.
  2. **Quit mid-download resumes.** Quit during a running GOG or Epic download, reopen: it restarts
     by itself within about 5 s and does not restart from 0%; a Steam head shows as resumable.
  3. **Live stall trip.** Freeze the gogdl child with `SIGSTOP` (network stays on, so the offline
     auto-pause does not fire); after 8 minutes the item shows the stall error and the next item
     starts.
  4. **Finished list survives.** After an upgrade over the previous signed build, the finished
     entries and the queue look the same.

### Carried forward (already decided, not re-asked)
- **D-10:** Event names and payloads stay the same (`changedDMQueueInformation`, `progressUpdate`,
  the five queue channels `removeFromDMQueue`, `pauseCurrentDownload`, `resumeCurrentDownload`,
  `cancelDownload`, `getDMQueueInformation`, and the `install` / `updateGame` enqueue), so the
  renderer is untouched (86 D-08, 88 D-23). The channels become native Rust handlers with no
  sidecar fallback; the zod entries are deleted and the IPC snapshot regenerated (83
  D-04/D-06/D-07). Any send/invoke transport split is kept exactly (the Phase 31 Pitfall 2
  silent-failure risk).
- **D-11:** Goldens are recorded from the TS before porting (88 D-11 shape, Phase 82 D-05
  vacuous-pass guards). The TS is deleted once its goldens pass, with no flag; a failure is fixed
  in Rust, never by bringing the TS back (87 D-06, 88 D-18). Quirks found while porting are copied
  for parity and each is filed as a todo with the three triage keys (86 D-03, 88 D-20). The only
  deliberate deltas are D-01/D-02.
- **D-12:** The shims scheduled for deletion in 93 (90 D-06 router calls for Steam install and
  update, 91 D-12 legendary, 92 D-12 gogdl and nile) are removed: the Rust queue calls the Rust
  install and update entry points directly. Their schedule-test rows close in 93.
- **D-13:** The `downloadManager` store moves to Rust ownership through StoreHost (85), keeping
  `queue` and `finished` readable by the renderer mirror and by a rollback to the previous build.
  `pruneUnknownRunnerElements` (unknown-runner elements such as `zoom`) is ported.
- **D-14:** macOS is the live platform; Windows and Linux are proven by golden replay on the
  three-OS CI matrix (88 D-16).
- **D-15:** Rust shutdown contract: the queue's in-flight install holds a `gamelib_core::shutdown`
  Registrant; quit pauses the queue then aborts in-flight work within `ExitBudget::DEFAULT`; the
  startup resume is bounded boot work; any download spawn goes through `gamelib-proc`
  (`SpawnClass::Helper`). Load `Skill("gamelib-conventions")` before planning. The TS golden
  harness uses `createFakeHomeProfile()`.
- **D-16:** v0.11 rule: the phase's last plan leaves no TS or sidecar registration for the queue,
  and `easydl` is removed from `package.json` and the lockfile. Rebase onto main before the
  deletion plan (channel manifest, `relay_commands.rs`, `Cargo.lock`,
  `EXPECTED_LOCKFILE_CRATE_NAMES`).

### Claude's Discretion
- Where the queue lives (a `gamelib-downloads` crate, or inside an existing crate), as long as
  dependencies point at the runner crates, `gamelib-store` and `gamelib-proc`, never the reverse.
- The queue as a state actor (one owner, persist then emit; SUMMARY "State actors").
- How the persisted pause flag is stored (on the queue element or a queue-level key), within D-01.
- Whether anything still calls `downloadFile` by 93. Steam's `setupDownloads.ts` (90.1) and
  legendary's EOS overlay downloads (91) are its last TS callers today; if a caller survives, the
  replacement is reqwest with Range resume (SUMMARY item 93), otherwise just the deletion.
- The test clock and fake runners used for the stall and regression tests; the plan and wave
  breakdown.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/ROADMAP.md` § "Phase 93: Download manager" (goal, SC1..SC4, depends on 90.1 and 92.1) and § "v0.11 Phase Details" (lanes, v0.11 rules)
- `.planning/REQUIREMENTS-v0.11.md`: STO-04, FND-04, FND-06
- `.planning/research/v0.11/SUMMARY.md`: item "93. Download manager" (reqwest Range in place of `easydl`; needs deeper research), "State actors", and the downloadmanager test-oracle line (2.7k test lines ported as Rust tests or fixtures)
- `.planning/research/v0.11/PITFALLS.md`: stale-snapshot write-back and the concurrency model

### Regression scenarios (research flag)
- `.planning/debug/steam-dm-queue-wedge.md`: the three wedge mechanisms and their fixes (D-04, D-08)
- `.planning/debug/resolved/gog-download-resume-from-zero.md`: gogdl resumes but reports against remaining bytes (D-08)
- `.planning/debug/resolved/steam-install-slow-start.md`: why a Steam head is never auto-started on launch (D-03)
- `.planning/debug/resolved/depot-stall-bound-did-not-fire.md`, `.planning/debug/resolved/steam-1026-download-restart.md`, `.planning/debug/resolved/steam-startup-resume-crash.md`, `.planning/debug/resolved/steam-dl-missing-in-downloads.md`: other queue and stall incidents to cover

### Ownership and prior contracts
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`: the `downloadManager` store row (flips in 93)
- `.planning/phases/90-steam-services-and-typescript-depot-path/90-CONTEXT.md`: D-04 router, D-06 (the download manager calls the router until 93)
- `.planning/phases/91-epic-legendary-runner/91-CONTEXT.md`: D-12 (legendary install/update shims deleted in 93)
- `.planning/phases/92-gog-amazon-and-sideloaded-runners/92-CONTEXT.md`: D-12 (gogdl and nile shims deleted in 93), the 92.1 gate item 1 (`kill -9` mid-GOG-install leaves it resumable)
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-CONTEXT.md`: StoreHost, unknown keys kept
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-CONTEXT.md`: native router, no fallback, schema authority, shutdown contract
- `.planning/phases/88-launch-pipeline/88-CONTEXT.md`: D-11 golden shape, D-16, D-18, D-20, D-23

### Patterns to copy
- `src-tauri/crates/README.md`: per-domain crate recipe, §7 verification and deletion, §8 CI
- `src/backend/__tests__/*ShimSchedule.test.ts`, `storeMirrorSchedule.test.ts`, `*PortComplete.test.ts`: schedule rows and delete gates
- `src-tauri/crates/gamelib-launch/tests/fixtures/golden/`: golden layout and `deltas.json`
- `CLAUDE.md` Conventions table + `Skill("gamelib-conventions")`

</canonical_refs>

<code_context>
## Existing Code Insights

### TS that is deleted
- `src/backend/downloadmanager/downloadqueue.ts`: `createDownloadQueue` (`initQueue(isStartup)`, `addToQueue`, `removeFromQueue`, `pause/resume/cancel/stopCurrentDownload`, `getQueueInformation`, `onConnectivity` auto-pause, `pruneUnknownRunnerElements`, `addToFinished`)
- `src/backend/downloadmanager/utils.ts`: `installQueueElement` / `updateQueueElement` (offline skip, Epic outage dialog, the "Installation Started" toast suppressed for `installManagedExternally`, the cancelled-Steam-install badge clear, the stall error path, `downloadFixesFor`)
- `src/backend/downloadmanager/installStallWatchdog.ts` (`withStallTimeout`, `INSTALL_NO_PROGRESS_TIMEOUT_MS`), `finishedList.ts` (`upsertFinished`, `keepKnownRunnerElements`), `updateElement.ts`, `stores.ts`
- `src/backend/sidecar/downloadQueueFlowRegistration.ts`, the queue parts of `installFlowRegistration.ts`, `appShellFlowRegistration.ts` and `stdinEofRelease.ts`
- `downloadFile` in `src/backend/utils.ts` and `easydl`
- Tests in `src/backend/downloadmanager/__tests__/` (`downloadqueue`, `downloadqueueFinished`, `installStallWatchdog`, `updateElement`, `utils`) port as Rust tests or fixtures

### Established patterns
- Persist then emit: every queue mutation writes `download-manager.json`, then sends `changedDMQueueInformation` with `(queue, queueState)`
- The renderer treats `idle` and `paused` the same (a Resume affordance)
- Cancels go through the boot-owned abort registry keyed by `appName`

### Integration points
- The Rust runner install and update entry points from 90.1 (Steam), 91 (legendary), 92 (gogdl), 92.1 (nile, sideload)
- The online monitor's connectivity feed (offline auto-pause, D-02)
- The Rust shutdown path (quit pause, D-15) and the boot sequence (the 5 s startup resume, D-04)

</code_context>

<specifics>
## Specific Ideas

- The live stall check freezes the gogdl child with `SIGSTOP`, so the network stays up and the
  offline auto-pause cannot hide the stall (D-09 item 3).
- "Paused stays paused" means the user's own pause only; being cut off by quitting or going
  offline is not a pause (D-02).

</specifics>

<deferred>
## Deferred Ideas

- The four live checks → the Phase 98 gate (D-09).
- Retry-once on a stall, a shorter stall window for the CLI runners, and auto-resuming Steam on
  relaunch were all considered and declined (parity kept).

### Reviewed Todos (not folded)
`todo.match-phase 93` matched 71 pending todos, all on generic keywords (runner, log sanitizer,
Humble, shortcut, launch quirks). None concerns the download queue; each belongs to its recording
phase.

</deferred>

---

*Phase: 93-download-manager*
*Context gathered: 2026-11-27*
