//! The Wine runtimes (EAC, BattlEye, umu): the lutris.net list, "is this one current" and, from the
//! next task, the download. A port of `src/backend/wine/runtimes/runtimes.ts`.
//!
//! A runtime lives in `<runtime_path>/<name>/` with a `current_version` file holding the list's
//! `created_at` for the build that was extracted there. The crate reads no environment and no
//! profile path: `<runtime_path>` arrives in [`WineCtx`], every request goes through `ctx.fetch`
//! (D-08) and every child through `ctx.proc` (D-17).
//!
//! No error here carries a URL, a path or a response body: a failure is a category word (T-87-09).

use gamelib_engine::fetch::{FetchError, FetchRequest};
use serde_json::Value;

use crate::ctx::WineCtx;

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
}
