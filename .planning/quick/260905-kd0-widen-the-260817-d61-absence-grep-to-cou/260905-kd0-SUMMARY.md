---
quick_id: 260905-kd0
title: 'Widen 260817-d61 Gate A to the whole Keychain prompt surface, not just keyring_get'
date: 2026-09-05
status: complete
source_todo: .planning/todos/completed/2026-08-17-keyring-available-is-a-silent-prompt-channel.md
resolves: 'Direction item 2 — and with it the whole todo, which is now in completed/.'
overrides: 'The 2026-09-04 park behind Phase 999.1. Recorded, not silent.'
---

# Quick Task 260905-kd0 — Summary

## The deferral, and why it was overridden

Item 2 was parked 2026-09-04 on the grounds that Phase 999.1's offline-mode design withdraws the
premise of the startup-prompt gate it would widen. **Phase 999.1 is BACKLOG** (`ROADMAP.md:5010`) —
unscheduled, unplanned, in the 999.x parking lot. A correct grep is cheap; a deferral resting on an
item that may never land is not a reason to leave a known-blind gate blind. Overridden deliberately
and recorded in the todo, rather than reversed silently.

## Item 1 was a hard prerequisite, not merely a predecessor

Before `0fdbdac36`, widening the grep would have produced a gate that **could never hit**. A
successful `keyring_available` emitted no line at all, so an absence-assertion over
`issuing keyring_available` would have been vacuously true by construction — a false green, which
is the exact defect class this gate exists to avoid. Item 2 was unimplementable before item 1.

## The todo's own remedy was too narrow

It says a startup gate "must count `keyring_available` as well as `keyring_get`". The prompt
surface is **four** channels. `setToken()` and `clearToken()` say so in their own source comments:
*"a write is a real Keychain round trip and can prompt"*, and *"a delete is a real Keychain round
trip that can prompt. A 2026-08-14 session observed TWO prompts during a single Steam sign-out."*

| Channel | Can prompt | Announces `(may prompt)` pre-invoke | Post-invoke line |
|---|---|---|---|
| `keyring_get` | yes | yes | `ok` / `failed` |
| `keyring_available` | yes | yes, since `0fdbdac36` | `ok` / `failed` |
| `keyring_set` | yes | **no** | `ok len=` / `failed` |
| `keyring_delete` | yes | **no** | `ok` / `failed` |

For an ABSENCE gate the post-invoke line suffices — a completed round trip always leaves one — so
the widened pattern keys on both the announcement and the outcome, covering all four.

## Calibration — measured against two specimens, not asserted

The known-bad specimen is the **real 2026-08-17 pre-fix log**, still present on this machine at
`~/Library/Logs/GameLib/gamelib.run3.log`. The second was **generated from the code** — a throwaway
jest run capturing the real logger output, then deleted — rather than retyped from a display copy,
and is preserved at `260905-kd0-specimen-startup-probe.log`.

| Pattern | code-generated specimen | real pre-fix log | humble-slot false hits |
|---|---|---|---|
| OLD `getToken(): issuing keyring_get` | **1** — misses the `keyring_available` line entirely | 1 | 0 |
| WIDENED (all four channels) | **4** | **2** | **0** |

OLD scoring 1 where WIDENED scores 4 on the same file **demonstrates the hole rather than arguing
it**. WIDENED still hitting the real pre-fix log preserves the calibration property: a later zero
is meaningful, not a broken pattern. Zero humble-slot hits confirms it stays slot-scoped, which
Gate A's third PASS bullet requires.

## What shipped

1. **Gate A widened** in `260817-d61-LIVE-GATE.md` — the collect-grep, the first PASS bullet (which
   now explicitly says a pass recorded with the pre-2026-09-05 narrow pattern does not discharge it
   and must be re-run), and the Grep-calibration section rewritten with the table above.
2. **FINDING 1 closed** in the same document, with every stale reference refreshed (`main.rs:3131`
   → `:5369-5386`, `keyringTokenStore.ts:203-221` → `211-233`, `user.ts:115` → `:116`,
   `humbleSecretStore.ts:73` → `:76`) and the third call site added
   (`steamgridSecretStore.ts:71`, which does not prompt only because its seam is synchronous).
3. **A CI-visible prompting-channel LEDGER** in `keyringTokenStore.test.ts` — 5 tests. Deliberately
   a ledger, not a name list, in the shape this repo already requires of `dispatch_rust_channel`'s
   allowlist: a bare set of four strings could be turned green by appending a fifth, throwing the
   property away. Each entry states whether the channel can prompt and whether it announces itself
   before the invoke, because those are the two facts any startup-absence gate is built from.

The point of (3): a grep pattern written into a quick-task markdown file from August cannot notice
a fifth channel being added to this module in a year's time. The ledger can.

## Verification

- **Census RED-proven against the REAL source, not only a derived specimen.** Mutation F appended a
  genuine `requestRustInvoke(RUST_KEYRING_SMUGGLED, [])` call site to `keyringTokenStore.ts` → **3
  failed**. Restored, diff clean.
- **The announcement leg RED-proven independently.** Mutation G removed the `keyring_available`
  announcement while the ledger still claimed it announces → **4 failed**, including the ledger leg
  specifically. Restored.
- The census reads **comment-stripped** source. Both this test file's prose and the module's own
  name all four constants, so a raw match would be satisfied by documentation rather than a call
  site — a leg asserting exactly that is included and passes.
- Each mutation applied and run as its **own** shell call, never chained after the write.
- `pnpm exec jest src/backend/{humble,sidecar,storeManagers/steam}` — **116 suites, 3373 passed,
  2 skipped, 0 failed** (up 5 from 3368: the ledger block).
- `tsc --noEmit` exit 0. `eslint` 0 errors. `prettier --check` RED after the edit, fixed with
  `--write`, re-run green — and the suite re-run after formatting, since a reformat can defeat what
  it touches.

## Honest limits

- **Gate A has not been re-run live** against the widened pattern. It is an operator procedure
  needing a real Keychain and a logged-in Steam account. This task makes the gate correct; it does
  not claim to have executed it. Any prior PASS was recorded with the narrow pattern and does not
  discharge the widened bullet — the document now says so.
- **`keyring_set`/`keyring_delete` still have no pre-invoke announcement.** Real gap, recorded in
  the ledger with the reason it does not block this gate. Not fixed here: it is a behaviour change
  to the write paths, not a gate widening.
- **The non-prompting reachability probe was still not attempted** and remains strictly better than
  logging the channel at all.
- The 4-channel prompt surface is taken from the module's own source comments plus the Rust
  handlers; it was **not** re-derived by observing four distinct prompt types on hardware.
