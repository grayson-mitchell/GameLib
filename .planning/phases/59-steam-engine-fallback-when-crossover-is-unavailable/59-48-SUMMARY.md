---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 48
subsystem: uat
tags: [re-uat, gap-closure, CR-01, G26, G27, G28]
requires: [59-44, 59-45, 59-46, 59-47]
provides:
  - "Re-UAT 5 items 40-43 with live operator verdicts"
  - "New gaps G29 (transient demo-status failure marks healthy CrossOver broken) and G30 (about 20 s DXVK removal)"
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/59-UAT.md
requirements-completed: [CR-01, G26, G27, G28]
completed: 2026-11-03
---

# Phase 59 Plan 48: Re-UAT 5 Summary

Round 5 was re-tested live: items 40-43 all pass (two with caveats), and the run found two new gaps, G29 (major) and G30 (minor).

## Gate battery

| Gate | Result |
| ---- | ------ |
| `pnpm codecheck` | exit 0 |
| `pnpm smoke:sidecar` | exit 0 |
| `pnpm planning-gates` | exit 1, 11/12: `59-VERIFICATION.md` frontmatter does not parse (79:94, closing `---` on the same line as the last value). Committed at baseline 6039a5d20, not caused by round 5, not edited (verifier owns it). |
| `pnpm test:ci` | 10 suites / 11 tests fail, identical set at baseline 6039a5d20; zero new, none in a round-5 file |
| `pnpm lint` | production was 1131 against ceiling 1130 (baseline 1130); fixed (below); now 1130, passes. Tests scope 661, same as baseline. |

## Results

| Item | Re-tests | Verdict |
| ---- | -------- | ------- |
| 40 | CR-01 | pass: both offline Plays fresh-checked `offline via no-interface`, no `via monitor`, one check-online, online recovered by itself, online Play `dns-ok` |
| 41 | G26 | pass with caveat: single launch, switch succeeded; the second click never reached the backend because the Play button disables on the first click, so the join path rests on unit tests |
| 42 | G27 (accept) | pass: probe 9268 ms, restore and launch on CrossOver, about 33 s click to window |
| 43 | G28 | pass with caveat: two dialogs shown and confirmed; the queued `replacesOpenDialog=true` case cannot be triggered from the UI (modal), so it rests on the 59-45 unit tests |

## New gaps

- G29 (major, found in item 40): one transient `demo-status` nonzero exit (`code=1 stderr= elapsedMs=33`, about 2 s after the previous session's helper exited) produced `reason=cx-broken` and a Wine-Staging launch ("can't open 3440x1440") on a healthy CrossOver.
- G30 (minor, found in item 42): the `pinned -> crossover` switch spends about 20 s in two 10 s DXVK removal steps; not offline-specific.
- Follow-up (not a gap): item 38's concurrent launches must have come from a second entry point; worth a todo.
- Unrelated: boot `keyring_get` for the Steam refresh token timed out after 45003 ms.

## Deviations from Plan

**1. [Rule 1 - Bug] New production lint warning from round 5**
- **Found during:** Task 1 gate battery
- **Issue:** the G26 notice's `i18next.t` call added one `import-x/no-named-as-default-member` warning (1131 vs ceiling 1130).
- **Fix:** `eslint-disable-next-line` on that call, same call shape as the file's other uses.
- **Files modified:** `src/backend/storeManagers/steam/games.ts`
- **Commit:** 5e8395617

**2. planning-gates not exit 0** because of the pre-existing `59-VERIFICATION.md` frontmatter defect, left for the verifier.

## Commits

- 5e8395617: fix(59-48): clear the one new production lint warning from the G26 notice
- 049e17ab2: docs(59-48): add re-UAT 5 items 40-43

## Safety

Licence unchanged (304 bytes, Oct 22 19:57); bottle count unchanged (30); CrossOver.app untouched; no bottled-Steam route line; pin and DXVK restored to `steam-engines`. The Planet Crafter marker is `pinned:wine-staging-11.20` until the next online Play.

## Self-Check: PASSED
