//! Parsed depot-manifest model shared by the manifest, planner, downloader and post-processing
//! modules. Plain data; no key material, so `Debug` is derived.

#[derive(Debug, Clone)]
pub struct ChunkRef {
    pub sha: [u8; 20],
    pub offset: u64,
    pub cb_original: u32,
    pub cb_compressed: u32,
    pub crc: u32,
}

#[derive(Debug, Clone)]
pub struct ManifestFile {
    /// Decrypted; `\` kept as shipped (normalised only by `resolve_contained_path`).
    pub filename: String,
    pub size: u64,
    pub flags: u32,
    pub sha_content: [u8; 20],
    pub chunks: Vec<ChunkRef>,
    pub linktarget: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DepotManifest {
    pub depot_id: String,
    pub gid: String,
    pub creation_time: u32,
    pub total_uncompressed: u64,
    pub files: Vec<ManifestFile>,
}
