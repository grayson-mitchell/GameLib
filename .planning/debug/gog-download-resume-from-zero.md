---
status: awaiting_human_verify
trigger: "GOG download resume restarts from 0% — todo .planning/todos/pending/2026-11-07-gog-download-resume-restarts-from-zero.md"
created: 2026-11-07
updated: 2026-11-07
---

## Symptoms

- expected: Pausing a GOG download and resuming continues from the paused progress (already-downloaded chunks/files are kept; progress resumes near the pause point).
- actual: Pausing Endless Sky (GOG 1829678475) at 12.07% and resuming re-runs a byte-identical gogdl download command (`--platform osx --skip-dlcs --lang en-US`, support dir `gog-support/1829678475`) and progress restarts at 0%.
- errors: none reported.
- timeline: found in Phase 62 smoke 2 (62-UAT.md); pre-existing, not caused by phase 62. Not confirmed against a pre-62 build.
- reproduction: Start a GOG install (Endless Sky, macOS), pause at ~12%, resume; observe progress at 0%.
- todo: .planning/todos/pending/2026-11-07-gog-download-resume-restarts-from-zero.md

## Current Focus

- hypothesis: (none yet) — candidates: (a) pause kills gogdl and deletes/cleans partial files or support dir; (b) gogdl resumes chunks but reports progress from 0 over the full remaining set, so the UI shows 0% while actually skipping verified files; (c) gogdl's resume state (e.g. `.gogdl-resume` in install dir) is not written or is ignored because of how the process is killed.
- next_action: gather initial evidence — find GOG pause/resume code path (graphify query), inspect gogdl resume mechanism and progress reporting.

## Evidence

- checked ~/Library/Logs/GameLib/games/1829678475_gog/install.log(.old): resumed run logs 'Attempting to continue the download'; Progress total fell 425791945 -> 419050577 = exactly 6741368 bytes written pre-pause. gogdl resumed correctly; it reports percent vs remaining bytes only (hypothesis b confirmed; a, c eliminated).

## Eliminated

## Resolution

- root_cause: gogdl resumes but reports Progress against remaining bytes, so GameLib UI shows 0%.
- fix: remember max total per game, fold pre-pause bytes into percent (resumeProgress.ts, wired in GOGGame.onInstallOrUpdateOutput).
- verification: unit test only; live pause/resume UAT pending
- files_changed: src/backend/storeManagers/gog/resumeProgress.ts, games.ts, __tests__/resumeProgress.test.ts
