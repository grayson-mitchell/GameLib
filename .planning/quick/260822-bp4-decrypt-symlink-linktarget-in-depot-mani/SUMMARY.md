---
task: 260822-bp4
phase: 37
plan: 09
subsystem: steam-depot
tags: [steam, depot, crypto, symlink, macos, path-traversal, security]

requires:
  - phase: 21
    provides: depot manifest fetch/decrypt (fetchDepotPlanEntry, decryptFilename), depot write loop (downloadDepotFiles, resolveContainedPath, PathTraversalError)
provides:
  - "linktarget decrypted at parse time using the same decryptFilename primitive as filename"
  - "the symlink-write containment guard now validates the real (decrypted) target, not ciphertext"
  - "a real-crypto fixture builder (steamEncryptString) for future depot manifest-field tests"
affects: [37-live-gate, native-macos-install, framework-bundled-titles]

tech-stack:
  added: []
  patterns:
    - "encrypted-manifest-string fixture builder (exact inverse of steamDecrypt, cross-checked against hardware-measured wire byte counts) instead of a plaintext-passthrough fixture"

key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts
    - src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts
  modified:
    - src/backend/storeManagers/steam/depot.ts

key-decisions:
  - "Decrypt linktarget UNCONDITIONALLY (mirroring filename), not gated on filenames_encrypted — that flag isn't even in GameLib's parse path (Q1, resolved in the plan)"
  - "Presence-conditional decrypt (f.linktarget ? decryptFilename(...) : f.linktarget) — decryptFilename('' | undefined) throws, and most files have no linktarget (Q2)"
  - "Containment guard needs no relocation — it already reads file.linktarget at write time, so decrypting upstream at parse time feeds it the real target with zero code motion (Q3/guard question, resolved in the plan)"

requirements-completed: []

duration: ~25min
completed: 2026-08-22
---

# Quick Task 260822-bp4: Decrypt symlink `linktarget` in depot manifests Summary

**`depot.ts:627` decrypted `linktarget` for the first time — using the exact same `decryptFilename` primitive already applied to `filename` two lines up — fixing all six dangling macOS `.framework` symlinks in the native Steam depot install path, and turning a previously vacuous path-traversal guard into a real one.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-22
- **Tasks:** 3/3 completed
- **Files modified:** 1 (`depot.ts`)
- **Files created:** 2 (fixture + test file)

## Accomplishments

- One-line production fix: `linktarget` is now decrypted at `fetchDepotPlanEntry`, presence-conditionally, mirroring `filename`'s existing handling.
- Four new regression/security tests, three of which were observed RED at HEAD before the fix (proof the tests actually discriminate, not just assert), using a real-crypto fixture builder rather than a plaintext-linktarget fixture that would have passed at HEAD and proven nothing.
- The symlink-write containment guard (`depot.ts`'s `PathTraversalError` check) now validates the real decrypted target instead of base64 ciphertext that happened to pass by luck (base64's `/` reads as a nested relative path). No code motion was needed — annotated in place and pinned by a new test.
- Doc comments on `DepotPlanFile.linktarget`, `DepotPlan`, and `fetchDepotPlanEntry` updated to say "decrypted" instead of leaving the prior filename-only phrasing in place.
- The 37-09 todo updated to `AWAITING_LIVE_GATE` with the operator's exact on-hardware verification commands — this defect is not closed by a green unit suite alone.

## Task Commits

1. **Task 1: Build the fixture, write the tests, prove RED at HEAD** — no commit (deliberate; a RED test at HEAD would leave a broken tree for CI and concurrent sessions). RED evidence carried into Task 2's commit message instead.
2. **Task 2: Apply the one-line fix + refresh doc comments** — `e47650a26` (fix)
3. **Task 3: Hand the live gate forward** — `4f1c4a065` (docs)

_TDD-shaped plan: RED tests (Task 1, uncommitted) -> GREEN fix (Task 2, `e47650a26`) -> forward-handoff doc (Task 3, `4f1c4a065`)._

## Files Created/Modified

- `src/backend/storeManagers/steam/depot.ts` — `fetchDepotPlanEntry` now decrypts `linktarget` presence-conditionally (line ~627); doc comments on `DepotPlanFile.linktarget`, `DepotPlan`, and `fetchDepotPlanEntry`'s header updated; a note added at the symlink write branch explaining the containment guard now validates plaintext and why it was previously vacuous, pointing at the pinning test.
- `src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts` — new. `steamEncryptString(plaintext, key)`: the exact inverse of `depot/crypto.ts`'s `steamDecrypt`/`decryptFilename` (16-byte IV under AES-256-ECB || AES-256-CBC(plaintext+NUL+PKCS#7) under CBC), producing real Steam manifest-string wire bytes rather than a convenient approximation.
- `src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts` — new, five tests:
  1. Fixture self-check against the three hardware-measured samples from the 37-09 todo (base64 length, raw byte count, real `decryptFilename` round-trip).
  2. Plan-level regression: `plan.depots[0].files[0].linktarget` is the decrypted plaintext, not ciphertext.
  3. Disk-level regression: the written symlink actually RESOLVES to a real target directory (not just "decrypted but still dangling").
  4. Security: a decrypted target that escapes the install root is rejected with `PathTraversalError`, using `lstatSync`/try-catch (not `existsSync`, which would pass against a dangling ciphertext link too — the documented trap).
  5. Q2 crash pin: absent (`undefined`) and empty (`''`) `linktarget` pass through untouched and never reach `decryptFilename`.

## RED-at-HEAD Evidence (Task 1, captured before the fix)

- **T-37-09-02 (plan-level):** `expect(plan.depots[0].files[0].linktarget).toBe('Versions/A/Resources')` received the base64 ciphertext blob instead.
- **T-37-09-03 (disk-level, resolves):** same failure mode at the plan-build step; the written symlink target was ciphertext (dangling).
- **T-37-09-04 (security):** `expect(result.failures).toHaveLength(1)` received length `0` — at HEAD the ciphertext resolved as an inner relative path, so the containment check never fired at all.

Tests 1 (fixture self-check) and 5 (Q2 crash pin) were green both before and after, as designed.

## Deviations from Plan

None — plan executed exactly as written, including both already-resolved open questions (containment guard needs no relocation; unconditional presence-conditional decrypt).

One fixture-building correction discovered mid-Task-1 (folded into Task 1, no separate deviation): the plan's reference test fixtures needed BOTH `filename` and `linktarget` encrypted with `steamEncryptString`, since `decryptFilename` is called unconditionally on `f.filename` at `depot.ts:623` regardless of this fix — using a plain-string `filename` in the mocked `parse()` output threw `ERR_CRYPTO_INVALID_IV`/"wrong final block length" before the linktarget logic was even reached. This is Rule 3 (auto-fix blocking issue) territory: the test file's own filenames now go through `steamEncryptString(name, KEY)` in every `wireSingleDepot` call, matching how a real manifest actually looks.

## Threat Flags

None. This closes an existing vacuous guard rather than opening new surface — the symlink write path, containment check, and network/file boundaries are all pre-existing and already in the plan's `<threat_model>`/context.

## Known Stubs

None.

## Out of Scope (per plan, not addressed here)

- The executable-bit divergence (Steam sets `+x` on 395 files, we set 3) — recorded observation only, did not cause the launch failure.
- Adding a `filenames_encrypted` gate to either field (Q1, resolved as a deliberate no).
- Any change to `depot/crypto.ts`.
- **The live on-hardware gate** — install a native macOS title with a `.framework` (Wasteland 1, 259130), then `find -type l` dangling-check, `codesign --verify --deep`, and an actual `open`. This is explicitly handed to the operator; see the updated todo at `.planning/todos/pending/2026-08-22-symlink-linktarget-is-never-decrypted.md`. **Do not treat this SUMMARY as evidence the launch failure is fixed** — only that `linktarget` decryption is implemented and unit-proven; the install-to-launch path has completed end to end exactly once and the game has never launched.

## Self-Check

- `src/backend/storeManagers/steam/depot.ts` — FOUND (modified)
- `src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts` — FOUND (created)
- `src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts` — FOUND (created)
- `.planning/todos/pending/2026-08-22-symlink-linktarget-is-never-decrypted.md` — FOUND (status AWAITING_LIVE_GATE)
- commit `e47650a26` — FOUND in `git log`
- commit `4f1c4a065` — FOUND in `git log`
- Full backend suite: 166/166 suites, 3812/3814 tests passed (2 skipped) — clean baseline, no new failures caused by this change
- `npx tsc --noEmit -p .` — clean
- `pnpm exec eslint` on the three touched files — 0 errors (severity 2)
- `pnpm exec prettier --check` on the three touched files — clean

## Self-Check: PASSED
