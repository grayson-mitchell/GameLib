---
quick_id: 260826-w4c
status: complete
completed: 2026-08-26
---

## Outcome

All three open warnings in `34.6-REVIEW.md` fixed; the file now reads `status: resolved`,
`findings` 0/0/0 — legitimately, not by relabelling.

| Finding | Fix | RED-proven? |
|---|---|---|
| WR-01 | `typeof key !== 'string'` guard at BOTH IPC boundaries | Yes — 4 cases fail against the restored bare cast |
| WR-02 | Sidecar `setApiKey` now trims + treats whitespace-only as clear | Yes — all 3 fail against the restored pre-fix body |
| WR-03 | Causal claim retracted in place; handler and mechanism kept | N/A — comment only |

## Decisions worth recording

**WR-01 was fixed on BOTH paths, not just the one the review named.** The review filed it against
the sidecar handler, but `steamgrid/ipc_handler.ts` forwards its parameter with no runtime check
either. Fixing one side would have re-created exactly the build divergence WR-02 exists to
complain about.

**WR-01's 5th test passes in both directions BY DESIGN.** It pins that the guard tests the TYPE and
not truthiness, so an empty string still reaches the store and the "submit an empty value to clear
the key" gesture keeps working. It is recorded as a design pin, NOT counted among the RED-proven —
counting it would inflate the proof.

**WR-03 kept the handler and the mechanism.** Only the causal claim was unsupported. The comment
still carries the 4-step focus-race description, and now records IN PLACE that plan 34.6-17's
re-drive shipped this guard and the button was still dead, and that the 2026-08-26 Step 4 re-drive
passed via a different route. "DO NOT REMOVE" and "Proven by measurement" are gone.

## Verification

`pnpm codecheck` exit 0 · `enrichmentFlows` + `steamgridSecretStore` 61/61 · SearchBar 2/2 ·
eslint **0 errors** across all six touched files · prettier clean.

Two process points. `codecheck` says nothing about lint, so eslint was run separately rather than
inferred. And prettier flagged `ipc_handler.ts` — checking `git show HEAD:` proved it was clean
before my edit, so the breakage was mine; after `--write` I re-ran tsc and both suites to confirm
the guard survived the reflow rather than assuming it had.

RED proofs used `cp` + shasum to break and restore, never `git checkout --`, which fires the
post-checkout hook. Both restores were shasum-verified byte-identical.
