# Quick 261108-ved: Move keyring helpers to keyring_dispatch.rs Summary

Moved the six keyring helpers (7 definitions) from login_window.rs into keyring_dispatch.rs byte-identically, proven by moveproof Layer 1 + Layer 3, with a new repeatable `--stem` flag on moveproof.

## Commits
- 53b5f9366 chore: moveproof `--stem` override (+ self-test case), BASE_REF = 1bfdafa5c
- 339bdd386 refactor: the move (login_window.rs -151/+0 net lines, keyring_dispatch.rs +151)
- f0f7a2147 docs: 71-16-PLAN.md re-routed; todo git-mv'd to todos/completed/

## Verification
- `moveproof.py --self-test`: SELF-TEST PASS (new cross-stem case included).
- `permove.sh wave-2-end 2 --stem login_window --stem keyring_dispatch`: cargo passed=445 (baseline 445) failed=0; clippy ratchet PASS; LAYER 1 0/0; LAYER 3 (login_window+keyring_dispatch) 0/0; PERMOVE PASS.
- Non-vacuity control (same base, no `--stem`): MOVEPROOF FAIL, LAYER 3 (login_window) removed/changed 7, added 0: const KEYRING_READ_TIMEOUT, enum KeyringOutcome, fn bounded_keyring_read, fn keyring_get_outcome, fn keyring_get_result, fn keyring_outcome_message, impl KeyringOutcome. Exactly the expected 7.
- cargo test-name list diff against wave-2-end cargo-names.txt: identical.
- jestpins over wave-2-end suites: passed=714 failed=2 unknown-failures=0 (the 2 are the known failures).
- `pnpm planning-gates`: 12/12 pass. `graphify update .` run.
- Prettier checks omitted per plan (all touched paths ignored or no parser).

## Deviations
None. No src-tauri commit existed between 752d8dbfe and HEAD, so the wave-2-end baseline was valid.
Spec correction as in the plan: no tests moved (they live in main.rs's test module); only 71-16's routing was re-pointed. The remaining `login_window.rs` mention in 71-16 (sort-order note for the longRunningChannels jestpin) was left intentionally.

## Follow-ups for 71-16 (stale wording, left untouched to keep Layer 3 byte-identical)
Stale doc comments now in keyring_dispatch.rs:
- KEYRING_READ_TIMEOUT doc: refers to "this file's own `#[cfg(test)]` assertion" (the ordering test is actually in main.rs's test module; it will land in keyring_dispatch.rs's test module when 71-16 runs, making this accurate again).
- bounded_keyring_read doc: "see ... below" references that were written for the old layout; re-check once tests move.
- Other cross-references to login_window.rs-relative locations in the moved docs.

## Notes
The plan file 261108-ved-PLAN.md was untracked at start and is left for the orchestrator's docs commit. Unrelated pre-existing working-tree changes were not staged.

## Self-Check: PASSED
