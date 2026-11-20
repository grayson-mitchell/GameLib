---
quick_id: 261116-w6t
status: complete
commits: [0e437adde, 601ce5370, 3188b6263]
---

# Quick 261116-w6t: Steam Guard approval-first screen and post-approval flip fix

## Commits
- 0e437adde fix: new `credentials-confirmed` step; poll `done` (with or without username) shows "Approved. Completing sign-in..." instead of the step-1 form. Allowlist 31 -> 32.
- 601ce5370 feat: Rust `CredStarted` carries `can_approve` (`canApprove`); sidecar `startCredentialLogin` returns `canApprove`/`codeType`; approve-only waiting flows return `guard_required` at once (no 180 s block); IPC reply type widened.
- 3188b6263 feat: approval-first Steam Guard view ("Approve this sign-in in the Steam Mobile app." + spinner, optional "Enter a code instead"), per-type code copy (email / Mobile app), `backToCredentials()` extracted. Allowlist 32 -> 38.

## Verification
- Task 1 regression test FAILED on the unmodified index.tsx (1 failed, 16 passed) before the fix, then passed.
- cargo test -p gamelib-steamcm (306 passed), clippy -D warnings, rustfmt --edition 2021 --check: clean. Serialisation assertion done with serde_json (a dep).
- jest: SteamLogin suites + hardcodedStringGate (238 passed); userSignIn.rustEngine, user.test, steamCmPortComplete (100 passed).
- tsc, scoped eslint (0 errors; 3 pre-existing warnings in index.tsx), scoped prettier, build:sidecar, check:ipc-contract (up to date): clean.
- No known-failing suites were touched or run.

## Deviations
- The approve-only TS test asserts `status:'done'` on the first poll and the username on a second poll, since finalisation is background (existing C1 design), not a username in the first reply.
- Existing rustfmt/prettier applied to touched files only.

## Operator live gate
Restart `pnpm tauri:dev` (sidecar not rebuilt by dev), sign in by credentials with a mobile-authenticator account, approve on the phone.
