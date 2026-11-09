//! Deterministic synthetic CDN fixtures (D-14, Tier 1 parity input). Everything here is derived
//! from case names and an inline PRNG: no real keys, no game content, no `rand` crate.
//!
//! A case renders to a flat map of relative path -> bytes:
//! `case.json`, `manifests/<depotId>_<gid>.bin` (wrapped exactly as a CDN serves it) and
//! `chunks/<sha-hex>.bin` (encrypted chunk bodies, deterministic IV).

use super::encode;
use gamelib_depot::manifest::{
    ChunkData, ContentManifestMetadata, ContentManifestPayload, FileMapping,
};
use prost::Message;
use sha1::{Digest, Sha1};
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::path::Path;

pub const DIRECTORY_FLAG: u32 = 64;
pub const SYMLINK_FLAG: u32 = 512;
pub const EXECUTABLE_FLAG: u32 = 32;
pub const READONLY_FLAG: u32 = 8;
pub const HIDDEN_FLAG: u32 = 16;

const PAYLOAD_MAGIC: u32 = 0x71F6_17D0;
const METADATA_MAGIC: u32 = 0x1F48_12BE;
const END_OF_MANIFEST_MAGIC: u32 = 0x32C4_15AB;

#[derive(Clone, Copy)]
pub enum Wrapper {
    Zip,
    Vza,
    Vsza,
}

#[derive(Clone, Copy)]
pub enum Codec {
    Vz,
    Vsza,
    PkDeflate,
    PkStoredDd,
}

pub struct FixtureFile {
    pub path: String,
    pub content: Vec<u8>,
    pub flags: u32,
    pub chunk_size: usize,
    pub codec: Codec,
    pub linktarget: Option<String>,
}

impl FixtureFile {
    pub fn new(path: &str, content: Vec<u8>, chunk_size: usize, codec: Codec) -> Self {
        Self {
            path: path.to_string(),
            content,
            flags: 0,
            chunk_size,
            codec,
            linktarget: None,
        }
    }
    pub fn flags(mut self, flags: u32) -> Self {
        self.flags = flags;
        self
    }
    pub fn directory(path: &str) -> Self {
        Self::new(path, Vec::new(), 1024, Codec::Vz).flags(DIRECTORY_FLAG)
    }
    pub fn symlink(path: &str, target: &str) -> Self {
        let mut f = Self::new(path, Vec::new(), 1024, Codec::Vz).flags(SYMLINK_FLAG);
        f.linktarget = Some(target.to_string());
        f
    }
}

pub struct FixtureDepot {
    pub depot_id: u32,
    pub gid: u64,
    pub wrapper: Wrapper,
    pub encrypt_names: bool,
    pub files: Vec<FixtureFile>,
}

pub struct FixtureFinalize {
    pub installdir: String,
    pub name: String,
    pub buildid: String,
    pub last_owner: String,
    pub allow_full_ownership: bool,
}

pub struct FixtureCase {
    pub name: &'static str,
    pub app_id: u32,
    pub mode: &'static str,
    pub install_root: &'static str,
    pub depots: Vec<FixtureDepot>,
    pub finalize: Option<FixtureFinalize>,
}

/// splitmix64: tiny, fixed, dependency-free.
struct Prng(u64);

impl Prng {
    fn from_label(label: &str) -> Self {
        let h = Sha1::digest(label.as_bytes());
        Prng(u64::from_le_bytes(h[..8].try_into().unwrap()))
    }
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

/// Synthetic text-like bytes (limited alphabet so the codecs have something to compress).
pub fn synth(label: &str, len: usize) -> Vec<u8> {
    let mut p = Prng::from_label(label);
    (0..len)
        .map(|_| b"abcdefghij klmnop\n0123"[(p.next() % 22) as usize])
        .collect()
}

/// Thin 64-bit little-endian Mach-O header of the given filetype, padded with synthetic bytes.
pub fn macho_thin(filetype: u32, label: &str, len: usize) -> Vec<u8> {
    let mut v = Vec::new();
    v.extend_from_slice(&0xfeed_facfu32.to_le_bytes());
    v.extend_from_slice(&0x0100_000cu32.to_le_bytes()); // arm64
    v.extend_from_slice(&0u32.to_le_bytes());
    v.extend_from_slice(&filetype.to_le_bytes());
    v.extend_from_slice(&[0u8; 16]);
    v.extend(synth(label, len.saturating_sub(v.len())));
    v
}

/// Fat (big-endian) wrapper with two arch entries; the first slice at offset 64 is a thin image.
pub fn macho_fat(filetype: u32, label: &str) -> Vec<u8> {
    let mut v = Vec::new();
    v.extend_from_slice(&0xcafe_babeu32.to_be_bytes());
    v.extend_from_slice(&2u32.to_be_bytes());
    for (cpu, off) in [(0x0100_000cu32, 64u32), (0x0100_0007u32, 192u32)] {
        v.extend_from_slice(&cpu.to_be_bytes());
        v.extend_from_slice(&0u32.to_be_bytes());
        v.extend_from_slice(&off.to_be_bytes());
        v.extend_from_slice(&128u32.to_be_bytes());
        v.extend_from_slice(&6u32.to_be_bytes());
    }
    v.resize(64, 0);
    v.extend(macho_thin(filetype, label, 128));
    v.extend(macho_thin(2, label, 128));
    v
}

fn derive_key(case: &str, depot_id: u32) -> [u8; 32] {
    let a = Sha1::digest(format!("gamelib-fixture-key-a|{case}|{depot_id}").as_bytes());
    let b = Sha1::digest(format!("gamelib-fixture-key-b|{case}|{depot_id}").as_bytes());
    let mut k = [0u8; 32];
    k[..20].copy_from_slice(&a);
    k[20..].copy_from_slice(&b[..12]);
    k
}

fn derive_iv(key: &[u8; 32], salt: &[u8]) -> [u8; 16] {
    let mut h = Sha1::new();
    h.update(key);
    h.update(salt);
    let d = h.finalize();
    let mut iv = [0u8; 16];
    iv.copy_from_slice(&d[..16]);
    iv
}

fn hex(b: &[u8]) -> String {
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        let _ = write!(s, "{x:02x}");
    }
    s
}

fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::new();
    for c in data.chunks(3) {
        let n = (u32::from(c[0]) << 16)
            | (u32::from(*c.get(1).unwrap_or(&0)) << 8)
            | u32::from(*c.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= c.len() {
                s.push(T[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                s.push('=');
            }
        }
    }
    s
}

fn section(magic: u32, body: &[u8]) -> Vec<u8> {
    let mut v = magic.to_le_bytes().to_vec();
    v.extend_from_slice(&(body.len() as u32).to_le_bytes());
    v.extend_from_slice(body);
    v
}

fn put(out: &mut BTreeMap<String, Vec<u8>>, path: String, bytes: Vec<u8>) {
    if let Some(prev) = out.get(&path) {
        assert_eq!(
            prev, &bytes,
            "fixture path {path} produced two different bodies"
        );
        return;
    }
    out.insert(path, bytes);
}

fn json_str(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}

fn json_opt(s: Option<&str>) -> String {
    s.map_or_else(|| "null".to_string(), json_str)
}

/// Render one case to relative-path -> bytes.
pub fn render(case: &FixtureCase) -> BTreeMap<String, Vec<u8>> {
    let mut out = BTreeMap::new();
    let mut depot_json = Vec::new();
    for depot in &case.depots {
        let key = derive_key(case.name, depot.depot_id);
        let mut mappings = Vec::new();
        let mut total = 0u64;
        let mut unique = 0u32;
        for (fi, f) in depot.files.iter().enumerate() {
            let mut chunks = Vec::new();
            let mut offset = 0u64;
            for piece in f.content.chunks(f.chunk_size) {
                let sha: [u8; 20] = Sha1::digest(piece).into();
                let container = match f.codec {
                    Codec::Vz => encode::vz_wrap(piece),
                    Codec::Vsza => encode::vsza_wrap(piece),
                    Codec::PkDeflate => encode::pk_deflate(piece),
                    Codec::PkStoredDd => encode::pk_stored_dd(piece),
                };
                let iv = derive_iv(&key, &sha);
                let enc = encode::steam_encrypt(&container, &key, &iv);
                chunks.push(ChunkData {
                    sha: Some(sha.to_vec()),
                    crc: Some(encode::crc32(piece)),
                    offset: Some(offset),
                    cb_original: Some(piece.len() as u32),
                    cb_compressed: Some(enc.len() as u32),
                });
                offset += piece.len() as u64;
                unique += 1;
                put(&mut out, format!("chunks/{}.bin", hex(&sha)), enc);
            }
            let name_bytes = if depot.encrypt_names {
                let mut plain = f.path.as_bytes().to_vec();
                plain.push(0);
                let iv = derive_iv(&key, format!("name{fi}").as_bytes());
                b64(&encode::steam_encrypt(&plain, &key, &iv)).into_bytes()
            } else {
                f.path.clone().into_bytes()
            };
            let sha_content: Vec<u8> = if f.content.is_empty() {
                vec![0u8; 20]
            } else {
                Sha1::digest(&f.content).to_vec()
            };
            total += f.content.len() as u64;
            mappings.push(FileMapping {
                filename: Some(name_bytes),
                size: Some(f.content.len() as u64),
                flags: Some(f.flags),
                sha_filename: None,
                sha_content: Some(sha_content),
                chunks,
                linktarget: f.linktarget.clone().map(String::into_bytes),
            });
        }
        let payload = ContentManifestPayload { mappings };
        let meta = ContentManifestMetadata {
            depot_id: Some(depot.depot_id),
            gid_manifest: Some(depot.gid),
            creation_time: Some(1_700_000_000),
            filenames_encrypted: Some(depot.encrypt_names),
            cb_disk_original: Some(total),
            unique_chunks: Some(unique),
            ..Default::default()
        };
        let mut raw = section(PAYLOAD_MAGIC, &payload.encode_to_vec());
        raw.extend(section(METADATA_MAGIC, &meta.encode_to_vec()));
        raw.extend_from_slice(&END_OF_MANIFEST_MAGIC.to_le_bytes());
        let wrapped = match depot.wrapper {
            Wrapper::Zip => encode::zip_wrap(&raw, 8),
            Wrapper::Vza => encode::vz_wrap(&raw),
            Wrapper::Vsza => encode::vsza_wrap(&raw),
        };
        let manifest_file = format!("manifests/{}_{}.bin", depot.depot_id, depot.gid);
        put(&mut out, manifest_file.clone(), wrapped);
        depot_json.push(format!(
            "    {{\n      \"depotId\": {},\n      \"manifestId\": {},\n      \"keyHex\": {},\n      \"manifestFile\": {}\n    }}",
            json_str(&depot.depot_id.to_string()),
            json_str(&depot.gid.to_string()),
            json_str(&hex(&key)),
            json_str(&manifest_file),
        ));
    }
    let finalize = match &case.finalize {
        None => "null".to_string(),
        Some(f) => format!(
            "{{\n    \"steamappsDir\": \"steamapps\",\n    \"installdir\": {},\n    \"name\": {},\n    \"buildid\": {},\n    \"lastOwner\": {},\n    \"allowFullOwnership\": {}\n  }}",
            json_str(&f.installdir),
            json_str(&f.name),
            json_opt(Some(&f.buildid)),
            json_opt(Some(&f.last_owner)),
            f.allow_full_ownership,
        ),
    };
    let case_json = format!(
        "{{\n  \"name\": {},\n  \"appId\": {},\n  \"mode\": {},\n  \"installRoot\": {},\n  \"depots\": [\n{}\n  ],\n  \"finalize\": {},\n  \"hostsHint\": [\"cdn.fixture.invalid\"]\n}}\n",
        json_str(case.name),
        json_str(&case.app_id.to_string()),
        json_str(case.mode),
        json_str(case.install_root),
        depot_json.join(",\n"),
        finalize,
    );
    out.insert("case.json".to_string(), case_json.into_bytes());
    out
}

pub fn write_case(dir: &Path, case: &FixtureCase) {
    let root = dir.join(case.name);
    for (rel, bytes) in render(case) {
        let p = root.join(&rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, bytes).unwrap();
    }
}

fn finalize(name: &str, buildid: &str) -> Option<FixtureFinalize> {
    Some(FixtureFinalize {
        installdir: name.to_string(),
        name: format!("Fixture {name}"),
        buildid: buildid.to_string(),
        last_owner: "76561197960265728".to_string(),
        allow_full_ownership: true,
    })
}

#[allow(clippy::vec_init_then_push)]
pub fn all_cases() -> Vec<FixtureCase> {
    let mut cases = Vec::new();

    cases.push(FixtureCase {
        name: "zip-deflate",
        app_id: 900_001,
        mode: "install",
        install_root: "zip-deflate",
        finalize: finalize("zip-deflate", "1001"),
        depots: vec![FixtureDepot {
            depot_id: 900_002,
            gid: 7_000_000_000_000_000_001,
            wrapper: Wrapper::Zip,
            encrypt_names: false,
            files: vec![
                FixtureFile::directory("data"),
                FixtureFile::new(
                    "data/multi.bin",
                    synth("zd-multi", 3500),
                    1024,
                    Codec::PkDeflate,
                ),
                FixtureFile::new(
                    "data/stored.bin",
                    synth("zd-stored", 900),
                    1024,
                    Codec::PkStoredDd,
                ),
                FixtureFile::new("data/empty.txt", Vec::new(), 1024, Codec::PkDeflate),
                FixtureFile::new(
                    "readme.txt",
                    synth("zd-readme", 300),
                    1024,
                    Codec::PkDeflate,
                ),
            ],
        }],
    });

    cases.push(FixtureCase {
        name: "lzma",
        app_id: 900_010,
        mode: "install",
        install_root: "lzma",
        finalize: finalize("lzma", "1002"),
        depots: vec![FixtureDepot {
            depot_id: 900_011,
            gid: 7_000_000_000_000_000_002,
            wrapper: Wrapper::Zip,
            encrypt_names: false,
            files: vec![
                FixtureFile::new("a/one.dat", synth("lz-one", 2600), 1024, Codec::Vz),
                FixtureFile::new("a/two.dat", synth("lz-two", 700), 1024, Codec::Vz),
            ],
        }],
    });

    cases.push(FixtureCase {
        name: "zstd",
        app_id: 900_020,
        mode: "install",
        install_root: "zstd",
        finalize: finalize("zstd", "1003"),
        depots: vec![FixtureDepot {
            depot_id: 900_021,
            gid: 7_000_000_000_000_000_003,
            wrapper: Wrapper::Vsza,
            encrypt_names: false,
            files: vec![
                FixtureFile::new("z/one.dat", synth("zs-one", 3100), 1024, Codec::Vsza),
                FixtureFile::new("z/two.dat", synth("zs-two", 512), 1024, Codec::Vsza),
            ],
        }],
    });

    cases.push(FixtureCase {
        name: "multi-depot-collision",
        app_id: 900_030,
        mode: "install",
        install_root: "multi-depot-collision",
        finalize: finalize("multi-depot-collision", "1004"),
        depots: vec![
            FixtureDepot {
                depot_id: 900_031,
                gid: 7_000_000_000_000_000_004,
                wrapper: Wrapper::Zip,
                encrypt_names: false,
                files: vec![
                    FixtureFile::new(
                        "bin/game.exe",
                        synth("md-a-exe", 1500),
                        1024,
                        Codec::PkDeflate,
                    ),
                    FixtureFile::new("data/a.txt", synth("md-a-a", 800), 1024, Codec::PkDeflate),
                    FixtureFile::new(
                        "Data/Readme.txt",
                        synth("md-a-readme", 400),
                        1024,
                        Codec::PkDeflate,
                    ),
                ],
            },
            FixtureDepot {
                depot_id: 900_032,
                gid: 7_000_000_000_000_000_005,
                wrapper: Wrapper::Zip,
                encrypt_names: false,
                files: vec![
                    FixtureFile::new("data/a.txt", synth("md-b-a", 900), 1024, Codec::PkDeflate),
                    FixtureFile::new(
                        "data/readme.txt",
                        synth("md-b-readme", 450),
                        1024,
                        Codec::PkDeflate,
                    ),
                ],
            },
        ],
    });

    cases.push(FixtureCase {
        name: "modes-macho",
        app_id: 900_040,
        mode: "install",
        install_root: "modes-macho",
        finalize: finalize("modes-macho", "1005"),
        depots: vec![FixtureDepot {
            depot_id: 900_041,
            gid: 7_000_000_000_000_000_006,
            wrapper: Wrapper::Zip,
            encrypt_names: false,
            files: vec![
                FixtureFile::new(
                    "Contents/MacOS/thin",
                    macho_thin(2, "mm-thin", 1500),
                    1024,
                    Codec::Vz,
                ),
                FixtureFile::new(
                    "Contents/Frameworks/fat.dylib",
                    macho_fat(6, "mm-fat"),
                    1024,
                    Codec::Vz,
                ),
                FixtureFile::new(
                    "Contents/MacOS/exec-flagged",
                    synth("mm-exec", 300),
                    1024,
                    Codec::Vz,
                )
                .flags(EXECUTABLE_FLAG),
                FixtureFile::new("ro.txt", synth("mm-ro", 200), 1024, Codec::Vz)
                    .flags(READONLY_FLAG),
                FixtureFile::new("ro-exec.sh", synth("mm-roexec", 200), 1024, Codec::Vz)
                    .flags(READONLY_FLAG | EXECUTABLE_FLAG),
                FixtureFile::new("hidden.cfg", synth("mm-hidden", 200), 1024, Codec::Vz)
                    .flags(HIDDEN_FLAG),
                FixtureFile::symlink("link-to-ro", "ro.txt"),
            ],
        }],
    });

    cases.push(FixtureCase {
        name: "encrypted-names",
        app_id: 900_050,
        mode: "install",
        install_root: "encrypted-names",
        finalize: finalize("encrypted-names", "1006"),
        depots: vec![FixtureDepot {
            depot_id: 900_051,
            gid: 7_000_000_000_000_000_007,
            wrapper: Wrapper::Vza,
            encrypt_names: true,
            files: vec![
                FixtureFile::new("plain/ascii.txt", synth("en-ascii", 600), 1024, Codec::Vz),
                FixtureFile::new(
                    "pl\u{00e4}n/\u{65e5}\u{672c}\u{8a9e}.txt",
                    synth("en-utf8", 700),
                    1024,
                    Codec::Vz,
                ),
            ],
        }],
    });

    cases.push(FixtureCase {
        name: "shared-redist",
        app_id: 228_980,
        mode: "install",
        install_root: "shared-redist",
        finalize: None,
        depots: vec![FixtureDepot {
            depot_id: 228_983,
            gid: 7_000_000_000_000_000_008,
            wrapper: Wrapper::Zip,
            encrypt_names: false,
            files: vec![
                FixtureFile::new(
                    "redist/setup.dat",
                    synth("sr-setup", 1800),
                    1024,
                    Codec::PkDeflate,
                ),
                FixtureFile::new(
                    "redist/notes.txt",
                    synth("sr-notes", 250),
                    1024,
                    Codec::PkDeflate,
                ),
            ],
        }],
    });

    cases
}
