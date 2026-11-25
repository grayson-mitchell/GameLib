//! The prepare steps of a launch (Phase 88.1, SVC-03), ported from `launcher.ts` and `utils.ts`: the work a
//! store manager runs before it builds its game command.
//!
//! - [`epic`]: `isEpicServiceOffline`, the Epic status check (88.1-11).
//! - [`launch`]: `prepareLaunch`, over the collaborators of [`deps`]; [`settings_log`] filters the settings
//!   its log prints and [`crossover`] reads a CrossOver bottle's folder (88.1-11).
//!
//! - [`wine_begin`]: the first half of `prepareWineLaunch`, up to the store-setup point (88.1-12); the
//!   `installed_games` file it keeps is [`installed_games`].
//! - [`wine_finish`]: the second half, from the store-setup point to the returned env (88.1-13).

pub mod crossover;
pub mod deps;
pub mod epic;
pub mod installed_games;
pub mod launch;
pub mod settings_log;
pub mod wine_begin;
pub mod wine_finish;
