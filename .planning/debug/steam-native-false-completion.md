---
slug: steam-native-false-completion
status: investigating
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

## Scope fence

- Do NOT weaken the Phase 23 StateFlags 4-vs-1026 completeness semantics — the fix must make `done` STRICTER (require true all-depot completion), never looser.
- Do NOT regress the already-verified Thread A/B (cancel/abort, auto-resume) or D-1 (quit-time exception) behavior from the resolved session.
- Do NOT touch Thread C (single-host fan-out throughput cap) — that is deferred/tracked separately (Phase 25) and is a throughput, not correctness, issue.
- Do NOT regress GOG/Epic/Amazon completion paths.
- A partial install must be recoverable: prefer marking it resumable/incomplete over marking it done.

## Current Focus

- hypothesis: The Steam native completion path (runNativeDepotDownload return status and/or the ACF/install poller's completion predicate) declares `done` on partial multi-depot progress instead of requiring all-depot BytesDownloaded == BytesToDownload, so downloadqueue.ts faithfully records a false completion.
- next_action: gather initial evidence — read the Steam native completion path (games.ts runNativeDepotDownload completion accounting + startInstallPolling completion predicate + the StateFlags-4 write) and inspect a post-repro appmanifest_{appId}.acf for StateFlags / byte counts / InstalledDepots subset.
