//! Test-only helpers shared by the Tauri-free crates. Never a runtime dependency.
//!
//! `FakeHome` is the Rust twin of `createFakeHomeProfile()` (src/backend/testUtils/
//! fakeHomeProfile.ts): a fresh, disposable, 0700 profile root plus the eight HOME-style
//! variables a spawned child would otherwise inherit from the operator's real profile.
//! `make_dir_link` / `require_link` build symlinks and junctions for the destructive-path
//! tests, and fail loudly on CI instead of silently skipping (Phase 82 D-08, D-18).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// The eight variables `createFakeHomeProfile()` sets.
pub const ENV_KEYS: [&str; 8] = [
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "XDG_CONFIG_HOME",
    "XDG_STATE_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
];

/// A fresh fake profile root. A new one per call: reuse would be a different experiment
/// carrying state that can mask a defect. Removed (with every registered capture) on drop.
pub struct FakeHome {
    dir: Option<tempfile::TempDir>,
    captures: Vec<PathBuf>,
}

impl FakeHome {
    /// `tempfile`'s default directory mode is NOT 0700 (docs.rs: 0o777 before the umask), and
    /// 0700 is the security control, so it is requested explicitly on Unix.
    pub fn new(prefix: &str) -> FakeHome {
        let mut b = tempfile::Builder::new();
        b.prefix(prefix);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            b.permissions(fs::Permissions::from_mode(0o700));
        }
        let dir = b.tempdir().expect("create fake home");
        FakeHome {
            dir: Some(dir),
            captures: Vec::new(),
        }
    }

    pub fn root(&self) -> &Path {
        match &self.dir {
            Some(d) => d.path(),
            None => Path::new(""),
        }
    }

    /// The eight (key, path) pairs, built segment by segment (never `join("a/b")`: Windows CI).
    pub fn env(&self) -> Vec<(&'static str, PathBuf)> {
        let root = self.root();
        vec![
            ("HOME", root.to_path_buf()),
            ("USERPROFILE", root.to_path_buf()),
            ("APPDATA", root.join("AppData").join("Roaming")),
            ("LOCALAPPDATA", root.join("AppData").join("Local")),
            ("XDG_CONFIG_HOME", root.join(".config")),
            ("XDG_STATE_HOME", root.join(".local").join("state")),
            ("XDG_DATA_HOME", root.join(".local").join("share")),
            ("XDG_CACHE_HOME", root.join(".cache")),
        ]
    }

    /// Sets the eight variables on a child. Clearing the rest of the environment is the
    /// caller's call (`cmd.env_clear()`).
    pub fn apply(&self, cmd: &mut std::process::Command) {
        for (k, v) in self.env() {
            cmd.env(k, v);
        }
    }

    /// A path outside the profile (a raw diagnostic report, a `*.out` capture) to shred on drop.
    pub fn register_capture(&mut self, p: PathBuf) {
        self.captures.push(p);
    }
}

impl Drop for FakeHome {
    fn drop(&mut self) {
        for p in &self.captures {
            // Each removal on its own: one failure must not strand the rest. Idempotent.
            let _ = fs::remove_dir_all(p);
            let _ = fs::remove_file(p);
        }
        if let Some(d) = self.dir.take() {
            let _ = d.close();
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinkKind {
    Symlink,
    Junction,
}

/// Creates a directory link at `link` pointing at `target`. A Windows junction needs no
/// privilege (`mklink /J`); a Windows directory symlink needs `SeCreateSymbolicLinkPrivilege`.
pub fn make_dir_link(target: &Path, link: &Path, kind: LinkKind) -> io::Result<()> {
    match kind {
        LinkKind::Symlink => symlink_dir(target, link),
        LinkKind::Junction => junction(target, link),
    }
}

#[cfg(unix)]
fn symlink_dir(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}
#[cfg(windows)]
fn symlink_dir(target: &Path, link: &Path) -> io::Result<()> {
    std::os::windows::fs::symlink_dir(target, link)
}
#[cfg(not(any(unix, windows)))]
fn symlink_dir(_target: &Path, _link: &Path) -> io::Result<()> {
    Err(io::Error::from(io::ErrorKind::Unsupported))
}

#[cfg(windows)]
fn junction(target: &Path, link: &Path) -> io::Result<()> {
    let out = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .output()?;
    if out.status.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "mklink /J failed: {}",
            String::from_utf8_lossy(&out.stdout)
        )))
    }
}
#[cfg(not(windows))]
fn junction(_target: &Path, _link: &Path) -> io::Result<()> {
    Err(io::Error::from(io::ErrorKind::Unsupported))
}

/// Turns the result of `make_dir_link` into "may the row run". `Ok` -> true. An `Err` on CI
/// (`ci == true`) PANICS: a runner that cannot create a link is a red build, never a silent
/// pass (the early-return pattern in acf_copies_security.rs is exactly what this replaces).
/// Locally an `Err` prints the reason and returns false so the row is skipped.
pub fn require_link(result: io::Result<()>, what: &str, ci: bool) -> bool {
    match result {
        Ok(()) => true,
        Err(e) if ci => panic!("cannot create {what} on CI: {e}"),
        Err(e) => {
            eprintln!("SKIPPED {what}: cannot create link locally: {e}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn root_is_mode_0700() {
        use std::os::unix::fs::PermissionsExt;
        let h = FakeHome::new("gamelib-testutil-");
        let mode = fs::metadata(h.root()).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o700);
    }

    #[test]
    fn env_has_the_eight_keys_all_under_root() {
        let h = FakeHome::new("gamelib-testutil-");
        let env = h.env();
        assert_eq!(env.len(), 8);
        let keys: Vec<&str> = env.iter().map(|(k, _)| *k).collect();
        assert_eq!(keys, ENV_KEYS.to_vec());
        for (k, v) in &env {
            assert!(v.starts_with(h.root()), "{k} is outside the fake home");
        }
    }

    #[test]
    fn two_fake_homes_have_different_roots() {
        let a = FakeHome::new("gamelib-testutil-");
        let b = FakeHome::new("gamelib-testutil-");
        assert_ne!(a.root(), b.root());
    }

    #[test]
    fn apply_sets_the_eight_variables() {
        let h = FakeHome::new("gamelib-testutil-");
        let mut cmd = std::process::Command::new("irrelevant");
        h.apply(&mut cmd);
        let set: Vec<String> = cmd
            .get_envs()
            .map(|(k, _)| k.to_string_lossy().into_owned())
            .collect();
        for k in ENV_KEYS {
            assert!(set.iter().any(|s| s == k), "{k} not applied");
        }
    }

    #[test]
    fn drop_removes_root_and_captures() {
        let outside = tempfile::tempdir().unwrap();
        let capture = outside.path().join("report");
        fs::create_dir(&capture).unwrap();
        fs::write(capture.join("r.json"), b"x").unwrap();
        let single = outside.path().join("single.out");
        fs::write(&single, b"x").unwrap();
        let root;
        {
            let mut h = FakeHome::new("gamelib-testutil-");
            root = h.root().to_path_buf();
            h.register_capture(capture.clone());
            h.register_capture(single.clone());
            assert!(root.exists());
        }
        assert!(!root.exists());
        assert!(!capture.exists());
        assert!(!single.exists());
    }

    #[test]
    #[should_panic(expected = "cannot create")]
    fn require_link_panics_on_ci() {
        let _ = require_link(Err(io::Error::other("nope")), "a link", true);
    }

    #[test]
    fn require_link_skips_locally_and_passes_on_ok() {
        assert!(!require_link(
            Err(io::Error::other("nope")),
            "a link",
            false
        ));
        assert!(require_link(Ok(()), "a link", true));
    }

    #[cfg(unix)]
    #[test]
    fn make_dir_link_symlink_works_and_junction_is_unsupported() {
        let h = FakeHome::new("gamelib-testutil-");
        let target = h.root().join("target");
        fs::create_dir(&target).unwrap();
        let link = h.root().join("link");
        make_dir_link(&target, &link, LinkKind::Symlink).unwrap();
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        let j = h.root().join("junction");
        let e = make_dir_link(&target, &j, LinkKind::Junction).unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::Unsupported);
    }
}
