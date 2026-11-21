//! S5: cost of one atomic write (temp, write, optional sync_all, rename) for a 1 KB and a 600 KB file,
//! with and without sync_all. Writes only inside the temp dir given as the first argument.
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::Instant;

fn payload(size: usize, salt: usize) -> Vec<u8> {
    let mut v = Vec::with_capacity(size + 32);
    v.extend_from_slice(b"{\"k\":\"");
    let mut x = salt as u64 ^ 0x9E3779B97F4A7C15;
    while v.len() < size {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        v.push(b'a' + (x % 26) as u8);
    }
    v.extend_from_slice(b"\"}");
    v
}

fn atomic_write(dir: &PathBuf, name: &str, bytes: &[u8], sync: bool, n: usize) {
    let target = dir.join(name);
    let tmp = dir.join(format!("{name}.{n}.tmp"));
    let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp).unwrap();
    f.write_all(bytes).unwrap();
    if sync {
        f.sync_all().unwrap();
    }
    drop(f);
    fs::rename(&tmp, &target).unwrap();
}

fn pct(v: &mut Vec<f64>, p: f64) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    v[((v.len() as f64 - 1.0) * p).round() as usize]
}

fn main() {
    let Some(dir) = std::env::args().nth(1) else {
        eprintln!("usage: sync <dir>");
        std::process::exit(2);
    };
    let dir = PathBuf::from(dir);
    fs::create_dir_all(&dir).unwrap();
    for (label, size) in [("1 KB", 1024usize), ("600 KB", 600 * 1024)] {
        for sync in [false, true] {
            let mut ms = Vec::new();
            for i in 0..200 {
                let bytes = payload(size, i + 1);
                let t = Instant::now();
                atomic_write(&dir, "bench.json", &bytes, sync, i);
                ms.push(t.elapsed().as_secs_f64() * 1e3);
            }
            let (min, max) = (ms.iter().cloned().fold(f64::MAX, f64::min), ms.iter().cloned().fold(0.0, f64::max));
            let med = pct(&mut ms.clone(), 0.5);
            let p95 = pct(&mut ms, 0.95);
            println!(
                "{label:>6} sync_all={sync:<5} median {med:.3} ms  p95 {p95:.3} ms  min {min:.3}  max {max:.3}  (200 writes)"
            );
        }
    }
    let _ = fs::remove_file(dir.join("bench.json"));
}
