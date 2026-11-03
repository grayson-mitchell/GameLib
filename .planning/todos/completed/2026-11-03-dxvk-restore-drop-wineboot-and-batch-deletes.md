---
created: 2026-11-03T12:00:00.000Z
title: "DXVK restore: drop wineboot -u on an engine flip and batch the override deletes, once shown on CrossOver"
area: steam-engine
files:
  - src/backend/tools/index.ts
  - src/backend/storeManagers/steam/engine/engineSwitch.ts
severity: minor
platform: macos
ready: live-gate
---

## Context

G30 (`.planning/debug/g30-slow-dxvk-removal-on-crossover-restore.md`): the
DXVK removal on a CrossOver restore is slow. 59-51 made a partial fix (strict
restore that settles on exit, switches serialised per bottle). Two follow-ups
were deferred, each only once shown on CrossOver.

## Follow-ups

1. Drop `wineboot -u` in the `installRemove` restore branch on an engine flip.
   Scratch Wine-Staging evidence: a mismatched `.update-timestamp` makes the
   first wine process restore the removed DLLs, so the timestamp alone may do
   the job. This is unverified on CrossOver. `wineboot -u` adds about 6 s to
   exit.
2. Batch the override deletes into one `reg import`. It saves about 1 s, and
   its failure mode is a silent no-op, so it needs care.

## Gate before either change

On a throwaway CrossOver bottle, after a Staging -> CrossOver flip with the
DXVK DLLs removed, show that the stock d3d11 and d3d10core are back without
`wineboot -u`.

## Resolution (2026-11-03, quick 261103-wtm)

Closed by `ff82f781f`. The gate passed on a throwaway CrossOver bottle: with the DLLs removed
before the first CrossOver process, the flip's automatic update restored all four stock DLLs by
the time a single batched `reg import` exited, with no `wineboot -u`. Two findings changed the
shape. Forged `.update-timestamp` values did not reliably trigger the update, so the restore
checks whether the DLLs came back and runs `wineboot -u` only if they did not. A no-match import
exits 0, so one `reg query` verifies the overrides are gone. Evidence:
`.planning/quick/261103-wtm-dxvk-restore-drop-wineboot-and-batch-ov/`.
