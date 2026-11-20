---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 02
subsystem: supply-chain
tags: [pnpm-audit, cargo-deny, react-router, i18next-http-backend, rustls]
requires: []
provides:
  - clean npm prod high-severity audit baseline
  - patched rustls trio in Cargo.lock
affects: [72-03, 72-07]
tech-stack:
  added: []
  patterns: [pnpm.overrides patch-range floors]
key-files:
  modified:
    - package.json
    - pnpm-lock.yaml
    - meta/knip-baseline.txt
    - src/frontend/index.tsx
    - src-tauri/Cargo.lock
key-decisions:
  - "react-router-dom 7.18.5 and i18next-http-backend 4.0.10 adopted (amended D-19); no source changes needed beyond a comment"
requirements-completed: [D-19, D-18, D-10, D-16]
duration: ~20min
completed: 2026-11-08
---

# Phase 72 Plan 02: Supply-chain bumps Summary

Cleared all 5 high npm advisories via override floors, removed 4 importer-less Tauri plugin npm packages, moved to react-router-dom 7 / i18next-http-backend 4, and patched the rustls trio.

## Audit counts
- Before (`pnpm audit --prod`): 6 low, 10 moderate, 5 high, 0 critical (no new highs beyond the known list).
- After Task 1: 6 low, 8 moderate, 0 high; `--audit-level high` exits 0.
- After Task 2: no react-router, react-router-dom or i18next-http-backend advisory remains.

## Commits
- 1a2c22b80: overrides (undici ^6.29.1, follow-redirects ^1.16.2, source-map-js ^1.2.2), removed the four `@tauri-apps/plugin-*` npm packages and their knip lines.
- 824dbaff5: react-router-dom ^7.18.5, i18next-http-backend ^4.0.10, removed @types/react-router-dom + knip line; loadPath comment updated.
- 45185ef10: `cargo update -p` rustls 0.23.42->0.23.46, rustls-webpki 0.103.13->0.103.16, webpki-root-certs 1.0.9->1.0.11.

## Findings
- Frontend files touched by the router bump: none (codecheck passed with no changes to App.tsx or any importer). Only `src/frontend/index.tsx` changed (comment citing v4 behaviour).
- i18next-http-backend 4.0.10 still calls `loadPath(languages, namespaces)` with arrays (esm/index.js:270), so the signature is unchanged. v4's strict lng/ns validator (`isSafeLangUrlSegment`) rejects only `.. \ / @ ? # % : & = ; whitespace`, control chars, >128 length; it applies to `{{lng}}`/`{{ns}}` placeholders interpolated in the loadPath result. Our function returns a fully-built path with no placeholders, and shipped codes (`pt_BR`, `nb_NO`, `zh_Hans`, `zh_Hant`) contain none of the rejected characters, so they pass either way.
- `cargo update -p tauri-plugin-updater --dry-run`: would move 2.10.1 -> 2.12.0 (2.14.1 available) and add system-configuration; zip stays at 4.6.1, so no release pulls zip >= 9. Not applied.
- Local cargo-deny 0.20.2 `check advisories`: no rustls-family advisory. Remaining vulnerability errors are exactly the four zip advisories (RUSTSEC-2026-0367, -0368, -0369, -0429). Note: cargo-deny also reports unmaintained errors (unic-*, zbus_names, zvariant, zvariant_derive, proc-macro-error) and yanked warnings (async-executor, clipboard-win) that 72-03 must handle in its deny config.
- Tests: `cargo test --bin gamelib-shell` 430 passed; gamelib-scan/-cli passed; frontend jest project (name `Frontend`, not `frontend`; `--selectProjects frontend` finds nothing) 301 suites / 5235 tests passed; `pnpm codecheck` and `pnpm find-deadcode` pass.

## Deviations from Plan
- The plan's verify command `--selectProjects frontend` is case-wrong; used `Frontend`. No code impact.

## Known Stubs
None.

## Self-Check: PASSED
