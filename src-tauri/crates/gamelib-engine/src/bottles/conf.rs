//! The minimal `cxbottle.conf` that lets CrossOver adopt a bottle GameLib created with the fallback
//! engine (Phase 59, D-03, ported from `adoptBottle.ts`).
//!
//! The conf omits the bottle timestamp and version keys on purpose: CrossOver's `bin/wine` then runs
//! the win10_64 template's `setup --upgrade` on first use. `WineArch` must be `win64` because
//! CrossOver defaults a missing WineArch to win32. The conf is written LAST during bottle creation,
//! so "conf exists" only turns true once the bottle is complete. An existing conf is never
//! overwritten.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use crate::sinks::EngineLog;

const CONF_FILE: &str = "cxbottle.conf";
const SYSTEM_REG: &str = "system.reg";

/// `buildCxbottleConf`: the fixed template with `bottle_id` as the BottleID.
pub fn build_cxbottle_conf(bottle_id: &str) -> String {
    [
        "[Bottle]",
        &format!("\"BottleID\" = \"{bottle_id}\""),
        "\"Encoding\" = \"UTF-8\"",
        "\"Template\" = \"win10_64\"",
        "\"MenuMode\" = \"ignore\"",
        "\"AssocMode\" = \"ignore\"",
        "\"WineArch\" = \"win64\"",
        "",
    ]
    .join("\n")
}

/// A random version-4 UUID in the upper-case form the conf carries. The 128 bits come from the
/// standard library's per-process random hasher keys (the operating system's entropy), one fresh
/// hasher per half, so no new dependency is needed for an id that only has to be unlikely to
/// collide between one user's bottles.
pub fn random_bottle_id() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};

    let mut bytes = [0u8; 16];
    for (i, half) in bytes.chunks_mut(8).enumerate() {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_usize(i);
        half.copy_from_slice(&hasher.finish().to_le_bytes());
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: Vec<String> = bytes.iter().map(|b| format!("{b:02X}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        hex[0..4].concat(),
        hex[4..6].concat(),
        hex[6..8].concat(),
        hex[8..10].concat(),
        hex[10..16].concat()
    )
}

/// `writeCxbottleConf`: writes the conf into `bottle_dir` once. False, with nothing written, for a
/// directory with no `system.reg` (CrossOver's find_bottle key: it is not a wine prefix) and for one
/// that already has a conf; false with the tmp file removed when the write fails. `uuid` supplies the
/// id (upper-cased); the app passes [`random_bottle_id`].
///
/// The log lines name the bottle's directory name, not its path (the engine log never carries a
/// profile path, T-86-15).
pub fn write_cxbottle_conf(
    log: Option<&dyn EngineLog>,
    bottle_dir: &Path,
    uuid: impl FnOnce() -> String,
) -> bool {
    let name = bottle_dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let conf_path = bottle_dir.join(CONF_FILE);
    if !bottle_dir.join(SYSTEM_REG).exists() {
        if let Some(log) = log {
            log.warn(&format!(
                "cxbottle.conf not written: {name} has no system.reg"
            ));
        }
        return false;
    }
    if conf_path.exists() {
        if let Some(log) = log {
            log.info(&format!(
                "cxbottle.conf already exists in {name}; left untouched"
            ));
        }
        return false;
    }
    let id = uuid().to_uppercase();
    let tmp = bottle_dir.join(format!(".cxbottle.conf.tmp-{}", std::process::id()));
    if write_exclusive(&tmp, build_cxbottle_conf(&id).as_bytes())
        .and_then(|()| fs::rename(&tmp, &conf_path))
        .is_err()
    {
        let _ = fs::remove_file(&tmp);
        if let Some(log) = log {
            log.warn("cxbottle.conf write failed");
        }
        return false;
    }
    if let Some(log) = log {
        log.info(&format!("Wrote cxbottle.conf ({id}) in {name}"));
    }
    true
}

/// `writeFileSync(path, bytes, { mode: 0o644, flag: 'wx' })`: create new, never truncate.
fn write_exclusive(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o644);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;

    #[test]
    fn the_template_is_the_fixed_one_with_a_trailing_newline() {
        let text = build_cxbottle_conf("AAAAAAAA-0000-4000-8000-000000000003");
        assert!(text.starts_with("[Bottle]\n\"BottleID\" = \"AAAAAAAA-"));
        assert!(text.ends_with("\"WineArch\" = \"win64\"\n"));
        assert_eq!(text.lines().count(), 7);
    }

    #[test]
    fn a_random_id_is_an_upper_case_v4_uuid_and_differs_between_calls() {
        let a = random_bottle_id();
        let b = random_bottle_id();
        assert_ne!(a, b);
        let parts: Vec<&str> = a.split('-').collect();
        assert_eq!(
            parts.iter().map(|p| p.len()).collect::<Vec<_>>(),
            [8, 4, 4, 4, 12]
        );
        assert!(parts[2].starts_with('4'));
        assert!(matches!(parts[3].as_bytes()[0], b'8' | b'9' | b'A' | b'B'));
        assert_eq!(a, a.to_uppercase());
    }

    #[test]
    fn the_conf_is_written_once_and_never_over_another() {
        let home = FakeHome::new("conf-");
        let dir = home.root().join("b");
        fs::create_dir_all(&dir).unwrap();
        assert!(
            !write_cxbottle_conf(None, &dir, || "x".into()),
            "no system.reg"
        );
        fs::write(dir.join("system.reg"), "r").unwrap();
        assert!(write_cxbottle_conf(None, &dir, || "abc".into()));
        let text = fs::read_to_string(dir.join("cxbottle.conf")).unwrap();
        assert!(text.contains("\"BottleID\" = \"ABC\""));
        assert!(!write_cxbottle_conf(None, &dir, || "other".into()));
        assert_eq!(fs::read_to_string(dir.join("cxbottle.conf")).unwrap(), text);
    }
}
