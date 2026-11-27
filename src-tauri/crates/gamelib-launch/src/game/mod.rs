//! The game class of the command runner (88.2-10, D-05, D-29, D-07 first half): a runner call with
//! `spawnClass: game` spawns through `gamelib_proc::spawn_game_tracked` (its own session, never in the
//! `ChildSet`, a non-kill-on-close Game Job on Windows), writes to a private capture file that Rust
//! tails, and is registered in the [`registry::TrackedRegistry`] for as long as it runs.
//!
//! - [`capture`]: the capture file's name and mode, and the tailer that turns its growth into chunks.
//! - [`end`]: when a game run is over (`close`: leader and its whole group; `exit`: the leader plus the
//!   TS drain grace).
//! - [`record`]: the per-launch record a funnel launch leaves on disk for a later start to re-adopt the game
//!   from (88.3-07).
//! - [`registry`]: the tracked registry: register and unregister of a run, the running-game read and the
//!   kills (88.2-11).
//! - [`spawn`]: the seam a game is spawned through.
//!
//! Nothing here holds a pipe to the game (Pitfall 5): a game holding the read end of a pipe whose writer
//! died can take SIGPIPE, so the game's output goes to a file and GameLib is only a reader of it.

pub mod capture;
pub mod end;
pub mod record;
pub mod registry;
pub mod spawn;
