---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 06
subsystem: infra
tags: [ci, github-actions, tauri-action, signing, release-pipeline, auto-update]

# Dependency graph
requires:
  - phase: 34-01
    provides: releaseWorkflow.test.ts Wave-0 gate (text assertions on the target YAML shape)
  - phase: 34-02
    provides: build:sidecar-sea npm script (Node SEA sidecar compile, invoked pre-bundle)
  - phase: 34-05
    provides: packaging-ready tauri.conf.json (bundle.active true, lean targets, externalBin sidecar, updater plugin wired to the grayson-mitchell/GameLib feed) — signing fields deliberately absent (D-04)
provides:
  - .github/workflows/release-tauri.yml — the D-05/D-09 release pipeline
  - 3-OS build matrix (macos-latest arm64+x64, ubuntu-24.04, windows-latest) via tauri-apps/tauri-action
  - per-leg pnpm build:sidecar-sea step preceding tauri-action bundling
  - explicit ::warning::Signing skipped log lines for both macOS (native skip) and Windows (CI-conditional skip) when the relevant cert secret is empty
  - Windows signing config merged only via a computed --config override, never committed to tauri.conf.json
  - v* tag + workflow_dispatch trigger producing a DRAFT + PRERELEASE GitHub Release
affects: [34-07-live-tag-push-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-04 skip-warning discipline: every signing path that can silently no-op gets an explicit ::warning::Signing skipped step gated on the empty-cert branch, placed before bundling — makes the graceful-skip behavior log-observable and test-assertable, not just implicit bundler behavior"
    - "Windows --config signing override computed in a bash step (id: build_args) into a GITHUB_OUTPUT, then referenced by tauri-action's args field — avoids GHA expression brace-escaping fragility from nesting a JSON --config string inside an inline ${{ }} ternary"
    - "Job-level env: block centralizes all signing secrets (APPLE_*, WINDOWS_*, TAURI_SIGNING_*) once; every step (including tauri-action) inherits it — never inlined into run: shell strings directly"

key-files:
  created:
    - .github/workflows/release-tauri.yml
  modified: []

key-decisions:
  - "Windows --config override computed via a dedicated bash step + GITHUB_OUTPUT rather than an inline nested-brace GHA expression ternary (the RESEARCH.md canonical example's inline format() approach risks brace-escaping ambiguity inside an outer ${{ }} wrapper) — functionally identical outcome, safer syntax"
  - "All signing secrets (APPLE_*, WINDOWS_*, TAURI_SIGNING_*, GITHUB_TOKEN) declared once at job-level env: rather than duplicated on the tauri-action step — steps inherit job env automatically, keeping the D-04/T-34-05 'read via env: blocks, never inlined' discipline in one place"
  - "Co-triggering with draft-release-mac.yml/draft-release-linux.yml on the same v* tag pattern is accepted as-is (Pitfall 7) — documented in a top-of-file comment rather than switching to a distinct tag pattern, matching the additive/reversible Tauri/Electron parity invariant already established in prior phases"

requirements-completed: [REQ-34-04, REQ-34-06]

# Metrics
duration: ~15min
completed: 2026-07-24
---

# Phase 34 Plan 06: Tauri CI Release Pipeline (Windows/Linux/macOS matrix, graceful-skip signing, draft-prerelease) Summary

**A new `.github/workflows/release-tauri.yml` builds Windows, Linux, and macOS (arm64+x64) via `tauri-apps/tauri-action` on a `v*` tag push, compiling the SEA sidecar per leg, signing gracefully-or-skipping-with-an-explicit-warning on missing certs, and always producing a DRAFT + PRERELEASE GitHub Release for human review.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 1 of 1 completed
- **Files modified:** 1 (new file)

## Accomplishments

- Created `.github/workflows/release-tauri.yml`: `on: push: tags: ['v*']` + `workflow_dispatch`; job-level `permissions: contents: write`; `fail-fast: false` matrix of `macos-latest` (`--target aarch64-apple-darwin`), `macos-latest` (`--target x86_64-apple-darwin`), `ubuntu-24.04`, `windows-latest`.
- Every leg: `actions/checkout@v6` → conditional Ubuntu system deps (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `xdg-utils`) → `./.github/actions/install-deps` (reused composite) → `dtolnay/rust-toolchain@stable` (both darwin targets on macOS legs) → `swatinem/rust-cache@v2` (`workspaces: './src-tauri -> target'`) → `pnpm build:sidecar-sea` (SEA binary exists before `tauri-action` runs, T-34-07).
- D-04 explicit skip-warning steps added ahead of bundling: a macOS-leg step gated `startsWith(matrix.platform, 'macos') && env.APPLE_CERTIFICATE == ''` and a Windows-leg step gated `matrix.platform == 'windows-latest' && env.WINDOWS_CERTIFICATE == ''`, each emitting `::warning::Signing skipped — no {Apple|Windows} cert secret set; shipping unsigned artifact` — turns the previously-implicit bundler no-op into a real, test-assertable log line.
- Windows-only conditional cert import (`if: matrix.platform == 'windows-latest' && env.WINDOWS_CERTIFICATE != ''`) decodes a base64 `.pfx` in-memory via `Import-PfxCertificate`, never persisted (T-34-05).
- A `build_args` bash step computes the final `tauri-action` `args` string: `matrix.args` alone by default, with a `--config {"bundle":{"windows":{"certificateThumbprint":...}}}` override appended ONLY when `WINDOWS_CERTIFICATE` is non-empty. This sidesteps the brace-escaping risk in RESEARCH.md's inline `format()` ternary example while achieving the identical effect — a secrets-less Windows run passes zero signing config.
- `tauri-apps/tauri-action@v1` step: `tagName: v__VERSION__`, `releaseName: 'GameLib v__VERSION__'`, `releaseDraft: true`, `prerelease: true`, `args: ${{ steps.build_args.outputs.args }}`. All signing secrets (`TAURI_SIGNING_PRIVATE_KEY(+_PASSWORD)`, `APPLE_*`, `WINDOWS_*`, `GITHUB_TOKEN`) declared once at job-level `env:` and inherited by every step.
- Top-of-file comment documents Pitfall 7 (intentional co-triggering with `draft-release-mac.yml`/`draft-release-linux.yml` on `v*`, no artifact-name collision expected) so a future reader doesn't mistake it for an accident.
- No reference to Heroic anywhere in the file (verified by test + manual review).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author release-tauri.yml** - `0f6180d4` (feat) - matrix + SEA + graceful-skip signing + skip-warning + draft-prerelease

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `.github/workflows/release-tauri.yml` (NEW) - 3-OS matrix tauri-action release pipeline with graceful-skip signing + explicit skip warnings + draft-prerelease

## Decisions Made

- Computed the Windows `--config` signing override in a dedicated bash step (`id: build_args`, writing to `$GITHUB_OUTPUT`) instead of RESEARCH.md's inline nested-brace GHA expression ternary — avoids ambiguity from literal `{`/`}` characters inside an outer `${{ }}` wrapper while producing the identical merged-args behavior.
- Centralized all signing secrets in job-level `env:` rather than duplicating them on the `tauri-action` step — every step inherits automatically, keeping "read via env blocks, never inlined into run: strings" (T-34-05) enforceable in one place.
- Accepted co-triggering with the existing Electron `draft-release-*` workflows on the shared `v*` tag pattern (Pitfall 7) rather than switching to a distinct tag namespace — documented via a top-of-file comment; both pipelines are additive per the established Tauri/Electron parity invariant.

## Deviations from Plan

None - plan executed exactly as written. The only implementation choice beyond the plan's literal text was computing the Windows `--config` override via a bash step rather than an inline expression, which is a syntax-safety refinement of the same Pattern 2 approach the plan specified, not a functional deviation.

## Issues Encountered

None. `pnpm test -- --testPathPattern=releaseWorkflow` required invoking `npx jest --testPathPattern=releaseWorkflow` directly (the `pnpm test --` passthrough dropped the pattern arg and reported "no tests found" — a pnpm/jest CLI arg-parsing quirk, not a workflow-file problem); confirmed via `npx jest` directly, 13/13 PASS.

## User Setup Required

None for this plan. Real signing secrets (`TAURI_SIGNING_PRIVATE_KEY`, `APPLE_*`, `WINDOWS_*`) remain unenrolled by design (D-03) — the workflow is provably safe with all of them absent.

## Next Phase Readiness

- `.github/workflows/release-tauri.yml` exists and greens its Wave-0 test gate; 34-07 can now exercise the Manual-Only live tag-push gate against this pipeline.
- Live end-to-end verification (an actual `v0.7.0`-matching tag push producing a real draft release with all 4 matrix legs succeeding) has NOT been run in this plan — that is explicitly 34-07's job per the plan's `<objective>` ("Live behavior is proven by the 34-07 Manual-Only gate").

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: `.github/workflows/release-tauri.yml`
- FOUND commit: `0f6180d4`
- `npx jest --testPathPattern=releaseWorkflow` -- 13/13 PASS
- `node -e "require('js-yaml').load(...)"` -- YAML_OK (python3/pyyaml unavailable in this environment; js-yaml used as an equivalent parser per the plan's verify intent)
