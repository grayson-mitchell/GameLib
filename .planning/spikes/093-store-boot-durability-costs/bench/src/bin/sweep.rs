//! S4: time read + ordered parse + one serialization of every store file, config.json and GamesConfig/*.json
//! in a profile. Read-only. Prints counts, bytes and timings only; never a name or a value.
use indexmap::IndexMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

const STORE_DIRS: &[&str] = &[
    "store", "store_cache", "gog_store", "humble_store", "legendary_store", "nile_store", "steam_store",
];

fn is_live_json(p: &Path) -> bool {
    let n = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
    n.ends_with(".json") && !n.contains(".bak.") && !n.contains(".from-phase")
}

fn collect(profile: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut stores = Vec::new();
    for d in STORE_DIRS {
        if let Ok(rd) = fs::read_dir(profile.join(d)) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_file() && is_live_json(&p) {
                    stores.push(p);
                }
            }
        }
    }
    let cfg = profile.join("config.json");
    if cfg.is_file() {
        stores.push(cfg);
    }
    let mut games = Vec::new();
    if let Ok(rd) = fs::read_dir(profile.join("GamesConfig")) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_file() && is_live_json(&p) {
                games.push(p);
            }
        }
    }
    (stores, games)
}

fn bytes_of(v: &[PathBuf]) -> u64 {
    v.iter().filter_map(|p| fs::metadata(p).ok()).map(|m| m.len()).sum()
}

/// read + parse (ordered) + serialize once. Returns (read_ms, parse_ms, ser_ms, parsed_ok).
fn one(p: &Path) -> (f64, f64, f64, bool) {
    let t0 = Instant::now();
    let Ok(bytes) = fs::read(p) else { return (0.0, 0.0, 0.0, false) };
    let t1 = Instant::now();
    let parsed: Result<IndexMap<String, serde_json::Value>, _> = serde_json::from_slice(&bytes);
    let t2 = Instant::now();
    let ok = parsed.is_ok();
    if let Ok(v) = &parsed {
        let _ = serde_json::to_vec(v);
    }
    let t3 = Instant::now();
    (
        (t1 - t0).as_secs_f64() * 1e3,
        (t2 - t1).as_secs_f64() * 1e3,
        (t3 - t2).as_secs_f64() * 1e3,
        ok,
    )
}

fn stats(mut v: Vec<f64>) -> (f64, f64, f64) {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (v[0], v[v.len() / 2], v[v.len() - 1])
}

fn main() {
    let Some(dir) = std::env::args().nth(1) else {
        eprintln!("usage: sweep <profileDir>");
        std::process::exit(2);
    };
    let profile = PathBuf::from(dir);
    let (stores, games) = collect(&profile);
    println!("store-kind files: {} ({} bytes)", stores.len(), bytes_of(&stores));
    println!("GamesConfig files: {} ({} bytes)", games.len(), bytes_of(&games));
    let all: Vec<&PathBuf> = stores.iter().chain(games.iter()).collect();
    println!("total files: {} ({} bytes)", all.len(), bytes_of(&stores) + bytes_of(&games));
    let mut totals = Vec::new();
    let (mut r, mut pa, mut se) = (Vec::new(), Vec::new(), Vec::new());
    let mut failed = 0usize;
    for run in 0..5 {
        let t = Instant::now();
        let (mut rs, mut ps, mut ss) = (0.0, 0.0, 0.0);
        failed = 0;
        for p in &all {
            let (a, b, c, ok) = one(p);
            rs += a;
            ps += b;
            ss += c;
            if !ok {
                failed += 1;
            }
        }
        let ms = t.elapsed().as_secs_f64() * 1e3;
        println!("run {run}: total {ms:.2} ms (read {rs:.2}, parse {ps:.2}, serialize {ss:.2})");
        totals.push(ms);
        r.push(rs);
        pa.push(ps);
        se.push(ss);
    }
    let (mn, md, mx) = stats(totals);
    println!("sweep total ms  min {mn:.2}  median {md:.2}  max {mx:.2}");
    println!("  read median {:.2}  parse median {:.2}  serialize median {:.2}", stats(r).1, stats(pa).1, stats(se).1);
    println!("files that did not parse as a JSON object: {failed}");
}
