//! Verified on-demand install of a tier-2 known-fix overlay (quick 261027-n77, Phase 88 D-03), ported from
//! `src/backend/knownFixOverlayInstall.ts`.
//!
//! The payload is a GameLib-hosted, sha256-pinned download. The URL and every sum come from the
//! compiled-in catalogue (`catalogue.rs`), never from the host (T-88-24). Fail-open: any problem warns,
//! installs nothing and answers `None`, so the game launches without the overlay; nothing here returns an
//! error. The archive is unpacked in process by the strict reader (T-88-23): no `tar` child, no spawn.
//!
//! Boundedness (the Rust shutdown contract, D-21): the only in-flight work is the archive download. It goes
//! through `EngineCtx.fetch` (the one TLS provider), is bounded by [`OverlayInstalls::timeout`] (120 s) and by
//! the shutdown token, and the whole install holds the `knownfix` registrant through [`guarded`] for exactly
//! its duration. Nothing runs at boot: an install happens only inside a launch whose profile names an overlay.
//! Every recursive removal of a partial or stale directory goes through `gamelib-safety` (T-88-26).
//!
//! A log line carries the caller's label, the overlay id and a count or a reason, never a URL or a path
//! (prohibition 1).
//!
//! The staging layout is the TS's: `<overlays>/.<id>.partial-<random>` (mode 0700) is filled, verified and
//! renamed onto `<overlays>/<id>`; an install that is there is first moved to
//! `<overlays>/.<id>.stale-<pid>-<ms>` and removed afterwards.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use gamelib_engine::fetch::{FetchError, FetchRequest, MAX_GET_BODY};
use gamelib_safety::remove::remove_tree;
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Outcome, Request, Target, TargetKind};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::archive::read_overlay_tar_gz;
use crate::catalogue::{archive_url, OverlayCatalogueEntry};
use crate::ctx::{InstallCell, KnownFixCtx, OverlayInstalls};
use crate::guarded;

/// More than the pinned files may unpack to: the tar's own headers and padding.
const EXTRA_UNCOMPRESSED_BYTES: u64 = 1024 * 1024;

/// Why an installed overlay directory is not a verified one. [`VerifyError::reason`] is the TS's text;
/// the log never carries it whole, because two of the reasons name a path.
#[derive(Debug)]
pub enum VerifyError {
    /// A directory on the way to the plugin directory is missing, a link or not a directory.
    NotARealDirectory(PathBuf),
    /// A pinned file is a link, a directory or something else.
    NotRegular(String),
    /// A pinned file has another size than its pin.
    WrongSize(String),
    /// A pinned file has another sha256 than its pin.
    Sha256Mismatch(String),
    /// The plugin directory holds a file the pins do not name (GStreamer loads anything in it).
    UnexpectedFiles(String),
    /// The file system answered an error; the text is the OS's own, without the path.
    Io(std::io::Error),
}

impl VerifyError {
    /// The reason as the TS words it, except that an fs error says what the OS says.
    pub fn reason(&self) -> String {
        match self {
            VerifyError::NotARealDirectory(d) => format!("{} is not a real directory", d.display()),
            VerifyError::NotRegular(p) => format!("{p} is not a regular file"),
            VerifyError::WrongSize(p) => format!("{p} has the wrong size"),
            VerifyError::Sha256Mismatch(p) => format!("{p} sha256 mismatch"),
            VerifyError::UnexpectedFiles(d) => format!("{d} holds unexpected files"),
            VerifyError::Io(e) => e.to_string(),
        }
    }

    /// The reason without any path of this machine, for the log.
    fn loggable(&self) -> String {
        match self {
            VerifyError::NotARealDirectory(_) => {
                "an overlay directory is not a real directory".to_string()
            }
            other => other.reason(),
        }
    }
}

impl From<std::io::Error> for VerifyError {
    fn from(e: std::io::Error) -> VerifyError {
        VerifyError::Io(e)
    }
}

/// Whether `id` is an overlay id the installer accepts: `^[a-z0-9][a-z0-9.-]{0,63}$`. The id becomes a
/// directory name under the overlays folder.
pub fn is_valid_overlay_id(id: &str) -> bool {
    let b = id.as_bytes();
    let alnum = |c: u8| c.is_ascii_lowercase() || c.is_ascii_digit();
    !b.is_empty()
        && b.len() <= 64
        && alnum(b[0])
        && b[1..].iter().all(|&c| alnum(c) || c == b'.' || c == b'-')
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn sha256_hex(data: &[u8]) -> String {
    hex(&Sha256::digest(data))
}

fn is_real_dir(path: &Path) -> std::io::Result<bool> {
    Ok(fs::symlink_metadata(path)?.file_type().is_dir())
}

fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut chunk = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        hasher.update(&chunk[..n]);
    }
    Ok(hex(&hasher.finalize()))
}

/// Checks an installed overlay directory against the entry's pins (`verifyInstalledOverlay`): every
/// directory down to the plugin directory is a real one, every pinned file is a regular file of the pinned
/// size and sha256, and the plugin directory holds exactly the pinned files. An extra file elsewhere (an
/// operator's `SHA256SUMS`) is tolerated.
pub fn verify_installed_overlay(
    dir: &Path,
    entry: &OverlayCatalogueEntry,
) -> Result<(), VerifyError> {
    let mut chain = vec![dir.to_path_buf()];
    let mut acc = dir.to_path_buf();
    for seg in entry.plugin_subdir.split('/') {
        acc = acc.join(seg);
        chain.push(acc.clone());
    }
    for d in &chain {
        if !is_real_dir(d)? {
            return Err(VerifyError::NotARealDirectory(d.clone()));
        }
    }
    for f in &entry.files {
        let full = dir.join(&f.path);
        let md = fs::symlink_metadata(&full)?;
        if !md.file_type().is_file() {
            return Err(VerifyError::NotRegular(f.path.clone()));
        }
        if md.len() != f.size {
            return Err(VerifyError::WrongSize(f.path.clone()));
        }
        if hash_file(&full)? != f.sha256 {
            return Err(VerifyError::Sha256Mismatch(f.path.clone()));
        }
    }
    let prefix = format!("{}/", entry.plugin_subdir);
    let mut want: Vec<String> = entry
        .files
        .iter()
        .filter_map(|f| f.path.strip_prefix(&prefix).map(str::to_string))
        .collect();
    want.sort();
    let mut have: Vec<String> = fs::read_dir(dir.join(&entry.plugin_subdir))?
        .map(|e| e.map(|e| e.file_name().to_string_lossy().into_owned()))
        .collect::<Result<_, _>>()?;
    have.sort();
    if want != have {
        return Err(VerifyError::UnexpectedFiles(entry.plugin_subdir.clone()));
    }
    Ok(())
}

/// What may be removed, and through which gate: everything under the overlays folder, judged by
/// `gamelib-safety` with that folder as the trust root. The app folder, the home and the tools folder are
/// protected, as everywhere else in the app.
struct RemovalGuard {
    root: String,
    protected: Vec<String>,
}

impl RemovalGuard {
    fn new(ctx: &KnownFixCtx, root: &Path) -> RemovalGuard {
        let text = |p: &Path| p.to_str().map(str::to_string);
        RemovalGuard {
            root: text(root).unwrap_or_default(),
            protected: [
                &ctx.engine.paths.user_home,
                &ctx.engine.paths.app_folder,
                &ctx.engine.paths.tools_path,
            ]
            .into_iter()
            .filter_map(|p| text(p))
            .collect(),
        }
    }

    /// Removes `path` (a partial or stale install). `true` when nothing is left there; a path the guard
    /// refuses stays, and a link inside the root is unlinked and its referent left alone.
    fn remove(&self, path: &Path) -> bool {
        if fs::symlink_metadata(path).is_err() {
            return true;
        }
        let Some(target) = path.to_str().map(str::to_string) else {
            return false;
        };
        let request = Request {
            targets: vec![Target {
                id: "overlay".to_string(),
                path: target,
                kind: TargetKind::AppData,
                trust_root: Some(self.root.clone()),
                executable: None,
            }],
            // No game owns an overlay directory: the list is known and empty, not unreadable.
            known_installs: Some(Vec::new()),
            self_key: None,
            protected_roots: self.protected.clone(),
        };
        remove_tree(&request, CaseMode::Auto).outcome == Outcome::Removed
    }
}

/// What staging an archive ended in.
enum Staged {
    /// This call put the install in place.
    Installed,
    /// Another install of the same overlay got there first and verifies.
    AlreadyThere,
}

fn random_suffix() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u32(std::process::id());
    hasher.write_u128(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos()),
    );
    let mut n = hasher.finish();
    (0..6)
        .map(|_| {
            let c = ALPHABET[(n % ALPHABET.len() as u64) as usize] as char;
            n /= ALPHABET.len() as u64;
            c
        })
        .collect()
}

/// `mkdtemp(<root>/.<id>.partial-)`: a fresh directory only the owner can enter.
fn make_partial_dir(root: &Path, id: &str) -> std::io::Result<PathBuf> {
    let mut last = None;
    for _ in 0..16 {
        let path = root.join(format!(".{id}.partial-{}", random_suffix()));
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        match builder.create(&path) {
            Ok(()) => return Ok(path),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => last = Some(e),
            Err(e) => return Err(e),
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::from(std::io::ErrorKind::AlreadyExists)))
}

/// A new file (`wx`), mode 0644.
fn write_new(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o644);
    }
    options.open(path)?.write_all(data)
}

/// `EEXIST` or `ENOTEMPTY` (a directory rename onto a directory that is not empty): another install won.
fn target_already_there(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::AlreadyExists
        || matches!(e.raw_os_error(), Some(17 | 39 | 66 | 145 | 183))
}

fn io_text(e: std::io::Error) -> String {
    e.to_string()
}

/// Everything after the download, blocking: the pins on the archive, the strict unpack into a partial
/// directory, the verification of what was written, and the swap onto the install directory.
fn stage(
    entry: &OverlayCatalogueEntry,
    buf: &[u8],
    root: &Path,
    target: &Path,
    guard: &RemovalGuard,
) -> Result<Staged, String> {
    if buf.len() as u64 != entry.archive_size {
        return Err(format!(
            "archive size {} does not match the pinned {}",
            buf.len(),
            entry.archive_size
        ));
    }
    if sha256_hex(buf) != entry.archive_sha256 {
        return Err("archive sha256 does not match the pin".to_string());
    }
    let expected: Vec<(String, u64)> = entry
        .files
        .iter()
        .map(|f| (f.path.clone(), f.size))
        .collect();
    let total: u64 = entry.files.iter().map(|f| f.size).sum();
    let files = read_overlay_tar_gz(buf, &expected, total + EXTRA_UNCOMPRESSED_BYTES)?;

    let partial = make_partial_dir(root, &entry.id).map_err(io_text)?;
    let outcome = fill_and_swap(entry, &files, root, target, &partial, guard);
    // Whatever is still at the partial path (the swap never took it) is not an install.
    if fs::symlink_metadata(&partial).is_ok() {
        guard.remove(&partial);
    }
    outcome
}

fn fill_and_swap(
    entry: &OverlayCatalogueEntry,
    files: &[(String, Vec<u8>)],
    root: &Path,
    target: &Path,
    partial: &Path,
    guard: &RemovalGuard,
) -> Result<Staged, String> {
    for (path, data) in files {
        let full = partial.join(path);
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).map_err(io_text)?;
        }
        write_new(&full, data).map_err(io_text)?;
    }
    verify_installed_overlay(partial, entry)
        .map_err(|e| format!("extracted files failed verification: {}", e.loggable()))?;

    let mut stale: Option<PathBuf> = None;
    match fs::symlink_metadata(target) {
        Ok(_) => {
            let moved = root.join(format!(
                ".{}.stale-{}-{}",
                entry.id,
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(0, |d| d.as_millis())
            ));
            fs::rename(target, &moved).map_err(io_text)?;
            stale = Some(moved);
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(io_text(e)),
    }
    let swapped = match fs::rename(partial, target) {
        Ok(()) => Ok(Staged::Installed),
        Err(e) if target_already_there(&e) && verify_installed_overlay(target, entry).is_ok() => {
            Ok(Staged::AlreadyThere)
        }
        Err(e) => Err(io_text(e)),
    };
    if let Some(stale) = stale {
        guard.remove(&stale);
    }
    swapped
}

/// The archive's bytes, within the bound. The seam reads at most [`MAX_GET_BODY`], so an overlay whose
/// archive is larger than that cannot be fetched this way and is refused up front (fail-open); a body
/// longer than the pinned size is caught by the size pin afterwards.
async fn download(ctx: &KnownFixCtx, entry: &OverlayCatalogueEntry) -> Result<Vec<u8>, String> {
    let timeout = ctx.overlay_installs.timeout();
    let aborted = format!(
        "download aborted or timed out after {} ms",
        timeout.as_millis()
    );
    if entry.archive_size > MAX_GET_BODY as u64 {
        return Err("archive is larger than a download may be".to_string());
    }
    let request = FetchRequest::get(archive_url(entry))
        .gamelib_agent(&ctx.engine.app_version)
        .timeout(timeout);
    let token = ctx.engine.shutdown.token();
    let fetching = ctx.engine.fetch.get(request);
    let response = tokio::select! {
        biased;
        _ = token.cancelled() => return Err(aborted),
        done = tokio::time::timeout(timeout, fetching) => match done {
            Ok(response) => response,
            Err(_) => return Err(aborted),
        },
    };
    let response = response.map_err(|e| e.to_string())?;
    if response.status != 200 {
        return Err(FetchError::Status(response.status).to_string());
    }
    Ok(response.body)
}

fn blocked<T>(joined: Result<T, tokio::task::JoinError>) -> Result<T, String> {
    joined.map_err(|_| "the install task did not finish".to_string())
}

async fn try_install(
    ctx: &KnownFixCtx,
    entry: &OverlayCatalogueEntry,
    label: &str,
    root: &Path,
    target: &Path,
) -> Result<PathBuf, String> {
    let id = &entry.id;
    // Is it there already? Otherwise the folder it goes into has to exist.
    let present = {
        let (entry, root, target) = (entry.clone(), root.to_path_buf(), target.to_path_buf());
        blocked(
            tokio::task::spawn_blocking(move || match verify_installed_overlay(&target, &entry) {
                Ok(()) => Ok(true),
                Err(_) => fs::create_dir_all(&root).map(|()| false).map_err(io_text),
            })
            .await,
        )??
    };
    if present {
        ctx.log_info(&format!(
            "{label}: overlay {id} already installed, verified"
        ));
        return Ok(target.to_path_buf());
    }

    let buf = download(ctx, entry).await?;
    let guard = RemovalGuard::new(ctx, root);
    let staged = {
        let (entry, root, target) = (entry.clone(), root.to_path_buf(), target.to_path_buf());
        blocked(
            tokio::task::spawn_blocking(move || stage(&entry, &buf, &root, &target, &guard)).await,
        )??
    };
    if matches!(staged, Staged::Installed) {
        ctx.log_info(&format!("{label}: overlay {id} downloaded and installed"));
    }
    Ok(target.to_path_buf())
}

/// One install, to its answer: the verified directory, or `None` after a warning.
async fn install_once(
    ctx: &KnownFixCtx,
    entry: &OverlayCatalogueEntry,
    label: &str,
    root: &Path,
    target: &Path,
) -> Option<PathBuf> {
    match try_install(ctx, entry, label, root, target).await {
        Ok(dir) => Some(dir),
        Err(why) => {
            warn_not_installed(ctx, label, &entry.id, &why);
            None
        }
    }
}

fn warn_not_installed(ctx: &KnownFixCtx, label: &str, id: &str, why: &str) {
    ctx.log_warn(&format!(
        "{label}: overlay {id} not installed ({why}); launching without it"
    ));
}

/// Forgets an install's cell when the caller is done with it, however it ends (an install cancelled by the
/// shutdown token leaves no cell behind).
struct Forget<'a> {
    installs: &'a OverlayInstalls,
    target: &'a Path,
    cell: InstallCell,
}

impl Drop for Forget<'_> {
    fn drop(&mut self) {
        self.installs.forget(self.target, &self.cell);
    }
}

/// Installs `entry` on demand and answers the verified install directory, or `None` (after one warning)
/// when anything is wrong: the id, the download, a pin, the archive, the disk. Never an error. Concurrent
/// callers for one overlay share one download. `label` is the caller's log prefix (`<runner> <appName>`).
pub async fn ensure_overlay_installed(
    ctx: &KnownFixCtx,
    entry: &OverlayCatalogueEntry,
    label: &str,
) -> Option<PathBuf> {
    if !is_valid_overlay_id(&entry.id) {
        warn_not_installed(ctx, label, &entry.id, "invalid overlay id");
        return None;
    }
    let root = ctx.paths.overlays.clone();
    let target = root.join(&entry.id);
    let mut found: Option<PathBuf> = None;
    let work = async {
        let cell = ctx.overlay_installs.cell_for(&target);
        let _forget = Forget {
            installs: &ctx.overlay_installs,
            target: &target,
            cell: cell.clone(),
        };
        found = cell
            .get_or_init(|| install_once(ctx, entry, label, &root, &target))
            .await
            .clone();
        Ok(Value::Null)
    };
    match guarded("overlay-install", ctx, work).await {
        Ok(_) => found,
        Err(why) => {
            let said = if why.ends_with(":shutdown") {
                format!(
                    "download aborted or timed out after {} ms",
                    ctx.overlay_installs.timeout().as_millis()
                )
            } else {
                "the install stopped unexpectedly".to_string()
            };
            warn_not_installed(ctx, label, &entry.id, &said);
            None
        }
    }
}
