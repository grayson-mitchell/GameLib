//! S3: store-frame throughput and queue high-water. A child process (this binary, `frames --writer N`) writes N
//! newline-delimited JSON frames, each carrying a ~600 KB `valueJson` string, to its stdout. The parent reads lines,
//! parses each into serde_json::Value, pushes it on an unbounded channel, and a worker drains it. Reports frames/s
//! and the channel's high-water mark for a burst of 50 frames, for three worker costs.
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Instant;

fn value_json(target: usize) -> String {
    let mut s = String::from("[");
    let mut i = 0;
    while s.len() < target {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!(
            "{{\"app_name\":\"{i}\",\"title\":\"Game number {i} with a long enough title\",\"installed\":false,\"tags\":[\"a\",\"b\",\"c\"],\"size\":{}}}",
            i * 7919
        ));
        i += 1;
    }
    s.push(']');
    s
}

fn writer(n: usize) {
    let vj = value_json(600 * 1024);
    let out = std::io::stdout();
    let mut out = out.lock();
    for seq in 0..n {
        let frame = serde_json::json!({"kind":"store","seq":seq,"store":"steam_library","op":"set","key":"games","valueJson":vj});
        out.write_all(serde_json::to_string(&frame).unwrap().as_bytes()).unwrap();
        out.write_all(b"\n").unwrap();
    }
    out.flush().unwrap();
}

#[derive(Clone, Copy, PartialEq)]
enum Worker {
    ParseOnly,
    ParseAndWrite,
    ParseAndWriteSync,
}

fn burst(n: usize, worker: Worker, dir: &std::path::Path) -> (f64, usize, usize) {
    let exe = std::env::current_exe().unwrap();
    let t = Instant::now();
    let mut child = Command::new(exe)
        .args(["--writer", &n.to_string()])
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let rd = BufReader::with_capacity(1 << 20, child.stdout.take().unwrap());
    let (tx, rx) = mpsc::channel::<serde_json::Value>();
    let depth = Arc::new(AtomicUsize::new(0));
    let high = Arc::new(AtomicUsize::new(0));
    let (d2, dir2) = (depth.clone(), dir.to_path_buf());
    let handle = std::thread::spawn(move || {
        let mut done = 0usize;
        while let Ok(v) = rx.recv() {
            let vj = v.get("valueJson").and_then(|x| x.as_str()).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(vj).unwrap();
            if worker != Worker::ParseOnly {
                let bytes = serde_json::to_vec_pretty(&parsed).unwrap();
                let tmp = dir2.join("frames.json.tmp");
                let mut f = std::fs::File::create(&tmp).unwrap();
                f.write_all(&bytes).unwrap();
                if worker == Worker::ParseAndWriteSync {
                    f.sync_all().unwrap();
                }
                drop(f);
                std::fs::rename(&tmp, dir2.join("frames.json")).unwrap();
            }
            d2.fetch_sub(1, Ordering::SeqCst);
            done += 1;
        }
        done
    });
    let mut bytes_in = 0usize;
    for line in rd.lines() {
        let line = line.unwrap();
        bytes_in += line.len();
        let v: serde_json::Value = serde_json::from_str(&line).unwrap();
        let now = depth.fetch_add(1, Ordering::SeqCst) + 1;
        high.fetch_max(now, Ordering::SeqCst);
        tx.send(v).unwrap();
    }
    drop(tx);
    let done = handle.join().unwrap();
    child.wait().unwrap();
    assert_eq!(done, n);
    (t.elapsed().as_secs_f64(), high.load(Ordering::SeqCst), bytes_in / n)
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.get(1).map(String::as_str) == Some("--writer") {
        writer(a[2].parse().unwrap());
        return;
    }
    let dir = std::env::temp_dir().join(format!("gamelib-spike093-frames-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let n = 50;
    for (label, w) in [
        ("worker = parse valueJson only", Worker::ParseOnly),
        ("worker = parse + atomic write (no sync_all)", Worker::ParseAndWrite),
        ("worker = parse + atomic write + sync_all", Worker::ParseAndWriteSync),
    ] {
        let mut secs = Vec::new();
        let mut highs = Vec::new();
        let mut frame_len = 0;
        for _ in 0..5 {
            let (s, h, fl) = burst(n, w, &dir);
            secs.push(s);
            highs.push(h);
            frame_len = fl;
        }
        secs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        highs.sort();
        let med = secs[2];
        println!(
            "{label}: burst of {n} frames (~{} KB each): median {:.3} s = {:.1} frames/s, {:.1} MB/s; queue high-water min {} median {} max {}",
            frame_len / 1024,
            med,
            n as f64 / med,
            (n * frame_len) as f64 / med / 1e6,
            highs[0],
            highs[2],
            highs[4]
        );
    }
    let _ = std::fs::remove_dir_all(&dir);
}
