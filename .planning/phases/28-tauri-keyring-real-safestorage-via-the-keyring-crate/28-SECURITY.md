---
phase: 28
slug: tauri-keyring-real-safestorage-via-the-keyring-crate
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-22
---

# Phase 28 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: **plan-time** (all six plans carried a `<threat_model>` block). This
audit verified that each claimed mitigation exists in shipped code — it did not
retroactively scan for new threats.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| sidecar (Node) → Rust shell over stdio | Sidecar-authored frames instruct the native shell to perform OS-level operations | `rustInvoke` channel names + args, including the Steam refresh token on `keyringSet` |
| Rust shell → sidecar over stdio | Shell-authored frames drive sidecar handler dispatch | `rustInvokeResult` payloads, including the token on `keyringGet` |
| Rust shell → macOS Keychain (Security.framework) | OS credential store; access is ACL-gated on the binary's signing identity | Steam refresh token (session-equivalent credential) |
| Rust shell → `/usr/bin/open` via tauri-plugin-opener | A URL from sidecar frame args reaches a system URL handler | `steam://` protocol URLs |
| Electron build ↔ sidecar build over a SHARED `configStore` file | Two processes with different crypto capabilities address the same store file | Persisted Steam session token / whole store JSON |
| test process → developer's real config directory | `electronUntouched.test.ts` reads the developer's real Steam session file | Real refresh token (read-only) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-28-01 | Tampering | sidecar writing `TOKEN_STORE_KEY` into the shared `configStore`, silently signing the real user out | mitigate | `keyringTokenStore.ts` imports neither `configStore`/`electronStores` nor `TOKEN_STORE_KEY`/`TOKEN_PREFIX`; key confined to `constants.ts` + `tokenStore.ts`. `bootstrap.ts:41-42,98`; source gate `electronUntouched.test.ts:289-298` PASS. Logout gap (VERIFICATION gap 1 / REVIEW WR-01) closed — `user.ts:163-190` routes through `getTokenStore().clearToken()`, zero live `configStore.clear()` calls | closed |
| T-28-02 | Information Disclosure | plaintext token persisted on Keychain failure | mitigate (sidecar/Rust) · accept (Electron legacy) | Rust `main.rs:224-243` `keyring_set` has no fallback write path (`Err(keyring:unavailable:…)` only); `keyringTokenStore.ts:66-75` failure paths write nowhere; `electronStub.ts:140-148` plaintext round-trip replaced with a `throw`. Electron half accepted — see AR-28-01 | closed |
| T-28-03 | Elevation of Privilege | `rustInvoke` channel argument (both sides) | mitigate | `sidecarTransport.ts:150-158` `RUST_INVOKE_CHANNELS`; `sidecarRpc.ts:258-264` rejects non-members without emitting a frame; `main.rs:206-277` `dispatch_rust_channel` = 4 literal arms + catch-all `rustInvoke:unknown-channel`; `KEYRING_SERVICE`/`KEYRING_ACCOUNT` are compile-time constants (`main.rs:57-58`), never sourced from `args` | closed |
| T-28-03b | Spoofing | `handleFrame()` inbound direction | mitigate | `sidecarRpc.ts:71-82` — `isValidRequest()`'s accepted-kind set omits `'rustInvoke'`; the shell cannot drive a rustInvoke into the sidecar | closed |
| T-28-04 | Information Disclosure | token value in stderr / sidecar logs / Jest output | mitigate | `main.rs:214-273` every `eprintln!` logs `channel` + `{:?}` of `keyring::Error` only; `sidecarRpc.ts` unrecognized-frame branch logs `kind`/`id` only, never `args`/`result` | closed |
| T-28-05 | Denial of Service | unanswered `rustInvoke` wedging the sidecar; Keychain prompt head-of-line blocking the Rust reader thread | mitigate | `sidecarRpc.ts` `RUST_INVOKE_TIMEOUT_MS = 60_000` (unref'd) rejects the pending promise and clears the map entry; `main.rs:439-448` dispatches on a spawned worker thread | closed |
| T-28-06 | Denial of Service | oversized/malformed frames on the new kind | accept | Pre-existing `MAX_LINE_LENGTH` (10 MiB, `sidecarRpc.ts:50`, enforced at `:199`) bounds all kinds generically — see AR-28-02 | closed |
| T-28-07 | Tampering | `openExternal` URL from a sidecar frame | accept | `games.ts:182-194` `buildSteamProtocolUrl` `/^\d+$/` guard unchanged; `main.rs:452-465` forwards an already-guarded URL — see AR-28-03 | closed |
| T-28-08 | Tampering | untrusted caller invoking `setTokenStore()` to redirect token writes | accept | `tokenStore.ts:131-137` — zero references in `src/preload`/`src/frontend`; logged via `logInfo` on every call — see AR-28-04 | closed |
| T-28-09 | Spoofing | `safeStorage` stub claiming `isEncryptionAvailable() === true` while offering no encryption | mitigate | `electronStub.ts:141` → `() => false`; regression-gated by `electronUntouched.test.ts:300-306` | closed |
| T-28-10 | Tampering | token store swapped before/after handlers observe it (ordering) | mitigate | `bootstrap.ts:89-98` — `installTokenStore(new SidecarKeyringTokenStore())` immediately after `startRpcServer()`/`bindTransport()`, before any handler body can run; load-bearing comment present | closed |
| T-28-11 | Denial of Service (data loss) | `electronUntouched.test.ts` destroying the developer's real Steam session | mitigate | Suite rewritten strictly read-only after a real incident (commit `92c29a5e`); zero `.set()`/`.delete()`/`.clear()` calls in the file; byte comparison via `fs.readFileSync` only | closed |
| T-28-12 | Tampering | keyring self-check overwriting the production Keychain entry | mitigate | Self-check only ever addressed `KEYRING_ACCOUNT + "-selfcheck"` (28-PROOF.md §2 hardware record) and is now fully removed — the mechanism no longer exists in shipped code | closed |
| T-28-13 | Elevation of Privilege | `GAMELIB_KEYRING_SELFCHECK` growing into a D-08 escape hatch | mitigate | `grep -c "GAMELIB_KEYRING_SELFCHECK" src-tauri/src/main.rs` → 0; `grep -ci "selfcheck"` → 0 (independently re-run at audit time) | closed |
| T-28-14 | Repudiation | phase claimed complete without the hardware observation | mitigate | `28-PROOF.md` §2 records the blocking human checkpoint's verbatim terminal output (round-trip + Deny-click `PlatformFailure(-128)`) | closed |
| T-28-15 | Tampering | un-owned self-check scaffolding surviving the phase | mitigate | `grep -c "SCAFFOLDING (28-06 Task 1)" src-tauri/src/main.rs` → 0; `dispatch_rust_channel`/`KEYRING_SERVICE` confirmed still present; `cargo build` clean | closed |
| T-28-SC | Tampering (supply chain) | `keyring` crate | mitigate | `src-tauri/Cargo.toml:19` — `keyring = { version = "3", features = ["apple-native"] }`; resolves `keyring v3.6.3`; RESEARCH.md § Package Legitimacy Audit records crates.io approval (17.4M downloads, `open-source-cooperative/keyring-rs`) plus spike-011 compile+run proof | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-28-01 | T-28-02 (Electron half) | `ElectronTokenStore.setToken()`/`getToken()` retain the pre-existing warn-then-store-plaintext behavior and legacy non-prefixed plaintext read when `safeStorage.isEncryptionAvailable()` is false, per D-11. Removing it would silently sign out users holding a legacy plaintext token and violate REQ-28-07's byte-identical-Electron constraint. The sidecar's `SidecarKeyringTokenStore` has no equivalent fallback (verified). | grayson.mitchell | 2026-07-22 |
| AR-28-02 | T-28-06 | The pre-existing `MAX_LINE_LENGTH` (10 MiB) guard in `sidecarRpc.ts` already bounds all frame kinds generically; no per-kind guard was added or bypassed for `rustInvoke`. | grayson.mitchell | 2026-07-22 |
| AR-28-03 | T-28-07 | Unchanged from Phase 27 (T-27-02/T-27-08). URLs are constructed exclusively by `buildSteamProtocolUrl`'s numeric-appId guard (`games.ts`), never from renderer free-text. Phase 28 only restored delivery of an already-guarded frame that was previously silently dropped. | grayson.mitchell | 2026-07-22 |
| AR-28-04 | T-28-08 | `setTokenStore` is a backend-only export with zero references in `src/preload`/`src/frontend` (verified by grep) — no IPC/renderer surface exists. Any in-process caller already holds full backend privileges. Every call is logged via `logInfo` naming the new implementation's constructor. | grayson.mitchell | 2026-07-22 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags (non-blocking)

Surfaced during audit; not covered by any registered threat ID, none undermine a
registered mitigation's disposition.

| Flag | Severity | Detail |
|------|----------|--------|
| Unbounded thread spawn per `rustInvoke` frame (`main.rs:439`) | WARNING | Distinct from T-28-05 (head-of-line blocking, mitigated). Thread-exhaustion vector if a future `rustInvoke` consumer retries/polls. Not externally reachable today — the sidecar is a trusted local child process. **Track for the next phase that adds `rustInvoke` consumers** (dialog/clipboard/notification/screen — Phase 33): add a thread pool or in-flight counter. Also filed as REVIEW IN-02. |
| `isAvailable()` side-effecting Keychain probe | INFO | REVIEW WR-02, already scoped non-blocking. |
| No CI-enforced sync between the TS `RUST_INVOKE_CHANNELS` allowlist and the Rust match arms | INFO | REVIEW WR-03. A drift would fail closed (`rustInvoke:unknown-channel`), not open. |
| `isValidRequest()` still accepts `'openExternal'` inbound, inconsistent with the `rustInvoke` direction-guard pattern | INFO | REVIEW WR-05; covered posture-wise by AR-28-03. |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-22 | 17 | 17 | 0 | gsd-security-auditor (verification mode, plan-time register) |

### Security Audit 2026-07-22

| Metric | Count |
|--------|-------|
| Threats found | 17 |
| Closed | 17 |
| Open | 0 |

Independent re-verification performed by the auditor rather than trusting SUMMARY/PROOF claims:

- `npx jest` across `rustInvokeChannel`, `keyringTokenStore`, `electronUntouched`, `bootstrap`, `skeletonFlows`, `tokenStore` — **52/52 pass**.
- `cd src-tauri && cargo build` — clean, exit 0.
- Grepped `src-tauri/src/main.rs` for surviving `selfcheck` / `GAMELIB_KEYRING_SELFCHECK` references — zero.
- Read `user.ts`'s `logout()` directly to confirm the previously-flagged VERIFICATION gap 1 / REVIEW WR-01 is fixed in code, not merely claimed.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-22
