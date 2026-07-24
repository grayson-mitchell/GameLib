---
status: complete
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
source: [34-VERIFICATION.md]
started: 2026-07-24T23:20:00Z
updated: 2026-07-24T23:55:00Z
run_url: https://github.com/grayson-mitchell/GameLib/actions/runs/30084918812
tag_pushed: v0.7.0-rc.test
---

## Current Test

[testing complete]

## Tests

### 1. Live `v*` tag push — all four release-tauri.yml matrix legs
expected: All four legs (macOS arm64, macOS x64, Linux, Windows) succeed; a draft+prerelease GitHub Release appears with per-platform installers (dmg/nsis/appimage) + latest.json; signing gracefully skips with a visible warning (no cert secrets enrolled yet); the compiled sidecar binary runs standalone with no system Node on PATH
result: issue
reported: "All 4 legs failed at the tauri-action step, from two distinct root causes. macOS arm64 + x64: `failed to bundle project: failed codesign application: failed to run command security import: failed to import keychain certificate` — the D-04 graceful-signing-skip invariant is violated; the job FAILED on a missing cert instead of shipping unsigned. Linux + Windows: both built their installers successfully (GameLib_0.7.0_amd64.AppImage, GameLib_0.7.0_x64-setup.exe) then failed at updater signing with `failed to decode secret key: incorrect updater private key password: Wrong password for that key`. No GitHub Release was created."
severity: blocker

### 2. Post-publish `promote-updater-feed.yml` fires and updates the `updater` release's latest.json
expected: GitHub `release: published` event triggers promote-updater-feed.yml; the workflow finds latest.json on the newly-published release, uploads it to the fixed-tag `updater` release, and the round-trip verification step confirms byte-identical content
result: blocked
blocked_by: prior-phase
reason: "Test 1 produced no GitHub Release at all (all four legs failed before tauri-action's release-creation step), so there is nothing to publish and no `release: published` event to trigger the promotion workflow. Unblocks once Test 1 passes."

## Summary

total: 2
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 1

## What the run DID prove

These are first-ever live confirmations, not inferences — every one of them was previously unproven:

- **GAP-1 fix works.** `Build renderer web assets (electron-vite)` ✓ on all four legs.
- **GAP-2 fix works — the headline result.** `Build self-contained sidecar (Node SEA)` ✓ on `windows-latest`. The `require.resolve()` + `process.execPath` rewrite genuinely fixed the `.bin` pnpm-shim spawn failure that would have killed the Windows leg.
- **CR-01 fix works.** `Build steam bridge shims (macOS only)` ✓ on both macOS legs.
- **CR-02 prune step works.** `Prune non-frontend build intermediates before bundling` ✓ on all four legs; both fail-loud guards passed.
- **WR-02 build-args step works.** `Compute tauri-action build args (Windows signing override merge)` ✓.
- **WR-03 preflight correctly did NOT fire** — both updater secrets are enrolled, so the fail-fast step was skipped as designed.
- **Both signing-skip warnings fired** — macOS `::warning::Signing skipped — no Apple cert secret set` and the Windows equivalent.
- **Rust release builds + bundling succeed on every platform**: AppImage bundled, NSIS `.exe` bundled, `GameLib.app` bundled on both macOS arches.

## Gaps

- truth: "Signing/notarization plumbing gracefully skips without failing the job when secrets are absent (D-04: CI never fails on missing certs)"
  status: failed
  reason: "User-observed on live run 30084918812: both macOS legs failed with `failed to bundle project: failed codesign application: failed to run command security import: failed to import keychain certificate`. The job-level `env:` block sets `APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}`, which with the secret absent resolves to the EMPTY STRING rather than being unset. tauri-action treats a defined-but-empty APPLE_CERTIFICATE as 'signing requested' and runs `security import` with empty data, which fails. The `Warn if macOS signing will be skipped` step is decorative — it emits a log line but does nothing to prevent the signing attempt. releaseWorkflow.test.ts asserts the warning STRING is emitted, which is exactly the shape-not-executed-path failure mode this phase was already criticised for."
  severity: blocker
  test: 1
  artifacts:
    - path: ".github/workflows/release-tauri.yml"
      issue: "Job-level env: block unconditionally defines APPLE_CERTIFICATE/APPLE_CERTIFICATE_PASSWORD/APPLE_SIGNING_IDENTITY/APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID as empty strings when the secrets are absent; the macOS skip is warn-only with no mechanism to stop tauri-action from attempting codesign"
    - path: "src/backend/__tests__/releaseWorkflow.test.ts"
      issue: "Asserts the macOS skip-warning string is present but never proves the signing attempt is actually prevented"
  missing:
    - "Make the Apple signing env vars conditional so they are UNSET (not empty) when the secrets are absent — e.g. move them from the job-level env: block into a per-step env: gated on the secret being non-empty, mirroring the three-secret Windows gate"
    - "A test that executes the gating logic and asserts APPLE_CERTIFICATE is absent from the tauri-action step env when the secret is empty, rather than asserting a warning string"
  root_cause: ""
  debug_session: ""

- truth: "The updater signing key can actually sign the bundle on CI (createUpdaterArtifacts: true requires a decodable key)"
  status: failed
  reason: "User-observed on live run 30084918812: Linux and Windows both completed their installer bundles, then failed with `failed to decode secret key: incorrect updater private key password: Wrong password for that key`. TAURI_SIGNING_PRIVATE_KEY_PASSWORD does not decrypt TAURI_SIGNING_PRIVATE_KEY. Secret enrollment timestamps differ by ~55 minutes (key 02:28:41Z, password 03:23:12Z), consistent with the key being regenerated after the password was set, or a password transcription error. This is an enrollment/environment defect, not a repo code defect — but it blocks the pipeline just as hard, and WR-03's preflight cannot catch it because it only checks the key is non-empty, never that the key/password pair actually decodes."
  severity: blocker
  test: 1
  artifacts:
    - path: ".github/workflows/release-tauri.yml"
      issue: "WR-03 preflight checks only that TAURI_SIGNING_PRIVATE_KEY is non-empty; a non-empty key with a mismatched password still fails late, after the full Rust build and bundle (~13 min wasted on the Windows leg)"
  missing:
    - "Re-enroll TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD as a matched pair (human action — requires the private key + password from 34-03)"
    - "Extend the WR-03 preflight to actually verify the key/password pair decodes before the build, turning a 13-minute late failure into a fast one"
  root_cause: ""
  debug_session: ""
