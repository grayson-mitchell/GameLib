//! Ports of the TS vectors for `depot/fileAttributes.ts`, `machO.ts`, `resolveContainedPath`,
//! `pathCollisions.ts` and `flagsCensus.ts`. TS test titles are quoted in comments.

use gamelib_depot::model::ManifestFile;
use gamelib_depot::post::*;
use std::path::Path;

fn file(name: &str, size: u64, chunks: usize, flags: u32) -> ManifestFile {
    ManifestFile {
        filename: name.to_string(),
        size,
        flags,
        sha_content: [0; 20],
        chunks: (0..chunks)
            .map(|i| gamelib_depot::model::ChunkRef {
                sha: [i as u8; 20],
                offset: i as u64,
                cb_original: 1,
                cb_compressed: 1,
                crc: 0,
            })
            .collect(),
        linktarget: None,
    }
}

#[cfg(unix)]
mod modes {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn mode_after(initial: u32, flags: u32) -> (u32, ModeReport) {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("f");
        std::fs::write(&p, b"x").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(initial)).unwrap();
        let mut r = ModeReport::default();
        apply_file_modes(&p, flags, &mut r).unwrap();
        let m = std::fs::metadata(&p).unwrap().permissions().mode() & 0o7777;
        (m, r)
    }

    #[test]
    fn executable_gives_0o755() {
        assert_eq!(mode_after(0o644, 32).0, 0o755);
    }

    #[test]
    fn custom_executable_gives_0o755() {
        assert_eq!(mode_after(0o644, 128).0, 0o755);
    }

    // 'ReadOnly + Executable -> chmod 0o555 (read+execute, no write)'
    #[test]
    fn exec_then_readonly_gives_0o555() {
        assert_eq!(mode_after(0o644, 8 | 32).0, 0o555);
    }

    // 'ReadOnly + CustomExecutable -> chmod 0o555 (preserves the exec bit)'
    #[test]
    fn readonly_custom_executable_gives_0o555() {
        assert_eq!(mode_after(0o644, 8 | 128).0, 0o555);
    }

    // 'ReadOnly only (no Executable) -> chmod 0o444'
    #[test]
    fn readonly_only_gives_0o444() {
        assert_eq!(mode_after(0o644, 8).0, 0o444);
    }

    // 'Hidden set, no ReadOnly -> no rename, no throw, documented POSIX no-op'
    #[test]
    fn hidden_is_noop_with_warning() {
        let (m, r) = mode_after(0o640, 16);
        assert_eq!(m, 0o640);
        assert!(r.all_modes_applied);
        assert_eq!(r.warnings.len(), 1);
        assert!(r.warnings[0].contains("Hidden(16)"));
    }

    // 'neither ReadOnly nor Hidden set -> no-op, mode left untouched'
    #[test]
    fn no_flags_leave_mode_untouched() {
        let (m, r) = mode_after(0o600, 0);
        assert_eq!(m, 0o600);
        assert!(r.warnings.is_empty());
        let (m, _) = mode_after(0o600, 64);
        assert_eq!(m, 0o600);
    }

    // 'a chmod failure (nonexistent path) is reported via { ok: false }, never thrown'
    #[test]
    fn readonly_failure_is_reported_not_thrown() {
        let mut r = ModeReport::default();
        let res = apply_file_modes(Path::new("/nonexistent/gamelib-depot-test"), 8, &mut r);
        assert!(res.is_ok());
        assert!(!r.all_modes_applied);
        assert_eq!(r.failures.len(), 1);
    }

    #[test]
    fn exec_chmod_failure_is_an_error() {
        let mut r = ModeReport::default();
        assert!(
            apply_file_modes(Path::new("/nonexistent/gamelib-depot-test"), 32, &mut r).is_err()
        );
    }
}

mod macho {
    use super::*;

    fn probe(bytes: &[u8]) -> bool {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("bin");
        std::fs::write(&p, bytes).unwrap();
        macho_wants_exec(&p).unwrap()
    }

    fn thin(filetype: u32) -> Vec<u8> {
        let mut v = Vec::new();
        v.extend_from_slice(&0xfeed_facfu32.to_le_bytes());
        v.extend_from_slice(&0u32.to_le_bytes());
        v.extend_from_slice(&0u32.to_le_bytes());
        v.extend_from_slice(&filetype.to_le_bytes());
        v.extend_from_slice(&[0u8; 16]);
        v
    }

    fn fat(nfat: u32, slice_offset: u32, slice: &[u8], total: usize) -> Vec<u8> {
        let mut v = Vec::new();
        v.extend_from_slice(&0xcafe_babeu32.to_be_bytes());
        v.extend_from_slice(&nfat.to_be_bytes());
        // fat_arch: cputype cpusubtype offset size align
        v.extend_from_slice(&7u32.to_be_bytes());
        v.extend_from_slice(&3u32.to_be_bytes());
        v.extend_from_slice(&slice_offset.to_be_bytes());
        v.extend_from_slice(&(slice.len() as u32).to_be_bytes());
        v.extend_from_slice(&14u32.to_be_bytes());
        v.resize(total.max(v.len()), 0);
        let off = slice_offset as usize;
        if off + slice.len() <= v.len() {
            v[off..off + slice.len()].copy_from_slice(slice);
        }
        v
    }

    #[test]
    fn macho_thin_execute_and_dylib() {
        assert!(probe(&thin(2)));
        assert!(probe(&thin(6)));
    }

    // MH_BUNDLE (8) and MH_OBJECT (1) are deliberately excluded.
    #[test]
    fn macho_object_and_bundle_rejected() {
        assert!(!probe(&thin(1)));
        assert!(!probe(&thin(8)));
    }

    #[test]
    fn macho_thin_big_endian() {
        let mut v = Vec::new();
        v.extend_from_slice(&0xfeed_facfu32.to_be_bytes());
        v.extend_from_slice(&[0u8; 8]);
        v.extend_from_slice(&2u32.to_be_bytes());
        v.extend_from_slice(&[0u8; 16]);
        assert!(probe(&v));
    }

    #[test]
    fn macho_fat_first_slice_exec() {
        // In-probe fast path (offset 64) and the second-read path (offset 16384).
        assert!(probe(&fat(1, 64, &thin(2), 200)));
        assert!(probe(&fat(2, 16384, &thin(2), 16384 + 64)));
        assert!(!probe(&fat(1, 16384, &thin(8), 16384 + 64)));
    }

    #[test]
    fn macho_nfat_over_32_rejected() {
        assert!(!probe(&fat(33, 4000, &thin(2), 4200)));
        // 'Java .class' shape: 0xcafebabe with a large "nfat".
        assert!(!probe(&fat(0x0034_0000, 64, &thin(2), 200)));
    }

    #[test]
    fn macho_slice_offset_over_cap_rejected() {
        let off = 64 * 1024 * 1024 + 1;
        let mut v = fat(1, off, &[], 100);
        v.resize(100, 0);
        assert!(!probe(&v));
    }

    #[test]
    fn macho_slice_beyond_file_end_rejected() {
        assert!(!probe(&fat(1, 16384, &thin(2), 100)));
    }

    #[test]
    fn macho_slice_inside_table_rejected() {
        // slice offset < table end (8 + 20) overlaps its own directory.
        assert!(!probe(&fat(1, 12, &thin(2), 200)));
    }

    #[test]
    fn macho_tiny_and_plain_files_rejected() {
        assert!(!probe(b"hi"));
        assert!(!probe(&[0x7f, b'E', b'L', b'F', 0, 0, 0, 0, 0, 0]));
    }

    #[cfg(unix)]
    #[test]
    fn macho_fallback_skips_when_already_executable_flagged() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("bin");
        std::fs::write(&p, thin(2)).unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o644)).unwrap();
        let mut r = ModeReport::default();
        assert!(!apply_macho_fallback(&p, 32, &mut r));
        assert_eq!(
            std::fs::metadata(&p).unwrap().permissions().mode() & 0o7777,
            0o644
        );
        assert!(apply_macho_fallback(&p, 0, &mut r));
        assert_eq!(
            std::fs::metadata(&p).unwrap().permissions().mode() & 0o7777,
            0o755
        );
    }
}

mod contain {
    use super::*;

    #[test]
    fn backslash_normalised() {
        assert_eq!(
            resolve_contained_path(Path::new("root"), "a\\b").unwrap(),
            Path::new("root").join("a").join("b")
        );
    }

    #[test]
    fn traversal_rejected() {
        let root = Path::new("/install/root");
        assert!(resolve_contained_path(root, "../x").is_err());
        assert!(resolve_contained_path(root, "a/../../x").is_err());
        assert!(resolve_contained_path(root, "..\\x").is_err());
        assert!(resolve_contained_path(root, "/etc/x").is_err());
        // inner `..` that stays inside is fine
        assert_eq!(
            resolve_contained_path(root, "a/../b").unwrap(),
            Path::new("/install/root/b")
        );
        // the TS `rel.startsWith('..')` quirk is preserved
        assert!(resolve_contained_path(root, "..foo").is_err());
    }
}

mod symlink {
    use super::*;

    #[test]
    fn symlink_escape_rejected() {
        let root = Path::new("/r");
        let link = Path::new("/r/a/link");
        assert!(check_symlink_target(root, link, "../../outside").is_err());
        assert!(check_symlink_target(root, link, "/etc/passwd").is_err());
        assert!(check_symlink_target(root, link, "..\\..\\outside").is_err());
    }

    #[test]
    fn symlink_inside_accepted() {
        let root = Path::new("/r");
        let link = Path::new("/r/a/link");
        assert!(check_symlink_target(root, link, "sibling").is_ok());
        assert!(check_symlink_target(root, link, "../other/x").is_ok());
        assert!(check_symlink_target(root, link, "sub\\dir").is_ok());
    }
}

mod collision {
    use super::*;

    const DIR: u32 = 64;

    fn dir_entry(name: &str) -> ManifestFile {
        file(name, 0, 0, DIR)
    }
    fn file_entry(name: &str, size: u64, chunks: usize) -> ManifestFile {
        file(name, size, chunks, 0)
    }
    fn depot<'a>(id: &'a str, files: &'a [ManifestFile]) -> CollisionDepot<'a> {
        CollisionDepot {
            depot_id: id,
            owner_app_id: None,
            appinfo_rank: None,
            files,
        }
    }
    fn owned<'a>(
        id: &'a str,
        owner: &'a str,
        rank: u32,
        files: &'a [ManifestFile],
    ) -> CollisionDepot<'a> {
        CollisionDepot {
            depot_id: id,
            owner_app_id: Some(owner),
            appinfo_rank: Some(rank),
            files,
        }
    }

    // 'the Fallout 2 shape (T-PC1): drops the Directory marker and KEEPS the 333MB file'
    #[test]
    fn fallout2_drops_marker_keeps_file() {
        let a = [dir_entry("master.dat")];
        let b = [file_entry("master.dat", 333_177_805, 318)];
        let plan = detect_path_collisions(&[depot("38414", &a), depot("38415", &b)], false);
        assert_eq!(plan.resolved, vec!["master.dat"]);
        assert_eq!(plan.dropped, vec![(0, 0)]);
        assert_eq!(plan.dropped_bytes, 0);
        // 'logs the collision loudly'
        assert!(plan.warnings[0].contains("master.dat"));
        assert!(plan.warnings[0].contains("Keeping the FILE"));
    }

    // 'does not disturb the other files in either depot'
    #[test]
    fn other_files_not_disturbed() {
        let a = [dir_entry("master.dat"), file_entry("keep-a", 5, 1)];
        let b = [file_entry("master.dat", 100, 1), file_entry("keep-b", 7, 1)];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert_eq!(plan.dropped, vec![(0, 0)]);
    }

    // 'changes nothing when no path is claimed twice'
    #[test]
    fn no_collision_changes_nothing() {
        let a = [file_entry("a", 1, 1)];
        let b = [file_entry("b", 1, 1)];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert_eq!(plan, CollisionPlan::default());
    }

    // 'a directory entry in ONE depot with the same name as a directory in another is not a conflict'
    #[test]
    fn collision_bare_directory_markers_are_silent() {
        let a = [dir_entry("data")];
        let b = [dir_entry("data")];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert_eq!(plan, CollisionPlan::default());
    }

    // 'treats backslash and forward slash as ONE path, like resolveContainedPath'
    #[test]
    fn collision_backslash_and_slash_are_one_path() {
        let a = [dir_entry("sound\\music")];
        let b = [file_entry("sound/music", 10, 1)];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert_eq!(plan.resolved.len(), 1);
        assert_eq!(plan.dropped, vec![(0, 0)]);
    }

    // 'is CASE-SENSITIVE - Linux allows differently-cased siblings'
    #[test]
    fn collision_case_sensitive_keeps_siblings() {
        let a = [file_entry("Data/a.pak", 1, 1)];
        let b = [file_entry("data/A.pak", 1, 1)];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert_eq!(plan, CollisionPlan::default());
    }

    // 'two REAL file entries on one path are reported, and NOTHING is dropped'
    #[test]
    fn collision_two_real_files_unresolved() {
        let a = [file_entry("shared.dat", 100, 1)];
        let b = [file_entry("shared.dat", 200, 1)];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert!(plan.resolved.is_empty());
        assert_eq!(plan.unresolved, vec!["shared.dat"]);
        assert!(plan.dropped.is_empty());
        assert!(plan.warnings.iter().any(|w| w.contains("UNRESOLVED")));
    }

    // 'a symlink against a file is reported, not silently decided'
    #[test]
    fn collision_symlink_vs_file_unresolved() {
        let mut link = file("link", 0, 0, 512);
        link.linktarget = Some("elsewhere".into());
        let a = [link];
        let b = [file_entry("link", 50, 1)];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert_eq!(plan.unresolved, vec!["link"]);
        assert!(plan.dropped.is_empty());
    }

    fn odd_dir_with_content() -> ManifestFile {
        file("odd", 500, 1, DIR)
    }

    // 'a Directory-FLAGGED entry that carries real content is never discarded'
    #[test]
    fn collision_content_carrying_directory_survives() {
        let a = [odd_dir_with_content()];
        let b = [dir_entry("odd")];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert_eq!(plan.resolved, vec!["odd"]);
        assert_eq!(plan.dropped, vec![(1, 0)]);
    }

    // 'a Directory-flagged entry with content against a real file is ambiguous - nothing dropped'
    #[test]
    fn collision_content_directory_vs_file_ambiguous() {
        let a = [odd_dir_with_content()];
        let b = [file_entry("odd", 500, 1)];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert!(plan.resolved.is_empty());
        assert_eq!(plan.unresolved, vec!["odd"]);
        assert!(plan.dropped.is_empty());
    }

    // 'several directory markers against ONE file all lose; against TWO files nothing is dropped'
    #[test]
    fn collision_many_markers_one_file_and_two_files() {
        let a = [dir_entry("x")];
        let b = [dir_entry("x")];
        let c = [file_entry("x", 10, 1)];
        let many = detect_path_collisions(&[depot("a", &a), depot("b", &b), depot("c", &c)], false);
        assert_eq!(many.resolved, vec!["x"]);
        assert_eq!(many.dropped, vec![(0, 0), (1, 0)]);

        let a = [dir_entry("y")];
        let b = [file_entry("y", 10, 1)];
        let c = [file_entry("y", 20, 1)];
        let amb = detect_path_collisions(&[depot("a", &a), depot("b", &b), depot("c", &c)], false);
        assert!(amb.resolved.is_empty());
        assert_eq!(amb.unresolved, vec!["y"]);
        assert!(amb.dropped.is_empty());
    }

    // 'a directory marker and a file on one path in the SAME depot still resolve'
    #[test]
    fn collision_within_one_depot_resolves() {
        let a = [dir_entry("same"), file_entry("same", 9, 1)];
        let plan = detect_path_collisions(&[depot("a", &a)], false);
        assert_eq!(plan.resolved, vec!["same"]);
        assert_eq!(plan.dropped, vec![(0, 0)]);
    }

    // 'mirror: folded Master.dat dir vs master.dat file drops the marker'
    #[test]
    fn collision_case_insensitive_mirror_drops_marker() {
        let a = [dir_entry("Master.dat")];
        let b = [file_entry("master.dat", 333_177_805, 318)];
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], true);
        assert_eq!(plan.resolved.len(), 1);
        assert_eq!(plan.dropped, vec![(0, 0)]);
        // option false keeps case-sensitive behaviour
        let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], false);
        assert_eq!(plan, CollisionPlan::default());
    }

    // 'Californium shape: same-owner folded pair resolved by appinfo rank'
    #[test]
    fn collision_californium_resolved_by_rank() {
        let a = [file_entry(
            "californium.app/Contents/Resources/Data/level2",
            61884,
            1,
        )];
        let b = [file_entry(
            "Californium.app/Contents/Resources/Data/level2",
            61924,
            1,
        )];
        let depots = [
            owned("402062", "402060", 0, &a),
            owned("402064", "402060", 1, &b),
        ];
        let plan = detect_path_collisions(&depots, true);
        assert_eq!(plan.resolved.len(), 1);
        assert_eq!(plan.dropped_bytes, 61884);
        assert_eq!(plan.dropped, vec![(0, 0)]);
        assert_eq!(
            detect_path_collisions(&depots, false),
            CollisionPlan::default()
        );
    }

    // 'Wasteland 3 shape: cross-owner folded pair stays UNRESOLVED and logs both spellings'
    #[test]
    fn collision_wasteland3_cross_owner_unresolved() {
        let a = [file_entry("WL3.app/a/24044905.wem", 10355, 1)];
        let b = [file_entry("wl3.app/a/24044905.wem", 19564, 1)];
        let depots = [
            owned("719042", "719040", 0, &a),
            owned("1522651", "1522650", 0, &b),
        ];
        let plan = detect_path_collisions(&depots, true);
        assert_eq!(plan.unresolved.len(), 1);
        assert_eq!(plan.dropped_bytes, 0);
        assert!(plan.dropped.is_empty());
        let msg = plan
            .warnings
            .iter()
            .find(|m| m.contains("UNRESOLVED"))
            .unwrap();
        assert!(msg.contains("WL3.app/a/24044905.wem"));
        assert!(msg.contains("wl3.app/a/24044905.wem"));
    }

    // 'bare directory markers on one folded or exact path are silent'
    #[test]
    fn collision_folded_directory_markers_silent() {
        let a = [dir_entry("WL3.app")];
        let b = [dir_entry("wl3.app")];
        for ci in [true, false] {
            let plan = detect_path_collisions(&[depot("a", &a), depot("b", &b)], ci);
            assert!(plan.resolved.is_empty() && plan.unresolved.is_empty());
            assert!(plan.warnings.is_empty());
        }
    }

    // 'pathCollisionKey normalises separators and folds only on request'
    #[test]
    fn collision_key_normalises_and_folds_on_request() {
        assert_eq!(path_collision_key("A\\B.txt", false), "A/B.txt");
        assert_eq!(path_collision_key("A\\B.txt", true), "a/b.txt");
    }
}

mod probe {
    use super::*;
    use std::io;

    fn enoent() -> io::Error {
        io::Error::from(io::ErrorKind::NotFound)
    }
    fn denied() -> io::Error {
        io::Error::from(io::ErrorKind::PermissionDenied)
    }

    // 'same dev+ino for the swapped spelling -> true'
    #[test]
    fn probe_same_identity_is_insensitive() {
        assert!(probe_case_insensitive_with(
            Path::new("/x/steamapps"),
            |_| Ok((1, 5)),
            false
        ));
    }

    // 'swapped ENOENT -> false'
    #[test]
    fn probe_swapped_enoent_is_sensitive() {
        let stat = |p: &Path| {
            if p.to_string_lossy().ends_with("STEAMAPPS") {
                Err(enoent())
            } else {
                Ok((1, 5))
            }
        };
        assert!(!probe_case_insensitive_with(
            Path::new("/x/steamapps"),
            stat,
            true
        ));
    }

    // 'different ino -> false'
    #[test]
    fn probe_different_ino_is_sensitive() {
        let stat = |p: &Path| {
            if p.to_string_lossy().ends_with("STEAMAPPS") {
                Ok((1, 6))
            } else {
                Ok((1, 5))
            }
        };
        assert!(!probe_case_insensitive_with(
            Path::new("/x/steamapps"),
            stat,
            true
        ));
    }

    // 'inconclusive cases fall back to the platform default'
    #[test]
    fn probe_inconclusive_falls_back() {
        for fallback in [false, true] {
            assert_eq!(
                probe_case_insensitive_with(Path::new("/x/steamapps"), |_| Err(enoent()), fallback),
                fallback
            );
            assert_eq!(
                probe_case_insensitive_with(Path::new("/x/steamapps"), |_| Err(denied()), fallback),
                fallback
            );
            // no letters in the name
            assert_eq!(
                probe_case_insensitive_with(Path::new("/x/123"), |_| Ok((1, 5)), fallback),
                fallback
            );
        }
    }

    #[test]
    fn probe_real_tempdir_matches_host_and_leaves_no_files() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("Steamapps");
        std::fs::create_dir(&sub).unwrap();
        let got = probe_case_insensitive(&sub).unwrap();
        let truth = std::fs::metadata(dir.path().join("sTEAMAPPS")).is_ok();
        assert_eq!(got, truth);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}

mod census {
    use super::*;

    fn census_of(files: &[ManifestFile]) -> FlagsCensus {
        let mut c = FlagsCensus::new();
        for f in files {
            c.add(f);
        }
        c
    }

    // 'H1 signature: ... every file has flags: undefined reports flagBearing: 0'
    #[test]
    fn census_h1_signature() {
        let c = census_of(&[file("a", 1, 1, 0), file("b", 1, 1, 0), file("c", 1, 1, 0)]);
        assert_eq!(c.total_files, 3);
        assert_eq!(c.flag_bearing, 0);
        assert_eq!(c.executable_flagged, 0);
        assert!(c.distinct_flag_values().is_empty());
    }

    // 'a mixed-flags plan reports correct per-bit counts and ascending distinct values'
    #[test]
    fn census_mixed_flags() {
        let c = census_of(&[
            file("exec", 1, 1, 32),
            file("custom", 1, 1, 128),
            file("ro", 1, 1, 8),
            file("dir", 1, 1, 64),
            file("link", 1, 1, 512),
            file("plain", 1, 1, 0),
        ]);
        assert_eq!(c.total_files, 6);
        assert_eq!(c.flag_bearing, 5);
        assert_eq!(c.executable_flagged, 2);
        assert_eq!(c.readonly_flagged, 1);
        assert_eq!(c.hidden_flagged, 0);
        assert_eq!(c.directory_entries, 1);
        assert_eq!(c.symlink_entries, 1);
        assert_eq!(c.distinct_flag_values(), vec![8, 32, 64, 128, 512]);
    }

    // 'flags: 0 counts as NOT flag-bearing'
    #[test]
    fn census_zero_flags_not_bearing() {
        let c = census_of(&[file("z", 1, 1, 0)]);
        assert_eq!(c.flag_bearing, 0);
        assert_eq!(c.executable_flagged, 0);
        assert!(c.distinct_flag_values().is_empty());
    }

    // 'computes the census across ALL depots, not just the first'
    #[test]
    fn census_spans_all_depots() {
        let c = census_of(&[
            file("d1", 1, 1, 32),
            file("d2", 1, 1, 8),
            file("d2b", 1, 1, 0),
        ]);
        assert_eq!(c.total_files, 3);
        assert_eq!(c.flag_bearing, 2);
        assert_eq!(c.executable_flagged, 1);
        assert_eq!(c.readonly_flagged, 1);
        assert_eq!(c.distinct_flag_values(), vec![8, 32]);
    }

    // 'caps distinctFlagValues so a huge, highly-varied manifest cannot blow up log size'
    #[test]
    fn census_caps_distinct_values() {
        let files: Vec<_> = (0..40)
            .map(|i| file("f", 1, 1, 32 | (1 << (i % 20 + 10)) | i))
            .collect();
        let c = census_of(&files);
        assert_eq!(c.total_files, 40);
        assert_eq!(c.flag_bearing, 40);
        assert!(c.distinct_flag_values().len() < 40);
        assert!(c.distinct_flag_values().len() <= 32);
        let mut sorted = c.distinct_flag_values();
        sorted.sort_unstable();
        assert_eq!(c.distinct_flag_values(), sorted);
    }

    // 'counts a file with no chunks or size 0 as a zeroSizeEntries hit, regardless of flags'
    #[test]
    fn census_zero_size_entries() {
        let c = census_of(&[file("empty", 0, 0, 0), file("dir", 0, 0, 64)]);
        assert_eq!(c.zero_size_entries, 2);
    }

    // 'never leaks per-file data'
    #[test]
    fn census_summary_has_no_filenames() {
        let c = census_of(&[file("super-secret-user-path/game.bin", 1, 1, 32)]);
        let line = c.summary_line(&[]);
        assert!(!line.contains("super-secret-user-path"));
        assert!(!line.contains("game.bin"));
        assert!(line.contains("totalFiles=1"));
        assert!(line.contains("executableFlagged=1"));
        assert!(line.ends_with("distinctFlagValues=[32]"));
        assert_eq!(FLAGS_CENSUS_LOG_PREFIX, "steam-flags-census");
    }

    // 'folds extra run-scoped counters (e.g. chmodAttempts) into the same line'
    #[test]
    fn census_summary_folds_extras() {
        let c = census_of(&[file("a", 1, 1, 32)]);
        let line = c.summary_line(&[
            ("chmodAttempts", "1".into()),
            ("modeCallsites", "1".into()),
            ("jobCount", "1".into()),
            ("reconciledSkipped", "0".into()),
        ]);
        for want in [
            "chmodAttempts=1",
            "modeCallsites=1",
            "jobCount=1",
            "reconciledSkipped=0",
        ] {
            assert!(line.contains(want), "{line}");
        }
    }
}
