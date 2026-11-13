# Requirements: GameLib v0.10 Foundations

**Defined:** 2026-11-12
**Core Value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Milestone goal:** Put the backend and shell on solid foundations, move more of the Steam stack into Rust, and clear the v0.9 audit debt.

Earlier milestones' requirements are archived: v0.2–v0.7 in `milestones/v0.8-REQUIREMENTS.md`; v0.8 and v0.9
tracked theirs per phase (see `MILESTONES.md`). Phase-level requirement IDs (REQ-NN-xx, D-xx decisions) are still
minted by `/gsd-plan-phase`; the IDs below are milestone-level outcomes that those phase requirements roll up to.

## Adopted (complete before definition)

v0.10 adopts the phases that ran between the v0.9 close (2026-11-06) and this milestone's start. They are
complete and verified per their own VERIFICATION.md files; they carry no new requirement IDs here.

| Phase | Outcome |
| ----- | ------- |
| 61 | Unified macOS engine for all stores |
| 62 | Module boundaries and decomposition |
| 63 | Rust migration pattern and executable scanners |
| 65 | Steam store manager decomposition, continued |
| 66, 66.1, 66.2, 66.3 | Backend dependency injection; every spawn through the process runner; module state to zero (first pass) |
| 67 | Schema validation at the sidecar IPC boundary |
| 68 | Versioned persisted stores and migrations |
| 71 | Rust shell module decomposition |
| 72 | Renderer trust boundary and process hardening |
| 73 | Steam depot download pipeline in Rust |

## v0.10 Requirements

### Architecture

- [ ] **ARCH-01**: The backend has no module-level mutable state: the census is a zero-tolerance test and the Steam RunningAppID poller runs as a boot-owned step
- [ ] **ARCH-02**: The frontend has one state system: `GlobalState.tsx` / `ContextProvider` retired in favour of GlobalStateV2 slices
- [ ] **ARCH-03**: Shared code depends only on a shared `GameInfo` core; store-specific data lives in per-store shapes

### Steam

- [x] **STEAM-01**: User sees "Update available" on an installed Steam game that has an update
- [x] **STEAM-02**: User can update a bridge-installed Steam game from GameLib
- [x] **STEAM-03**: Steam's local files (`libraryfolders.vdf`, `appmanifest_*.acf`, `shortcuts.vdf`) are read and written in Rust, one implementation per format

### Themes

- [ ] **THEME-01**: User can browse every theme in a gallery of preview thumbnails
- [ ] **THEME-02**: User can duplicate a theme and edit its colours; built-in themes never change

### Price search

- [ ] **PRICE-01**: User sees store-search prices in their own currency (IsThereAnyDeal replaces CheapShark)
- [ ] **PRICE-02**: The "you already own this" badge keeps working on IsThereAnyDeal results
- [ ] **PRICE-03**: When rate-limited, user sees the cached price with its timestamp instead of an error

### v0.9 audit debt

- [ ] **DEBT-01**: A DRM-mode launch never runs over a bottle initialised by the fallback engine (audit S9)
- [ ] **DEBT-02**: The known-fix relay rejects an unbounded request body when `Content-Length` is missing (57 WR-09)
- [ ] **DEBT-03**: Sidecar exit is not held by a lingering `execFile` handle (56 WR-02)
- [ ] **DEBT-04**: Game input is released when the overlay close is missed (60 WR-01)
- [ ] **DEBT-05**: Phases 52, 53 and 58 have current verification and UAT records
- [ ] **DEBT-06**: `macArchKnownFixRouting` and the three pre-existing failing sidecar suites (installFlows, runnerSliceRegistration, testContainment) pass

## Future Requirements

- ITAD-backed deals browser — gated on a one-line written confirmation of ITAD's ambiguous 2026-10-01 reply (Phase 47 gate 2)
- GameLib-run caching server between ITAD and clients — only when usage approaches the per-app rate limit
- x86 shim coverage (backlog Phase 999.2)

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Verifying the 26 v0.8 phases closed without a passed VERIFICATION.md | Excluded by operator at milestone start (2026-11-12) |
| Phase 34.7 Epic device-auth | Superseded 2026-11-11 by quick `260822-r3g` |
| Unsigned Windows releases; blank-render todo | Not in this milestone's scope |
| `audit-open` planning hygiene | Not in this milestone's scope |
| Amazon price coverage | ITAD does not track Amazon (operator decision 2026-09-24) |

## Traceability

| Requirement | Phase | Status |
| ----------- | ----- | ------ |
| ARCH-01 | 66.4 | In progress (22/23 plans; Windows UAT pending) |
| ARCH-02 | 69 | Executed; 3 human UAT items pending |
| ARCH-03 | 70 | Pending |
| STEAM-01 | 74 | Complete |
| STEAM-02 | 74 | Complete |
| STEAM-03 | 75 | Complete |
| THEME-01 | 64 | Pending |
| THEME-02 | 64 | Pending |
| PRICE-01 | 47 | Pending |
| PRICE-02 | 47 | Pending |
| PRICE-03 | 47 | Pending |
| DEBT-01 | 76 | Pending |
| DEBT-02 | 77 | Pending |
| DEBT-03 | 77 | Pending |
| DEBT-04 | 77 | Pending |
| DEBT-05 | 78 | Pending |
| DEBT-06 | 78 | Pending |

**Coverage:** 17 requirements, 17 mapped, 0 unmapped.

---
*Requirements defined: 2026-11-12*
