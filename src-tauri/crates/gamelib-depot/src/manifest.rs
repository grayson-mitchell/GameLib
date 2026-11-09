//! Depot manifest fetch, parse and on-disk cache (D-01). Ports steam-user's `content_manifest.js`
//! parse plus the filename decrypt of `depot/plan.ts`.
//!
//! Deliberately not done, matching TS: the manifest signature is not verified and `sha_filename`
//! is not checked ("some manifests contain invalid filename hashes"). Per-chunk and whole-file
//! SHA1 gate the bytes that reach disk.
//!
//! The cache holds the raw CDN bytes (filenames still encrypted); the depot key is applied on
//! every load and never written.

use crate::container::{decrypt_filename, unzip_manifest, DecodeError, MAX_MANIFEST_BYTES};
use crate::fetch::{FetchError, Fetcher, ERESULT_BLOCKED};
use crate::job::{DepotRef, DepotSummary, SummarizeRequest, SummarizeResult};
use crate::model::{ChunkRef, DepotManifest, ManifestFile};
use crate::outcome::{ErrorKind, Failure};
use prost::Message;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

// TS origin: content_manifest.js section magics.
const PAYLOAD_MAGIC: u32 = 0x71F6_17D0;
const METADATA_MAGIC: u32 = 0x1F48_12BE;
const SIGNATURE_MAGIC: u32 = 0x1B81_B817;
const END_OF_MANIFEST_MAGIC: u32 = 0x32C4_15AB;
const STEAM3_MANIFEST_MAGIC: u32 = 0x1634_9781;

const DIRECTORY_FLAG: u32 = 64;
const SYMLINK_FLAG: u32 = 512;
/// Matched paths returned per depot (T-73-36: a summary never carries the file list).
const MATCH_CAP: usize = 1000;

/// Port of `normalizeDepotPath` (depot/outcome.ts): `\` to `/`, leading `/` stripped, lowercased.
pub fn normalize_depot_path(p: &str) -> String {
    p.replace('\\', "/").trim_start_matches('/').to_lowercase()
}

/// Summary of one manifest: non-directory entry count, their bytes, and the normalised paths a
/// pattern list selects. A pattern with a `/` must equal the whole normalised path; one without
/// matches the basename (the `screenDepotPlanForSteamApi` rule). Case-insensitive via
/// normalisation. Directories and symlinks never match.
fn summarize_manifest(depot_id: &str, m: &DepotManifest, patterns: &[String]) -> DepotSummary {
    let pats: Vec<String> = patterns.iter().map(|p| normalize_depot_path(p)).collect();
    let mut file_count = 0u64;
    let mut total_bytes = 0u64;
    let mut matches: Vec<String> = Vec::new();
    for f in &m.files {
        if f.flags & DIRECTORY_FLAG != 0 {
            continue;
        }
        file_count += 1;
        total_bytes += f.size;
        if f.flags & SYMLINK_FLAG != 0 || matches.len() >= MATCH_CAP {
            continue;
        }
        let norm = normalize_depot_path(&f.filename);
        let base = norm.rsplit('/').next().unwrap_or("");
        let hit = pats.iter().any(|p| {
            if p.contains('/') {
                *p == norm
            } else {
                p == base
            }
        });
        if hit && !matches.contains(&norm) {
            matches.push(norm);
        }
    }
    DepotSummary {
        depot_id: depot_id.to_string(),
        file_count,
        total_bytes,
        matches,
    }
}

/// D-02: per-depot counts and pattern matches without shipping the manifest. Bounded by a 45 s
/// internal deadline (under the 60 s `rustInvoke` bound); expiry is `manifest_unavailable`.
pub async fn summarize(
    req: SummarizeRequest,
    store: &ManifestStore,
) -> Result<SummarizeResult, Failure> {
    let cancel = CancellationToken::new();
    let work = async {
        let mut depots = Vec::with_capacity(req.depots.len());
        let mut skipped_depots: Vec<String> = Vec::new();
        for d in &req.depots {
            if d.from_manifest.is_some() {
                return Err(failure(
                    ErrorKind::DeltaUnsupported,
                    "fromManifest delta installs are not supported",
                ));
            }
            match store.load(d, &cancel).await {
                Ok(m) => depots.push(summarize_manifest(&d.depot_id, &m, &req.patterns)),
                // EResult 40 (Blocked) skips the depot, like the TS plan builder.
                Err(FetchError::Failed(f))
                    if f.kind == ErrorKind::ManifestUnavailable
                        && f.eresult == Some(ERESULT_BLOCKED) =>
                {
                    skipped_depots.push(d.depot_id.clone());
                }
                Err(FetchError::Failed(f)) => return Err(f),
                Err(FetchError::Cancelled) => {
                    return Err(failure(ErrorKind::ManifestUnavailable, "cancelled"))
                }
            }
        }
        if depots.is_empty() && !skipped_depots.is_empty() {
            let mut f = failure(
                ErrorKind::ManifestUnavailable,
                format!(
                    "every selected depot for appId {} was blocked by Steam (eresult=40) and had to be skipped: {}",
                    req.app_id,
                    skipped_depots.join(", ")
                ),
            );
            f.eresult = Some(ERESULT_BLOCKED);
            return Err(f);
        }
        Ok(SummarizeResult {
            depots,
            skipped_depots,
        })
    };
    match tokio::time::timeout(Duration::from_secs(45), work).await {
        Ok(r) => r,
        Err(_) => Err(failure(
            ErrorKind::ManifestUnavailable,
            "manifest summary timed out",
        )),
    }
}

/// Newest GIDs kept per depot by [`ManifestStore::prune`].
const KEEP_GIDS: usize = 2;

#[derive(Clone, PartialEq, prost::Message)]
pub struct ChunkData {
    #[prost(bytes = "vec", optional, tag = "1")]
    pub sha: Option<Vec<u8>>,
    #[prost(fixed32, optional, tag = "2")]
    pub crc: Option<u32>,
    #[prost(uint64, optional, tag = "3")]
    pub offset: Option<u64>,
    #[prost(uint32, optional, tag = "4")]
    pub cb_original: Option<u32>,
    #[prost(uint32, optional, tag = "5")]
    pub cb_compressed: Option<u32>,
}

/// `filename` and `linktarget` are `bytes` (wire-identical to `string`) so a non-UTF-8 name does
/// not abort the manifest, as protobuf.js tolerates.
#[derive(Clone, PartialEq, prost::Message)]
pub struct FileMapping {
    #[prost(bytes = "vec", optional, tag = "1")]
    pub filename: Option<Vec<u8>>,
    #[prost(uint64, optional, tag = "2")]
    pub size: Option<u64>,
    #[prost(uint32, optional, tag = "3")]
    pub flags: Option<u32>,
    #[prost(bytes = "vec", optional, tag = "4")]
    pub sha_filename: Option<Vec<u8>>,
    #[prost(bytes = "vec", optional, tag = "5")]
    pub sha_content: Option<Vec<u8>>,
    #[prost(message, repeated, tag = "6")]
    pub chunks: Vec<ChunkData>,
    #[prost(bytes = "vec", optional, tag = "7")]
    pub linktarget: Option<Vec<u8>>,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct ContentManifestPayload {
    #[prost(message, repeated, tag = "1")]
    pub mappings: Vec<FileMapping>,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct ContentManifestMetadata {
    #[prost(uint32, optional, tag = "1")]
    pub depot_id: Option<u32>,
    #[prost(uint64, optional, tag = "2")]
    pub gid_manifest: Option<u64>,
    #[prost(uint32, optional, tag = "3")]
    pub creation_time: Option<u32>,
    #[prost(bool, optional, tag = "4")]
    pub filenames_encrypted: Option<bool>,
    #[prost(uint64, optional, tag = "5")]
    pub cb_disk_original: Option<u64>,
    #[prost(uint64, optional, tag = "6")]
    pub cb_disk_compressed: Option<u64>,
    #[prost(uint32, optional, tag = "7")]
    pub unique_chunks: Option<u32>,
    #[prost(uint32, optional, tag = "8")]
    pub crc_encrypted: Option<u32>,
    #[prost(uint32, optional, tag = "9")]
    pub crc_clear: Option<u32>,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct ContentManifestSignature {
    #[prost(bytes = "vec", optional, tag = "1")]
    pub signature: Option<Vec<u8>>,
}

fn bad(detail: impl Into<String>) -> DecodeError {
    DecodeError {
        code: "decode_failed",
        detail: detail.into(),
    }
}

fn sha20(v: Option<&Vec<u8>>, what: &str) -> Result<[u8; 20], DecodeError> {
    match v {
        None => Ok([0u8; 20]),
        Some(b) if b.is_empty() => Ok([0u8; 20]),
        Some(b) => b
            .as_slice()
            .try_into()
            .map_err(|_| bad(format!("{what}: expected 20 bytes, got {}", b.len()))),
    }
}

/// Splits the unwrapped manifest into sections and decodes them.
fn read_sections(
    buf: &[u8],
) -> Result<
    (
        Option<ContentManifestPayload>,
        Option<ContentManifestMetadata>,
    ),
    DecodeError,
> {
    let mut pos = 0usize;
    let mut payload = None;
    let mut meta = None;
    while pos < buf.len() {
        let magic = read_u32(buf, pos)?;
        pos += 4;
        match magic {
            PAYLOAD_MAGIC | METADATA_MAGIC | SIGNATURE_MAGIC => {
                let len = read_u32(buf, pos)? as usize;
                pos += 4;
                // Bounded by what is actually left (and, transitively, MAX_MANIFEST_BYTES).
                if len as u64 > MAX_MANIFEST_BYTES || len > buf.len() - pos {
                    return Err(bad(format!(
                        "section {magic:08x} length {len} exceeds remaining {}",
                        buf.len() - pos
                    )));
                }
                let body = &buf[pos..pos + len];
                pos += len;
                match magic {
                    PAYLOAD_MAGIC => {
                        payload = Some(
                            ContentManifestPayload::decode(body)
                                .map_err(|e| bad(format!("payload protobuf: {e}")))?,
                        );
                    }
                    METADATA_MAGIC => {
                        meta = Some(
                            ContentManifestMetadata::decode(body)
                                .map_err(|e| bad(format!("metadata protobuf: {e}")))?,
                        );
                    }
                    // Signature intentionally skipped (see module docs).
                    _ => {}
                }
            }
            END_OF_MANIFEST_MAGIC => {}
            STEAM3_MANIFEST_MAGIC => return Err(bad("unexpected Steam3 manifest")),
            other => {
                return Err(bad(format!(
                    "unknown magic {other:x} at offset {}",
                    pos - 4
                )))
            }
        }
    }
    Ok((payload, meta))
}

fn read_u32(buf: &[u8], pos: usize) -> Result<u32, DecodeError> {
    buf.get(pos..pos + 4)
        .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .ok_or_else(|| bad(format!("truncated section header at {pos}")))
}

/// Parses raw CDN manifest bytes (wrapped, filenames possibly encrypted) into the shared model.
/// `depot_key` is required only when the manifest says its filenames are encrypted.
pub fn parse_manifest(
    raw_cdn_bytes: &[u8],
    depot_key: Option<&[u8; 32]>,
) -> Result<DepotManifest, DecodeError> {
    let unwrapped = unzip_manifest(raw_cdn_bytes)?;
    let (payload, meta) = read_sections(&unwrapped)?;
    let meta = meta.unwrap_or_default();
    let encrypted = meta.filenames_encrypted.unwrap_or(false);
    let mut files = Vec::new();
    for m in payload.unwrap_or_default().mappings {
        let name_bytes = m.filename.unwrap_or_default();
        let filename = if encrypted {
            let key = depot_key.ok_or_else(|| bad("encrypted filenames but no depot key"))?;
            // Base64 is ASCII; lossy conversion keeps a hostile name from aborting here.
            decrypt_filename(&String::from_utf8_lossy(&name_bytes), key)?
        } else {
            String::from_utf8_lossy(&name_bytes).into_owned()
        };
        let linktarget = m
            .linktarget
            .filter(|b| !b.is_empty())
            .map(|b| String::from_utf8_lossy(&b).into_owned());
        let mut chunks = Vec::with_capacity(m.chunks.len());
        for c in &m.chunks {
            chunks.push(ChunkRef {
                sha: sha20(c.sha.as_ref(), "chunk sha")?,
                offset: c.offset.unwrap_or(0),
                cb_original: c.cb_original.unwrap_or(0),
                cb_compressed: c.cb_compressed.unwrap_or(0),
                crc: c.crc.unwrap_or(0),
            });
        }
        files.push(ManifestFile {
            filename,
            size: m.size.unwrap_or(0),
            flags: m.flags.unwrap_or(0),
            sha_content: sha20(m.sha_content.as_ref(), "sha_content")?,
            chunks,
            linktarget,
        });
    }
    Ok(DepotManifest {
        depot_id: meta.depot_id.unwrap_or(0).to_string(),
        gid: meta.gid_manifest.unwrap_or(0).to_string(),
        creation_time: meta.creation_time.unwrap_or(0),
        total_uncompressed: meta.cb_disk_original.unwrap_or(0),
        files,
    })
}

fn failure(kind: ErrorKind, message: impl Into<String>) -> Failure {
    Failure {
        file: None,
        kind,
        message: message.into(),
        code: None,
        eresult: None,
        http_status: None,
        scope: None,
        ms_since_progress: None,
    }
}

fn is_numeric_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 20 && s.bytes().all(|b| b.is_ascii_digit())
}

fn parse_key(hex: &str) -> Option<[u8; 32]> {
    if hex.len() != 64 || !hex.is_ascii() {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, o) in out.iter_mut().enumerate() {
        *o = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Cache-or-fetch manifest loader. Cache files are raw CDN bytes under
/// `<cache_dir>/<depotId>/<gid>.manifest`.
pub struct ManifestStore {
    cache_dir: PathBuf,
    fetcher: Arc<Fetcher>,
}

impl ManifestStore {
    pub fn new(cache_dir: PathBuf, fetcher: Arc<Fetcher>) -> Self {
        Self { cache_dir, fetcher }
    }

    /// Both ids must be all digits before they become path components.
    fn cache_path(&self, depot_id: &str, gid: &str) -> Option<PathBuf> {
        if !is_numeric_id(depot_id) || !is_numeric_id(gid) {
            return None;
        }
        Some(
            self.cache_dir
                .join(depot_id)
                .join(format!("{gid}.manifest")),
        )
    }

    pub async fn load(
        &self,
        depot: &DepotRef,
        cancel: &CancellationToken,
    ) -> Result<Arc<DepotManifest>, FetchError> {
        let path = self
            .cache_path(&depot.depot_id, &depot.manifest_id)
            .ok_or_else(|| {
                FetchError::Failed(failure(
                    ErrorKind::ManifestUnavailable,
                    "depot or manifest id is not numeric",
                ))
            })?;
        let key = parse_key(&depot.key).ok_or_else(|| {
            FetchError::Failed(failure(ErrorKind::ManifestDecode, "depot key is malformed"))
        })?;

        if let Ok(bytes) = tokio::fs::read(&path).await {
            match parse_manifest(&bytes, Some(&key)) {
                Ok(m) => return Ok(Arc::new(m)),
                // Corrupt cache entry: drop it and refetch once.
                Err(_) => {
                    let _ = tokio::fs::remove_file(&path).await;
                }
            }
        }

        let bytes = self
            .fetcher
            .fetch_manifest(
                &depot.depot_id,
                &depot.manifest_id,
                depot.request_code.as_deref(),
                cancel,
            )
            .await?;
        let manifest = parse_manifest(&bytes, Some(&key)).map_err(|e| {
            FetchError::Failed(failure(
                ErrorKind::ManifestDecode,
                format!("depot {}: {e}", depot.depot_id),
            ))
        })?;
        // A cache write failure costs a refetch next time; it never fails the load.
        let _ = write_atomic(&path, bytes).await;
        Ok(Arc::new(manifest))
    }

    /// Keeps `keep_gid` plus the newest other GID (by mtime); removes the rest.
    pub fn prune(&self, depot_id: &str, keep_gid: &str) {
        if !is_numeric_id(depot_id) || !is_numeric_id(keep_gid) {
            return;
        }
        let dir = self.cache_dir.join(depot_id);
        let Ok(rd) = std::fs::read_dir(&dir) else {
            return;
        };
        let keep_name = format!("{keep_gid}.manifest");
        let mut others: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let Some(stem) = name.strip_suffix(".manifest") else {
                continue;
            };
            if name == keep_name || !is_numeric_id(stem) {
                continue;
            }
            let mtime = e
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);
            others.push((mtime, e.path()));
        }
        others.sort_by_key(|a| std::cmp::Reverse(a.0));
        for (_, p) in others.into_iter().skip(KEEP_GIDS - 1) {
            let _ = std::fs::remove_file(p);
        }
    }
}

fn ensure_dir(dir: &Path) -> std::io::Result<()> {
    let mut b = std::fs::DirBuilder::new();
    b.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        b.mode(0o700);
    }
    b.create(dir)
}

async fn write_atomic(path: &Path, bytes: Vec<u8>) -> std::io::Result<()> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let dir = path
            .parent()
            .ok_or_else(|| std::io::Error::other("no parent"))?;
        ensure_dir(dir)?;
        let tmp = dir.join(format!(
            ".tmp-{}-{}",
            std::process::id(),
            TMP_SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::write(&tmp, &bytes)?;
        std::fs::rename(&tmp, &path).inspect_err(|_| {
            let _ = std::fs::remove_file(&tmp);
        })
    })
    .await
    .map_err(std::io::Error::other)?
}
