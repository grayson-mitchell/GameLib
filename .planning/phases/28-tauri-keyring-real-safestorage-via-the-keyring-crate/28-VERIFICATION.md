---
phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate
verified: 2026-07-22T02:37:27Z
reverified: 2026-07-22T00:00:00Z
status: human_needed
score: 23/24 must-haves verified
overrides_applied: 0
resolved_gaps:
  - truth: "There is exactly one module in the codebase that reads or writes configStore's refreshToken key (28-03 must-have, supports REQ-28-02/REQ-28-03/D-09)"
    status: resolved
    fix_commit: "45b6519f"
    reason: >
      SteamUser.logout() now routes the refresh token through getTokenStore().clearToken()
      (the D-09 seam) instead of calling configStore.clear() directly. The blanket clear()
      was replaced with targeted configStore.delete('isLoggedIn')/delete('userData') calls so
      Electron's observable logout behavior is unchanged (verified by the actual configStore
      key set enumerated via grep: isLoggedIn/userData in user.ts, TOKEN_STORE_KEY only in
      tokenStore.ts — confirmed no other keys exist). logout() is now async (clearToken() may
      RPC to Rust in the sidecar build); main.ts's addListener('logoutSteam', ...) was updated
      to await it via the same async fire-and-forget IPC convention already used elsewhere in
      that file (e.g. addListener('quit', async () => handleExit())) — no floating promise.
      A regression test was added asserting isLoggedIn/userData are explicitly cleared (not
      just the token) — this test fails under the naive one-line clear()->clearToken() swap
      that would otherwise silently stop clearing session state. Re-verified: user.test.ts
      64/64 pass, sidecar+tokenStore suites 52/52 pass, `tsc --noEmit` clean, real Electron
      store md5 unchanged before/after (958bf6829589f20a8de935ebf7c2502b), grep confirms zero
      remaining configStore.clear() calls and zero TOKEN_STORE_KEY references outside
      tokenStore.ts/constants.ts in the steam store manager. tokenStore.ts's "ONLY module
      permitted to read or write TOKEN_STORE_KEY" docstring claim is now true.
gaps:
  - truth: "The pre-existing openExternal frame from the sidecar now actually opens a URL instead of being discarded (28-02 must-have, REQ-28-05 incidental fix)"
    status: partial
    reason: >
      Code-level artifact exists and is substantive: src-tauri/src/main.rs's start_reader()
      has a dedicated `kind == "openExternal"` branch (confirmed by direct read, lines 457-466)
      that calls app.opener().open_url(...), and `cargo build` compiles clean. But per
      28-PROOF.md Step 5 and this phase's own hardware checkpoint, it was never exercised
      end-to-end on real hardware — the Tauri build starts signed-out by design (D-02/D-03),
      so no game was ever launchable during this phase's checkpoint to actually trigger a
      steam://rungameid/<id> open. This is honestly recorded as NOT VERIFIED in 28-PROOF.md
      itself (not a case of the phase hiding it), but the task's own instruction is explicit
      that this must not be marked verified, so it is carried into this report as a real,
      unclosed gap rather than folded into the passing score.
    artifacts:
      - path: "src-tauri/src/main.rs"
        issue: "openExternal reader branch (lines 452-466) compiles and passes code review but has zero runtime/hardware evidence of actually opening a URL"
    missing:
      - "Hardware-verify a real steam:// launch through this path once a future phase ports the login channel and a game becomes launchable in the Tauri window (28-PROOF.md already recommends this as the next phase's own checkpoint item)."
---

# Phase 28: Tauri keyring — real `safeStorage` via the `keyring` crate — Verification Report

**Phase Goal:** Replace the walking skeleton's plaintext-passthrough `safeStorage` stub with
spike 011's proven `keyring` crate path (`apple-native` feature, byte-identical round-trip), so
the sidecar persists and retrieves the Steam refresh token in the real OS Keychain and can never
corrupt the Electron build's session.
**Verified:** 2026-07-22T02:37:27Z
**Re-verified (gap closure):** 2026-07-22 — gap 1 (`SteamUser.logout()` TokenStore seam bypass) fixed in commit `45b6519f`
**Status:** human_needed
**Re-verification:** Yes — gap-closure pass for gap 1 only. Gap 2 (`openExternal` hardware verification) is unchanged and remains open by design (see below).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sidecar code can call a Rust-side capability and await a real answer (resolve/reject) | ✓ VERIFIED | `requestRustInvoke()` in `sidecarRpc.ts`; `rustInvokeChannel.test.ts` 8/8 pass (re-run independently) |
| 2 | A rustInvoke with no answer rejects on a bounded timeout instead of hanging | ✓ VERIFIED | 60s unref'd timeout in `sidecarRpc.ts`; covered by `rustInvokeChannel.test.ts` |
| 3 | A Rust response frame addressed to the sidecar's own outstanding request is never mistaken for an inbound request | ✓ VERIFIED | `handleFrame()`'s response-to-self disambiguation runs before `isValidRequest()`; test-covered |
| 4 | Sidecar refuses to emit a rustInvoke for a channel outside a fixed allowlist | ✓ VERIFIED | `RUST_INVOKE_CHANNELS` allowlist in `sidecarTransport.ts`, enforced in `requestRustInvoke()` |
| 5 | Rust shell stores and retrieves a secret in the real macOS Keychain via the `keyring` crate | ✓ VERIFIED | Hardware round-trip, byte-identical (28-PROOF.md Step 1, human-performed 2026-07-22) |
| 6 | A rustInvoke frame from the sidecar is dispatched and answered, not silently dropped | ✓ VERIFIED | `dispatch_rust_channel()` + reader-thread `kind == "rustInvoke"` branch; hardware round-trip confirms |
| 7 | The pre-existing openExternal frame now actually opens a URL instead of being discarded | ⚠️ PARTIAL (gap) | Code exists (`main.rs:452-466`), compiles clean, but **not hardware-exercised** — explicitly NOT VERIFIED per 28-PROOF.md Step 5 |
| 8 | A Keychain failure is an honest error; "no entry yet" is distinguishable from "backend unavailable" | ✓ VERIFIED | `dispatch_rust_channel()` special-cases `NoEntry`; confirmed variant-agnostic beyond that (28-PROOF.md §3) |
| 9 | A blocking Keychain prompt does not wedge the reader thread's handling of other frames | ✓ VERIFIED | `rustInvoke` dispatch runs on a spawned worker thread (`main.rs:441`), not inline on the reader thread |
| 10 | Electron build's token read/write behavior is unchanged (same ciphertext, store key, legacy-plaintext fallback) | ✓ VERIFIED | `ElectronTokenStore`'s 3 private methods are the verbatim extracted bodies of the pre-phase free functions (diffed against `cdd71a9c` by code review, independently re-read); `user.test.ts`/`tokenStore.test.ts` pass |
| 11 | Exactly one module reads/writes `configStore`'s refreshToken key | ✓ VERIFIED (gap closed) | `logout()` now routes through `getTokenStore().clearToken()` (commit `45b6519f`); grep confirms `TOKEN_STORE_KEY` appears only in `tokenStore.ts`/`constants.ts` within the steam store manager, and zero `configStore.clear()` calls remain in live code |
| 12 | A different build can swap the token store implementation without touching `user.ts` or any `window.api` call-site | ✓ VERIFIED | `setTokenStore()`/`getTokenStore()` registry; `bootstrap.ts` installs `SidecarKeyringTokenStore` without touching `user.ts` |
| 13 | Nothing in the token path imports or copies an Electron-stored token toward the keyring (no migration) | ✓ VERIFIED | `keyringTokenStore.ts` has zero import of `configStore`/`electronStores`; source-gate test enforces this |
| 14 | In the Tauri sidecar build, the refresh token is read/written to the OS Keychain, never `configStore` | ✓ VERIFIED | `SidecarKeyringTokenStore` routes exclusively through `requestRustInvoke(RUST_KEYRING_*)`; by-construction gate test passes |
| 15 | When the Keychain is unavailable/denied, the sidecar reports unavailable, yields empty token, logs a warning, persists nothing | ✓ VERIFIED | Hardware Deny-click test (28-PROOF.md Step 2) + code (`SidecarKeyringTokenStore` catch blocks) + `keyringTokenStore.test.ts` |
| 16 | The sidecar's `safeStorage` stub no longer claims encryption is available | ✓ VERIFIED | `electronStub.ts` `isEncryptionAvailable()` returns real Keychain-availability result, not hardcoded `true`; gated by regression test |
| 17 | The sidecar's token store module has no syntactic path to `configStore`/`TOKEN_STORE_KEY` | ✓ VERIFIED | `electronUntouched.test.ts`'s by-construction gate (comment-stripped grep) passes |
| 18 | Electron's stored token is byte-identical before and after the sidecar exercises its full token path | ✓ VERIFIED | `electronUntouched.test.ts` (7 tests) + hardware cross-build check (818 bytes, md5 `958bf6829589f20a8de935ebf7c2502b`, independently re-confirmed on disk during this verification, unchanged after re-running the suite myself) |
| 19 | The sidecar's token path leaves no new/modified/deleted key in the shared `configStore` | ✓ VERIFIED | `electronUntouched.test.ts`'s full-snapshot test |
| 20 | A regression reintroducing a `configStore` token write from the sidecar fails an automated check, not a human review | ✓ VERIFIED | Two by-construction gate tests in `electronUntouched.test.ts` (source-strip + regex match) |
| 21 | Real macOS Keychain round-trip through the sidecar→Rust channel observed on hardware, byte-identical | ✓ VERIFIED | 28-PROOF.md Step 1 (human-performed 2026-07-22) |
| 22 | Denying the real Keychain prompt produces clean signed-out state, logged warning, no persisted plaintext | ✓ VERIFIED | 28-PROOF.md Step 2 (human-performed, `PlatformFailure(-128)` observed) |
| 23 | Both `npm start` (Electron) and `npm run tauri:dev` still work after this phase | ✓ VERIFIED | `cargo build` clean (independently re-run, zero warnings); Electron-side Jest suites green; additive-only diff (no `window.api.*` call-site changes) |
| 24 | SEAM.md no longer describes `safeStorage` as a passthrough stub, and records what remains deferred | ✓ VERIFIED | `27-.../SEAM.md` §1 has a `safeStorage` entry marked "Graduated from stubbed to ported in Phase 28"; §3's login-channel row records the remaining deferral |

**Score:** 23/24 truths verified (1 gap remains — see below; gap 1 closed by commit `45b6519f`)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/types/sidecarTransport.ts` | `rustInvoke` kind + channel constants + allowlist | ✓ VERIFIED | Present, wired, tested |
| `src/backend/sidecar/sidecarRpc.ts` | `requestRustInvoke()` + correlation map | ✓ VERIFIED | Present, exported, wired into `handleFrame()` |
| `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` | Transport-shape coverage | ✓ VERIFIED | 8 behaviors, independently re-run PASS |
| `src-tauri/Cargo.toml` | `keyring` v3 with `apple-native` feature | ✓ VERIFIED | `cargo build` resolves `keyring v3.6.3` |
| `src-tauri/src/main.rs` | `dispatch_rust_channel()`, rustInvoke/openExternal reader branches, `write_raw()` | ✓ VERIFIED | Present; scaffolding fully removed (zero `selfcheck` references); `cargo build` clean |
| `src/backend/storeManagers/steam/tokenStore.ts` | `TokenStore` interface + `ElectronTokenStore` + registry | ✓ VERIFIED | Present, 141 lines, exports match |
| `src/backend/storeManagers/steam/user.ts` | Auth flow routed through `getTokenStore()` | ✓ VERIFIED | `getCredentials()`/`finishAuth()`/QR handler/`logout()` all routed (commit `45b6519f` closed the last gap) |
| `src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` | Parity + registry + no-migration coverage | ✓ VERIFIED | Independently re-run PASS |
| `src/backend/sidecar/keyringTokenStore.ts` | `SidecarKeyringTokenStore` | ✓ VERIFIED | 92 lines, exports match, no `configStore` import |
| `src/backend/sidecar/bootstrap.ts` | Installs `SidecarKeyringTokenStore` | ✓ VERIFIED | `installTokenStore(new SidecarKeyringTokenStore())` at line 98 |
| `src/backend/sidecar/electronStub.ts` | Honest `safeStorage` stub | ✓ VERIFIED | Regression-gated by `electronUntouched.test.ts` |
| `src/backend/sidecar/__tests__/keyringTokenStore.test.ts` | Error-classification coverage | ✓ VERIFIED | Independently re-run PASS |
| `src/backend/sidecar/__tests__/electronUntouched.test.ts` | Byte-comparison proof + source gate | ✓ VERIFIED | Strictly read-only (zero `.set/.delete/.clear` on real store); independently re-run PASS; real store file confirmed byte-identical (md5 match) after my own re-run |
| `.planning/phases/28-.../28-PROOF.md` | Automated + hardware proof pair | ✓ VERIFIED | Present, 247 lines, records the regression honestly (§1) |
| `.planning/phases/27-.../SEAM.md` | `safeStorage` graduated to Ported | ✓ VERIFIED | Confirmed by direct read |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `sidecarRpc.ts` | `sidecarTransport.ts` | `RUST_INVOKE_CHANNELS` import | ✓ WIRED | Confirmed |
| `sidecarRpc.ts handleFrame()` | `rustPending` map | response-to-self disambiguation | ✓ WIRED | Confirmed |
| `main.rs start_reader()` | `dispatch_rust_channel()` | `kind == "rustInvoke"` branch | ✓ WIRED | Confirmed, worker-thread dispatch |
| `dispatch_rust_channel()` | `keyring::Entry` | `KEYRING_SERVICE`/`KEYRING_ACCOUNT` constants (never from `args`) | ✓ WIRED | Confirmed — threat T-28-03 (arbitrary Keychain addressing) closed by construction |
| `user.ts` | `tokenStore.ts` | `getTokenStore().getToken()/setToken()/clearToken()` | ✓ WIRED | Wired for `getCredentials()`/`finishAuth()`/QR handler/`logout()` (commit `45b6519f` closed the `logout()` gap) |
| `bootstrap.ts` | `keyringTokenStore.ts` | `installTokenStore(new SidecarKeyringTokenStore())` | ✓ WIRED | Confirmed |
| `electronUntouched.test.ts` | `electronStores.ts configStore` | real, unmocked store read | ✓ WIRED | Confirmed read-only |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `SidecarKeyringTokenStore.getToken()` | Keychain-stored refresh token | `requestRustInvoke(RUST_KEYRING_GET)` → Rust `entry.get_password()` | Yes | ✓ FLOWING (hardware-confirmed byte-identical round-trip) |
| `dispatch_rust_channel("keyring_available")` | Keychain reachability | `entry.get_password()` result classification | Yes | ✓ FLOWING, but see WR-02 (side-effecting probe, not a data-flow defect) |
| `main.rs openExternal branch` | URL string from sidecar frame | `value.get("args")[0]` → `app.opener().open_url()` | Unverified at runtime | ⚠️ STATIC/UNPROVEN — compiles and reads correctly from the frame, but no hardware run has confirmed a URL actually opened (matches gap #2) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Rust crate compiles clean | `cd src-tauri && cargo build` | `Finished dev profile...` exit 0, zero warnings | ✓ PASS |
| No scaffolding references remain | `grep -in "selfcheck" src-tauri/src/main.rs` | zero matches | ✓ PASS |
| No debt markers in phase-touched files | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across 13 modified files | zero matches | ✓ PASS |
| Full phase-relevant Jest suite | `npx jest <6 phase test files>` | 6 suites / 110 tests, all PASS (independently re-run, not trusting SUMMARY) | ✓ PASS |
| Real Electron store untouched by my own re-run | `md5` of `~/Library/Application Support/GameLib/steam_store/config.json` before/after test run | `958bf6829589f20a8de935ebf7c2502b`, matches 28-PROOF.md's recorded baseline exactly | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention used by this phase; the equivalent proof mechanism is
the hardware checkpoint recorded in `28-PROOF.md`, which is human-performed and cannot be re-run
by this verifier. Treated as evidence per the task's explicit instruction, not re-requested.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| REQ-28-01 | 28-02, 28-04, 28-06 | Real macOS Keychain round-trip via `keyring` crate, byte-identical, no OSCrypt reimplementation | ✓ SATISFIED | Hardware round-trip (28-PROOF.md Step 1) + code |
| REQ-28-02 | 28-03, 28-04, 28-05 | Sidecar never writes `TOKEN_STORE_KEY` into shared `configStore`; Electron token provably byte-identical | ✓ SATISFIED | `electronUntouched.test.ts` + hardware; the "exactly one owner module" invariant that D-09 rests on now holds in full — `logout()` gap closed by commit `45b6519f` |
| REQ-28-03 | 28-03 | No token migration; Tauri build starts signed-out | ✓ SATISFIED | Code inspection confirms no migration bridge |
| REQ-28-04 | 28-05, 28-06 | Verifiable proof pair (synthetic round-trip + Electron-untouched); Phase 27 UAT 2/3 deferral documented | ✓ SATISFIED | `28-PROOF.md` complete, D-03 restated §4 |
| REQ-28-05 | 28-01, 28-02 | Reusable sidecar→Rust request/response channel, keyring as first consumer, pre-existing dropped-frame path fixed | ⚠️ PARTIALLY SATISFIED | Channel itself fully verified (hardware keyring round-trip proves it works); the "openExternal fix" component is code-complete but explicitly **NOT hardware-verified** (gap #2) — do not mark fully satisfied |
| REQ-28-06 | 28-04, 28-06 | Honest-unavailable → clean signed-out; never persists plaintext | ✓ SATISFIED | Hardware Deny-path test (28-PROOF.md Step 2) + code |
| REQ-28-07 | 28-06 | No dev escape hatch; both builds work; zero `window.api.*` diffs | ✓ SATISFIED | Hardware rebuild re-prompt test (28-PROOF.md Step 3) + `cargo build` clean + no call-site diffs |

No orphaned requirements — REQUIREMENTS.md's Phase 28 section (REQ-28-01..07) matches exactly
the union of `requirements:` fields declared across all six plans' frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | none found | — | `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` scan across all 13 phase-touched files returned zero matches |

Code review (`28-REVIEW.md`) independently found 0 Critical / 5 Warning / 2 Info. This verification
independently confirmed WR-01 (logout() bypass) by direct source read and elevated it to a
reported gap rather than leaving it as review-only prose, per the task's explicit instruction to
assess whether it undermines REQ-28-03/D-09. **WR-01 is now fixed (commit `45b6519f`) and marked
resolved in `28-REVIEW.md`.** WR-02 (isAvailable() side-effect), WR-03 (no shared source of truth
between TS allowlist and Rust dispatcher), WR-04 (test comment-stripping edge case), and WR-05
(`isValidRequest()` accepting `'openExternal'` inconsistently) are real but lower-severity findings
that do not affect any of this phase's must-have truths — not elevated to gaps here, left open.

## Mandatory Scrutiny: The Data-Destroying Regression

**Independently verified, not taken on the executor's or reviewer's word:**

1. **The remediation genuinely holds.** I independently re-ran the six phase-relevant Jest suites
   (110 tests, all green) and then compared the real on-disk store file
   (`~/Library/Application Support/GameLib/steam_store/config.json`) before and after my own test
   run: 818 bytes, md5 `958bf6829589f20a8de935ebf7c2502b` — an exact match to the baseline
   recorded in `28-PROOF.md`. `electronUntouched.test.ts` contains zero `.set()`/`.delete()`/
   `.clear()` calls anywhere in the file (confirmed by direct read, not just grep count).
   `skeletonFlows.test.ts`'s `jest.mock('os', ...)` homedir override is a top-level statement
   (hoisted above all imports by babel-plugin-jest-hoist) and `pathShim.ts`'s
   `resolveAppDataDir()` calls `homedir()` fresh on every invocation rather than caching it — so
   the override cannot be bypassed by import ordering. No test in this phase reached the real
   config directory during my independent run.
2. **Honestly recorded, not omitted.** Both `28-06-SUMMARY.md` (§ "Deviations from Plan" →
   "Regression discovered and fixed mid-phase") and `28-PROOF.md` (§1, bolded "Regression
   introduced mid-phase and fixed") document the incident in full: root cause
   (`skeletonFlows.test.ts` Test 4's unconditional `steamConfigStore.clear()` landed by Phase 27,
   compounded by `electronUntouched.test.ts`'s original snapshot/restore design), real-world
   impact (developer's real refresh token destroyed, library dropped to 1 entry, forced
   re-authentication), the fix commit (`92c29a5e`), and why an `afterAll` restore was not a
   reliable safety net in this repo (the known `library.ts` leaked-timer force-exits Jest workers
   before `afterAll` runs). This is not quietly omitted — it is the most prominently documented
   single finding in both artifacts.

**Verdict:** the regression is genuinely fixed and genuinely disclosed. This does not block the
phase.

## Human Verification Required

### 1. `openExternal` end-to-end steam:// launch through the Tauri reader-thread fix

**Test:** Once a future phase ports the login channel and a real game is launchable inside the
Tauri window, trigger a launch and confirm the `kind == "openExternal"` branch in
`src-tauri/src/main.rs`'s `start_reader()` actually opens `steam://rungameid/<id>` via
`tauri-plugin-opener`.
**Expected:** Steam launches the game; no silent frame drop.
**Why human:** Requires an authenticated Steam session inside the Tauri window, which is
explicitly out of this phase's scope (D-02/D-03) — no login channel exists yet to reach this
runtime state.

## Gaps Summary

**Gap 1 — RESOLVED (2026-07-22, commit `45b6519f`).** `SteamUser.logout()` bypassed the
`TokenStore` seam (`user.ts:172`, `configStore.clear()` instead of
`getTokenStore().clearToken()`), contradicting `tokenStore.ts`'s own module docstring claim of
being "the ONLY module... permitted to read or write... TOKEN_STORE_KEY." Fixed by routing the
token through `getTokenStore().clearToken()` and replacing the blanket `configStore.clear()` with
targeted `configStore.delete('isLoggedIn')`/`delete('userData')` calls so Electron's observable
logout behavior is unchanged. `logout()` is now `async`; the one production caller
(`main.ts`'s `addListener('logoutSteam', ...)`) was updated to match the file's existing async
fire-and-forget IPC convention. A regression test guards against the naive one-line
`clear()`→`clearToken()` swap (which would have silently stopped clearing `isLoggedIn`/`userData`).
Verified: `user.test.ts` 64/64, sidecar+tokenStore suites 52/52, `tsc --noEmit` clean, real
Electron store md5 unchanged before/after (`958bf6829589f20a8de935ebf7c2502b`), grep confirms zero
remaining `configStore.clear()` calls and zero `TOKEN_STORE_KEY` references outside
`tokenStore.ts`/`constants.ts` in the steam store manager. `28-REVIEW.md` WR-01 marked fixed.

**Gap 2 — remains OPEN by design.** `openExternal` reader-thread fix is code-complete but not
hardware-verified end-to-end. Honestly recorded as NOT VERIFIED in `28-PROOF.md` itself — this
report is not surfacing a hidden problem, but per the task's explicit instruction this must not be
folded into the passing score. The Tauri build starts signed-out by design (D-02/D-03), so nothing
is launchable this phase — nothing to hardware-verify yet. Naturally closes when a future phase
ports the login channel and a real game becomes launchable inside the Tauri window; REQ-28-05
remains only partially satisfied until then. See "Human Verification Required" above for the
specific test to run at that point.

With gap 1 closed, the phase's core, hardware-verified deliverable stands on a fully closed
invariant: the sidecar genuinely persists and retrieves the Steam refresh token through the real
macOS Keychain, Electron's session is provably untouched, and exactly one module
(`tokenStore.ts`) now owns `configStore`'s `TOKEN_STORE_KEY` in truth as well as in claim. Status
set to `human_needed` (not `pass`) because gap 2's hardware checkpoint remains outstanding and
must not be silently marked verified.

---

*Verified: 2026-07-22T02:37:27Z*
*Gap 1 closed: 2026-07-22 (commit `45b6519f`)*
*Verifier: Claude (gsd-verifier)*
