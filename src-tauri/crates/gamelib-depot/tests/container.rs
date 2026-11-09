//! Integration tests for the byte-level transforms. Ported vectors are named after the TS
//! `it(...)` titles in `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts`.

#[allow(dead_code)]
#[path = "support/encode.rs"]
mod encode;

use gamelib_depot::container::*;
use sha1::{Digest, Sha1};

const KEY: [u8; 32] = [7u8; 32];
const IV: [u8; 16] = [3u8; 16];

fn sha(data: &[u8]) -> [u8; 20] {
    Sha1::digest(data).into()
}

fn sample(n: usize) -> Vec<u8> {
    (0..n).map(|i| ((i * 31 + i / 7) % 251) as u8).collect()
}

fn enc(container: &[u8]) -> Vec<u8> {
    encode::steam_encrypt(container, &KEY, &IV)
}

#[test]
fn steam_decrypt_roundtrips_lengths() {
    for n in [0usize, 1, 15, 16, 17, 1 << 20] {
        let p = sample(n);
        assert_eq!(steam_decrypt(&enc(&p), &KEY).unwrap(), p, "len {n}");
    }
}

#[test]
fn invalid_padding_returns_unstripped_plaintext() {
    // 16 data bytes + a block whose last byte (5) is not matched by its predecessors.
    let mut padded = sample(16);
    padded.extend_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 5]);
    let ct = encode::steam_encrypt_raw(&padded, &KEY, &IV);
    assert_eq!(steam_decrypt(&ct, &KEY).unwrap(), padded);
    // Pad byte out of range (0 and 17) is also returned unstripped.
    for last in [0u8, 17] {
        let mut p = sample(31);
        p.push(last);
        let ct = encode::steam_encrypt_raw(&p, &KEY, &IV);
        assert_eq!(steam_decrypt(&ct, &KEY).unwrap(), p);
    }
}

#[test]
fn short_ciphertext_rejected() {
    assert_eq!(
        steam_decrypt(&[0u8; 31], &KEY).unwrap_err().code,
        "decode_failed"
    );
    assert_eq!(
        steam_decrypt(&[0u8; 33], &KEY).unwrap_err().code,
        "decode_failed"
    );
}

#[test]
fn decrypt_filename_cuts_at_nul() {
    let mut p = "dir\\file\u{e9}.txt".as_bytes().to_vec();
    p.push(0);
    p.extend_from_slice(b"garbage");
    let ct = enc(&p);
    let b64 = b64_encode(&ct);
    assert_eq!(decrypt_filename(&b64, &KEY).unwrap(), "dir\\file\u{e9}.txt");
    // No NUL: whole plaintext.
    assert_eq!(
        decrypt_filename(&b64_encode(&enc(b"abc")), &KEY).unwrap(),
        "abc"
    );
    // Invalid UTF-8 is replaced, not an error.
    let ct = enc(&[b'a', 0xff, b'b', 0]);
    assert_eq!(
        decrypt_filename(&b64_encode(&ct), &KEY).unwrap(),
        "a\u{fffd}b"
    );
}

fn b64_encode(d: &[u8]) -> String {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::new();
    for c in d.chunks(3) {
        let n = (u32::from(c[0]) << 16)
            | (u32::from(*c.get(1).unwrap_or(&0)) << 8)
            | u32::from(*c.get(2).unwrap_or(&0));
        s.push(A[(n >> 18) as usize & 63] as char);
        s.push(A[(n >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 {
            A[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        s.push(if c.len() > 2 {
            A[n as usize & 63] as char
        } else {
            '='
        });
    }
    s
}

fn roundtrip(container: Vec<u8>, data: &[u8], kind: ContainerKind) {
    let (out, k) = decode_chunk(&enc(&container), &KEY, data.len() as u64, &sha(data)).unwrap();
    assert_eq!(out, data);
    assert_eq!(k, kind);
}

#[test]
fn vz_roundtrip() {
    for n in [1usize, 100, 70_000] {
        let d = sample(n);
        roundtrip(encode::vz_wrap(&d), &d, ContainerKind::Vz);
    }
}

#[test]
fn vsza_roundtrip() {
    for n in [1usize, 100, 70_000] {
        let d = sample(n);
        roundtrip(encode::vsza_wrap(&d), &d, ContainerKind::Vsza);
    }
}

#[test]
fn pk_stored_dd_roundtrip() {
    // Trailing central directory must not be absorbed into the payload.
    for n in [1usize, 128, 5000] {
        let d = sample(n);
        roundtrip(encode::pk_stored_dd(&d), &d, ContainerKind::Pk);
    }
}

#[test]
fn pk_deflate_roundtrip() {
    for n in [1usize, 128, 70_000] {
        let d = sample(n);
        roundtrip(encode::pk_deflate(&d), &d, ContainerKind::Pk);
    }
}

#[test]
fn vsza_footer_size_mismatch_rejected_before_alloc() {
    let d = sample(1000);
    // Footer claims ~4 GiB; cb_original is 1000. Must be rejected by the header comparison.
    let c = encode::vsza_wrap_with_footer_size(&d, u32::MAX);
    let e = decode_chunk(&enc(&c), &KEY, 1000, &sha(&d)).unwrap_err();
    assert_eq!(e.code, "size_mismatch");
    assert!(e.detail.contains("refusing to allocate"), "{}", e.detail);
}

#[test]
fn bad_footer_magic_codes() {
    let d = sample(100);
    let mut c = encode::vsza_wrap(&d);
    let n = c.len();
    c[n - 1] = b'x';
    let e = decode_chunk(&enc(&c), &KEY, 100, &sha(&d)).unwrap_err();
    assert_eq!(e.code, "bad_footer_magic");
    let mut c = encode::vz_wrap(&d);
    let n = c.len();
    c[n - 1] = b'x';
    let e = decode_chunk(&enc(&c), &KEY, 100, &sha(&d)).unwrap_err();
    assert_eq!(e.code, "bad_footer_magic");
}

#[test]
fn unknown_container_and_preview_limit() {
    let e = decode_chunk(
        &enc(b"ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"),
        &KEY,
        10,
        &[0; 20],
    )
    .unwrap_err();
    assert_eq!(e.code, "unknown_container");
    // Preview is at most 16 bytes = 32 hex chars.
    assert!(e.detail.ends_with(&"5a".repeat(16)), "{}", e.detail);
}

#[test]
fn size_checked_before_sha1() {
    let d = sample(500);
    let c = encode::vsza_wrap(&d);
    // Wrong size: size_mismatch even though sha is also wrong.
    let e = decode_chunk(&enc(&c), &KEY, 501, &[0; 20]).unwrap_err();
    assert_eq!(e.code, "size_mismatch");
    // Right size, wrong sha.
    let e = decode_chunk(&enc(&c), &KEY, 500, &[0; 20]).unwrap_err();
    assert_eq!(e.code, "sha1_mismatch");
}

#[test]
fn stored_length_exceeding_body_is_size_mismatch() {
    let d = sample(100);
    let c = encode::pk_stored_dd(&d);
    let e = decode_chunk(&enc(&c), &KEY, 1_000_000, &sha(&d)).unwrap_err();
    assert_eq!(e.code, "size_mismatch");
}

#[test]
fn truncated_containers_never_panic() {
    let d = sample(300);
    for c in [
        encode::vz_wrap(&d),
        encode::vsza_wrap(&d),
        encode::pk_stored_dd(&d),
        encode::pk_deflate(&d),
    ] {
        for cut in 0..c.len() {
            let _ = decode_chunk(&enc(&c[..cut]), &KEY, 300, &sha(&d));
        }
    }
}
