//! The prepare steps of a launch (Phase 88.1, SVC-03), ported from `launcher.ts` and `utils.ts`: the work a
//! store manager runs before it builds its game command.
//!
//! - [`epic`]: `isEpicServiceOffline`, the Epic status check (88.1-11).
//! - [`launch`]: `prepareLaunch`, over the collaborators of [`deps`]; [`settings_log`] filters the settings
//!   its log prints and [`crossover`] reads a CrossOver bottle's folder (88.1-11).
//!
//! - [`wine_begin`]: the first half of `prepareWineLaunch`, up to the store-setup point (88.1-12); the
//!   `installed_games` file it keeps is [`installed_games`]. 88.1-13 adds the second half.

pub mod crossover;
pub mod deps;
pub mod epic;
pub mod installed_games;
pub mod launch;
pub mod settings_log;
pub mod wine_begin;
