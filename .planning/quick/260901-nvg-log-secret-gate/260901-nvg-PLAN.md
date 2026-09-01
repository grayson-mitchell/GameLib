---
quick_id: 260901-nvg
slug: log-secret-gate
date: 2026-09-01
description: >-
  Add a ts-morph AST gate that fails CI when a backend log call interpolates raw
  process output (stdout/stderr) or a secret-named identifier without a
  length/presence guard. Closes the enforcement gap left open by
  .planning/todos/pending/log-upload-boundary-scrub-decision.md.
status: in-progress
---

# Quick Task 260901-nvg: log-secret-gate

## Why

`.planning/debug/resolved/log-upload-has-no-redaction.md` closed the reachability
question and fixed one real leak (`gog/user.ts:97`, raw `gogdl auth` stdout into
`logError`). It deliberately left a design call open: nothing fails CI when a new
log call interpolates a secret, so "the next one lands silently".

The todo offered three options. Decision taken 2026-09-01 (recorded in the todo):
**Option C, narrowed** — a source-level AST gate, NOT a boundary scrub.

## Decision record (evidence gathered before planning)

Measured by running the candidate gate as a throwaway probe over `src/backend`:

- **The todo's own suggested vocabulary is wrong.** Flagging
  `stdout`/`token`/`password`/`cookie`/`secret` as the todo describes yields
  **23 hits, ~22 false**: `key` matches 6 config/settings **key names**
  (`game_config.ts:326`, `logger/index.ts:200`), `code` matches 4 process
  **exit codes** (`bottle.ts:804`, `helperProcess.ts:124`). Shipping that
  vocabulary is a gate that convicts correct code.
- **Tuned, it is affordable.** Dropping `key`/`code`/`session` and adding guard
  detection for `.length`, `!`/`!!`, `Boolean()` gives a **baseline of 12**, all
  process output: `stderr` x10 (robocopy, rsync, mv, tar, cxbottle, wine-path,
  VCRuntime), `stdout` x2 (`gog/games.ts:696`, `legendary/library.ts:818`).
  All 12 read and confirmed benign — no auth command among them.
- **Independent re-confirmation of the census.** Zero unguarded `token` /
  `refreshToken` / `accessToken` / `password` / `cookie` / `secret` /
  `credentials` / `sessionId` / `apiKey` identifiers in any backend log call.
  That reproduces the ledger's conclusion by a different method (AST walk vs.
  the python brace-matching scan).

Option B (boundary scrub) rejected: at the sink you would match unbounded token
**values**; at the source you match a small bounded vocabulary of identifier
**names**. Only the second is tractable. Option A (do nothing) rejected, but
honestly: the gate ships with 12 exemptions and 0 current catches. Its value is
forcing a conscious act when someone writes a raw-output log call — which is
exactly the control that was missing when `gog/user.ts:97` was written. It is
NOT a leak-prevention guarantee, and must be documented as such.

## Tasks

### Task 1 — `meta/logSecretGate.ts`

- **files:** `meta/logSecretGate.ts` (new)
- **action:** ts-morph scanner mirroring `meta/hardcodedStringGate.ts`'s idiom.
  Exports `scanSource` (pure, in-memory, disk-free), `scanScope` (globs
  `src/backend/**/*.ts` minus `__tests__`/`__mocks__`, owns all I/O),
  `formatReport`, `PROCESS_OUTPUT_IDENTIFIERS`, `SECRET_IDENTIFIERS`,
  `EXCLUDED_IDENTIFIERS`, `LOG_FUNCTION_RE`, `FILE_EXEMPT_MARKER`.
  Scope is a live glob, not a committed snapshot — a snapshot file can be
  scoped-out and silently shrink the gate.
- **verify:** `pnpm exec tsc --noEmit`
- **done:** module compiles; `scanScope()` returns the measured 12-site baseline

### Task 2 — exempt the 12 baseline sites individually

- **files:** `src/backend/launcher.ts`, `src/backend/utils.ts`,
  `src/backend/storeManagers/gog/games.ts`,
  `src/backend/storeManagers/legendary/library.ts`,
  `src/backend/storeManagers/steam/bottle.ts`,
  `src/backend/storeManagers/zoom/games.ts`
- **action:** one `log-secret-gate-exempt: <reason>` comment per call site,
  naming the command whose output it is. No blanket suppression, no allowlist
  JSON — the reason must sit at the call site where the next author reads it.
- **verify:** `scanScope()` reports 0 violations, 12 exempted
- **done:** baseline green with every exemption individually justified

### Task 3 — `meta/__tests__/logSecretGate.test.ts`

- **files:** `meta/__tests__/logSecretGate.test.ts` (new)
- **action:** unit tests over `scanSource` (violations, guards, exemptions,
  excluded vocabulary) + a repo-wide `scanScope` ratchet asserting 0 violations.
  **RED proof:** reconstruct the real `gog/user.ts:97` defect as a fixture and
  assert the gate flags it; assert the shipped fix shape does not. Also a
  non-vacuity test proving the repo-wide ratchet can fail.
- **verify:** `pnpm exec jest --selectProjects meta -t logSecretGate`
- **done:** suite green, RED proof demonstrated against the historical defect

### Task 4 — resolve the todo

- **files:** `.planning/todos/pending/log-upload-boundary-scrub-decision.md` ->
  `.planning/todos/resolved/`
- **action:** record the decision, the measured evidence, and the gate's honest
  scope limit (it cannot see which command produced the output).
- **done:** todo moved to resolved with rationale

## Must haves

- **truths:** the gate runs in CI without new wiring (lives in the `meta` jest
  project, executed by `pnpm test:ci`); it can fail (proven); its baseline is 0
  violations / 12 individually-justified exemptions
- **artifacts:** `meta/logSecretGate.ts`, `meta/__tests__/logSecretGate.test.ts`
- **key_links:** `meta/hardcodedStringGate.ts` (idiom source),
  `.planning/debug/resolved/log-upload-has-no-redaction.md` (defect record)

## Non-goals

- No boundary scrub in `uploadLogFile` (Option B, rejected above).
- No reopening of the reachability audit — done exhaustively 2026-08-22.
- No new CI workflow step. `meta` is already a jest project; a gate that needs
  bespoke wiring is a gate that ends up running nowhere.
