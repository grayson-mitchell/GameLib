---
quick_id: 260901-nvg
slug: log-secret-gate
date: 2026-09-01
status: complete
commits:
  - cd5a5c8bb
---

# Quick Task 260901-nvg: log-secret-gate — SUMMARY

## What was asked

Decide `.planning/todos/pending/log-upload-boundary-scrub-decision.md` — whether the log-upload
surface needs a boundary scrub, given that source-level discipline was the only control and was
unenforced.

## Decision

**Option C, narrowed.** Not A (do nothing), not B (regex scrub at the upload boundary).

The decision was made from a measurement rather than from the todo's framing: the candidate gate
was built as a throwaway probe and run against the real tree first.

- The todo's **own suggested vocabulary was wrong** — `stdout`/`token`/`password`/`cookie`/
  `secret` yields 23 hits, ~22 false (`key` = config-key names x6, `code` = exit codes x4).
- **Tuned** (drop `key`/`code`/`session`; accept `.length`, `!`/`!!`, `Boolean()` as reductions)
  the baseline is **12**, all process output, all confirmed benign at the call site.
- **Zero** unguarded `token`/`password`/`cookie`/`secret`/`credentials` identifiers reach any
  backend log call — an independent AST re-confirmation of the 2026-08-22 census, by a different
  method than its python brace-matching scan.

B was rejected because at the sink you match unbounded token *values*, while at the source you
match a bounded vocabulary of identifier *names*; only the second is tractable. A was rejected but
was close: the gate ships with 12 exemptions and 0 current catches, so it is documented as forcing
a conscious act, **not** as leak prevention.

## What shipped

| File | Change |
| ---- | ------ |
| `meta/logSecretGate.ts` | new — ts-morph scan, live glob over `src/backend`, no committed scope snapshot |
| `meta/__tests__/logSecretGate.test.ts` | new — 60 tests, incl. the historical-defect pair and a non-vacuity proof |
| `src/backend/utils.ts` | 5 exemption comments (robocopy, rsync, `mv -f`, `tar -xf`, VCRuntime probe) |
| `src/backend/storeManagers/steam/bottle.ts` | 2 (cxbottle create, bridge bottle) |
| `src/backend/storeManagers/legendary/library.ts` | 2 (toggle-sync stdout + stderr) |
| `src/backend/launcher.ts` | 1 (`cmd /c winepath`) |
| `src/backend/storeManagers/gog/games.ts` | 1 (REDmod deploy) |
| `src/backend/storeManagers/zoom/games.ts` | 1 (game launch) |

Design points worth not re-litigating later:

- **No whole-file exempt marker**, unlike `hardcodedStringGate.ts`. `utils.ts` alone holds five
  sites; a file-level marker there would blank a 1,700-line file. Asserted by test.
- **A bare marker with no reason exempts nothing.** Asserted by test.
- **Scope is a live glob**, not a snapshot — a snapshot is a thing someone can scope a file out
  of, silently shrinking the gate.
- **No new CI wiring.** It lives in the `meta` jest project, which `pnpm test:ci` already runs.

## Verification

| Gate | Result |
| ---- | ------ |
| `pnpm exec tsc --noEmit` | exit 0 |
| `eslint` (2 new files, severity-2 counted from JSON) | **0 errors, 0 warnings** |
| `prettier --check` (all 8 changed files) | clean |
| `pnpm exec jest --selectProjects Meta` | **35 suites, 762 passed** |
| `pnpm exec jest --selectProjects Backend` | 188/189 suites pass — see caveat |
| RED proof | **demonstrated against the real defect** |

**RED proof.** The pre-fix `gog/user.ts` line was reintroduced into the live tree; the ratchet went
red naming that exact call site:

```
src/backend/storeManagers/gog/user.ts:110  process-output  "stdout" reaches a log call unreduced
  -- logError( `GOG login failed to parse std output from gogdl. stdout: ${stdout.trim()}, ...` )
```

Restored with `cp`, never `git checkout` (post-checkout hook hazard); `git status` confirms the
file is byte-identical to HEAD, and the suite is green again.

## Pre-existing failures, NOT caused by this task

Both were confirmed pre-existing before being dismissed — neither was assumed.

1. **`src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` — 3 failures.**
   Environmental: the suite expects a native LZMA binding on the dev machine and gets the pure-JS
   fallback (`Expected: "native", Received: "pure-js"`). Fails in isolation, so not load-related.
   Proof of non-causation: `git diff -U0 -- src/backend` is **12 added lines, every one a
   `log-secret-gate-exempt:` comment, zero removed lines**.
2. **`src/backend/utils.ts:22` — `@typescript-eslint/no-unused-vars` on `BrowserWindow`.**
   Byte-identical at HEAD; this task's edits to that file are comment insertions at lines 840+.
   Left alone as out of scope.

`--no-verify` was passed on the commit; `.husky/pre-commit` is entirely commented out, so nothing
was bypassed.

## Honest scope limit

The gate cannot see **which command produced** a `stdout` binding — that is the only thing
separating the GOG defect from the twelve benign sites. It therefore cannot prevent a leak; it can
only make logging raw process output a step you have to write a reason for. This is stated in the
module header so a future reader does not over-trust a green run.

`uploadLogFile` still POSTs up to 10 MiB verbatim to dpaste. That is the accepted consequence of
choosing C over B.
