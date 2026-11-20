//! Traits and composition-root types the rest of the native stack depends on (Phase 83, FND-04).
//!
//! The ruling: core holds traits and shared composition-root types only. Implementation crates
//! (`gamelib-proc` implements [`process::ProcessRunner`]) and domain crates (`gamelib-steampoll`,
//! `gamelib-depot`, ...) depend on core and never on each other except by trait. Core has no
//! `tauri` dependency and builds no tokio runtime of its own.

pub mod clock;
pub mod process;
pub mod shutdown;
