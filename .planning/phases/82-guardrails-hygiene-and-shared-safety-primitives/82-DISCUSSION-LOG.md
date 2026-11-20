# Phase 82: Guardrails, hygiene and shared safety primitives - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-20
**Phase:** 82-guardrails-hygiene-and-shared-safety-primitives
**Areas discussed:** Red-suite policy, Fix live TS or Rust-first, Refusal UX and scope, Delete-path edge policy
**Todos folded:** themeTokens render-site census (2026-11-18), backend-di jestMock ratchet (2026-11-17)

---

## Red-suite policy

| Question | Options | Selected |
|---|---|---|
| Green bar width | Full gate set (pnpm test + ratchets, pre-push passes) / pnpm test only / Backend jest only | Full gate set |
| Who approves retirement | Operator approves each / Executor decides by rule / Never retire | Operator approves each |
| Ledger location | Phase doc + `meta/retiredSuites.json` gate / Phase doc only / You decide | Phase doc only |
| Vacuous-pass proof | Floor + empty-input test on all census gates / Only the two named / You decide | Floor + empty test, all census gates |

## Fix live TS or Rust-first

| Question | Options | Selected |
|---|---|---|
| Where rules land | Rust primitive + live TS calls it via rustInvoke / Both separately / Rust only | Rust primitive + TS calls it |
| Nested co-install bug in `uninstallBottleGameDirectly` | Fix now / Record as port divergence | Fix now |
| Sibling-guarantee coverage | Every GameLib-run store delete / Steam + sideload only / You decide | Every store's delete |
| Crate home | New small crate / Start gamelib-core now / You decide | New small crate |
| FakeHome + README rules | Both / README only | Both |

## Refusal UX and scope

| Question | Options | Selected |
|---|---|---|
| What the user sees | Error notice + log / Blocking dialog with Retry / Notice + Show log | Error notice + log |
| Store reset scope | resetHeroic only / resetHeroic + clearCache / You decide | resetHeroic only |
| Bottle removal scope | Bridge bottle + shouldRemovePrefix for all stores / Bridge bottle only | Both |
| Partial guard failure | Refuse whole op / Uninstall game, keep prefix | Refuse whole op |

## Delete-path edge policy

| Question | Options | Selected |
|---|---|---|
| Symlinked install dir | Unlink, never follow / Follow if target contained / Refuse | Unlink, never follow |
| Nested other install | Refuse with notice / Delete around it | Refuse with notice |
| Case / Unicode | Canonical on-disk + case-fold/NFC, failure = Unknown / You decide | Canonical on-disk |
| Three-OS proof | CI legs only / CI + one live macOS / CI + live on all three | CI legs only |

## Claude's Discretion

- Inventory and state-ownership table format
- Dead-export sweep depth
- Crate final name and API shape
- Exact notice wording

## Deferred Ideas

None.
