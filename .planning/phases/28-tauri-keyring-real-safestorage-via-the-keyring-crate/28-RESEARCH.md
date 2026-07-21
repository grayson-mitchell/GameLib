# Phase 28: Tauri keyring — real `safeStorage` via the `keyring` crate - Research

**Researched:** 2026-07-22
**Domain:** Rust/Tauri v2 native credential storage (macOS Keychain) + a new sidecar↔Rust request/response transport leg
**Confidence:** HIGH (existing-code claims — verified by direct code read) / MEDIUM (keyring crate error-mapping specifics — docs.rs + crate source, some macOS-specific mapping unconfirmed)

## Summary

This phase has two genuinely separable engineering problems, and conflating them is the
single biggest planning risk. **Problem 1** is real Keychain storage — small, and already
de-risked by spike 011's compiled `keyring` crate proof (`Entry::new` → `set_password` →
`get_password` → `delete_credential`, byte-identical round-trip). **Problem 2** is a new
transport leg — the sidecar (Node) needs to *ask* the Rust shell to do something and get an
answer back, which **does not exist today in either direction that matters**. Research found
that the walking skeleton's `openExternal` fire-and-forget path — the only sidecar→Rust
frame Phase 27 shipped — is **not actually wired on the Rust side**: `src-tauri/src/main.rs`'s
stdout-reader thread only recognizes two frame shapes (`{ok: ...}` → a response to a
Rust-initiated invoke; `{kind: "frontendMessage"}` → a push notification). A `{kind:
"openExternal", ...}` frame from the sidecar matches neither branch and is **silently
dropped**. Phase 27's own summaries confirm this directly (27-02-SUMMARY.md: *"the frame is
currently silently ignored on the Rust side"*), and the live hardware run (27-05) never
actually exercised the launch flow — it was blocked upstream by the exact `safeStorage`
stub this phase replaces, so the gap was never caught by a real run. **This means Problem 2
is not "add a new direction," it is "the sidecar→Rust direction doesn't work AT ALL yet,
including the one path that already tries to use it."** The planner must budget for fixing
this as a precondition of/alongside D-05's new channel, not assume it as a working baseline.

The `keyring` crate (v3, `apple-native` feature) has no synchronous "is available" probe —
unlike `safeStorage.isEncryptionAvailable()`, availability can only be inferred from a real
operation's outcome. Its `Error` enum has 7 non-exhaustive variants; macOS-specific failures
(locked keychain, denied access prompt, no backend) collapse into `PlatformFailure` /
`NoStorageAccess` rather than distinct variants — there is no crate-level way to tell "user
clicked Deny" apart from "some other Keychain failure" without inspecting the wrapped
platform error. This directly shapes D-06's honest-unavailable design: it must be
operation-outcome-based, not a pre-check.

**Primary recommendation:** Build one new, generic, symmetric sidecar→Rust request/response
frame kind (mirroring the existing Rust→sidecar `invoke` mechanism byte-for-byte, just
reversed), fix the pre-existing dropped-frame gap on the Rust reader thread as part of the
same change (a new `kind` match arm, not a separate task), and land the `keyring` calls in
Rust as the first (and, per D-05, deliberately not the last) consumer of that channel. Keep
`user.ts`'s synchronous accessors as an Electron-only fast path; introduce a small
`TokenStore` interface only for the sidecar side so its async keyring round-trip has
somewhere to live without touching the Electron path's byte-for-byte behavior.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Keyring-native, NOT OSCrypt-compatible.** Store the refresh token as its own
  Keychain entry via the `keyring` crate (spike 011's literal proven path). Do **not**
  reimplement Electron's `safeStorage` ciphertext format (Chromium OSCrypt `v10`,
  AES-128-CBC/PBKDF2-HMAC-SHA1, 1003 iterations, `saltysalt`, fixed IV).
- **D-04 — HARD CONSTRAINT: the sidecar must never write `TOKEN_STORE_KEY` into the shared
  `configStore`.** The sidecar and Electron share one store by design (`pathShim` resolves
  `userData` to the same folder). Any sidecar write under that key corrupts Electron's
  Keychain decrypt and silently signs the user out. Electron's existing session must be
  provably untouched after a Tauri run.
- **D-02 — No migration. Re-login in Tauri.** The existing Electron token is not imported.
  Tauri starts signed-out; a future login writes a keyring-native token.
- **D-03 — Proof shape: synthetic round-trip only.** Prove a token round-trips
  byte-identical through the real Keychain via the sidecar, and that Electron's
  `configStore` token is untouched. Phase 27 UAT steps 2/3 explicitly stay deferred to
  whichever phase ports the login channel — NOT unblocked by this phase (supersedes
  ROADMAP.md's stale claim).
- **D-05 — Build the sidecar→Rust request/response channel as a deliverable of this phase**,
  as reusable infrastructure, not a one-off. Today `ElectronStubTransport`
  (`electronStub.ts:40-45`) is fire-and-forget only. This strongly steers D-07 toward Rust.
- **D-06 — Honest-unavailable → clean signed-out.** When the Keychain is locked, the user
  denies the prompt, or no backend exists: `isEncryptionAvailable()` returns **false**, token
  reads yield empty, the app reaches a clean signed-out state, a warning is logged. The
  sidecar must never persist a plaintext token.
- **D-08 — No dev escape hatch.** No env-var/in-memory fallback. Keychain ACL re-prompts on
  every unsigned/ad-hoc-signed rebuild are accepted friction; real fix is stable signing in
  the packaging phase.

### Claude's Discretion

- **D-07 — Which process talks to the Keychain.** Rust (`keyring` crate) vs. Node (shelling
  `/usr/bin/security`). D-05 strongly steers to Rust. Constraint: byte-identical Electron
  behavior; no `window.api.*` call-site changes.
- **D-09 — Storage shape / whether `user.ts` gets refactored.** A small token-store
  abstraction vs. a sidecar-only distinct key Electron ignores. `safeStorage`/`encryptToken`/
  `decryptToken` are synchronous but callers (`ensureConnected`, `finishAuth`) are already
  async — an async accessor is viable if introduced.
- **D-10 — Shape of the new sidecar→Rust channel.** Generic named-command invoke (symmetric
  with the existing renderer→Rust `sidecar_invoke`) vs. keyring-specific. Intent: reusable
  infrastructure, not a one-off.
- **D-11 — Whether Electron's plaintext fallback is also removed.** `user.ts`'s
  `encryptToken()` currently warns and writes plaintext when unavailable — divergent from
  D-06. Constraint: sidecar must never persist plaintext; any Electron-path change must not
  silently sign out existing users without being called out.

### Deferred Ideas (OUT OF SCOPE)

- Porting `startQRLogin`/`startCredentialLogin` (the actual login channel) — natural next
  slice, D-04/D-06 make it safe to wire later.
- Having Electron mirror its token into the keyring (rejected as a migration path, D-02).
- OSCrypt-compatible ciphertext / shared single token across both builds (rejected, D-01).
- Linux (libsecret/kwallet) and Windows (Credential Manager) keyring backend coverage —
  keyring-native is uniform in principle; only macOS is exercised this phase.
- Stable ad-hoc dev signing identity for Keychain ACL persistence (belongs to packaging phase).
</user_constraints>

<phase_requirements>
## Phase Requirements

Requirement IDs are **not yet minted** — CONTEXT.md's D-01..D-11 are the requirement source
(per the phase brief). The mapping below is what the orchestrator should mint from, keyed to
this research's supporting findings.

| Likely ID (from D-XX) | Description | Research Support |
|----|-------------|------------------|
| REQ-28-01 (D-01) | Store the token as a keyring-native Keychain entry, not OSCrypt ciphertext | Spike 011 `keyring_roundtrip()` (proven); Standard Stack table below |
| REQ-28-02 (D-04) | Sidecar never writes `TOKEN_STORE_KEY` into shared `configStore` | Architecture Patterns §"Storage shape"; exact file/line refs in Code Context |
| REQ-28-03 (D-02) | No token migration; Tauri starts signed-out | Confirmed no existing migration hooks anywhere in `user.ts`/`electronStores.ts` |
| REQ-28-04 (D-03) | Synthetic round-trip proof + Electron-untouched proof | Validation Architecture §Wave 0 Gaps; concrete test design given |
| REQ-28-05 (D-05/D-07/D-10) | New sidecar→Rust request/response channel, Rust-side keyring | Architecture Patterns §"The new transport leg" — full frame-shape design + the discovered pre-existing `openExternal` gap it must also fix |
| REQ-28-06 (D-06) | Honest-unavailable → clean signed-out, never persist plaintext from sidecar | Standard Stack §keyring error model; Common Pitfalls #1/#2 |
| REQ-28-07 (D-08) | No dev escape hatch; accept Keychain re-prompt friction | Common Pitfalls #4 |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Keychain read/write (macOS Security.framework) | Native shell (Rust) | — | `keyring` crate only exists in Rust; D-05/D-07 steer the OS credential call into the shell process, not the sidecar |
| Token encrypt/decrypt orchestration (which store to use, when) | Backend / sidecar (Node) | Native shell (Rust, via new channel) | `user.ts`'s existing accessors already own this decision; they gain a second, async, keyring-backed implementation for the sidecar build |
| Shared on-disk config (`configStore`, `steamConfigStore`) | Backend / sidecar (Node) | — | Untouched by this phase except by omission — D-04 forbids the sidecar from writing to it under `TOKEN_STORE_KEY` |
| Renderer-facing login/session state | Frontend (React) | — | Out of scope this phase (D-03) — no UI change, Tauri window still shows signed-out |
| Transport framing (new request/response frames) | Native shell (Rust) ↔ Sidecar (Node) | — | A new leg of the existing stdio JSON-RPC contract in `common/types/sidecarTransport.ts`; neither the renderer nor Electron touch it |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `keyring` | `3` (features = `["apple-native"]`) — resolves to **3.6.3** as of this session `[VERIFIED: crates.io]` | Real OS Keychain-backed secret storage from Rust | Already the literal proven path from spike 011 (`Cargo.toml` pinned `version = "3"`); 17.4M total downloads, official `open-source-cooperative/keyring-rs` org `[VERIFIED: crates.io API, https://crates.io/api/v1/crates/keyring]` |
| `security-framework` | 3.7.0 (transitive, pulled in automatically by `apple-native`) `[VERIFIED: cargo tree]` | Rust bindings to macOS Security.framework (what `keyring`'s apple backend calls) | Not installed directly — confirming it resolves cleanly is enough; no separate Cargo.toml entry needed |

**Version verification:**
```bash
cd .planning/spikes/011-electron-api-parity-in-tauri/parity-probe && cargo tree
# keyring v3.6.3
#  ├── log v0.4.33
#  └── security-framework v3.7.0 (+ core-foundation, bitflags, libc transitively)
```
This is the exact dependency tree spike 011 already built and ran successfully on this
machine — no new toolchain risk.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `serde_json` | `1` (already in `src-tauri/Cargo.toml`) | Encode/decode the new sidecar↔Rust frame shape | Already used for every existing frame; the new frame kind is just another `Value` |
| `randomUUID()` (Node builtin, already used in `sidecarRpc.ts`) | n/a | Correlation ids for the new sidecar-initiated requests | Already the pattern `requestOpenExternal()` uses for its `id` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `keyring` crate (Rust-side Keychain calls) | Node shelling `/usr/bin/security` (D-07's Node option) | Avoids the new transport leg entirely, but re-introduces a subprocess-per-call pattern GameLib already moved away from elsewhere, loses D-05's stated goal of building reusable sidecar→Rust infra other future ports (`dialog`, `clipboard`, `notification`, `screen`) need anyway. Rejected implicitly by D-05's framing — not revisited here. |
| `keyring` v3 (pinned, spike-proven) | `keyring` v4.1.5 (current crates.io max version) `[VERIFIED: crates.io API]` | v4 exists and is newer, but was never compiled/run in this project — using it here would re-introduce exactly the "training data may be stale" risk this phase exists to avoid for D-01. Recommend staying on `version = "3"` for continuity with the proven spike; evaluate v4 in a dedicated follow-up, not folded into this phase. |
| Generic sidecar→Rust request/response channel (D-10 "generic") | Keyring-specific one-off command | The generic channel is barely more code (one new frame `kind`, one new pending-map on each side) and is explicitly what D-05's rationale asks for — every future Tauri-side API port (`dialog`, `Notification`, `clipboard`) needs the exact same shape. Building it keyring-specific now would mean redoing this exact design next phase. |

**Installation (Cargo, `src-tauri/Cargo.toml`):**
```toml
[dependencies]
keyring = { version = "3", features = ["apple-native"] }
```
No `npm`/`pnpm` package is added — this phase's only new dependency is a Cargo crate.

## Package Legitimacy Audit

> This phase installs exactly one new external package: the `keyring` Rust crate.
> `slopcheck` is installed and available in this environment but only supports
> `install`/`scan` for npm/pip-style manifests — it has no Cargo.toml scan mode, so it was
> not run against this crate. Legitimacy was instead established directly against the
> authoritative registry (crates.io API) plus this project's own prior spike-011 compile+run
> proof, which is stronger evidence than a heuristic scanner would provide.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `keyring` | crates.io | Long-established (pre-2020 origin under `hwchen/keyring-rs`, now `open-source-cooperative/keyring-rs`) `[VERIFIED: crates.io]` | 17,442,568 total / 6,778,756 recent `[VERIFIED: crates.io API]` | https://github.com/open-source-cooperative/keyring-rs `[VERIFIED: crates.io API]` | Not run (no Cargo.toml support) | Approved — already compiled + round-tripped live in spike 011, plus independently confirmed via crates.io's own API in this session |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

## Architecture Patterns

### System Architecture Diagram

```
 Renderer (webview)                 Rust shell (src-tauri/src/main.rs)              Sidecar (Node, stdio)
 ──────────────────                 ──────────────────────────────────              ─────────────────────
                                                                                     
 window.api.* call            ┌──▶  sidecar_invoke #[command]  ──────stdin────▶     handleFrame()
   (invoke/send/openExternal) │      (existing, EXISTING PATH)       (invoke)       → handlerRegistry
                               │                                                       dispatch (user.ts,
                               │                                    ◀──stdout──       library.ts, ...)
                               │      correlates by `id`,            (response,
                               │      resolves the JS Promise         {id, ok, result})
                               │
                               │
                               │   ⚠ NEW THIS PHASE — currently MISSING both ways:
                               │
                               │   Rust-side handler dispatch  ◀───stdout────        requestRustInvoke()
                               │   (new `kind: "rustInvoke"`         (NEW FRAME:      [NEW — mirrors
                               │    match arm; calls the             {id, kind:       requestOpenExternal(),
                               │    `keyring` crate directly,         "rustInvoke",   but tracks a pending
                               │    same OS thread as the             channel:        Promise like Rust's
                               │    existing reader loop —            "keyring_get",  own `SidecarState`]
                               │    NOT the async runtime)            args:[...]})
                               │
                               └──▶ writes {id, ok, result?,
                                     error?} back on the SAME
                                     child stdin pipe Rust
                                     already owns  ───stdin───▶      new Node-side
                                                                       `rustPending` map
                                                                       resolves the
                                                                       Promise
```

The existing renderer→Rust→sidecar leg (top) is unmodified — it stays exactly as Phase 27
left it. The new leg (bottom) is the mirror image: sidecar initiates, Rust dispatches and
answers, using the **same physical pipes**, just reading/writing frames in the opposite
direction with a new discriminant.

### Recommended Project Structure

No new files/directories beyond what's already scaffolded — this phase extends existing
modules rather than adding new top-level structure:

```
src-tauri/
├── Cargo.toml              # + keyring dependency
└── src/main.rs             # + rustInvoke reader branch, + keyring dispatch, + shared
                             #   write-to-stdin helper (generalize SidecarState::write_frame)
src/
├── common/types/
│   └── sidecarTransport.ts # + 'rustInvoke' SidecarRpcKind variant, + channel-name constants
└── backend/
    ├── sidecar/
    │   └── sidecarRpc.ts   # + requestRustInvoke(), + rustPending map, + stdin-frame
    │                       #   disambiguation (response-to-us vs request-from-Rust)
    └── storeManagers/steam/
        └── user.ts         # + TokenStore selection (Electron sync path unchanged;
                             #   sidecar path calls requestRustInvoke('keyring_*', ...))
```

### Pattern 1: The new sidecar→Rust request/response frame (D-05/D-10)

**What:** A fourth `SidecarRpcKind` value, `'rustInvoke'`, symmetric to the existing
`'invoke'` (which flows Rust→sidecar). The sidecar becomes the requester; Rust becomes the
responder — using the identical `{id, ok, result?, error?}` response shape that already
exists for the opposite direction.

**When to use:** Any time sidecar code needs a real answer from something only Rust/native
code can do — this phase's keyring calls, and (per D-05's own rationale) every future
`dialog`/`clipboard`/`notification`/`screen` port.

**Example (TypeScript side — new code, following `requestOpenExternal`'s existing shape):**
```typescript
// src/backend/sidecar/sidecarRpc.ts — extends the existing module

const rustPending = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>()

export function requestRustInvoke(
  channel: string,
  args: unknown[]
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    rustPending.set(id, { resolve, reject })
    const request: SidecarRpcRequest = { id, kind: 'rustInvoke', channel, args }
    writeLine(request)
    // (a timeout mirroring Rust's own INVOKE_TIMEOUT constant belongs here too)
  })
}

// handleFrame() must gain a branch BEFORE isValidRequest()'s current check:
// a line with `ok` present and NO `kind` field is a response to OUR OWN
// outstanding rustInvoke, not an inbound request — mirrors main.rs's own
// `value.get("ok").is_some()` check on the Rust side, just reversed.
```

**Example (Rust side — new code, extends `main.rs`'s existing reader thread):**
```rust
// New match arm in start_reader()'s per-line dispatch, alongside the existing
// "ok" (response-correlation) and "frontendMessage" (notification) checks:
if value.get("kind").and_then(|v| v.as_str()) == Some("rustInvoke") {
    let id = value.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let channel = value.get("channel").and_then(|v| v.as_str()).unwrap_or_default();
    let args = value.get("args").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let result = dispatch_rust_channel(channel, &args); // new fn — match over
                                                          // "keyring_get"/"keyring_set"/
                                                          // "keyring_delete"/"keyring_available"
    let response = match result {
        Ok(v) => serde_json::json!({ "id": id, "ok": true, "result": v }),
        Err(e) => serde_json::json!({ "id": id, "ok": false, "error": e }),
    };
    // Write back on the SAME stdin pipe Rust already owns for its own
    // outbound invoke frames — generalize SidecarState::write_frame to accept
    // a raw serde_json::Value instead of only SidecarRpcRequest.
    let _ = state.write_raw(&response);
    continue;
}
```

**⚠ This also requires fixing the pre-existing gap:** the current reader loop has NO
`else` branch after its two `if`s — a frame matching neither `ok` nor `kind ==
"frontendMessage"` (which includes `kind == "openExternal"` today, and would include
`kind == "rustInvoke"` if this weren't added) is silently dropped. Any implementation of
this pattern must add the new branch, not assume the existing loop already "does something
sensible" with unrecognized frames — verified by direct code read, it does not.

### Pattern 2: Token-store seam in `user.ts` (D-09)

**What:** `user.ts` currently has three free functions (`encryptionAvailable`,
`encryptToken`, `decryptToken`) that directly call the injected `safeStorage` (real Electron
API, or the sidecar's stub/future-keyring-backed replacement) and `configStore`. The
least-invasive change that satisfies D-04 (sidecar must never write `TOKEN_STORE_KEY` into
`configStore`) without touching Electron's byte-identical path is to make these three
functions dispatch on which build is running, rather than trying to make one code path serve
both storage mechanisms.

**When to use:** Exactly the four call sites already identified in CONTEXT.md's canonical
refs — `getCredentials()` (L224), `finishAuth()` (L235-238), `startQRLogin`'s `authenticated`
handler (L403-404), `startCredentialLogin`'s shared path via `finishAuth`. All four are
already `async` functions — verified by direct read of `user.ts` above.

**Example:**
```typescript
// src/backend/storeManagers/steam/user.ts — illustrative shape, not literal diff

interface TokenStore {
  isAvailable(): Promise<boolean>
  getToken(): Promise<string>       // '' = none / unavailable (D-06 semantics)
  setToken(token: string): Promise<void>
  clearToken(): Promise<void>
}

// Electron path: WRAPS the existing synchronous safeStorage+configStore logic
// verbatim in Promise.resolve() — byte-identical behavior, just async-shaped.
class ElectronTokenStore implements TokenStore { /* existing encryptToken/decryptToken body, unchanged */ }

// Sidecar path: NEVER touches configStore's TOKEN_STORE_KEY (D-04). Calls the
// new requestRustInvoke() channel; keyring_get/keyring_set/keyring_delete are
// the three Rust-side dispatch targets from Pattern 1 above.
class SidecarKeyringTokenStore implements TokenStore { /* requestRustInvoke('keyring_*', ...) */ }
```

The existing `getCredentials()`/`finishAuth()` bodies change to `await
tokenStore.getToken()` / `await tokenStore.setToken(...)` instead of calling the free
functions directly — a small, local diff, not a rewrite of `user.ts`'s auth-flow logic.

### Anti-Patterns to Avoid

- **Do not give the sidecar write access to `configStore`'s `TOKEN_STORE_KEY` under any
  format** (plaintext, a keyring handle string, a JSON blob) — this is D-04's hard
  constraint and the exact mechanism of the "latent session-corruption trap" Phase 27's
  SEAM.md already documented and left for this phase to close.
- **Do not treat the current `openExternal` fire-and-forget frame as a working reference
  implementation to copy** — it is the thing this phase discovers is broken. Copy its
  request-emission shape (that part is fine), not an assumption that Rust already listens
  for it.
- **Do not call `keyring::Entry` methods from inside `tauri::async_runtime` directly** —
  they are blocking OS calls (Keychain access can block on a user prompt). The existing
  `sidecar_invoke` command already demonstrates the correct pattern
  (`tauri::async_runtime::spawn_blocking`) for the Rust→sidecar direction; the new
  Rust-side keyring dispatch runs on the reader thread's own dedicated OS thread (already
  off the async runtime), which is fine as-is — just don't move it onto an `async fn` command
  without the same `spawn_blocking` wrapper.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OS Keychain access from Rust | Direct `security-framework` FFI calls, or shelling `/usr/bin/security` from Rust | `keyring` crate's `Entry` API | Already proven (spike 011); `security-framework` is exactly what `keyring`'s apple backend wraps — using it directly would just reimplement `keyring`'s own internals for no benefit |
| Correlated request/response over a pipe | A bespoke ad-hoc "wait for the next line matching X" poll loop | The existing `mpsc::channel` + `HashMap<id, Sender>` pattern already in `SidecarState` (main.rs) | The exact same correlation mechanism already exists for the opposite direction — copy its shape, don't invent a new one |
| Keychain "is it available" check | A synchronous availability probe function | An operation-outcome classification (attempt `get_password`/`set_password`, classify the `Result`) | The crate has no static availability API; D-06 must be built around this reality, not around an assumption borrowed from Electron's `safeStorage.isEncryptionAvailable()` shape |

**Key insight:** every piece of low-level mechanism this phase needs (OS Keychain access,
correlated async request/response over a byte stream) already has either a proven crate
(`keyring`) or a proven in-repo pattern (`SidecarState`'s pending-map) to copy. The actual
engineering work is wiring, not invention.

## Runtime State Inventory

*(Not applicable — this is a greenfield feature addition, not a rename/refactor/migration
phase. Skipped per the template's own trigger condition.)*

## Common Pitfalls

### Pitfall 1: Assuming `isEncryptionAvailable()` has a keyring-crate equivalent

**What goes wrong:** Planning a direct 1:1 port of `safeStorage.isEncryptionAvailable():
boolean` onto some `keyring`-crate static call.
**Why it happens:** Electron's `safeStorage` API happens to expose that shape; `keyring`
does not — availability is only knowable by attempting a real operation and inspecting its
`Result`.
**How to avoid:** Design `isAvailable()` (the sidecar's `TokenStore` implementation) as "did
the last real Keychain operation succeed, or fail with a class of error that means
'available but no entry yet' (i.e. `NoEntry`) rather than 'the backend itself is
unreachable' (`PlatformFailure`/`NoStorageAccess`)." A first-run cold sign-in has no
existing entry — `NoEntry` there must NOT be classified as "unavailable" (that would
incorrectly block sign-in forever), while `PlatformFailure`/`NoStorageAccess` on a
`get_password` attempt correctly does mean "treat as unavailable, clean signed-out" (D-06).
**Warning signs:** A signed-out state that never resolves on first login on a machine where
the Keychain works fine — usually means `NoEntry` was misclassified as "unavailable."

### Pitfall 2: The dropped-frame gap (verified, not hypothetical)

**What goes wrong:** Building the new `rustInvoke` channel on top of `main.rs`'s existing
reader loop without adding an explicit new branch, assuming "if kind is passed through as
JSON, Rust must already read it somehow."
**Why it happens:** SEAM.md and CONTEXT.md's own language ("today `ElectronStubTransport`
is fire-and-forget only") reads as "the fire-and-forget direction works, it just doesn't
wait for an answer" — which is true for the *sidecar's write side*, but false for whether
Rust does anything with what it receives. Direct code read of `main.rs`'s `start_reader()`
function (current repo state) confirms: a frame with neither an `"ok"` key nor
`kind == "frontendMessage"` is parsed, matched against both `if`s, and falls through to
the next loop iteration with **no action taken** — confirmed independently by
27-02-SUMMARY.md line 102/154 ("the frame is currently silently ignored on the Rust side")
and by 27-05-SUMMARY.md, which records that the live-launch gate step was never actually
reached (blocked upstream by the exact keyring stub this phase fixes) — so this was never
caught by a real hardware run either.
**How to avoid:** Treat "wire the Rust-side reader to act on `kind: 'rustInvoke'`" as a
required, first-class task — not an assumed side effect of adding the TypeScript side.
**Warning signs:** A `requestRustInvoke()` call that never resolves and never times out
without an explicit timeout guard (mirroring Rust's own `INVOKE_TIMEOUT`) — this is exactly
what a dropped frame with no timeout looks like from the sidecar's side.

### Pitfall 3: Keychain entry naming collides with — or accidentally reuses — spike 011's probe values

**What goes wrong:** Copying spike 011's literal `service = "com.gamelib.spike011"` /
`account = "steam-refresh-token"` constants into production code.
**Why it happens:** They're right there in the proven, working `main.rs` reference.
**How to avoid:** Choose a production-appropriate, stable service identifier (e.g. matching
the app's bundle id or a `com.gamelib.<purpose>` convention distinct from the spike's
explicitly-named probe value) before shipping — the spike's values were deliberately named
to be obviously throwaway (`spike011`) and were cleaned up (`delete_credential`) after each
run.
**Warning signs:** A Keychain entry literally named "spike011" surviving in a shipped build.

### Pitfall 4: Treating a Keychain re-prompt on rebuild as a bug to work around

**What goes wrong:** Adding a dev-only bypass (env var, mock keyring, in-memory fallback)
"just for local iteration speed" when the Keychain prompts again after every unsigned
`cargo build`.
**Why it happens:** macOS Keychain ACLs are keyed to the accessing binary's code-signing
identity; an ad-hoc/unsigned dev build's identity effectively changes across rebuilds, so
"Always Allow" doesn't reliably stick.
**How to avoid:** This is explicitly accepted, locked friction (D-08) — do not build an
opt-out. The real fix (stable signing identity) is scoped to the packaging phase.
**Warning signs:** Any new environment variable or config flag that changes
keyring-vs-plaintext behavior.

## Code Examples

### Verified: spike 011's proven Keychain round-trip (literal, already compiled + run)

```rust
// Source: .planning/spikes/011-electron-api-parity-in-tauri/parity-probe/src/main.rs
fn keyring_roundtrip(service: &str, account: &str, secret: &str) -> keyring::Result<String> {
    let entry = keyring::Entry::new(service, account)?;
    entry.set_password(secret)?;
    let got = entry.get_password()?;
    let _ = entry.delete_credential(); // clean up the probe secret
    Ok(got)
}
```
This exact call shape (`Entry::new` → `set_password` → `get_password` →
`delete_credential`) is what production `dispatch_rust_channel`'s `keyring_set`/
`keyring_get`/`keyring_delete` arms should call — the only change needed is
production-appropriate `service`/`account` values (Pitfall 3) and proper `Result` → JSON
error-string mapping instead of the spike's `println!`.

### Verified: the existing correlated-request pattern to mirror (Rust→sidecar direction)

```rust
// Source: src-tauri/src/main.rs (current repo state) — SidecarState::invoke
fn invoke(&self, channel: String, args: Vec<Value>) -> Result<Value, String> {
    let id = self.next_id();
    let (tx, rx) = mpsc_channel::<Result<Value, String>>();
    { self.pending.lock().map_err(|e| e.to_string())?.insert(id.clone(), tx); }
    let req = SidecarRpcRequest { id: id.clone(), kind: "invoke", channel, args };
    if let Err(e) = self.write_frame(&req) { /* cleanup + return Err */ }
    match rx.recv_timeout(INVOKE_TIMEOUT) { /* resolve or time out */ }
}
```
The new sidecar-side `requestRustInvoke()` (Pattern 1 above) is this same shape, just
implemented in TypeScript with a `Map` instead of a `HashMap<String, Sender<...>>` and a
`Promise` instead of an `mpsc::Receiver`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `keyring` v2.x `delete_password` | `keyring` v3.x `delete_credential` (v2's `delete_password` renamed) | keyring v3 release | Naming only — no behavior change; matters only if any stale v2-era code/docs are consulted during implementation `[CITED: docs.rs release notes summary via WebSearch]` |
| `keyring` v3 (this phase's pinned version) | `keyring` v4.1.5 exists on crates.io as of this session `[VERIFIED: crates.io API]` | Unknown exact date — after spike 011 was run | Not adopted this phase — v3 stays pinned for continuity with the proven spike; v4 evaluation is a follow-up, not folded in here (see Alternatives Considered) |

**Deprecated/outdated:** None directly relevant — the spike's dependency choices remain
current enough (v3 is still a maintained, actively-published major version, not an
abandoned one).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | macOS Keychain failures (locked / denied prompt / no backend) all surface through `keyring`'s `Error::PlatformFailure` or `Error::NoStorageAccess` variants rather than a distinct "denied" variant — the crate's public docs describe the 7 variants generically but do not give an exhaustive macOS-specific OSStatus→variant mapping table; this was not independently confirmed by reading the crate's actual macOS backend source (fetch attempts against the GitHub source returned 404s in this session) | Standard Stack, Common Pitfalls #1 | If a specific macOS failure actually surfaces as a different variant than assumed, D-06's error classification logic could misroute (e.g. classify a genuinely-denied prompt as "no entry yet" and retry-loop, or vice versa). Low-likelihood, low-blast-radius — worth a quick manual test during implementation (deny a real Keychain prompt once and log the exact `Error` variant/message received) before finalizing the classification logic. |
| A2 | The production Keychain entry's `service`/`account` naming convention is unspecified by CONTEXT.md — this research recommends a `com.gamelib.*`-style convention distinct from spike 011's throwaway probe values, but the exact string is a planner/implementer choice, not a locked decision | Common Pitfalls #3 | Low risk — any reasonable stable identifier works; only matters if it collides with something else or is inconsistently named across the three keyring operations |
| A3 | `keyring`'s `apple-native` Cargo feature does not break a hypothetical future Linux/Windows Cargo build of `src-tauri` (i.e., it's platform-gated internally rather than unconditionally pulling macOS-only deps) — not independently verified this session; the project is macOS-only for this phase per CONTEXT.md scope, so it is not currently exercised, but a later cross-platform phase should re-check this | Package Legitimacy Audit, Standard Stack | If wrong, a future Windows/Linux Tauri build phase would need to conditionally gate the `keyring` dependency/feature per-target in `Cargo.toml` — an easy fix, not an architectural problem, but worth flagging so it isn't rediscovered from scratch |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Exact macOS OSStatus → `keyring::Error` variant mapping for "user denied the prompt" vs. "keychain locked" vs. "no keychain at all."**
   - What we know: the crate's public `Error` enum has 7 non-exhaustive variants; `PlatformFailure` wraps "runtime failure in the underlying platform storage system," `NoStorageAccess` is "underlying secure storage holding saved items could not be accessed."
   - What's unclear: whether these map 1:1 to specific `errSecUserCanceled`/`errSecInteractionNotAllowed`/`errSecAuthFailed` OSStatus codes, or whether all three flatten to the same variant.
   - Recommendation: during implementation, write a small manual/human-verify step — trigger a real "Deny" on a Keychain prompt on the dev machine and log the exact `Error` debug-format output — before finalizing D-06's classification logic. This is cheap (one manual click) and removes A1's uncertainty entirely.

2. **Should the pre-existing `openExternal` dropped-frame gap be fixed as its own frame kind, or folded into the new generic `rustInvoke` channel?**
   - What we know: `openExternal` today is fire-and-forget (no response expected by the sidecar) and is currently non-functional on the Rust side (Pitfall 2). The new `rustInvoke` kind is request/response.
   - What's unclear: whether fixing `openExternal` by literally converting it to a `rustInvoke`-shaped call (so launch failures could surface a real error back to the sidecar/renderer, which they currently cannot) is in scope for this phase, or whether a minimal fix (just add the missing `kind == "openExternal"` dispatch branch, keep it fire-and-forget) is preferred to keep the diff scoped to Phase 28's stated boundary (keyring + the new channel).
   - Recommendation: the planner should decide explicitly rather than let it fall out incidentally. Minimal fix (add the missing dispatch branch, keep fire-and-forget semantics) is lower-risk and keeps this phase's diff bounded to its stated scope; converting `openExternal` to request/response is arguably better long-term but is scope creep unless the user explicitly wants it folded in.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `cargo`/`rustc` | Building `src-tauri` with the new `keyring` dependency | ✓ | rustc 1.94.1 / cargo 1.94.1 `[VERIFIED: rustc --version]` | — |
| `keyring` crate resolution (network access to crates.io) | Adding the dependency | ✓ (already resolved once by spike 011's own `Cargo.lock`) | 3.6.3 `[VERIFIED: cargo tree]` | — |
| macOS Keychain (Security.framework) | The actual round-trip proof | ✓ (this is a macOS dev machine; spike 011 already proved this live) | — | — |
| Rust CI wiring (cargo build/test in `.github/workflows/`) | Automated gate for the new Rust code | ✗ — no workflow currently runs `cargo`/`tauri`/`rust` `[VERIFIED: grep across .github/workflows/*.yml found none]` | — | Local-only verification (`cargo build`, `cargo test` if added) for this phase; CI wiring is out of scope (matches the phase's macOS-dev-only framing and D-08's "packaging phase" deferral) |
| `slopcheck` Cargo.toml scanning | Package Legitimacy Audit automation | ✗ — `slopcheck` is installed but only supports npm/pip-style manifests (`install`/`scan` subcommands), no Cargo mode `[VERIFIED: slopcheck --help]` | 1.x (unspecified) | Legitimacy established manually via crates.io API + existing spike-011 proof instead |

**Missing dependencies with no fallback:** None — this phase has no blocking missing
dependency.

**Missing dependencies with fallback:** Rust CI gating (falls back to local-only
verification, matching the phase's stated macOS-dev scope); `slopcheck` Cargo scanning
(falls back to manual crates.io verification, already performed above).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (TypeScript/Node side) | Jest 29.7.0 + ts-jest 29.3.2 (already configured, `jest.config.js`) `[VERIFIED: package.json + jest.config.js]` |
| Framework (Rust side) | None configured yet — `src-tauri` has no `#[test]` modules or `cargo test` wiring today `[VERIFIED: grep across src-tauri/src found no existing test]` |
| Config file (TS) | `jest.config.js` (repo root); `projects: ['src/backend', 'src/frontend', 'src/preload', 'meta']` — `src/backend` covers the sidecar tests this phase extends |
| Config file (Rust) | none — see Wave 0 Gaps |
| Quick run command (TS) | `npx jest src/backend/sidecar/__tests__/<newfile>.test.ts` |
| Quick run command (Rust) | `cd src-tauri && cargo build` (compile-gate only, until tests are added) |
| Full suite command | `npm run test:ci` (Jest, `--runInBand --silent`); `cd src-tauri && cargo build` (Rust — no `cargo test` target exists yet) |

### Phase Requirement → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-28-05 (new channel) | A `rustInvoke` request from the sidecar reaches Rust's dispatcher and a correlated response returns | integration (Jest, in-process, mirrors `skeletonFlows.test.ts`'s real-tmpdir pattern) | `npx jest src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` | ❌ Wave 0 |
| REQ-28-01/D-01 (keyring round-trip) | A token set via the new channel is retrievable byte-identical, and deletable | **manual/human-verify only** — a Jest test can exercise the TypeScript-side frame plumbing against a stubbed Rust responder, but the REAL macOS Keychain round-trip requires the compiled Tauri binary running on real hardware (matches this project's established pattern for every prior Keychain/Steam-hardware claim — Phase 24's Gate 0-3, Phase 21's UAT) | `cargo build && cargo run` (manual click-through) | ❌ Wave 0 (no Rust test harness exists yet) |
| REQ-28-06/D-06 (honest-unavailable) | A `NoEntry`/`PlatformFailure` outcome maps to a clean signed-out state, never a plaintext write | unit (Jest, sidecar TokenStore selection logic) + **manual/human-verify** (real Keychain "Deny" click, per Open Question 1) | `npx jest src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` | ❌ Wave 0 |
| REQ-28-02/D-04 (Electron untouched) | `steamConfigStore.json`'s `refreshToken` value is byte-identical before/after a Tauri run touching the keyring path | integration (Jest, real-tmpdir-style — **must snapshot + restore the real file**, since this repo's existing convention (`bootstrap.test.ts`) reads/writes the developer's REAL `~/Library/Application Support/GameLib/...` directory, not an isolated fixture — no env-var override exists in `pathShim.ts` for darwin) | `npx jest src/backend/sidecar/__tests__/electronUntouched.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Jest quick-run for whichever file changed (TS side); `cargo build` (Rust side, compile-gate only until `cargo test` exists).
- **Per wave merge:** `npm run test:ci` full suite; `cargo build` clean.
- **Phase gate:** Full Jest suite green + `cargo build` clean + the manual Keychain round-trip
  click-through (REQ-28-01) + the manual "Deny" click (Open Question 1) before
  `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` — covers REQ-28-05 (new
  channel's TypeScript-side framing; can stub the Rust side entirely since this is a
  transport-shape test, not a Keychain test).
- [ ] `src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` — covers REQ-28-06 (the
  `TokenStore` selection/classification logic — Electron path vs. sidecar path — using a
  fake/mocked keyring responder, not the real Keychain).
- [ ] `src/backend/sidecar/__tests__/electronUntouched.test.ts` — covers REQ-28-02/D-04; must
  snapshot+restore `steamConfigStore.json` around the assertion since this repo's test
  convention operates on the real config directory, not a sandboxed tmpdir (verified by
  reading `bootstrap.test.ts` — no `HOME`/`XDG_CONFIG_HOME`/`APPDATA` override exists for
  darwin in `pathShim.ts`).
- [ ] No Rust test harness (`cargo test`) exists yet in `src-tauri` — if the planner wants
  automated (non-manual) coverage of the `keyring` dispatch arm itself, a `#[cfg(test)]`
  module needs to be added; otherwise this stays a `cargo build` compile-gate plus the
  manual click-through described above (consistent with this project's established pattern
  of deferring real-hardware Keychain/Steam proofs to human-verify checkpoints, e.g. Phase
  24's Gates 0-3).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (this phase touches storage of an already-issued token, not the auth flow itself — login channels stay out of scope per D-03) | — |
| V3 Session Management | Partial | The refresh token IS session-equivalent material; D-04's hard isolation between Electron's and the sidecar's storage is the control here — no shared mutable session state across the two builds |
| V4 Access Control | No | Not applicable — single-user local app, no privilege boundary this phase touches |
| V5 Input Validation | Yes | The new `rustInvoke` channel's `channel`/`args` fields must be treated the same way the existing `invoke` frames already are — `isValidRequest()`'s existing shape checks extend naturally; no new renderer-facing surface (the sidecar, not the renderer, is the one issuing these frames) |
| V6 Cryptography | Yes — but delegated, never hand-rolled | The `keyring` crate (backed by macOS Security.framework) IS the cryptographic control; D-01 explicitly forbids reimplementing OSCrypt. Do not add any custom encryption layer on top of what the Keychain already provides. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Sidecar corrupts Electron's session by writing a non-OSCrypt value under `TOKEN_STORE_KEY` | Tampering | D-04 — sidecar's `TokenStore` implementation must have zero code paths that call `configStore.set(TOKEN_STORE_KEY, ...)`; verified by REQ-28-02's byte-comparison test above, and enforceable further by a lint/grep check (no `TOKEN_STORE_KEY` import in the sidecar-only `SidecarKeyringTokenStore` module) |
| Silent plaintext persistence on Keychain failure | Information Disclosure | D-06 — every failure path in the sidecar's `TokenStore` must resolve to "no token" (empty string / clean signed-out), never fall through to a plaintext write, unlike Electron's current `encryptToken()` fallback (D-11 leaves that asymmetry as-is, out of scope to fix this phase) |
| A hung/unresponsive Rust-side keyring dispatch wedges the sidecar indefinitely | Denial of Service | The new `requestRustInvoke()` needs its own timeout (mirroring Rust's existing `INVOKE_TIMEOUT` constant, 60s) — Pitfall 2's "never resolves and never times out" warning sign is exactly this failure mode |
| Malformed/oversized frames on the new channel | Denial of Service | Reuse the existing `MAX_LINE_LENGTH` (10 MiB) guardrail already in `sidecarRpc.ts` — it protects the newline-delimited framing generically, not per-kind, so no new guard is needed here, just don't bypass it |

## Sources

### Primary (HIGH confidence)
- Direct code read of `src-tauri/src/main.rs`, `src/backend/sidecar/{electronStub,bootstrap,sidecarRpc}.ts`, `src/common/types/sidecarTransport.ts`, `src/backend/storeManagers/steam/{user,constants,electronStores}.ts`, `src/backend/sidecar/{pathShim,fileStore}.ts` — all read in full this session.
- `.planning/spikes/011-electron-api-parity-in-tauri/{README.md,parity-probe/src/main.rs,parity-probe/Cargo.toml}` — the proven `keyring` round-trip.
- `.planning/phases/27-tauri-shell-walking-skeleton/{SEAM.md,27-CONTEXT.md,27-01..05-SUMMARY.md}` — confirmed the dropped-openExternal-frame gap directly (27-02-SUMMARY.md) and that it was never live-tested (27-05-SUMMARY.md).
- crates.io API (`https://crates.io/api/v1/crates/keyring`) — version/downloads/repo `[VERIFIED]`.
- `cargo tree` run in this session against spike 011's own `Cargo.toml` — confirms `keyring 3.6.3` resolves cleanly with `security-framework 3.7.0`.

### Secondary (MEDIUM confidence)
- docs.rs pages for `keyring` v3.6.3 (`Entry` API, `Error` enum variant list, `apple-native`
  feature description, thread-safety notes) — fetched via WebFetch; content was
  summarized/paraphrased by the fetch tool rather than quoted verbatim in all cases.
- WebSearch results confirming `delete_password` → `delete_credential` rename between v2 and
  v3, and the general shape of the `Error` enum.

### Tertiary (LOW confidence)
- The exact macOS OSStatus → `keyring::Error` variant mapping (Assumption A1, Open Question
  1) — attempts to fetch the crate's actual `macos.rs`/apple-backend source from GitHub
  returned 404s in this session; the mapping is inferred from the crate's generic
  documentation, not confirmed against source.

## Metadata

**Confidence breakdown:**
- Standard stack (keyring crate choice/version): HIGH — already compiled and run live by spike 011, independently re-confirmed against crates.io's own API this session.
- Architecture (the new transport leg, including the discovered dropped-frame gap): HIGH — based on direct, full reads of the actual current `main.rs`/`sidecarRpc.ts`/`electronStub.ts` source plus corroborating written admissions in 27-02-SUMMARY.md and 27-05-SUMMARY.md, not inference.
- Pitfalls (keyring error-mapping specifics): MEDIUM — the general Error enum shape is confirmed via docs.rs, but the exact macOS-specific OSStatus mapping was not confirmed against source (flagged as Assumption A1 / Open Question 1).

**Research date:** 2026-07-22
**Valid until:** ~30 days (stable — the underlying crate/Tauri APIs are not fast-moving; the
in-repo architecture facts (main.rs's current gap) are valid until this phase or an
adjacent one changes that file)
