//! The bottle state primitives (Phase 87, SVC-02, D-07): where a bottle lives, its engine marker with
//! the in-process version gate, the `cxbottle.conf` the fallback engine writes, the pinned-artifact
//! marker, the running-games ledger, the session engine registry and the prefix resolver.
//!
//! These are the one-way on-disk state of the phase: the markers and the conf are written byte for
//! byte as the released TS builds wrote them, and a marker a newer build wrote is never overwritten.
//! The ledger and the registry are in memory only (no file); [`crate::ctx::EngineCtx`] holds them.
//! [`lifecycle`] is the destructive half: CrossOver bottle creation, the wineserver kill and the guarded,
//! sibling-safe removal (D-17, D-19). [`switch`] is the engine switch: a bottle moves from one engine to
//! another (the tracer path, D-07). [`fallback_bottle`] creates a bottle with the built-in engine and
//! [`per_game`] creates a game's bottle once, with CrossOver or the built-in engine.

pub mod conf;
pub mod fallback_bottle;
pub mod ledger;
pub mod lifecycle;
pub mod marker;
pub mod paths;
pub mod per_game;
pub mod pin_marker;
pub mod prefix;
pub mod registry;
pub mod remove_per_game;
pub mod switch;

pub use marker::{BOTTLE_FILE_VERSION, ENGINE_MARKER_CHAIN, MARKER_FILE};
