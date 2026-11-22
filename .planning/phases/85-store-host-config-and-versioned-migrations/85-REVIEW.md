---
phase: 85-store-host-config-and-versioned-migrations
reviewed: 2026-11-22T00:00:00Z
depth: standard
round: 3
round_1_commit: 5714cafea
round_2_commit: 011f0e486
files_reviewed: 10
files_reviewed_list:
  - src-tauri/src/main.rs
  - src-tauri/src/shell_state.rs
  - src-tauri/src/sidecar.rs
  - src-tauri/src/store_boot.rs
  - src/backend/stores/__tests__/mirrorCell.test.ts
  - src/backend/stores/__tests__/storeRoot.test.ts
  - src/backend/stores/mirrorCell.ts
  - src/backend/stores/storeRoot.ts
  - src/preload/__tests__/tauriTransport.test.ts
  - src/preload/tauriTransport.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 85: Code Review Report (round 3)

**Reviewed:** 2026-11-22
**Depth:** standard
**Round:** 3 (round 1 at 5714cafea, round 2 at 011f0e486; the fixer landed f7f154b01, 4c27efe9d and efe601a78)
**Files Reviewed:** 10
**Status:** issues_found

## Round-2 fix verdicts

| Round-2 id | Commit | Verdict |
|---|---|---|
| D-WR-01 | f7f154b01 | verified (exit-path wait fits the one budget, no new kill, no unbounded wait; hardening note in E-IN-02) |
| D-WR-02 | 4c27efe9d | verified (the optimistic apply-then-revert for an omitted per-game read-only document is the fixer's stated, deliberate residual; not re-raised) |
| D-WR-03 | efe601a78 | incomplete (E-WR-01: a second invalidation during the wait is missed; E-IN-01: the 5 s bound sits inside the 8 s caller race) |

Totals: 2 verified, 1 incomplete (D-WR-03), 0 regressed.

How it was checked. `git diff 011f0e486..HEAD` over the ten files was read against the full files and the round-2 finding text, with `Skill("gamelib-conventions")` loaded first. The two new `shell_state::tests` pass (`cargo test -p gamelib-shell a_wait_`), and both new D-WR-03 jest cases pass (`pnpm jest src/preload/__tests__/tauriTransport.test.ts -t D-WR-03`). The microtask race in E-WR-01 was reproduced with a standalone node script that copies the `inflight` / `settleRefetches` / change-listener shape.

### D-WR-01 against the Rust shutdown contract

- **One budget, no wait of its own.** The new wait is `state.reader_done.wait(grace.saturating_sub(stage.elapsed()))` inside the `children` closure of `run_exit`. It spends what is left of the stage's `grace` (at most 1.5 s), and the following `store_boot::drain` takes the rest of the same remainder. Neither adds to `ExitBudget::DEFAULT`; both degrade to a bare sample when the stage is spent.
- **No hand-rolled kill.** The step only waits. `shutdown_child` (`terminate_group`) and `terminate_all` are untouched.
- **No unbounded wait.** `ReaderDone::wait` recomputes `deadline.saturating_duration_since(now)` every loop and returns `false` when it reaches zero. The condvar wait is `wait_timeout`, spurious wakeups are re-checked against the flag, and a poisoned mutex is recovered. A held pipe write end (a descendant that kept the sidecar's stdout) only costs the bounded remainder.
- **No deadlock if the reader never started or already ended.** `SidecarState` is created in `spawn_sidecar_state` and `start_reader` is called on it immediately, so "never started" means no `SidecarState` is managed and `try_state` returns `None`, which the `match` maps to `true`. If the reader already ended, the latch is set and `wait` returns at once. The waiter holds only the `done` lock, which `mark` takes briefly. `shutdown_child` has released the `child` mutex before the wait. The reader does not wait on anything the exit thread holds before reaching `mark`.
- **Ordering is right.** `mark()` runs after the `for line in reader.lines()` loop, so every store frame the pipe carried has been through `store_dispatch::enqueue` (inline on that thread), and before `drain_pending_invokes` and `sidecar_eof_teardown`, whose steamcm close can take seconds on the intentional path. The MSRV workaround (a `match` instead of `Option::is_none_or`) is correct.

### D-WR-03 against the timer requirements

`settleRefetches` creates one `setTimeout` and clears it in a `finally` whichever side of `Promise.race` wins, so no timer outlives the call. The `drained` branch only awaits promises `hydrateStore` already catches, so the function cannot throw. The bound is 5 s, so boot cannot hang inside this function. The two remaining problems are in E-WR-01 and E-IN-01.

## Warnings

### E-WR-01: `settleRefetches` returns while a queued second re-fetch is still starting, so the store can still be unhydrated at mount (reopens D-WR-03)

**File:** `src/preload/tauriTransport.ts:416-424`, `src/preload/tauriTransport.ts:263-271`
**Issue:** The comment says an invalidation that arrives while a fetch runs queues another fetch behind it, "so each store is followed until `inflight` is empty rather than awaited once". The loop `for (task = inflight.get(s); task; task = inflight.get(s)) await task` only works when the change listener's `running.then(() => hydrateStore(store))` was registered on `running` BEFORE `settleRefetches` awaited it. Promise reactions run in registration order. When the boot wait is already parked on `running` and a second `invalidated` push then arrives (the listener is live from `registerStore`, and Phase 85 pushes `invalidated` for bulk store changes), the order is: `running` settles and its `finally` deletes `inflight`; the waiter's continuation runs first, reads `inflight.get(s)` as `undefined` and exits the loop; only then does the listener's `.then` callback start the queued `hydrateStore`. `hydrateStoreSnapshot` returns and boot mounts with the store un-hydrated (`hydrated.delete(store)` already ran, and the first fetch was discarded by the epoch check), which is the exact outcome D-WR-03 was meant to close. Reproduced with a standalone script of the same shape; output was `settle returned; inflight=true` printed before the second `fetch done`. The test suite does not cover it because both new cases send one invalidation before the wait begins. The window is narrow (a second bulk invalidation of an eager store inside the boot re-fetch), but the function's own comment claims to handle it.
**Fix:** Let the queued fetch register before re-checking. The smallest change is a microtask yield inside the loop:
```ts
for (let task = inflight.get(storeName); task; task = inflight.get(storeName)) {
  await task
  await Promise.resolve() // the listener's `.then(() => hydrateStore(...))` was registered on `task` and has run by now
}
```
A sturdier change is to make the listener record the queued fetch itself, for example `const next = running.then(() => hydrateStore(store)); queuedRefetch.set(store, next)`, and have the loop await `queuedRefetch.get(store) ?? inflight.get(store)`. Add a test that sends a second `invalidated` push after the boot wait has started and asserts the store is populated and hydrated when `hydrateStoreSnapshot` resolves.

## Info

### E-IN-01: The 5 s re-fetch bound is nested inside the caller's 8 s race, so a slow snapshot makes the bound unreachable (follows D-WR-03)

**File:** `src/preload/tauriTransport.ts:406-409`, `src/frontend/index.tsx:150-162`
**Issue:** `index.tsx` races `hydrateStoreSnapshot()` against an 8000 ms rejection. The new wait starts after the snapshot invoke returns, so its worst case is snapshot latency plus 5 s. A snapshot slower than 3 s followed by a stuck re-fetch makes the caller's timer fire first, and boot mounts through the "mounting with an empty snapshot" catch even though the snapshot did land. This degrades the same way as before, so it is not a hang, but the doc comment says boot "proceeds past the bound" and that is not true in that case. The two budgets are not derived from each other.
**Fix:** Either note the nesting in the doc comment, or derive the bound from what is left of the caller's budget (for example export one `HYDRATE_BUDGET_MS` and wait for `HYDRATE_BUDGET_MS - elapsed - margin`).

### E-IN-02: `ReaderDone::mark` is not panic-safe, and a read error sets it with the pipe still open (follows D-WR-01)

**File:** `src-tauri/src/sidecar.rs:441-446, 655-663`
**Issue:** `mark()` runs after the loop, so a panic inside the loop body (for example in `store_dispatch::enqueue`) skips it and the exit wait runs to its bound instead of returning (bounded and logged, so harmless). Separately, `Err(_) => break` on a non-UTF-8 line also reaches `mark()` while the child is still writing; the wait then reads "reader ended" and `drain` samples a queue that the stopped reader will never fill. That case was already lossy and is not made worse, but `reader_done` means "reader stopped", not "stdout at EOF", and the field's doc comment says "the stdout reader thread ... the moment `reader.lines()` ends".
**Fix:** Optional hardening. Hold a small guard whose `Drop` calls `state.reader_done.mark()` at the top of the thread, so a panic also releases the waiter, and say "reader stopped" in the field comment.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
