---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 11
subsystem: infra
tags: [github-actions, ci, release, tauri, sidecar, code-signing, security]

# Dependency graph
requires:
  - phase: 34 (plan 08)
    provides: "meta/buildSidecarSea.ts resolveTriple()/GAMELIB_SIDECAR_TARGET_TRIPLE contract (consuming side only, this plan wires the CI producer)"
provides:
  - "Per-leg GAMELIB_SIDECAR_TARGET_TRIPLE wiring in release-tauri.yml so all four matrix legs (2x macOS, ubuntu, windows) build a correctly-named/correctly-arch sidecar"
  - "cert.pfx removal in a try/finally block after Windows cert import, closing the WR-02 leak-on-disk gap even on a failed import"
  - "Corrected 'write-then-delete' security comment replacing the false 'ONLY in-memory' claim"
  - "WR-04 and IN-01 recorded as tracked debt in deferred-items.md per user decision GAP-D-01"
affects: ["34-07 (deferred live tag-push gate — now unblocked by CR-01+CR-02 closure)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Literal per-leg matrix fields over inline GHA ternary expressions (established by 34-06's build_args precedent, reused here for sidecar_triple)"
    - "try/finally around a Windows PowerShell cert-import step so cleanup runs on both success and failure paths"

key-files:
  created: []
  modified:
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts
    - .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/deferred-items.md

key-decisions:
  - "Used explicit per-leg sidecar_triple matrix literals rather than the review's inline nested-ternary GHA expression — unambiguous, no brace escaping, directly assertable"
  - "WR-04 and IN-01 explicitly NOT implemented per user decision GAP-D-01 — recorded as tracked debt only"

patterns-established: []

requirements-completed: [REQ-34-03, REQ-34-04, REQ-34-06]

# Metrics
duration: ~10min
completed: 2026-07-24
---

# Phase 34 Plan 11: CI Sidecar Triple Wiring + Cert Cleanup + Tracked-Debt Recording Summary

**Closed the CI half of CR-01 (each release matrix leg now passes its own `GAMELIB_SIDECAR_TARGET_TRIPLE`) and all of WR-02 (Windows signing cert deleted in a `try/finally` after import, misleading "in-memory only" comment corrected), and recorded WR-04/IN-01 as tracked debt per user decision GAP-D-01.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-24T07:30Z (approx, session start)
- **Completed:** 2026-07-24T07:40Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Every `release-tauri.yml` matrix leg now declares an explicit `sidecar_triple` literal
  (`aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu`,
  `x86_64-pc-windows-msvc`), passed to the `Build self-contained sidecar (Node SEA)` step as
  `GAMELIB_SIDECAR_TARGET_TRIPLE`. This makes the SEA build target-driven, so the
  `x86_64-apple-darwin` leg on an Apple-Silicon `macos-latest` runner produces a genuinely
  x86_64-named, x86_64-arch sidecar (34-08's `resolveTriple()`/`lipo -archs` gate now actually
  receives a per-leg triple instead of always resolving the host).
- The `Import Windows signing certificate (if present)` step now wraps `Import-PfxCertificate` in
  `try { ... } finally { Remove-Item -Path cert.pfx -Force -ErrorAction SilentlyContinue }`, so
  `cert.pfx` is deleted from the runner workspace immediately after import — including when the
  import itself throws, the case that previously would have left the file behind on a
  continued/retried job.
- The step's comment above it no longer claims "ONLY in-memory (never written to a
  cached/persisted artifact)" — it now states plainly that the cert is written to disk because
  `Import-PfxCertificate` requires a file path, and that the `finally` block removes it right
  after.
- `src/backend/__tests__/releaseWorkflow.test.ts` gained two new describe blocks (9 new tests):
  a CR-01 regression guard (env wiring present, all four triples declared exactly once each, the
  env var scoped to the correct step) and a WR-02 regression guard (removal present, ordering
  after import, inside a `finally`, the false claim gone, and a guard that no
  `actions/upload-artifact`/`actions/cache` step exists in the job that could exfiltrate a stray
  cert file).
- `deferred-items.md` gained three new entries: WR-04 (null CSP / `withGlobalTauri` / broad
  `opener:default`, deferred), IN-01 (`sidecarSeaFsShim.ts` loose `system.pem` match, deferred),
  and a Phase 34 close-out note pointing at 34-07's still-deferred live tag-push gate as the sole
  remaining phase item. The original 34-01 entry was left byte-identical.

## Task Commits

1. **Task 1: Declare a per-leg sidecar triple and pass it to the SEA build step (CR-01 CI half)** - `6b715077` (feat)
2. **Task 2: Delete cert.pfx after import and correct the inaccurate security comment (WR-02)** - `4d76e4bb` (fix)
3. **Task 3: Record WR-04 and IN-01 as tracked debt; note the remaining phase close-out step** - `289fe91d` (docs)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `.github/workflows/release-tauri.yml` — added `sidecar_triple` to all four matrix legs; added
  `env: GAMELIB_SIDECAR_TARGET_TRIPLE: ${{ matrix.sidecar_triple }}` to the SEA build step with an
  expanded CR-01 explanatory comment; wrapped `Import-PfxCertificate` in `try/finally` with
  `Remove-Item -Path cert.pfx -Force -ErrorAction SilentlyContinue`; rewrote the step's comment to
  describe write-then-delete instead of the false "in-memory only" claim.
- `src/backend/__tests__/releaseWorkflow.test.ts` — appended `release-tauri.yml per-leg sidecar
  target triple (CR-01 regression guard)` (4 tests) and `release-tauri.yml Windows cert material
  cleanup (WR-02 regression guard)` (5 tests). No existing test modified.
- `.planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/deferred-items.md`
  — appended WR-04, IN-01, and Phase-34-close-out entries; existing 34-01 entry untouched
  (verified via `git diff` showing additions only).

## Decisions Made

- Used explicit per-leg `sidecar_triple` matrix literals (one string per leg) rather than the
  review's suggested inline nested-ternary GHA expression — matches 34-06's established
  `build_args` precedent for avoiding fragile inline expressions, and is directly assertable by a
  simple `toContain`/regex-count test rather than requiring GHA-expression evaluation logic in the
  test suite.
- Kept the `GAMELIB_SIDECAR_TARGET_TRIPLE` string to exactly one literal occurrence in the workflow
  file (the actual env assignment) so the plan's `grep -c` acceptance criterion (`prints 1`) holds;
  the explanatory comment above the step references the mechanism without repeating the exact
  variable-name string, instead pointing to "the env var set below."
- `try/finally` (not a trailing `Remove-Item` statement) was required by the plan specifically
  because a trailing statement would not run if `Import-PfxCertificate` throws — the `finally`
  form covers both the success and failure paths, which is the actual security property WR-02
  cares about.
- WR-04 and IN-01 were NOT implemented, per explicit user decision GAP-D-01 recorded when this gap
  cycle was authorized. Both are appended to `deferred-items.md` with their symptom, scope, and a
  pre-derived suggested remedy so a future session does not need to re-investigate the review
  findings from scratch.

## Deviations from Plan

None — plan executed exactly as written. All three tasks' acceptance criteria (grep-count checks,
YAML parse validity, `git diff` scope confinement, and the jest regression suite) passed on the
first attempt.

## Issues Encountered

None.

## Verification Evidence

- `npx jest --testPathPattern=releaseWorkflow` — 22/22 tests pass (13 pre-existing + 9 new).
- `npx jest --testPathPattern="tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource"`
  (cross-plan regression sweep from the plan's `<verification>` block) — 74/74 tests pass across 5
  suites.
- `grep -c "sidecar_triple: '" .github/workflows/release-tauri.yml` → `4`.
- `grep -c 'GAMELIB_SIDECAR_TARGET_TRIPLE' .github/workflows/release-tauri.yml` → `1`.
- `grep -c 'Remove-Item -Path cert.pfx -Force' .github/workflows/release-tauri.yml` → `1`.
- `grep -c 'ONLY in-memory' .github/workflows/release-tauri.yml` → `0`.
- `grep -cE 'upload-artifact|actions/cache' .github/workflows/release-tauri.yml` → `0`.
- YAML parse check: `node -e "require('js-yaml').load(require('fs').readFileSync(p,'utf-8'))"` —
  exited 0, both before and after all edits (`js-yaml` was available in this environment; `pyyaml`
  was not checked since `js-yaml` succeeded).
- `git diff .github/workflows/release-tauri.yml` per-task hunk inspection confirmed Task 1's diff
  touched only the matrix `sidecar_triple` fields and the SEA build step (no change to
  `tauri-action`, `build_args`, or the job-level `env:` block); Task 2's diff touched only the cert
  import step and its comment.
- Full `deferred-items.md` diff showed additions only (`git diff | grep -E '^-[^-]'` produced no
  output) — the original 34-01 entry is byte-identical.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CR-01 is now fully closed end-to-end: 34-08 landed the consuming script logic, this plan lands
  the CI producer wiring. A live `v*` tag-push run will now build a genuine x86_64 sidecar on the
  `x86_64-apple-darwin` leg instead of a relabeled arm64 binary.
- WR-02 is closed: the Windows signing cert can no longer persist on a runner past the import step
  under any code path this workflow controls, and the job has no artifact/cache step that could
  carry a stray cert file off the runner.
- WR-04 and IN-01 are tracked as deferred debt in `deferred-items.md`, not silently lost.
- With CR-01, CR-02 (34-09), WR-01/WR-03 (34-10), and WR-02 (this plan) all closed, the only
  remaining Phase 34 item is 34-07's deferred `checkpoint:human-verify` live tag-push gate
  (REQ-34-04 live proof, REQ-34-09). Its full six-step repro procedure remains recorded verbatim in
  `34-07-SUMMARY.md`. No duplicate live-gate plan was created here.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: .github/workflows/release-tauri.yml
- FOUND: src/backend/__tests__/releaseWorkflow.test.ts
- FOUND: .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/deferred-items.md
- FOUND: .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-11-SUMMARY.md
- FOUND: 6b715077 (Task 1 commit)
- FOUND: 4d76e4bb (Task 2 commit)
- FOUND: 289fe91d (Task 3 commit)
