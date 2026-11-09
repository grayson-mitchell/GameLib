//! Spike 076 stage 1: diff an installed depot manifest against the current public one, and audit
//! the local install against the old manifest. Parses with production's `gamelib_depot` parser.
//! stdin: {"keyHex":"..","old":"<raw cdn manifest path>","new":"..","installDir":".."}
//! stdout: one JSON object. The key is never printed.
use gamelib_depot::manifest::{normalize_depot_path, parse_manifest};
use gamelib_depot::model::{DepotManifest, ManifestFile};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};

const DIR: u32 = 64;
const LINK: u32 = 512;
fn is_file(f: &ManifestFile) -> bool { f.flags & (DIR | LINK) == 0 }
fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }

fn load(path: &str, key: &[u8; 32]) -> DepotManifest {
    let raw = std::fs::read(path).expect("read manifest");
    parse_manifest(&raw, Some(key)).expect("parse manifest")
}

fn sha1_file(p: &Path) -> Option<[u8; 20]> {
    let mut f = std::fs::File::open(p).ok()?;
    let mut h = Sha1::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 { break; }
        h.update(&buf[..n]);
    }
    Some(h.finalize().into())
}

fn walk(root: &Path, base: &Path, out: &mut Vec<(String, u64)>) {
    if let Ok(rd) = std::fs::read_dir(root) {
        for e in rd.flatten() {
            let p = e.path();
            let md = match std::fs::symlink_metadata(&p) { Ok(m) => m, Err(_) => continue };
            if md.is_dir() { walk(&p, base, out); }
            else {
                let rel = p.strip_prefix(base).unwrap().to_string_lossy().to_string();
                out.push((normalize_depot_path(&rel), md.len()));
            }
        }
    }
}

fn main() {
    let mut s = String::new();
    std::io::stdin().read_to_string(&mut s).unwrap();
    let a: Value = serde_json::from_str(&s).unwrap();
    let kh = a["keyHex"].as_str().unwrap();
    let mut key = [0u8; 32];
    for i in 0..32 { key[i] = u8::from_str_radix(&kh[i * 2..i * 2 + 2], 16).unwrap(); }
    let old = load(a["old"].as_str().unwrap(), &key);
    let new = load(a["new"].as_str().unwrap(), &key);
    let install = PathBuf::from(a["installDir"].as_str().unwrap());

    let om: HashMap<String, &ManifestFile> = old.files.iter().filter(|f| is_file(f)).map(|f| (normalize_depot_path(&f.filename), f)).collect();
    let nm: HashMap<String, &ManifestFile> = new.files.iter().filter(|f| is_file(f)).map(|f| (normalize_depot_path(&f.filename), f)).collect();
    // chunk sha -> which old paths hold it
    let mut old_chunks: HashMap<[u8; 20], Vec<&str>> = HashMap::new();
    for (p, f) in &om { for c in &f.chunks { old_chunks.entry(c.sha).or_default().push(p.as_str()); } }

    let (mut unchanged, mut changed, mut added) = (0u64, Vec::new(), Vec::new());
    let removed: Vec<&String> = om.keys().filter(|p| !nm.contains_key(*p)).collect();
    let mut full_uniq: HashMap<[u8; 20], u32> = HashMap::new();
    let mut file_level: HashMap<[u8; 20], u32> = HashMap::new();
    let mut chunk_level: HashMap<[u8; 20], u32> = HashMap::new();
    let (mut reuse_same, mut reuse_cross, mut reuse_moved) = (0u64, 0u64, 0u64);
    let mut changed_bytes = 0u64;
    for (p, f) in &nm {
        for c in &f.chunks { full_uniq.insert(c.sha, c.cb_compressed); }
        match om.get(p) {
            Some(o) if o.sha_content == f.sha_content => { unchanged += 1; continue; }
            Some(_) => changed.push(p.clone()),
            None => added.push(p.clone()),
        }
        changed_bytes += f.size;
        let old_same: HashMap<[u8; 20], u64> = om.get(p).map(|o| o.chunks.iter().map(|c| (c.sha, c.offset)).collect()).unwrap_or_default();
        for c in &f.chunks {
            file_level.insert(c.sha, c.cb_compressed);
            match old_chunks.get(&c.sha) {
                None => { chunk_level.insert(c.sha, c.cb_compressed); }
                Some(_) => match old_same.get(&c.sha) {
                    Some(off) if *off == c.offset => reuse_same += c.cb_original as u64,
                    Some(_) => reuse_moved += c.cb_original as u64,
                    None => reuse_cross += c.cb_original as u64,
                },
            }
        }
    }
    let sum = |m: &HashMap<[u8; 20], u32>| m.values().map(|v| *v as u64).sum::<u64>();

    // Local audit against the OLD manifest.
    let (mut ok, mut missing) = (0u64, Vec::new());
    let mut mismatch = Vec::new();
    for (p, f) in &om {
        let lp = install.join(p.replace('\\', "/"));
        // installs keep the manifest's case; fall back to the as-shipped name
        let lp = if lp.exists() { lp } else { install.join(f.filename.replace('\\', "/")) };
        match std::fs::metadata(&lp) {
            Err(_) => missing.push(p.clone()),
            Ok(_) => match sha1_file(&lp) {
                Some(h) if h == f.sha_content => ok += 1,
                _ => mismatch.push(p.clone()),
            },
        }
    }
    let mut disk = Vec::new();
    walk(&install, &install, &mut disk);
    let unowned: Vec<&(String, u64)> = disk.iter().filter(|(p, _)| !om.contains_key(p) && !om.keys().any(|k| k == p)).collect();
    // removed files that the NEW manifest no longer owns but which differ locally (user-modified?)
    let removed_set: HashSet<String> = removed.iter().map(|s| (*s).clone()).collect();
    let mm_removed: Vec<String> = mismatch.iter().filter(|p| removed_set.contains(*p)).cloned().collect();
    let mm_changed: Vec<String> = mismatch.iter().filter(|p| changed.contains(p)).cloned().collect();

    mismatch.sort(); missing.sort(); changed.sort(); added.sort();
    let out = json!({
        "oldGid": old.gid, "newGid": new.gid,
        "files": {"old": om.len(), "new": nm.len(), "unchanged": unchanged, "changed": changed.len(), "added": added.len(), "removed": removed.len()},
        "bytes": {
            "newTotalUncompressed": new.total_uncompressed,
            "changedOrAddedUncompressed": changed_bytes,
            "fullDownloadCompressed": sum(&full_uniq),
            "fileLevelDeltaCompressed": sum(&file_level),
            "chunkLevelDeltaCompressed": sum(&chunk_level),
            "reuseSameOffset": reuse_same, "reuseMovedInFile": reuse_moved, "reuseCrossFile": reuse_cross
        },
        "local": {"oldFilesOk": ok, "mismatch": mismatch, "missing": missing.len(), "missingSample": missing.iter().take(5).collect::<Vec<_>>(),
                  "mismatchInChangedFiles": mm_changed, "mismatchInRemovedFiles": mm_removed,
                  "unownedCount": unowned.len(), "unownedBytes": unowned.iter().map(|(_, s)| *s).sum::<u64>(),
                  "unownedSample": unowned.iter().take(12).map(|(p, s)| format!("{p} ({s})")).collect::<Vec<_>>()},
        "changedSample": changed.iter().take(15).collect::<Vec<_>>(),
        "addedSample": added.iter().take(10).collect::<Vec<_>>(),
        "removedSample": removed.iter().take(10).collect::<Vec<_>>(),
        "hex_check": hex(&new.files.first().map(|f| f.sha_content).unwrap_or([0; 20]))[..8].to_string()
    });
    println!("{}", out);
}
