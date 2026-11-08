---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 03
subsystem: supply-chain
tags: [cargo-deny, pnpm-audit, dependabot, github-actions]
requires: [72-02]
provides:
  - advisories-only cargo-deny config with four reasoned zip ignores
  - Supply-chain audit workflow (pnpm audit + cargo-deny)
  - security-only Dependabot config, security updates enabled on the repo
affects: [72-07]
tech-stack:
  added: [cargo-deny (CI action), dependabot]
  patterns: [separate audit workflow, no paths filter on required checks]
key-files:
  created:
    - src-tauri/deny.toml
    - .github/workflows/audit.yml
    - .github/dependabot.yml
key-decisions:
  - "cargo-deny has no severity threshold; unmaintained/unsound scoped to workspace; four zip advisories ignored with reasons (zip reachable only via tauri-plugin-updater, which nothing invokes)"
requirements-completed: [D-17, D-18, D-16]
duration: ~15min
completed: 2026-11-08
---

# Phase 72 Plan 03: Supply-chain gates Summary

Turned on blocking `pnpm audit --prod --audit-level high` and `cargo deny check advisories` gates in a separate `audit.yml`, with a security-only Dependabot config and the repo-level security-updates setting enabled.

## Commits
- a075d6fb6: `src-tauri/deny.toml`, advisories only, exactly four zip ignores (RUSTSEC-2026-0367, -0368, -0369, -0429), each with a reason.
- 5f5888051: `.github/workflows/audit.yml` (push/PR on main and stable, weekly cron Mon 06:00 UTC, workflow_dispatch, no paths filter, `contents: read`) and `.github/dependabot.yml` (npm `/` and cargo `/src-tauri`, `open-pull-requests-limit: 0`).

## Local verification
- `cargo-deny --manifest-path src-tauri/Cargo.toml check advisories` exits 0 ("advisories ok"); only yanked warnings remain (async-executor, clipboard-win).
- `cargo tree -i zip --target all`: zip v4.6.1 is required only by tauri-plugin-updater v2.10.1.
- `pnpm audit --prod --audit-level high` exits 0 (3 low, 5 moderate).
- Both YAML files parse and pass scoped `prettier --check`; `--file-info` shows not ignored.
- 72-02's predicted unmaintained errors (unic-*, zbus_names, zvariant*, proc-macro-error) did not appear under `unmaintained = "workspace"` / `unsound = "workspace"`.

## Task 3: Dependabot security updates (checkpoint, operator-enabled)
Operator enabled the setting; re-verified by the executor:

```
$ gh api repos/grayson-mitchell/GameLib/automated-security-fixes
{"enabled":true,"paused":false}
```
The orchestrator also confirmed `vulnerability-alerts` returns HTTP 204.

## First audit.yml run
Not yet pushed. The operator did not request a push, so no run exists; the acceptance criterion allows recording this. Check `gh run list --workflow audit.yml --limit 1` after the next push.

## Caveats
- The advisory DBs are fetched at run time, so both jobs can go red with no repo change when a new advisory lands.
- Not covered: advisories absent from the GitHub/RustSec DBs, dev-only npm deps (`--prod`), licenses/bans/sources.

## Deviations from Plan
None - plan executed exactly as written.

## Known Stubs
None.

## Self-Check: PASSED
Files deny.toml, audit.yml, dependabot.yml exist; commits a075d6fb6 and 5f5888051 exist in history.
