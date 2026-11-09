//! Ports of reconcile.test.ts. TS titles are quoted in comments.

use gamelib_depot::model::{ChunkRef, ManifestFile};
use gamelib_depot::reconcile::*;
use sha1::{Digest, Sha1};
use std::fs;
use std::path::Path;
use tokio_util::sync::CancellationToken;

fn sha(b: &[u8]) -> [u8; 20] {
    Sha1::digest(b).into()
}

fn file(name: &str, content: &[u8]) -> ManifestFile {
    ManifestFile {
        filename: name.into(),
        size: content.len() as u64,
        flags: 0,
        sha_content: sha(content),
        chunks: vec![ChunkRef {
            sha: [0; 20],
            offset: 0,
            cb_original: content.len() as u32,
            cb_compressed: content.len() as u32,
            crc: 0,
        }],
        linktarget: None,
    }
}

fn put(dir: &Path, rel: &str, content: &[u8]) {
    let p = dir.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, content).unwrap();
}

async fn rec(dir: &Path, files: &[ManifestFile]) -> ReconcileResult {
    let refs: Vec<&ManifestFile> = files.iter().collect();
    reconcile_partial_state(dir, &refs, &CancellationToken::new(), 2)
        .await
        .unwrap()
}

fn verify(dir: &Path, files: &[ManifestFile], ci: bool) -> StructuralVerifyResult {
    let refs: Vec<&ManifestFile> = files.iter().collect();
    verify_structural_integrity(dir, &refs, ci).unwrap()
}

// "a present sha1-matching file is EXCLUDED from jobs and counted verified"
#[tokio::test]
async fn present_matching_is_skipped() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "a.bin", b"hello");
    let r = rec(d.path(), &[file("a.bin", b"hello")]).await;
    assert_eq!(r.skipped, vec![0]);
    assert!(r.queued.is_empty());
    assert!(r.all_files_verified());
}

// "a missing file is INCLUDED as a job, not verified"
#[tokio::test]
async fn missing_is_queued() {
    let d = tempfile::tempdir().unwrap();
    let r = rec(d.path(), &[file("a.bin", b"hello")]).await;
    assert_eq!(r.queued, vec![0]);
    assert_eq!(r.missing, vec!["a.bin".to_string()]);
    assert!(!r.all_files_verified());
}

// "a present file with WRONG SIZE is included as a job without needing sha1 (decisive)"
#[tokio::test]
async fn wrong_size_is_queued() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "a.bin", b"hi");
    let r = rec(d.path(), &[file("a.bin", b"hello")]).await;
    assert_eq!(r.queued, vec![0]);
}

// "T-23-07 (Pitfall 1): a present, size-correct, CONTENT-CORRUPTED file is re-downloaded"
#[tokio::test]
async fn right_size_wrong_content_is_queued() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "a.bin", b"hellX");
    let r = rec(d.path(), &[file("a.bin", b"hello")]).await;
    assert_eq!(r.queued, vec![0]);
    assert!(r.skipped.is_empty());
}

// "T-23-08: a path-traversal filename throws PathTraversalError, never silently skipped"
#[tokio::test]
async fn traversal_is_an_error() {
    let d = tempfile::tempdir().unwrap();
    let files = [file("..\\..\\evil.bin", b"x")];
    let refs: Vec<&ManifestFile> = files.iter().collect();
    let e = reconcile_partial_state(d.path(), &refs, &CancellationToken::new(), 2)
        .await
        .unwrap_err();
    assert!(matches!(e, ReconcileError::Traversal(_)));
}

// "a mix of verified/missing/mismatched files across two depots reduces jobs to only the
// missing+mismatched set"
#[tokio::test]
async fn mix_reduces_to_missing_and_mismatched() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "ok1", b"one");
    put(d.path(), "bad", b"tw0");
    put(d.path(), "ok2", b"three");
    let files = [
        file("ok1", b"one"),
        file("bad", b"two"),
        file("gone", b"zzz"),
        file("ok2", b"three"),
    ];
    let r = rec(d.path(), &files).await;
    assert_eq!(r.skipped, vec![0, 3]);
    assert_eq!(r.queued, vec![1, 2]);
}

// "quick-260821-nyh: skippedBytes is 0 when nothing on disk is reconciled (fresh install)"
#[tokio::test]
async fn bytes_verified_zero_on_fresh() {
    let d = tempfile::tempdir().unwrap();
    let r = rec(d.path(), &[file("a", b"hello"), file("b", b"hi")]).await;
    assert_eq!(r.bytes_verified, 0);
}

// "quick-260821-nyh: skippedBytes sums exactly the verified entries' sizes"
#[tokio::test]
async fn bytes_verified_sums_skipped_only() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "a", b"hello");
    put(d.path(), "b", b"wrong");
    let r = rec(
        d.path(),
        &[file("a", b"hello"), file("b", b"right"), file("c", b"zz")],
    )
    .await;
    assert_eq!(r.bytes_verified, 5);
}

// "a real, already-present Directory manifest entry is reconciled; a missing one is a job"
#[tokio::test]
async fn directory_entries() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir(d.path().join("present")).unwrap();
    let mut a = file("present", b"");
    a.flags = 64;
    a.chunks.clear();
    let mut b = file("absent", b"");
    b.flags = 64;
    b.chunks.clear();
    let r = rec(d.path(), &[a, b]).await;
    assert_eq!(r.skipped, vec![0]);
    assert_eq!(r.queued, vec![1]);
}

// "a correctly-targeted existing Symlink manifest entry is reconciled; wrong-target is a job"
#[cfg(unix)]
#[tokio::test]
async fn symlink_entries() {
    let d = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink("target", d.path().join("good")).unwrap();
    std::os::unix::fs::symlink("other", d.path().join("bad")).unwrap();
    let mk = |n: &str| {
        let mut f = file(n, b"");
        f.flags = 512;
        f.chunks.clear();
        f.linktarget = Some("target".into());
        f
    };
    let r = rec(d.path(), &[mk("good"), mk("bad")]).await;
    assert_eq!(r.skipped, vec![0]);
    assert_eq!(r.queued, vec![1]);
}

// "a zero-size regular file present on disk is reconciled without a sha1 check"
#[tokio::test]
async fn zero_size_file_skipped_without_sha() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "empty", b"");
    let mut f = file("empty", b"");
    f.sha_content = [9; 20]; // meaningless digest must not cause a false mismatch
    let r = rec(d.path(), &[f]).await;
    assert_eq!(r.skipped, vec![0]);
}

#[tokio::test]
async fn stale_directory_at_file_path_is_reported() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir(d.path().join("a.bin")).unwrap();
    let r = rec(d.path(), &[file("a.bin", b"hello")]).await;
    assert_eq!(r.queued, vec![0]);
    assert_eq!(r.stale_dirs, vec![0]);
}

#[tokio::test]
async fn cancel_returns_incomplete() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "a", b"hello");
    let files = [file("a", b"hello"), file("b", b"x")];
    let refs: Vec<&ManifestFile> = files.iter().collect();
    let c = CancellationToken::new();
    c.cancel();
    let r = reconcile_partial_state(d.path(), &refs, &c, 2)
        .await
        .unwrap();
    assert!(!r.complete);
    assert!(!r.all_files_verified());
    assert!(r.skipped.is_empty() && r.queued.is_empty());
}

#[test]
fn sha1_file_streams_multi_buffer_file() {
    let d = tempfile::tempdir().unwrap();
    let big = vec![7u8; 2 * 1024 * 1024 + 13];
    put(d.path(), "big", &big);
    assert_eq!(sha1_file(&d.path().join("big")).unwrap(), sha(&big));
}

// ---- verifyStructuralIntegrity (quick 260908-nbd) ----

// "a complete tree ... is ok with zero mismatches"
#[test]
fn complete_tree_ok() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "a/x.bin", b"hello");
    put(d.path(), "y", b"hi");
    let r = verify(
        d.path(),
        &[file("a\\x.bin", b"hello"), file("y", b"hi")],
        false,
    );
    assert!(r.ok);
    assert_eq!(r.checked, 2);
    assert_eq!(r.mismatch_count, 0);
}

fn claim(content: &[u8]) -> ManifestFile {
    file("XEW\\XComGame\\Config\\DefaultGame.ini", content)
}

const A: &[u8] = b"depot-200522-claim";
const B: &[u8] = b"depot-225341-claim-is-longer";

fn put_claim(d: &Path, content: &[u8]) {
    put(d, "XEW/XComGame/Config/DefaultGame.ini", content);
}

// "passes when the file on disk is the first claim" / "... second claim"
#[test]
fn collision_passes_for_either_claim() {
    for written in [A, B] {
        let d = tempfile::tempdir().unwrap();
        put_claim(d.path(), written);
        let r = verify(d.path(), &[claim(A), claim(B)], false);
        assert!(r.ok);
    }
}

// "still fails when the file on disk matches neither claim by size"
#[test]
fn collision_fails_when_size_matches_none() {
    let d = tempfile::tempdir().unwrap();
    put_claim(d.path(), b"trunc");
    assert!(!verify(d.path(), &[claim(A), claim(B)], false).ok);
}

// "still fails when the size matches a claim but the content matches none"
#[test]
fn collision_fails_when_content_matches_none() {
    let d = tempfile::tempdir().unwrap();
    put_claim(d.path(), &vec![b'x'; A.len()]);
    assert!(!verify(d.path(), &[claim(A), claim(B)], false).ok);
}

fn case_folds(d: &Path) -> bool {
    fs::write(d.join("CaseProbe"), "").unwrap();
    d.join("caseprobe").exists()
}

fn case_files() -> [ManifestFile; 2] {
    let mut a = file("Data\\Level2", b"upper-case-spelling-claim");
    a.filename = "Data\\Level2".into();
    let b = file("data\\level2", b"lower-claim");
    [a, b]
}

// "passes via the sha1 fallback when the plan says the volume folds case"
#[test]
fn case_collision_passes_when_flag_set() {
    let d = tempfile::tempdir().unwrap();
    if !case_folds(d.path()) {
        return; // a case-sensitive fs cannot host a case-only collision
    }
    put(d.path(), "Data/Level2", b"lower-claim");
    assert!(verify(d.path(), &case_files(), true).ok);
}

// "fails when caseInsensitivePaths is unset (proves the flag drives it)"
#[test]
fn case_collision_fails_when_flag_unset() {
    let d = tempfile::tempdir().unwrap();
    if !case_folds(d.path()) {
        return;
    }
    put(d.path(), "Data/Level2", b"lower-claim");
    assert!(!verify(d.path(), &case_files(), false).ok);
}

// "a NON-collided wrong-size file is still a mismatch"
#[test]
fn non_collided_wrong_size_mismatches() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "solo.bin", b"abc");
    let mut f = file("solo.bin", b"abc");
    f.size = 99;
    assert!(!verify(d.path(), &[f], false).ok);
}

// "the observed 38410 master.dat shape - a planned regular file present as an EMPTY DIRECTORY"
#[test]
fn empty_directory_is_not_a_file() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir(d.path().join("master.dat")).unwrap();
    let r = verify(d.path(), &[file("master.dat", b"data")], false);
    assert!(!r.ok);
    assert_eq!(r.mismatches[0].reason, StructuralReason::NotAFile);
}

// "a planned regular file present but SHORT mismatches as wrong-size, reporting the found size"
#[test]
fn short_file_reports_found_size() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "a.bin", b"he");
    let r = verify(d.path(), &[file("a.bin", b"hello")], false);
    let m = &r.mismatches[0];
    assert_eq!(m.reason, StructuralReason::WrongSize);
    assert_eq!(m.expected_size, Some(5));
    assert_eq!(m.found_size, Some(2));
}

// "a planned regular file ABSENT from disk mismatches as missing"
#[test]
fn absent_file_is_missing() {
    let d = tempfile::tempdir().unwrap();
    let r = verify(d.path(), &[file("a.bin", b"hello")], false);
    assert_eq!(r.mismatches[0].reason, StructuralReason::Missing);
}

// "Directory(64), Symlink(512) and zero-size entries all satisfied correctly are ok"
#[cfg(unix)]
#[test]
fn non_regular_entries_ok() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir(d.path().join("dir")).unwrap();
    std::os::unix::fs::symlink("t", d.path().join("link")).unwrap();
    put(d.path(), "empty", b"");
    let mut dir = file("dir", b"");
    dir.flags = 64;
    dir.chunks.clear();
    let mut link = file("link", b"");
    link.flags = 512;
    link.chunks.clear();
    link.linktarget = Some("t".into());
    let empty = file("empty", b"");
    let r = verify(d.path(), &[dir, link, empty], false);
    assert!(r.ok, "{:?}", r.mismatches);
}

// "more than 10 mismatches caps the reported list at 10 but keeps the true mismatchCount"
#[test]
fn mismatch_report_capped_count_not() {
    let d = tempfile::tempdir().unwrap();
    let files: Vec<_> = (0..15).map(|i| file(&format!("f{i}"), b"abc")).collect();
    let r = verify(d.path(), &files, false);
    assert_eq!(r.mismatch_count, 15);
    assert_eq!(r.mismatches.len(), 10);
}

// "NO SHA1 - a file with correct size but WRONG CONTENT is ok (documented boundary)"
#[test]
fn structural_check_has_no_sha1() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "a.bin", b"hellX");
    assert!(verify(d.path(), &[file("a.bin", b"hello")], false).ok);
}

// "CONTRAST: reconcilePartialState's sha1 invariant survives ... the identical file still fails"
#[tokio::test]
async fn contrast_reconcile_still_sha_gates() {
    let d = tempfile::tempdir().unwrap();
    put(d.path(), "a.bin", b"hellX");
    let f = [file("a.bin", b"hello")];
    assert!(verify(d.path(), &f, false).ok);
    assert_eq!(rec(d.path(), &f).await.queued, vec![0]);
}

#[test]
fn structural_traversal_is_err() {
    let d = tempfile::tempdir().unwrap();
    let f = [file("..\\..\\x", b"a")];
    let refs: Vec<&ManifestFile> = f.iter().collect();
    assert!(verify_structural_integrity(d.path(), &refs, false).is_err());
}
