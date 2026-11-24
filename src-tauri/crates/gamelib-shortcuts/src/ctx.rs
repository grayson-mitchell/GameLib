//! What every op is handed. The crate reads no environment variable and no profile path of its own:
//! the shell builds one `ShortcutsCtx` and every op takes `&ShortcutsCtx`. Later plans add fields.

use std::path::PathBuf;
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_core::process::SpecRunner;
use gamelib_core::shutdown::Shutdown;
use gamelib_store::host::StoreHost;

use crate::http::{Http, NoHttp};

/// The platform the app runs on, as the shell reports it (the crate never asks the OS).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Mac,
    Linux,
    Windows,
}

/// The directories the shell resolved for the shortcut services. Every member is the shell's
/// answer; the crate joins under them and never guesses a root of its own.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ShortcutPaths {
    /// The user's home (`AppPaths.userHome`): the macOS `~/Applications` and `~/Desktop`, the Linux
    /// `~/.local/share/applications`.
    pub user_home: PathBuf,
    /// The Windows `%APPDATA%` (the Start Menu root). `None` off Windows.
    pub app_data: Option<PathBuf>,
    /// The Linux Desktop folder as the shell resolved it (the exported `XDG_DESKTOP_DIR`, then
    /// `user-dirs.dirs`). `None`: the crate uses `<user_home>/Desktop`, the TS fallback. Windows
    /// never reads it: its Desktop is a registry value (D-12).
    pub desktop_dir: Option<PathBuf>,
    /// `AppPaths.heroicIconFolder`, where generated icons are written.
    pub icon_folder: PathBuf,
    /// The shell's own executable, the program a shortcut launches (`GAMELIB_SHELL_EXE`).
    pub shell_exe: PathBuf,
    /// The shell's working directory at boot.
    pub cwd: PathBuf,
}

impl ShortcutPaths {
    /// The folder a Linux Desktop shortcut goes in: the shell's answer, else `<user_home>/Desktop`.
    pub fn linux_desktop(&self) -> PathBuf {
        match &self.desktop_dir {
            Some(dir) => dir.clone(),
            None => self.user_home.join("Desktop"),
        }
    }
}

/// A diagnostic sink, installed by the shell. Lines carry fixed words only, never a game title, a
/// path or a renderer argument (T-28-04).
pub trait ShortcutsLog: Send + Sync {
    fn line(&self, text: &str);
}

/// Everything an op needs from outside the crate. Fields are public so the shell can fill the ones a
/// later plan adds; [`ShortcutsCtx::new`] gives each a neutral default.
pub struct ShortcutsCtx {
    /// The one owner of every store file (Phase 85). A store is opened through it, never by file I/O
    /// of this crate's own.
    pub host: Arc<StoreHost>,
    pub clock: Arc<dyn Clock>,
    pub platform: Platform,
    /// In-flight ops hold a registrant of this and race its token (D-20).
    pub shutdown: Shutdown,
    /// The directories the shell resolved.
    pub paths: ShortcutPaths,
    /// The one spawn seam (D-21): `reg.exe` and PowerShell go through it, so every child is
    /// registered and reaped with GameLib. `None` headless; an op that needs a child then answers as
    /// if the child had not run.
    pub proc: Option<Arc<dyn SpecRunner>>,
    /// The process environment `%VAR%` in a registry value expands against, snapshotted by the shell
    /// (Windows only). The crate reads no environment variable of its own.
    pub expand_env: Vec<(String, String)>,
    /// The process environment the Windows `.lnk` writer hands PowerShell (`replace_env`: it gets
    /// exactly this plus `GAMELIB_LNK_*`), snapshotted by the shell. Empty off Windows and headless.
    pub base_env: Vec<(String, String)>,
    /// `%SystemRoot%` as the shell read it; `None` or empty makes the writer use `C:\Windows`, as the TS
    /// does. The crate reads no environment variable of its own.
    pub system_root: Option<PathBuf>,
    /// The one HTTP seam (D-20): icon and artwork downloads go through it. The shell installs the
    /// reqwest-backed one; the default answers every request with an error, so nothing reaches the network
    /// by accident.
    pub http: Arc<dyn Http>,
    /// Where an op's diagnostic line goes, if anywhere.
    pub log: Option<Arc<dyn ShortcutsLog>>,
}

impl ShortcutsCtx {
    pub fn new(
        host: Arc<StoreHost>,
        clock: Arc<dyn Clock>,
        platform: Platform,
        shutdown: Shutdown,
    ) -> ShortcutsCtx {
        ShortcutsCtx {
            host,
            clock,
            platform,
            shutdown,
            paths: ShortcutPaths::default(),
            proc: None,
            expand_env: Vec::new(),
            base_env: Vec::new(),
            system_root: None,
            http: Arc::new(NoHttp),
            log: None,
        }
    }

    /// Sets the directories the shell resolved.
    pub fn with_paths(mut self, paths: ShortcutPaths) -> ShortcutsCtx {
        self.paths = paths;
        self
    }

    /// Installs the spawn seam.
    pub fn with_proc(mut self, proc: Arc<dyn SpecRunner>) -> ShortcutsCtx {
        self.proc = Some(proc);
        self
    }

    /// Sets the environment a registry `%VAR%` expands against.
    pub fn with_expand_env(mut self, env: Vec<(String, String)>) -> ShortcutsCtx {
        self.expand_env = env;
        self
    }

    /// Sets the environment the Windows `.lnk` writer passes PowerShell.
    pub fn with_base_env(mut self, env: Vec<(String, String)>) -> ShortcutsCtx {
        self.base_env = env;
        self
    }

    /// Sets `%SystemRoot%` (the folder `explorer.exe` lives in).
    pub fn with_system_root(mut self, root: Option<PathBuf>) -> ShortcutsCtx {
        self.system_root = root;
        self
    }

    /// Installs the HTTP seam.
    pub fn with_http(mut self, http: Arc<dyn Http>) -> ShortcutsCtx {
        self.http = http;
        self
    }

    /// Installs the diagnostic sink.
    pub fn with_log(mut self, log: Arc<dyn ShortcutsLog>) -> ShortcutsCtx {
        self.log = Some(log);
        self
    }

    /// Writes one diagnostic line to the installed sink, if any.
    pub fn note(&self, text: &str) {
        if let Some(log) = &self.log {
            log.line(text);
        }
    }
}
