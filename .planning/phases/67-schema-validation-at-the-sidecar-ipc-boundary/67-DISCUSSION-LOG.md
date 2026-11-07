# Phase 67: Schema validation at the sidecar IPC boundary - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 67-schema-validation-at-the-sidecar-ipc-boundary
**Areas discussed:** Validator and zod version, Shape-only vs semantic checks, Which directions are in scope, Rust contract generation

---

## Validator and zod version

| Option | Description | Selected |
|--------|-------------|----------|
| zod 4 | Fixes the advisory; built-in z.toJSONSchema() for Rust codegen; one library | ✓ |
| Stay on zod 3 | No migration; advisory stays open; JSON Schema needs a third-party package | |
| valibot / lighter lib | Smaller, but a second validator next to 15 zod files | |

**Existing 15 zod-3 files:** Port all 15 to zod 4 as the first plan (✓) / pin to `zod/v3` subpath / you decide.
**Phase 72 overlap:** 67 owns the bump; strike zod from 72 (✓) / leave 72 as written.
**Argument type source:** `z.infer` in the same `ipc/<domain>.ts` files (✓) / separate `.schema.ts` files / you decide.

---

## Shape-only vs semantic checks

| Option | Description | Selected |
|--------|-------------|----------|
| Shape + cheap invariants | Types plus stateless refinements; containment and allow-lists stay in handlers / Phase 72 | ✓ |
| Shape and type only | Strictly structural | |
| Shape + semantic incl. containment | Schemas run rendererPathGuard checks; depend on settings at runtime | |

**Unknown keys:** strict reject (✓) / strip silently / strip + log once per channel.
**Rejected invoke:** rejected promise with typed `IPC_INVALID_ARGS` error (✓) / result union on every channel / you decide.
**Large payloads (GameInfo, settings):** lighter schemas now, Phase 70 tightens (✓) / full schemas now / run Phase 70 first.
**Defaults accepted:** a rejected send is logged and dropped; logs carry the channel and issue paths, never values.

---

## Which directions are in scope

**Push relays (sidecar→renderer):** schemas for types and codegen, no runtime check (✓) / out of scope / dev-only runtime check.
**rustInvoke (sidecar→Rust):** in scope as the Rust codegen target, generating an enum and serde arg structs (✓) / names only / out of scope.
**Rust relay allow-list:** yes, a generated name allow-list in `sidecar_invoke`/`sidecar_send` (✓) / no, the sidecar is the only gate / defer to Phase 72.
**Test/dev channels:** every registered channel needs a schema, no exemptions (✓) / exempt via a named list.

---

## Rust contract generation

**Pipeline:** zod → JSON Schema → project-owned TS generator with a strict subset (✓) / JSON Schema → typify crate / you decide.
**Transport constants:** move into the generated contract and retire the marker test for them (✓) / keep the marker test.
**Order vs Phase 71:** 67 first (✓) / 71 first / either order.
**Staleness:** checked in, plus a CI regen-diff check (✓) / generated at build time only.

---

## Claude's Discretion

- How the typed error is encoded on the wire, and the renderer error class
- Whether schemas attach through a registration wrapper or a schema map in the `ipcMain` recorder
- Generator location, Rust output path, script names
- Plan and wave breakdown, how domains are batched
- Whether to remove the ad hoc `typeof` checks that schemas make redundant

## Deferred Ideas

- Path containment and URL scheme allow-lists → Phase 72
- Full GameInfo and settings schemas → Phase 70
- ROADMAP.md edit to remove zod from Phase 72's supply-chain group
