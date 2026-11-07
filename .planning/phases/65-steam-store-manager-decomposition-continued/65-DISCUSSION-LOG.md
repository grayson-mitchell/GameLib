# Phase 65: Steam store manager decomposition, continued - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 65-steam-store-manager-decomposition-continued
**Areas discussed:** Todos, Scope and done-line, library.ts module set, Bridge and DRM file splits, Sequencing and proof

---

## Todos (cross-reference)

| Option | Description | Selected |
|--------|-------------|----------|
| Fold lift-stub removal | Convert game.x() stubs to x(game) cluster by cluster | ✓ |
| Close games.ts todo as met | games.ts is 1,351 lines, under the 1,400 target | ✓ |

**User's choice:** Both.

---

## Scope and done-line

| Option | Description | Selected |
|--------|-------------|----------|
| Line ceiling for all | Every non-generated steam/ file under N lines | ✓ |
| Six named + gameInstall/user | Explicit list of 8 | |
| Only the six named | Roadmap list only | |

| Option | Description | Selected |
|--------|-------------|----------|
| 1,000 lines | 10 files over | ✓ |
| 1,200 lines | 7 files over | |
| 800 lines | 17 files over | |

| Option | Description | Selected |
|--------|-------------|----------|
| Ceiling gate | Shrink-only per-file allowlist ending empty | ✓ |
| Phase target only | No gate | |
| Gate for all of src/backend | Wider allowlist | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tests split with source | Same move commit; tests exempt from gate | ✓ |
| Tests stay, mocks repointed | Monolithic suites | |
| You decide | | |

---

## library.ts module set

| Option | Description | Selected |
|--------|-------------|----------|
| steam/library/ dir + index | Like depot/ (62 D-08) | ✓ |
| Flat siblings in steam/ | | |

| Option | Description | Selected |
|--------|-------------|----------|
| All 7 clusters | Install polling cut once more | ✓ |
| Fewer: group pollers | Would exceed the ceiling | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Lift into free functions, no stubs | Matches the folded stub todo | ✓ |
| Keep refresh() in class | Class stays ~1,000 | |
| Lift with delegating stubs | 62 pattern | |

**Notes:** The scout found that the roadmap's guessed seams (owned-apps fetch, metadata enrichment) don't exist in library.ts.

---

## Bridge and DRM file splits

| Option | Description | Selected |
|--------|-------------|----------|
| Sibling files in place | No new dirs | ✓ |
| One subdir per file | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Split on its real seam | stageDrmBottle lands well under | ✓ |
| Minimal trim | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Aim for under ~800 | About 20% headroom | ✓ |
| Just under 1,000 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| One module owns each state | State + test seams + unref together | ✓ |
| You decide | | |

---

## Sequencing and proof

| Option | Description | Selected |
|--------|-------------|----------|
| After 61 closes | Unambiguous smoke attribution | ✓ |
| Start now, in parallel | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Gate → library → bottle → rest | Stubs last | ✓ |
| Gate → bottle first | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Two smoke runs, D-17 style | After library+bottle, and at end | ✓ |
| One smoke run at end | | |
| Suite plus gates only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, ceiling only goes down | Same-commit allowlist lowering | ✓ |
| Separate commits | | |

---

## Claude's Discretion

- Module names and cut lines; how bottle.ts, gameInstall.ts, user.ts, games.ts and gameBridgeLaunch.ts are cut; the gate's form (meta script or test); plan granularity.

## Deferred Ideas

- A backend-wide line gate (offered, not chosen).
