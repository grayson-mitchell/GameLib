//! The launch builders (88.1-06, D-01): the pure functions the launcher assembles a game's command and
//! environment from, ported from `launcher.ts` and `gamescopeCommand.ts` and replayed against the goldens
//! 88.1-01 recorded from the TypeScript (`tests/golden_builders.rs`).
//!
//! - [`wrappers`]: `setupWrapperEnvVars`, `setupWrappers` and the npm-shlex `split` / `join` they use.
//!
//! Every function takes what the TS read from `process.env` or the OS as an argument; the crate reads
//! neither.

pub mod wrappers;
