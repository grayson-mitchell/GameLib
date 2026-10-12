---
phase: "50"
slug: "epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-12"
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (`testEnvironment: 'node'`, no jsdom — hooks/components invoked against hand-rolled mocks) for `src/frontend`; `cargo test` from `src-tauri/` for Rust |
| **Config file** | `src/frontend/jest.config.js`; `src-tauri/Cargo.toml` |
| **Quick run command** | `pnpm test -- useStoreEmbedHost` / `pnpm test -- WebviewUnavailablePanel` (Jest project-scoped); `cargo test --package gamelib -- store_embed` (from `src-tauri/`) |
| **Full suite command** | `pnpm test:ci` (`jest --maxWorkers=2 --silent`) plus full `cargo test` from `src-tauri/` |
| **Estimated runtime** | ~60–120 seconds (Jest full suite); cargo incremental varies |

**Structural constraint (from 50-RESEARCH.md § Validation Architecture):** anything that takes `&AppHandle` or touches a real `NSWindow` / `WKWebView` cannot be driven from a `#[test]`; the project's own in-repo comment at `src-tauri/src/main.rs` ~L19030 records this for `store_embed_open`. All Rust unit coverage for this phase must sit over `AppHandle`-free helpers. The native subview itself is verified only by the live gate.

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- <touched test file>` and/or `cargo test` scoped to the touched module, plus `npx prettier --check` over exactly the paths the task wrote (per `Skill("gamelib-conventions")`)
- **After every plan wave:** Run `pnpm test:ci` and full `cargo test`
- **Before `/gsd-verify-work`:** Full suite must be green AND the live gate arms below must be run on macOS
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-XX-XX | — | — | D-09 | T-50-NN / — | `cf-mitigated` header read is main-frame-only, response-based | unit (pure helper) | `cargo test --package gamelib -- store_embed` | ❌ W0 | ⬜ pending |
| 50-XX-XX | — | — | D-03 | — | Epic last-URL restore uses the validated path, no reload loop | unit | `pnpm test -- storeEmbedReloadLoop` | ✅ (Epic case is W0) | ⬜ pending |
| 50-XX-XX | — | — | D-10/D-11 | T-50-NN / — | Challenge → `WebviewUnavailablePanel` reason `'epic-challenged'`, not sticky | unit | `pnpm test -- WebviewUnavailablePanel` | ✅ (new cases W0) | ⬜ pending |
| 50-XX-XX | — | — | D-01/D-02 | — | Subview hidden on leave, shown on return, never outlives the route | manual (live gate) | — | — | ⬜ pending |
| 50-XX-XX | — | — | D-05/D-07/D-08 | — | 45 s timeout fires once, reload affordance shown, no silent retry | manual (live gate) | — | — | ⬜ pending |
| 50-XX-XX | — | — | L-1 | — | Sign in button reachable and unmodified | manual (live gate) | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Rows are placeholders seeded from RESEARCH.md; the planner fills Task ID / Plan / Wave when PLAN.md files exist.*

---

## Wave 0 Requirements

- [ ] New test cases in `src/frontend/.../WebviewUnavailablePanel.test.tsx` (or a sibling) for the `'epic-challenged'` reason's render/copy — follows the existing structural-gate pattern for the `'epic'` reason
- [ ] A pure, `AppHandle`-free Rust helper plus `#[test]` for the `cf-mitigated` header match / host-path fallback match, so `cargo test` covers the string logic the real `WKNavigationResponse` plumbing cannot
- [ ] Extension of `storeEmbedReloadLoop.test.tsx` (or sibling) for the Epic-specific restore path once `embeddable` becomes platform-aware; the inverted structural test is re-derived, not deleted
- [ ] `50-UAT.md` live-gate arms (see Manual-Only Verifications) authored per the UAT item shape in `Skill("gamelib-conventions")`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cold jar: store boots and paints | D-01 | Native `WKWebView` subview; no jsdom, no `NSWindow` in CI | Fake HOME via `createFakeHomeProfile()`, open Stores → Epic, observe paint within the timeout |
| Warm signed-in jar | L-3 | Spike measured cold `nonPersistentDataStore` only; shared default store is untested | Real profile arm (named, justified), signed-in Epic session, open Stores → Epic |
| Sign in button in place | L-1 | Live Talon/Cloudflare behaviour | Click Sign in; record challenged / 403 / success |
| Occlusion recovery | established #8 | Compositor behaviour | Cover the window, uncover, confirm the store boots and paints |
| Timeout → reload path | D-05/D-07/D-08 | Timer + native load state | Force a stall (offline or blocked host), observe banner at 45 s, click reload, observe recovery |
| Back/forward/URL parity with GOG embed | scope | Delegate-driven native state | Navigate three pages in Epic and in GOG; compare `StoreEmbedControls` state |
| Steam embed positive control | scope | Same-session baseline | Open Stores → Steam in the same session; confirm it still renders |
| Minimize/restore and fullscreen survive | D-02 | Window-event interaction with a native subview | Minimize, restore, toggle fullscreen; subview tracks the slot rect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
