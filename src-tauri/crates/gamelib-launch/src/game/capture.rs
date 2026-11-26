//! The private capture file a game's stdout and stderr go to, and the tailer that reads it (D-29, the
//! D-30 interim).
//!
//! The file is `<app_folder>/launches/<runner>-<appName>.out`, created by GameLib (mode 0600 on unix) and
//! truncated before the game is spawned. The game's two streams share the one file, so a chunk read from
//! it cannot be told apart by pipe: the runner reports every chunk as stdout.

use std::io::{self, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::watch;

use crate::ctx::LaunchCtx;
use crate::runner::RunnerName;

/// How often the tailer looks for growth when the last read found none.
pub const TAIL_POLL: Duration = Duration::from_millis(100);

/// One read of the capture file takes up to this much, as the pipe reads of a helper run do (Pitfall 6).
pub const TAIL_READ_CHUNK: usize = 64 * 1024;

/// `name` with every character outside `[A-Za-z0-9._-]` replaced by `_`: what a file name may carry, so a
/// crafted app name cannot leave the `launches` folder (T-88.2-16).
pub fn safe_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// `<app_folder>/launches/<runner>-<safe app name>.out`.
pub fn capture_file(app_folder: &Path, runner: RunnerName, app_name: &str) -> PathBuf {
    app_folder
        .join("launches")
        .join(format!("{}-{}.out", runner.as_str(), safe_name(app_name)))
}

/// [`capture_file`] under the context's app folder.
pub fn capture_path(ctx: &LaunchCtx, runner: RunnerName, app_name: &str) -> PathBuf {
    capture_file(&ctx.engine.paths.app_folder, runner, app_name)
}

/// Creates the capture file's folder and the file itself, empty: an earlier run's output is truncated away
/// before the game is spawned, and on unix the file is readable by its owner only.
pub fn create_capture(path: &Path) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut options = std::fs::OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(path)?;
    #[cfg(unix)]
    {
        // `mode` applies to a file this call creates; one left by an earlier run keeps its own.
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    drop(file);
    Ok(())
}

/// Turns bytes read off the file into text. A multi-byte character split across two reads waits in
/// `pending` for its rest; a byte that is not UTF-8 becomes U+FFFD. With `last` set an incomplete tail is
/// not waited for.
fn decode(pending: &mut Vec<u8>, bytes: &[u8], last: bool) -> String {
    pending.extend_from_slice(bytes);
    let mut out = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                out.push_str(text);
                pending.clear();
                return out;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                // `valid_up_to` is a char boundary, so the lossy copy of the valid prefix is exact.
                out.push_str(&String::from_utf8_lossy(&pending[..valid]));
                match e.error_len() {
                    Some(bad) => {
                        out.push('\u{FFFD}');
                        pending.drain(..valid + bad);
                    }
                    None if last => {
                        out.push('\u{FFFD}');
                        pending.clear();
                        return out;
                    }
                    None => {
                        pending.drain(..valid);
                        return out;
                    }
                }
            }
        }
    }
}

/// Reads `path` from `offset` on, handing each read (up to [`TAIL_READ_CHUNK`] bytes) to `on_chunk`, and
/// polls every [`TAIL_POLL`] for more. When `done` turns true (or its sender is dropped) it drains what is
/// left, to the end of the file, and returns the offset it reached. Dropping the future stops the tail.
pub async fn tail<F>(
    path: &Path,
    offset: u64,
    mut on_chunk: F,
    mut done: watch::Receiver<bool>,
) -> u64
where
    F: FnMut(&str),
{
    let mut closed = false;
    let mut file = loop {
        match tokio::fs::File::open(path).await {
            Ok(file) => break file,
            Err(_) => {
                if *done.borrow() || closed {
                    return offset;
                }
                tokio::select! {
                    _ = tokio::time::sleep(TAIL_POLL) => {}
                    changed = done.changed() => closed = changed.is_err(),
                }
            }
        }
    };
    let mut position = offset;
    if offset > 0 && file.seek(SeekFrom::Start(offset)).await.is_err() {
        return offset;
    }
    let mut buffer = vec![0u8; TAIL_READ_CHUNK];
    let mut pending: Vec<u8> = Vec::new();
    loop {
        // Sampled before the read, so a read that finds nothing after `done` is the end of the file.
        let finished = *done.borrow() || closed;
        let read = file.read(&mut buffer).await.unwrap_or(0);
        if read > 0 {
            position += read as u64;
            let text = decode(&mut pending, &buffer[..read], false);
            if !text.is_empty() {
                on_chunk(&text);
            }
            continue;
        }
        if finished {
            break;
        }
        tokio::select! {
            _ = tokio::time::sleep(TAIL_POLL) => {}
            changed = done.changed() => closed = changed.is_err(),
        }
    }
    if !pending.is_empty() {
        let text = decode(&mut pending, &[], true);
        if !text.is_empty() {
            on_chunk(&text);
        }
    }
    position
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn a_crafted_app_name_cannot_leave_the_launches_folder() {
        assert_eq!(safe_name("../../etc/passwd"), ".._.._etc_passwd");
        assert_eq!(safe_name("a b\\c:d"), "a_b_c_d");
        assert_eq!(safe_name("Game-1.2_x"), "Game-1.2_x");
        let path = capture_file(Path::new("/app"), RunnerName::Gog, "../x");
        assert_eq!(
            path,
            Path::new("/app").join("launches").join("gog-.._x.out")
        );
        assert_eq!(
            path.parent(),
            Some(Path::new("/app").join("launches").as_path())
        );
    }

    #[test]
    fn a_character_split_across_two_reads_is_held_for_its_rest() {
        let bytes = "é".as_bytes();
        let mut pending = Vec::new();
        assert_eq!(decode(&mut pending, &bytes[..1], false), "");
        assert_eq!(decode(&mut pending, &bytes[1..], false), "é");
        assert!(pending.is_empty());
        // At the end of the file the rest is not coming.
        assert_eq!(decode(&mut pending, &bytes[..1], false), "");
        assert_eq!(decode(&mut pending, &[], true), "\u{FFFD}");
        // A byte that can never be UTF-8 is replaced and the text after it kept.
        assert_eq!(decode(&mut Vec::new(), b"a\xFFb", false), "a\u{FFFD}b");
    }

    #[cfg(unix)]
    #[test]
    fn the_capture_file_is_private_and_truncated() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("launches").join("gog-x.out");
        create_capture(&path).expect("create");
        std::fs::write(&path, "old output").expect("write");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).expect("chmod");
        create_capture(&path).expect("recreate");
        assert_eq!(std::fs::read(&path).expect("read"), b"");
        let mode = std::fs::metadata(&path).expect("meta").permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[tokio::test]
    async fn the_tail_follows_growth_and_drains_after_done() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("out");
        std::fs::write(&path, "one\n").expect("write");
        let (done_tx, done_rx) = watch::channel(false);
        let seen = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let sink = seen.clone();
        let task_path = path.clone();
        let task = tokio::spawn(async move {
            tail(
                &task_path,
                0,
                move |text| sink.lock().unwrap().push_str(text),
                done_rx,
            )
            .await
        });
        // More output arrives while the tail polls, and a last write lands as `done` is set.
        tokio::time::sleep(Duration::from_millis(250)).await;
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .expect("open");
        file.write_all(b"two\n").expect("append");
        file.write_all(b"three\n").expect("append");
        done_tx.send(true).expect("done");
        let end = task.await.expect("join");
        assert_eq!(*seen.lock().unwrap(), "one\ntwo\nthree\n");
        assert_eq!(end, "one\ntwo\nthree\n".len() as u64);
    }

    #[tokio::test]
    async fn a_tail_over_a_missing_file_ends_when_done() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (done_tx, done_rx) = watch::channel(false);
        done_tx.send(true).expect("done");
        let end = tail(&dir.path().join("never"), 7, |_| {}, done_rx).await;
        assert_eq!(end, 7);
    }
}
