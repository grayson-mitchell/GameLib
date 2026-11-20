# Phase 62: Module boundaries and decomposition - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 62-module-boundaries-and-decomposition
**Areas discussed:** Capability flags vs identity, games.ts split shape, IPC types location, Ratchet/order/proof

---

## Capability flags vs identity

| Option | Description | Selected |
|--------|-------------|----------|
| Static per-runner table | `Record<Runner, StoreCapabilities>` in `common/`; per-game facts stay on GameInfo | ✓ |
| Fields on GameInfo | Backend stamps flags on every game | |
| Methods on LibraryManager | Backend-only `capabilities()`; frontend needs IPC | |

| Option | Description | Selected |
|--------|-------------|----------|
| Identity allowed via one helper | Raw literal banned; identity goes through a named helper | ✓ |
| Everything becomes a flag | Single-use flags for Steam-only features | |
| Leave identity sites inline | Raw literals with allowlist comments | |

| Option | Description | Selected |
|--------|-------------|----------|
| All runners in screens/** | Every store's literals, so the rule can reach zero | ✓ |
| Steam only | Rule scoped to `'steam'` | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same rule everywhere outside storeManagers | frontend/** + backend/** minus storeManagers/** | ✓ |
| Only screens/** and downloadmanager/ | Roadmap wording | |
| You decide | | |

**User's choice:** all recommended options.

---

## games.ts split shape

| Option | Description | Selected |
|--------|-------------|----------|
| Repoint importers, no façade | 19 importers + 9 jest.mock sites move to owning module | ✓ |
| games.ts re-exports (façade) | | |
| Façade now, remove later | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pure moves, separate commits | Cleanup → todos/follow-up commits | ✓ |
| Moves + light tidying | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Launch/DRM/requirements minimum, more where seams are clean | Planner cluster-maps first | ✓ |
| Exactly those three | | |
| Size cap per file | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Split into depot/ submodules + depot/index.ts | One public path | ✓ |
| Move whole file to depot/download.ts | | |

**User's choice:** all recommended options.

---

## IPC types location

| Option | Description | Selected |
|--------|-------------|----------|
| common/types/ipc/<domain>.ts, name-paired | Avoids frontend importing from backend/ | ✓ |
| Literally beside registrations | `backend/sidecar/*.types.ts` | |

| Option | Description | Selected |
|--------|-------------|----------|
| Intersection in ipc/index.ts | Existing type names kept | ✓ |
| Per-domain direct imports | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Census test pairing channels to domains | | ✓ |
| Convention only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Jest parses main.rs source text | No cargo in jest lane | ✓ |
| Generate Rust constants from TS | | |
| Rust test reads the TS file | | |

**User's choice:** all recommended options.

---

## Ratchet, order & proof

| Option | Description | Selected |
|--------|-------------|----------|
| Ceiling that only goes down | Like the lint ceilings; flip to error at zero | ✓ |
| Pure warn until zero | | |

| Option | Description | Selected |
|--------|-------------|----------|
| All rules at error is the done-when | | ✓ |
| Ceilings must fall, zero is a stretch goal | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rules → split → capabilities | | ✓ |
| Rules → capabilities → split | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Short live smoke after split + after capabilities | | ✓ |
| Suite + typecheck only | | |
| One live smoke at phase end | | |

**User's choice:** all recommended options.
**Notes:** Claude pointed out that dependency-cruiser cannot detect `runner === '…'` comparisons, so the literal ban is an ESLint rule (CONTEXT D-13).

## Claude's Discretion

Flag names and the day-one set; the identity helper's name and signature; test-file exemption; exact cut lines for the `games.ts`/`depot.ts` split; how the depcruise baseline is stored; how `launcher.ts` reaches store setup.

## Deferred Ideas

- The `main.rs` split (separate quick task).
- Cleanups found during the pure moves, which become todos.
- 9 todo-matcher hits reviewed and not folded (keyword noise).
