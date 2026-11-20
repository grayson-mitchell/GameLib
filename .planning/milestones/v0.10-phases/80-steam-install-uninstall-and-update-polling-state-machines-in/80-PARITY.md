# Phase 80 Parity Report

Status: APPROVED (2026-11-16, operator)

Plan 80-19 (D-14, 63 D-07). Two measurements, both enforced by tests that stay in the repo:

- `pnpm exec jest src/backend/__tests__/steamPollParity.test.ts`: every timeline runs through the real TS loops (`tsDriver`) and through `gamelib-steampoll-cli replay` (spawned with a fresh `createFakeHomeProfile` env, disposed after); the two streams are diffed record by record (key order ignored). A diff not in `divergences.json` fails, and so does a ledger entry that no longer diffs (stale ledger). The same file then applies the Rust stream's `state` records through the plan-11 `steamPollStateEvent` handler and compares the resulting sidecar library and `steamLibraryStore` games write with what the TS loops left.
- `cargo test -p gamelib-steampoll-cli --test frozen_parity`: the Rust replay against the frozen `expected-ts/` streams with the same ledger, so parity stays enforced once the TS loops are deleted (plan 24+). JSON numbers are canonicalised (`2` and `2.0` are one value).

## Corpus

39 timelines, 285 frozen TS records. Inputs below count timelines; Equal is a timeline whose whole stream is record-for-record equal.

## Stream parity

| Machine   | Inputs | Equal | Explained | Unexplained |
| --------- | ------ | ----- | --------- | ----------- |
| install (incl. update-\*) | 25 | 23 | 2 | 0 |
| uninstall | 7      | 7     | 0         | 0           |
| running   | 3      | 3     | 0         | 0           |
| rearm     | 4      | 4     | 0         | 0           |
| **Total** | 39     | 37    | 2         | 0           |

Record level: 285 TS records; 280 equal at the same index, 5 index differences, all explained (2 in DV-80-01, 3 in DV-80-02), 0 unexplained.

## Handler parity

For all 39 timelines, applying the Rust stream's state records through the plan-11 handler leaves the same final library entries as the TS loop, and the same `steamLibraryStore.set('games', ...)` value whenever the TS loop wrote one: 39 of 39 equal, 0 explained, 0 unexplained. The two transport timelines pass too: the state records are identical in content, only their position relative to the frontend and notify records differs.

## Locale parity (plan 03)

| Check | Inputs | Equal | Explained | Unexplained |
| ----- | ------ | ----- | --------- | ----------- |
| Locale (43 shipped locales plus 5 extra language settings = 48 settings x 11 cases: 6 poll keys, 5 edge cases) | 528 | 528 | 0 | 0 |

Re-run in this plan: `cargo test -p gamelib-i18n` green (Rust `Catalog::t` equals the i18next goldens); the Jest freshness test is `src/backend/__tests__/i18nGolden.test.ts`.

## Fixes made

None. The measurement found no unexplained diff, so no `gamelib-steampoll` source file changed. Two harness-side adjustments were needed, not product fixes: the comparison ignores JSON key order (the TS and Rust serialisers order keys differently) and canonicalises integral floats on the cargo side (`downSpeed` is `2` in TS, `2.0` from an f64).

## Divergences

Both are the "Known TS baseline limits" of the corpus README: the TS loops have no outbox, ack or readiness gate, so the timelines freeze the transport-free TS behaviour and the Rust transport is an addition, not a regression. "Steam-correct side" here means the side that keeps the sidecar's state and the user-visible result right.

### DV-80-01: Rust waits the 5 s ack timeout before the completion continuation

- source: timeline `ack-timeout-emits-anyway` (ledger records 3 and 4)
- TS behaviour: on a completed install the loop writes library state and, in the same tick, emits `gameStatusUpdate done` and the "Installation Finished" notification (5 records).
- Rust behaviour: the `installed` state event is sent to the sidecar and the continuation (done status, notification) waits for the ack; with no ack it emits anyway after 5 s. The replay's timeline ends at the last scripted tick, which is before that 5 s elapses, so the stream has 3 records and the done status and notification are absent from it (in production they land 5 s after the event).
- Steam-correct side: Rust. The notification title and the game's final state come from the sidecar's reply, so continuing only after the ack (or a bounded timeout) cannot announce a finish the sidecar has not recorded.
- caller impact: none visible to a user when the sidecar is healthy (the ack is immediate); a wedged sidecar delays the "finished" toast by at most 5 s instead of dropping it.
- accepted: yes (2026-11-16)

### DV-80-02: outbox queues until the sidecar is READY, then replays latest-wins and reorders the record stream

- source: timeline `sidecar-not-ready-latest-wins` (ledger records 2, 3 and 4; same 5 records, permuted)
- TS behaviour: there is no outbox; the install completion emits the library state write, then the done status, then the notification, in that order.
- Rust behaviour: the `installed` state event is held in the outbox while the sidecar is not READY (latest event per app wins), the done status and notification are emitted from the poll, and the held state event is delivered when READY: the stream order is done, notify, installed instead of installed, done, notify. Content of every record is identical.
- Steam-correct side: Rust. A state event delivered before the sidecar can apply it would be lost; queueing it keeps the final library state correct (confirmed by handler parity: equal final library and store).
- caller impact: the frontend sees the done status and the toast a moment before `pushGameToLibrary` for the same game while the sidecar is starting; it recovers on the push. Only possible in the startup window.
- accepted: yes (2026-11-16)

## Not diffs (documented, no ledger entry)

- `clearForcedWindowsViaBottle`: TS writes only when the stored verdict is set; the baseline records the call unconditionally, and the Rust event is emitted unconditionally on a confirmed-absent bottle or bridge tick (80-02 notes). Streams equal.
- Notification title: TS reads the library title at notify time, the Rust loop captures it at start and the ack reply carries the sidecar's title (plan 11); no corpus timeline changes the title mid-poll, so no stream differs.

## Summary

Unexplained = 0 across stream parity (39 timelines), handler parity (39 timelines) and locale parity (528 rows). Two divergences, DV-80-01 and DV-80-02, both transport-only, accepted by the operator 2026-11-16.

## Operator approval

Operator reply, verbatim: "approved" (2026-11-16). Accepts DV-80-01 (ack-timeout-emits-anyway) and DV-80-02 (sidecar-not-ready-latest-wins).
