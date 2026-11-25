//! The prepare steps of a launch (Phase 88.1, SVC-03), ported from `launcher.ts` and `utils.ts`: the work a
//! store manager runs before it builds its game command.
//!
//! - [`epic`]: `isEpicServiceOffline`, the Epic status check (88.1-11).
//!
//! 88.1-12 and 88.1-13 add the Wine prepare step beside these.

pub mod epic;
