//! The engine decision (Phase 59 D-07, D-09, D-14; ported from `engineDecision.ts`, Phase 87 D-20):
//! which engine runs a launch or a bottle creation. CrossOver first; when it is missing, expired or
//! broken, the pinned Wine-Staging + DXVK fallback; never bottled Steam, never GPTK or DXMT as an
//! engine. The decision kinds are closed enums with no such variant, so a case that selects one
//! cannot be written.
//!
//! Stateless on purpose (D-07): CrossOver is probed afresh on every call and nothing is stored here.
//! The TS took its collaborators as injectable callbacks; Rust has no callback into TS for state
//! (Research Pattern 2), so each one is either a Rust call (the bin directory, the demo-status probe,
//! the build read, the wineserver kill, the running-games ledger, the Wine Manager releases, the pin
//! install check) or a value field of the op's arguments that the caller fills (the stored override,
//! the process monitor's phase).

pub mod creation;
pub mod launch;
pub mod override_options;
pub mod preflight;
