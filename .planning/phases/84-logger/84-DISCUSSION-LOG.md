# Phase 84: Logger - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-20
**Phase:** 84-logger
**Areas discussed:** gamelib-shell.log fate, Game/runner log ownership, Forwarder loss & ordering, Noise policy (+ Phase 82 risk R1)

---

## gamelib-shell.log fate

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into gamelib.log | One file and one writer; `[Shell]` prefix | ✓ |
| Keep gamelib-shell.log, native writer | Separate file in the standard format | |
| Keep file and its raw format | Keeps `epoch pid=N msg` byte for byte | |

| Option | Description | Selected |
|--------|-------------|----------|
| Execute 84 after 83-11 passes | Plan now, execute later | ✓ |
| 84 updates the 83 gate too | Run in parallel, rewrite 83's capture recipe | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep panic log separate | A direct, infallible append | ✓ |
| Route through the logger | One writer, but a panic on the logger thread loses the report | |

| Option | Description | Selected |
|--------|-------------|----------|
| Prefix only, no pid | Today's line format unchanged | ✓ |
| Add pid to every line | Changes the format the golden test pins | |
| You decide | | |

**User's choice:** all recommended options.

---

## Game/runner log ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Rust writes all files now | TS forwards game/runner lines | ✓ |
| Rust owns gamelib.log only | Per-game/runner files stay TS until 88/91/92 | |
| Rust owns gamelib.log + runner logs | Game stdout stays TS until 88 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Batched forwarding | One IPC send per batch | ✓ |
| Per-line forwarding | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Port to Rust (reqwest) | Same dpaste endpoint; uploader.ts deleted | ✓ |
| Keep TS uploader, read native files | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rust is path authority | paths.ts deleted | ✓ |
| Both, pinned by a parity test | | |

**User's choice:** all recommended options.

---

## Forwarder loss & ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded buffer, then drop + count | Never blocks; boot lines kept | ✓ |
| Never drop; block the caller | | |
| Drop silently | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-source FIFO only | Matches 83 D-02 | ✓ |
| Globally ordered by timestamp | | |

| Option | Description | Selected |
|--------|-------------|----------|
| At origin in TS | | ✓ |
| At the Rust writer | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Logger flushes last, inside deadline | | ✓ |
| Logger gets its own extra budget | | |

**User's choice:** all recommended options.

---

## Noise policy

| Option | Description | Selected |
|--------|-------------|----------|
| Identical-line suppression + summary | Window + first N + "repeated K more times" | ✓ |
| Token bucket per prefix | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| gamelib.log only | Game/runner transcripts stay byte-faithful | ✓ |
| All files | | |

| Option | Description | Selected |
|--------|-------------|----------|
| WARN+ by default, DEBUG via setting | | ✓ |
| INFO+ by default | | |

| Option | Description | Selected |
|--------|-------------|----------|
| tracing target → LogPrefix | | ✓ |
| You decide | | |

**User's choice:** all recommended options.

---

## Phase 82 risk R1 (uploadedLogs store)

| Option | Description | Selected |
|--------|-------------|----------|
| (a) 84 builds minimal StoreHost core | No double moves | ✓ |
| (b) Private logger file, 85 adopts | uploadedLogs moves twice | |

**User's choice:** (a).

## Claude's Discretion

- `gamelib-log` crate vs a gamelib-core module; batch, tick and buffer sizes; where redaction runs; channel shapes.

## Deferred Ideas

None.
