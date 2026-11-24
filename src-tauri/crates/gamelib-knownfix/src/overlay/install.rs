//! Verified on-demand install of a tier-2 known-fix overlay (quick 261027-n77, Phase 88 D-03), ported from
//! `src/backend/knownFixOverlayInstall.ts`.
//!
//! RED stage (88-10 task 2): the shapes only. The bodies are inert, so the replay in
//! `tests/golden_overlay_install.rs` fails on its assertions and not on a build error.

use std::path::{Path, PathBuf};

use crate::catalogue::OverlayCatalogueEntry;
use crate::ctx::KnownFixCtx;

/// Why an installed overlay directory is not a verified one.
#[derive(Debug)]
pub enum VerifyError {
    /// Nothing is verified yet.
    Inert,
}

impl VerifyError {
    /// The reason as the TS words it.
    pub fn reason(&self) -> String {
        String::new()
    }
}

/// Whether `id` is an overlay id the installer accepts (`^[a-z0-9][a-z0-9.-]{0,63}$`).
pub fn is_valid_overlay_id(_id: &str) -> bool {
    true
}

/// Checks an installed overlay directory against the entry's pins.
pub fn verify_installed_overlay(
    _dir: &Path,
    _entry: &OverlayCatalogueEntry,
) -> Result<(), VerifyError> {
    Ok(())
}

/// Installs `entry` on demand; `None` is the fail-open answer.
pub async fn ensure_overlay_installed(
    _ctx: &KnownFixCtx,
    _entry: &OverlayCatalogueEntry,
    _label: &str,
) -> Option<PathBuf> {
    None
}
