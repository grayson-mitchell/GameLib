//! What every op is handed. The crate reads no environment variable and no profile path of its own:
//! the shell builds one `ShortcutsCtx` and every op takes `&ShortcutsCtx`. Later plans add fields.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_core::process::{BoxFuture, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_i18n::Catalog;
use gamelib_store::host::StoreHost;
use serde::{Deserialize, Serialize};

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

/// What an op says to the operator (D-17), supplied by the shell. A notice is the OS notification a
/// renderer-path add or remove raises; a dialog is the in-app modal the Add-to-Steam step shows. Neither
/// carries a game title or path into a log line (the shell implements this without logging either).
pub trait ShortcutsUi: Send + Sync {
    /// An OS notification with the title and body unchanged.
    fn notify(&self, title: &str, body: &str);
    /// The renderer's modal dialog frame; `kind` is the dialog type (`MESSAGE`, `ERROR`).
    fn show_dialog(&self, title: &str, body: &str, kind: &str);
}

/// One Steam `shortcuts.vdf` entry as the shell's `gamelib-steamfiles` summary reports it. The JSON is the one
/// the `steamfiles_shortcuts_read` channel carries; this crate owns its own mirror because it depends on no
/// other service crate.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntrySummary {
    pub index_key: String,
    pub app_name: Option<String>,
    pub exe: Option<String>,
    pub launch_options: Option<String>,
    pub has_app_name: bool,
    pub has_exe: bool,
    pub has_launch_options: bool,
}

/// What reading one `shortcuts.vdf` found (the `steamfiles_shortcuts_read` answer).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutsSummary {
    pub exists: bool,
    pub parsed: bool,
    pub read_error: Option<String>,
    pub has_shortcuts_root: bool,
    pub root_is_list: bool,
    pub entries: Vec<EntrySummary>,
}

/// One typed field of a new shortcut entry (the `steamfiles_shortcuts_apply` `entry` array).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum EntryField {
    String { key: String, value: String },
    Int32 { key: String, value: i64 },
}

/// The described edit `steamfiles_shortcuts_apply` takes: add one entry, or remove the first entry whose
/// `AppName` equals `app_name` exactly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum ShortcutsMutation {
    Add {
        entry: Vec<EntryField>,
        #[serde(rename = "createIfMissing")]
        create_if_missing: bool,
    },
    Remove {
        #[serde(rename = "appName")]
        app_name: String,
    },
}

/// What applying one edit did (the `steamfiles_shortcuts_apply` answer).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub written: bool,
    pub read_error: Option<String>,
    pub already_present: bool,
    pub matched: bool,
    pub index_key: Option<String>,
    pub removed_exe: Option<String>,
    pub removed_app_name: Option<String>,
}

/// The only way this crate reaches Steam's `shortcuts.vdf` (D-09 item 4). The shell implements it over the
/// `gamelib-steamfiles` read and apply functions the `steamfiles_shortcuts_*` channels use, so a write is
/// the one atomic temp-and-rename write; this crate never writes the file itself and depends on neither
/// `gamelib-steamfiles` nor `gamelib-info`. `Err` is a failed call (the TS's thrown `rustInvoke`), whose text
/// is shown to the operator as it is.
pub trait SteamShortcutsFile: Send + Sync {
    fn read(&self, path: &Path) -> Result<ShortcutsSummary, String>;
    fn apply(&self, path: &Path, mutation: &ShortcutsMutation) -> Result<ApplyResult, String>;
}

/// The Steam app id of a game, from the wiki lookup the shell runs over `gamelib-info` (`info_wiki_get`).
/// A lookup that failed is `None` (WR-42: the shortcut is still written, with no Steam id).
pub trait WikiLookup: Send + Sync {
    fn steam_id(&self, title: &str, app_name: &str, runner: &str) -> BoxFuture<Option<String>>;
}

/// The portable Windows build's own executable and folder (`PORTABLE_EXECUTABLE_FILE` and
/// `PORTABLE_EXECUTABLE_DIR`), supplied by the shell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortableExe {
    pub file: PathBuf,
    pub dir: PathBuf,
}

/// Everything an op needs from outside the crate. Fields are public so the shell can fill the ones a
/// later plan adds; [`ShortcutsCtx::new`] gives each a neutral default.
#[derive(Clone)]
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
    /// Where a notice or dialog goes. `None` headless: nothing is shown, as for `notify: false`.
    pub ui: Option<Arc<dyn ShortcutsUi>>,
    /// The catalog notice text is rendered through, loaded by the shell from the bundled `locales` in the
    /// user's language. `None`: every notice renders its English default, which is also what a missing
    /// key renders.
    pub catalog: Option<Arc<Catalog>>,
    /// Steam's `shortcuts.vdf` (Add to Steam, 94-20). `None` headless: the Steam ops answer `<op>:not-ready`.
    pub steam_files: Option<Arc<dyn SteamShortcutsFile>>,
    /// The wiki Steam-id lookup. `None` is a lookup that found nothing.
    pub wiki: Option<Arc<dyn WikiLookup>>,
    /// The Flatpak app id when GameLib runs as a Flatpak (`FLATPAK_ID`): a Steam shortcut then launches
    /// `flatpak run <id>`.
    pub flatpak_id: Option<String>,
    /// `$APPIMAGE` when GameLib runs as an AppImage: the program a Steam shortcut launches off Windows.
    pub appimage: Option<String>,
    /// The portable Windows build's executable and folder: what a Steam shortcut launches on Windows.
    pub portable_exe: Option<PortableExe>,
    /// The user-data folder (`<it>/store/timestamp.json` holds each game's `lastPlayed`). `None`: every
    /// game reads as never played.
    pub user_data: Option<PathBuf>,
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
            ui: None,
            catalog: None,
            steam_files: None,
            wiki: None,
            flatpak_id: None,
            appimage: None,
            portable_exe: None,
            user_data: None,
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

    /// Installs the notice and dialog sink.
    pub fn with_ui(mut self, ui: Arc<dyn ShortcutsUi>) -> ShortcutsCtx {
        self.ui = Some(ui);
        self
    }

    /// Installs the catalog notice text is rendered through.
    pub fn with_catalog(mut self, catalog: Arc<Catalog>) -> ShortcutsCtx {
        self.catalog = Some(catalog);
        self
    }

    /// Installs the `shortcuts.vdf` seam.
    pub fn with_steam_files(mut self, files: Arc<dyn SteamShortcutsFile>) -> ShortcutsCtx {
        self.steam_files = Some(files);
        self
    }

    /// Installs the wiki Steam-id lookup.
    pub fn with_wiki(mut self, wiki: Arc<dyn WikiLookup>) -> ShortcutsCtx {
        self.wiki = Some(wiki);
        self
    }

    /// Sets how GameLib was started, for the program and arguments a Steam shortcut launches.
    pub fn with_launch_env(
        mut self,
        flatpak_id: Option<String>,
        appimage: Option<String>,
        portable_exe: Option<PortableExe>,
    ) -> ShortcutsCtx {
        self.flatpak_id = flatpak_id;
        self.appimage = appimage;
        self.portable_exe = portable_exe;
        self
    }

    /// Sets the user-data folder the `timestamp` store lives under.
    pub fn with_user_data(mut self, dir: PathBuf) -> ShortcutsCtx {
        self.user_data = Some(dir);
        self
    }

    /// Writes one diagnostic line to the installed sink, if any.
    pub fn note(&self, text: &str) {
        if let Some(log) = &self.log {
            log.line(text);
        }
    }
}
