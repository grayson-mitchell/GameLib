//! GameLib's native store (Phase 85, FND-06).
//!
//! Tauri-free, no environment reads and no keyring: the directories and the clock a store needs are
//! injected by the caller, so the crate runs headlessly on a fake HOME (`gamelib-store-cli`) and in
//! the shell alike. Decision D-05 makes every write byte-identical to what the TS store stack wrote;
//! `json` is where that is decided, `dotpath` is dot-prop 6 over it, and `atomic` is how the bytes
//! reach the disk. On top of those, `envelope` and `ops` are the store's write shape, `engine`
//! decides a file's fate on open (adopt, migrate, discard a cache, read-only, keep a corrupt file),
//! `backup` writes the side files that decision leaves, and `migrate` is the chain registry.

pub mod atomic;
pub mod backup;
pub mod dotpath;
pub mod engine;
pub mod envelope;
pub mod json;
pub mod migrate;
pub mod ops;
