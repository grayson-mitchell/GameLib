//! The marker a pinned artifact directory carries, `.gamelib-pin.json` (`{sha256, version}`, ported
//! from `fallbackEngine.ts`'s `MARKER`). It names the sha256 and version of the archive the directory
//! was extracted from, so a directory is trusted only when it still names the pin's own build.

use std::fs;
use std::path::Path;

use gamelib_store::json::{to_compact_bytes, Json, Obj};
use serde_json::Value;

use crate::jsutil::prop;
use crate::pins::PinnedArtifact;

/// The marker's file name inside a pinned artifact directory.
pub const PIN_MARKER_FILE: &str = ".gamelib-pin.json";

/// A pin marker as read: either field may be absent in a hand-edited or old one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinMarker {
    pub sha256: Option<String>,
    pub version: Option<String>,
}

/// The directory's marker, or `None` for a missing or unparseable one or one that is not an object.
pub fn read(dir: &Path) -> Option<PinMarker> {
    let bytes = fs::read(dir.join(PIN_MARKER_FILE)).ok()?;
    let raw: Value = serde_json::from_str(&String::from_utf8_lossy(&bytes)).ok()?;
    if !raw.is_object() {
        return None;
    }
    let text = |key: &str| prop(&raw, key).and_then(Value::as_str).map(str::to_string);
    Some(PinMarker {
        sha256: text("sha256"),
        version: text("version"),
    })
}

/// `markerMatches`: the directory's marker names this artifact's sha256. A missing, unparseable or
/// sha-less marker does not.
pub fn matches(dir: &Path, artifact: &PinnedArtifact) -> bool {
    read(dir).and_then(|m| m.sha256).as_deref() == Some(artifact.sha256.as_str())
}

/// The marker's bytes: `{"sha256":...,"version":...}`, compact, the TS key order.
pub fn marker_bytes(sha256: &str, version: &str) -> Vec<u8> {
    let mut obj = Obj::new();
    obj.insert_js("sha256", Json::Str(sha256.to_string()));
    obj.insert_js("version", Json::Str(version.to_string()));
    to_compact_bytes(&Json::Obj(obj))
}

/// Writes the marker into `dir` (`writeFileSync(join(out, MARKER), JSON.stringify(...))`: default
/// mode, no tmp file; the directory is a staging one the install renames into place afterwards).
pub fn write(dir: &Path, sha256: &str, version: &str) -> std::io::Result<()> {
    fs::write(dir.join(PIN_MARKER_FILE), marker_bytes(sha256, version))
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;

    fn artifact(sha: &str) -> PinnedArtifact {
        PinnedArtifact {
            version: "v1".into(),
            url: String::new(),
            size: 0,
            sha256: sha.into(),
            archive_name: String::new(),
        }
    }

    #[test]
    fn the_marker_round_trips_byte_for_byte_and_matches_only_its_own_sha() {
        let home = FakeHome::new("pin-marker-");
        assert!(read(home.root()).is_none());
        write(home.root(), "abc", "v1").unwrap();
        assert_eq!(
            fs::read_to_string(home.root().join(PIN_MARKER_FILE)).unwrap(),
            r#"{"sha256":"abc","version":"v1"}"#
        );
        assert_eq!(
            read(home.root()),
            Some(PinMarker {
                sha256: Some("abc".into()),
                version: Some("v1".into())
            })
        );
        assert!(matches(home.root(), &artifact("abc")));
        assert!(!matches(home.root(), &artifact("other")));
    }

    #[test]
    fn a_malformed_or_sha_less_marker_matches_nothing() {
        let home = FakeHome::new("pin-marker-bad-");
        fs::write(home.root().join(PIN_MARKER_FILE), "{not json").unwrap();
        assert!(read(home.root()).is_none());
        fs::write(home.root().join(PIN_MARKER_FILE), r#"{"version":"v1"}"#).unwrap();
        assert!(!matches(home.root(), &artifact("abc")));
        fs::write(home.root().join(PIN_MARKER_FILE), "[]").unwrap();
        assert!(read(home.root()).is_none());
    }
}
