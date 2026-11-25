//! The prepare steps of a launch (Phase 88.1, SVC-03), ported from `launcher.ts` and `utils.ts`: the work a
//! store manager runs before it builds its game command.
//!
//! - [`epic`]: `isEpicServiceOffline`, the Epic status check (88.1-11).
//! - [`launch`]: `prepareLaunch`, over the collaborators of [`deps`]; [`settings_log`] filters the settings
//!   its log prints and [`crossover`] reads a CrossOver bottle's folder (88.1-11).
//!
//! 88.1-12 and 88.1-13 add the Wine prepare step beside these.

pub mod crossover;
pub mod deps;
pub mod epic;
pub mod launch;
pub mod settings_log;
