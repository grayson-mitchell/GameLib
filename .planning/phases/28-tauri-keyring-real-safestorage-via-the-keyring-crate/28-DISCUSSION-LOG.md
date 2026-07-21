# Phase 28: Tauri keyring — real `safeStorage` via the `keyring` crate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 28-tauri-keyring-real-safestorage-via-the-keyring-crate
**Areas discussed:** Ciphertext compatibility, Proof / phase scope, Where the crypto runs, Keychain-denied behavior

---

## Area selection

All four offered gray areas were selected: Ciphertext compatibility, Where the crypto
runs, Keychain-denied behavior, Proof / phase scope.

Three scouting findings were surfaced before questioning, because they made the phase
less mechanical than the ROADMAP.md entry implied:

1. Electron's `safeStorage` on macOS stores a *master password* in the Keychain, not
   the token; the token is Chromium OSCrypt `v10` ciphertext inside `configStore`.
   Spike 011 proved a *plain* `keyring` round-trip — a different location and format.
2. `safeStorage.encryptString`/`decryptString` and `encryptToken`/`decryptToken` are
   synchronous; the sidecar→Rust transport is fire-and-forget one-way only.
3. All three `todo.match-phase` hits were keyword false-positives — none folded.

---

## Ciphertext compatibility

**Clarifying question from user, before answering:** *"Does the OSCrypt format differ
across macOS/Windows/Linux?"*

Answered with a per-platform breakdown: macOS = `v10`, AES-128-CBC, PBKDF2-HMAC-SHA1
(salt `saltysalt`, **1003** iters, 16B), IV 16×`0x20`, Keychain generic-password
`"<App> Safe Storage"`. Linux = same algorithm but **1 iteration**, `v10` (fallback
password `"peanuts"`) or `v11` (libsecret/kwallet). Windows = entirely different —
AES-256-**GCM**, random key DPAPI-wrapped in a Local State file, 12-byte inline nonce +
16B tag, and the `keyring` crate offers zero reuse there (it targets Credential
Manager, not DPAPI). Electron's exact Windows behavior was flagged as unverified.

The first-pass question was reformulated after this clarification to carry the
per-platform cost into the options.

| Option | Description | Selected |
|--------|-------------|----------|
| OSCrypt-compatible, macOS now | Reimplement Chromium's macOS v10 scheme so both builds share one token; Linux a later one-constant delta, Windows its own chunk | |
| OSCrypt-compatible, mac+Linux | Same, covering Linux's v10/v11 now while the crypto is fresh | |
| Keyring-native + migration | Token as its own Keychain entry via the keyring crate; uniform across platforms, no hand-rolled crypto; costs a divergent token + a migration | ✓ |
| Keyring-native + compat read | Write keyring-native, implement OSCrypt decrypt read-only | |

**User's choice:** Keyring-native + migration
**Notes:** Avoids hand-rolling Chromium crypto entirely — the same silent-garbage
failure class already hit in 27-05. Accepted cost: Electron and Tauri hold separate
tokens.

---

## Migration path (follow-up within Ciphertext)

Surfaced that "migration" had three quite different meanings, including one that
requires no OSCrypt reimplementation anywhere: let the *Electron* build do the decrypt
natively and mirror the result into the keyring entry.

| Option | Description | Selected |
|--------|-------------|----------|
| Electron mirrors on startup | Electron decrypts with real safeStorage, writes the keyring entry; zero crypto reimplemented; costs touching shipping Electron code | |
| Re-login in Tauri | No migration; Tauri starts signed-out and a fresh login writes a keyring-native token | ✓ |
| One-time OSCrypt import | Sidecar/Rust decrypts the v10 blob once; self-contained but reintroduces hand-rolled crypto | |

**User's choice:** Re-login in Tauri
**Notes:** Cheapest, zero crypto, zero Electron changes. Flagged in response that this
moves the phase's goalposts — the ROADMAP.md claim about unblocking UAT 2/3 no longer
holds, since signing in inside Tauri needs an unported login channel. Upside noted:
this closes SEAM.md's write-direction trap *by construction*.

---

## Proof / phase scope

| Option | Description | Selected |
|--------|-------------|----------|
| Pull in the login channel | Also wire startQRLogin/startCredentialLogin so sign-in works in the Tauri window and UAT 2/3 genuinely unblock | |
| Synthetic round-trip only | Prove the keyring path with a real write-then-read through the sidecar + Electron's configStore token verified untouched; UAT 2/3 defer | ✓ |
| Keyring + honest availability | Synthetic round-trip plus making the stub honest so Tauri reaches a clean signed-out state | |

**User's choice:** Synthetic round-trip only
**Notes:** Keeps the phase small. UAT 2/3 explicitly defer to the login-channel phase.
(Honest availability was subsequently chosen anyway under the denied-behavior area, so
the substance of option 3 is in scope regardless.)

---

## Storage shape (follow-up within Ciphertext)

Flagged that keyring-native changes *where the token lives*, so `configStore` stops
being the index — and that the tempting shortcut (stash the secret in the keyring,
return an opaque handle to store in `configStore`) reopens the write-direction trap in
a new disguise.

| Option | Description | Selected |
|--------|-------------|----------|
| Keyring only, abstract the accessor | Token-store abstraction in user.ts with Electron and sidecar impls | |
| Keyring only, separate store key | Sidecar writes under a different key Electron ignores | |
| You decide | Planner picks, with the hard constraint recorded | ✓ |

**User's choice:** You decide
**Notes:** Hard constraint recorded — the sidecar must never write `TOKEN_STORE_KEY`
into the shared `configStore`, and Electron's session must be provably untouched.

---

## Where the crypto runs

| Option | Description | Selected |
|--------|-------------|----------|
| Rust shell (keyring crate) | Spike 011's proven path; matches SEAM.md checklist step 3; requires a new sidecar→Rust request/response channel | |
| Node in the sidecar | Shell out to /usr/bin/security; no new transport, keeps sync semantics; macOS-only, diverges from the proven path | |
| You decide | Planner weighs transport cost against divergence | ✓ |

**User's choice:** You decide
**Notes:** Effectively steered to Rust by the transport answer immediately following.

---

## Transport investment (follow-up within Where the crypto runs)

| Option | Description | Selected |
|--------|-------------|----------|
| Build it — reusable infra | Treat the bidirectional channel as a phase deliverable; later ports (dialog/clipboard/notification/screen) need it too | ✓ |
| Avoid it — keep this small | Prefer whichever approach needs no new transport | |
| No preference | Decide purely on implementation simplicity | |

**User's choice:** Build it — reusable infra
**Notes:** Paying for the channel here, against a small well-understood consumer, was
judged the cheap moment.

---

## Transport shape (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Generic invoke, keyring as first consumer | General named-command request/response, symmetric with the existing renderer→Rust sidecar_invoke | |
| Keyring-specific, generalize later | One command, smallest change | |
| You decide | Planner picks the shape; intent recorded | ✓ |

**User's choice:** You decide
**Notes:** Recorded intent — reusable infrastructure, not a one-off.

---

## Keychain-denied behavior

Context surfaced first: macOS Keychain ACLs are keyed to the accessing binary's
identity, so an unsigned/ad-hoc-signed `cargo build` output re-prompts on rebuilds and
"Always Allow" doesn't reliably stick. Denied/prompted is therefore the daily dev
experience until signing lands, not an edge case.

| Option | Description | Selected |
|--------|-------------|----------|
| Honest unavailable → signed-out | isEncryptionAvailable() false, empty reads, clean signed-out state, warning logged; never persists plaintext | ✓ |
| Match Electron's fallback | Mirror user.ts's warn-then-plaintext behavior | |
| Hard error, surface to user | Treat unavailability as fatal for the auth path | |

**User's choice:** Honest unavailable → signed-out
**Notes:** Directly reverses the current stub's `isEncryptionAvailable: () => true`,
which is the lie that produced 27-05's garbage-decrypt.

---

## Electron parity for the plaintext fallback (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Sidecar only — leave Electron alone | Keeps the phase additive; two policies in one file | |
| Remove the plaintext fallback everywhere | One rule, better posture; changes shipping Electron behavior | |
| You decide | Planner picks, with intent recorded | ✓ |

**User's choice:** You decide
**Notes:** Constraints recorded — sidecar never persists plaintext; any Electron-path
change must not silently sign existing users out without being called out.

---

## Dev-loop escape hatch (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| No escape hatch | Live with the prompt; it exercises the real path every run | ✓ |
| Env-var in-memory fallback | GAMELIB_KEYRING=memory for the dev loop | |
| Stable dev signing identity | Ad-hoc signing so the ACL persists across rebuilds | |

**User's choice:** No escape hatch
**Notes:** An opt-out flag is the kind of thing that quietly ends up enabled in a
shipped build; the 27-05 lesson is that stubs which lie cost more than they save.

---

## Claude's Discretion

- **D-07** — which process talks to the Keychain (Rust vs Node-in-sidecar); strongly
  steered to Rust by D-05.
- **D-09** — storage shape and whether `user.ts` gets a token-store abstraction.
- **D-10** — generality of the new sidecar→Rust channel.
- **D-11** — whether Electron's plaintext fallback is removed alongside the sidecar's.

## Deferred Ideas

- Port `startQRLogin`/`startCredentialLogin` — would genuinely unblock Phase 27 UAT
  steps 2/3.
- Electron-mirrors-token migration — rejected here, but a clean zero-crypto option if
  seamless carryover is ever wanted.
- OSCrypt-compatible shared ciphertext — rejected by D-01; revisit only if simultaneous
  shared sessions become a requirement.
- Linux/Windows keyring backend coverage — lands with their packaging phases.
- Stable ad-hoc dev signing identity — borrowed work from the packaging phase.
