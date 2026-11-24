//! Deterministic ustar+gzip writer and strict reader for known-fix overlay archives (quick 261027-n77,
//! Phase 88 D-03), ported from `src/backend/knownFixOverlayArchive.ts`.
//!
//! Pure: bytes in, bytes out, no file system and no child process (the install extracts in process, so
//! there is no `tar` spawn). The writer emits regular files only, sorted by their bytes, with every
//! volatile header field zeroed, so the same inputs give the same bytes. The reader accepts nothing but
//! regular files whose paths are exactly the expected set: no `..`, no absolute path, ASCII names of at
//! most 99 bytes, sizes as declared, the whole payload under a byte cap (T-88-23).
//!
//! The error texts are the TS ones, so the install's warning line reads the same. The one exception is the
//! text of a gunzip failure inside the parentheses, which is the decoder's own (`deltas.json`).

use std::io::{Read, Write};

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;

const BLOCK: usize = 512;
const RECORD: usize = 10240;
const MAX_NAME_BYTES: usize = 99;

/// One file the writer puts in an archive.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlayArchiveFile {
    pub path: String,
    pub data: Vec<u8>,
}

/// Why a path is not one the archive may carry; `None` when it is fine. The order of the checks is the
/// TS's, because the first failing one names the error.
fn check_path(path: &str) -> Option<&'static str> {
    if path.is_empty() {
        return Some("empty path");
    }
    if path.starts_with('/') {
        return Some("absolute path");
    }
    if path.contains('\\') {
        return Some("backslash in path");
    }
    if !path.chars().all(|c| ('\x20'..='\x7e').contains(&c)) {
        return Some("non-ASCII path");
    }
    if path.len() > MAX_NAME_BYTES {
        return Some("path too long");
    }
    for seg in path.split('/') {
        match seg {
            "" => return Some("empty path segment"),
            "." => return Some("\".\" path segment"),
            ".." => return Some("\"..\" path segment"),
            _ => {}
        }
    }
    None
}

/// `value` in octal, zero padded on the left to `digits`.
fn octal(value: u64, digits: usize) -> String {
    format!("{value:0>digits$o}")
}

/// The ustar checksum: every byte summed with the checksum field itself counted as eight spaces.
fn header_checksum(header: &[u8]) -> u64 {
    header
        .iter()
        .enumerate()
        .map(|(i, &b)| {
            if (148..156).contains(&i) {
                0x20
            } else {
                b as u64
            }
        })
        .sum()
}

fn put(header: &mut [u8; BLOCK], at: usize, text: &str) {
    header[at..at + text.len()].copy_from_slice(text.as_bytes());
}

fn build_header(path: &str, size: u64) -> [u8; BLOCK] {
    let mut h = [0u8; BLOCK];
    put(&mut h, 0, path);
    put(&mut h, 100, "0000644\0");
    put(&mut h, 108, "0000000\0");
    put(&mut h, 116, "0000000\0");
    put(&mut h, 124, &(octal(size, 11) + "\0"));
    put(&mut h, 136, "00000000000\0");
    put(&mut h, 148, "        ");
    put(&mut h, 156, "0");
    put(&mut h, 257, "ustar\0");
    put(&mut h, 263, "00");
    let sum = octal(header_checksum(&h), 6) + "\0 ";
    put(&mut h, 148, &sum);
    h
}

/// The `.tar.gz` of `files`: ustar regular files sorted by the bytes of their paths, mode 0644, owner
/// and group 0, mtime 0, two zero blocks, padded to a 10240 byte record; gzip level 9 with the mtime 0
/// and the OS byte pinned to 3 so the archive does not depend on the build host. An `Err` names the
/// first bad or duplicate path.
pub fn build_overlay_tar_gz(files: &[OverlayArchiveFile]) -> Result<Vec<u8>, String> {
    let mut seen = std::collections::BTreeSet::new();
    for f in files {
        if let Some(bad) = check_path(&f.path) {
            return Err(format!("overlay archive: {bad}: {}", f.path));
        }
        if !seen.insert(f.path.as_bytes()) {
            return Err(format!("overlay archive: duplicate path: {}", f.path));
        }
    }
    let mut sorted: Vec<&OverlayArchiveFile> = files.iter().collect();
    sorted.sort_by(|a, b| a.path.as_bytes().cmp(b.path.as_bytes()));
    let mut body: Vec<u8> = Vec::new();
    for f in sorted {
        body.extend_from_slice(&build_header(&f.path, f.data.len() as u64));
        body.extend_from_slice(&f.data);
        let pad = (BLOCK - (f.data.len() % BLOCK)) % BLOCK;
        body.resize(body.len() + pad, 0);
    }
    body.resize(body.len() + BLOCK * 2, 0);
    let pad = (RECORD - (body.len() % RECORD)) % RECORD;
    body.resize(body.len() + pad, 0);

    let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
    encoder
        .write_all(&body)
        .map_err(|_| "overlay archive: gzip failed".to_string())?;
    let mut gz = encoder
        .finish()
        .map_err(|_| "overlay archive: gzip failed".to_string())?;
    if gz.len() < 10 || gz[4..8] != [0, 0, 0, 0] {
        return Err("overlay archive: gzip mtime is not zero".to_string());
    }
    // The OS byte is the build host's choice in a zlib; pin it to Unix so the archive is the same everywhere.
    gz[9] = 0x03;
    Ok(gz)
}

/// A NUL terminated field as text, one char per byte (latin1), as the TS read it.
fn read_c_string(buf: &[u8], start: usize, len: usize) -> String {
    let slice = &buf[start..start + len];
    let end = slice.iter().position(|&b| b == 0).unwrap_or(len);
    slice[..end].iter().map(|&b| b as char).collect()
}

/// JavaScript's `String.prototype.trim` over the latin1 range: tab, LF, VT, FF, CR, space and NBSP.
fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| matches!(c, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}'))
}

/// An octal number field, or `None` when it holds anything but octal digits.
fn read_octal(buf: &[u8], start: usize, len: usize) -> Option<u64> {
    let text = read_c_string(buf, start, len);
    let text = js_trim(&text);
    if text.is_empty() || !text.bytes().all(|b| (b'0'..=b'7').contains(&b)) {
        return None;
    }
    u64::from_str_radix(text, 8).ok()
}

/// The tar inside `archive`, refused when it passes `cap` bytes or when it is not gzip. The message
/// after `(` is the decoder's own.
fn gunzip(archive: &[u8], cap: u64) -> Result<Vec<u8>, String> {
    let fail =
        |why: &str| format!("overlay archive: gunzip failed or exceeded {cap} bytes ({why})");
    let mut out = Vec::new();
    // One byte past the cap tells "exactly at the cap" from "over it" without reading the rest.
    let limit = cap.saturating_add(1);
    GzDecoder::new(archive)
        .take(limit)
        .read_to_end(&mut out)
        .map_err(|e| fail(&e.to_string()))?;
    if out.len() as u64 > cap {
        return Err(fail("output is larger than the limit"));
    }
    Ok(out)
}

/// The files of a `.tar.gz` as `(path, bytes)` in archive order, accepting nothing but regular ustar
/// entries whose names are exactly `expected` (a path and the most bytes it may hold), and a payload of
/// at most `max_uncompressed_bytes`. The checks and their order are the TS reader's, and so are its
/// recorded quirks: an entry smaller than its pin is accepted (the install verifies sizes afterwards).
pub fn read_overlay_tar_gz(
    archive: &[u8],
    expected: &[(String, u64)],
    max_uncompressed_bytes: u64,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let tar = gunzip(archive, max_uncompressed_bytes)?;
    let mut out: Vec<(String, Vec<u8>)> = Vec::new();
    let mut pos = 0usize;
    while pos + BLOCK <= tar.len() {
        let header = &tar[pos..pos + BLOCK];
        if header.iter().all(|&b| b == 0) {
            break;
        }
        let stored = read_octal(header, 148, 8);
        if stored.is_none() || stored != Some(header_checksum(header)) {
            return Err("overlay archive: bad header checksum".to_string());
        }
        if &header[257..263] != b"ustar\0" || &header[263..265] != b"00" {
            return Err("overlay archive: not a POSIX ustar entry".to_string());
        }
        let typeflag = header[156] as char;
        if typeflag != '0' {
            return Err(format!(
                "overlay archive: unsupported entry type '{typeflag}'"
            ));
        }
        if !read_c_string(header, 345, 155).is_empty() {
            return Err("overlay archive: ustar prefix field is not allowed".to_string());
        }
        let name = read_c_string(header, 0, 100);
        if let Some(bad) = check_path(&name) {
            return Err(format!("overlay archive: {bad}: {name}"));
        }
        let Some(size) = read_octal(header, 124, 12) else {
            return Err("overlay archive: bad size field".to_string());
        };
        let Some((_, want)) = expected.iter().find(|(path, _)| *path == name) else {
            return Err(format!("overlay archive: unexpected path: {name}"));
        };
        if out.iter().any(|(path, _)| *path == name) {
            return Err(format!("overlay archive: duplicate path: {name}"));
        }
        if size > *want {
            return Err(format!(
                "overlay archive: entry larger than expected: {name}"
            ));
        }
        let data_start = pos + BLOCK;
        if data_start as u64 + size > tar.len() as u64 {
            return Err(format!("overlay archive: truncated data for {name}"));
        }
        let size = size as usize;
        out.push((name, tar[data_start..data_start + size].to_vec()));
        pos = data_start + size.div_ceil(BLOCK) * BLOCK;
    }
    for (path, _) in expected {
        if !out.iter().any(|(name, _)| name == path) {
            return Err(format!("overlay archive: missing expected path: {path}"));
        }
    }
    Ok(out)
}
