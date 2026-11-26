//! The seam a game is spawned through. Production is [`ProcGameSpawner`], `gamelib_proc::spawn_game_tracked`
//! (own session, never in the `ChildSet`, a non-kill-on-close Game Job on Windows, output to the capture
//! file). A test's scripted spawner (the golden replay of the game-class cases) is handed the same spec and
//! answers a handle of its own, so what the runner asked for can be compared without the recorded program
//! having to exist.

use std::io;
use std::path::Path;

use gamelib_proc::GameHandle;

/// What a game-class run asks the spawner to start.
#[derive(Debug, Clone, Copy)]
pub struct GameSpawn<'a> {
    pub program: &'a str,
    pub argv: &'a [String],
    /// The whole environment of the game: it replaces the inherited one.
    pub env: &'a [(String, String)],
    pub cwd: Option<&'a str>,
    /// The 0600 capture file both of the game's streams are written to.
    pub capture: &'a Path,
}

/// Starts a game for a game-class run.
pub trait GameSpawner: Send + Sync {
    fn spawn(&self, spec: &GameSpawn<'_>) -> io::Result<GameHandle>;
}

/// The production spawner.
pub struct ProcGameSpawner;

impl GameSpawner for ProcGameSpawner {
    fn spawn(&self, spec: &GameSpawn<'_>) -> io::Result<GameHandle> {
        let mut cmd = std::process::Command::new(spec.program);
        cmd.args(spec.argv)
            .env_clear()
            .envs(spec.env.iter().map(|(k, v)| (k, v)));
        if let Some(cwd) = spec.cwd {
            cmd.current_dir(cwd);
        }
        gamelib_proc::spawn_game_tracked(cmd, Some(spec.capture))
    }
}
