---
status: partial
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
source: [34-VERIFICATION.md]
started: 2026-07-24T23:20:00Z
updated: 2026-07-24T23:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Push a real `v*` test tag and let `release-tauri.yml` run to completion on all four matrix legs (macOS arm64, macOS x64, Linux, Windows)
expected: All four legs succeed; a draft+prerelease GitHub Release appears with per-platform installers (dmg/nsis/appimage) + `latest.json`; signing gracefully skips with a visible warning (no cert secrets enrolled yet); the compiled sidecar binary runs standalone with no system Node on PATH
result: [pending]

### 2. After the draft release from the tag-push test is manually published, confirm `promote-updater-feed.yml` fires and the `updater` release's `latest.json` is updated within the run
expected: GitHub `release: published` event triggers `promote-updater-feed.yml`; the workflow finds `latest.json` on the newly-published release, uploads it to the fixed-tag `updater` release, and the round-trip verification step confirms byte-identical content
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
