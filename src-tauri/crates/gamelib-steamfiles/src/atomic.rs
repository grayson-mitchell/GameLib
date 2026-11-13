//! Same-directory atomic file write shared by the ACF and `shortcuts.vdf` writers (75 D-11).

use std::fs::File;
use std::io::{self, Write};
use std::path::Path;

/// Write `bytes` to `<final_path>.tmp` in the same directory, `sync_all`, then rename over
/// `final_path`. On any error the temp file is removed and the error returned.
pub fn atomic_write(final_path: &Path, bytes: &[u8]) -> io::Result<()> {
    let invalid = || {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "path has no parent or file name",
        )
    };
    let parent = final_path.parent().ok_or_else(invalid)?;
    let name = final_path.file_name().ok_or_else(invalid)?;
    let mut tmp_name = name.to_os_string();
    tmp_name.push(".tmp");
    let tmp = parent.join(tmp_name);
    let result = (|| {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        std::fs::rename(&tmp, final_path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_leaves_no_temp() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.vdf");
        atomic_write(&p, b"abc").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"abc");
        assert!(!d.path().join("x.vdf.tmp").exists());
        atomic_write(&p, b"defg").unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"defg");
    }

    #[test]
    fn missing_directory_errs_without_temp() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("nodir").join("x.vdf");
        assert!(atomic_write(&p, b"abc").is_err());
        assert!(!d.path().join("nodir").exists());
    }

    #[test]
    fn rename_failure_removes_temp() {
        let d = tempfile::tempdir().unwrap();
        // Final path is a non-empty directory: rename of a file over it fails.
        let p = d.path().join("target");
        std::fs::create_dir(&p).unwrap();
        std::fs::write(p.join("inner"), b"1").unwrap();
        assert!(atomic_write(&p, b"abc").is_err());
        assert!(!d.path().join("target.tmp").exists());
    }

    #[test]
    fn rejects_pathless() {
        let e = atomic_write(Path::new("/"), b"x").unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::InvalidInput);
    }
}
