# Requirements: GameLib v0.11 Node Sidecar Retirement

**Defined:** 2026-11-17
**Status:** Planned alongside v0.10, which still owns `.planning/REQUIREMENTS.md`. When v0.10 closes, this file becomes `REQUIREMENTS.md`.
**Core value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.
**Milestone goal:** GameLib runs with no Node at runtime. Every remaining `src/backend` subsystem is ported to Rust slice by slice, then the SEA sidecar and its JSON-RPC bridge are deleted.
**Research:** `.planning/research/v0.11/` (SUMMARY.md first).

Every requirement below is a "still works after the port" guarantee unless it says otherwise. Each port slice ends with the deletion of the TypeScript it replaced; a dual path lives only for a bounded fallback window.

## v0.11 Requirements

### Foundations

- [x] **FND-01**: Every backend test suite is green, or retired with a recorded reason, before the first port slice; drift-gate suites (IPC census, flow-registration census) cannot pass vacuously
- [x] **FND-02**: Destructive operations (uninstall, bottle removal, store reset) refuse when a check returns "unknown"; uninstalling a game never deletes a sibling game co-installed beside it, on macOS, Windows and Linux
- [ ] **FND-03**: Rust can serve a renderer channel natively with the sidecar as fallback; each channel has exactly one owner, and renderer arguments are validated in Rust (the Phase 72 trust boundary is kept)
- [ ] **FND-04**: Quitting or killing GameLib leaves no orphaned helper processes on macOS, Windows or Linux (launched games excepted)
- [x] **FND-05**: Logs keep their format, location, rotation and redaction; log upload and "show in folder" still work
- [x] **FND-06**: Existing settings, caches and per-game config load unchanged after upgrade; unknown keys are preserved, the pre-migration state is backed up, and a corrupt file is kept, never reset. The legendary store migration is ported only if a supported upgrade path still reaches it
- [x] **FND-07**: Stored credentials keep working, with no new Keychain prompts, across a signed-release upgrade

### Services

- [x] **SVC-01**: Wiki game info, the CrossOver compatibility index, store search and discounts, anti-cheat info, recent games, per-game overrides and the artwork caches work as before
- [x] **SVC-02**: Engine selection, per-game bottles, Wine/CrossOver/Staging downloads, Winetricks and DXVK tools work as before
- [ ] **SVC-03**: Launching any game produces the same command line and environment as before (golden traces): native, Wine/Proton/CrossOver, gamescope/mangohud, known-fix overlays, pre/post scripts
- [ ] **SVC-04**: Humble key sync, claim and redeem work as before
- [ ] **SVC-05**: Shortcuts are created and removed as before

### Steam

- [ ] **STM-01**: Steam library state, game sessions and update detection run in Rust; the Phase 80 state-event handler and the `polls=ts` fallback are deleted
- [ ] **STM-02**: Steam install, uninstall, update, launch, sign-in, redeem and Mac Steam adoption work with no TypeScript Steam services left
- [ ] **STM-03**: Bridge install (import scan, shim placement, shared redistributables) runs in Rust
- [ ] **STM-04**: Bridge launch and bottle lifecycle run in Rust; every bridge-verified title stays bridge-verified
- [ ] **STM-05**: DRM mode, the Shift+Tab overlay and bridge known fixes run in Rust; Grim Dawn, Raft and Ranch Simulator stay bridge-verified

### Other stores

- [ ] **STO-01**: Epic (legendary): sign-in, library, install/update/repair/move/uninstall, launch and the EOS overlay work as before
- [ ] **STO-02**: GOG (gogdl/comet): sign-in, library, install/update/repair/move/uninstall, launch and cloud saves work as before
- [ ] **STO-03**: Amazon (nile) and sideloaded apps work as before
- [ ] **STO-04**: The download queue keeps pause/resume, resume after quit and stall recovery

### Retirement

- [ ] **RET-01**: `gamelib://` links, single-instance handling and quit work with no sidecar
- [ ] **RET-02**: The macOS, Windows and Linux packages contain no Node runtime or sidecar binary; the signed and notarized macOS build passes `codesign --verify --deep`; auto-update from the previous release works
- [ ] **RET-03**: `src/backend`, the SEA build, the backend jest project and the sidecar CI steps are deleted, and a gate fails if any of them returns
- [ ] **RET-04**: Dev builds do not prompt for the Keychain on every launch (`devSecretVault` ported, cfg-gated out of release builds)

## Future Requirements

- Upgrade `keyring` 3.x to 4.x
- Parallel second lane (Humble or bridge overlapping the runner phases)

## Out of Scope

- **Discord rich presence** — dropped by operator decision 2026-11-17 (niche; its timer once broke the sidecar exit contract). A user-visible removal.
- **`CI=e2e` mock backends** — deleted by operator decision 2026-11-17 (bootstrap branch already unreachable)
- **Reimplementing Epic/GOG/Amazon protocols** — legendary, gogdl, comet and nile stay bundled binaries spawned from Rust
- **Removing Node from build tooling** — Vite, pnpm and jest stay for the renderer
- **Fixing the PyInstaller spawn tax** — inherent to the bundled binaries (`gogdl-spawn-tax.md`)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 82 | Complete |
| FND-02 | Phase 82 | Complete |
| FND-03 | Phase 83 | Pending |
| FND-04 | Phase 83 | Pending |
| FND-05 | Phase 84 | Complete |
| FND-06 | Phase 85 | Complete |
| FND-07 | Phase 85 | Complete |
| SVC-01 | Phase 86 | Complete |
| SVC-02 | Phase 87 | Complete |
| SVC-03 | Phase 88 | Pending |
| STM-01 | Phase 89 | Pending |
| STM-02 | Phase 90 | Pending |
| STO-01 | Phase 91 | Pending |
| STO-02 | Phase 92 | Pending |
| STO-03 | Phase 92.1 | Pending |
| STO-04 | Phase 93 | Pending |
| SVC-04 | Phase 94 | Pending |
| SVC-05 | Phase 94 | Pending |
| STM-03 | Phase 95 | Pending |
| STM-04 | Phase 96 | Pending |
| STM-05 | Phase 97 | Pending |
| RET-01 | Phase 98 | Pending |
| RET-04 | Phase 98 | Pending |
| RET-02 | Phase 99 | Pending |
| RET-03 | Phase 99 | Pending |

Coverage: 25/25 requirements mapped, each to exactly one phase (82-99).

---
*Requirements defined: 2026-11-17*
