//! The store-agnostic tool runner (`runTool.ts`, moved from `steam/bridge/drm/runnerClone.ts`): one of
//! five allowlisted absolute-path tools, run with the isolated profile.
//!
//! Two-profile rule (D-18), the declared **isolated** arm: these tools need no user profile, so the
//! child gets exactly the eight profile variables pointed at a fresh 0700 directory (`replace_env`),
//! empty stdin and a 1 MiB output cap, and the directory is removed afterwards. The only real-profile
//! spawn of this module family is `demo_status`, which says why.
//!
//! An AbortSignal cannot cross `rustInvoke` (Pitfall 10): the caller names a run with a `cancelId`,
//! which the context maps to a `CancellationToken`, and cancels it with op `engine_cancel`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use gamelib_core::process::ProcSpec;
use serde_json::{json, Value};

use crate::ctx::EngineCtx;

/// The five programs a run may start, each with the label it is registered under.
pub const ALLOWED_TOOLS: [(&str, &str); 5] = [
    ("/bin/cp", "engine-cp"),
    ("/usr/bin/xattr", "engine-xattr"),
    ("/usr/bin/codesign", "engine-codesign"),
    ("/usr/bin/plutil", "engine-plutil"),
    ("/bin/ps", "engine-ps"),
];

/// What a run may read of the child's output, per stream.
const OUTPUT_CAP: usize = 1024 * 1024;

/// The same eight variables as `createFakeHomeProfile()` / `gamelib_testutil::ENV_KEYS`.
const ENV_KEYS: [&str; 8] = [
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "XDG_CONFIG_HOME",
    "XDG_STATE_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
];

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RunToolArgs {
    pub tool: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub timeout_ms: u64,
    #[serde(default)]
    pub cancel_id: Option<String>,
}

/// The TS `RunToolResult`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunToolResult {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub aborted: bool,
}

impl RunToolResult {
    pub fn to_value(&self) -> Value {
        json!({
            "code": self.code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "timedOut": self.timed_out,
            "aborted": self.aborted,
        })
    }

    fn refused(stderr: String) -> RunToolResult {
        RunToolResult {
            stderr,
            ..RunToolResult::default()
        }
    }
}

/// A fresh, disposable 0700 profile root and the eight variables a child would otherwise inherit from
/// the operator's real profile (the Rust twin of `createFakeHomeProfile()`; `gamelib-testutil` is
/// test-only, so the layout is repeated here and `run_tool_arms.rs` pins the two together). Removed
/// when dropped.
#[derive(Debug)]
pub struct IsolatedProfile {
    root: PathBuf,
}

impl IsolatedProfile {
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The eight (key, path) pairs, built segment by segment.
    pub fn env(&self) -> Vec<(String, String)> {
        let root = &self.root;
        let paths: [PathBuf; 8] = [
            root.clone(),
            root.clone(),
            root.join("AppData").join("Roaming"),
            root.join("AppData").join("Local"),
            root.join(".config"),
            root.join(".local").join("state"),
            root.join(".local").join("share"),
            root.join(".cache"),
        ];
        ENV_KEYS
            .iter()
            .zip(paths)
            .map(|(k, v)| ((*k).to_string(), v.to_string_lossy().into_owned()))
            .collect()
    }
}

impl Drop for IsolatedProfile {
    fn drop(&mut self) {
        // A directory this module created a moment ago, exclusively; `remove_dir_all` does not follow
        // a link out of it. Best effort: a leftover is a temp directory, not a profile.
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

/// Makes the isolated profile under the context's temp directory. `mkdir` of a new name with mode 0700
/// is the security control (the directory can never carry group or other bits); the `chmod` after it
/// restores owner write, which the requested mode loses under a restrictive umask (the TS harness
/// records the same).
pub fn isolated_env(ctx: &EngineCtx) -> std::io::Result<IsolatedProfile> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    std::fs::create_dir_all(&ctx.paths.temp)?;
    let mut last = None;
    for _ in 0..8 {
        let nonce = ctx.clock.now_ms() ^ NEXT.fetch_add(1, Ordering::Relaxed).rotate_left(40);
        let root = ctx
            .paths
            .temp
            .join(format!("gamelib-runner-{}-{nonce:x}", std::process::id()));
        match make_private_dir(&root) {
            Ok(()) => return Ok(IsolatedProfile { root }),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => last = Some(e),
            Err(e) => return Err(e),
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other("no free temp name")))
}

#[cfg(unix)]
fn make_private_dir(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    std::fs::DirBuilder::new().mode(0o700).create(path)?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn make_private_dir(path: &Path) -> std::io::Result<()> {
    std::fs::create_dir(path)
}

/// Runs one allowlisted tool. Never an error: a refused tool, a bad cancel id or a profile that could
/// not be made is a result with the reason in `stderr` and nothing spawned.
pub async fn run_tool(ctx: &EngineCtx, args: RunToolArgs) -> RunToolResult {
    let Some((tool, label)) = ALLOWED_TOOLS.iter().find(|(t, _)| *t == args.tool) else {
        return RunToolResult::refused(format!("tool not allowed: {}", args.tool));
    };
    let cancel = match args.cancel_id.as_deref() {
        None => None,
        Some(id) => match ctx.cancels.register(id) {
            Some(registered) => Some(registered),
            None => return RunToolResult::refused("invalid cancel id".to_string()),
        },
    };
    if cancel.as_ref().is_some_and(|(t, _)| t.is_cancelled()) {
        return RunToolResult {
            aborted: true,
            ..RunToolResult::default()
        };
    }
    let profile = match isolated_env(ctx) {
        Ok(profile) => profile,
        Err(e) => return RunToolResult::refused(e.to_string()),
    };
    let mut spec = ProcSpec::new(label, *tool);
    spec.argv = args.args;
    spec.env = profile.env();
    spec.replace_env = true;
    spec.stdin = Some(String::new());
    spec.timeout = Some(Duration::from_millis(args.timeout_ms));
    spec.max_buffer = OUTPUT_CAP;
    spec.cancel = cancel.as_ref().map(|(token, _)| token.clone());
    let run = ctx.proc.run(spec, None).await;
    drop(profile);
    RunToolResult {
        code: run.code,
        stdout: run.stdout,
        stderr: run.stderr,
        timed_out: run.timed_out,
        aborted: run.cancelled,
    }
}
