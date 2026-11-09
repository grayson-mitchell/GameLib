//! Byte-level transforms: Steam AES, filename decrypt, chunk containers (VZ / VSZa / PK), the
//! manifest wrapper and the size-then-SHA1 chunk gate. Ports `depot/crypto.ts`,
//! `depot/chunkDecode.ts` and steam-user's `CdnCompression.unzip`. Owner: 73-02.
//!
//! All input is untrusted network data: every slice index is checked, every decoder writes through
//! a bounded sink, and a declared size is compared against the trusted size before any allocation.

use aes::cipher::block_padding::NoPadding;
use aes::cipher::{BlockCipherDecrypt, BlockModeDecrypt, KeyInit, KeyIvInit};
use sha1::{Digest, Sha1};
use std::io::{self, Read, Write};

/// Mirrors TS `RAW_BODY_PREVIEW_BYTES`; the only bytes ever placed in a `DecodeError` detail.
pub const RAW_BODY_PREVIEW_BYTES: usize = 16;
/// Largest manifest (decoded) we accept.
pub const MAX_MANIFEST_BYTES: u64 = 256 * 1024 * 1024;

/// Which container a chunk used (feeds `Outcome.stats.containers`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainerKind {
    Vz,
    Vsza,
    Pk,
}

/// `code` is one of the five TS `DECODE_STAGE_ERROR_CODES`. `detail` holds lengths and magic
/// bytes only, never key material.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodeError {
    pub code: &'static str,
    pub detail: String,
}

impl DecodeError {
    fn new(code: &'static str, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }
    fn failed(detail: impl Into<String>) -> Self {
        Self::new("decode_failed", detail)
    }
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.detail)
    }
}

impl std::error::Error for DecodeError {}

fn hex_preview(buf: &[u8]) -> String {
    use std::fmt::Write as _;
    let mut s = String::new();
    for b in buf.iter().take(RAW_BODY_PREVIEW_BYTES) {
        let _ = write!(s, "{b:02x}");
    }
    s
}

/// Steam's symmetric decrypt. First 16 bytes are the IV, AES-256-ECB encrypted under `key`; the
/// remainder is AES-256-CBC under that IV. PKCS7 is stripped leniently exactly as `crypto.ts`:
/// when the padding is invalid the plaintext is returned UNSTRIPPED, not as an error.
pub fn steam_decrypt(enc: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, DecodeError> {
    if enc.len() < 32 {
        return Err(DecodeError::failed(format!(
            "ciphertext too short: {} bytes",
            enc.len()
        )));
    }
    let cipher = aes::Aes256::new(key.into());
    let mut iv = [0u8; 16];
    iv.copy_from_slice(&enc[..16]);
    cipher.decrypt_block((&mut iv).into());

    let mut plain = enc[16..].to_vec();
    cbc::Decryptor::<aes::Aes256>::new(key.into(), (&iv).into())
        .decrypt_padded::<NoPadding>(&mut plain)
        .map_err(|_| {
            DecodeError::failed(format!("ciphertext body not block aligned: {}", enc.len()))
        })?;

    let pad = plain.last().copied().unwrap_or(0) as usize;
    let pad_ok = (1..=16).contains(&pad)
        && pad <= plain.len()
        && plain[plain.len() - pad..]
            .iter()
            .all(|&b| b as usize == pad);
    if pad_ok {
        plain.truncate(plain.len() - pad);
    }
    Ok(plain)
}

/// Standard-alphabet base64 decode with Node's leniency: whitespace is skipped, url-safe
/// characters are accepted, padding is optional and decoding stops at the first `=`.
fn base64_decode(s: &str) -> Result<Vec<u8>, DecodeError> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3 + 3);
    let mut acc: u32 = 0;
    let mut bits = 0u32;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            b' ' | b'\t' | b'\r' | b'\n' => continue,
            _ => return Err(DecodeError::failed("invalid base64 character")),
        };
        acc = (acc << 6) | u32::from(v);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

/// Decrypt a manifest filename: plaintext is `filename NUL padding`; cut at the first NUL and
/// decode UTF-8 lossily. Never sanitizes: path containment is the caller's job.
pub fn decrypt_filename(b64: &str, key: &[u8; 32]) -> Result<String, DecodeError> {
    let plain = steam_decrypt(&base64_decode(b64)?, key)?;
    let end = plain.iter().position(|&b| b == 0).unwrap_or(plain.len());
    Ok(String::from_utf8_lossy(&plain[..end]).into_owned())
}

/// Output sink that refuses to grow past `cap` bytes.
struct Capped {
    buf: Vec<u8>,
    cap: usize,
    overflowed: bool,
}

impl Capped {
    fn new(cap: u64) -> Self {
        let cap = usize::try_from(cap).unwrap_or(usize::MAX);
        Self {
            buf: Vec::with_capacity(cap.min(1 << 20)),
            cap,
            overflowed: false,
        }
    }
}

impl Write for Capped {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        if self.buf.len().saturating_add(data.len()) > self.cap {
            self.overflowed = true;
            return Err(io::Error::other("output cap exceeded"));
        }
        self.buf.extend_from_slice(data);
        Ok(data.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Run `reader` to the end through a sink capped at `cap`. Exceeding the cap is `size_mismatch`.
fn drain_capped<R: Read>(mut reader: R, cap: u64, what: &str) -> Result<Vec<u8>, DecodeError> {
    let mut sink = Capped::new(cap);
    match io::copy(&mut reader, &mut sink) {
        Ok(_) => Ok(sink.buf),
        Err(_) if sink.overflowed => Err(DecodeError::new(
            "size_mismatch",
            format!("{what}: output exceeds cap {cap}"),
        )),
        Err(e) => Err(DecodeError::failed(format!("{what}: {e}"))),
    }
}

fn u16_at(b: &[u8], off: usize) -> Result<u16, DecodeError> {
    b.get(off..off + 2)
        .map(|s| u16::from_le_bytes([s[0], s[1]]))
        .ok_or_else(|| DecodeError::failed("truncated container"))
}

fn u32_at(b: &[u8], off: usize) -> Result<u32, DecodeError> {
    b.get(off..off + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .ok_or_else(|| DecodeError::failed("truncated container"))
}

/// VZ: `'VZa'(3) | ts(4) | props(5) | lzma body | crc(4) | outSize(4) | 'zv'`.
/// `expected` is the trusted size when known; `cap` bounds the output either way.
fn decode_vz(buf: &[u8], expected: Option<u64>, cap: u64) -> Result<Vec<u8>, DecodeError> {
    if buf.len() < 22 {
        return Err(DecodeError::failed(format!(
            "VZ chunk too short: {} bytes",
            buf.len()
        )));
    }
    if &buf[buf.len() - 2..] != b"zv" {
        return Err(DecodeError::new(
            "bad_footer_magic",
            "VZ chunk: bad footer magic",
        ));
    }
    let props = &buf[7..12];
    let payload = &buf[12..buf.len() - 10];
    let out_size = u32_at(buf, buf.len() - 6)?;
    if let Some(e) = expected {
        if u64::from(out_size) != e {
            return Err(DecodeError::new(
                "size_mismatch",
                format!("VZ chunk: footer size {out_size} != expected {e}"),
            ));
        }
    }
    let mut stream = Vec::with_capacity(13 + payload.len());
    stream.extend_from_slice(props);
    stream.extend_from_slice(&u64::from(out_size).to_le_bytes());
    stream.extend_from_slice(payload);

    let dec = xz2::stream::Stream::new_lzma_decoder(u64::MAX)
        .map_err(|e| DecodeError::failed(format!("lzma init: {e}")))?;
    drain_capped(
        xz2::read::XzDecoder::new_stream(&stream[..], dec),
        cap,
        "VZ",
    )
}

/// VSZa: `'VSZa'(4) | crc(4) | zstd body | crc(4) | size(4) | pad(4) | 'zsv'`.
fn decode_vsza(buf: &[u8], expected: Option<u64>, cap: u64) -> Result<Vec<u8>, DecodeError> {
    if &buf[..4.min(buf.len())] != b"VSZa" {
        return Err(DecodeError::new(
            "bad_footer_magic",
            "zstd chunk: bad header magic",
        ));
    }
    if buf.len() < 23 || &buf[buf.len() - 3..] != b"zsv" {
        return Err(DecodeError::new(
            "bad_footer_magic",
            "zstd chunk: bad footer magic",
        ));
    }
    let declared = u64::from(u32_at(buf, buf.len() - 11)?);
    // Decompression-bomb guard: compare the untrusted footer size to the trusted one before the
    // decoder runs.
    if let Some(e) = expected {
        if declared != e {
            return Err(DecodeError::new(
                "size_mismatch",
                format!("zstd chunk: footer decompressedSize {declared} != expected {e} -- refusing to allocate"),
            ));
        }
    }
    if declared > cap {
        return Err(DecodeError::new(
            "size_mismatch",
            format!("zstd chunk: footer decompressedSize {declared} exceeds cap {cap}"),
        ));
    }
    let compressed = &buf[8..buf.len() - 15];
    let dec = zstd::stream::read::Decoder::new(compressed)
        .map_err(|e| DecodeError::failed(format!("zstd init: {e}")))?;
    drain_capped(dec, cap, "VSZa")
}

/// PK local-file-header container (method 0 stored, method 8 deflate).
fn decode_pk(buf: &[u8], expected: Option<u64>, cap: u64) -> Result<Vec<u8>, DecodeError> {
    let name_len = usize::from(u16_at(buf, 26)?);
    let extra_len = usize::from(u16_at(buf, 28)?);
    let body = buf
        .get(30 + name_len + extra_len..)
        .ok_or_else(|| DecodeError::failed("PK chunk: header exceeds buffer"))?;
    let method = u16_at(buf, 8)?;
    match method {
        0 => {
            let flags = u16_at(buf, 6)?;
            let stored_len = if flags & 0x08 != 0 {
                // Bit 3: header sizes are zero; the manifest size is the only trusted length.
                expected.ok_or_else(|| {
                    DecodeError::new(
                        "unknown_container",
                        format!(
                            "PK chunk: data descriptor without expected size; magic {}",
                            hex_preview(buf)
                        ),
                    )
                })?
            } else {
                u64::from(u32_at(buf, 18)?)
            };
            if stored_len > body.len() as u64 {
                return Err(DecodeError::new(
                    "size_mismatch",
                    format!(
                        "PK chunk: declared Stored payload length {stored_len} exceeds available bytes {}",
                        body.len()
                    ),
                ));
            }
            if stored_len > cap {
                return Err(DecodeError::new(
                    "size_mismatch",
                    format!("PK chunk: stored length {stored_len} exceeds cap {cap}"),
                ));
            }
            Ok(body[..stored_len as usize].to_vec())
        }
        8 => drain_capped(flate2::read::DeflateDecoder::new(body), cap, "PK deflate"),
        m => Err(DecodeError::new(
            "unknown_container",
            format!(
                "PK chunk: unsupported compression method {m}; magic {}",
                hex_preview(buf)
            ),
        )),
    }
}

/// Decrypt, sniff the container, decompress (output capped at `cb_original`), then check length
/// and finally SHA1 (reason codes `size_mismatch` then `sha1_mismatch`, in that order).
pub fn decode_chunk(
    raw_encrypted: &[u8],
    key: &[u8; 32],
    cb_original: u64,
    expected_sha1: &[u8; 20],
) -> Result<(Vec<u8>, ContainerKind), DecodeError> {
    let buf = steam_decrypt(raw_encrypted, key)?;
    let (data, kind) = if buf.starts_with(b"VZ") {
        (
            decode_vz(&buf, Some(cb_original), cb_original)?,
            ContainerKind::Vz,
        )
    } else if buf.starts_with(b"VS") {
        (
            decode_vsza(&buf, Some(cb_original), cb_original)?,
            ContainerKind::Vsza,
        )
    } else if buf.starts_with(b"PK") {
        (
            decode_pk(&buf, Some(cb_original), cb_original)?,
            ContainerKind::Pk,
        )
    } else {
        return Err(DecodeError::new(
            "unknown_container",
            format!("unknown chunk container; magic {}", hex_preview(&buf)),
        ));
    };

    if data.len() as u64 != cb_original {
        return Err(DecodeError::new(
            "size_mismatch",
            format!("chunk size mismatch: {} != {cb_original}", data.len()),
        ));
    }
    let got = Sha1::digest(&data);
    if got.as_slice() != expected_sha1 {
        return Err(DecodeError::new("sha1_mismatch", "chunk sha1 mismatch"));
    }
    Ok((data, kind))
}

/// Manifest wrapper, as `CdnCompression.unzip`: `VSZa`, `VZa` or a real zip (first entry, found
/// via the central directory). Decoded size is capped at [`MAX_MANIFEST_BYTES`].
pub fn unzip_manifest(buf: &[u8]) -> Result<Vec<u8>, DecodeError> {
    if buf.starts_with(b"VSZa") {
        let declared = u64::from(u32_at(buf, buf.len().saturating_sub(11))?);
        let out = decode_vsza(buf, Some(declared), MAX_MANIFEST_BYTES)?;
        check_declared(out, declared)
    } else if buf.starts_with(b"VZa") {
        let declared = u64::from(u32_at(buf, buf.len().saturating_sub(6))?);
        let out = decode_vz(buf, Some(declared), MAX_MANIFEST_BYTES)?;
        check_declared(out, declared)
    } else if buf.starts_with(b"PK\x03\x04") {
        unzip_first_entry(buf)
    } else {
        Err(DecodeError::new(
            "unknown_container",
            format!("unknown manifest compression; magic {}", hex_preview(buf)),
        ))
    }
}

fn check_declared(out: Vec<u8>, declared: u64) -> Result<Vec<u8>, DecodeError> {
    if out.len() as u64 != declared {
        return Err(DecodeError::new(
            "size_mismatch",
            format!("manifest size mismatch: {} != {declared}", out.len()),
        ));
    }
    Ok(out)
}

/// End-of-central-directory scan window: 22-byte record plus a maximal 65535-byte comment.
const EOCD_SCAN: usize = 65_557;

fn unzip_first_entry(buf: &[u8]) -> Result<Vec<u8>, DecodeError> {
    // Locate the EOCD record, scanning backwards.
    let lo = buf.len().saturating_sub(EOCD_SCAN);
    let eocd = (lo..buf.len().saturating_sub(21))
        .rev()
        .find(|&i| buf[i..i + 4] == *b"PK\x05\x06")
        .ok_or_else(|| DecodeError::failed("zip: no end of central directory"))?;
    if u16_at(buf, eocd + 10)? == 0 {
        return Err(DecodeError::failed("zip: no entries"));
    }
    let cd = usize::try_from(u32_at(buf, eocd + 16)?)
        .map_err(|_| DecodeError::failed("zip: bad central directory offset"))?;
    if buf.get(cd..cd + 4) != Some(b"PK\x01\x02") {
        return Err(DecodeError::failed("zip: bad central directory entry"));
    }
    let method = u16_at(buf, cd + 10)?;
    let csize = u32_at(buf, cd + 20)?;
    let usize_ = u32_at(buf, cd + 24)?;
    let local = usize::try_from(u32_at(buf, cd + 42)?)
        .map_err(|_| DecodeError::failed("zip: bad local header offset"))?;
    if csize == u32::MAX || usize_ == u32::MAX {
        return Err(DecodeError::failed("zip64 entries are not supported"));
    }
    if u64::from(usize_) > MAX_MANIFEST_BYTES {
        return Err(DecodeError::new(
            "size_mismatch",
            format!("zip: declared size {usize_} exceeds {MAX_MANIFEST_BYTES}"),
        ));
    }
    if buf.get(local..local + 4) != Some(b"PK\x03\x04") {
        return Err(DecodeError::failed("zip: bad local header"));
    }
    let name_len = usize::from(u16_at(buf, local + 26)?);
    let extra_len = usize::from(u16_at(buf, local + 28)?);
    let start = local + 30 + name_len + extra_len;
    let end = start
        .checked_add(csize as usize)
        .ok_or_else(|| DecodeError::failed("zip: entry overflows"))?;
    let body = buf
        .get(start..end)
        .ok_or_else(|| DecodeError::failed("zip: entry data outside buffer"))?;
    let out = match method {
        0 => body.to_vec(),
        8 => drain_capped(
            flate2::read::DeflateDecoder::new(body),
            u64::from(usize_),
            "zip deflate",
        )?,
        m => {
            return Err(DecodeError::new(
                "unknown_container",
                format!("zip: unsupported compression method {m}"),
            ))
        }
    };
    check_declared(out, u64::from(usize_))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_node() {
        assert_eq!(base64_decode("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(base64_decode("aGVsbG8").unwrap(), b"hello");
        assert_eq!(base64_decode("aGVs\nbG8=").unwrap(), b"hello");
        assert_eq!(base64_decode("-_-_").unwrap(), [0xfb, 0xff, 0xbf]);
        assert_eq!(base64_decode("").unwrap(), b"");
        assert!(base64_decode("a$b").is_err());
    }

    #[test]
    fn short_ciphertext_is_decode_failed() {
        let e = steam_decrypt(&[0u8; 31], &[0u8; 32]).unwrap_err();
        assert_eq!(e.code, "decode_failed");
    }
}
