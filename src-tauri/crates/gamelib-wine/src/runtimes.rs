//! The Wine runtimes (EAC, BattlEye, umu): the lutris.net list, "is this one current" and the
//! download. A port of `src/backend/wine/runtimes/runtimes.ts`.
//!
//! A runtime lives in `<runtime_path>/<name>/` with a `current_version` file holding the list's
//! `created_at` for the build that was extracted there. The crate reads no environment and no
//! profile path: `<runtime_path>` arrives in [`WineCtx`], every request goes through `ctx.fetch`
//! (D-08) and every child through `ctx.proc` (D-17).
//!
//! The download replaces an installed runtime: the old directory is removed through `gamelib-safety`
//! with `<runtime_path>` as the trust root (D-19), never by a recursive delete of this crate's own.
//! A refusal (anything but a clean yes) stops the download and leaves the old install alone.
//!
//! No error here carries a URL, a path or a response body: a failure is a category word (T-87-09).

use std::fmt;
use std::path::Path;

use gamelib_engine::fetch::{FetchError, FetchRequest};
use gamelib_safety::remove::remove_tree;
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Outcome, Request, Target, TargetKind};
use serde_json::Value;

use crate::ctx::WineCtx;
use crate::extract::{extract_tar, ExtractError};

/// The list of runtimes, one GET (`runtimes.ts` `_get`).
pub const LIST_URL: &str = "https://lutris.net/api/runtimes";

/// axios's default `Accept`, which the TS sent and the recordings pin.
const ACCEPT: &str = "application/json, text/plain, */*";

/// The longest runtime name the ops accept. The real names are 5 to 16 characters.
const NAME_MAX: usize = 64;

/// The three runtimes the renderer can ask about (`RuntimeName` in `common/types`). The shell
/// accepts only these; the crate's ops accept any [`valid_name`] so a golden can replay the TS cases
/// for a name the list does not hold.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeName {
    EacRuntime,
    BattleyeRuntime,
    Umu,
}

impl RuntimeName {
    pub const ALL: [RuntimeName; 3] = [
        RuntimeName::EacRuntime,
        RuntimeName::BattleyeRuntime,
        RuntimeName::Umu,
    ];

    /// The name the list, the directory and the renderer use.
    pub fn as_str(self) -> &'static str {
        match self {
            RuntimeName::EacRuntime => "eac_runtime",
            RuntimeName::BattleyeRuntime => "battleye_runtime",
            RuntimeName::Umu => "umu",
        }
    }

    /// `None` for anything but the three names, exactly (no case folding, no trimming).
    pub fn parse(text: &str) -> Option<RuntimeName> {
        RuntimeName::ALL.into_iter().find(|n| n.as_str() == text)
    }
}

/// One entry of the lutris list. Only what the runtimes slice reads; a field the list omits (or
/// gives as something else) is `None`, as `undefined` was in the TS.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Runtime {
    pub name: String,
    pub created_at: Option<String>,
    pub url: Option<String>,
}

impl Runtime {
    fn from_value(value: &Value) -> Option<Runtime> {
        let object = value.as_object()?;
        let text = |key: &str| object.get(key).and_then(Value::as_str).map(str::to_string);
        Some(Runtime {
            name: text("name")?,
            created_at: text("created_at"),
            url: text("url"),
        })
    }
}

/// Why the list could not be had.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListError {
    /// The runtimes directory could not be created.
    Io,
    /// The request failed or answered a non-2xx status.
    Fetch(FetchError),
    /// The body was not the JSON array the list is.
    NotAList,
}

impl std::fmt::Display for ListError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ListError::Io => f.write_str("io"),
            ListError::Fetch(e) => write!(f, "fetch {e}"),
            ListError::NotAList => f.write_str("not-a-list"),
        }
    }
}

/// A runtime name an op will build a path from: 1 to [`NAME_MAX`] ASCII letters, digits, `_` or
/// `-`. Anything else (a separator, `..`, a drive colon, a NUL) could name a directory outside
/// `<runtime_path>`, so it is refused before any path is built.
pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= NAME_MAX
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// A request carrying the headers the TS client sent: the axios `Accept` and the GameLib agent.
pub(crate) fn request(ctx: &WineCtx, url: &str) -> FetchRequest {
    FetchRequest::get(url)
        .header("Accept", ACCEPT)
        .gamelib_agent(&ctx.engine.app_version)
}

pub(crate) fn log_error(ctx: &WineCtx, line: &str) {
    if let Some(log) = &ctx.engine.log {
        log.error(line);
    }
}

/// The lutris runtimes list (`_get`): creates `<runtime_path>` first, then one GET. A body that is
/// empty or JSON `null` is an empty list, as the TS `|| []` made it.
pub async fn list(ctx: &WineCtx) -> Result<Vec<Runtime>, ListError> {
    std::fs::create_dir_all(&ctx.runtime_path).map_err(|_| ListError::Io)?;
    let response = ctx
        .fetch
        .get(request(ctx, LIST_URL))
        .await
        .and_then(|r| r.error_for_status())
        .map_err(ListError::Fetch)?;
    if response.body.is_empty() {
        log_error(ctx, "Failed to fetch runtime list");
        return Ok(Vec::new());
    }
    match serde_json::from_slice::<Value>(&response.body) {
        Ok(Value::Null) => {
            log_error(ctx, "Failed to fetch runtime list");
            Ok(Vec::new())
        }
        Ok(Value::Array(items)) => Ok(items.iter().filter_map(Runtime::from_value).collect()),
        _ => Err(ListError::NotAList),
    }
}

/// Is `name` installed and current (`isInstalled`)?
///
/// - No `<runtime_path>/<name>` directory: `false`, and the list is not fetched.
/// - The list cannot be had, or does not hold `name`: `true`. A runtime that cannot be looked up
///   cannot be downloaded either, so offering a download would only loop.
/// - Otherwise: the directory's `current_version` equals the list's `created_at` exactly. A missing
///   or unreadable `current_version` is `false`.
pub async fn is_installed(ctx: &WineCtx, name: &str) -> bool {
    if !valid_name(name) {
        return false;
    }
    let dir = ctx.runtime_path.join(name);
    if !dir.exists() {
        return false;
    }
    let runtimes = list(ctx).await.unwrap_or_default();
    let Some(runtime) = runtimes.iter().find(|r| r.name == name) else {
        log_error(ctx, "Runtime not found in runtime list");
        return true;
    };
    let version_path = dir.join("current_version");
    if !version_path.exists() {
        return false;
    }
    let Ok(bytes) = std::fs::read(&version_path) else {
        return false;
    };
    match &runtime.created_at {
        Some(created_at) => created_at.as_bytes() == String::from_utf8_lossy(&bytes).as_bytes(),
        None => false,
    }
}

/// Why a download stopped. A category only; the caller (the op) answers `false` and logs the word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadError {
    /// The runtime name is not a plain path component.
    BadName,
    /// The list could not be had.
    List(ListError),
    /// The list does not hold the name (`Runtime <name> was not found in runtime list`).
    NotListed,
    /// The listed runtime has no usable `url` or `created_at`, or its archive name is not a plain
    /// file name.
    BadEntry,
    /// The archive could not be downloaded.
    Download(FetchError),
    /// `gamelib-safety` did not say yes to removing the old install (D-19): a refusal, an unknown or a
    /// failed delete. The old install is untouched unless the delete itself failed part way.
    ReplaceRefused,
    /// Extraction failed or was refused.
    Extract(ExtractError),
    /// `current_version` could not be written.
    WriteVersion,
}

impl fmt::Display for DownloadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DownloadError::BadName => f.write_str("bad-name"),
            DownloadError::List(e) => write!(f, "list {e}"),
            DownloadError::NotListed => f.write_str("not-listed"),
            DownloadError::BadEntry => f.write_str("bad-entry"),
            DownloadError::Download(e) => write!(f, "download {e}"),
            DownloadError::ReplaceRefused => f.write_str("replace-refused"),
            DownloadError::Extract(e) => write!(f, "extract {e}"),
            DownloadError::WriteVersion => f.write_str("write-version"),
        }
    }
}

/// The file name of an archive URL (`url.split('/').pop()`), when it is one plain file name: not
/// empty, not `.` or `..`, no separator, no drive colon, no NUL. A listed URL is the list's, which
/// is untrusted, and this name is joined onto `<runtime_path>`.
pub fn archive_file_name(url: &str) -> Option<&str> {
    let name = url.rsplit('/').next()?;
    let plain =
        !name.is_empty() && name != "." && name != ".." && !name.contains(['\\', ':', '\0']);
    plain.then_some(name)
}

/// Removes `path` through `gamelib-safety` with `<runtime_path>` as the trust root. A path that is
/// the root itself, outside it, a link out of it or unresolvable is refused; a link inside it is
/// unlinked and its referent left (D-15). Only `Removed` is `Ok`.
fn remove_guarded(ctx: &WineCtx, path: &Path) -> Result<(), DownloadError> {
    let text = |p: &Path| p.to_str().map(str::to_string);
    let (Some(target), Some(root)) = (text(path), text(&ctx.runtime_path)) else {
        return Err(DownloadError::ReplaceRefused);
    };
    let request = Request {
        targets: vec![Target {
            id: "runtime".to_string(),
            path: target,
            kind: TargetKind::AppData,
            trust_root: Some(root),
            executable: None,
        }],
        // No game owns a runtime directory: the list is known and empty, not unreadable.
        known_installs: Some(Vec::new()),
        self_key: None,
        protected_roots: [
            &ctx.engine.paths.user_home,
            &ctx.engine.paths.app_folder,
            &ctx.engine.paths.tools_path,
        ]
        .into_iter()
        .filter_map(|p| text(p))
        .collect(),
    };
    match remove_tree(&request, CaseMode::Auto).outcome {
        Outcome::Removed => Ok(()),
        Outcome::Refused | Outcome::Failed => Err(DownloadError::ReplaceRefused),
    }
}

/// Downloads and installs `name` (`download`): the list, the pick, the archive to `<runtime_path>`,
/// the old extracted folder removed through `gamelib-safety`, the extraction with strip 1,
/// `current_version` written with the list's `created_at`, the archive removed. The archive is also
/// removed when a step after its download fails.
///
/// Where the TS carried on, this stops: a `tar` that failed (the TS ignored its result and wrote
/// `current_version` over an empty folder, which then read as current) and an archive that made a
/// link out of its folder (the folder is removed again).
async fn try_download(ctx: &WineCtx, name: &str) -> Result<(), DownloadError> {
    if !valid_name(name) {
        return Err(DownloadError::BadName);
    }
    let runtimes = list(ctx).await.map_err(DownloadError::List)?;
    let runtime = runtimes
        .iter()
        .find(|r| r.name == name)
        .ok_or(DownloadError::NotListed)?;
    let (Some(url), Some(created_at)) = (runtime.url.as_deref(), runtime.created_at.as_deref())
    else {
        return Err(DownloadError::BadEntry);
    };
    let file_name = archive_file_name(url).ok_or(DownloadError::BadEntry)?;
    let archive = ctx.runtime_path.join(file_name);

    ctx.fetch
        .download(
            request(ctx, url),
            &archive,
            &|_| {},
            // The app shutdown stops a download still running when GameLib quits.
            ctx.engine.shutdown.token(),
        )
        .await
        .map_err(DownloadError::Download)?;
    let installed = install_archive(ctx, name, &archive, created_at).await;
    // The archive is not kept: best effort, the install above already has its answer.
    let _ = std::fs::remove_file(&archive);
    installed
}

async fn install_archive(
    ctx: &WineCtx,
    name: &str,
    archive: &Path,
    created_at: &str,
) -> Result<(), DownloadError> {
    let extracted = ctx.runtime_path.join(name);
    if extracted.symlink_metadata().is_ok() {
        remove_guarded(ctx, &extracted)?;
    }
    if let Err(error) = extract_tar(ctx, archive, &extracted, 1).await {
        // Whatever was extracted is not a runtime: remove it (the same guard) so it is not left
        // looking installed.
        let _ = remove_guarded(ctx, &extracted);
        return Err(DownloadError::Extract(error));
    }
    std::fs::write(extracted.join("current_version"), created_at)
        .map_err(|_| DownloadError::WriteVersion)
}

/// The download as the op answers it: `true` once the runtime is installed, `false` for any failure
/// (logged as its category), as `download` returned `false` from its `catch`.
pub async fn download(ctx: &WineCtx, name: &str) -> bool {
    match try_download(ctx, name).await {
        Ok(()) => true,
        Err(error) => {
            log_error(ctx, &format!("Failed to download runtime {name}: {error}"));
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_engine::fetch::{DownloadOutcome, Fetch, FetchFuture, FetchResponse, Progress};
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::path::Path;
    use std::sync::Arc;
    use tokio_util::sync::CancellationToken;

    /// A list endpoint that answers one fixed thing: a status and a body, or a transport failure.
    struct FixedList(Result<(u16, &'static str), FetchError>);

    impl Fetch for FixedList {
        fn get(&self, _req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
            let answer = self.0.map(|(status, body)| FetchResponse {
                status,
                headers: Vec::new(),
                body: body.as_bytes().to_vec(),
            });
            Box::pin(async move { answer })
        }

        fn download<'a>(
            &'a self,
            _req: FetchRequest,
            _dest: &'a Path,
            _progress: &'a (dyn Fn(Progress) + Send + Sync),
            _cancel: CancellationToken,
        ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
            Box::pin(async { Err(FetchError::Network) })
        }
    }

    fn ctx_with(home: &FakeHome, list: FixedList) -> WineCtx {
        let root = home.root().to_path_buf();
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_fetch(Arc::new(list));
        WineCtx::new(Arc::new(engine), root.join("tools").join("runtimes"))
    }

    fn install_dir(ctx: &WineCtx, name: &str) {
        std::fs::create_dir_all(ctx.runtime_path.join(name)).unwrap();
    }

    #[tokio::test]
    async fn a_list_that_cannot_be_had_reports_an_install_directory_as_installed() {
        // The TS `_get(...).catch(() => [])`: no list, so the runtime is "not found", which says
        // installed so a download that cannot work is not offered in a loop.
        for list in [
            FixedList(Err(FetchError::Network)),
            FixedList(Ok((500, "oops"))),
            FixedList(Ok((200, "<html>not json</html>"))),
            FixedList(Ok((200, "{\"not\":\"a list\"}"))),
        ] {
            let home = FakeHome::new("wine-rt-");
            let ctx = ctx_with(&home, list);
            install_dir(&ctx, "eac_runtime");
            assert!(is_installed(&ctx, "eac_runtime").await);
        }
    }

    #[tokio::test]
    async fn an_empty_or_null_list_is_an_empty_list() {
        for body in ["", "null"] {
            let home = FakeHome::new("wine-rt-");
            let ctx = ctx_with(&home, FixedList(Ok((200, body))));
            assert_eq!(list(&ctx).await, Ok(Vec::new()), "{body:?}");
        }
    }

    #[tokio::test]
    async fn a_listed_runtime_with_no_created_at_is_never_current() {
        let home = FakeHome::new("wine-rt-");
        let ctx = ctx_with(&home, FixedList(Ok((200, "[{\"name\":\"umu\"}]"))));
        install_dir(&ctx, "umu");
        std::fs::write(ctx.runtime_path.join("umu").join("current_version"), "x").unwrap();
        assert!(!is_installed(&ctx, "umu").await);
    }

    #[tokio::test]
    async fn current_version_is_compared_byte_for_byte() {
        let body = "[{\"name\":\"umu\",\"created_at\":\"2026-01-01T00:00:00Z\"}]";
        for (written, want) in [
            ("2026-01-01T00:00:00Z", true),
            ("2026-01-01T00:00:00Z\n", false),
            (" 2026-01-01T00:00:00Z", false),
            ("", false),
        ] {
            let home = FakeHome::new("wine-rt-");
            let ctx = ctx_with(&home, FixedList(Ok((200, body))));
            install_dir(&ctx, "umu");
            std::fs::write(
                ctx.runtime_path.join("umu").join("current_version"),
                written,
            )
            .unwrap();
            assert_eq!(is_installed(&ctx, "umu").await, want, "{written:?}");
        }
    }

    #[tokio::test]
    async fn an_invalid_name_is_never_installed_and_never_touches_the_list() {
        let home = FakeHome::new("wine-rt-");
        let ctx = ctx_with(&home, FixedList(Err(FetchError::Network)));
        for bad in ["", "..", "../umu", "a/b"] {
            assert!(!is_installed(&ctx, bad).await, "{bad:?}");
        }
        assert!(!ctx.runtime_path.exists(), "the list was fetched");
    }

    #[test]
    fn the_runtime_names_are_exactly_the_three_the_renderer_asks_about() {
        let names: Vec<&str> = RuntimeName::ALL.iter().map(|n| n.as_str()).collect();
        assert_eq!(names, ["eac_runtime", "battleye_runtime", "umu"]);
        for name in names {
            assert_eq!(
                RuntimeName::parse(name).map(RuntimeName::as_str),
                Some(name)
            );
        }
        for bad in ["", "x", "EAC_RUNTIME", " umu", "umu ", "umu\0", "../umu"] {
            assert_eq!(RuntimeName::parse(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn a_valid_name_is_one_plain_path_component() {
        for ok in ["eac_runtime", "battleye_runtime", "umu", "not-a-runtime"] {
            assert!(valid_name(ok), "{ok}");
        }
        for bad in [
            "",
            ".",
            "..",
            "../x",
            "a/b",
            "a\\b",
            "c:x",
            "a\0b",
            " a",
            &"x".repeat(NAME_MAX + 1),
        ] {
            assert!(!valid_name(bad), "{bad:?}");
        }
    }

    #[test]
    fn a_list_entry_keeps_only_what_the_slice_reads() {
        let entry = serde_json::json!({
            "id": 5, "name": "umu", "created_at": "2026-01-01T00:00:00Z", "url": "https://x/y.tar",
            "architecture": "all"
        });
        assert_eq!(
            Runtime::from_value(&entry),
            Some(Runtime {
                name: "umu".into(),
                created_at: Some("2026-01-01T00:00:00Z".into()),
                url: Some("https://x/y.tar".into()),
            })
        );
        let sparse = serde_json::json!({ "name": "icons", "created_at": null });
        assert_eq!(
            Runtime::from_value(&sparse),
            Some(Runtime {
                name: "icons".into(),
                created_at: None,
                url: None
            })
        );
        assert_eq!(Runtime::from_value(&serde_json::json!({ "id": 1 })), None);
        assert_eq!(Runtime::from_value(&serde_json::json!("umu")), None);
    }

    // ---- the download (87-17 task 2) ----

    use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
    use gamelib_engine::testing::ScriptedSpecRunner;
    use gamelib_testutil::{make_dir_link, require_link, LinkKind};
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// The lutris list and one archive: `get` answers the list, `download` writes the archive bytes
    /// to the destination and counts the call.
    struct FakeLutris {
        list: String,
        downloads: Arc<AtomicUsize>,
    }

    impl FakeLutris {
        fn serving(url: &str, created_at: &str) -> (FakeLutris, Arc<AtomicUsize>) {
            let list = serde_json::json!([
                { "name": "eac_runtime", "created_at": created_at, "url": url }
            ])
            .to_string();
            let downloads = Arc::new(AtomicUsize::new(0));
            (
                FakeLutris {
                    list,
                    downloads: Arc::clone(&downloads),
                },
                downloads,
            )
        }
    }

    impl Fetch for FakeLutris {
        fn get(&self, _req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
            let body = self.list.clone().into_bytes();
            Box::pin(async move {
                Ok(FetchResponse {
                    status: 200,
                    headers: Vec::new(),
                    body,
                })
            })
        }

        fn download<'a>(
            &'a self,
            _req: FetchRequest,
            dest: &'a Path,
            _progress: &'a (dyn Fn(Progress) + Send + Sync),
            _cancel: CancellationToken,
        ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
            self.downloads.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move {
                std::fs::write(dest, b"archive").map_err(|_| FetchError::Io)?;
                Ok(DownloadOutcome {
                    bytes: 7,
                    sha256: String::new(),
                })
            })
        }
    }

    /// A `tar` that extracts a file and, when asked, a symlink out of the destination.
    struct FakeTar {
        code: i32,
        link_to: Option<std::path::PathBuf>,
    }

    impl SpecRunner for FakeTar {
        fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
            let dest = std::path::PathBuf::from(&spec.argv[3]);
            let (code, link_to) = (self.code, self.link_to.clone());
            Box::pin(async move {
                std::fs::write(dest.join("payload"), b"x").unwrap();
                if let Some(target) = link_to {
                    let made = make_dir_link(&target, &dest.join("evil"), LinkKind::Symlink);
                    assert!(require_link(made, "a symlink", std::env::var("CI").is_ok()));
                }
                SpecOutput {
                    code: Some(code),
                    ..SpecOutput::default()
                }
            })
        }
    }

    fn ctx_for_download(home: &FakeHome, fetch: FakeLutris, proc: Arc<dyn SpecRunner>) -> WineCtx {
        let root = home.root().to_path_buf();
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_fetch(Arc::new(fetch))
        .with_proc(proc);
        WineCtx::new(Arc::new(engine), root.join("tools").join("runtimes"))
    }

    const ARCHIVE_URL: &str = "https://example.test/dl/eac_runtime-1.tar.xz";
    const CREATED_AT: &str = "2026-01-01T00:00:00Z";

    fn runtime_files(ctx: &WineCtx) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(&ctx.runtime_path)
            .map(|d| {
                d.map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }

    #[test]
    fn an_archive_file_name_is_one_plain_file_name() {
        assert_eq!(archive_file_name(ARCHIVE_URL), Some("eac_runtime-1.tar.xz"));
        assert_eq!(archive_file_name("plain.tar"), Some("plain.tar"));
        for bad in [
            "",
            "https://x/",
            "https://x/.",
            "https://x/..",
            "https://x/a\\b",
            "https://x/c:evil",
            "https://x/a\0b",
        ] {
            assert_eq!(archive_file_name(bad), None, "{bad:?}");
        }
    }

    #[tokio::test]
    async fn a_download_replaces_an_installed_runtime_through_the_guard() {
        let home = FakeHome::new("wine-rt-");
        let (fetch, downloads) = FakeLutris::serving(ARCHIVE_URL, CREATED_AT);
        let tar = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program(
            "tar",
            SpecOutput {
                code: Some(0),
                ..SpecOutput::default()
            },
        ));
        let ctx = ctx_for_download(&home, fetch, tar.clone());
        let old = ctx.runtime_path.join("eac_runtime");
        std::fs::create_dir_all(old.join("nested")).unwrap();
        std::fs::write(old.join("nested").join("old-file"), b"stale").unwrap();

        assert!(download(&ctx, "eac_runtime").await);
        assert_eq!(downloads.load(Ordering::SeqCst), 1);
        // The old tree is gone, the new folder carries current_version, the archive is gone.
        assert!(!old.join("nested").exists());
        assert_eq!(
            std::fs::read_to_string(old.join("current_version")).unwrap(),
            CREATED_AT
        );
        assert_eq!(runtime_files(&ctx), ["eac_runtime"]);
        assert_eq!(tar.spawns().len(), 1);
        assert!(is_installed(&ctx, "eac_runtime").await);
    }

    #[tokio::test]
    async fn a_tar_that_fails_leaves_no_runtime_no_version_and_no_archive() {
        // The TS ignored tar's result and wrote current_version over an empty folder, which then
        // read as current. Here the download is false and nothing is left looking installed.
        let home = FakeHome::new("wine-rt-");
        let (fetch, _) = FakeLutris::serving(ARCHIVE_URL, CREATED_AT);
        let ctx = ctx_for_download(
            &home,
            fetch,
            Arc::new(FakeTar {
                code: 2,
                link_to: None,
            }),
        );
        assert!(!download(&ctx, "eac_runtime").await);
        assert!(runtime_files(&ctx).is_empty(), "{:?}", runtime_files(&ctx));
    }

    #[tokio::test]
    async fn an_archive_that_links_outside_is_refused_and_its_folder_removed() {
        let home = FakeHome::new("wine-rt-");
        let outside = home.root().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("keep"), b"k").unwrap();
        let (fetch, _) = FakeLutris::serving(ARCHIVE_URL, CREATED_AT);
        let ctx = ctx_for_download(
            &home,
            fetch,
            Arc::new(FakeTar {
                code: 0,
                link_to: Some(outside.clone()),
            }),
        );
        assert!(!download(&ctx, "eac_runtime").await);
        // The extracted folder (with its link) is gone, the archive too, and the link was unlinked,
        // never followed: what it pointed at is intact.
        assert!(runtime_files(&ctx).is_empty(), "{:?}", runtime_files(&ctx));
        assert_eq!(std::fs::read(outside.join("keep")).unwrap(), b"k");
    }

    #[tokio::test]
    async fn an_install_that_is_a_link_out_is_unlinked_not_followed_when_replaced() {
        let home = FakeHome::new("wine-rt-");
        let outside = home.root().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("keep"), b"k").unwrap();
        let (fetch, _) = FakeLutris::serving(ARCHIVE_URL, CREATED_AT);
        let ctx = ctx_for_download(
            &home,
            fetch,
            Arc::new(FakeTar {
                code: 0,
                link_to: None,
            }),
        );
        std::fs::create_dir_all(&ctx.runtime_path).unwrap();
        let made = make_dir_link(
            &outside,
            &ctx.runtime_path.join("eac_runtime"),
            LinkKind::Symlink,
        );
        assert!(require_link(made, "a symlink", std::env::var("CI").is_ok()));

        assert!(download(&ctx, "eac_runtime").await);
        assert_eq!(std::fs::read(outside.join("keep")).unwrap(), b"k");
        assert!(
            !outside.join("payload").exists(),
            "extracted through the link"
        );
        let installed = ctx.runtime_path.join("eac_runtime");
        assert!(std::fs::symlink_metadata(&installed).unwrap().is_dir());
        assert!(installed.join("payload").exists());
    }

    #[tokio::test]
    async fn an_unsafe_archive_name_or_an_incomplete_entry_downloads_nothing() {
        for (url, created_at) in [
            ("https://example.test/dl/..", CREATED_AT),
            ("https://example.test/dl/", CREATED_AT),
        ] {
            let home = FakeHome::new("wine-rt-");
            let (fetch, downloads) = FakeLutris::serving(url, created_at);
            let ctx = ctx_for_download(
                &home,
                fetch,
                Arc::new(FakeTar {
                    code: 0,
                    link_to: None,
                }),
            );
            assert!(!download(&ctx, "eac_runtime").await, "{url}");
            assert_eq!(downloads.load(Ordering::SeqCst), 0, "{url}");
        }
        // An entry with no created_at has nothing to write to current_version.
        let home = FakeHome::new("wine-rt-");
        let (mut fetch, downloads) = FakeLutris::serving(ARCHIVE_URL, CREATED_AT);
        fetch.list = "[{\"name\":\"eac_runtime\",\"url\":\"https://example.test/a.tar\"}]".into();
        let ctx = ctx_for_download(
            &home,
            fetch,
            Arc::new(FakeTar {
                code: 0,
                link_to: None,
            }),
        );
        assert!(!download(&ctx, "eac_runtime").await);
        assert_eq!(downloads.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn a_name_the_list_does_not_hold_or_a_bad_name_is_false() {
        let home = FakeHome::new("wine-rt-");
        let (fetch, downloads) = FakeLutris::serving(ARCHIVE_URL, CREATED_AT);
        let ctx = ctx_for_download(
            &home,
            fetch,
            Arc::new(FakeTar {
                code: 0,
                link_to: None,
            }),
        );
        assert!(!download(&ctx, "not-a-runtime").await);
        assert!(!download(&ctx, "../escape").await);
        assert_eq!(downloads.load(Ordering::SeqCst), 0);
        assert!(!home.root().join("escape").exists());
    }

    #[test]
    fn the_guarded_remove_refuses_outside_the_runtimes_root_and_the_root_itself() {
        let home = FakeHome::new("wine-rt-");
        let (fetch, _) = FakeLutris::serving(ARCHIVE_URL, CREATED_AT);
        let ctx = ctx_for_download(
            &home,
            fetch,
            Arc::new(FakeTar {
                code: 0,
                link_to: None,
            }),
        );
        let inside = ctx.runtime_path.join("eac_runtime");
        std::fs::create_dir_all(&inside).unwrap();
        let outside = home.root().join("elsewhere");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("keep"), b"k").unwrap();

        // Outside the trust root: refused, and nothing is deleted.
        assert_eq!(
            remove_guarded(&ctx, &outside),
            Err(DownloadError::ReplaceRefused)
        );
        assert!(outside.join("keep").exists());
        // The trust root itself: refused.
        assert_eq!(
            remove_guarded(&ctx, &ctx.runtime_path),
            Err(DownloadError::ReplaceRefused)
        );
        assert!(inside.is_dir());
        // Inside it: removed.
        assert_eq!(remove_guarded(&ctx, &inside), Ok(()));
        assert!(!inside.exists());
        // The home directory (a protected root) is refused.
        assert_eq!(
            remove_guarded(&ctx, home.root()),
            Err(DownloadError::ReplaceRefused)
        );
    }
}
