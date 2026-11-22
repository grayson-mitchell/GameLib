//! What every op is handed. The crate reads no environment variable and no profile path of its own:
//! the shell (or the CLI) builds one `InfoCtx` and every op takes `&InfoCtx`.

use std::path::PathBuf;
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_store::host::StoreHost;

use crate::crossover::CrossoverState;
use crate::http::Http;
use crate::itad::gate::ItadGate;
use crate::recent::RecentSink;
use crate::secrets::{ItadKey, SecretSource, SgdbKey, Slot};

/// The platform the app runs on, as the shell reports it (the crate never asks the OS).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Mac,
    Linux,
    Windows,
}

/// Directories the shell resolves. Store files live under `user_data` (`store_cache/<name>.json`);
/// `app_folder` holds the settings documents and the scratch files that sit outside the store tree.
#[derive(Debug, Clone)]
pub struct InfoPaths {
    pub app_folder: PathBuf,
    pub user_data: PathBuf,
    pub temp: PathBuf,
    /// The bundled `public` directory, where the shell knows it (a later slice's offline fallback).
    pub public_dir: Option<PathBuf>,
}

/// Where an op's diagnostic lines go (`gamelib.log` in the shell). The crate has no logger of its own.
/// A line is fixed text plus at most a page number, a status code or one of the transport categories:
/// never a URL, a key, a token or any text a server sent.
pub trait InfoLog: Send + Sync {
    fn line(&self, text: &str);
}

/// Everything an op needs from outside the crate. Fields are public so the shell can fill the ones
/// a later slice adds; [`InfoCtx::new`] gives each a neutral default.
pub struct InfoCtx {
    /// The one owner of every store file (Phase 85). A cache or user-state store is opened through
    /// it, never by file I/O of this crate's own.
    pub host: Arc<StoreHost>,
    pub clock: Arc<dyn Clock>,
    pub platform: Platform,
    pub paths: InfoPaths,
    pub app_version: String,
    /// In-flight ops hold a registrant of this and race its token (D-20).
    pub shutdown: Shutdown,
    pub http: Arc<dyn Http>,
    /// The Keychain-backed source the shell installs (86-14); `None` in the CLI
    /// unless it passes its environment source. An op that needs a key and finds `None` answers
    /// `<op>:no-secret-source`.
    pub secrets: Option<Arc<dyn SecretSource>>,
    /// The ITAD key compiled into the build (`option_env!("ITAD_API_KEY")` in the shell).
    pub itad_baked_key: Option<String>,
    /// The ITAD key from `GAMELIB_ITAD_API_KEY`, read once by the shell at boot.
    pub itad_env_key: Option<String>,
    /// Told about every change of the recent-games list (D-08); `None` in the CLI and in tests
    /// that do not watch it.
    pub recent_sink: Option<Arc<dyn RecentSink>>,
    /// The key owners (86-14). They live here so their read caches and the ITAD `rejected` flag
    /// are per context, that is per process in the shell.
    pub itad_key: ItadKey,
    pub sgdb_key: SgdbKey,
    /// The ITAD rate-limit gate and single-flight (86-16): in-memory session state, like the key's
    /// `rejected` flag, so a restart forgets a block.
    pub itad_gate: ItadGate,
    /// Where [`InfoCtx::note`] writes; `None` in the CLI and in tests that do not read it (86-18).
    pub log: Option<Arc<dyn InfoLog>>,
    /// The CrossOver index's in-memory state: the failure back-off and the memoized lookup maps (86-19).
    pub crossover: CrossoverState,
}

impl InfoCtx {
    pub fn new(
        host: Arc<StoreHost>,
        clock: Arc<dyn Clock>,
        platform: Platform,
        paths: InfoPaths,
        app_version: String,
        shutdown: Shutdown,
        http: Arc<dyn Http>,
    ) -> InfoCtx {
        InfoCtx {
            host,
            clock,
            platform,
            paths,
            app_version,
            shutdown,
            http,
            secrets: None,
            itad_baked_key: None,
            itad_env_key: None,
            recent_sink: None,
            itad_key: ItadKey::new(),
            sgdb_key: SgdbKey::new(),
            itad_gate: ItadGate::new(),
            log: None,
            crossover: CrossoverState::new(),
        }
    }

    /// Writes one diagnostic line to the installed [`InfoLog`], if any.
    pub fn note(&self, text: &str) {
        if let Some(log) = &self.log {
            log.line(text);
        }
    }

    /// The stored key for `slot`, for op `op`. `Err("<op>:no-secret-source")` when no source is
    /// installed; `Ok(None)` when the slot is empty. The error never names a value.
    pub fn secret(&self, op: &str, slot: Slot) -> Result<Option<String>, String> {
        match &self.secrets {
            Some(source) => source.get(slot).map_err(|e| format!("{op}:secret-{e}")),
            None => Err(format!("{op}:no-secret-source")),
        }
    }
}
