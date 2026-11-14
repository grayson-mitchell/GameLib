//! The Steam metadata cache entry (mirror of `SteamMetadataCacheEntry`, `stores.ts`) and the
//! two pure rules every writer of it shares: platform write precedence
//! (`platformPrecedence.ts`) and the depot-signal predicate (`metadataCapture.ts`).
//!
//! Round-trip contract (T-79-123): every field TS knows is modelled; every field it does not
//! (a future one) rides through `rest`, so a Rust write never drops `bridge`,
//! `forcedWindowsViaBottle` or anything added later. `is_windows_native` is three-valued
//! (D-17): absent means "never captured" and is never defaulted to `false`.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Map, Value};

/// 24 h. A captured-at stamp further ahead of "now" than this is corruption, not clock skew
/// (REQ-37-05); it degrades to "indefinitely old".
const MAX_CLOCK_SKEW_MS: i64 = 24 * 60 * 60 * 1000;

fn default_extra() -> Value {
    json!({ "reqs": [] })
}

/// Reads a number leniently: anything that is not a JSON number is "absent" rather than a
/// whole-entry parse failure (the on-disk store is untyped JSON).
fn lenient_ms<'de, D: Deserializer<'de>>(d: D) -> Result<Option<i64>, D::Error> {
    let v = Option::<Value>::deserialize(d)?;
    Ok(match v {
        Some(Value::Number(n)) => n.as_i64().or_else(|| {
            n.as_f64()
                .filter(|f| f.is_finite())
                .map(|f| f.clamp(i64::MIN as f64, i64::MAX as f64) as i64)
        }),
        _ => None,
    })
}

/// `steamMetadataStore` entry. Field names are exactly the TS ones.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SteamMetadataEntry {
    #[serde(default)]
    pub art_cover: String,
    #[serde(default)]
    pub art_square: String,
    #[serde(default = "default_extra")]
    pub extra: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_mac_native: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_linux_native: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_windows_native: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metacritic_score: Option<u32>,
    #[serde(
        default,
        rename = "metacriticCaptured",
        skip_serializing_if = "Option::is_none"
    )]
    pub metacritic_captured: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_delisted: Option<bool>,
    #[serde(
        default,
        rename = "platformsCaptured",
        skip_serializing_if = "Option::is_none"
    )]
    pub platforms_captured: Option<bool>,
    /// `'appdetails' | 'pics'`; kept a string so a junk on-disk value cannot fail the entry.
    #[serde(
        default,
        rename = "platformsSource",
        skip_serializing_if = "Option::is_none"
    )]
    pub platforms_source: Option<String>,
    #[serde(
        default,
        rename = "platformsCapturedAt",
        deserialize_with = "lenient_ms",
        skip_serializing_if = "Option::is_none"
    )]
    pub platforms_captured_at: Option<i64>,
    /// `'32' | '64' | 'unknown'`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mac_arch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mac_arch_verified: Option<bool>,
    /// `'minos' | 'macho' | 'known-fix'`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mac_arch_source: Option<String>,
    #[serde(
        default,
        rename = "forcedWindowsViaBottle",
        skip_serializing_if = "Option::is_none"
    )]
    pub forced_windows_via_bottle: Option<bool>,
    /// The persisted bridge verdict; opaque to Rust.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bridge: Option<Value>,
    /// Every key Rust does not model, preserved verbatim.
    #[serde(flatten)]
    pub rest: Map<String, Value>,
}

impl SteamMetadataEntry {
    /// The placeholder TS writes for a never-enriched app that turns out delisted.
    pub fn blank() -> Self {
        Self {
            art_cover: String::new(),
            art_square: String::new(),
            extra: default_extra(),
            is_mac_native: None,
            is_linux_native: None,
            is_windows_native: None,
            metacritic_score: None,
            metacritic_captured: None,
            is_delisted: None,
            platforms_captured: None,
            platforms_source: None,
            platforms_captured_at: None,
            mac_arch: None,
            mac_arch_verified: None,
            mac_arch_source: None,
            forced_windows_via_bottle: None,
            bridge: None,
            rest: Map::new(),
        }
    }
}

/// Who wrote a platform signal. Serialised names match TS.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlatformSource {
    Appdetails,
    Pics,
}

impl PlatformSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Appdetails => "appdetails",
            Self::Pics => "pics",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        match s {
            "appdetails" => Some(Self::Appdetails),
            "pics" => Some(Self::Pics),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlatformTriple {
    pub is_windows_native: bool,
    pub is_mac_native: bool,
    pub is_linux_native: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlatformWriteResolution {
    pub platforms: PlatformTriple,
    pub platforms_source: PlatformSource,
    pub platforms_captured_at: i64,
    pub accepted: bool,
}

fn plausible(value: Option<i64>, now: i64) -> Option<i64> {
    value.filter(|v| *v <= now.saturating_add(MAX_CLOCK_SKEW_MS))
}

/// Core of the rule, with the incoming stamp and `now` separate so the clamp is testable.
/// Strictly-newer complete existing capture wins; a tie goes to the incoming write; a legacy,
/// implausible or partial existing entry is writable by either source.
fn resolve_with(
    existing: Option<&SteamMetadataEntry>,
    incoming: PlatformTriple,
    source: PlatformSource,
    captured_at: i64,
    now: i64,
) -> PlatformWriteResolution {
    let existing_at = plausible(existing.and_then(|e| e.platforms_captured_at), now);
    let effective = plausible(Some(captured_at), now).unwrap_or(now);
    if let (Some(e), Some(ex_at)) = (existing, existing_at) {
        if ex_at > effective {
            if let (Some(w), Some(m), Some(l)) =
                (e.is_windows_native, e.is_mac_native, e.is_linux_native)
            {
                return PlatformWriteResolution {
                    platforms: PlatformTriple {
                        is_windows_native: w,
                        is_mac_native: m,
                        is_linux_native: l,
                    },
                    platforms_source: e
                        .platforms_source
                        .as_deref()
                        .and_then(PlatformSource::parse)
                        .unwrap_or(source),
                    platforms_captured_at: ex_at,
                    accepted: false,
                };
            }
        }
    }
    PlatformWriteResolution {
        platforms: incoming,
        platforms_source: source,
        platforms_captured_at: effective,
        accepted: true,
    }
}

/// `resolvePlatformWrite`: `now_ms` is both the incoming capture stamp and the clock.
pub fn resolve_platform_write(
    existing: Option<&SteamMetadataEntry>,
    incoming: PlatformTriple,
    source: PlatformSource,
    now_ms: i64,
) -> PlatformWriteResolution {
    resolve_with(existing, incoming, source, now_ms, now_ms)
}

/// `depotSignalCaptured`: the platforms fetch is flagged complete AND the Windows flag is present.
pub fn depot_signal_captured(entry: Option<&SteamMetadataEntry>) -> bool {
    entry.is_some_and(|e| e.platforms_captured == Some(true) && e.is_windows_native.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_000_000;
    const OLDER: i64 = NOW - 60_000;
    const NEWER: i64 = NOW + 60_000;
    const AD: PlatformTriple = PlatformTriple {
        is_windows_native: true,
        is_mac_native: true,
        is_linux_native: false,
    };
    const PICS: PlatformTriple = PlatformTriple {
        is_windows_native: true,
        is_mac_native: false,
        is_linux_native: true,
    };

    fn entry(t: PlatformTriple, src: Option<&str>, at: Option<i64>) -> SteamMetadataEntry {
        let mut e = SteamMetadataEntry::blank();
        e.is_windows_native = Some(t.is_windows_native);
        e.is_mac_native = Some(t.is_mac_native);
        e.is_linux_native = Some(t.is_linux_native);
        e.platforms_source = src.map(String::from);
        e.platforms_captured_at = at;
        e
    }

    #[test]
    fn pics_declines_strictly_newer_complete_appdetails() {
        let ex = entry(AD, Some("appdetails"), Some(NEWER));
        let r = resolve_platform_write(Some(&ex), PICS, PlatformSource::Pics, NOW);
        assert!(!r.accepted);
        assert_eq!(r.platforms, AD);
        assert_eq!(r.platforms_source, PlatformSource::Appdetails);
        assert_eq!(r.platforms_captured_at, NEWER);
    }

    #[test]
    fn appdetails_declines_strictly_newer_complete_pics() {
        let ex = entry(PICS, Some("pics"), Some(NEWER));
        let r = resolve_platform_write(Some(&ex), AD, PlatformSource::Appdetails, NOW);
        assert!(!r.accepted);
        assert_eq!(r.platforms, PICS);
        assert_eq!(r.platforms_source, PlatformSource::Pics);
        assert_eq!(r.platforms_captured_at, NEWER);
    }

    #[test]
    fn pics_wins_when_newer() {
        let ex = entry(AD, Some("appdetails"), Some(OLDER));
        let r = resolve_platform_write(Some(&ex), PICS, PlatformSource::Pics, NOW);
        assert!(r.accepted);
        assert_eq!(r.platforms, PICS);
        assert_eq!(r.platforms_source, PlatformSource::Pics);
        assert_eq!(r.platforms_captured_at, NOW);
    }

    #[test]
    fn appdetails_wins_when_newer() {
        let ex = entry(PICS, Some("pics"), Some(OLDER));
        let r = resolve_platform_write(Some(&ex), AD, PlatformSource::Appdetails, NOW);
        assert!(r.accepted);
        assert_eq!(r.platforms, AD);
        assert_eq!(r.platforms_source, PlatformSource::Appdetails);
        assert_eq!(r.platforms_captured_at, NOW);
    }

    #[test]
    fn tie_goes_to_incoming() {
        let ex = entry(AD, Some("appdetails"), Some(NOW));
        let r = resolve_platform_write(Some(&ex), PICS, PlatformSource::Pics, NOW);
        assert!(r.accepted);
        assert_eq!(r.platforms, PICS);
        assert_eq!(r.platforms_source, PlatformSource::Pics);
    }

    #[test]
    fn legacy_entry_without_stamp_is_writable_by_either_source() {
        for src in [PlatformSource::Pics, PlatformSource::Appdetails] {
            let ex = entry(AD, None, None);
            let r = resolve_platform_write(Some(&ex), PICS, src, NOW);
            assert!(r.accepted);
            assert_eq!(r.platforms_source, src);
            assert_eq!(r.platforms_captured_at, NOW);
        }
    }

    #[test]
    fn absent_existing_is_accepted() {
        assert!(resolve_platform_write(None, PICS, PlatformSource::Pics, NOW).accepted);
    }

    #[test]
    fn blank_existing_is_accepted() {
        let ex = SteamMetadataEntry::blank();
        assert!(resolve_platform_write(Some(&ex), PICS, PlatformSource::Pics, NOW).accepted);
    }

    #[test]
    fn corrupt_string_stamp_degrades_to_old() {
        let ex: SteamMetadataEntry = serde_json::from_value(json!({
            "art_cover": "", "art_square": "", "extra": {},
            "is_windows_native": true, "is_mac_native": true, "is_linux_native": false,
            "platformsSource": "appdetails", "platformsCapturedAt": "not-a-number"
        }))
        .unwrap();
        assert_eq!(ex.platforms_captured_at, None);
        assert!(resolve_platform_write(Some(&ex), PICS, PlatformSource::Pics, NOW).accepted);
    }

    #[test]
    fn newer_but_partial_triple_cannot_win() {
        let mut ex = entry(AD, Some("pics"), Some(NEWER));
        ex.is_mac_native = None;
        let r = resolve_platform_write(Some(&ex), AD, PlatformSource::Appdetails, NOW);
        assert!(r.accepted);
        assert_eq!(r.platforms, AD);
    }

    #[test]
    fn decline_without_recorded_source_falls_back_to_incoming() {
        let ex = entry(AD, None, Some(NEWER));
        let r = resolve_platform_write(Some(&ex), PICS, PlatformSource::Pics, NOW);
        assert!(!r.accepted);
        assert_eq!(r.platforms_source, PlatformSource::Pics);
    }

    #[test]
    fn newer_capture_beats_older_either_way_no_source_ranked() {
        let ex = entry(AD, Some("appdetails"), Some(NOW - 60_000));
        let r = resolve_platform_write(Some(&ex), PICS, PlatformSource::Pics, NOW);
        assert!(r.accepted && r.platforms == PICS);
        let ex = entry(PICS, Some("pics"), Some(NOW - 60_000));
        let r = resolve_platform_write(Some(&ex), AD, PlatformSource::Appdetails, NOW);
        assert!(r.accepted && r.platforms == AD);
    }

    #[test]
    fn poisoned_far_future_existing_stamp_loses_and_is_repaired() {
        for at in [i64::MAX, NOW + 10 * 365 * 24 * 60 * 60 * 1000] {
            let ex = entry(AD, Some("appdetails"), Some(at));
            let r = resolve_platform_write(Some(&ex), PICS, PlatformSource::Pics, NOW);
            assert!(r.accepted);
            assert_eq!(r.platforms, PICS);
            assert_eq!(r.platforms_captured_at, NOW);
        }
    }

    #[test]
    fn one_minute_of_skew_still_wins() {
        let ex = entry(AD, Some("appdetails"), Some(NOW + 60_000));
        let r = resolve_platform_write(Some(&ex), PICS, PlatformSource::Pics, NOW);
        assert!(!r.accepted);
        assert_eq!(r.platforms, AD);
        assert_eq!(r.platforms_captured_at, NOW + 60_000);
    }

    #[test]
    fn implausible_incoming_stamp_is_clamped_to_now() {
        let ex = entry(AD, Some("appdetails"), Some(NOW - 60_000));
        let r = resolve_with(Some(&ex), PICS, PlatformSource::Pics, i64::MAX, NOW);
        assert!(r.accepted);
        assert_eq!(r.platforms_captured_at, NOW);
    }

    #[test]
    fn depot_signal_requires_flag_and_windows_field() {
        assert!(!depot_signal_captured(None));
        let mut e = SteamMetadataEntry::blank();
        assert!(!depot_signal_captured(Some(&e)));
        e.platforms_captured = Some(true);
        assert!(!depot_signal_captured(Some(&e)), "residue shape");
        e.is_windows_native = Some(false);
        assert!(depot_signal_captured(Some(&e)), "false is a real answer");
        e.platforms_captured = Some(false);
        assert!(!depot_signal_captured(Some(&e)));
    }

    #[test]
    fn unknown_and_bridge_fields_round_trip() {
        let src = json!({
            "art_cover": "a", "art_square": "b", "extra": {"reqs": []},
            "bridge": {"scan": {"x": 1}, "userRoute": "bridge"},
            "forcedWindowsViaBottle": true,
            "futureField": 1, "nested": {"k": [1, 2]},
            "platformsCaptured": true, "metacriticCaptured": true
        });
        let e: SteamMetadataEntry = serde_json::from_value(src.clone()).unwrap();
        assert_eq!(e.rest.get("futureField"), Some(&json!(1)));
        assert_eq!(serde_json::to_value(&e).unwrap(), src);
    }

    #[test]
    fn absent_windows_flag_stays_absent() {
        let src = json!({"art_cover": "", "art_square": "", "extra": {"reqs": []}});
        let e: SteamMetadataEntry = serde_json::from_value(src.clone()).unwrap();
        assert_eq!(e.is_windows_native, None);
        let out = serde_json::to_value(&e).unwrap();
        assert!(out.get("is_windows_native").is_none());
        assert_eq!(out, src);
    }
}
