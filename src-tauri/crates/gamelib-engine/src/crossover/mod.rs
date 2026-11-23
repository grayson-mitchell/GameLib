//! CrossOver detection and probes (Phase 87, D-04, D-22): where the app's `bin` directory is, the
//! trial demo-status probe, the tested-build rules and the allowlisted tool runner.
//!
//! The CrossOver search itself (Spotlight) is `gamelib-wine`'s discovery; this crate reaches it only
//! through the [`locate::CrossoverDiscovery`] trait the shell implements, so it never depends on wine.

pub mod demo_status;
pub mod locate;
pub mod run_tool;
pub mod tested_versions;
