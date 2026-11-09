//! Spike 076 stage 2: chunk-level delta apply on a CLONE of a bridge install.
//! stdin: {"mode":"plan"|"apply","keyHex":"..","old":"..raw","new":"..raw","root":"<clone>","chunkDir":".."}
//! plan  -> {"cdn":[sha hex..], ...stats}: every chunk of a changed/added file whose bytes are not
//!          found (SHA1-verified) at any old-manifest location on disk.
//! apply -> builds every changed/added file as <path>.d076tmp from verified local chunks plus
//!          decode_chunk(<chunkDir>/<sha>), checks sha_content, then commits (rename), deletes
//!          removed files, and re-verifies the whole tree against the NEW manifest.
use gamelib_depot::container::decode_chunk;
use gamelib_depot::manifest::{normalize_depot_path, parse_manifest};
use gamelib_depot::model::{DepotManifest, ManifestFile};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::unix::fs::FileExt;
use std::path::{Path, PathBuf};
use std::time::Instant;

const DIR: u32 = 64;
const LINK: u32 = 512;
fn is_file(f: &ManifestFile) -> bool { f.flags & (DIR | LINK) == 0 }
fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }
fn local(root: &Path, f: &ManifestFile) -> PathBuf { root.join(f.filename.replace('\\', "/")) }
fn sha1_file(p: &Path) -> Option<[u8; 20]> {
    let mut f = File::open(p).ok()?; let mut h = Sha1::new(); let mut b = vec![0u8; 1 << 20];
    loop { let n = f.read(&mut b).ok()?; if n == 0 { break; } h.update(&b[..n]); }
    Some(h.finalize().into())
}

struct Ctx { key: [u8; 32], old: DepotManifest, new: DepotManifest, root: PathBuf }

/// sha -> candidate (old file, offset, len)
fn old_index(c: &Ctx) -> HashMap<[u8; 20], Vec<(PathBuf, u64, u32)>> {
    let mut m: HashMap<[u8; 20], Vec<(PathBuf, u64, u32)>> = HashMap::new();
    for f in c.old.files.iter().filter(|f| is_file(f)) {
        let p = local(&c.root, f);
        for ch in &f.chunks { m.entry(ch.sha).or_default().push((p.clone(), ch.offset, ch.cb_original)); }
    }
    m
}

fn read_verified(cands: &[(PathBuf, u64, u32)], sha: &[u8; 20], fh: &mut HashMap<PathBuf, Option<File>>) -> Option<Vec<u8>> {
    for (p, off, len) in cands {
        let f = fh.entry(p.clone()).or_insert_with(|| File::open(p).ok());
        let Some(f) = f else { continue };
        let mut buf = vec![0u8; *len as usize];
        if f.read_exact_at(&mut buf, *off).is_err() { continue; }
        if Sha1::digest(&buf).as_slice() == sha { return Some(buf); }
    }
    None
}

fn work_set(c: &Ctx) -> Vec<&ManifestFile> {
    let om: HashMap<String, &ManifestFile> = c.old.files.iter().filter(|f| is_file(f)).map(|f| (normalize_depot_path(&f.filename), f)).collect();
    c.new.files.iter().filter(|f| is_file(f)).filter(|f| match om.get(&normalize_depot_path(&f.filename)) {
        Some(o) => o.sha_content != f.sha_content, None => true }).collect()
}

fn main() {
    let mut s = String::new(); std::io::stdin().read_to_string(&mut s).unwrap();
    let a: Value = serde_json::from_str(&s).unwrap();
    let kh = a["keyHex"].as_str().unwrap(); let mut key = [0u8; 32];
    for i in 0..32 { key[i] = u8::from_str_radix(&kh[i * 2..i * 2 + 2], 16).unwrap(); }
    let rd = |k: &str| parse_manifest(&fs::read(a[k].as_str().unwrap()).unwrap(), Some(&key)).unwrap();
    let c = Ctx { key, old: rd("old"), new: rd("new"), root: PathBuf::from(a["root"].as_str().unwrap()) };
    let chunk_dir = PathBuf::from(a["chunkDir"].as_str().unwrap());
    let idx = old_index(&c);
    let work = work_set(&c);
    let mut fh = HashMap::new();
    let t = Instant::now();

    if a["mode"] == "plan" {
        let mut cdn: HashMap<[u8; 20], u32> = HashMap::new();
        let (mut local_bytes, mut local_rejected) = (0u64, 0u64);
        for f in &work { for ch in &f.chunks {
            let cands = idx.get(&ch.sha).map(|v| v.as_slice()).unwrap_or(&[]);
            if read_verified(cands, &ch.sha, &mut fh).is_some() { local_bytes += ch.cb_original as u64; }
            else { if !cands.is_empty() { local_rejected += 1; } cdn.insert(ch.sha, ch.cb_compressed); }
        } }
        println!("{}", json!({"mode":"plan","workFiles":work.len(),"localReuseBytes":local_bytes,
            "localCandidatesRejectedBySha":local_rejected,"cdnChunks":cdn.len(),
            "cdnCompressedBytes":cdn.values().map(|v| *v as u64).sum::<u64>(),
            "cdn":cdn.keys().map(|k| hex(k)).collect::<Vec<_>>(),"ms":t.elapsed().as_millis() as u64}));
        return;
    }

    // apply: phase 1 build temps (old tree untouched)
    for d in c.new.files.iter().filter(|f| f.flags & DIR != 0) { let _ = fs::create_dir_all(local(&c.root, d)); }
    let (mut from_local, mut from_cdn, mut errors) = (0u64, 0u64, Vec::<String>::new());
    let mut temps = Vec::new();
    for f in &work {
        let dst = local(&c.root, f);
        if let Some(p) = dst.parent() { fs::create_dir_all(p).unwrap(); }
        let tmp = PathBuf::from(format!("{}.d076tmp", dst.display()));
        let mut out = OpenOptions::new().create(true).write(true).truncate(true).open(&tmp).unwrap();
        out.set_len(f.size).unwrap();
        for ch in &f.chunks {
            let cands = idx.get(&ch.sha).map(|v| v.as_slice()).unwrap_or(&[]);
            let data = match read_verified(cands, &ch.sha, &mut fh) {
                Some(d) => { from_local += d.len() as u64; d }
                None => match fs::read(chunk_dir.join(hex(&ch.sha))).map_err(|e| e.to_string())
                    .and_then(|raw| decode_chunk(&raw, &c.key, ch.cb_original as u64, &ch.sha).map_err(|e| format!("{e:?}"))) {
                    Ok((d, _)) => { from_cdn += d.len() as u64; d }
                    Err(e) => { errors.push(format!("{} chunk {}: {e}", f.filename, hex(&ch.sha))); continue; }
                },
            };
            out.seek(SeekFrom::Start(ch.offset)).unwrap(); out.write_all(&data).unwrap();
        }
        out.sync_all().unwrap(); drop(out);
        if sha1_file(&tmp) != Some(f.sha_content) { errors.push(format!("{}: temp sha_content mismatch", f.filename)); }
        temps.push((tmp, dst));
    }
    let build_ms = t.elapsed().as_millis() as u64;
    if !errors.is_empty() {
        for (tmp, _) in &temps { let _ = fs::remove_file(tmp); }
        println!("{}", json!({"mode":"apply","committed":false,"errors":errors.iter().take(20).collect::<Vec<_>>(),"errorCount":errors.len()}));
        std::process::exit(1);
    }
    drop(fh);
    // phase 2 commit: rename temps, delete files the new manifest dropped
    for (tmp, dst) in &temps { fs::rename(tmp, dst).unwrap(); }
    let nset: std::collections::HashSet<String> = c.new.files.iter().map(|f| normalize_depot_path(&f.filename)).collect();
    let mut removed = 0;
    for f in c.old.files.iter().filter(|f| is_file(f)) {
        if !nset.contains(&normalize_depot_path(&f.filename)) && fs::remove_file(local(&c.root, f)).is_ok() { removed += 1; }
    }
    // phase 3 verify the whole tree against the NEW manifest
    let (mut ok, mut bad) = (0u64, Vec::new());
    for f in c.new.files.iter().filter(|f| is_file(f)) {
        if sha1_file(&local(&c.root, f)) == Some(f.sha_content) { ok += 1 } else { bad.push(normalize_depot_path(&f.filename)) }
    }
    println!("{}", json!({"mode":"apply","committed":true,"workFiles":work.len(),"bytesFromLocal":from_local,"bytesFromCdn":from_cdn,
        "removed":removed,"buildMs":build_ms,"totalMs":t.elapsed().as_millis() as u64,
        "verify":{"ok":ok,"of":c.new.files.iter().filter(|f| is_file(f)).count(),"bad":bad}}));
}
