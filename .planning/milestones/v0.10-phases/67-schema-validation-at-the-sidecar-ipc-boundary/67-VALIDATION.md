---
phase: 67
slug: schema-validation-at-the-sidecar-ipc-boundary
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-07
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `67-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest multi-project (`jest.config.js`: backend, common, frontend, preload, meta, relay) + `cargo test --bin gamelib-shell` |
| **Config file** | `jest.config.js`, `src/backend/jest.config.js`, `meta/jest.config.js` |
| **Quick run command** | `npx jest src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts` (plus the touched domain's suite) |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && (cd src-tauri && cargo test --bin gamelib-shell)` |
| **Estimated runtime** | quick ~30 s; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** the quick command for the touched domain, `pnpm codecheck`, and `pnpm check:ipc-contract` once it exists
- **After every plan wave:** `pnpm test:ci`; `cargo test --bin gamelib-shell` for any wave that touched Rust
- **Before `/gsd-verify-work`:** full suite green, `pnpm check:ipc-contract` green, `ipcSchemaCoverage` at zero with no exemptions, `smoke:sidecar` run
- **Max feedback latency:** ~60 seconds for the quick loop

---

## Per-Task Verification Map

Behaviour IDs (V67-A..F) come from RESEARCH.md; the planner binds task IDs to them.

| Behaviour | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-----------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| zod 4 installed; 15 files compile and pass | V67-A | advisory floor 4.6.6 | validator DoS advisory closed | unit + typecheck | `pnpm codecheck && npx jest crossover_index humble knownFix bridge/__tests__/allowlist shellFilesFlows` | ✅ | ⬜ pending |
| invalid args rejected before handler; typed marker on invoke; send dropped; no values in logs | V67-B | tampering / info disclosure | hostile args never reach handler; logs carry paths+codes only | unit | `npx jest src/backend/sidecar/__tests__/ipcValidation.test.ts` | ❌ W0 | ⬜ pending |
| JSON round-trip (`undefined`→`null`) accepted for optional args | V67-B | type confusion | `optionalArg` helper | unit | same file | ❌ W0 | ⬜ pending |
| renderer receives `IpcValidationError` | V67-B | — | N/A | unit (preload) | `npx jest src/preload` | ❌ W0 | ⬜ pending |
| no zod value import reaches renderer/preload | V67-C | — | N/A | lint / bundle test | `pnpm lint:src` or new guard test | ❌ W0 | ⬜ pending |
| census parser reads schema-derived domain files | V67-C | — | N/A | unit | `npx jest ipcDomainCensus flowRegistrationCensus` | ✅ (update) | ⬜ pending |
| unvalidated ceiling equality, then zero-exemption | V67-D | elevation of privilege | every channel validated | unit | `npx jest ipcSchemaCoverage` | ❌ W0 | ⬜ pending |
| generator subset; loud failure out of subset | V67-E | — | N/A | unit | `npx jest meta/__tests__/genIpcContract.test.ts` | ❌ W0 | ⬜ pending |
| generated Rust is fresh | V67-E | — | N/A | script | `pnpm check:ipc-contract` | ❌ W0 | ⬜ pending |
| generated structs parse shared wire fixtures | V67-E | — | N/A | Rust unit | `cd src-tauri && cargo test --bin gamelib-shell store_embed_wire_contract` | ✅ | ⬜ pending |
| relay rejects non-allow-listed channel | V67-E | elevation of privilege | renderer can name only allow-listed channels | Rust unit | `cd src-tauri && cargo test --bin gamelib-shell ipc_contract` | ❌ W0 | ⬜ pending |
| transportParity retired per covered mirror | V67-F | — | N/A | unit | `npx jest transportParity` until deleted | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/sidecar/__tests__/ipcValidation.test.ts` — V67-B, incl. JSON round-trip and log-capture assertion that no argument value appears
- [ ] `src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts` — V67-D
- [ ] `meta/__tests__/genIpcContract.test.ts` — V67-E (use `createFakeHomeProfile()` for any spawned CLI)
- [ ] Renderer-bundle guard — V67-C
- Framework install: none (jest and cargo already present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidecar still exits by event-loop drain at stdin EOF | exit contract | slow exit is invisible to unit tests and `smoke:sidecar` | Run `pnpm smoke:sidecar`, then `pnpm tauri:dev`, quit, confirm no lingering sidecar process |
| Live app: store, login and library flows still work with validation on | V67-B | real renderer call shapes may differ from test fixtures | `pnpm tauri:dev` (restart after sidecar rebuild); exercise login, library refresh, install, embedded store; check log for `[GAMELIB_IPC_INVALID_ARGS]` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
