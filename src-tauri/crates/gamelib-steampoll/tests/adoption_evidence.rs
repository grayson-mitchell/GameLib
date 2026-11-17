//! Phase 81 Open Question 3 / D-14: the pure evidence readers behind the adoption watch. Every
//! reader is size-capped and answers "no evidence" on any I/O or parse failure.

use gamelib_steampoll::adoption_evidence::{
    capture_log_cursor, folder_key, parse_loaded_apps_line, scan_log_for_rescan, LogCursor,
};
use gamelib_steampoll::constants::ADOPTION_LOG_TAIL_BYTES;
use std::io::Write;
use std::path::PathBuf;

const MAC_LINE: &str = "[2026-11-14 08:29:29] Loaded 14 apps from install folder \"/Users/u/Library/Application Support/Steam/steamapps\\appmanifest_*.acf\".";
const WIN_LINE: &str = "[2026-11-17 05:57:49] Loaded 11 apps from install folder \"C:\\Program Files (x86)\\Steam\\steamapps\\appmanifest_*.acf\".";
const KEY: &str = "/lib/steamapps";

fn line(count: u32, folder: &str) -> String {
    format!("[2026-11-18 10:00:00] Loaded {count} apps from install folder \"{folder}\\appmanifest_*.acf\".\n")
}

struct Log {
    _dir: tempfile::TempDir,
    path: PathBuf,
}

fn log_with(content: &str) -> Log {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("content_log.txt");
    std::fs::write(&path, content).unwrap();
    Log { _dir: dir, path }
}

impl Log {
    fn append(&self, content: &str) {
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&self.path)
            .unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }
    fn len(&self) -> u64 {
        std::fs::metadata(&self.path).unwrap().len()
    }
}

#[test]
fn a_mac_loaded_line_parses_to_a_normalised_folder_and_count() {
    assert_eq!(
        parse_loaded_apps_line(MAC_LINE),
        Some((
            "/users/u/library/application support/steam/steamapps".to_string(),
            14
        ))
    );
}

#[test]
fn a_windows_loaded_line_parses_and_a_trailing_cr_changes_nothing() {
    let want = Some(("c:/program files (x86)/steam/steamapps".to_string(), 11));
    assert_eq!(parse_loaded_apps_line(WIN_LINE), want);
    assert_eq!(parse_loaded_apps_line(&format!("{WIN_LINE}\r")), want);
}

#[test]
fn unrelated_truncated_and_malformed_lines_parse_to_none() {
    assert_eq!(parse_loaded_apps_line(""), None);
    assert_eq!(
        parse_loaded_apps_line("[2026-11-17 05:57:49] AppID 480 state changed : Fully Installed,"),
        None
    );
    // No count.
    assert_eq!(
        parse_loaded_apps_line("[2026-11-17 05:57:49] Loaded apps from install folder \"C:\\s\""),
        None
    );
    // The count is not a number.
    assert_eq!(
        parse_loaded_apps_line("[2026-11-17 05:57:49] Loaded x apps from install folder \"C:\\s\""),
        None
    );
    // No closing quote.
    assert_eq!(
        parse_loaded_apps_line("[2026-11-17 05:57:49] Loaded 11 apps from install folder \"C:\\s"),
        None
    );
    // A count that does not fit a u32.
    assert_eq!(
        parse_loaded_apps_line(
            "[2026-11-17 05:57:49] Loaded 99999999999 apps from install folder \"C:\\s\""
        ),
        None
    );
}

#[test]
fn folder_key_makes_a_manifest_parent_and_a_log_path_compare_equal() {
    let from_log = parse_loaded_apps_line(WIN_LINE).unwrap().0;
    assert_eq!(
        folder_key("C:\\Program Files (x86)\\Steam\\steamapps\\appmanifest_480.acf"),
        from_log
    );
    assert_eq!(
        folder_key("c:/PROGRAM FILES (x86)/steam/steamapps/"),
        from_log
    );
    assert_eq!(
        folder_key("/Users/u/Steam/steamapps"),
        "/users/u/steam/steamapps"
    );
    // Only a final appmanifest_ component is dropped.
    assert_eq!(
        folder_key("/a/appmanifest_dir/steamapps"),
        "/a/appmanifest_dir/steamapps"
    );
}

#[test]
fn capture_records_the_length_and_the_last_count_logged_for_the_folder() {
    let log = log_with(&format!(
        "{}{}{}",
        line(3, "/lib/steamapps"),
        line(9, "/other/steamapps"),
        line(5, "/lib/steamapps")
    ));
    let cursor = capture_log_cursor(&log.path, KEY);
    assert_eq!(cursor.offset, log.len());
    assert_eq!(cursor.prior_count, Some(5));
    assert_eq!(cursor.key, KEY);
}

#[test]
fn capture_on_a_log_that_never_names_the_folder_or_is_absent_has_no_prior_count() {
    let log = log_with(&line(9, "/other/steamapps"));
    let cursor = capture_log_cursor(&log.path, KEY);
    assert_eq!(cursor.offset, log.len());
    assert_eq!(cursor.prior_count, None);

    let missing = log._dir.path().join("nope.txt");
    let cursor = capture_log_cursor(&missing, KEY);
    assert_eq!(cursor.offset, 0);
    assert_eq!(cursor.prior_count, None);
}

#[test]
fn capture_only_reads_the_final_window_before_the_offset() {
    // The count for the folder sits before the window, so it is out of reach: no prior count.
    let mut content = line(7, "/lib/steamapps");
    content.push_str(
        &"filler line that is not a rescan\n".repeat((ADOPTION_LOG_TAIL_BYTES as usize / 33) + 20),
    );
    let log = log_with(&content);
    let cursor = capture_log_cursor(&log.path, KEY);
    assert_eq!(cursor.offset, log.len());
    assert_eq!(cursor.prior_count, None);
}

#[test]
fn a_new_line_for_the_same_folder_with_a_higher_count_is_evidence() {
    let log = log_with(&line(5, "/lib/steamapps"));
    let mut cursor = capture_log_cursor(&log.path, KEY);
    assert!(!scan_log_for_rescan(&log.path, &mut cursor));
    log.append(&line(6, "/lib/steamapps"));
    assert!(scan_log_for_rescan(&log.path, &mut cursor));
}

#[test]
fn the_same_or_a_lower_count_is_not_evidence_and_the_offset_moves_past_it() {
    let log = log_with(&line(5, "/lib/steamapps"));
    let mut cursor = capture_log_cursor(&log.path, KEY);
    log.append(&line(5, "/lib/steamapps"));
    log.append(&line(4, "/lib/steamapps"));
    assert!(!scan_log_for_rescan(&log.path, &mut cursor));
    assert_eq!(cursor.offset, log.len());
}

#[test]
fn a_higher_count_for_another_folder_is_not_evidence() {
    let log = log_with(&line(5, "/lib/steamapps"));
    let mut cursor = capture_log_cursor(&log.path, KEY);
    log.append(&line(50, "/elsewhere/steamapps"));
    assert!(!scan_log_for_rescan(&log.path, &mut cursor));
}

#[test]
fn with_no_prior_count_for_the_folder_the_rule_stays_off() {
    let log = log_with(&line(50, "/elsewhere/steamapps"));
    let mut cursor = capture_log_cursor(&log.path, KEY);
    assert_eq!(cursor.prior_count, None);
    log.append(&line(1, "/lib/steamapps"));
    log.append(&line(99, "/lib/steamapps"));
    assert!(!scan_log_for_rescan(&log.path, &mut cursor));
}

#[test]
fn a_crlf_log_is_read_the_same() {
    let crlf = |count: u32| {
        format!(
            "[2026-11-17 05:57:49] Loaded {count} apps from install folder \"C:\\Program Files (x86)\\Steam\\steamapps\\appmanifest_*.acf\".\r\n"
        )
    };
    let log = log_with(&crlf(11));
    let key = folder_key("C:\\Program Files (x86)\\Steam\\steamapps\\appmanifest_480.acf");
    let mut cursor = capture_log_cursor(&log.path, &key);
    assert_eq!(cursor.prior_count, Some(11));
    log.append(&crlf(12));
    assert!(scan_log_for_rescan(&log.path, &mut cursor));
}

#[test]
fn a_log_shorter_than_the_offset_was_rotated_and_is_read_from_the_start() {
    let log = log_with(&format!(
        "{}{}",
        line(5, "/lib/steamapps"),
        "padding line so the offset is well past the new file\n".repeat(20)
    ));
    let mut cursor = capture_log_cursor(&log.path, KEY);
    assert_eq!(cursor.prior_count, Some(5));
    std::fs::write(&log.path, line(8, "/lib/steamapps")).unwrap();
    assert!(log.len() < cursor.offset);
    assert!(scan_log_for_rescan(&log.path, &mut cursor));
}

#[test]
fn an_append_longer_than_the_window_is_read_from_its_last_window_only() {
    let log = log_with(&line(5, "/lib/steamapps"));
    let mut cursor = capture_log_cursor(&log.path, KEY);
    // The qualifying line is the first thing appended, then more than a window of filler: it is
    // out of reach.
    log.append(&line(9, "/lib/steamapps"));
    log.append(
        &"filler line that is not a rescan\n".repeat((ADOPTION_LOG_TAIL_BYTES as usize / 33) + 20),
    );
    assert!(!scan_log_for_rescan(&log.path, &mut cursor));
    assert_eq!(cursor.offset, log.len());

    // A qualifying line inside the last window is found.
    log.append(&line(9, "/lib/steamapps"));
    assert!(scan_log_for_rescan(&log.path, &mut cursor));
}

#[test]
fn the_partial_first_line_of_a_capped_window_is_dropped() {
    let log = log_with(&line(5, "/lib/steamapps"));
    let mut cursor = capture_log_cursor(&log.path, KEY);
    // One long line whose tail looks like a qualifying line. The window starts inside the line, so
    // what it sees of the line is a fragment and must not count.
    let long = format!(
        "{}{}",
        "X".repeat(ADOPTION_LOG_TAIL_BYTES as usize + 100),
        line(9, "/lib/steamapps")
    );
    log.append(&long);
    assert!(!scan_log_for_rescan(&log.path, &mut cursor));
}

#[test]
fn a_partial_trailing_line_is_not_consumed_until_it_is_complete() {
    let log = log_with(&line(5, "/lib/steamapps"));
    let mut cursor = capture_log_cursor(&log.path, KEY);
    let before = cursor.offset;
    log.append("[2026-11-18 10:00:00] Loaded 9 apps from install folder \"/lib/steamapps\\appmanifest_*.acf\".");
    // Looks complete, but no newline yet.
    assert!(!scan_log_for_rescan(&log.path, &mut cursor));
    assert_eq!(cursor.offset, before);
    log.append("\n");
    assert!(scan_log_for_rescan(&log.path, &mut cursor));
}

#[test]
fn a_missing_log_is_no_evidence_and_never_panics() {
    let dir = tempfile::tempdir().unwrap();
    let mut cursor = LogCursor {
        offset: 10,
        prior_count: Some(1),
        key: KEY.to_string(),
    };
    assert!(!scan_log_for_rescan(
        &dir.path().join("absent.txt"),
        &mut cursor
    ));
    // A directory in place of the file is an I/O failure too.
    assert!(!scan_log_for_rescan(dir.path(), &mut cursor));
}
