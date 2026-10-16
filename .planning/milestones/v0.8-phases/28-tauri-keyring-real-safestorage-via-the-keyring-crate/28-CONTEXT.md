# Phase 28: Tauri keyring — real `safeStorage` via the `keyring` crate - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the Tauri sidecar's plaintext-passthrough `safeStorage` stub
(`src/backend/sidecar/electronStub.ts:136`) with a real OS-Keychain–backed token
store, so the sidecar persists and retrieves the Steam refresh token securely and
can never corrupt the Electron build's session.

**In scope:**
- A real Keychain-backed token store for the sidecar, using the `keyring` crate
  (`apple-native`), per spike 011's proven path.
- A **sidecar→Rust request/response channel** — new transport infrastructure, since
  only a fire-and-forget sidecar→Rust direction exists today.
- Honest availability reporting: when the Keychain is unavailable, the sidecar
  reaches a clean signed-out state rather than lying or writing plaintext.
- A verifiable round-trip proof plus a proof that Electron's stored session is
  untouched after a Tauri run.

**Explicitly OUT of scope:**
- Any reimplementation of Chromium's OSCrypt ciphertext format (see D-01).
- Migrating the existing Electron session's token into the sidecar (see D-02).
- Porting `startQRLogin`/`startCredentialLogin` or any other login channel — which
  means Phase 27's UAT steps 2/3 remain blocked after this phase (see D-03).
- Windows/Linux Tauri packaging, code signing, notarization (Phase 33-ish).

</domain>

<decisions>
## Implementation Decisions

### Token format & storage

- **D-01 — Keyring-native, NOT OSCrypt-compatible.** Store the refresh token as its
  own Keychain entry via the `keyring` crate (spike 011's literal proven path). Do
  **not** reimplement Electron's `safeStorage` ciphertext format.

  *Rationale (established during discussion — do not re-derive):* Electron's
  `safeStorage` on macOS does **not** store the token in the Keychain. It stores a
  master password there (generic-password item `"<AppName> Safe Storage"`), then
  writes Chromium OSCrypt `v10` ciphertext into `configStore` — AES-128-CBC under
  PBKDF2-HMAC-SHA1(password, salt `saltysalt`, **1003** iterations, 16 bytes), IV =
  16 × `0x20`. Spike 011 proved a *plain* `keyring` round-trip, which is a different
  storage location and a different format. Reading "the same ciphertext Electron
  wrote" (the ROADMAP.md phrasing) would require hand-rolling OSCrypt byte-for-byte —
  the same silent-garbage failure mode already hit in 27-05. Additionally OSCrypt is
  three different algorithms: macOS and Linux share AES-128-CBC (differing only in
  iteration count, 1003 vs 1, plus `v11`/libsecret vs `v10`/`"peanuts"` fallback),
  while Windows is AES-256-GCM with a DPAPI-wrapped key in a Local State file, where
  the `keyring` crate provides no reuse at all. Keyring-native is uniform across all
  three platforms.

- **D-04 — HARD CONSTRAINT: the sidecar must never write `TOKEN_STORE_KEY` into the
  shared `configStore`.** The sidecar and Electron share one store by design
  (`pathShim` resolves `userData` to the same folder). Any sidecar write under that
  key — plaintext, a keyring handle, or anything not valid OSCrypt `v10` — makes
  Electron fail its Keychain decrypt and silently sign the user out. This closes
  SEAM.md §2's documented write-direction trap **by construction** rather than by
  discipline. Electron's existing session must be provably untouched after a Tauri
  run.

### Migration & provability

- **D-02 — No migration. Re-login in Tauri.** The existing Electron token is not
  imported. The Tauri build simply starts signed-out; a future fresh login writes a
  keyring-native token. Explicitly rejected: (a) a one-time OSCrypt import (would
  reintroduce the hand-rolled crypto D-01 avoids), and (b) having the Electron build
  mirror its natively-decrypted token into the keyring entry (clever, but expands the
  phase into shipping Electron code).

- **D-03 — Proof shape: synthetic round-trip only.** This phase proves a token
  round-trips byte-identical through the real Keychain via the sidecar, and that
  Electron's `configStore` token is untouched. **Phase 27 UAT steps 2/3 explicitly
  DEFER** to whichever phase ports the login channel — the ROADMAP.md claim that
  Phase 28 "unblocks Phase 27's UAT steps 2/3" is superseded by this decision and
  should be corrected when requirements are minted. There is no user-visible change
  this phase; the Tauri window still shows a signed-out library.

### Transport

- **D-05 — Build the sidecar→Rust request/response channel as a deliverable of this
  phase**, treated as reusable infrastructure rather than a one-off. Today
  `ElectronStubTransport` (`electronStub.ts:40-45`) is fire-and-forget only
  (`openExternal: (url) => void`); Rust exposes commands the *renderer* calls, with no
  path for the sidecar to await a Rust answer. Every later port needing a real
  response from Rust (`dialog`, `clipboard`, `notification`, `screen`) is blocked on
  this too, so paying for it here against a small, well-understood consumer is the
  cheap moment. This decision strongly steers D-07 toward the Rust/`keyring` path.

### Failure behavior

- **D-06 — Honest-unavailable → clean signed-out.** When the Keychain is locked, the
  user denies the access prompt, or no backend exists (Linux/CI):
  `isEncryptionAvailable()` returns **false**, token reads yield empty, the app
  reaches a clean signed-out state, and a warning is logged. **The sidecar must never
  persist a plaintext token.** This directly reverses the current stub, whose
  `isEncryptionAvailable: () => true` is the lie that produced 27-05's
  garbage-decrypt.

- **D-08 — No dev escape hatch.** No env-var/in-memory fallback for the dev-loop
  friction. Rationale: macOS Keychain ACLs are keyed to the accessing binary's
  identity, so an unsigned/ad-hoc-signed `cargo build` output re-prompts for Keychain
  access on rebuilds ("Always Allow" doesn't reliably stick). That friction is
  accepted — an opt-out flag is exactly the kind of thing that quietly ends up enabled
  in a shipped build, and the 27-05 lesson is that stubs which lie cost more than they
  save. Real fix is stable signing in the packaging phase.

### Claude's Discretion

- **D-07 — Which process talks to the Keychain.** Rust shell (`keyring` crate; matches
  SEAM.md's incremental-port checklist step 3, mirroring `openExternal`) vs. Node in
  the sidecar (shelling to `/usr/bin/security`, preserving synchronous semantics with
  no new transport). Left to the planner — but **D-05 strongly steers this to Rust.**
  Constraint: whichever wins must keep the Electron build's behavior byte-identical
  and must not require touching the 379 `window.api.*` call-sites.

- **D-09 — Storage shape / whether `user.ts` gets refactored.** Options weighed: a
  small token-store abstraction (`getToken`/`setToken`) with an Electron impl
  (`safeStorage` + `configStore`, unchanged) and a sidecar impl (keyring); or a
  sidecar-only distinct store key that Electron ignores. Planner's call, subject to
  D-04. Note: `safeStorage.encryptString`/`decryptString` and
  `encryptToken`/`decryptToken` are **synchronous**, but their callers
  (`ensureConnected`, `finishAuth`) are already async — so an async accessor is viable
  *if* the abstraction is introduced.

- **D-10 — Shape of the new sidecar→Rust channel.** Generic named-command invoke with
  keyring as first consumer (symmetric with the existing renderer→Rust
  `sidecar_invoke`) vs. keyring-specific. Planner's call; the recorded intent is that
  this channel is reusable infrastructure, not a one-off.

- **D-11 — Whether Electron's plaintext fallback is also removed.** `user.ts`'s
  `encryptToken()` currently warns and writes the token in plaintext when
  `encryptionAvailable()` is false — divergent from D-06. Planner's call whether to
  unify the policy across both builds. Constraints: the sidecar must never persist a
  plaintext token, and any change to the Electron path must not silently sign existing
  users out without it being called out. If left divergent, the two policies live in
  the same file and need a comment or they read as a bug.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The seam this phase extends
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` §2 — the `safeStorage`
  passthrough stub, the live-verified read-direction failure, and the
  write-direction trap D-04 closes. §"Incremental-Port Checklist" step 3 is the
  pattern D-07 weighs. §"Load-Bearing Invariants" A/B are still binding.
- `.planning/phases/27-tauri-shell-walking-skeleton/27-CONTEXT.md` — locked
  architecture decisions carried forward (sidecar boundary, 3-factory bridge,
  additive/reversible invariant).

### Spike blueprint
- `.planning/spikes/011-electron-api-parity-in-tauri/README.md` — full Electron→Tauri
  parity table; `safeStorage` row is the basis for D-01.
- `.planning/spikes/011-electron-api-parity-in-tauri/parity-probe/src/main.rs` — the
  literal proven `keyring_roundtrip()` code (`keyring::Entry::new(service, account)`
  → `set_password` → `get_password` → `delete_credential`).
- `.planning/spikes/011-electron-api-parity-in-tauri/parity-probe/Cargo.toml` — the
  proven dependency line: `keyring = { version = "3", features = ["apple-native"] }`.
- `.planning/spikes/009-node-backend-headless-sidecar/README.md` — the 16-API / 44-file
  / 220-endpoint coupling map (`safeStorage` ×4).
- `.claude/skills/spike-findings-gamelib/SKILL.md` — packaged findings index.

### Existing code this phase touches
- `src/backend/sidecar/electronStub.ts` — `safeStorage` stub at L136 (the swap
  target); `ElectronStubTransport` at L40-45 (the fire-and-forget interface D-05
  extends); `shell.openExternal` at L146 (the forward-to-transport pattern to mirror).
- `src/backend/storeManagers/steam/user.ts` — `encryptionAvailable()` L17,
  `encryptToken()` L25, `decryptToken()` L38 (sync; D-09/D-11 territory);
  `.getCredentials()` L224, `.finishAuth()` L235, `.ensureConnected()` L109 (async
  callers).
- `src/backend/storeManagers/steam/constants.ts` — `TOKEN_PREFIX`, `TOKEN_STORE_KEY`.
- `src/backend/storeManagers/steam/electronStores.ts` — `configStore` (L6), the shared
  store D-04 protects.
- `src-tauri/src/main.rs` — the four existing `#[tauri::command]`s; where the new
  request/response channel and the `keyring` call land.
- `src/common/types/sidecarTransport.ts` — RPC frame shapes + Tauri command-name
  constants the new channel must extend consistently.
- `src/backend/sidecar/bootstrap.ts` — wires `bindTransport()` after the RPC server
  starts; the new channel binds here too.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Spike 011's `keyring_roundtrip()`** — compiles and round-trips the macOS Keychain
  today; near-liftable into `src-tauri/src/main.rs`.
- **`shell.openExternal`'s forward-to-transport pattern** (`electronStub.ts:146` →
  `ElectronStubTransport.openExternal` → `open_external` command →
  `tauri-plugin-opener`) — the exact shape to mirror, except this phase needs the
  return path the pattern currently lacks.
- **`sidecar_invoke`'s renderer→Rust request/response** — an existing symmetric
  reference design for D-10.

### Established Patterns
- `electronStub.ts` gives real behavior only to APIs a wired flow needs; everything
  else is an import-safe no-op. `safeStorage` graduates from no-op to real here.
- SEAM.md's checklist step 3: a new Electron API behavior should be bound to a real
  Tauri command, "rather than leaving it a silent no-op."
- The additive/reversible invariant (REQ-27-06 pattern): `npm start` (Electron) and
  `npm run tauri:dev` must both work after this phase.

### Integration Points
- `bootstrap.ts` → `bindTransport()` — where the extended transport is installed,
  strictly after the RPC server starts and before any handler body can run.
- `user.ts`'s token accessors — the seam where Electron and sidecar policies diverge
  (D-09/D-11).
- `configStore` — shared with Electron; D-04 makes it write-forbidden for the
  sidecar's token.

</code_context>

<specifics>
## Specific Ideas

- The verification must include an explicit **"Electron session untouched"** check —
  Electron's `configStore` token byte-compared before and after a Tauri run — not just
  a keyring round-trip assertion.
- Dev-loop Keychain prompts on rebuild are **accepted, expected behavior** this phase
  (D-08); do not treat a prompt as a bug or design around it.
- The ROADMAP.md Phase 28 entry's claim that this phase unblocks Phase 27 UAT 2/3 is
  **superseded by D-03** — correct it when minting REQ-28-xx.
- Windows OSCrypt behavior was flagged as uncertain during discussion (Chromium does
  AES-256-GCM + DPAPI-wrapped key from Local State; whether Electron wires up that
  Local State file or falls through to raw `CryptProtectData` was not verified). D-01
  makes this **moot** — recorded only so it isn't re-investigated.

</specifics>

<deferred>
## Deferred Ideas

- **Port `startQRLogin`/`startCredentialLogin`** — the login channel that would let a
  user actually sign in inside the Tauri window and thereby unblock Phase 27 UAT
  steps 2/3. Natural next slice after this phase. D-04/D-06 make it safe to wire.
- **Having Electron mirror its token into the keyring** — rejected as a migration
  path (D-02) because it expands scope into shipping Electron code, but it remains a
  clean zero-crypto migration option if a future phase wants seamless carryover.
- **OSCrypt-compatible ciphertext (shared single token across both builds)** —
  rejected by D-01; only revisit if a genuine requirement for simultaneous shared
  sessions emerges.
- **Linux `keyring` backend (libsecret/kwallet) and Windows Credential Manager
  coverage** — keyring-native is uniform in principle, but only macOS is exercised
  here; other platforms land with their packaging phases.
- **Stable ad-hoc dev signing identity** so Keychain ACLs persist across rebuilds —
  rejected here as borrowing from the packaging phase (D-08).

### Reviewed Todos (not folded)
- *Productionize the macOS native Steam bridge* — keyword false-positive; unrelated
  Idea B arc (Phase 24).
- *Steam bottle setup offers GPTK/Wine engines that produce a broken bottle* —
  keyword false-positive; unrelated to token storage.
- *Runtime getProductInfo appinfo dump to lock the osarch parser* — keyword
  false-positive; unrelated to token storage.

</deferred>

---

*Phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate*
*Context gathered: 2026-07-22*
