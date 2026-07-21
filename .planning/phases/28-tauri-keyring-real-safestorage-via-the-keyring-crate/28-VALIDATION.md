---
phase: 28
slug: tauri-keyring-real-safestorage-via-the-keyring-crate
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-22
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `28-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (TypeScript/Node)** | Jest 29.7.0 + ts-jest 29.3.2 — already configured, `jest.config.js` (`projects: ['src/backend', 'src/frontend', 'src/preload', 'meta']`; `src/backend` covers the sidecar tests this phase extends) |
| **Framework (Rust)** | None configured — `src-tauri` has no `#[test]` modules or `cargo test` wiring today. See Wave 0. |
| **Config file (TS)** | `jest.config.js` (repo root) |
| **Config file (Rust)** | none |
| **Quick run command (TS)** | `npx jest src/backend/sidecar/__tests__/<newfile>.test.ts` |
| **Quick run command (Rust)** | `cd src-tauri && cargo build` (compile-gate only until a test target exists) |
| **Full suite command** | `npm run test:ci` (Jest, `--runInBand --silent`) **and** `cd src-tauri && cargo build` |
| **Estimated runtime** | Jest quick-run ~10s; `npm run test:ci` full suite ~2–4 min; `cargo build` incremental ~20–60s |

---

## Sampling Rate

- **After every task commit:** `npx jest <changed test file>` (TS side) / `cargo build` (Rust side)
- **After every plan wave:** `npm run test:ci` + clean `cargo build`
- **Before `/gsd-verify-work`:** Full Jest suite green + `cargo build` clean + the two manual Keychain click-throughs below
- **Max feedback latency:** ~60s (task-level), ~4 min (wave-level)

---

## Per-Task Verification Map

> Task IDs are filled in by the planner. Rows below are the requirement-level contract each
> plan's tasks must satisfy; the planner MUST map every task to one of these rows or add a row.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 1 | REQ-28-05 | — | A correlated `rustInvoke` request from the sidecar reaches Rust's dispatcher and a matching response returns; unknown/dropped frames are no longer silently discarded | integration (Jest, in-process; mirrors `skeletonFlows.test.ts` real-tmpdir pattern) | `npx jest src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | REQ-28-01 | — | Token set via the new channel is retrievable byte-identical and deletable from the real macOS Keychain | **manual/human-verify** — real Keychain requires the compiled Tauri binary on real hardware (project precedent: Phase 24 Gates 0–3, Phase 21 UAT) | `cd src-tauri && cargo build && npm run tauri:dev` (manual click-through) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | REQ-28-06 | T-28 (plaintext-token persistence) | `NoEntry` / `PlatformFailure` / `NoStorageAccess` outcomes map to a clean signed-out state; **never** a plaintext write | unit (Jest, `TokenStore` selection + error classification, faked keyring responder) | `npx jest src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | REQ-28-06 | T-28 | Real "Deny" click on the Keychain access prompt yields `isEncryptionAvailable() === false` + clean signed-out + logged warning | **manual/human-verify** (resolves RESEARCH Open Question 1: OSStatus → `keyring::Error` variant mapping) | manual click-through | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | REQ-28-02 | T-28 (shared-store corruption) | `steamConfigStore.json`'s token value is byte-identical before/after a Tauri run that exercises the keyring path; `TOKEN_STORE_KEY` is never written by the sidecar | integration (Jest) — **must snapshot + restore the real store file**: this repo's convention (`bootstrap.test.ts`) reads/writes the developer's real `~/Library/Application Support/GameLib/…` dir; `pathShim.ts` has no darwin env-var override | `npx jest src/backend/sidecar/__tests__/electronUntouched.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | REQ-28-03 | — | No migration hook exists; a Tauri run with an existing Electron token still starts signed-out | unit/integration (assert absence of any import path from `configStore` token → keyring) | `npx jest src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | REQ-28-07 | — | No env-var/in-memory escape hatch in the shipped path; `npm start` (Electron) and `npm run tauri:dev` both work; zero `window.api.*` call-site diffs | source assertion + build gate (`git diff --stat` shows no `window.api.*` call-site changes) + `npm run test:ci` + `cargo build` | `npm run test:ci && cd src-tauri && cargo build` | ✅ | ⬜ pending |
| TBD | TBD | 3 | REQ-28-04 | — | The proof pair (round-trip + Electron-untouched) is recorded as a reproducible artifact, and the D-03 deferral of Phase 27 UAT 2/3 is documented | doc + the two tests above | `npx jest src/backend/sidecar/__tests__/electronUntouched.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` — REQ-28-05. Transport-shape test; the Rust side can be stubbed entirely (this is framing, not Keychain).
- [ ] `src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` — REQ-28-06 / REQ-28-03. `TokenStore` selection (Electron impl vs. sidecar impl) + keyring-error classification against a fake responder, never the real Keychain.
- [ ] `src/backend/sidecar/__tests__/electronUntouched.test.ts` — REQ-28-02 / REQ-28-04. **Must snapshot + restore** `steamConfigStore.json`, since this repo's tests operate on the real config directory.
- [ ] *(planner's call)* A `#[cfg(test)]` module + `cargo test` target in `src-tauri` if automated coverage of the Rust keyring dispatch arm is wanted. Otherwise the Rust side stays a `cargo build` compile-gate plus the manual click-throughs — consistent with this project's established pattern of deferring real-hardware Keychain/Steam proofs to human-verify checkpoints.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real macOS Keychain round-trip (set → get byte-identical → delete) through the sidecar→Rust channel | REQ-28-01 | The real Keychain requires the compiled Tauri binary on real hardware; Jest can only exercise the TS-side framing against a stubbed responder | `cd src-tauri && cargo build`, then `npm run tauri:dev`; trigger the token set/get/delete path; Approve the Keychain prompt; confirm the retrieved value is byte-identical to what was set |
| Keychain access **denied** → honest unavailable | REQ-28-06 | Requires a human clicking "Deny" on a real macOS security prompt; also resolves RESEARCH Open Question 1 (which `keyring::Error` variant macOS actually produces) | Run the Tauri dev build, click **Deny** on the Keychain prompt. Assert: `isEncryptionAvailable()` returns false, token read is empty, app is cleanly signed out, a warning is logged, and **no** plaintext token is written anywhere |
| Keychain re-prompt on unsigned rebuild is accepted, not a bug | REQ-28-07 | D-08 accepts this friction by design; there is nothing to automate | Rebuild via `cargo build` and relaunch — a fresh Keychain prompt is **expected behavior**, not a defect |
| Electron build still signs in and works after the Tauri run | REQ-28-02 / REQ-28-07 | End-to-end cross-build assertion on the developer's real session | Note the Electron session state, run the Tauri build through the keyring path, then `npm start` and confirm the Electron session is unchanged |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ MISSING references above
- [ ] No watch-mode flags in any verify command
- [ ] Feedback latency < 60s at task level
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-07-22 — every task in plans 28-01..06 carries an `<automated>` verify or a
Wave 0 dependency. Wave 0 files are scheduled inside the plans that consume them (28-01 Task 2 before
Task 3; 28-03 Task 3; 28-04 Task 3; 28-05 Task 1). One addition beyond this document's original list:
`src/backend/sidecar/__tests__/keyringTokenStore.test.ts` (plan 28-04) carries the sidecar-side
keyring error classification for REQ-28-06, keeping it out of the Electron-side
`tokenStore.test.ts` (plan 28-03) so the two plans own disjoint files. No Rust `cargo test` target is
added — the Rust side stays a `cargo build` compile-gate plus plan 28-06's blocking human checkpoint,
matching this project's Phase 24 Gates 0-3 precedent.
