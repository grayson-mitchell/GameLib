//! The archive's integrity check (T-87-47): the size first, then the sha256, both against the shared
//! pin table. The release assets are not immutable, so the exact build is fixed by these two values
//! and anything else is refused before it is extracted.

use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

/// Why an archive was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mismatch {
    /// Missing, or not the pinned size (`unexpected archive size`).
    Size,
    /// The pinned size, another sha256.
    Sha256,
    /// The cancel token fired while the file was being read.
    Cancelled,
    /// The file could not be read.
    Unreadable,
}

/// The file exists and is exactly `expected` bytes.
pub fn size_matches(archive: &Path, expected: u64) -> bool {
    fs::metadata(archive).is_ok_and(|m| m.is_file() && m.len() == expected)
}

/// The sha256 of the file in lowercase hex, read in chunks; `Ok(None)` when `cancel` fired first.
pub fn sha256_file(archive: &Path, cancel: &CancellationToken) -> std::io::Result<Option<String>> {
    let mut file = File::open(archive)?;
    let mut hash = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        if cancel.is_cancelled() {
            return Ok(None);
        }
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    Ok(Some(
        hash.finalize().iter().map(|b| format!("{b:02x}")).collect(),
    ))
}

/// Size, then (after `before_hash`, where the caller says it is verifying) the sha256.
pub fn check(
    archive: &Path,
    size: u64,
    sha256: &str,
    cancel: &CancellationToken,
    before_hash: impl FnOnce(),
) -> Result<(), Mismatch> {
    if !size_matches(archive, size) {
        return Err(Mismatch::Size);
    }
    before_hash();
    match sha256_file(archive, cancel) {
        Err(_) => Err(Mismatch::Unreadable),
        Ok(None) => Err(Mismatch::Cancelled),
        Ok(Some(digest)) if digest == sha256 => Ok(()),
        Ok(Some(_)) => Err(Mismatch::Sha256),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;

    const HELLO_SHA: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    fn archive(home: &FakeHome) -> std::path::PathBuf {
        let path = home.root().join("a.tar");
        fs::write(&path, "hello").unwrap();
        path
    }

    #[test]
    fn size_is_checked_before_the_hash_and_the_hash_before_acceptance() {
        let home = FakeHome::new("fallback-verify-");
        let path = archive(&home);
        let live = CancellationToken::new();
        let mut hashed = false;
        assert_eq!(
            check(&path, 6, HELLO_SHA, &live, || hashed = true),
            Err(Mismatch::Size)
        );
        assert!(!hashed, "a wrong size is refused before any hashing");
        assert_eq!(check(&path, 5, HELLO_SHA, &live, || {}), Ok(()));
        assert_eq!(
            check(&path, 5, &"0".repeat(64), &live, || {}),
            Err(Mismatch::Sha256)
        );
        // The hash is compared as written: an upper-case pin is another value.
        assert_eq!(
            check(&path, 5, &HELLO_SHA.to_uppercase(), &live, || {}),
            Err(Mismatch::Sha256)
        );
    }

    #[test]
    fn a_missing_file_a_directory_and_a_cancelled_read_are_refused() {
        let home = FakeHome::new("fallback-verify-");
        let live = CancellationToken::new();
        assert_eq!(
            check(&home.root().join("absent"), 0, "", &live, || {}),
            Err(Mismatch::Size)
        );
        assert_eq!(check(home.root(), 0, "", &live, || {}), Err(Mismatch::Size));
        let path = archive(&home);
        let cancelled = CancellationToken::new();
        cancelled.cancel();
        assert_eq!(
            check(&path, 5, HELLO_SHA, &cancelled, || {}),
            Err(Mismatch::Cancelled)
        );
    }
}
