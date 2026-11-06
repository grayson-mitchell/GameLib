//! Ranged readers shared by the scanners. A short or failed read is always `None`,
//! mirroring peSteamDrm.ts `PeReader`/`readExact`.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

pub trait RangeRead {
    fn byte_len(&self) -> u64;
    /// Exactly `length` bytes at `offset`, or `None` on overflow, past-EOF or I/O failure.
    fn read_at(&mut self, offset: u64, length: usize) -> Option<Vec<u8>>;
}

fn in_range(total: u64, offset: u64, length: usize) -> bool {
    match offset.checked_add(length as u64) {
        Some(end) => end <= total,
        None => false,
    }
}

pub struct FileReader {
    file: File,
    len: u64,
}

impl FileReader {
    pub fn open(path: &Path) -> std::io::Result<FileReader> {
        let file = File::open(path)?;
        let len = file.metadata()?.len();
        Ok(FileReader { file, len })
    }
}

impl RangeRead for FileReader {
    fn byte_len(&self) -> u64 {
        self.len
    }

    fn read_at(&mut self, offset: u64, length: usize) -> Option<Vec<u8>> {
        if !in_range(self.len, offset, length) {
            return None;
        }
        self.file.seek(SeekFrom::Start(offset)).ok()?;
        let mut buf = vec![0u8; length];
        self.file.read_exact(&mut buf).ok()?;
        Some(buf)
    }
}

pub struct SliceReader<'a> {
    data: &'a [u8],
}

impl<'a> SliceReader<'a> {
    pub fn new(data: &'a [u8]) -> SliceReader<'a> {
        SliceReader { data }
    }
}

impl RangeRead for SliceReader<'_> {
    fn byte_len(&self) -> u64 {
        self.data.len() as u64
    }

    fn read_at(&mut self, offset: u64, length: usize) -> Option<Vec<u8>> {
        if !in_range(self.data.len() as u64, offset, length) {
            return None;
        }
        let start = offset as usize;
        Some(self.data[start..start + length].to_vec())
    }
}

/// Up to `max` bytes from the start of the file; a partial read is accepted
/// (mirrors shimGenerate.ts `detectDrmWrapper`).
pub fn read_prefix(path: &Path, max: usize) -> std::io::Result<Vec<u8>> {
    let mut file = File::open(path)?;
    let mut buf = Vec::new();
    file.by_ref().take(max as u64).read_to_end(&mut buf)?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slice_reader_bounds() {
        let mut r = SliceReader::new(&[1, 2, 3, 4]);
        assert_eq!(r.byte_len(), 4);
        assert_eq!(r.read_at(1, 2), Some(vec![2, 3]));
        assert_eq!(r.read_at(3, 2), None);
        assert_eq!(r.read_at(u64::MAX, 2), None);
    }

    #[test]
    fn file_reader_and_prefix() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("f.bin");
        std::fs::write(&p, [9u8, 8, 7, 6]).unwrap();
        let mut r = FileReader::open(&p).unwrap();
        assert_eq!(r.byte_len(), 4);
        assert_eq!(r.read_at(2, 2), Some(vec![7, 6]));
        assert_eq!(r.read_at(2, 3), None);
        assert_eq!(read_prefix(&p, 100).unwrap(), vec![9, 8, 7, 6]);
        assert_eq!(read_prefix(&p, 2).unwrap(), vec![9, 8]);
    }
}
