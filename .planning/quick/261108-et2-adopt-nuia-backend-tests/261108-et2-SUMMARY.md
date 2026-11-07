---
status: complete
quick: 261108-et2
commit: 181152fc2
---

# Quick 261108-et2: adopt noUncheckedIndexedAccess for src/backend/__tests__

Fixed all 125 sites with a local `defined()` helper (`src/backend/__tests__/helpers/defined.ts`), appended the bucket to ADOPTED_BUCKETS and the ratchet test, deleted it from the baseline, and updated the todo (1557 sites remain).

- Commit: 181152fc2 (no drift-reconcile commit needed; ratchet was green at start).
- Fresh `--list` named 4 files beyond the plan snapshot (steamBridgeKnownFixes, storeChangeNotifier, tauriConf, tauriShellSource); fixed too.
- Added small local accessors `releaseJobOf` / `jobOf` in the two workflow suites; `substituteMatrixExpressions` param narrowed to `{platform; args}` (only one caller).
- onlineMonitor: `export {}` replaced by the `defined` import (it makes the file a module).
- Verify: ratchet PASS, codecheck green, eslint 0 errors, prettier clean, boundaries clean, no knip finding names touched files, no added `!`/`as any` (one `dir!` on a line I wrapped is pre-existing).
- Jest: 938 tests across the 21 suites + ratchet test; 937 pass. The one failure (tauriShellSource `.title( format!` Rust-source check) fails identically on HEAD, so it is pre-existing and unrelated.
- planning-gates: 11/12 pass; `planning-frontmatter-gate.py` fails on a v0.8 milestone VERIFICATION.md, unrelated to this change.
- Behaviour change: none beyond clearer failure messages from `defined`.

## Deviations
None.
