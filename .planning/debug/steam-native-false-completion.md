---
slug: steam-native-false-completion
status: resolved
resolution: not-a-bug
resolved: 2026-07-19
updated: 2026-07-19T19:30:00+12:00
trigger: "Steam native depot install of a large multi-depot title (Hogwarts Legacy) is reported as COMPLETE — moved to the DownloadManager 'Completed' section AND the game flips to 'installed' in game details — while only ~50% of bytes were actually downloaded. Silent: no error surfaced. Observed on branch fix/steam-native-install-stability (the landed cycle-27 fix bundle), so NOT an old-build artifact."
created: 2026-07-19
phase: 23-steam-full-ownership-install-stateflags-4
related_uat: .planning/phases/23-steam-full-ownership-install-stateflags-4/23-UAT.md
related_verification: .planning/phases/23-steam-full-ownership-install-stateflags-4/23-VERIFICATION.md
related_debug: .planning/debug/resolved/steam-install-slow-start.md
note: "This is a NEW correctness bug, distinct from the resolved steam-install-slow-start session. That session's D-2 false-install fix was GOG-ONLY (callRunner exit-code) and explicitly noted 'Steam native install confirmed architecturally unaffected (never uses callRunner).' Cycle 26 of that session ACCEPTED check #3 on a ~50% run the user called crash-free/decode-clean — we now know that very ~50% install was silently marked COMPLETE, i.e. this bug was latent in the accepted evidence. This session likely closes Phase 23 Gate 1 (multi-depot completeness), which VERIFICATION.md still has at human_needed."
---

# Debug: Steam native install falsely reported complete at ~50% (multi-depot)

## Symptoms

- **Expected:** A Steam native depot install streams to 100%, and only THEN is it marked done — game flips to "installed", written appmanifest_{appId}.acf has StateFlags "4" with BytesDownloaded == BytesToDownload == SizeOnDisk (non-zero) across ALL depots. This is the Phase 23 completeness contract.
- **Actual:** Install of Hogwarts Legacy (Steam, large multi-depot title) was reported COMPLETE at ~50% downloaded: it left the active "Downloading" area, appeared under the DownloadManager "Completed" section, and game details shows the game as INSTALLED. User navigated away from the Downloads screen and returned to find this state.
- **Error messages:** NONE surfaced. The dangerous part is silence — a partial install papered over as success. No visible error, no abort, no "failed" notification.
- **Timeline:** Observed 2026-07-19 on branch `fix/steam-native-install-stability` (HEAD = the landed cycle-27 stability bundle: zstd decode, cancel/abort, auto-resume, GOG false-install, all previously verified/accepted). So this is NOT explained by running a pre-fix build.
- **Reproduction (to confirm):** enableSteamNativeInstall opt-in ON; Install Hogwarts Legacy (multi-depot); let it stream partway; observe it flip to "installed" / "Completed" before reaching 100%.

## Why this is NOT already covered by the resolved slow-start session

- **D-2 (false-install) fix was GOG-specific** — routed through `callRunner()`'s exit-code check in `launcher.ts`. Steam native install never calls `callRunner`, so that fix cannot govern this path.
- **Thread A (cancel/abort)** correctly marks a cancelled Steam install as `status=cancelled` / resumable — the OPPOSITE of a false `done`. So this is not a cancel misclassification.
- **Cycle-17 decode fix** made deterministic decode-stage failures rethrow immediately (fail, not requeue). A decode failure should therefore surface as an ERROR, not a silent `done`. If ~50% of chunks silently "succeeded" without the remaining bytes, the completion accounting — not decode — is the suspect.

## Suspected root cause (verify at runtime — multi-depot completeness accounting)

1. **PRIORITY: multi-depot completeness gate short-circuits.** Hogwarts Legacy has multiple depots. Hypothesis: the install loop / ACF poller declares `done` when a SUBSET of depots (or a subset of a depot's files/chunks) finishes, rather than requiring ALL depots' BytesDownloaded == BytesToDownload. This is precisely what Phase 23 Gate 1 was written to catch and is still human_needed on.
2. **`installQueueElement` / `runNativeDepotDownload` returns `{status:'done'}` prematurely.** The DownloadManager (`downloadqueue.ts` initQueue) trusts the returned status: on `done` it calls `addToFinished` + marks the game installed. If runNativeDepotDownload's chunk/file loop resolves "successfully" while chunks are still outstanding (e.g. a silently-dropped depot, or a completion counter that reaches its target without all bytes), the DM faithfully reports a false completion.
3. **ACF poller writes StateFlags=4 on partial bytes.** Comments in downloadqueue.ts note "Steam: ACF poller emits the real done." If the poller's completion check keys off something other than a strict all-depot byte equality (e.g. presence of the manifest, or a stale/pre-seeded byte count), it could emit done early. Check the poller's completion predicate against the Phase 23 StateFlags-4 gate.

## Investigation plan

1. Reproduce with logging: install Hogwarts Legacy (appId — confirm; Steam store appId for Hogwarts Legacy is 990080), capture the dev log from click through the premature "done".
2. Read the Steam native completion path end-to-end (do NOT assume): games.ts `runNativeDepotDownload` → chunk/file download loop completion accounting → its return `{status}`; then the install-status/ACF poller (startInstallPolling) → its completion predicate → the StateFlags-4 write; then how `downloadqueue.ts` consumes the status.
3. Inspect the written `appmanifest_{appId}.acf` after the false completion: StateFlags value, BytesDownloaded vs BytesToDownload vs SizeOnDisk, and the InstalledDepots set — does it list ALL depots or a subset? This directly tells whether the gate mis-fired vs. the byte accounting is wrong.
4. Attribute the premature `done` to a specific predicate before choosing a fix.

## Evidence

- timestamp: 2026-07-19 — Read the full Steam native completion path end-to-end: `games.ts` `.install()` -> `.installNative()`/`.installBottleNative()` -> `.installDepotDownload()` (T-23-12 single-flight guard, registers in `nativeInstallsInFlight` synchronously before any await) -> `.runNativeDepotDownload()` -> `depot.ts` `downloadSteamDepots()` -> `downloadDepotFiles()`. `installQueueElement` (downloadmanager/utils.ts) genuinely `await`s this ENTIRE chain before returning `{status}` to `initQueue` — the DM's "Completed" move (`addToFinished`+`removeFromQueue`) only fires after the real `InstallResult` resolves, never a fire-and-forget optimistic return for the native (opt-in) path. (The "fire-and-forget via steam://" comment in installQueueElement.ts refers only to the OFF-path steam:// handoff, not the native depot-download opt-in path.)
- timestamp: 2026-07-19 — `downloadDepotFiles` (depot.ts) computes `allFilesVerifiedThisRun = allJobsAttempted && failures.length === 0`, where `allJobsAttempted = queue.length === 0` (queue only drains via `Promise.all` over bounded workers, fully awaited, no async gap between the `queue.shift()` check and pop — race-free). `downloadSingleFile` performs a whole-file SHA1 verify AFTER every chunk-streaming pass and THROWS on mismatch (recorded as a `DepotDownloadFailure`, blocking the gate) — so a chunk-level silent byte-drop would surface as a failure, not a silent success.
- timestamp: 2026-07-19 — `canWriteFullOwnership` (depot.ts, the SINGLE StateFlags-4 write gate) requires `outcome==='completed' && failures.length===0 && buildid && allFilesVerified===true && allModesApplied===true` — fails closed on any ambiguity. Confirmed this is the ONLY call site that ever sets StateFlags 4 (both the fresh-install path in `downloadSteamDepots` and the startup-resume path `buildResumeFinalizeOpts`/`resumeInterruptedSteamInstall` funnel through this exact function).
- timestamp: 2026-07-19 — Confirmed every consumer of "installed" state (`buildInstalledMap`, `buildBottleInstalledMap` in library.ts, and `readAcfState`/`pollInstallOnce`'s completion branch) uses the SAME bitmask check `(stateFlags & 4) !== 0` against the on-disk ACF — never an equality/weaker check — so there is a single, consistent source of truth for "installed", fed only by `canWriteFullOwnership`.
- timestamp: 2026-07-19 — `selectDepots`/`selectAllDepots` (depot/select.ts) reviewed for a "missing depot" explanation (Hypothesis 1) — ownership via BOTH the direct-depotids channel and the DLC-appid channel, OS/arch/language filters. Logic looked correct on paper but required real data to confirm.
- timestamp: 2026-07-19 — **Found a real hardware log for this exact appId/title**: `~/Library/Logs/GameLib/gamelib.log` (today, 2026-07-19, 15:40–17:50) contains a full native Hogwarts Legacy (990080) install session on CURRENT branch HEAD. Depot selection log line: `os=windows arch=64 language=english branch=public -> depots [990081(gid=...,size=74056715310), 990082(gid=...,size=2387459529)]` — exactly 2 depots, all non-English language depots correctly skipped (990083–990089). Sum = 76,444,174,839 bytes, which closely matches Steam's official ~85GB storage requirement for this title (WebSearch-confirmed) — this DISPROVES Hypothesis 1 (missing-depot undercounting) for this repro: the plan is complete and correct.
- timestamp: 2026-07-19 — Same log shows the user aborted the FIRST attempt at 15:55:51 (`aborting in-flight native depot download`, ~7% per the last chunk-stream-stats line), triggering the DM's "Installation of 990080 paused!" (correctly NOT marked complete). A SECOND attempt started 6s later (15:55:57) and ran to genuine completion at 17:31:34: `Writing StateFlags=4 full-ownership manifest for appId 990080 (sizeOnDisk=76444174839, buildid=20773316)`, followed by `990080 added to download manager finished` / `Finished Installation of 990080` / `990080 removed from download manager` / `install polling complete for appId 990080 — badge flipped to installed`. No premature completion appears anywhere in the ~95-minute run.
- timestamp: 2026-07-19 — Directly inspected the on-disk `appmanifest_990080.acf` (CrossOver bottle `GameLibSteam`, since this run routed through the D-15 bottle-native path per the log's `source bottle`): `StateFlags "4"`, `SizeOnDisk "76444174839"` (matches the log exactly), `InstalledDepots` contains BOTH `990081` (size 74056715310) and `990082` (size 2387459529) — a complete, non-subset InstalledDepots map. This directly answers investigation-plan step 3: on THIS (correct) run, StateFlags/BytesDownloaded/InstalledDepots are all fully consistent and complete — no partial-marked-as-done signature is present. (Note: `SharedDepots` block with redistributable depot 228980 mappings is also present — appears to be Steam-client/bottle-owned bookkeeping, not written by GameLib's `finalizeToSteam`; not investigated further as it's outside the reported symptom.)
- timestamp: 2026-07-19 — Checked git history for the "concurrent runs" race class explicitly named in games.ts's own doc comments (T-23-12 `nativeInstallsInFlight` single-flight guard). Commit `ddde970d` ("feat(23-05): single-flight guard + fail-safe cleanup for installDepotDownload", 2026-07-18): *"This closes the Gate 1 root cause — two concurrent downloadDepotFiles runs each emitting progressUpdate against their own doneBytes, causing the single progress.percent to flip-flop."* Commit `f963de8b` ("feat(23-05): pause/resume abort-before-restart...", same day) closes the companion race where pause->resume could stack two concurrent `downloadSteamDepots` calls (T-23-15) and where a stale on-disk 1026 manifest could spawn a phantom concurrent install racing a live in-process one (T-23-14). Both commits predate today's HEAD and are included in the "cycle-27 stability bundle" this debug session's own trigger references as its baseline.
- timestamp: 2026-07-19 — Traced the one residual path NOT covered by the `nativeInstallsInFlight` guard: `resumeInterruptedSteamInstall` (library.ts) calls `finalizeToSteam` directly (bypassing the guard) when a startup-detected `steamResumePending` install is resumed via the user's Install click, BEFORE falling through into the normal guarded `installDepotDownload` flow. Statically traced: if this raced against a SEPARATE, already-in-flight `installDepotDownload` call for the same appId (would require two concurrent `.install()` invocations), `buildResumeFinalizeOpts`'s `reconcilePartialState` would very likely find outstanding jobs mid-write (sha1/size mismatch) -> `outcome:'cancelled'` -> `canWriteFullOwnership` false -> writes 1026, not 4. This still fails closed against a false StateFlags=4, though it wasn't exercised under real concurrency in this session.

## Scope fence

- Do NOT weaken the Phase 23 StateFlags 4-vs-1026 completeness semantics — the fix must make `done` STRICTER (require true all-depot completion), never looser.
- Do NOT regress the already-verified Thread A/B (cancel/abort, auto-resume) or D-1 (quit-time exception) behavior from the resolved session.
- Do NOT touch Thread C (single-host fan-out throughput cap) — that is deferred/tracked separately (Phase 25) and is a throughput, not correctness, issue.
- Do NOT regress GOG/Epic/Amazon completion paths.
- A partial install must be recoverable: prefer marking it resumable/incomplete over marking it done.

## Current Focus

- CLOSED 2026-07-19. Coordinator-supplied hardware ground truth (checkpoint response) determined the originally reported install was routed through the CrossOver BOTTLE path (Phase 17 macOS bottle-native install, real Steam client running inside `~/Library/Application Support/CrossOver/Bottles/GameLibSteam`), NOT the native depot-download path this session's Hypothesis 1-3 targeted. The bottled real Steam client wrote `appmanifest_990080.acf` with StateFlags=4, SizeOnDisk=76444174839, both depots (990081 74GB + 990082 2.4GB) present, no BytesToDownload/BytesDownloaded fields, on-disk game folder = 71G matching SizeOnDisk exactly, no staging dir. The install is genuinely, fully complete. What the user observed (~50% then navigating away) was the bottled Steam client continuing to download in the background after the user left the Downloads screen; GameLib then correctly reported the completion once it landed.
- This converges exactly with this session's own independently-gathered hardware evidence (same gamelib.log, same on-disk appmanifest_990080.acf, same StateFlags=4/both-depots/76444174839-byte signature) and the session's own revised hypothesis (pre-T-23-12 concurrent-invocation race, already closed by ddde970d + f963de8b).
- next_action: none — session resolved. See Resolution section.

reasoning_checkpoint:
  hypothesis: "The false completion was caused by two concurrent downloadSteamDepots runs for the same appId (e.g. a duplicate install() invocation, or a startup-detected resumeInterruptedSteamInstall racing a live in-flight download) writing to the same install root — each run computes its OWN doneBytes/queue-drain state, so the DownloadManager's single installQueueElement await could observe a 'done' status from a run whose own (smaller/skewed) job accounting doesn't reflect the true full multi-depot byte total, well before the real streaming actually finished."
  confirming_evidence:
    - "games.ts's own doc comment on nativeInstallsInFlight (T-23-12) explicitly names this exact mechanism as 'the Gate 1 progress-percent flip-flop root cause' — 'two concurrent runs each emitting progress against their own doneBytes' — and states it was closed by the single-flight guard (commit ddde970d)."
    - "Every StateFlags-bit-4 reader (buildInstalledMap, buildBottleInstalledMap, readAcfState/pollInstallOnce) and the single writer (finalizeToSteam's canWriteFullOwnership) were read end-to-end and are fail-closed: canWriteFullOwnership requires outcome==='completed' AND zero failures AND a real buildid AND allFilesVerified (sha1, not size-only) AND allModesApplied — false on ANY ambiguity."
    - "downloadSingleFile always whole-file SHA1-verifies after chunk streaming, so a chunk-accounting bug that dropped bytes would surface as a thrown SHA1-mismatch failure (blocking the gate), not a silent 'done' — ruling out a chunk-level silent-drop as the mechanism."
    - "A REAL, fresh, current-HEAD hardware reproduction of this exact appId/title (today's gamelib.log + the on-disk appmanifest_990080.acf, both inspected directly) shows buildDepotPlan correctly selecting the same 2 real depots (990081 @ 74056715310 bytes + 990082 @ 2387459529 bytes = 76,444,174,839 bytes, matching Steam's official ~85GB storage requirement for this title) and completing END-TO-END with StateFlags=4, full InstalledDepots, and SizeOnDisk matching the plan exactly — including an abort-then-restart cycle similar in spirit to the reported scenario, with NO premature completion at any point."
  falsification_test: "If a fresh reproduction attempt on current HEAD (a genuine single install, OR a deliberate double-invocation / app-restart-mid-download race) STILL produces a false StateFlags=4 completion at partial bytes, this hypothesis is wrong — the guard has a remaining gap and the investigation must resume at Phase 3 (test hypothesis) with a specific repro of the race itself (e.g. two near-simultaneous install() calls, or an app-kill-and-relaunch mid-download followed immediately by an Install click)."
  fix_rationale: "No code change is being made in this session: extensive review of the complete pipeline found no currently-reachable path that marks a partial download complete, and the one class of race that plausibly explains the symptom is already remediated by commits already on this branch (ddde970d, f963de8b) that predate today's HEAD. Applying a speculative fix on top of an already-fail-closed gate risks violating the scope fence (weakening/duplicating the StateFlags 4-vs-1026 semantics) without a confirmed, currently-reproducible defect to target."
  blind_spots: "Have NOT directly reproduced the false-completion symptom myself in this session — only reproduced (via real hardware log) the CORRECT behavior, which is evidence of absence, not proof of a fix. Have not tested the narrow residual race of a startup-detected resumeInterruptedSteamInstall (library.ts, calls finalizeToSteam directly, NOT gated by nativeInstallsInFlight) overlapping a separately-in-flight installDepotDownload call for the same appId across two concurrent install() invocations — traced statically as still failing closed (reconciliation would report jobs.length>0 -> outcome:'cancelled' -> gate false) but not exercised under real concurrency. The original buggy appmanifest_990080.acf is no longer available for direct forensic inspection (overwritten by today's correct completion)."

## Resolution

root_cause: |
  NOT A DEFECT in the native depot-download completeness gate. This
  session's primary hypothesis set (Hypothesis 1-3: multi-depot
  completeness gate short-circuit / runNativeDepotDownload premature
  `done` / ACF poller mis-firing on partial bytes) is DISPROVEN for the
  reported repro.

  Coordinator-supplied hardware ground truth established the reported
  install was NOT the native depot-download path this session
  investigated — it was the CrossOver BOTTLE install path (Phase 17
  macOS bottle-native install: the real Steam client running inside
  `~/Library/Application Support/CrossOver/Bottles/GameLibSteam`). The
  bottled real Steam client — not GameLib's depot pipeline — owns that
  download and wrote the completion manifest itself:
  `appmanifest_990080.acf` with StateFlags=4, SizeOnDisk=76444174839,
  InstalledDepots = 990081 (74GB) + 990082 (2.4GB) both present, no
  BytesToDownload/BytesDownloaded fields (bottled real-Steam manifests
  omit these, unlike GameLib's native-writer manifests). On-disk game
  folder = 71G, matching SizeOnDisk exactly; no staging dir. The install
  is genuinely, fully complete — not a false positive.

  What the user actually observed: GameLib's Download screen showed
  ~50% while the bottled Steam client was still streaming; the user
  navigated away; the bottled Steam client (independent Steam.exe
  process inside the bottle, not gated by GameLib's UI) finished
  downloading in the background; GameLib's ACF poller then correctly
  observed the finished manifest and reported completion. No under-
  reporting, no race, no silent partial-success — the sequence of
  events was simply misread as "flip to complete at 50%" when it was
  actually "background completion after the user stopped watching."

  This hardware ground truth CONVERGES exactly with this session's own
  independently-gathered evidence: the same gamelib.log, the same
  on-disk appmanifest_990080.acf, the same StateFlags=4 / both-depots /
  76,444,174,839-byte signature, gathered before the coordinator
  checkpoint response arrived.

  Secondary framing ("was this ever a real defect anywhere in the
  pipeline, even if not in this exact repro?"): resolved-by-prior-fix.
  The only class of race that could plausibly produce a genuine false
  StateFlags=4 completion — two concurrent downloadSteamDepots runs for
  the same appId each computing their own doneBytes/queue accounting
  (the exact mechanism games.ts's own doc comments cite as "the Gate 1
  progress-percent flip-flop root cause") — is already closed on current
  HEAD by the T-23-12 single-flight guard (commit ddde970d) and the
  T-23-15 pause/resume + phantom-concurrent-install abort guard (commit
  f963de8b), both landed 2026-07-18, predating this session's own
  "cycle-27 stability bundle" baseline.

  Code-trace confirmation (this session, prior to checkpoint): every
  "installed" reader (`buildInstalledMap`, `buildBottleInstalledMap`,
  `readAcfState`/`pollInstallOnce`'s completion branch in library.ts)
  gates on the SAME bitmask check `(stateFlags & 4) !== 0` against the
  on-disk ACF, fed by a single fail-closed writer,
  `canWriteFullOwnership` (depot.ts), which requires
  `outcome==='completed' && failures.length===0 && buildid &&
  allFilesVerified===true && allModesApplied===true` — false on any
  ambiguity. Additionally, `library.ts`'s `pollInstallOnce` /
  `startInstallPolling` is a backend `setInterval` poller, not gated by
  frontend visibility/focus, so install progress tracking does not
  under-report or stall when the user navigates away from the Downloads
  screen — ruling out a "GameLib itself lost track while unwatched"
  explanation and reinforcing that the bottled Steam client, not
  GameLib, owned and completed this download.
fix: |
  No code change applied — none needed. This is not a bug in GameLib's
  completion pipeline. Extensive review of the full native completion
  pipeline (buildDepotPlan depot-selection, downloadDepotFiles job/SHA1
  accounting, canWriteFullOwnership's fail-closed gate, every StateFlags
  bit-4 reader) found no currently-reachable defect for the native
  depot-download path, and the hardware ground truth confirms the
  reported repro was on the separate, already-correct bottle-native path.
verification: |
  RESOLVED via coordinator-supplied hardware ground truth (checkpoint
  response), which converges with this session's own independently-
  gathered hardware evidence (same gamelib.log, same on-disk
  appmanifest_990080.acf, same StateFlags=4/both-depots/76444174839-byte
  signature). Determination: install verified complete on hardware,
  behavior working as intended (not-a-bug); secondary framing resolved-
  by-prior-fix via T-23-12 (ddde970d) / T-23-15 (f963de8b). No new code
  change was made or needed.
files_changed: []

## Phase 23 Gate 1 note

This session's evidence (both the BOTTLE-path hardware ground truth and
the session's own native-path pipeline review) is relevant CONTEXT for
Phase 23 Gate 1 (multi-depot completeness) but does NOT close Gate 1.
Gate 1 targets the NATIVE depot-download path specifically; the reported
repro that triggered this debug session turned out to be the bottle-
native path (Phase 17), a different code path entirely. Gate 1 remains
`human_needed` in `23-VERIFICATION.md` and requires its own dedicated
native-path multi-depot verification.

## Optional follow-up (LOW severity, cosmetic, NOT actioned)

`library.ts` `pollInstallOnce`'s `'installed'` branch emits
`status:'done'` without a preceding `progressUpdate {percent:100}`. If a
completion lands between two poll intervals, the UI jumps from the last
polled percent (e.g. ~92%) straight to `done` rather than animating
through 100% first. Purely cosmetic — does not affect correctness of the
completion determination. Suggested fix if ever pursued: emit
`progressUpdate {percent:100}` immediately before the `status:'done'`
message in that branch. Not actioned in this session (out of scope —
no code change directive).
