---
phase: 4
slug: branding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-28
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 |
| **Config file** | none dedicated — implicit via package.json |
| **Quick run command** | `npm run codecheck` (TypeScript no-emit type check) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–60 seconds (codecheck); full suite longer |

---

## Sampling Rate

- **After every task commit:** Run `npm run codecheck`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** `npm run codecheck` green + manual app launch checks
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-xx | TBD | 1 | BRAND-01 (name) | — | N/A (display/metadata only) | smoke/shell | `node -e "if(require('./package.json').name!=='gamelib')process.exit(1)"` | ❌ W0 | ⬜ pending |
| 4-xx | TBD | 1 | BRAND-01 (appId) | — | N/A | smoke/shell | `grep -q 'appId: com.gamelib.app' electron-builder.yml` | ❌ W0 | ⬜ pending |
| 4-xx | TBD | 1 | BRAND-01 (version label i18n) | — | N/A | smoke/shell | `node -e "const t=require('./public/locales/en/translation.json');if(!String(t.settings.systemInformation.heroicVersion).startsWith('GameLib'))process.exit(1)"` | ❌ W0 | ⬜ pending |
| 4-xx | TBD | 1 | BRAND-01 (About clipboard) | — | N/A | unit | `npm test` (existing `formatSystemInfo` coverage in utils/systeminfo) | ✅ Partial | ⬜ pending |
| 4-xx | TBD | 1 | BRAND-01 (compiles) | — | N/A | type check | `npm run codecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: exact task IDs are assigned by the planner; the rows above map BRAND-01 sub-behaviors to automated checks.*

---

## Wave 0 Requirements

- [ ] Shell-level smoke assertions for `package.json` name, `electron-builder.yml` appId, and the translation.json version label — these can be added as verification steps rather than new test files.
- No existing Jest tests assert on display-name strings or appId values, so no existing tests should break.

*Existing Jest + `codecheck` infrastructure otherwise covers all phase requirements; no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OS window/title bar shows "GameLib" | BRAND-01 (SC-1) | Window chrome rendering can't be asserted in unit tests | Launch app (`pnpm start`) → confirm window title reads "GameLib" |
| Sidebar/About shows "GameLib Version …" | BRAND-01 (SC-2) | Live React render + i18n | App → Settings → System Info → label reads "GameLib: 2.22.0 …"; "Copy to clipboard" paste starts with "GameLib:" |
| Build artifact named GameLib | BRAND-01 (SC-3) | Requires a full packaging run | `pnpm dist:<platform>` → output named `GameLib-<version>-…` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
