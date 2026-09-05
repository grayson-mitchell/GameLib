---
quick_id: 260905-jx3
title: 'Log the keyring_available success path — make a successful probe visible in gamelib.log'
date: 2026-09-05
status: complete
commits:
  - 0fdbdac36 # fix: the logging change + 10 tests
source_todo: .planning/todos/pending/2026-08-17-keyring-available-is-a-silent-prompt-channel.md
resolves: 'Direction item 1 only. Item 2 remains open and deferred — the todo file stays open.'
---

# Quick Task 260905-jx3 — Summary

## What was wrong

`keyring_available` is not a cheap capability probe. Its Rust handler calls `entry.get_password()`
(`src-tauri/src/main.rs:5369-5386`), so a fresh probe raises a real macOS Keychain approval prompt
exactly as `keyring_get` does — but `fetchAvailable()` logged **only** in its `catch`. A successful
probe prompted the user and left no trace whatsoever in `gamelib.log`.

Two consequences, and the second is the one that mattered:

1. A real, user-visible Keychain prompt was unattributable after the fact.
2. Every absence-grep over `issuing keyring_get` — including `260817-d61`'s Gate A, a
   correctly-computed, RED-proven, non-vacuous gate — was structurally blind to a prompt raised
   through this channel. It measured a property narrower than the one it appeared to guard.

## What shipped

Mirrors `fetchToken()`'s existing shape, line for line, so the two prompting channels cannot drift
apart in what they record:

- INFO `issuing keyring_available (may prompt) trigger=<label>` **before** the invoke. INFO rather
  than DEBUG because DEBUG output is settings-dependent, and a line that may not be written is no
  better than no line.
- INFO `keyring_available ok available=<bool> trigger= elapsed=<n>ms` on success, on **both**
  outcomes. A successful `false` is D-06's honest unavailable — a completed probe that already
  prompted — not an error, and not a reason to stay silent.
- `trigger=`/`elapsed=` **appended** to the existing catch warning after its pre-existing
  `failed: <msg>` text, never reordered or renamed, so every grep substring that already targeted
  that line stays load-bearing verbatim.
- DEBUG cache-hit and joined-in-flight lines in `isAvailable()`, mirroring `readToken()`'s. Without
  these, a run with zero Keychain prompts is ambiguous between "no probe was issued" and "a probe
  was issued earlier and this call was served from memory" — the absence of an issue line proves
  neither.
- An OPTIONAL `context?: string` trigger label threaded through `TokenStore.isAvailable()` and
  `HumbleSecretStore.isAvailable()`. Optional, so no implementer changes arity: `ElectronTokenStore`,
  `DevVaultTokenStore` and `ElectronHumbleSecretStore` cannot prompt and keep their zero-arg bodies.

## Verification

**10 tests added, every one RED-proven by reverting the exact line it covers.** Five mutations, each
failing only its own assertions and nothing else:

| Mutation | Failures |
|---|---|
| A — remove the issue INFO line | 3 |
| B — remove the success ok INFO line | 3 |
| C — remove both DEBUG early-return lines | 2 |
| D — strip `trigger=`/`elapsed=` from the catch warning | 1 |
| E — drop the label forwarding in `SidecarHumbleSecretStore` | 2 |

Each mutation was applied and run as its **own** shell call, never chained after the write
(`jest-in-the-same-command-as-a-write-reads-stale`).

- `pnpm exec jest src/backend/{humble,sidecar,storeManagers/steam}` — **116 suites, 3368 passed,
  2 skipped, 0 failed.**
- `tsc --noEmit` clean.
- `prettier --check` clean on all 7 changed files. It went RED on two test files after my edit and
  was fixed with `--write`; the check was first re-run with the file list passed through `xargs`,
  because passing a newline-joined `$FILES` made prettier match **zero** files and still print
  "All matched files use Prettier code style!".
- `eslint`: 0 errors. The 8 warnings in the new test block are the same
  `no-unsafe-member-access` shape the file already carries 28 times for the identical
  `mockLogInfo.mock.calls` idiom — no new rule class introduced.

## Honest limits

- **Not live-verified.** No run against a real Keychain was performed; the new lines are proven by
  unit test only. The observable claim — that an operator's prompt count can now be cross-checked
  against the log — is untested end-to-end.
- **The better fix was not attempted.** The todo's own closing suggestion (replace
  `entry.get_password()` with a non-prompting reachability probe, since the handler maps both
  `Ok(_)` and `Err(NoEntry)` to `true` and is really asking "is the backend reachable") removes the
  prompt channel rather than logging it, and remains strictly superior. It is a Rust behaviour
  change needing its own live verification and was deliberately out of scope for a logging task.
- **`keyring_available` is still not wrapped in `bounded_keyring_read`**, unlike `keyring_get`.
  `main.rs:5309-5312` records that exclusion as deliberate and out of that plan's scope; untouched
  here.
- **Direction item 2 is untouched and still open** — widening `260817-d61`'s absence-grep to count
  `keyring_available` stays deferred behind the Phase 999.1 offline-mode decision, which withdrew
  the premise of the startup-prompt gate it would widen. **The todo file therefore stays open.**

## Note on how this task arose

The todo had been parked on 2026-09-04 with a `status:` field whose leading token read `PARKED`,
even though its body said in bold — twice — that item 1 was never parked. It was re-captured
verbatim on 2026-09-05 by a reader who did not know the file existed; only `add-todo`'s
duplicate-detection grep surfaced it. When parking a todo with a live sub-item, lead the status
with the live state, not the deferral.
