//! The pinned fallback engine (Phase 87, SVC-02, ported from `fallbackEngine.ts` and
//! `pinnedEngineProgress.ts`, replayed against the 87-14 `golden/fallback` goldens): the Wine-Staging
//! and DXVK-macOS archives a release pins, downloaded on first need, verified, extracted into a
//! contained temp directory and renamed into place.
//!
//! - [`ensure`]: `ensure_pinned_engine` with the single flight (callers for one pin share one
//!   download), the offline answer, the retention prune after a current or previous pin installs, and
//!   the `gameStatusUpdate` reporting every store shares.
//! - [`verify`]: the archive's size, then its sha256, against the shared pin table (T-87-47).
//! - [`extract`]: `tar` through the spawn seam into a `.tmp-<kind>-*` directory, then a walk that
//!   refuses any symlink resolving outside it (T-87-48).
//! - [`prune`]: retention of unpinned engines, and every guarded delete of this module. A delete here
//!   goes through `gamelib-safety` with `<tools>/steam-engines` as its trust root (D-19).
//! - [`progress`]: the status sequence `downloading:<n>` ... `verifying` -> `extracting` -> `setting-up`.
//!
//! The stale-temp boot sweep is 87-48's.
//!
//! D-17: the work of a flight holds a `shutdown.register("engine-fallback")` registrant and a quit
//! cancels it; the temp directory is removed before the registrant is released.

pub mod ensure;
pub mod extract;
pub mod progress;
pub mod prune;
pub mod verify;

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use gamelib_core::process::SpecRunner;
use gamelib_core::shutdown::Shutdown;

use crate::ctx::EngineCtx;
use crate::fetch::Fetch;
use crate::sinks::EngineLog;

pub use ensure::Flights;

/// What a download's task needs from the context. The task outlives the call that started it (callers
/// that joined it may leave), so it holds clones of the seams, never a borrow of the context.
#[derive(Clone)]
pub struct Env {
    /// `<toolsPath>/steam-engines`.
    pub root: PathBuf,
    pub user_home: PathBuf,
    pub fetch: Arc<dyn Fetch>,
    pub proc: Arc<dyn SpecRunner>,
    pub log: Option<Arc<dyn EngineLog>>,
    pub shutdown: Shutdown,
    pub online: Arc<AtomicBool>,
    pub app_version: String,
    pub flights: Flights,
}

impl Env {
    pub fn from_ctx(ctx: &EngineCtx) -> Env {
        Env {
            root: PathBuf::from(crate::engines::pinned_engine_root(ctx)),
            user_home: ctx.paths.user_home.clone(),
            fetch: ctx.fetch.clone(),
            proc: ctx.proc.clone(),
            log: ctx.log.clone(),
            shutdown: ctx.shutdown.clone(),
            online: ctx.online.clone(),
            app_version: ctx.app_version.clone(),
            flights: ctx.fallback.clone(),
        }
    }

    /// The root as the text the path helpers take.
    pub fn root_text(&self) -> String {
        self.root.to_string_lossy().into_owned()
    }

    pub(crate) fn info(&self, line: &str) {
        if let Some(log) = &self.log {
            log.info(line);
        }
    }

    pub(crate) fn warn(&self, line: &str) {
        if let Some(log) = &self.log {
            log.warn(line);
        }
    }

    pub(crate) fn error(&self, line: &str) {
        if let Some(log) = &self.log {
            log.error(line);
        }
    }
}
