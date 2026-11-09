//! Spike 067b, Rust side: decrypt + decompress the same re-encrypted corpus the
//! Node bench wrote (state/enc), single-threaded, CPU-seconds per GiB of output.
//! Every output is checked against the chunk's SHA1.
use aes::cipher::{BlockDecrypt, BlockDecryptMut, KeyInit, KeyIvInit, generic_array::GenericArray};
use sha1::{Digest, Sha1};
use std::io::Read;
use std::path::PathBuf;
use std::time::Instant;

type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

struct Chunk { kind: String, sha: String, cb: usize, enc: Vec<u8> }

fn steam_decrypt(enc: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let cipher = aes::Aes256::new(GenericArray::from_slice(key));
    let mut iv = GenericArray::clone_from_slice(&enc[..16]);
    cipher.decrypt_block(&mut iv);
    let mut buf = enc[16..].to_vec();
    Aes256CbcDec::new(GenericArray::from_slice(key), &iv)
        .decrypt_blocks_mut(unsafe {
            std::slice::from_raw_parts_mut(buf.as_mut_ptr() as *mut GenericArray<u8, aes::cipher::consts::U16>, buf.len() / 16)
        });
    let pad = *buf.last().unwrap() as usize;
    if (1..=16).contains(&pad) && buf[buf.len() - pad..].iter().all(|&b| b as usize == pad) {
        buf.truncate(buf.len() - pad);
    }
    buf
}

#[derive(Clone, Copy, PartialEq)]
enum Lzma { Xz2, LzmaRs }

fn decompress(dec: &[u8], cb: usize, lz: Lzma) -> Vec<u8> {
    if &dec[..2] == b"VZ" {
        assert_eq!(&dec[dec.len() - 2..], b"zv", "VZ footer");
        let props = &dec[7..12];
        let payload = &dec[12..dec.len() - 10];
        let out_size = u32::from_le_bytes(dec[dec.len() - 6..dec.len() - 2].try_into().unwrap()) as u64;
        let mut stream = Vec::with_capacity(13 + payload.len());
        stream.extend_from_slice(props);
        stream.extend_from_slice(&out_size.to_le_bytes());
        stream.extend_from_slice(payload);
        let mut out = Vec::with_capacity(out_size as usize);
        match lz {
            Lzma::Xz2 => {
                let s = xz2::stream::Stream::new_lzma_decoder(u64::MAX).unwrap();
                xz2::read::XzDecoder::new_stream(&stream[..], s).read_to_end(&mut out).unwrap();
            }
            Lzma::LzmaRs => {
                lzma_rs::lzma_decompress(&mut &stream[..], &mut out).unwrap();
            }
        }
        out
    } else if &dec[..2] == b"PK" {
        let u16at = |o: usize| u16::from_le_bytes([dec[o], dec[o + 1]]) as usize;
        let u32at = |o: usize| u32::from_le_bytes(dec[o..o + 4].try_into().unwrap()) as usize;
        let body = &dec[30 + u16at(26) + u16at(28)..];
        match u16at(8) {
            0 => {
                let len = if u16at(6) & 0x08 != 0 { cb } else { u32at(18) };
                body[..len].to_vec()
            }
            8 => {
                let mut out = Vec::with_capacity(cb);
                flate2::read::DeflateDecoder::new(body).read_to_end(&mut out).unwrap();
                out
            }
            m => panic!("PK method {m}"),
        }
    } else {
        panic!("unknown container")
    }
}

fn cpu_seconds() -> f64 {
    // RUSAGE_SELF covers every thread of this process.
    let mut ru: libc::rusage = unsafe { std::mem::zeroed() };
    unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut ru) };
    let tv = |t: libc::timeval| t.tv_sec as f64 + t.tv_usec as f64 / 1e6;
    tv(ru.ru_utime) + tv(ru.ru_stime)
}

fn bench(label: &str, chunks: &[&Chunk], key: &[u8; 32], lz: Lzma, decrypt_only: bool, passes: usize) -> serde_json::Value {
    let (mut out_bytes, mut bad) = (0usize, 0usize);
    let (c0, t0) = (cpu_seconds(), Instant::now());
    for p in 0..passes {
        for c in chunks {
            let dec = steam_decrypt(&c.enc, key);
            if decrypt_only { out_bytes += dec.len(); continue; }
            let out = decompress(&dec, c.cb, lz);
            out_bytes += out.len();
            if p == 0 && hex::encode(Sha1::digest(&out)) != c.sha { bad += 1; }
        }
    }
    let (cpu, wall) = (cpu_seconds() - c0, t0.elapsed().as_secs_f64());
    let gib = out_bytes as f64 / (1u64 << 30) as f64;
    let mib = out_bytes as f64 / (1u64 << 20) as f64;
    let row = serde_json::json!({
        "label": label, "stage": if decrypt_only {"decrypt"} else {"full"}, "chunks": chunks.len(), "passes": passes,
        "outMiB": mib.round(), "wallS": (wall * 100.0).round() / 100.0, "cpuS": (cpu * 100.0).round() / 100.0,
        "MiBperS": (mib / wall * 10.0).round() / 10.0, "cpuSecPerGiB": (cpu / gib * 100.0).round() / 100.0, "sha1Mismatches": bad
    });
    println!("{row}");
    row
}

fn main() {
    let spike = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let enc_dir = spike.join("state/enc");
    let passes: usize = std::env::var("PASSES").ok().and_then(|v| v.parse().ok()).unwrap_or(3);
    let key: [u8; 32] = std::fs::read(enc_dir.join("throwaway.key")).unwrap().try_into().unwrap();
    let mut names: Vec<_> = std::fs::read_dir(&enc_dir).unwrap().filter_map(|e| {
        let n = e.unwrap().file_name().into_string().unwrap();
        n.strip_suffix(".json").map(str::to_string)
    }).collect();
    names.sort();
    let chunks: Vec<Chunk> = names.iter().map(|n| {
        let m: serde_json::Value = serde_json::from_slice(&std::fs::read(enc_dir.join(format!("{n}.json"))).unwrap()).unwrap();
        Chunk { kind: m["kind"].as_str().unwrap().into(), sha: m["expectedSha"].as_str().unwrap().into(),
                cb: m["cbOriginal"].as_u64().unwrap() as usize, enc: std::fs::read(enc_dir.join(format!("{n}.enc"))).unwrap() }
    }).collect();
    let all: Vec<&Chunk> = chunks.iter().collect();
    let kind = |k: &str| chunks.iter().filter(|c| c.kind == k).collect::<Vec<_>>();
    let rows = vec![
        bench("aes only (all)", &all, &key, Lzma::Xz2, true, passes),
        bench("zip  (flate2 / zlib-rs)", &kind("zip"), &key, Lzma::Xz2, false, passes),
        bench("lzma (xz2 = C liblzma)", &kind("lzma"), &key, Lzma::Xz2, false, passes),
        bench("lzma (lzma-rs, pure Rust)", &kind("lzma"), &key, Lzma::LzmaRs, false, passes),
        bench("all  (xz2 + flate2)", &all, &key, Lzma::Xz2, false, passes),
    ];
    std::fs::write(spike.join("results-rust.json"), serde_json::to_string_pretty(&serde_json::json!({"runtime": "rust release", "rows": rows})).unwrap()).unwrap();
}
