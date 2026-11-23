//! Archive extraction for the wine services: `tar -xf <archive> -C <dest> --strip-components=<n>`
//! through the spawn seam, then a walk that proves nothing the archive made points outside `<dest>`.
//! A port of `extractTarFile` (`src/backend/utils.ts`, `src/backend/wine/runtimes/util.ts`).
//!
//! The spawn goes through `ctx.proc` (D-17), so the child is a `Helper` registered with the process
//! reaper and stopped with GameLib. It has no timeout of its own, as in the TS: a multi-GB archive
//! runs as long as the disk takes, and the Shutdown token (and the caller's cancel) stop it.
//!
//! The archive is untrusted (T-87-18). `tar` already refuses a member named outside the destination,
//! but a symlink member is an arbitrary target, so after the extraction every entry under `<dest>` is
//! checked without following any link ([`ensure_contained`]).
//!
//! No error carries a path or `tar`'s stderr: a failure is a category word (T-87-09).

use std::fmt;
use std::path::{Component, Path, PathBuf};

use gamelib_core::process::ProcSpec;

use crate::ctx::WineCtx;

/// The child's name in the registry of spawned helpers.
const LABEL: &str = "wine-tar";

/// Why an extraction did not happen or was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtractError {
    /// The archive is not there (`Specified file does not exist`).
    MissingArchive,
    /// A path is not valid text, or the destination could not be created or read.
    Io,
    /// `tar` ended with a non-zero code, or could not be started.
    TarFailed,
    /// The spawn was cancelled: the caller's token or the app shutdown.
    Cancelled,
    /// An entry the archive made points outside the destination. The destination still holds what
    /// was extracted; the caller removes it through `gamelib-safety`.
    Escaped,
}

impl fmt::Display for ExtractError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            ExtractError::MissingArchive => "missing-archive",
            ExtractError::Io => "io",
            ExtractError::TarFailed => "tar-failed",
            ExtractError::Cancelled => "cancelled",
            ExtractError::Escaped => "escaped",
        })
    }
}

impl std::error::Error for ExtractError {}

/// Extracts `archive` into `dest` with `strip` leading path components removed. Creates `dest`
/// (recursively) first, as the TS did, and checks the result is contained once `tar` is done.
pub async fn extract_tar(
    ctx: &WineCtx,
    archive: &Path,
    dest: &Path,
    strip: u32,
) -> Result<(), ExtractError> {
    if !archive.exists() {
        return Err(ExtractError::MissingArchive);
    }
    std::fs::create_dir_all(dest).map_err(|_| ExtractError::Io)?;
    let (archive_text, dest_text) = (
        archive.to_str().ok_or(ExtractError::Io)?,
        dest.to_str().ok_or(ExtractError::Io)?,
    );
    let mut spec = ProcSpec::new(LABEL, "tar");
    spec.argv = vec![
        "-xf".to_string(),
        archive_text.to_string(),
        "-C".to_string(),
        dest_text.to_string(),
        format!("--strip-components={strip}"),
    ];
    spec.cancel = Some(ctx.engine.shutdown.token());
    let out = ctx.proc.run(spec, None).await;
    if out.cancelled {
        return Err(ExtractError::Cancelled);
    }
    if out.code != Some(0) {
        if let Some(log) = &ctx.engine.log {
            // The exit code only: tar's stderr names paths from the archive.
            match out.code {
                Some(code) => log.error(&format!("wine-tar failed with exit code {code}")),
                None => log.error("wine-tar could not be run"),
            }
        }
        return Err(ExtractError::TarFailed);
    }
    ensure_contained(dest)
}

/// `path` with `.` dropped and `..` resolved against the components before it, without touching the
/// file system. A `..` that has nothing left to pop stays, so it can never walk above a root it
/// does not know about.
fn lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !matches!(
                    out.components().next_back(),
                    Some(Component::Normal(_)) | None
                ) || !out.pop()
                {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// A symlink under `root`: where it ends must lie inside `root`. A link that resolves is judged by
/// where the whole chain really ends (`canonicalize` follows every hop, so a link to a link to
/// somewhere outside is caught, and a path spelled through `/var` for `/private/var` is not
/// mistaken for an escape). A dangling link has nowhere real to end, so its target is judged
/// lexically from the link's own directory: a relative target climbing out of `root` is refused.
fn link_is_contained(link: &Path, root: &Path) -> bool {
    match std::fs::canonicalize(link) {
        Ok(real) => real.starts_with(root),
        Err(_) => {
            let Ok(target) = std::fs::read_link(link) else {
                return false;
            };
            let absolute = if target.is_absolute() {
                target
            } else {
                link.parent().unwrap_or(root).join(target)
            };
            lexical(&absolute).starts_with(root)
        }
    }
}

fn walk(dir: &Path, root: &Path) -> Result<(), ExtractError> {
    let entries = std::fs::read_dir(dir).map_err(|_| ExtractError::Io)?;
    for entry in entries {
        let path = entry.map_err(|_| ExtractError::Io)?.path();
        let metadata = std::fs::symlink_metadata(&path).map_err(|_| ExtractError::Io)?;
        if metadata.file_type().is_symlink() {
            if !link_is_contained(&path, root) {
                return Err(ExtractError::Escaped);
            }
        } else if metadata.is_dir() {
            walk(&path, root)?;
        }
    }
    Ok(())
}

/// Proves every entry under `dest` stays inside it: the tree is walked without following a link,
/// each directory entry is read from the directory the walk is in, and every symlink is resolved
/// (see [`link_is_contained`]). `dest` itself is resolved first, so a destination reached through a
/// link is judged by where it really is.
pub fn ensure_contained(dest: &Path) -> Result<(), ExtractError> {
    let root = std::fs::canonicalize(dest).map_err(|_| ExtractError::Io)?;
    walk(&root, &root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::process::{BoxFuture, LineSink, SpecOutput, SpecRunner};
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_engine::testing::ScriptedSpecRunner;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::{make_dir_link, require_link, FakeHome, LinkKind};
    use std::sync::Arc;

    fn ctx_with(home: &FakeHome, proc: Arc<dyn SpecRunner>) -> WineCtx {
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
        .with_proc(proc);
        WineCtx::new(Arc::new(engine), root.join("tools").join("runtimes"))
    }

    fn archive(home: &FakeHome) -> PathBuf {
        let path = home.root().join("a.tar.xz");
        std::fs::write(&path, b"not really an archive").unwrap();
        path
    }

    fn done(code: i32) -> SpecOutput {
        SpecOutput {
            code: Some(code),
            ..SpecOutput::default()
        }
    }

    /// A `tar` that extracts one entry the test chose: a symlink in the destination.
    struct LinkingTar {
        link_target: PathBuf,
    }

    impl SpecRunner for LinkingTar {
        fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
            let dest = PathBuf::from(&spec.argv[3]);
            let target = self.link_target.clone();
            Box::pin(async move {
                make_link(&target, &dest.join("evil"));
                SpecOutput {
                    code: Some(0),
                    ..SpecOutput::default()
                }
            })
        }
    }

    fn make_link(target: &Path, link: &Path) {
        let made = make_dir_link(target, link, LinkKind::Symlink);
        assert!(require_link(made, "a symlink", std::env::var("CI").is_ok()));
    }

    #[tokio::test]
    async fn tar_is_started_as_a_helper_with_the_exact_argv_and_no_timeout() {
        let home = FakeHome::new("wine-extract-");
        let scripted = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program("tar", done(0)));
        let ctx = ctx_with(&home, scripted.clone());
        let archive = archive(&home);
        let dest = home.root().join("tools").join("runtimes").join("umu");
        extract_tar(&ctx, &archive, &dest, 1).await.unwrap();

        let spawns = scripted.spawns();
        assert_eq!(spawns.len(), 1);
        let spawn = &spawns[0];
        assert_eq!(spawn.program, "tar");
        assert_eq!(
            spawn.argv,
            [
                "-xf",
                archive.to_str().unwrap(),
                "-C",
                dest.to_str().unwrap(),
                "--strip-components=1"
            ]
        );
        assert_eq!(spawn.label, "wine-tar");
        assert_eq!(spawn.timeout, None);
        assert!(!spawn.replace_env);
        // The destination is created before tar runs, as `mkdirSync(.., {recursive})` did.
        assert!(dest.is_dir());
    }

    #[tokio::test]
    async fn the_strip_count_is_passed_through() {
        let home = FakeHome::new("wine-extract-");
        let scripted = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program("tar", done(0)));
        let ctx = ctx_with(&home, scripted.clone());
        extract_tar(&ctx, &archive(&home), &home.root().join("d"), 0)
            .await
            .unwrap();
        assert_eq!(
            scripted.spawns()[0].argv.last().map(String::as_str),
            Some("--strip-components=0")
        );
    }

    #[tokio::test]
    async fn a_missing_archive_is_refused_before_anything_is_created_or_spawned() {
        let home = FakeHome::new("wine-extract-");
        let scripted = Arc::new(ScriptedSpecRunner::new(Vec::new()));
        let ctx = ctx_with(&home, scripted.clone());
        let dest = home.root().join("d");
        let err = extract_tar(&ctx, &home.root().join("nope.tar"), &dest, 1)
            .await
            .unwrap_err();
        assert_eq!(err, ExtractError::MissingArchive);
        assert!(scripted.spawns().is_empty());
        assert!(!dest.exists());
    }

    #[tokio::test]
    async fn a_tar_that_fails_or_cannot_start_is_tar_failed() {
        for output in [
            done(2),
            SpecOutput {
                code: None,
                stderr: "no such program".into(),
                ..SpecOutput::default()
            },
        ] {
            let home = FakeHome::new("wine-extract-");
            let scripted = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program("tar", output));
            let ctx = ctx_with(&home, scripted);
            let err = extract_tar(&ctx, &archive(&home), &home.root().join("d"), 1)
                .await
                .unwrap_err();
            assert_eq!(err, ExtractError::TarFailed);
        }
    }

    #[tokio::test]
    async fn a_cancelled_run_is_cancelled() {
        let home = FakeHome::new("wine-extract-");
        let scripted = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program(
            "tar",
            SpecOutput {
                cancelled: true,
                ..SpecOutput::default()
            },
        ));
        let ctx = ctx_with(&home, scripted);
        let err = extract_tar(&ctx, &archive(&home), &home.root().join("d"), 1)
            .await
            .unwrap_err();
        assert_eq!(err, ExtractError::Cancelled);
    }

    #[tokio::test]
    async fn the_run_carries_the_shutdown_token() {
        // A spawn the Shutdown token can stop: the spec's cancel token is the context's.
        struct Probe(std::sync::Mutex<Option<tokio_util::sync::CancellationToken>>);
        impl SpecRunner for Probe {
            fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
                *self.0.lock().unwrap() = spec.cancel;
                Box::pin(async {
                    SpecOutput {
                        code: Some(0),
                        ..SpecOutput::default()
                    }
                })
            }
        }
        let home = FakeHome::new("wine-extract-");
        let probe = Arc::new(Probe(std::sync::Mutex::new(None)));
        let ctx = ctx_with(&home, probe.clone());
        extract_tar(&ctx, &archive(&home), &home.root().join("d"), 1)
            .await
            .unwrap();
        let token = probe.0.lock().unwrap().clone().expect("a cancel token");
        assert!(!token.is_cancelled());
        ctx.engine.shutdown.token().cancel();
        assert!(token.is_cancelled());
    }

    #[test]
    fn lexical_resolves_dots_without_the_file_system() {
        assert_eq!(lexical(Path::new("/a/b/../c/./d")), Path::new("/a/c/d"));
        assert_eq!(lexical(Path::new("/a/../../x")), Path::new("/../x"));
        assert_eq!(lexical(Path::new("a/../../x")), Path::new("../x"));
    }

    #[test]
    fn a_tree_with_no_links_and_an_inside_link_is_contained() {
        let home = FakeHome::new("wine-extract-");
        let dest = home.root().join("dest");
        std::fs::create_dir_all(dest.join("bin")).unwrap();
        std::fs::write(dest.join("bin").join("run"), b"x").unwrap();
        std::fs::create_dir_all(dest.join("lib")).unwrap();
        // A link between two places inside the destination is fine.
        make_link(&dest.join("lib"), &dest.join("bin").join("lib-link"));
        ensure_contained(&dest).unwrap();
    }

    #[test]
    fn a_link_to_a_directory_outside_is_refused() {
        let home = FakeHome::new("wine-extract-");
        let dest = home.root().join("dest");
        let outside = home.root().join("outside");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        make_link(&outside, &dest.join("evil"));
        assert_eq!(ensure_contained(&dest), Err(ExtractError::Escaped));
        // Nothing was removed or followed: the outside directory is intact.
        assert!(outside.is_dir());
    }

    #[test]
    fn a_link_buried_in_a_subdirectory_is_found() {
        let home = FakeHome::new("wine-extract-");
        let dest = home.root().join("dest");
        let outside = home.root().join("outside");
        std::fs::create_dir_all(dest.join("a").join("b")).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        make_link(&outside, &dest.join("a").join("b").join("evil"));
        assert_eq!(ensure_contained(&dest), Err(ExtractError::Escaped));
    }

    #[test]
    fn a_chain_of_links_that_ends_outside_is_refused() {
        let home = FakeHome::new("wine-extract-");
        let dest = home.root().join("dest");
        let outside = home.root().join("outside");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        // first -> second (inside) -> outside: each hop alone looks fine to a lexical check of
        // the first link.
        make_link(&outside, &dest.join("second"));
        make_link(&dest.join("second"), &dest.join("first"));
        assert_eq!(ensure_contained(&dest), Err(ExtractError::Escaped));
    }

    #[cfg(unix)]
    #[test]
    fn a_relative_link_that_climbs_out_is_refused_even_when_dangling() {
        let home = FakeHome::new("wine-extract-");
        let dest = home.root().join("dest");
        std::fs::create_dir_all(dest.join("a")).unwrap();
        // `a/up` -> `../../elsewhere`, which is `<home>/elsewhere`: outside, and not there.
        std::os::unix::fs::symlink("../../elsewhere", dest.join("a").join("up")).unwrap();
        assert_eq!(ensure_contained(&dest), Err(ExtractError::Escaped));
        // The same climb that stays inside is fine.
        std::fs::remove_file(dest.join("a").join("up")).unwrap();
        std::os::unix::fs::symlink("../sibling", dest.join("a").join("up")).unwrap();
        ensure_contained(&dest).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn an_absolute_link_outside_is_refused_even_to_a_file() {
        let home = FakeHome::new("wine-extract-");
        let dest = home.root().join("dest");
        std::fs::create_dir_all(&dest).unwrap();
        let secret = home.root().join("secret.txt");
        std::fs::write(&secret, b"s").unwrap();
        std::os::unix::fs::symlink(&secret, dest.join("passwd")).unwrap();
        assert_eq!(ensure_contained(&dest), Err(ExtractError::Escaped));
    }

    #[tokio::test]
    async fn an_extraction_that_makes_an_escaping_link_is_refused_after_tar_ran() {
        let home = FakeHome::new("wine-extract-");
        let outside = home.root().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        let ctx = ctx_with(
            &home,
            Arc::new(LinkingTar {
                link_target: outside.clone(),
            }),
        );
        let dest = home.root().join("tools").join("runtimes").join("umu");
        let err = extract_tar(&ctx, &archive(&home), &dest, 1)
            .await
            .unwrap_err();
        assert_eq!(err, ExtractError::Escaped);
        // The extractor does not delete: the caller removes the destination through gamelib-safety.
        assert!(dest.join("evil").exists());
        assert!(outside.is_dir());
    }

    #[tokio::test]
    async fn an_extraction_that_makes_an_inside_link_succeeds() {
        let home = FakeHome::new("wine-extract-");
        let dest = home.root().join("tools").join("runtimes").join("umu");
        std::fs::create_dir_all(dest.join("real")).unwrap();
        let ctx = ctx_with(
            &home,
            Arc::new(LinkingTar {
                link_target: dest.join("real"),
            }),
        );
        extract_tar(&ctx, &archive(&home), &dest, 1).await.unwrap();
    }
}
