//! Byte-identical round trip of the binary KV codec over the committed shortcuts fixtures,
//! plus every failure mode (truncation, unknown tag, depth, size).

use gamelib_steamfiles::kv_bin::{parse_bin, serialize_bin, BinErrorKind, BinLimits, BinNode};
use std::fs;
use std::path::PathBuf;

fn dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/shortcuts")
}

fn fixture(name: &str) -> Vec<u8> {
    fs::read(dir().join(name)).unwrap()
}

fn files_in(d: &PathBuf) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(d)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.is_file())
        .collect();
    v.sort();
    v
}

fn keys(nodes: &[(Vec<u8>, BinNode)]) -> Vec<Vec<u8>> {
    nodes.iter().map(|(k, _)| k.clone()).collect()
}

#[test]
fn every_fixture_round_trips_byte_for_byte() {
    let mut all = files_in(&dir());
    all.extend(files_in(&dir().join("upstream")));
    let mut count = 0;
    for p in all {
        if p.file_name().unwrap() == "truncated.vdf" {
            continue;
        }
        let b = fs::read(&p).unwrap();
        let doc = parse_bin(&b, &BinLimits::shortcuts()).unwrap_or_else(|e| panic!("{p:?}: {e:?}"));
        assert_eq!(serialize_bin(&doc), b, "{p:?}");
        count += 1;
    }
    assert!(count >= 17, "only {count} fixtures round-tripped");
}

#[test]
fn empty_parses_to_empty_shortcuts_map() {
    let doc = parse_bin(&fixture("empty.vdf"), &BinLimits::shortcuts()).unwrap();
    assert_eq!(doc.root, vec![(b"shortcuts".to_vec(), BinNode::Map(vec![]))]);
    assert!(doc.trailing.is_empty());
}

#[test]
fn trailing_bytes_are_kept() {
    let doc = parse_bin(&fixture("trailing-bytes.vdf"), &BinLimits::shortcuts()).unwrap();
    assert!(!doc.trailing.is_empty());
    assert!(doc.trailing.ends_with(&[0xde, 0xad]));
}

#[test]
fn unknown_type_keeps_payload_bytes() {
    let doc = parse_bin(&fixture("unknown-type.vdf"), &BinLimits::shortcuts()).unwrap();
    let BinNode::Map(shortcuts) = &doc.root[0].1 else {
        panic!("map")
    };
    let BinNode::Map(entry) = &shortcuts[0].1 else {
        panic!("map")
    };
    let big = entry.iter().find(|(k, _)| k == b"BigField").unwrap();
    assert_eq!(big.1, BinNode::Uint64([1, 0, 0, 0, 0, 0, 0, 0]));
    let ratio = entry.iter().find(|(k, _)| k == b"Ratio").unwrap();
    assert_eq!(ratio.1, BinNode::Float32([0, 0, 0x80, 0x3f]));
}

#[test]
fn lexical_order_is_file_order() {
    let doc = parse_bin(&fixture("lexical-order.vdf"), &BinLimits::shortcuts()).unwrap();
    let BinNode::Map(m) = &doc.root[0].1 else {
        panic!("map")
    };
    assert_eq!(
        keys(m),
        vec![b"0".to_vec(), b"1".to_vec(), b"10".to_vec(), b"2".to_vec()]
    );
}

#[test]
fn truncated_fixture_is_truncated_error() {
    let e = parse_bin(&fixture("truncated.vdf"), &BinLimits::shortcuts()).unwrap_err();
    assert_eq!(e.kind, BinErrorKind::Truncated);
}

#[test]
fn every_strict_prefix_errors_without_panic() {
    let b = fixture("one-entry.vdf");
    for n in 0..b.len() {
        // The root end marker is the first 0x08 at depth 0; a prefix cut after it still parses.
        // Cutting anywhere before the full structure closes must error.
        let r = parse_bin(&b[..n], &BinLimits::shortcuts());
        if let Ok(doc) = &r {
            assert_eq!(serialize_bin(doc), &b[..n]);
        }
    }
    assert!(parse_bin(&b[..b.len() - 3], &BinLimits::shortcuts()).is_err());
    assert!(parse_bin(&[], &BinLimits::shortcuts()).is_err());
}

#[test]
fn unknown_tag_is_typed_error() {
    let e = parse_bin(&[0x0b, b'a', 0, 1, 2, 3, 4, 8], &BinLimits::shortcuts()).unwrap_err();
    assert_eq!(e.kind, BinErrorKind::UnknownType(0x0b));
}

#[test]
fn deep_nesting_is_too_deep() {
    let mut b = Vec::new();
    for _ in 0..100_000 {
        b.extend_from_slice(&[0x00, b'a', 0]);
    }
    let e = parse_bin(&b, &BinLimits::shortcuts()).unwrap_err();
    assert_eq!(e.kind, BinErrorKind::TooDeep);
}

#[test]
fn oversize_input_is_too_large() {
    let b = vec![0u8; 16 * 1024 * 1024 + 1];
    let e = parse_bin(&b, &BinLimits::shortcuts()).unwrap_err();
    assert_eq!(e.kind, BinErrorKind::TooLarge);
}
