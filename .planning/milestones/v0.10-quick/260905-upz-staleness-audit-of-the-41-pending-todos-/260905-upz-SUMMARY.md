---
status: complete
quick_id: 260905-upz
date: 2026-09-05
---

# 260905-upz — Pending-todo staleness audit

## What was done

All 41 todos in `.planning/todos/pending/` were given a verdict against HEAD. Five were closed,
three residue todos were filed, and the full ledger with per-row commands and output is in
`260905-upz-AUDIT.md`.

## Queue state

| | Before | After |
|---|---|---|
| `pending/` | 41 | 39 |
| `completed/` | 73 | 78 |

39 = 41 − 5 closed + 3 residue todos filed.

## Verdicts across all 41

| Verdict | Count |
|---|---|
| DISCHARGED (closed, no residue) | 2 |
| PARTIAL (closed, residue re-filed) | 3 |
| LIVE | 27 |
| UNDETERMINED (screen not decisive) | 8 |
| PARKED (untouched by policy) | 1 |

## Closed — moved to `completed/`

| Todo | Verdict | Residue filed |
|---|---|---|
| `2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar` | PARTIAL | `2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects` |
| `2026-08-25-installed-json-watcher-not-ported-to-tauri` | PARTIAL — closes on mechanism only | `2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title` |
| `2026-08-24-move-game-is-broken-on-macos-rsync-flags-openrsync-rejects` | DISCHARGED | — |
| `2026-08-28-moveinstall-fails-rsync-unrecognized-option-no-human-readable` | DISCHARGED | — |
| `2026-08-24-pathselectionbox-onblur-silently-unlinks-egs-sync` | PARTIAL — items 1/2 only | `2026-09-05-egs-sync-and-unsync-dialogs-are-indistinguishable-at-a-glance` |

No todo was closed on a satisfied clause while an unsatisfied clause survived — that is what the
three PARTIAL rows and their re-files exist to prevent.

## The finding worth reading

`2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41` screened as a discharge candidate and
was **rejected** as one. The suite is now 41/41, where the todo recorded a deterministic 3-test
failure — but `lzmaLoader.ts`, the test file, the Node version (v26.2.0) and the `lzma-native`
install are all unchanged since it was filed. Same code, same environment, opposite result.

The todo's central question is still unanswered, so the green run is now the thing needing an
explanation. Closing it on a passing suite would have been the `flake-baselines-can-be-undiagnosed-bugs`
failure with the flake on the passing side. It stays in `pending/`, with the non-reproduction and
its commands recorded on the todo itself.

## Evidence classes — read these before trusting a row

Not every verdict rests on the same quality of evidence, and the ledger labels each one:

- **PROBED (7 rows in the sweep, plus all 12 in Sections 1–4):** a command was run and is decisive.
- **BY CONSTRUCTION (14 rows):** the discharge condition is a credential, a hardware gesture, a
  human decision, or an open research question, so no commit can have satisfied it silently.
  **No code probe was run for these.**
- **UNDETERMINED (8 rows):** a one-command screen ran and was not decisive. Recorded unresolved
  rather than given a verdict the output does not support.

The 8 UNDETERMINED rows are the honest debt of this audit: rows 4, 5, 7, 8, 14, 15, 19 and 23 each
need a full read against their own residue clauses.

## Deviations from plan

1. **The gsd-executor stalled** (stream watchdog, no progress for 600s) after completing Tasks 1
   and 2, mid-sweep. Its Task 1–2 output was intact and was left unchanged. Task 3 was completed by
   the orchestrator directly rather than by respawning an executor that had already stalled.
2. **Section 5's first pass tabulated 28 rows for 29 inputs** — one todo was silently dropped from a
   hand-written table. Caught by counting the sections back against the input list. Row 16 was added
   in a follow-up block that records the miss rather than quietly patching the table.
3. **Zero discharges from the sweep**, so the plan's cap of 3 auto-adjudications was never
   approached.

## Protected paths

The two paths belonging to a concurrent session were verified untouched at commit time:
`src/backend/sidecar/__tests__/enrichmentFlows.test.ts` (still ` M`, unstaged) and
`.planning/debug/anticheat-response-frame-drop.md` (still untracked). Staging was explicit-path
throughout; no `git add -A`, `git add .`, `git commit -a` or `git stash` was used.
