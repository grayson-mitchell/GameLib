---
phase: 34
slug: tauri-packaging-windows-and-linux-builds-signing-auto-update
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-24
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (existing) |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `pnpm test -- --testPathPattern=<suite>` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~TBD (planner to fill) seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick suite for the touched config-shape test
- **After every plan wave:** Run the full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** TBD seconds

---

## Per-Task Verification Map

> Populated by the planner. Config-shape unit tests (parse `tauri.conf.json`, `Cargo.toml`,
> release-workflow YAML) cover most REQ-34 items; CI-level and single-binary-smoke items are
> Manual-Only (see below).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | REQ-34-XX | T-34-XX / — | TBD | unit | `pnpm test -- --testPathPattern=tauriConf` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> New config-shape test suites (no runtime under test — these assert the shape of committed
> config/YAML). Planner to enumerate exact files.

- [ ] `src/backend/__tests__/tauriConf.test.ts` — asserts `bundle.active:true`, targets include `nsis`/`appimage`/`dmg`, `plugins.updater.pubkey` non-empty, `endpoints` contains `grayson-mitchell/GameLib` and never `Heroic-Games-Launcher`
- [ ] `src-tauri`/`Cargo.toml` feature-list assertion — `keyring` includes `windows-native` + `sync-secret-service` alongside `apple-native`
- [ ] release-workflow YAML parse test — `v*` tag trigger, `releaseDraft:true`, `prerelease:true`

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Compiled sidecar runs standalone with no system Node | REQ-34-sidecar-sea | Requires a clean environment without Node on PATH; produced only in CI | Run the produced sidecar binary in a clean container/VM with no Node installed; confirm it responds on stdio |
| CI build with unset signing secrets still produces an artifact and does not fail the job | REQ-34-signing-graceful-skip | CI-level behavior, not exercisable by local jest | `workflow_dispatch` run (or scratch fork) with no signing secrets set; assert job succeeds and emits unsigned artifacts + warning |
| Draft + prerelease keeps a 0.x release off GitHub "Latest" and invisible to the updater until published | REQ-34-release-trigger | Requires a live GitHub Release; observable only against the fork repo | Push a test tag; confirm the release is Draft + prerelease and not marked Latest; confirm updater sees nothing until manual publish |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < TBDs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
