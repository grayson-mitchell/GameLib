//! gamelib-proc: how GameLib spawns, tracks and kills child processes (Phase 83, D-11, D-15).
//!
//! Tauri-free. `SpawnClass::Helper` children are tied to GameLib's life (own process group on
//! unix, own kill-on-close Job on Windows, registered in the `ChildSet` the exit path drains);
//! `SpawnClass::Game` children are the user's and outlive GameLib.

pub mod children;
pub mod diag;
pub mod kill_tree;
pub mod probe;
pub mod spawn;

pub use children::{global, ChildSet, HelperGuard};
pub use diag::set_diag_sink;
pub use spawn::{spawn_helper, spawn_helper_with_stdout, SpawnClass};
