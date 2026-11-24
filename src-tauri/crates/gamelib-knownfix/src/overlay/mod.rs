//! The known-fix overlays (quick 261027-n77, Phase 88 D-03): the deterministic archive writer and strict
//! reader ([`archive`]), the sha256-pinned on-demand install ([`install`]) and the env the launcher and the
//! bridge merge into a game ([`env`]), ported from `knownFixOverlayArchive.ts`, `knownFixOverlayInstall.ts`
//! and `knownFixOverlays.ts`.
//!
//! A log line from this module carries the overlay id, the caller's label and a count or a size, never a
//! URL or a path (prohibition 1).

pub mod archive;
pub mod install;
