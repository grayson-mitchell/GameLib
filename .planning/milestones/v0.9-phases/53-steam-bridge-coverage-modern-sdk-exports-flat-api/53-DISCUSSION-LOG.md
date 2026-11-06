# Phase 53: Steam bridge coverage: modern-SDK exports, flat API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-25
**Phase:** 53-steam-bridge-coverage-modern-sdk-exports-flat-api
**Areas discussed:** Flat-API breadth, Unmarshaled methods, x86 parity, Acceptance & evidence

---

## Flat-API breadth

| Option | Description | Selected |
|--------|-------------|----------|
| Every method | Export every SteamAPI_ISteamX_Method from the manifests (R3 superset policy) | ✓ |
| Measured union only | Only names the owned library's DllImports reference | |
| Minimum slice first | Init path + the two known misses now | |

| Option | Description | Selected |
|--------|-------------|----------|
| Whatever census finds | Target every Steamworks.NET generation the owned Unity library uses | ✓ |
| Both known, fixed | Lock pre-1.48 + modern v0NN now | |
| Modern only | SDK 1.48+ only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fold it in | UE5 interface-versions todo folded whole (versions, GameServer_Init, j4l lift) | ✓ |
| Versions only | Add versions; guard lift stays in todo | |
| Keep separate | Only Unity-needed versions | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mono now, IL2CPP flagged | ImplMap parse for Mono; IL2CPP keeps @runtime-loaded with reason | ✓ |
| Both Mono and IL2CPP | Second parser for IL2CPP metadata | |
| Research decides | Count Mono vs IL2CPP first | |

---

## Unmarshaled methods

| Option | Description | Selected |
|--------|-------------|----------|
| Same as vtable slot | Flat export calls the proxy's vtable slot | ✓ |
| Zero/false always | Flat-only zero stubs | |

| Option | Description | Selected |
|--------|-------------|----------|
| Forward when measured | Stubs stay; forward or local-constant per traced failure | ✓ |
| Audit up front | Classify every method before planning | |
| Forward everything | Marshal every method | |

| Option | Description | Selected |
|--------|-------------|----------|
| NULL + log | Unknown version via flat accessor returns NULL | ✓ |
| Null object (as x64 today) | All-zero null object | |
| Nearest version | Serve nearest lower version | |

| Option | Description | Selected |
|--------|-------------|----------|
| Flat only; vtable as-is | Keep x64 vtable null-object fallback (CR-01) | ✓ |
| Align both to NULL | One rule everywhere | |
| Research decides | Research reads CR-01 history | |

---

## x86 parity

| Option | Description | Selected |
|--------|-------------|----------|
| Measure, then decide | Count x86 titles needing the family/flat API; build only if any | ✓ |
| Build it regardless | Roadmap names it | |
| Defer x86 outright | x64 only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fold step 3 only | AnyCPU without 32BITREQUIRED → x64 | ✓ |
| Fold the whole todo | Also legacy exports + old versions | |
| Leave it | No AnyCPU change | |

---

## Acceptance & evidence

**Noted during discussion:** the roadmap's "UE bootstrap scan miss, out of scope" is already closed
(quick 261024-ir1); Ranch Simulator is no longer masked by it.

| Option | Description | Selected |
|--------|-------------|----------|
| Census shares the runtime scan | bridgeCensus.ts reuses shimGenerate.ts scan code; folds census-UE todo | ✓ |
| Patch census separately | Parallel logic per rule | |
| Managed scan only | Only DllImport scan in census | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-engine log + bridge trace | Engine log where it exists; else game-originated bridge call beyond init | ✓ |
| Engine log only | No engine log → unverified | |
| Bridge trace only | Uniform bridge-call criterion | |

| Option | Description | Selected |
|--------|-------------|----------|
| Seven + folded UE titles | + Manor Lords, Abiotic Factor; out-of-phase blockers stay in denominator | ✓ |
| Seven only | Majority of seven named titles | |
| Exclude out-of-phase | Drop blocked titles from denominator | |

---

## Claude's Discretion

- x64 flat-export call mechanics, generator structure, flat-name ↔ manifest mapping
- Factoring of the shared scan module
- Which methods get forwarded/constant-answered as evidence arrives

## Deferred Ideas

- IL2CPP P/Invoke extraction
- x64 vtable-path NULL fallback
- x86 parity if unmeasured
- Old-SDK todo steps 1, 2, 4, 5
