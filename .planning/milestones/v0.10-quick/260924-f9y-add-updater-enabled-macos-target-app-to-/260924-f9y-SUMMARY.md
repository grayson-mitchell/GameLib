---
quick_id: 260924-f9y
title: Add the updater-enabled macOS target `app` to bundle.targets
date: 2026-09-24
status: complete
commit: 598fac565
closed_todo: .planning/todos/completed/2026-09-23-macos-updater-manifest-can-never-gain-a-macos-entry-bundle-targets-omits-app.md
filed_todo: .planning/todos/pending/2026-09-24-macos-updater-entry-in-latest-json-is-unproven-until-a-release-run.md
---

# Quick Task 260924-f9y — SUMMARY

## What shipped

`src-tauri/tauri.conf.json` `bundle.targets` went from `["nsis", "appimage", "dmg"]` to
`["nsis", "appimage", "app", "dmg"]`. One line. `createUpdaterArtifacts` was already `true` and is
untouched. With no updater-enabled macOS target the bundler built no `GameLib.app.tar.gz`, so
`latest.json` could never carry a `darwin-*` platform — release run `35841476015` ended
`Signature not found for the updater JSON. Skipping upload...` on a macOS leg that was otherwise
completely green.

Two gates moved with it (`meta/__tests__/artifactTargets.test.ts` deep-equals the array by design;
`src/backend/__tests__/tauriConf.test.ts` gained a named assertion), the predecessor todo is closed
with a full resolution record, and the un-dischargeable half is now its own `ready: live-gate` todo.

## The part that needed care — the target NAME

The todo explicitly forbade naming the target from memory, because the bundler's own warning in the
job log stopped at its colon and never printed the list of valid targets. The list was recovered
from the binary shipped with the INSTALLED `@tauri-apps/cli` **2.11.4**:

```
strings -a node_modules/@tauri-apps/cli-darwin-arm64/cli.darwin-arm64.node | grep 'updater-enabled targets'
-> "...no updater-enabled targets were built. Please enable one of these targets: app, appimage, msi, nsis"
```

That single string answered BOTH of the todo's requirements at once: `app` is the macOS one
(requirement 1), and `nsis` is indeed in the list (requirement 2) — with the bound the todo insisted
on, namely that the Windows leg has never produced an artifact at all, so nothing about Windows
updater artifacts is measured end to end.

## Verification actually run

| gate | result |
| --- | --- |
| `node` deep-equal on the parsed config | `['nsis','appimage','app','dmg']`, `createUpdaterArtifacts: true` |
| `npx jest` on both affected test files | 49 passed, 2 suites |
| **negative control** — config reverted, tests re-run | **2 failed / 47 passed**, exactly the two new/moved assertions; green again on restore |
| `pnpm codecheck` | rc=0 |
| `pnpm lint` | src **1107/1124**, tests **638/638** — both PASS, zero-headroom tests scope unmoved |
| `npx prettier --check` (3 changed source paths, explicit) | rc=0 |
| `pnpm planning-gates` | **12/12** |

## Two traps hit, recorded because they nearly cost something

1. **`cat` of `tauri.conf.json` rendered it as ONE minified line.** The file is actually 63 lines of
   prettier-formatted JSON with spaces after commas. A `perl -pi -e` substitution written against
   the rendered form matched nothing — and silently, since `perl` exits 0 on zero matches. It was
   caught only because the very next assertion re-read the file and printed the OLD array. This is
   the [[a-cat-render-silently-dropped-a-substring]] shape; the working instrument was
   `grep -o '"targets":[^]]*]'`, which showed the real spacing. **Assert on the parsed value after
   every in-place edit** — do not trust that the edit applied.
2. **`git mv` moves HEAD content, not unstaged edits.** The resolution section was written into the
   pending file first, so the file was `git add`-ed BEFORE the `git mv`, and the staged content was
   then re-checked with `git show :<newpath> | grep -c` rather than taken on trust (1 hit for the
   RESOLUTION heading, 1 for `status: completed`, 226 lines).

## Deviation from the /gsd-quick default path

The workflow spawns gsd-planner and gsd-executor; both were skipped and this ran inline. The
substrate verification above was already complete in the orchestrator's context before planning
began, and it is the single thing this task could get wrong — the repo has repeatedly recorded
prescribed fixes that were wrong about the substrate. Re-deriving it inside a subagent risked a
weaker answer than the one already measured. `workflow.use_worktrees` is `false` here, so no
isolation was given up. PLAN.md and this SUMMARY.md were written by hand to the same shape.

## What is explicitly NOT claimed

No macOS updater artifact has been observed to exist. This closed the FIX, not the observation —
exactly the distinction the predecessor's own "Readiness split" section drew. CARRY BEFORE CLOSE was
honoured: `2026-09-24-macos-updater-entry-in-latest-json-is-unproven-until-a-release-run.md`
(`severity: major`, `ready: live-gate`) was filed BEFORE the predecessor moved, and carries the
five-item scoring gate, the throwaway-tag trap, and one question left open at the desk — whether the
`.app.tar.gz` is built from the notarized-and-stapled app or from a pre-notarization copy.

**The `v0.7.0` draft should still not be published on the strength of this commit.**
