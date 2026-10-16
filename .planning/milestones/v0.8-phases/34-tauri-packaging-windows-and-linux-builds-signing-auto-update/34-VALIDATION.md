---
phase: 34
slug: tauri-packaging-windows-and-linux-builds-signing-auto-update
status: approved
nyquist_compliant: true
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
| **Estimated runtime** | Config-shape suites ~10-30s each (readFileSync + assertions, no toolchain); `cargo build` gate ~1-3 min on a warm target cache |

---

## Sampling Rate

- **After every task commit:** Run the quick suite for the touched config-shape test
- **After every plan wave:** Run the full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** < 30s for the config-shape suites (cargo/SEA build gates excluded — they are inherently slower toolchain steps)

---

## Per-Task Verification Map

> Config-shape unit tests (parse `tauri.conf.json`, `Cargo.toml`, release-workflow YAML, SEA
> argv-builders) cover most REQ-34 items. Wave-1 (34-01) suites are RED-by-design scaffolds;
> the config plans (34-02/05/06) green them. CI-level and single-binary-smoke items are
> Manual-Only (see below).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-01 T1 | 34-01 | 1 | REQ-34-01, REQ-34-02, REQ-34-05, REQ-34-07 | T-34-01 | Feed never regresses to Heroic; bundle/keyring shape gated | unit (scaffold) | `pnpm test -- --testPathPattern="tauriConf\|cargoFeatures"` | ✅ (created by 34-01) | 🔴 RED-by-design |
| 34-01 T2 | 34-01 | 1 | REQ-34-06 | T-34-02 | Draft/prerelease + skip-warning flags cannot silently regress | unit (scaffold) | `pnpm test -- --testPathPattern="releaseWorkflow\|buildSidecarSea"` | ✅ (created by 34-01) | 🔴 RED-by-design |
| 34-03 T1 | 34-03 | 1 | REQ-34-05 | T-34-05 | Minisign private key never committed/logged | script gate | `test -f ~/.tauri/gamelib-updater.key.pub && ! git status --porcelain \| grep -Ei '\.key(\.pub)?$'` | ⬜ (key material, no repo file) | ⬜ pending |
| 34-03 T2 | 34-03 | 1 | REQ-34-05 | T-34-05 | Private key + password stored only as GH secrets | manual (checkpoint) | Human-verify: both GH Actions secrets exist | ⬜ (dashboard) | ⬜ pending |
| 34-02 T1 | 34-02 | 2 | REQ-34-03, REQ-34-07 | T-34-08 / T-34-SC | Keyring covers all 3 platforms; additive invariant intact | unit + build | `pnpm test -- --testPathPattern=cargoFeatures` + `cargo build` (PIPESTATUS-checked) | ✅ Cargo.toml / package.json | ⬜ pending |
| 34-02 T2 | 34-02 | 2 | REQ-34-03, REQ-34-07 | T-34-07 | Sidecar compiles fail-loud into a self-contained binary | unit + smoke | `pnpm test -- --testPathPattern=buildSidecarSea` + `pnpm build:sidecar-sea` | ✅ meta/buildSidecarSea.ts | ⬜ pending |
| 34-05 T1 | 34-05 | 3 | REQ-34-01, REQ-34-02, REQ-34-05 | T-34-01 / T-34-06 | bundle.active + fork-feed + minisign pubkey; no Heroic | unit | `pnpm test -- --testPathPattern=tauriConf` | ✅ tauri.conf.json | ⬜ pending |
| 34-05 T2 | 34-05 | 3 | REQ-34-03, REQ-34-08 | T-34-09 | Narrowly-scoped shell:allow-execute + updater plugin init | build | `cd src-tauri && cargo build` (PIPESTATUS-checked) | ✅ main.rs / capabilities/default.json | ⬜ pending |
| 34-05 T3 | 34-05 | 3 | REQ-34-08 | T-34-10 | Both `tauri:dev` + `npm start` still launch (additive/reversible) | manual (checkpoint) | Human-verify both dev shells + `pnpm test -- --testPathPattern="tauriConf\|electronUntouched"` | ⬜ (runtime) | ⬜ pending |
| 34-06 T1 | 34-06 | 4 | REQ-34-04, REQ-34-06 | T-34-04 / T-34-05 / T-34-07 / T-34-11 | Graceful-skip signing + explicit skip warning; draft-prerelease | unit + yaml-parse | `pnpm test -- --testPathPattern=releaseWorkflow` + `python3 -c "import yaml; yaml.safe_load(...)"` | ✅ release-tauri.yml | ⬜ pending |
| 34-07 T1 | 34-07 | 5 | REQ-34-04, REQ-34-09 | T-34-04 / T-34-12 / T-34-13 | Live: 3-OS build unsigned-but-working; draft+prerelease not-Latest; Node-free sidecar | manual (live gate) | Push `v0.7.0-rc.test`; verify Actions run + draft release + standalone sidecar | ⬜ (live CI/Release) | ⬜ pending |

### Gap-closure cycle (34-08..34-11, added 2026-07-24 from `34-REVIEW.md`)

> Closes CR-01, CR-02, WR-01, WR-02, WR-03. WR-04 and IN-01 are deliberately out of scope
> (recorded in `deferred-items.md` by 34-11 T3). Test commands use `npx jest --testPathPattern=…`
> rather than `pnpm test --` (34-06's recorded arg-dropping gotcha) and never gate on a green
> full-suite exit code (known pre-existing `library.ts:1153` leaked-timer exit-1).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-08 T1 | 34-08 | 6 | REQ-34-03 | T-34-14 | Sidecar triple derives from the build *target*, not the runner's arch (CR-01) | unit | `npx jest --testPathPattern=buildSidecarSea` | ✅ meta/buildSidecarSea.ts | ⬜ pending |
| 34-08 T2 | 34-08 | 6 | REQ-34-03 | T-34-14 / T-34-15 | Cross-build uses a checksum-verified official Node binary for the target triple, never a relabeled `process.execPath`; arch asserted, not assumed | unit + build gate | `npx jest --testPathPattern=buildSidecarSea` | ✅ meta/buildSidecarSea.ts | ⬜ pending |
| 34-08 T3 | 34-08 | 6 | REQ-34-03 | T-34-14 | Cross-arch output proven genuinely x86_64 on the arm64 dev Mac before CI | smoke (local) | `GAMELIB_SIDECAR_TARGET_TRIPLE=x86_64-apple-darwin pnpm build:sidecar-sea` + `lipo -archs` prints `x86_64` | ⬜ (build artifact) | ⬜ pending |
| 34-09 T1 | 34-09 | 6 | REQ-34-01, REQ-34-02 | — | Missing Windows `.ico` caught by the Wave-0 suite, not by a live Windows CI run (CR-02) | unit (RED scaffold) | `npx jest --testPathPattern=tauriConf` | ✅ tauriConf.test.ts | 🔴 RED-by-design |
| 34-09 T2 | 34-09 | 6 | REQ-34-01, REQ-34-02 | — | `nsis` target has a real `.ico`; every `bundle.icon` path resolves | unit | `npx jest --testPathPattern=tauriConf` | ⬜ (icon.ico to be generated) | ⬜ pending |
| 34-10 T1 | 34-10 | 6 | REQ-34-03, REQ-34-08 | T-34-09 / T-34-17 / T-34-16 | Source-shape assertions run against comment-stripped `main.rs` so they cannot pass vacuously | unit (RED scaffold) | `npx jest --testPathPattern=tauriShellSource` | ⬜ (suite to be created) | 🔴 RED-by-design |
| 34-10 T2 | 34-10 | 6 | REQ-34-03, REQ-34-08 | T-34-09 / T-34-17 | Release builds cannot be diverted to an arbitrary system `node` via `GAMELIB_SIDECAR_ENTRY` (WR-01) | unit + build | `npx jest --testPathPattern=tauriShellSource` + `cd src-tauri && cargo build` | ✅ src-tauri/src/main.rs | ⬜ pending |
| 34-10 T3 | 34-10 | 6 | REQ-34-08 | T-34-16 | Sidecar is killed+reaped on `RunEvent::Exit` — no orphan holding a Steam session (WR-03) | unit + build | `npx jest --testPathPattern=tauriShellSource` + `cd src-tauri && cargo build` | ✅ src-tauri/src/main.rs | ⬜ pending |
| 34-11 T1 | 34-11 | 7 | REQ-34-03, REQ-34-06 | T-34-14 | Every matrix leg declares its own `sidecar_triple`; a future leg added without one fails the test (CR-01 CI half) | unit + yaml-parse | `npx jest --testPathPattern=releaseWorkflow` | ✅ release-tauri.yml | ⬜ pending |
| 34-11 T2 | 34-11 | 7 | REQ-34-04 | T-34-05 | `cert.pfx` deleted in a `finally` (survives a failed import); no artifact/cache step can leak it (WR-02) | unit + yaml-parse | `npx jest --testPathPattern=releaseWorkflow` | ✅ release-tauri.yml | ⬜ pending |
| 34-11 T3 | 34-11 | 7 | — | — | WR-04 + IN-01 recorded as tracked debt rather than silently dropped | doc assertion | `deferred-items.md` contains WR-04 and IN-01 entries | ✅ deferred-items.md | ⬜ pending |

*Status: ⬜ pending · ✅ green · 🔴 RED-by-design (Wave-0 scaffold) · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> New config-shape test suites (no runtime under test — these assert the shape of committed
> config/YAML/SEA argv). Authored RED in 34-01; greened by 34-02/34-05/34-06.

- [ ] `src/backend/__tests__/tauriConf.test.ts` — asserts `bundle.active:true`, targets include `nsis`/`appimage`/`dmg`, `bundle.externalBin` includes `binaries/gamelib-sidecar`, `bundle.createUpdaterArtifacts:true`, `plugins.updater.pubkey` non-empty, `endpoints[0]` contains `grayson-mitchell/GameLib` and never `Heroic-Games-Launcher`, no `certificateThumbprint`/`signCommand`
- [ ] `src/backend/__tests__/cargoFeatures.test.ts` — `keyring` includes `windows-native` + `sync-secret-service` alongside `apple-native`; `tauri-plugin-updater` + `tauri-plugin-shell` present
- [ ] `src/backend/__tests__/releaseWorkflow.test.ts` — `v*` tag trigger, `workflow_dispatch`, three runners, `tauri-apps/tauri-action`, `releaseDraft:true`, `prerelease:true`, `env.WINDOWS_CERTIFICATE != ''` guard, the two `::warning::Signing skipped` steps (`env.APPLE_CERTIFICATE == ''` / `env.WINDOWS_CERTIFICATE == ''`), `install-deps` composite, no Heroic
- [ ] `meta/__tests__/buildSidecarSea.test.ts` — `sidecarOutputPath` `.exe`/no-`.exe` per triple; exact sentinel fuse `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`; darwin-only `NODE_SEA` macho-segment

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Compiled sidecar runs standalone with no system Node | REQ-34-03 / REQ-34-09 | Requires a clean environment without Node on PATH; produced only in CI | Run the produced sidecar binary in a clean container/VM with no Node installed; confirm it responds on stdio (34-07 T1) |
| CI build with unset signing secrets still produces an artifact, emits a skip warning, and does not fail the job | REQ-34-04 | CI-level behavior, not exercisable by local jest | `workflow_dispatch`/tag run with no signing secrets set; assert job succeeds, emits `::warning::Signing skipped`, and produces unsigned artifacts (34-07 T1) |
| Draft + prerelease keeps a 0.x release off GitHub "Latest" and invisible to the updater until published | REQ-34-04 / REQ-34-09 | Requires a live GitHub Release; observable only against the fork repo | Push `v0.7.0-rc.test` (numeric version MUST match `tauri.conf.json` so `tagName: v__VERSION__` does not diverge); confirm the release is Draft + prerelease + not-Latest; confirm updater sees nothing until manual publish (34-07 T1) |
| Both `npm run tauri:dev` and `npm start` still launch after bundle.active flip + plugin adds | REQ-34-08 | Runtime launch of two dev shells, not jest-observable | Human-verify checkpoint 34-05 T3 |
| Minisign private key + password stored as GH Actions secrets | REQ-34-05 | Dashboard-only secret handling | Human-verify checkpoint 34-03 T2 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (manual-only items are inherently CI/dashboard/runtime and documented above)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (4 scaffolds in 34-01 cover tauriConf/cargoFeatures/releaseWorkflow/buildSidecarSea)
- [x] No watch-mode flags
- [x] Feedback latency < 30s for config-shape suites
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
