---
quick_id: 260905-l8g
title: 'Replace keyring_available''s prompting secret read with a non-prompting reachability probe'
date: 2026-09-05
status: complete
commits:
  - 8eba75f9c # the probe, its three guards, and the TS/ledger corrections
source_todo: .planning/todos/completed/2026-08-17-keyring-available-is-a-silent-prompt-channel.md
resolves: 'The "strictly better fix" that todo named three times and never attempted.'
---

# Quick Task 260905-l8g — Summary

## What changed

`keyring_available` no longer raises a Keychain dialog. It used to call `entry.get_password()` on
the caller's **real** slot — a full secret read, prompting exactly like `keyring_get`, while being
documented as a cheap capability probe. It now probes a deliberately-never-written account, which
returns `errSecItemNotFound` immediately: no item, therefore no ACL, therefore no authorization
step and no dialog.

quick-260905-jx3 made that prompt visible and quick-260905-kd0 made the startup gate able to see
it. Both were mitigations of a probe that should never have prompted. This removes the channel.

## The claim "it does not prompt" is MEASURED

A Keychain authorization dialog **blocks until it is answered** — that is why `KEYRING_READ_TIMEOUT`
is 45 seconds. So a probe that returns in milliseconds provably did not raise one, and the claim
becomes machine-checkable rather than an assertion about a screen nobody was watching.

| Read | Elapsed | Outcome |
|---|---|---|
| **New probe** (this task, 4 runs on this machine, 2026-09-05) | **16.28 / 15.12 / 16.75 / 18.08 ms** | `Err(NoEntry)` every time |
| Absent account (prior harness, 2026-07-31) | 40.04 / 102.23 ms | `NoEntry` |
| **Old behaviour** — present account, real slot (prior harness) | **48.87 s / 291.08 s** | Keychain **authorization** error (`-60008`) |

Three to four orders of magnitude. The mechanism was already hardware-measured in this repo by
`keyring_read_timing_hypothesis_absent_vs_present_entry` (`main.rs`); this task added its own
`#[ignore]`d live gate alongside it.

## Why not a metadata-only API

Checked the vendored keyring 3.6.3 source, not the docs:

- `get_attributes()` has **no** macOS override. `credential.rs`'s default calls `self.get_secret()?`
  "for effect" — it prompts identically.
- `macos.rs` routes `get_password`, `get_secret` **and** `get_credential` all through
  `find_generic_password` (`SecKeychainFindGenericPassword`), which returns the secret data and so
  performs the ACL check.

No non-prompting metadata call is reachable through this crate. The absent-account probe is the
portable way to ask the question using only the public API.

## The accepted semantic narrowing

`isAvailable()` conflated "is the backend reachable" with "can we read THIS item". It now answers
only the first — which is what its own source comment and `SidecarHumbleSecretStore`'s have always
claimed it asks. Concretely: a user who **denies** the dialog for a real item used to drive it to
`false`; it now stays `true`. One caller is affected, `humble/user.ts`'s `encryptionDegraded` flag.
Judged correct — denying access to one item does not make the backend unavailable, and a failed
write is reported by `setSecret()`'s own error handling. Accepted deliberately, recorded here.

## The design rests on one property, and three guards hold it

If anything ever writes to the probe account, the probe silently re-acquires an ACL and starts
prompting again — and nothing else in the system would notice.

1. `keyring_account()` rejects the probe account, so no sidecar frame can select it.
2. No allowlisted slot resolves to it (all four checked exhaustively, not sampled).
3. A source-reading test bounds the `keyring_available` arm and forbids
   `set_password`/`set_secret`/`delete_credential` inside it.

RED-proven: **H** — point a real slot at the probe account → 2 failed. **I** — make the arm write
to the probe account → 1 failed. The live gate was re-run afterwards to confirm the account is
still absent (18.08 ms, `NoEntry`).

## A guard that was not running

Two of the three guards were first named `probe_account_...` and `no_allowlisted_slot_...`.
`cargo test keyring` is a **substring filter** and silently excluded both — they reported neither
pass nor fail, and mutation H was caught only by an unrelated pre-existing test, which is what
exposed it. Renamed to start `keyring_`; the suite went 21 → 23 selected, confirming they had been
invisible. The rationale is recorded in the source above the tests, where the next person adding
one will see it. **A guard the project's habitual command cannot select is not a guard.**

## Blast radius: two artefacts asserted the old fact

- The TS announcement said `(may prompt)`, which became false the moment the Rust arm changed. Now
  `(non-prompting reachability probe)`.
- The prompting-channel ledger had `canPrompt: true` and keyed announcement on a boolean. It now
  holds the literal **per channel**, so the two announcing channels cannot drift apart, and
  `keyring_available` is `canPrompt: false`.
- **It stays in Gate A's pattern regardless.** It still makes a boot-time round trip, and it is
  precisely the channel whose regression back to the prompting path a gate would need to catch.
  Dropping it because "it does not prompt any more" would rebuild the blind spot Gate A already
  had once.

## Verification

- `cargo test` — **244 passed, 0 failed, 2 ignored**. `cargo build` — 0 warnings.
- Live gate `cargo test -- --ignored keyring_reachability_probe` — 4 runs, all `NoEntry`, all
  under 19 ms.
- `jest src/backend/{humble,sidecar,storeManagers/steam}` — **116 suites, 3373 passed**.
- `tsc --noEmit` 0. `eslint` 0 errors. `prettier --check` RED after the edit, fixed, re-run green,
  suite re-run after formatting.

## Honest limits

- **macOS only, measured.** The mechanism is argued from the crate source for
  `sync-secret-service` (Linux) and `windows-native`, but only measured on macOS. On Linux a
  locked collection may still raise an unlock prompt for a lookup — that is a backend-unlock
  prompt, not a per-item ACL prompt, and the old code would have hit it too. Not verified on
  hardware.
- **CI runs no cargo step**, so every Rust test named here is hand-run and CI-invisible. The
  `#[ignore]`d live gate is doubly so.
- **Gate A itself still has not been re-run live** end to end. Unchanged from kd0.
- `keyring_set`/`keyring_delete` still have no pre-invoke announcement, and both still prompt.
  Still open, still recorded in the ledger.
