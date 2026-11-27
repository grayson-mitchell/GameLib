//! The Humble key classifier, ported from `src/backend/humble/classify.ts` (Phase 94, D-06).
//!
//! Pure: no clock, no I/O, no store, no logging. Every input, the time included, is passed in, so a
//! caller (the library port) owns the clock and the host's zone. Nothing here is wired to an op.
//!
//! Parity. The module is pinned to the vectors recorded from the TypeScript (94-06,
//! `tests/vectors_classify.rs`) and to the named tests of `classify.test.ts` at the bottom of this
//! file. Where JavaScript semantics matter they are spelled out: `new Date(string)` is
//! [`crate::js_date`], `Object.keys` order is [`crate::js_value::JsValue::keys`], and every regex
//! uses explicit ASCII classes (the crate builds `regex` without Unicode tables, so a Perl shorthand
//! class fails to compile instead of quietly matching a different set).
//!
//! Order data arrives as [`JsValue`], the order-preserving JSON the diagnostics need.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use regex::Regex;
use serde::{Deserialize, Serialize, Serializer};

use crate::js_date::{is_js_whitespace, local_midnight, parse_js_date, to_iso_string, LocalZone};
use crate::js_value::{js_number_to_string, JsValue};

/// Bumped when a classifier fix must reach cached rows (a version mismatch forces a re-fetch). The
/// TS constant in `constants.ts`; the vector manifest carries the same number.
pub const HUMBLE_CLASSIFIER_VERSION: u32 = 7;

/// Cap on field-name lists in the zero-key diagnosis: enough to recognise a stripped or drifted
/// response shape without an unbounded log line.
const MAX_DIAGNOSED_FIELDS: usize = 15;

const MS_PER_DAY: f64 = 86_400_000.0;

/// Candidate field names for an ABSOLUTE expiration date on a tpk, best evidence first.
const ABSOLUTE_EXPIRATION_FIELDS: [&str; 4] =
    ["expiry_date", "expiration_date", "expiration", "expires"];

/// The relative form: a count of days until the key expires.
const RELATIVE_EXPIRATION_DAYS_FIELD: &str = "num_days_until_expired";

/// Evidenced game-store `key_type` values. A protective override, not a whitelist: a known store
/// attests a key even when `direct_redeem` is true.
const KNOWN_GAME_KEY_TYPES: [&str; 10] = [
    "steam",
    "gog",
    "gog_keyless",
    "origin",
    "origin_keyless",
    "uplay",
    "epic",
    "epic_keyless",
    "battlenet",
    "nintendo_direct",
];

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

/// The five key states of `HumbleKeyState`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HumbleKeyState {
    Unpicked,
    Unrevealed,
    Revealed,
    Redeemed,
    Unredeemable,
}

/// `HumbleKey.matchConfidence`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchConfidence {
    Exact,
    Fuzzy,
    None,
}

/// One inventory key row (`HumbleKey`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HumbleKey {
    pub gamekey: String,
    pub machine_name: String,
    pub state: HumbleKeyState,
    pub title: String,
    pub platform: String,
    pub expiration: Option<String>,
    pub origin: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steam_app_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steam_app_id_resolved: Option<bool>,
    pub owned_elsewhere: bool,
    pub match_confidence: MatchConfidence,
}

/// A `keyindex` as the reveal endpoint reads it: a string or a number, kept as it arrived.
#[derive(Debug, Clone, PartialEq)]
pub enum KeyIndex {
    Text(String),
    Number(f64),
}

impl Serialize for KeyIndex {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            KeyIndex::Text(text) => serializer.serialize_str(text),
            // JSON.stringify writes an integral double without a fraction.
            KeyIndex::Number(n) if n.fract() == 0.0 && n.abs() < 9_007_199_254_740_992.0 => {
                serializer.serialize_i64(*n as i64)
            }
            KeyIndex::Number(n) => serializer.serialize_f64(*n),
        }
    }
}

/// `classifyOrder`'s return: the cache entry plus the two backend-only side channels. `keyindex` and
/// the revealed key value are NEVER placed on a [`HumbleKey`] (C4/T-14-02) and never logged (C5).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassifiedOrder {
    pub gamekey: String,
    pub keys: Vec<HumbleKey>,
    pub all_terminal: bool,
    pub freeze_eligible: bool,
    pub key_index_by_composite: BTreeMap<String, KeyIndex>,
    pub revealed_key_value_by_composite: BTreeMap<String, String>,
}

/// The already-derived signals of one tpk (`classifyTpk`'s first argument).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TpkSignals {
    pub redeemed_key_value_present: bool,
    pub expiration: Option<String>,
    #[serde(default)]
    pub is_expired: Option<bool>,
}

/// What `isFreezeEligible` reads of a key.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FreezeKey {
    pub state: HumbleKeyState,
    pub expiration: Option<String>,
    #[serde(default)]
    pub revealed_key_value_present: Option<bool>,
}

/// `describeZeroKeyOrder`'s redacted structural diagnosis.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ZeroKeyDiagnosis {
    /// True when the structure is UNEXPECTED for a zero-key order: `tpkd_dict` or `all_tpks` absent,
    /// null or mistyped, or a non-empty `all_tpks` whose entries should have classified but did not.
    /// False only for the legitimate exclusion shapes: an explicit empty `all_tpks` (a DRM-free
    /// order), or a non-empty array whose entries are all download entitlements.
    pub anomalous: bool,
    /// Structural summary: field NAMES, value TYPES and skip reasons only, never a value.
    pub detail: String,
}

/// The default of `isLocallyRedeemed`: nothing is locally redeemed.
pub fn never_redeemed(_gamekey: &str, _machine_name: &str) -> bool {
    false
}

// ---------------------------------------------------------------------------------------------
// State predicates
// ---------------------------------------------------------------------------------------------

/// Classifies one tpk's derived signals into exactly one of the five states.
///
/// Precedence is literal and intentional. Expiry (a past `expiration` OR the real API's
/// `is_expired` boolean) beats every other signal, even a retroactively expired local-redeemed
/// mark. `redeemed_key_value_present` means REVEALED, not REDEEMED: REDEEMED is a local-only
/// overlay, produced solely by the user's explicit "Mark as redeemed".
///
/// `new Date(tpk.expiration)` is read in `zone` when the string carries none of its own; the shell's
/// `zone` is `HumbleCtx::local_zone()`, which resolves it at the offset in force on that date.
pub fn classify_tpk(
    tpk: &TpkSignals,
    is_locally_revealed: bool,
    is_locally_redeemed: bool,
    now_ms: i64,
    zone: LocalZone<'_>,
) -> HumbleKeyState {
    let expired_by_date = tpk
        .expiration
        .as_deref()
        .filter(|e| !e.is_empty())
        .and_then(|e| parse_js_date(e, zone))
        .is_some_and(|t| t <= now_ms);
    if tpk.is_expired == Some(true) || expired_by_date {
        return HumbleKeyState::Unredeemable;
    }
    // The local overlay wins over mere revealed-ness.
    if is_locally_redeemed {
        return HumbleKeyState::Redeemed;
    }
    if tpk.redeemed_key_value_present || is_locally_revealed {
        return HumbleKeyState::Revealed;
    }
    HumbleKeyState::Unrevealed
}

/// "Terminal" for D-24 freeze eligibility (user-journey terminality).
pub fn is_terminal(state: HumbleKeyState) -> bool {
    matches!(
        state,
        HumbleKeyState::Redeemed | HumbleKeyState::Unredeemable
    )
}

/// Server-side terminality: REVEALED is also server-final, since Humble never un-populates a
/// revealed value.
pub fn is_server_terminal(state: HumbleKeyState) -> bool {
    matches!(
        state,
        HumbleKeyState::Revealed | HumbleKeyState::Redeemed | HumbleKeyState::Unredeemable
    )
}

/// The single-sourced freeze-eligibility predicate. A REVEALED key is freeze-eligible only with no
/// pending expiration AND a present value: a future expiry is only ever re-evaluated by a re-fetch,
/// and a flag-only REVEALED key depends on every-sync re-fetch for its reconciliation. REDEEMED and
/// UNREDEEMABLE keep their always-eligible behaviour.
pub fn is_freeze_eligible(key: &FreezeKey) -> bool {
    if !is_server_terminal(key.state) {
        return false;
    }
    if key.state == HumbleKeyState::Revealed {
        return key.expiration.is_none() && key.revealed_key_value_present == Some(true);
    }
    true
}

// ---------------------------------------------------------------------------------------------
// Key evidence
// ---------------------------------------------------------------------------------------------

/// D-29 key-evidence gate: a tpk becomes a key row only with a string `key_type`.
fn has_key_evidence(tpk: &JsValue) -> bool {
    matches!(tpk.get("key_type"), Some(JsValue::String(_)))
}

/// D-29 v2: `direct_redeem === true` (strict) AND a `key_type` that is not an evidenced game store
/// marks an auto-redeemed download/custom entitlement.
fn is_direct_redeem_entitlement(tpk: &JsValue) -> bool {
    let known_store = matches!(
        tpk.get("key_type"),
        Some(JsValue::String(t)) if KNOWN_GAME_KEY_TYPES.contains(&t.as_str())
    );
    tpk.get("direct_redeem") == Some(&JsValue::Bool(true)) && !known_store
}

/// A tpk is an inventory key row iff it carries key evidence AND is not a direct-redeem entitlement.
fn is_inventory_key_tpk(tpk: &JsValue) -> bool {
    has_key_evidence(tpk) && !is_direct_redeem_entitlement(tpk)
}

/// Redacted `key_type=<v> key_type_human_name=<v>` label pair: platform/type labels, never a key
/// value (C5).
fn tpk_type_labels(tpk: &JsValue) -> String {
    let key_type = tpk
        .get("key_type")
        .and_then(JsValue::as_str)
        .unwrap_or("absent");
    let human_name = tpk
        .get("key_type_human_name")
        .and_then(JsValue::as_str)
        .unwrap_or("absent");
    format!("key_type={key_type} key_type_human_name={human_name}")
}

// ---------------------------------------------------------------------------------------------
// Expiration
// ---------------------------------------------------------------------------------------------

/// A bare `YYYY-MM-DD` value (i31): `new Date('YYYY-MM-DD')` is UTC midnight, but the app shows it
/// in the host's zone, so a date-only value is anchored to LOCAL midnight instead. Explicit ASCII
/// classes; `$` (no multi-line flag) ends the haystack, like JavaScript's.
fn date_only_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new("^[0-9]{4}-[0-9]{2}-[0-9]{2}$").expect("a valid pattern"))
}

/// `value.trim() !== ''`.
fn is_blank(value: &str) -> bool {
    value.chars().all(is_js_whitespace)
}

/// Pure, tolerant expiration extraction. Reads whichever recognised field a live tpk carries and
/// normalises it to an ISO-8601 string:
/// - an absolute date string (any of [`ABSOLUTE_EXPIRATION_FIELDS`]), parsed as `new Date(value)`
///   and re-emitted as ISO; an unparseable string is ignored. A bare date-only value is anchored to
///   LOCAL midnight (i31); a value carrying a time and/or zone round-trips unchanged;
/// - a relative, strictly positive `num_days_until_expired` number: `now + N days` as ISO (0 or
///   negative means "no expiry window").
///
/// `zone` is the host zone, the shell's being `HumbleCtx::local_zone()`, which resolves every zone-less or
/// date-only value at its own date's offset.
///
/// `None` when no recognised, parseable expiration is present. Never panics.
pub fn extract_expiration(tpk: &JsValue, now_ms: i64, zone: LocalZone<'_>) -> Option<String> {
    for field in ABSOLUTE_EXPIRATION_FIELDS {
        let Some(JsValue::String(value)) = tpk.get(field) else {
            continue;
        };
        if is_blank(value) {
            continue;
        }
        // `new Date(value)` stays the ONE validity gate: building from parts cannot double as
        // validation (`new Date(2026, 12, 45)` rolls over where `'2026-13-45'` is invalid). The
        // pattern is matched against `value` unmodified, so a whitespace-padded date is parsed as
        // local time by the parser (already correct) and not re-anchored.
        let Some(parsed) = parse_js_date(value, zone) else {
            continue;
        };
        if date_only_re().is_match(value) {
            let mut parts = value.split('-').map(|p| p.parse::<i64>().ok());
            if let (Some(Some(year)), Some(Some(month)), Some(Some(day))) =
                (parts.next(), parts.next(), parts.next())
            {
                if let Some(iso) =
                    local_midnight(year, month - 1, day, zone).and_then(to_iso_string)
                {
                    return Some(iso);
                }
            }
        }
        return to_iso_string(parsed);
    }
    if let Some(JsValue::Number(days)) = tpk.get(RELATIVE_EXPIRATION_DAYS_FIELD) {
        if days.is_finite() && *days > 0.0 {
            // WR-02: a drifted day count past the Date range is not a date; validate the candidate
            // before serialising.
            if let Some(iso) =
                crate::js_date::time_clip(now_ms as f64 + days * MS_PER_DAY).and_then(to_iso_string)
            {
                return Some(iso);
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------------------------
// classifyOrder
// ---------------------------------------------------------------------------------------------

/// A property of a product/order that is a string, or absent. A non-string there is outside the
/// contract (the adapter's schema allows only a string or nullish) and is treated as absent.
fn str_prop<'a>(value: Option<&'a JsValue>, key: &str) -> Option<&'a str> {
    value.and_then(|v| v.get(key)).and_then(JsValue::as_str)
}

/// `tpk.redeemed_key_val ?? tpk.redeemed_key_value`.
fn redeemed_value(tpk: &JsValue) -> Option<&JsValue> {
    tpk.get_non_null("redeemed_key_val")
        .or_else(|| tpk.get_non_null("redeemed_key_value"))
}

/// The `all_tpks` of an order, empty when the order has none (or it is not an array).
fn all_tpks(order: &JsValue) -> &[JsValue] {
    match order.get("tpkd_dict").and_then(|d| d.get("all_tpks")) {
        Some(JsValue::Array(items)) => items,
        _ => &[],
    }
}

/// Classifies an entire fresh order-detail response into a cache-ready entry.
///
/// `raw_order` must always be the freshly fetched response, never a cached record merged forward.
/// The only locally carried-forward state is the two predicates: `is_revealed` is keyed by machine
/// name, `is_locally_redeemed` by `(gamekey, machine_name)` (the composite key).
///
/// `zone` is the host zone, the shell's being `HumbleCtx::local_zone()`, which resolves every zone-less or
/// date-only value at its own date's offset. The library port passes exactly that.
pub fn classify_order(
    raw_order: &JsValue,
    is_revealed: impl Fn(&str) -> bool,
    now_ms: i64,
    zone: LocalZone<'_>,
    is_locally_redeemed: impl Fn(&str, &str) -> bool,
) -> ClassifiedOrder {
    let gamekey = str_prop(Some(raw_order), "gamekey")
        .unwrap_or("")
        .to_string();
    let mut key_index_by_composite: BTreeMap<String, KeyIndex> = BTreeMap::new();
    let mut revealed_key_value_by_composite: BTreeMap<String, String> = BTreeMap::new();
    // Only an object can be a product (anything else reads as absent).
    let raw_product = raw_order
        .get("product")
        .filter(|p| matches!(p, JsValue::Object(_)));
    let order_label: String = str_prop(Some(raw_order), "human_name")
        .or_else(|| str_prop(raw_product, "human_name"))
        .unwrap_or(&gamekey)
        .to_string();

    let mut keys: Vec<HumbleKey> = Vec::new();

    for raw_tpk in all_tpks(raw_order) {
        // T-11-05: a malformed or partial entry never aborts the loop; other tpks still classify.
        if !raw_tpk.is_truthy() || !raw_tpk.is_object_like() {
            continue;
        }
        let tpk = raw_tpk;
        // D-29 (rounds 5 and 6): no key_type, or a direct-redeem entitlement signature, is no row.
        if !is_inventory_key_tpk(tpk) {
            continue;
        }
        let machine_name = match tpk.get("machine_name") {
            Some(JsValue::String(name)) => name.clone(),
            _ => format!("{gamekey}:{}", keys.len()),
        };
        // Truthiness on purpose: for some non-Steam key types the redeemed value is an OBJECT.
        let redeemed_key_value_present = redeemed_value(tpk).is_some_and(JsValue::is_truthy);
        let expiration = extract_expiration(tpk, now_ms, zone);
        // Strict `=== true` so a mistyped value never expires a live key by accident.
        let is_expired = tpk.get("is_expired") == Some(&JsValue::Bool(true));
        let locally_redeemed = is_locally_redeemed(&gamekey, &machine_name);
        let state = classify_tpk(
            &TpkSignals {
                redeemed_key_value_present,
                expiration: expiration.clone(),
                is_expired: Some(is_expired),
            },
            is_revealed(&machine_name),
            locally_redeemed,
            now_ms,
            zone,
        );
        let composite = format!("{gamekey}:{machine_name}");
        // HCLAIM-01: the reveal endpoint's third form field, into the backend-only side channel.
        match tpk.get("keyindex") {
            Some(JsValue::String(s)) => {
                key_index_by_composite.insert(composite.clone(), KeyIndex::Text(s.clone()));
            }
            Some(JsValue::Number(n)) => {
                key_index_by_composite.insert(composite.clone(), KeyIndex::Number(*n));
            }
            _ => {}
        }
        // CR-01: the server-side revealed value, strings only and non-empty; an OBJECT-shaped value
        // is deliberately omitted.
        if let Some(JsValue::String(value)) = redeemed_value(tpk) {
            if !value.is_empty() {
                revealed_key_value_by_composite.insert(composite, value.clone());
            }
        }
        // D-28: the platform label is the key_type, for ANY platform. Guaranteed a string here.
        let platform = tpk
            .get("key_type")
            .and_then(JsValue::as_str)
            .unwrap_or_default()
            .to_string();
        let title = match tpk.get("human_name") {
            Some(JsValue::String(name)) => name.clone(),
            _ => order_label.clone(),
        };
        // HDEDUP-02: the Steam AppID the live tpk carries, for platform steam only, stringified; any
        // other shape yields none.
        let steam_app_id = if platform == "steam" {
            match tpk.get("steam_app_id") {
                Some(JsValue::String(s)) => Some(s.clone()),
                Some(JsValue::Number(n)) => Some(js_number_to_string(*n)),
                _ => None,
            }
        } else {
            None
        };
        keys.push(HumbleKey {
            gamekey: gamekey.clone(),
            machine_name,
            state,
            title,
            platform,
            expiration,
            origin: order_label.clone(),
            steam_app_id,
            steam_app_id_resolved: None,
            // The overlay fields default here; dedup fills them in.
            owned_elsewhere: false,
            match_confidence: MatchConfidence::None,
        });
    }

    // D-27: an unpicked Humble Choice month is a single UNPICKED pseudo-entry at the product level,
    // only when no tpks were allocated at all.
    if keys.is_empty() {
        if let Some(product) = raw_product {
            let is_choice = str_prop(Some(product), "category") == Some("subscriptioncontent")
                && product.get("choice_url").is_some_and(JsValue::is_truthy);
            if is_choice {
                // WR-07: the deadline goes through the SAME tolerant helper as every tpk expiration,
                // so an unparseable value degrades to none.
                let deadline = match product.get("deadline_date") {
                    Some(JsValue::String(raw)) => extract_expiration(
                        &JsValue::object_of(vec![("expiry_date", JsValue::String(raw.clone()))]),
                        now_ms,
                        zone,
                    ),
                    _ => None,
                };
                keys.push(HumbleKey {
                    gamekey: gamekey.clone(),
                    machine_name: format!("{gamekey}:unpicked"),
                    state: HumbleKeyState::Unpicked,
                    title: str_prop(Some(product), "human_name")
                        .unwrap_or(&order_label)
                        .to_string(),
                    platform: "humble-choice".to_string(),
                    expiration: deadline,
                    origin: order_label.clone(),
                    steam_app_id: None,
                    steam_app_id_resolved: None,
                    owned_elsewhere: false,
                    match_confidence: MatchConfidence::None,
                });
            }
        }
    }
    // D-29: no key-evidenced tpks and no subscriptioncontent product (a DRM-free-only entitlement
    // order) leaves `keys` empty.

    let all_terminal = !keys.is_empty() && keys.iter().all(|k| is_terminal(k.state));
    // 14-08: server-side terminality, computed through the single-sourced predicate. The value
    // signal is the STRING side channel, the same one library.ts persists, so a non-Steam key whose
    // server value is an OBJECT never freezes and keeps re-fetching (a residual re-fetch, never a
    // stranded key).
    let freeze_eligible = !keys.is_empty()
        && keys.iter().all(|k| {
            is_freeze_eligible(&FreezeKey {
                state: k.state,
                expiration: k.expiration.clone(),
                revealed_key_value_present: Some(
                    revealed_key_value_by_composite
                        .contains_key(&format!("{gamekey}:{}", k.machine_name)),
                ),
            })
        });

    ClassifiedOrder {
        gamekey,
        keys,
        all_terminal,
        freeze_eligible,
        key_index_by_composite,
        revealed_key_value_by_composite,
    }
}

// ---------------------------------------------------------------------------------------------
// Diagnostics (redacted: field NAMES and TYPES, never a value)
// ---------------------------------------------------------------------------------------------

/// `[a,b,c,+N more]` over at most [`MAX_DIAGNOSED_FIELDS`] names.
fn field_names(value: &JsValue) -> String {
    let names = value.keys();
    let shown = names
        .iter()
        .take(MAX_DIAGNOSED_FIELDS)
        .cloned()
        .collect::<Vec<_>>()
        .join(",");
    let suffix = if names.len() > MAX_DIAGNOSED_FIELDS {
        format!(",+{} more", names.len() - MAX_DIAGNOSED_FIELDS)
    } else {
        String::new()
    };
    format!("[{shown}{suffix}]")
}

/// `null` or `absent` for a missing/null property.
fn null_or_absent(value: Option<&JsValue>) -> &'static str {
    if matches!(value, Some(JsValue::Null)) {
        "null"
    } else {
        "absent"
    }
}

/// Pure, fully redacted structural diagnosis for an order that classified to ZERO keys. Reports only
/// structure: field NAMES, value TYPES, array lengths and per-element skip reasons. NEVER a field
/// value, key value or cookie (C5/T-11-04).
pub fn describe_zero_key_order(raw_order: &JsValue) -> ZeroKeyDiagnosis {
    let tpkd_dict = raw_order.get("tpkd_dict");
    let tpkd_dict = match tpkd_dict {
        None | Some(JsValue::Null) => {
            return ZeroKeyDiagnosis {
                anomalous: true,
                detail: format!(
                    "tpkd_dict={} order_fields={}",
                    null_or_absent(tpkd_dict),
                    field_names(raw_order)
                ),
            };
        }
        Some(dict) => dict,
    };
    if !tpkd_dict.is_object_like() {
        return ZeroKeyDiagnosis {
            anomalous: true,
            detail: format!(
                "tpkd_dict=non-object({}) order_fields={}",
                tpkd_dict.type_of(),
                field_names(raw_order)
            ),
        };
    }

    let raw_all_tpks = tpkd_dict.get("all_tpks");
    let items = match raw_all_tpks {
        None | Some(JsValue::Null) => {
            return ZeroKeyDiagnosis {
                anomalous: true,
                detail: format!(
                    "tpkd_dict.all_tpks={} tpkd_dict_fields={}",
                    null_or_absent(raw_all_tpks),
                    field_names(tpkd_dict)
                ),
            };
        }
        Some(JsValue::Array(items)) => items,
        Some(other) => {
            return ZeroKeyDiagnosis {
                anomalous: true,
                detail: format!(
                    "tpkd_dict.all_tpks=non-array({}) tpkd_dict_fields={}",
                    other.type_of(),
                    field_names(tpkd_dict)
                ),
            };
        }
    };

    if items.is_empty() {
        // The one legitimate zero-key shape (a DRM-free order; an unpicked month is handled by the
        // UNPICKED branch).
        return ZeroKeyDiagnosis {
            anomalous: false,
            detail: "tpkd_dict.all_tpks=array(0)".to_string(),
        };
    }

    // A non-empty tpk array that still yielded zero keys: name the check each element failed.
    let skipped: Vec<String> = items
        .iter()
        .take(MAX_DIAGNOSED_FIELDS)
        .enumerate()
        .map(|(index, element)| {
            if !element.is_truthy() || !element.is_object_like() {
                let kind = if matches!(element, JsValue::Null) {
                    "null"
                } else {
                    element.type_of()
                };
                return format!("[{index}]:non-object({kind})");
            }
            if !matches!(element.get("key_type"), Some(JsValue::String(_))) {
                return format!("[{index}]:no-key_type(fields={})", field_names(element));
            }
            if is_direct_redeem_entitlement(element) {
                return format!(
                    "[{index}]:direct-redeem-entitlement({})",
                    tpk_type_labels(element)
                );
            }
            // An inventory-key element should have classified; the defensive catch fired.
            format!(
                "[{index}]:object-skipped-by-defensive-catch fields={}",
                field_names(element)
            )
        })
        .collect();
    // A non-empty array whose entries are ALL download entitlements is the legitimate zero-key shape
    // (a PDF/ebook bundle excluded per D-29). Checked over the FULL array, not the capped slice.
    let all_download_entitlements = items
        .iter()
        .all(|e| !matches!(e, JsValue::Null) && e.is_object_like() && !is_inventory_key_tpk(e));
    ZeroKeyDiagnosis {
        anomalous: !all_download_entitlements,
        detail: format!(
            "tpkd_dict.all_tpks=array({}) skipped=[{}]",
            items.len(),
            skipped.join(" ")
        ),
    }
}

/// Redacted skipped-entitlement diagnosis for orders that DID produce keys: the count of tpks
/// skipped for no `key_type` or as direct-redeem entitlements, with per-entry field names (or the
/// type labels for a direct-redeem skip). `None` when nothing was skipped.
pub fn describe_skipped_entitlements(raw_order: &JsValue) -> Option<String> {
    let mut skipped: Vec<String> = Vec::new();
    let mut no_key_type = 0usize;
    let mut direct_redeem = 0usize;

    for (index, raw_tpk) in all_tpks(raw_order).iter().enumerate() {
        if !raw_tpk.is_truthy() || !raw_tpk.is_object_like() {
            continue;
        }
        if !matches!(raw_tpk.get("key_type"), Some(JsValue::String(_))) {
            no_key_type += 1;
            if skipped.len() < MAX_DIAGNOSED_FIELDS {
                skipped.push(format!(
                    "[{index}]:no-key_type(fields={})",
                    field_names(raw_tpk)
                ));
            }
            continue;
        }
        if is_direct_redeem_entitlement(raw_tpk) {
            direct_redeem += 1;
            if skipped.len() < MAX_DIAGNOSED_FIELDS {
                skipped.push(format!(
                    "[{index}]:direct-redeem-entitlement({})",
                    tpk_type_labels(raw_tpk)
                ));
            }
        }
    }

    if no_key_type + direct_redeem == 0 {
        return None;
    }
    Some(format!(
        "skippedNoKeyType={no_key_type} skippedDirectRedeem={direct_redeem} skipped=[{}]",
        skipped.join(" ")
    ))
}

/// Redacted expiration-field discovery diagnosis: for the tpks we still could NOT date AND whose
/// `is_expired` is not already `true`, the DISTINCT field NAMES present on those tpks. Names only,
/// never values. `None` when every tpk was datable or already expired.
pub fn describe_missing_expiration_tpks(
    raw_order: &JsValue,
    now_ms: i64,
    zone: LocalZone<'_>,
) -> Option<String> {
    let mut names: Vec<String> = Vec::new();
    let mut missing = 0usize;

    for raw_tpk in all_tpks(raw_order) {
        if !raw_tpk.is_truthy() || !raw_tpk.is_object_like() {
            continue;
        }
        // Download entitlements are not keys, so an undatable one is not a "No expiration" bug.
        if !is_inventory_key_tpk(raw_tpk) {
            continue;
        }
        // Already-expired keys classify correctly without a date.
        if raw_tpk.get("is_expired") == Some(&JsValue::Bool(true)) {
            continue;
        }
        if extract_expiration(raw_tpk, now_ms, zone).is_some() {
            continue;
        }
        missing += 1;
        for name in raw_tpk.keys() {
            if !names.contains(&name) {
                names.push(name);
            }
        }
    }

    if missing == 0 {
        return None;
    }
    let shown = names
        .iter()
        .take(MAX_DIAGNOSED_FIELDS)
        .cloned()
        .collect::<Vec<_>>()
        .join(",");
    let suffix = if names.len() > MAX_DIAGNOSED_FIELDS {
        format!(",+{} more", names.len() - MAX_DIAGNOSED_FIELDS)
    } else {
        String::new()
    };
    Some(format!(
        "tpksMissingExpiration={missing} candidateFields=[{shown}{suffix}]"
    ))
}

// ---------------------------------------------------------------------------------------------
// The TypeScript oracle, carried over (D-06)
// ---------------------------------------------------------------------------------------------
//
// `src/backend/humble/__tests__/classify.test.ts` is deleted in 94-30, so its meaning lives here: one
// module per `describe`, one test per `test(...)`, named after the TS title (the full title is in
// the doc comment). The order fixtures of `__tests__/fixtures/tpks.ts` are not retyped. Each is read
// from the recorded golden of its `plain` variant (`input.order`), which holds the fixture as the TS
// ran it with key values redacted before the run, so a fixture's key value is the string `REDACTED`.
//
// A TS call without a clock reads the real `Date.now()`; here every such call is pinned to the
// suite's own `NOW` (2026-07-06), and a call without a zone reads UTC.

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The `NOW` the TS suite passes explicitly; calls that default to the wall clock use it too.
    const SUITE_NOW: &str = "2026-07-06T00:00:00Z";

    fn at(iso: &str) -> i64 {
        parse_js_date(iso, LocalZone::UTC).expect("a valid instant")
    }

    fn now() -> i64 {
        at(SUITE_NOW)
    }

    fn js(text: &str) -> JsValue {
        serde_json::from_str(text).expect("valid JSON")
    }

    fn j(value: serde_json::Value) -> JsValue {
        JsValue::from(&value)
    }

    /// `someOrderName` -> `some-order-name`, as the recorder names its cases.
    fn kebab(name: &str) -> String {
        let mut out = String::new();
        let mut previous_lower = false;
        for c in name.chars() {
            if c.is_ascii_uppercase() && previous_lower {
                out.push('-');
            }
            out.push(c.to_ascii_lowercase());
            previous_lower = c.is_ascii_lowercase() || c.is_ascii_digit();
        }
        out
    }

    /// A fixture of `tpks.ts` by its TS name, from the recorded golden.
    fn fixture(ts_name: &str) -> JsValue {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/golden/classify")
            .join(format!("classify-order-{}-plain.json", kebab(ts_name)));
        let text = std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("fixture {ts_name} ({}): {e}", path.display()));
        let case: JsValue = serde_json::from_str(&text).expect("a golden");
        case.get("input")
            .and_then(|i| i.get("order"))
            .cloned()
            .expect("a classifyOrder golden carries input.order")
    }

    /// Sets the value at `path` (a segment that is an array index indexes an array).
    fn set_in(target: &mut JsValue, path: &[&str], new: JsValue) {
        let Some((head, rest)) = path.split_first() else {
            *target = new;
            return;
        };
        match target {
            JsValue::Array(items) => {
                let index: usize = head.parse().expect("an array index");
                set_in(&mut items[index], rest, new);
            }
            JsValue::Object(entries) => {
                if let Some((_, v)) = entries.iter_mut().find(|(k, _)| k == head) {
                    set_in(v, rest, new);
                } else {
                    let mut fresh = JsValue::Null;
                    set_in(&mut fresh, rest, new);
                    entries.push((head.to_string(), fresh));
                }
            }
            _ => panic!("cannot descend into a scalar"),
        }
    }

    fn never_revealed(_: &str) -> bool {
        false
    }

    fn always_revealed(_: &str) -> bool {
        true
    }

    fn classify(order: &JsValue, revealed: impl Fn(&str) -> bool) -> ClassifiedOrder {
        classify_order(order, revealed, now(), LocalZone::UTC, never_redeemed)
    }

    fn classify_at(
        order: &JsValue,
        revealed: impl Fn(&str) -> bool,
        now_ms: i64,
    ) -> ClassifiedOrder {
        classify_order(order, revealed, now_ms, LocalZone::UTC, never_redeemed)
    }

    fn signals(present: bool, expiration: Option<&str>, expired: Option<bool>) -> TpkSignals {
        TpkSignals {
            redeemed_key_value_present: present,
            expiration: expiration.map(str::to_string),
            is_expired: expired,
        }
    }

    fn tpk_state(
        tpk: &TpkSignals,
        revealed: bool,
        redeemed: bool,
        now_iso: &str,
    ) -> HumbleKeyState {
        classify_tpk(tpk, revealed, redeemed, at(now_iso), LocalZone::UTC)
    }

    fn extract(tpk: &JsValue) -> Option<String> {
        extract_expiration(tpk, now(), LocalZone::UTC)
    }

    fn first(entry: &ClassifiedOrder) -> &HumbleKey {
        entry.keys.first().expect("entry.keys[0]")
    }

    fn freeze(state: HumbleKeyState, expiration: Option<&str>, present: Option<bool>) -> bool {
        is_freeze_eligible(&FreezeKey {
            state,
            expiration: expiration.map(str::to_string),
            revealed_key_value_present: present,
        })
    }

    /// The fixed-offset zones the date-only anchoring is proven in: UTC, one west, one east.
    fn zones() -> [LocalZone<'static>; 3] {
        [
            LocalZone::UTC,
            LocalZone::from_east_secs(-7 * 3600),
            LocalZone::from_east_secs(5 * 3600 + 1800),
        ]
    }

    /// The calendar date `iso` shows in `zone` (what `getFullYear`, `getMonth` and `getDate` read).
    fn local_date(iso: &str, zone: LocalZone<'_>) -> (i32, i32, i32) {
        let shifted = to_iso_string(at(iso) + i64::from(zone.offset_east_secs_at(at(iso))) * 1000)
            .expect("in range");
        (
            shifted[0..4].parse().expect("year"),
            shifted[5..7].parse().expect("month"),
            shifted[8..10].parse().expect("day"),
        )
    }

    /// The sentinel the C5 tests plant where the recorded fixture has `REDACTED`.
    const LEAK: &str = "ENTITLEMENT-VALUE-MUST-NOT-LEAK";

    fn with_entitlement_value(mut order: JsValue, tpk_index: &str) -> JsValue {
        set_in(
            &mut order,
            &["tpkd_dict", "all_tpks", tpk_index, "redeemed_key_val"],
            JsValue::String(LEAK.to_string()),
        );
        order
    }

    mod classify_tpk_precedence {
        use super::*;
        const T: &str = "2026-01-01T00:00:00Z";

        /// expiration in the past -> UNREDEEMABLE, beats every other signal
        #[test]
        fn expiration_in_the_past_is_unredeemable_and_beats_every_other_signal() {
            let s = signals(true, Some("2020-01-01T00:00:00Z"), None);
            assert_eq!(tpk_state(&s, true, false, T), HumbleKeyState::Unredeemable);
        }

        /// 14-07 gap closure: redeemedKeyValuePresent true, no past expiration, not locally redeemed
        /// -> REVEALED (server redeemed_key_val means revealed, not redeemed)
        #[test]
        fn a_server_value_with_no_local_mark_is_revealed_not_redeemed() {
            let s = signals(true, None, None);
            assert_eq!(tpk_state(&s, true, false, T), HumbleKeyState::Revealed);
        }

        /// isLocallyRevealed true, not redeemed, not expired -> REVEALED
        #[test]
        fn locally_revealed_is_revealed() {
            let s = signals(false, None, None);
            assert_eq!(tpk_state(&s, true, false, T), HumbleKeyState::Revealed);
        }

        /// none of the above -> UNREVEALED (default)
        #[test]
        fn none_of_the_above_is_unrevealed() {
            let s = signals(false, None, None);
            assert_eq!(tpk_state(&s, false, false, T), HumbleKeyState::Unrevealed);
        }

        /// future expiration does not classify UNREDEEMABLE
        #[test]
        fn a_future_expiration_does_not_classify_unredeemable() {
            let s = signals(false, Some("2099-01-01T00:00:00Z"), None);
            assert_eq!(tpk_state(&s, false, false, T), HumbleKeyState::Unrevealed);
        }

        /// D-77: isLocallyRedeemed true, not server-redeemed, not expired -> REDEEMED
        #[test]
        fn locally_redeemed_is_redeemed() {
            let s = signals(false, None, None);
            assert_eq!(tpk_state(&s, false, true, T), HumbleKeyState::Redeemed);
        }

        /// 14-07 gap closure: isLocallyRedeemed beats redeemedKeyValuePresent (local mark wins over
        /// server-revealed value)
        #[test]
        fn the_local_redeemed_mark_beats_a_server_revealed_value() {
            let s = signals(true, None, None);
            assert_eq!(tpk_state(&s, false, true, T), HumbleKeyState::Redeemed);
        }

        /// D-77: expiry beats isLocallyRedeemed (a retroactively-expired local mark reclassifies
        /// UNREDEEMABLE)
        #[test]
        fn expiry_beats_the_local_redeemed_mark() {
            let s = signals(false, Some("2020-01-01T00:00:00Z"), None);
            assert_eq!(tpk_state(&s, false, true, T), HumbleKeyState::Unredeemable);
        }

        /// D-77: isLocallyRedeemed beats isLocallyRevealed (both true -> REDEEMED, not REVEALED)
        #[test]
        fn the_local_redeemed_mark_beats_the_local_revealed_flag() {
            let s = signals(false, None, None);
            assert_eq!(tpk_state(&s, true, true, T), HumbleKeyState::Redeemed);
        }
    }

    mod classify_order_basics {
        use super::*;

        /// D-27: unpicked Choice month -> single UNPICKED pseudo-entry
        #[test]
        fn an_unpicked_choice_month_is_a_single_unpicked_pseudo_entry() {
            let entry = classify(&fixture("unpickedChoiceMonthOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unpicked);
            assert!(!entry.all_terminal);
        }

        /// WR-07: a parseable deadline_date is ISO-normalized on the UNPICKED pseudo-entry
        #[test]
        fn a_parseable_deadline_is_iso_normalized_on_the_unpicked_pseudo_entry() {
            let entry = classify(&fixture("unpickedChoiceMonthOrder"), never_revealed);
            assert_eq!(
                first(&entry).expiration.as_deref(),
                Some("2026-03-31T23:59:59.000Z")
            );
        }

        /// WR-07: an unparseable deadline_date degrades to null (no "Invalid Date" render, no NaN
        /// sort), never throws
        #[test]
        fn an_unparseable_deadline_degrades_to_none() {
            let mut drifted = fixture("unpickedChoiceMonthOrder");
            set_in(
                &mut drifted,
                &["product", "deadline_date"],
                JsValue::String("March 31st, whenever".to_string()),
            );
            let entry = classify(&drifted, never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unpicked);
            assert_eq!(first(&entry).expiration, None);
        }

        /// i31: a bare date-only deadline_date on the UNPICKED pseudo-entry anchors to LOCAL midnight
        /// (WR-07 routing extends the fix here for free)
        #[test]
        fn a_bare_date_only_deadline_anchors_to_local_midnight() {
            let mut bare = fixture("unpickedChoiceMonthOrder");
            set_in(
                &mut bare,
                &["product", "deadline_date"],
                JsValue::String("2026-03-31".to_string()),
            );
            for zone in zones() {
                let entry = classify_order(&bare, never_revealed, now(), zone, never_redeemed);
                assert_eq!(entry.keys.len(), 1);
                assert_eq!(first(&entry).state, HumbleKeyState::Unpicked);
                let iso = first(&entry).expiration.as_deref().expect("a deadline");
                assert_eq!(local_date(iso, zone), (2026, 3, 31));
            }
        }

        /// 261128-22q: under a host zone the deadline takes its own date's offset (December is EST even
        /// though the suite's "now" is July).
        #[test]
        fn a_date_only_deadline_under_a_host_zone_takes_its_own_dates_offset() {
            use crate::js_date::test_zones::NewYork2026;
            let mut bare = fixture("unpickedChoiceMonthOrder");
            set_in(
                &mut bare,
                &["product", "deadline_date"],
                JsValue::String("2026-12-15".to_string()),
            );
            let zone = LocalZone::host(&NewYork2026);
            let entry = classify_order(&bare, never_revealed, now(), zone, never_redeemed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unpicked);
            assert_eq!(
                first(&entry).expiration.as_deref(),
                Some("2026-12-15T05:00:00.000Z")
            );
        }

        /// D-27: unpicked Choice month missing choice_url -> never throws, omits pseudo-entry
        #[test]
        fn an_unpicked_month_missing_choice_url_omits_the_pseudo_entry() {
            let entry = classify(
                &fixture("unpickedChoiceMonthMissingUrlOrder"),
                never_revealed,
            );
            assert_eq!(entry.keys.len(), 0);
        }

        /// UNREVEALED tpk classifies UNREVEALED when not locally revealed
        #[test]
        fn an_unrevealed_tpk_classifies_unrevealed() {
            let entry = classify(&fixture("unrevealedOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
            assert!(!entry.all_terminal);
        }

        /// HSYNC-02: revealed-flag + no redeemed value -> REVEALED, survives being read from an
        /// external store lookup
        #[test]
        fn a_revealed_flag_with_no_redeemed_value_is_revealed() {
            let entry = classify(&fixture("revealedViaFlagOrder"), |m| {
                m == "anothergame_steam"
            });
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Revealed);
        }

        /// 14-07 gap closure: redeemed_key_value present -> REVEALED, not REDEEMED (server truth
        /// means revealed only)
        #[test]
        fn a_redeemed_key_value_is_revealed_not_redeemed() {
            let entry = classify(&fixture("redeemedOrder"), always_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Revealed);
            assert!(!entry.all_terminal);
        }

        /// past expiration -> UNREDEEMABLE even when redeemedKeyValuePresent is true
        #[test]
        fn a_past_expiration_is_unredeemable_even_with_a_redeemed_value() {
            let entry = classify(&fixture("unredeemableOrder"), always_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unredeemable);
            assert!(entry.all_terminal);
        }

        /// T-11-05: a malformed tpk entry is skipped, other tpks in the same order still classify
        #[test]
        fn a_malformed_tpk_is_skipped_and_the_others_still_classify() {
            let entry = classify(&fixture("malformedTpkOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
        }

        /// HSYNC-03: a cached tpk without expiration, re-classified with a newly-added expiration,
        /// returns UNREDEEMABLE
        #[test]
        fn a_newly_added_expiration_reclassifies_the_tpk_unredeemable() {
            let first_sync = classify(&fixture("resyncTpkFirstSync"), never_revealed);
            assert_eq!(first(&first_sync).state, HumbleKeyState::Unrevealed);
            // classifyOrder always reads the FRESH raw response, never a previous cache entry.
            let second_sync = classify(&fixture("resyncTpkSecondSync"), never_revealed);
            assert_eq!(first(&second_sync).state, HumbleKeyState::Unredeemable);
        }

        /// D-28: a non-Steam key_type classifies through the same precedence and carries its own
        /// platform label
        #[test]
        fn a_non_steam_key_type_carries_its_own_platform_label() {
            let entry = classify(&fixture("nonSteamPlatformOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
            assert_eq!(first(&entry).platform, "gog");
        }

        /// D-29: a DRM-free-only order (no tpks, no subscriptioncontent product) yields zero
        /// HumbleKey entries
        #[test]
        fn a_drm_free_only_order_yields_zero_keys() {
            let entry = classify(&fixture("drmFreeOnlyOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 0);
            assert!(!entry.all_terminal);
        }
    }

    mod classify_tpk_real_world_is_expired_flag {
        use super::*;
        const T: &str = "2026-01-01T00:00:00Z";

        /// isExpired true -> UNREDEEMABLE, beats redeemed and local reveal (D-30 precedence)
        #[test]
        fn is_expired_true_is_unredeemable_and_beats_redeemed_and_local_reveal() {
            let s = signals(true, None, Some(true));
            assert_eq!(tpk_state(&s, true, false, T), HumbleKeyState::Unredeemable);
        }

        /// isExpired false with no expiration does not classify UNREDEEMABLE
        #[test]
        fn is_expired_false_with_no_expiration_is_not_unredeemable() {
            let s = signals(false, None, Some(false));
            assert_eq!(tpk_state(&s, false, false, T), HumbleKeyState::Unrevealed);
        }
    }

    mod classify_order_real_world_payload_shapes {
        use super::*;

        /// direct purchase (real field set, no redeemed_key_val) -> 1 UNREVEALED steam key
        #[test]
        fn a_direct_purchase_is_one_unrevealed_steam_key() {
            let entry = classify(&fixture("realWorldUnrevealedPurchaseOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
            assert_eq!(first(&entry).platform, "steam");
            assert_eq!(first(&entry).machine_name, "directgame_steam");
        }

        /// 14-07 gap closure: real `redeemed_key_val` field (not redeemed_key_value) -> REVEALED,
        /// not REDEEMED
        #[test]
        fn the_real_redeemed_key_val_field_is_revealed_not_redeemed() {
            let entry = classify(&fixture("realWorldRedeemedKeyValOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Revealed);
            assert!(!entry.all_terminal);
        }

        /// real `is_expired: true` flag (no expiration timestamp) -> UNREDEEMABLE even when
        /// redeemed_key_val present
        #[test]
        fn the_real_is_expired_flag_is_unredeemable_even_with_a_redeemed_value() {
            let entry = classify(&fixture("realWorldExpiredFlagOrder"), always_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unredeemable);
        }

        /// gift key (is_gift: true, no redeemed_key_val) classifies UNREVEALED, never skipped (D-28)
        #[test]
        fn a_gift_key_classifies_unrevealed_and_is_never_skipped() {
            let entry = classify(&fixture("realWorldGiftKeyOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
            assert_eq!(first(&entry).platform, "steam");
        }

        /// shape-tolerance floor: a tpk carrying ONLY key_type still classifies with fallback
        /// identity
        #[test]
        fn a_tpk_carrying_only_key_type_classifies_with_a_fallback_identity() {
            let entry = classify(&fixture("minimalTpkOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
            assert_eq!(first(&entry).machine_name, "order-minimal:0");
            assert_eq!(first(&entry).platform, "steam");
        }
    }

    mod classify_order_download_entitlements_without_key_type {
        use super::*;

        /// a pure ebook/PDF bundle (entries without key_type) yields ZERO rows
        #[test]
        fn a_pure_ebook_bundle_yields_zero_rows() {
            let entry = classify(&fixture("ebookBundleOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 0);
            assert!(!entry.all_terminal);
        }

        /// a bare {} tpk (no key evidence) is skipped, not classified
        #[test]
        fn a_bare_empty_tpk_is_skipped() {
            let entry = classify(
                &js(r#"{"gamekey":"order-bare","tpkd_dict":{"all_tpks":[{}]}}"#),
                never_revealed,
            );
            assert_eq!(entry.keys.len(), 0);
        }

        /// mixed order (1 steam key + 2 download entitlements) yields exactly 1 row
        #[test]
        fn a_mixed_order_yields_exactly_one_row() {
            let entry = classify(&fixture("mixedKeyAndEntitlementOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).machine_name, "actualgame_steam");
            assert_eq!(first(&entry).platform, "steam");
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
        }

        /// D-28 untouched: any string key_type still classifies (generic/origin/ubisoft)
        #[test]
        fn any_string_key_type_still_classifies() {
            let order = js(r#"{"gamekey":"order-platforms","tpkd_dict":{"all_tpks":[
                    {"machine_name":"a_generic","key_type":"generic"},
                    {"machine_name":"b_origin","key_type":"origin"},
                    {"machine_name":"c_ubisoft","key_type":"ubisoft"}]}}"#);
            let entry = classify(&order, never_revealed);
            assert_eq!(entry.keys.len(), 3);
            let platforms: Vec<&str> = entry.keys.iter().map(|k| k.platform.as_str()).collect();
            assert_eq!(platforms, ["generic", "origin", "ubisoft"]);
        }

        /// D-27 unaffected: the UNPICKED pseudo-entry path still fires when all tpks are
        /// entitlements
        #[test]
        fn the_unpicked_pseudo_entry_still_fires_when_all_tpks_are_entitlements() {
            let order = js(r#"{"gamekey":"choice-entitlements",
                    "product":{"category":"subscriptioncontent","choice_url":"home/may-2026",
                               "human_name":"Humble Choice — May 2026"},
                    "tpkd_dict":{"all_tpks":[{"machine_name":"wallpaper_pack","human_name":"Wallpapers"}]}}"#);
            let entry = classify(&order, never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unpicked);
        }
    }

    mod classify_order_direct_redeem_entitlements {
        use super::*;

        /// a direct-redeem download entitlement WITH key_type yields ZERO rows
        #[test]
        fn a_direct_redeem_entitlement_with_key_type_yields_zero_rows() {
            let entry = classify(&fixture("directRedeemEntitlementOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 0);
            assert!(!entry.all_terminal);
        }

        /// D-28: a REAL uplay key with direct_redeem:true (Rayman Legends shape) is RETAINED, known
        /// platform overrides the entitlement signal
        #[test]
        fn a_real_uplay_key_with_direct_redeem_is_retained() {
            let entry = classify(
                &fixture("realWorldDirectRedeemUplayKeyOrder"),
                never_revealed,
            );
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).platform, "uplay");
            // redeemed_key_val present -> REVEALED, never REDEEMED without a local mark
            assert_eq!(first(&entry).state, HumbleKeyState::Revealed);
        }

        /// QT-260908-UIC-01: a gog_keyless direct-redeem entitlement (live-observed 2026-09-08)
        /// yields exactly ONE key, not zero
        #[test]
        fn a_gog_keyless_direct_redeem_entitlement_yields_one_key() {
            let entry = classify(&fixture("gogKeylessDirectRedeemOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).platform, "gog_keyless");
        }

        /// D-28: an unknown-platform key WITHOUT direct_redeem is retained (no positive entitlement
        /// evidence)
        #[test]
        fn an_unknown_platform_key_without_direct_redeem_is_retained() {
            let entry = classify(&fixture("unknownPlatformKeyOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).platform, "weirdstore");
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
        }

        /// D-28: every evidenced game-store key_type survives even with direct_redeem:true
        #[test]
        fn every_evidenced_game_store_key_type_survives_direct_redeem() {
            let platforms = [
                "steam",
                "gog",
                "gog_keyless",
                "origin",
                "origin_keyless",
                "uplay",
                "epic",
                "epic_keyless",
                "battlenet",
                "nintendo_direct",
            ];
            let tpks: Vec<serde_json::Value> = platforms
                .iter()
                .enumerate()
                .map(|(i, p)| {
                    json!({"machine_name": format!("game{i}_{p}"), "key_type": p, "direct_redeem": true})
                })
                .collect();
            let order = j(
                json!({"gamekey": "order-all-platforms-direct", "tpkd_dict": {"all_tpks": tpks}}),
            );
            let entry = classify(&order, never_revealed);
            let got: Vec<&str> = entry.keys.iter().map(|k| k.platform.as_str()).collect();
            assert_eq!(got, platforms);
        }

        /// direct_redeem must be literally true, a truthy non-boolean never excludes
        #[test]
        fn direct_redeem_must_be_literally_true() {
            let order = js(
                r#"{"gamekey":"order-truthy-direct","tpkd_dict":{"all_tpks":[
                    {"machine_name":"oddgame_odd","key_type":"oddstore","direct_redeem":"yes"}]}}"#,
            );
            assert_eq!(classify(&order, never_revealed).keys.len(), 1);
        }

        /// mixed order (1 steam key + 1 direct-redeem entitlement) yields exactly 1 row
        #[test]
        fn a_mixed_order_with_a_direct_redeem_entitlement_yields_one_row() {
            let entry = classify(
                &fixture("mixedKeyAndDirectRedeemEntitlementOrder"),
                never_revealed,
            );
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).machine_name, "actualgame2_steam");
        }

        /// D-27 unaffected: the UNPICKED pseudo-entry still fires when all tpks are direct-redeem
        /// entitlements
        #[test]
        fn the_unpicked_pseudo_entry_still_fires_when_all_tpks_are_direct_redeem() {
            let order = js(r#"{"gamekey":"choice-direct-redeem",
                    "product":{"category":"subscriptioncontent","choice_url":"home/june-2026",
                               "human_name":"Humble Choice — June 2026"},
                    "tpkd_dict":{"all_tpks":[
                        {"machine_name":"bonus_wallpapers","key_type":"download","direct_redeem":true}]}}"#);
            let entry = classify(&order, never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unpicked);
        }
    }

    mod describe_zero_key_order_direct_redeem_skip_reasons {
        use super::*;

        /// a pure direct-redeem entitlement order is a LEGITIMATE zero-key shape and surfaces
        /// key_type/key_type_human_name VALUES
        #[test]
        fn a_pure_direct_redeem_order_is_legitimate_and_surfaces_type_values() {
            let d = describe_zero_key_order(&fixture("directRedeemEntitlementOrder"));
            assert!(!d.anomalous);
            assert!(d.detail.contains("direct-redeem-entitlement"));
            // C5 permits these VALUES: platform/type labels, not secrets.
            assert!(d.detail.contains("key_type=download"));
            assert!(d.detail.contains("key_type_human_name=Download"));
        }

        /// C5: the zero-key diagnosis NEVER carries the redeemed key value of a skipped entitlement
        #[test]
        fn the_zero_key_diagnosis_never_carries_the_redeemed_key_value() {
            let order = with_entitlement_value(fixture("directRedeemEntitlementOrder"), "0");
            let d = describe_zero_key_order(&order);
            assert!(!d.detail.contains(LEAK));
        }
    }

    mod describe_skipped_entitlements_direct_redeem_values {
        use super::*;

        /// a mixed order reports the skipped direct-redeem count with key_type/key_type_human_name
        /// VALUES
        #[test]
        fn a_mixed_order_reports_the_direct_redeem_count_with_type_values() {
            let detail =
                describe_skipped_entitlements(&fixture("mixedKeyAndDirectRedeemEntitlementOrder"))
                    .expect("a report");
            assert!(detail.contains("skippedDirectRedeem=1"));
            assert!(detail.contains("key_type=download"));
            assert!(detail.contains("key_type_human_name=Download"));
        }

        /// C5: the skip diagnostic NEVER carries the redeemed key value of a skipped entitlement
        #[test]
        fn the_skip_diagnostic_never_carries_the_redeemed_key_value() {
            let order =
                with_entitlement_value(fixture("mixedKeyAndDirectRedeemEntitlementOrder"), "1");
            let detail = describe_skipped_entitlements(&order).expect("a report");
            assert!(!detail.contains(LEAK));
        }

        /// a retained direct-redeem KEY (known platform) is not reported as skipped
        #[test]
        fn a_retained_direct_redeem_key_is_not_reported_as_skipped() {
            assert_eq!(
                describe_skipped_entitlements(&fixture("realWorldDirectRedeemUplayKeyOrder")),
                None
            );
        }
    }

    mod describe_missing_expiration_tpks_direct_redeem {
        use super::*;

        /// an undatable direct-redeem entitlement is never diagnosed as a key missing a date
        #[test]
        fn an_undatable_direct_redeem_entitlement_is_never_diagnosed() {
            assert_eq!(
                describe_missing_expiration_tpks(
                    &fixture("directRedeemEntitlementOrder"),
                    now(),
                    LocalZone::UTC
                ),
                None
            );
        }
    }

    mod describe_zero_key_order_no_key_type_skip_reasons {
        use super::*;

        /// a pure ebook bundle diagnoses each entry as no-key_type with field NAMES
        #[test]
        fn a_pure_ebook_bundle_diagnoses_each_entry_as_no_key_type_with_field_names() {
            let d = describe_zero_key_order(&fixture("ebookBundleOrder"));
            // A download-entitlement-only order is the LEGITIMATE D-29 exclusion shape.
            assert!(!d.anomalous);
            assert!(d.detail.contains("all_tpks=array(2)"));
            assert!(d.detail.contains("[0]:no-key_type(fields=["));
            assert!(d.detail.contains("[1]:no-key_type(fields=["));
            assert!(d.detail.contains("machine_name"));
            assert!(d.detail.contains("human_name"));
        }

        /// a mix of non-object and no-key_type entries is still anomalous
        #[test]
        fn a_mix_of_non_object_and_no_key_type_entries_is_anomalous() {
            let order = js(
                r#"{"gamekey":"gk","tpkd_dict":{"all_tpks":["not-an-object",{"machine_name":"thing_pdf"}]}}"#,
            );
            let d = describe_zero_key_order(&order);
            assert!(d.anomalous);
            assert!(d.detail.contains("[0]:non-object(string)"));
            assert!(d.detail.contains("[1]:no-key_type(fields=["));
        }

        /// C5 redaction: no-key_type skip reasons carry field NAMES only, never values
        #[test]
        fn no_key_type_skip_reasons_carry_field_names_only() {
            let order = js(r#"{"gamekey":"gk","tpkd_dict":{"all_tpks":[
                    {"machine_name":"SECRET-NAME-MUST-NOT-LEAK-AS-VALUE","secret":"SECRET-VALUE"}]}}"#);
            let d = describe_zero_key_order(&order);
            assert!(d.detail.contains("machine_name"));
            assert!(d.detail.contains("secret"));
            assert!(!d.detail.contains("SECRET-VALUE"));
            assert!(!d.detail.contains("SECRET-NAME-MUST-NOT-LEAK-AS-VALUE"));
        }
    }

    mod describe_skipped_entitlements_mixed_order_discoverability {
        use super::*;

        /// a mixed order reports the skipped entitlement count + per-entry field names
        #[test]
        fn a_mixed_order_reports_the_skipped_count_and_per_entry_field_names() {
            let detail = describe_skipped_entitlements(&fixture("mixedKeyAndEntitlementOrder"))
                .expect("a report");
            assert!(detail.contains("skippedNoKeyType=2"));
            assert!(detail.contains("[1]:no-key_type(fields=["));
            assert!(detail.contains("[2]:no-key_type(fields=["));
            assert!(detail.contains("machine_name"));
        }

        /// an order whose tpks are ALL keys reports nothing (null)
        #[test]
        fn an_order_whose_tpks_are_all_keys_reports_nothing() {
            assert_eq!(
                describe_skipped_entitlements(&fixture("realWorldUnrevealedPurchaseOrder")),
                None
            );
        }

        /// C5 redaction: field NAMES only, never field values
        #[test]
        fn the_report_carries_field_names_only() {
            let order = js(r#"{"gamekey":"gk","tpkd_dict":{"all_tpks":[
                    {"key_type":"steam","machine_name":"real_key"},
                    {"machine_name":"g","secret":"SECRET-MUST-NOT-LEAK"}]}}"#);
            let detail = describe_skipped_entitlements(&order).expect("a report");
            assert!(detail.contains("secret"));
            assert!(!detail.contains("SECRET-MUST-NOT-LEAK"));
        }
    }

    mod extract_expiration_real_world_field_tolerance {
        use super::*;

        /// absolute `expiry_date` string -> ISO-normalized
        #[test]
        fn an_absolute_expiry_date_is_iso_normalized() {
            let out = extract(&js(r#"{"expiry_date":"2026-08-03T00:00:00Z"}"#));
            assert_eq!(out.as_deref(), Some("2026-08-03T00:00:00.000Z"));
        }

        /// spec `expiration` string still honored (fallback candidate)
        #[test]
        fn the_spec_expiration_string_is_still_honored() {
            let out = extract(&js(r#"{"expiration":"2026-08-03T00:00:00Z"}"#));
            assert_eq!(out.as_deref(), Some("2026-08-03T00:00:00.000Z"));
        }

        /// relative `num_days_until_expired` -> now + N days as ISO
        #[test]
        fn a_relative_day_count_is_now_plus_n_days() {
            let out = extract(&js(r#"{"num_days_until_expired":30}"#));
            assert_eq!(out.as_deref(), Some("2026-08-05T00:00:00.000Z"));
        }

        /// num_days_until_expired: 0 means "no expiry window", NOT "expires today" -> null
        #[test]
        fn zero_days_means_no_expiry_window() {
            assert_eq!(extract(&js(r#"{"num_days_until_expired":0}"#)), None);
        }

        /// negative num_days_until_expired -> null (no expiry window)
        #[test]
        fn negative_days_mean_no_expiry_window() {
            assert_eq!(extract(&js(r#"{"num_days_until_expired":-5}"#)), None);
        }

        /// no recognized field -> null
        #[test]
        fn no_recognized_field_is_none() {
            assert_eq!(
                extract(&js(r#"{"some_unknown_date_field":"2027-01-01"}"#)),
                None
            );
        }

        /// unparseable date string -> null, never throws
        #[test]
        fn an_unparseable_date_string_is_none() {
            assert_eq!(extract(&js(r#"{"expiry_date":"not-a-date"}"#)), None);
        }

        /// WR-02: overflowing num_days_until_expired (beyond the Date range) -> null, never throws
        #[test]
        fn overflowing_days_are_none() {
            assert_eq!(extract(&js(r#"{"num_days_until_expired":1e12}"#)), None);
            assert_eq!(
                extract(&js(r#"{"num_days_until_expired":1.7976931348623157e308}"#)),
                None
            );
        }

        /// i31: bare date-only expiry_date anchors to LOCAL midnight, not UTC midnight
        #[test]
        fn a_bare_date_only_expiry_date_anchors_to_local_midnight() {
            for zone in zones() {
                let out = extract_expiration(&js(r#"{"expiry_date":"2026-08-01"}"#), now(), zone)
                    .expect("a date");
                assert_eq!(local_date(&out, zone), (2026, 8, 1));
            }
        }

        /// i31: bare date-only expiration (fallback candidate) anchors to LOCAL midnight too
        #[test]
        fn a_bare_date_only_expiration_anchors_to_local_midnight_too() {
            for zone in zones() {
                let out = extract_expiration(&js(r#"{"expiration":"2026-08-01"}"#), now(), zone)
                    .expect("a date");
                assert_eq!(local_date(&out, zone), (2026, 8, 1));
            }
        }

        /// 261128-22q: a date-only expiry across a daylight-saving change takes ITS OWN date's offset.
        /// The offset in force at the sync (the old rule) reads the winter date a day early.
        #[test]
        fn a_date_only_expiry_across_a_daylight_saving_change_takes_its_own_dates_offset() {
            use crate::js_date::test_zones::{Auckland2026, NewYork2026};
            // New York, synced in July (EDT), expiring in December (EST).
            let ny = LocalZone::host(&NewYork2026);
            let out = extract_expiration(&js(r#"{"expiry_date":"2026-12-15"}"#), now(), ny)
                .expect("a date");
            assert_eq!(out, "2026-12-15T05:00:00.000Z");
            assert_eq!(local_date(&out, ny), (2026, 12, 15));
            let at_sync = extract_expiration(
                &js(r#"{"expiry_date":"2026-12-15"}"#),
                now(),
                LocalZone::from_east_secs(-4 * 3600),
            )
            .expect("a date");
            assert_eq!(at_sync, "2026-12-15T04:00:00.000Z");
            assert_eq!(local_date(&at_sync, ny), (2026, 12, 14));

            // Auckland, synced in November (NZDT), expiring in July (NZST).
            let nz = LocalZone::host(&Auckland2026);
            let sync = at("2026-11-24T12:00:00Z");
            let out = extract_expiration(&js(r#"{"expiry_date":"2026-07-01"}"#), sync, nz)
                .expect("a date");
            assert_eq!(out, "2026-06-30T12:00:00.000Z");
            assert_eq!(local_date(&out, nz), (2026, 7, 1));
            let at_sync = extract_expiration(
                &js(r#"{"expiry_date":"2026-07-01"}"#),
                sync,
                LocalZone::from_east_secs(13 * 3600),
            )
            .expect("a date");
            assert_eq!(at_sync, "2026-06-30T11:00:00.000Z");
            assert_eq!(local_date(&at_sync, nz), (2026, 6, 30));
        }

        /// 261128-22q: a zone-less date-time reads at its own date's offset too.
        #[test]
        fn a_zone_less_expiry_time_takes_its_own_dates_offset() {
            use crate::js_date::test_zones::NewYork2026;
            let ny = LocalZone::host(&NewYork2026);
            let out = extract_expiration(&js(r#"{"expiration":"2026-12-15 00:30"}"#), now(), ny);
            assert_eq!(out.as_deref(), Some("2026-12-15T05:30:00.000Z"));
        }

        /// 261128-22q: the expired-by-date comparison uses the same own-date offset.
        #[test]
        fn a_host_zone_expiry_compares_against_now_at_its_own_offset() {
            use crate::js_date::test_zones::NewYork2026;
            let ny = LocalZone::host(&NewYork2026);
            let tpk = signals(false, Some("2026-12-15 00:30"), None);
            let state = |now_iso: &str| classify_tpk(&tpk, false, false, at(now_iso), ny);
            assert_ne!(state("2026-12-15T05:29:59Z"), HumbleKeyState::Unredeemable);
            assert_eq!(state("2026-12-15T05:30:00Z"), HumbleKeyState::Unredeemable);
        }

        /// i31: NEGATIVE CONTROL, a full instant round-trips byte-identically (guard is scoped, not
        /// a blanket rewrite)
        #[test]
        fn a_full_instant_round_trips_byte_identically() {
            for zone in zones() {
                let out = extract_expiration(
                    &js(r#"{"expiry_date":"2026-08-01T12:34:56.000Z"}"#),
                    now(),
                    zone,
                );
                assert_eq!(out.as_deref(), Some("2026-08-01T12:34:56.000Z"));
            }
        }

        /// i31: NEGATIVE CONTROL, a shape-matching but invalid date-only value still yields null
        /// (tolerance not widened)
        #[test]
        fn a_shape_matching_but_invalid_date_only_value_is_none() {
            assert_eq!(extract(&js(r#"{"expiry_date":"2026-13-45"}"#)), None);
        }
    }

    mod classify_order_real_world_expiration_wiring {
        use super::*;

        /// future `expiry_date` -> UNREVEALED with a populated ISO expiration (row display + sort)
        #[test]
        fn a_future_expiry_date_is_unrevealed_with_a_populated_expiration() {
            let entry = classify(&fixture("realWorldFutureExpiryDateOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
            assert_eq!(
                first(&entry).expiration.as_deref(),
                Some("2026-08-03T00:00:00.000Z")
            );
        }

        /// past `expiry_date` (no is_expired flag) -> UNREDEEMABLE via the date alone
        #[test]
        fn a_past_expiry_date_is_unredeemable_via_the_date_alone() {
            let entry = classify(&fixture("realWorldPastExpiryDateOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Unredeemable);
            assert_eq!(
                first(&entry).expiration.as_deref(),
                Some("2020-01-01T00:00:00.000Z")
            );
        }

        /// relative `num_days_until_expired` -> absolute expiration from sync time
        #[test]
        fn a_relative_day_count_becomes_an_absolute_expiration_from_sync_time() {
            let entry = classify(&fixture("realWorldRelativeExpiryOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(
                first(&entry).expiration.as_deref(),
                Some("2026-08-05T00:00:00.000Z")
            );
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
        }
    }

    mod describe_missing_expiration_tpks_date_field_discovery {
        use super::*;

        fn missing(order: &JsValue) -> Option<String> {
            describe_missing_expiration_tpks(order, now(), LocalZone::UTC)
        }

        /// active key with no recognized date field -> surfaces its candidate field names
        #[test]
        fn an_active_key_with_no_date_field_surfaces_its_candidate_field_names() {
            let detail = missing(&fixture("realWorldUndatableActiveOrder")).expect("a report");
            assert!(detail.contains("tpksMissingExpiration=1"));
            assert!(detail.contains("some_unknown_date_field"));
            assert!(detail.contains("machine_name"));
        }

        /// key with an extractable expiry_date -> nothing to diagnose (null)
        #[test]
        fn a_key_with_an_extractable_expiry_date_has_nothing_to_diagnose() {
            assert_eq!(missing(&fixture("realWorldFutureExpiryDateOrder")), None);
        }

        /// already-expired key (is_expired true) is not diagnosed
        #[test]
        fn an_already_expired_key_is_not_diagnosed() {
            assert_eq!(missing(&fixture("realWorldExpiredFlagOrder")), None);
        }

        /// download entitlements (no key_type) are not keys, never diagnosed as missing a date
        #[test]
        fn download_entitlements_are_never_diagnosed_as_missing_a_date() {
            assert_eq!(missing(&fixture("ebookBundleOrder")), None);
        }

        /// C5 redaction: diagnosis carries field NAMES only, never field values
        #[test]
        fn the_diagnosis_carries_field_names_only() {
            let order = js(r#"{"gamekey":"gk","tpkd_dict":{"all_tpks":[
                    {"machine_name":"g","key_type":"steam","is_expired":false,"secret":"SECRET-MUST-NOT-LEAK"}]}}"#);
            let detail = missing(&order).expect("a report");
            assert!(detail.contains("secret"));
            assert!(!detail.contains("SECRET-MUST-NOT-LEAK"));
        }
    }

    mod classify_order_key_index_by_composite {
        use super::*;

        fn order_with_keyindex() -> JsValue {
            js(r#"{"gamekey":"order-keyindex","tpkd_dict":{"all_tpks":[
                    {"machine_name":"keyindexgame_steam","key_type":"steam","human_name":"Keyindex Game",
                     "is_expired":false,"keyindex":3}]}}"#)
        }

        /// a tpk carrying a numeric keyindex is recorded under the gamekey:machineName composite key
        #[test]
        fn a_numeric_keyindex_is_recorded_under_the_composite_key() {
            let entry = classify(&order_with_keyindex(), never_revealed);
            let want = BTreeMap::from([(
                "order-keyindex:keyindexgame_steam".to_string(),
                KeyIndex::Number(3.0),
            )]);
            assert_eq!(entry.key_index_by_composite, want);
        }

        /// a tpk carrying a string keyindex is also recorded (tolerant union)
        #[test]
        fn a_string_keyindex_is_also_recorded() {
            let order = js(r#"{"gamekey":"order-keyindex-str","tpkd_dict":{"all_tpks":[
                    {"machine_name":"stringidx_steam","key_type":"steam","is_expired":false,"keyindex":"5"}]}}"#);
            let entry = classify(&order, never_revealed);
            let want = BTreeMap::from([(
                "order-keyindex-str:stringidx_steam".to_string(),
                KeyIndex::Text("5".to_string()),
            )]);
            assert_eq!(entry.key_index_by_composite, want);
        }

        /// a tpk with no keyindex field is simply absent from the map (no throw)
        #[test]
        fn a_tpk_with_no_keyindex_is_absent_from_the_map() {
            let entry = classify(&fixture("unrevealedOrder"), never_revealed);
            assert!(entry.key_index_by_composite.is_empty());
        }

        /// keyindex NEVER appears on any returned HumbleKey
        #[test]
        fn keyindex_never_appears_on_a_returned_key() {
            let entry = classify(&order_with_keyindex(), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            let key = serde_json::to_value(first(&entry)).expect("serialises");
            assert!(key.get("keyindex").is_none());
            assert!(key.get("keyIndex").is_none());
        }

        /// a malformed keyindex (object) is tolerated, omitted from the map, order still classifies
        #[test]
        fn a_malformed_keyindex_is_omitted_and_the_order_still_classifies() {
            let order = js(r#"{"gamekey":"order-keyindex-bad","tpkd_dict":{"all_tpks":[
                    {"machine_name":"badidx_steam","key_type":"steam","is_expired":false,
                     "keyindex":{"nested":true}}]}}"#);
            let entry = classify(&order, never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert!(entry.key_index_by_composite.is_empty());
        }

        /// backward compatibility: existing 2-arg / 3-arg call sites still work (isLocallyRedeemed
        /// defaults to always-false)
        #[test]
        fn the_default_redeemed_predicate_is_always_false() {
            let entry = classify_at(
                &order_with_keyindex(),
                never_revealed,
                at("2026-01-01T00:00:00Z"),
            );
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
            assert!(!never_redeemed("any", "thing"));
        }
    }

    mod classify_order_revealed_key_value_by_composite {
        use super::*;

        /// a string redeemed_key_val is recorded under the gamekey:machineName composite key
        /// (the recorded fixture holds `REDACTED` where the TS fixture holds its value)
        #[test]
        fn a_string_redeemed_key_val_is_recorded_under_the_composite_key() {
            let entry = classify(&fixture("realWorldRedeemedKeyValOrder"), never_revealed);
            let want = BTreeMap::from([(
                "order-real-redeemed:realredeemed_steam".to_string(),
                "REDACTED".to_string(),
            )]);
            assert_eq!(entry.revealed_key_value_by_composite, want);
        }

        /// the spec fallback field redeemed_key_value is also captured
        #[test]
        fn the_spec_fallback_field_is_also_captured() {
            let order = js(r#"{"gamekey":"order-fallback-val","tpkd_dict":{"all_tpks":[
                    {"machine_name":"fallbackval_steam","key_type":"steam","is_expired":false,
                     "redeemed_key_value":"fallback-value-string"}]}}"#);
            let entry = classify(&order, never_revealed);
            let want = BTreeMap::from([(
                "order-fallback-val:fallbackval_steam".to_string(),
                "fallback-value-string".to_string(),
            )]);
            assert_eq!(entry.revealed_key_value_by_composite, want);
        }

        /// an OBJECT-shaped redeemed value is omitted from the map (key still classifies REVEALED)
        #[test]
        fn an_object_shaped_redeemed_value_is_omitted_but_still_revealed() {
            let order = js(r#"{"gamekey":"order-object-val","tpkd_dict":{"all_tpks":[
                    {"machine_name":"objectval_gog","key_type":"gog","is_expired":false,
                     "redeemed_key_val":{"nested":"structure"}}]}}"#);
            let entry = classify(&order, never_revealed);
            assert!(entry.revealed_key_value_by_composite.is_empty());
            // A truthy object still counts as "revealed" for classification.
            assert_eq!(first(&entry).state, HumbleKeyState::Revealed);
        }

        /// a tpk with no redeemed value is simply absent from the map
        #[test]
        fn a_tpk_with_no_redeemed_value_is_absent_from_the_map() {
            let entry = classify(&fixture("unrevealedOrder"), never_revealed);
            assert!(entry.revealed_key_value_by_composite.is_empty());
        }

        /// the redeemed value NEVER appears on any returned HumbleKey (C4/T-14-02)
        #[test]
        fn the_redeemed_value_never_appears_on_a_returned_key() {
            let entry = classify(&fixture("realWorldRedeemedKeyValOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            let keys = serde_json::to_string(&entry.keys).expect("serialises");
            assert!(!keys.contains("revealedKeyValue"));
            assert!(!keys.contains("REDACTED"));
        }

        /// a skipped direct-redeem entitlement never contributes to the map
        #[test]
        fn a_skipped_direct_redeem_entitlement_never_contributes() {
            let entry = classify(&fixture("directRedeemEntitlementOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 0);
            assert!(entry.revealed_key_value_by_composite.is_empty());
        }
    }

    mod classify_order_is_locally_redeemed_composite_predicate {
        use super::*;

        fn order() -> JsValue {
            js(r#"{"gamekey":"order-local-redeem","tpkd_dict":{"all_tpks":[
                    {"machine_name":"localredeem_steam","key_type":"steam","is_expired":false}]}}"#)
        }

        fn server_valued(gamekey: &str, machine: &str) -> JsValue {
            js(&format!(
                r#"{{"gamekey":"{gamekey}","tpkd_dict":{{"all_tpks":[
                    {{"machine_name":"{machine}","key_type":"steam","is_expired":false,
                      "redeemed_key_val":"server-value"}}]}}}}"#
            ))
        }

        /// isLocallyRedeemed(gamekey, machineName) true -> classifies REDEEMED
        #[test]
        fn the_composite_predicate_true_classifies_redeemed() {
            let entry = classify_order(
                &order(),
                never_revealed,
                at("2026-01-01T00:00:00Z"),
                LocalZone::UTC,
                |gamekey, machine| {
                    gamekey == "order-local-redeem" && machine == "localredeem_steam"
                },
            );
            assert_eq!(first(&entry).state, HumbleKeyState::Redeemed);
        }

        /// isLocallyRedeemed false (default) -> classifies UNREVEALED, unaffected
        #[test]
        fn the_default_predicate_classifies_unrevealed() {
            let entry = classify_at(&order(), never_revealed, at("2026-01-01T00:00:00Z"));
            assert_eq!(first(&entry).state, HumbleKeyState::Unrevealed);
        }

        /// 14-07 gap closure: isLocallyRedeemed wins over server redeemedKeyValuePresent at the
        /// classifyOrder level too
        #[test]
        fn the_local_mark_wins_over_a_server_value_at_the_order_level() {
            let entry = classify_order(
                &server_valued("order-local-redeem-2", "localredeem2_steam"),
                never_revealed,
                at("2026-01-01T00:00:00Z"),
                LocalZone::UTC,
                |_, _| true,
            );
            assert_eq!(first(&entry).state, HumbleKeyState::Redeemed);
        }

        /// 14-07 gap closure: a server-revealed key with NO local mark classifies REVEALED, never
        /// REDEEMED
        #[test]
        fn a_server_revealed_key_with_no_local_mark_is_revealed() {
            let entry = classify_at(
                &server_valued("order-local-redeem-3", "localredeem3_steam"),
                never_revealed,
                at("2026-01-01T00:00:00Z"),
            );
            assert_eq!(first(&entry).state, HumbleKeyState::Revealed);
        }
    }

    mod classify_order_steam_app_id_capture {
        use super::*;

        /// a numeric steam_app_id (620) stringifies to steamAppId === "620"
        #[test]
        fn a_numeric_steam_app_id_stringifies() {
            let entry = classify(&fixture("steamKeyWithNumericAppIdOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).steam_app_id.as_deref(), Some("620"));
        }

        /// a string steam_app_id ("620") yields steamAppId === "620"
        #[test]
        fn a_string_steam_app_id_is_kept() {
            let entry = classify(&fixture("steamKeyWithStringAppIdOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).steam_app_id.as_deref(), Some("620"));
        }

        /// a non-Steam tpk (key_type: gog) yields steamAppId === undefined
        #[test]
        fn a_non_steam_tpk_has_no_steam_app_id() {
            let entry = classify(&fixture("nonSteamPlatformOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).steam_app_id, None);
        }

        /// every classified key defaults ownedElsewhere: false and matchConfidence: "none"
        #[test]
        fn every_key_defaults_the_ownership_overlay() {
            let entry = classify(&fixture("steamKeyWithNumericAppIdOrder"), never_revealed);
            assert!(!first(&entry).owned_elsewhere);
            assert_eq!(first(&entry).match_confidence, MatchConfidence::None);
        }

        /// T-12-01a: a malformed steam_app_id (an object) does not throw; order still classifies
        /// with steamAppId undefined
        #[test]
        fn a_malformed_steam_app_id_leaves_the_id_absent() {
            let entry = classify(&fixture("steamKeyWithMalformedAppIdOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).steam_app_id, None);
        }
    }

    mod describe_zero_key_order_redacted_structural_diagnosis {
        use super::*;

        /// order with no tpkd_dict at all -> anomalous, names the absence and the top-level field
        /// names
        #[test]
        fn an_order_with_no_tpkd_dict_names_the_absence_and_the_top_level_fields() {
            let d = describe_zero_key_order(&fixture("strippedNoTpkdDictOrder"));
            assert!(d.anomalous);
            assert!(d.detail.contains("tpkd_dict=absent"));
            assert!(d.detail.contains("order_fields="));
            assert!(d.detail.contains("gamekey"));
            assert!(d.detail.contains("subproducts"));
        }

        /// tpkd_dict null -> anomalous, reported as null
        #[test]
        fn a_null_tpkd_dict_is_reported_as_null() {
            let d = describe_zero_key_order(&js(r#"{"gamekey":"gk","tpkd_dict":null}"#));
            assert!(d.anomalous);
            assert!(d.detail.contains("tpkd_dict=null"));
        }

        /// tpkd_dict present but all_tpks absent -> anomalous, names tpkd_dict field names
        #[test]
        fn a_tpkd_dict_without_all_tpks_names_its_fields() {
            let d = describe_zero_key_order(&js(
                r#"{"gamekey":"gk","tpkd_dict":{"some_other_key_group":[]}}"#,
            ));
            assert!(d.anomalous);
            assert!(d.detail.contains("tpkd_dict.all_tpks=absent"));
            assert!(d.detail.contains("some_other_key_group"));
        }

        /// explicit empty all_tpks array -> NOT anomalous (legit DRM-free shape, D-29)
        #[test]
        fn an_explicit_empty_all_tpks_is_not_anomalous() {
            let d = describe_zero_key_order(&js(r#"{"gamekey":"gk","tpkd_dict":{"all_tpks":[]}}"#));
            assert!(!d.anomalous);
            assert!(d.detail.contains("all_tpks=array(0)"));
        }

        /// non-empty all_tpks of non-object elements -> anomalous, per-element skip reasons
        #[test]
        fn non_object_elements_are_anomalous_with_per_element_skip_reasons() {
            let d = describe_zero_key_order(&js(
                r#"{"gamekey":"gk","tpkd_dict":{"all_tpks":[null,"a-string",42]}}"#,
            ));
            assert!(d.anomalous);
            assert!(d.detail.contains("all_tpks=array(3)"));
            assert!(d.detail.contains("[0]:non-object(null)"));
            assert!(d.detail.contains("[1]:non-object(string)"));
            assert!(d.detail.contains("[2]:non-object(number)"));
        }

        /// C5 redaction: diagnosis carries field NAMES only, never field values
        #[test]
        fn the_diagnosis_carries_field_names_only() {
            let d = describe_zero_key_order(&js(
                r#"{"gamekey":"gk","secret_field":"SECRET-VALUE-MUST-NOT-LEAK","tpkd_dict":null}"#,
            ));
            assert!(d.detail.contains("secret_field"));
            assert!(!d.detail.contains("SECRET-VALUE-MUST-NOT-LEAK"));
        }
    }

    mod is_server_terminal_freeze_predicate {
        use super::*;
        use HumbleKeyState::*;

        /// true for REVEALED, REDEEMED, UNREDEEMABLE (server-final states)
        #[test]
        fn true_for_the_server_final_states() {
            assert!(is_server_terminal(Revealed));
            assert!(is_server_terminal(Redeemed));
            assert!(is_server_terminal(Unredeemable));
        }

        /// false for UNPICKED/UNREVEALED (still awaiting server action)
        #[test]
        fn false_for_the_states_awaiting_server_action() {
            assert!(!is_server_terminal(Unpicked));
            assert!(!is_server_terminal(Unrevealed));
        }

        /// isTerminal (user-journey terminality) is UNCHANGED, still REDEEMED/UNREDEEMABLE only
        #[test]
        fn is_terminal_is_unchanged() {
            // REVEALED is server-terminal but NOT user-journey terminal.
            assert!(!is_terminal(Revealed));
            assert!(is_server_terminal(Revealed));
            assert!(is_terminal(Redeemed));
            assert!(is_terminal(Unredeemable));
            assert!(!is_terminal(Unrevealed));
            assert!(!is_terminal(Unpicked));
        }
    }

    mod is_freeze_eligible_single_sourced_predicate {
        use super::*;
        use HumbleKeyState::*;
        const FUTURE: &str = "2099-01-01T00:00:00.000Z";

        /// VALUE-BACKED REVEALED with expiration:null is eligible (server-final, no pending expiry
        /// to re-check)
        #[test]
        fn value_backed_revealed_with_no_expiration_is_eligible() {
            assert!(freeze(Revealed, None, Some(true)));
        }

        /// CR-01 (14-08 re-review): flag-only REVEALED (no key value present) is NEVER eligible,
        /// freezing it would strand the D-78 "unconfirmed, sync to check" reconciliation and the
        /// D-66 website-reveal pickup
        #[test]
        fn flag_only_revealed_is_never_eligible() {
            // An absent signal is the safe default: treated as NOT present.
            assert!(!freeze(Revealed, None, None));
            // Explicit false: the write-ahead-flag-only state of the ambiguous and
            // rejected_by_server reveal outcomes.
            assert!(!freeze(Revealed, None, Some(false)));
        }

        /// REVEALED with a LIVE FUTURE expiration is NOT eligible even when value-backed
        /// (retroactive expiry preserved, no standalone recompute exists)
        #[test]
        fn revealed_with_a_live_future_expiration_is_not_eligible() {
            assert!(!freeze(Revealed, Some(FUTURE), Some(true)));
            assert!(!freeze(Revealed, Some(FUTURE), None));
        }

        /// REDEEMED is always eligible regardless of expiration (no expiry guard added)
        #[test]
        fn redeemed_is_always_eligible() {
            assert!(freeze(Redeemed, None, None));
            assert!(freeze(Redeemed, Some(FUTURE), None));
        }

        /// UNREDEEMABLE is always eligible regardless of expiration (no expiry guard added)
        #[test]
        fn unredeemable_is_always_eligible() {
            assert!(freeze(Unredeemable, None, None));
            assert!(freeze(Unredeemable, Some(FUTURE), None));
        }

        /// UNPICKED/UNREVEALED are never eligible
        #[test]
        fn unpicked_and_unrevealed_are_never_eligible() {
            assert!(!freeze(Unpicked, None, None));
            assert!(!freeze(Unrevealed, None, None));
        }
    }

    mod classify_order_freeze_eligible {
        use super::*;

        /// an order whose only key is REVEALED (server redeemed_key_value, no expiration) computes
        /// freezeEligible:true
        #[test]
        fn a_value_backed_revealed_order_is_freeze_eligible() {
            let entry = classify(&fixture("redeemedOrder"), never_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Revealed);
            assert_eq!(first(&entry).expiration, None);
            assert!(entry.freeze_eligible);
        }

        /// CR-01 (14-08 re-review): a FLAG-ONLY REVEALED key (local write-ahead flag, NO server
        /// redeemed value) computes freezeEligible:false, the order must keep re-fetching so the
        /// ambiguous-reveal reconciliation / website-reveal value pickup can ever land
        #[test]
        fn a_flag_only_revealed_order_is_not_freeze_eligible() {
            // revealedViaFlagOrder carries redeemed_key_value: null: REVEALED comes purely from
            // the injected lookup, the state the ambiguous and rejected_by_server outcomes leave.
            let entry = classify(&fixture("revealedViaFlagOrder"), always_revealed);
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Revealed);
            assert_eq!(first(&entry).expiration, None);
            assert!(!entry.freeze_eligible);
        }

        /// an order whose only key is REVEALED with a LIVE FUTURE expiration computes
        /// freezeEligible:false (partitionGamekeys keeps re-fetching it)
        #[test]
        fn a_revealed_order_with_a_live_future_expiration_is_not_freeze_eligible() {
            // Force REVEALED via the lookup so the future-expiry fixture, which carries no
            // redeemed value, still classifies REVEALED rather than UNREVEALED.
            let entry = classify_at(
                &fixture("realWorldFutureExpiryDateOrder"),
                |m| m == "settlementsurvival_steam",
                now(),
            );
            assert_eq!(entry.keys.len(), 1);
            assert_eq!(first(&entry).state, HumbleKeyState::Revealed);
            assert!(first(&entry).expiration.is_some());
            assert!(!entry.freeze_eligible);
        }

        /// REDEEMED/UNREDEEMABLE freeze exactly as before, no behavior change for those states
        #[test]
        fn unredeemable_orders_freeze_exactly_as_before() {
            let entry = classify(&fixture("unredeemableOrder"), always_revealed);
            assert_eq!(first(&entry).state, HumbleKeyState::Unredeemable);
            assert!(entry.all_terminal);
            assert!(entry.freeze_eligible);
        }

        /// a non-terminal order (UNREVEALED) computes freezeEligible:false, matching allTerminal
        #[test]
        fn a_non_terminal_order_is_not_freeze_eligible() {
            let entry = classify(&fixture("unrevealedOrder"), never_revealed);
            assert!(!entry.all_terminal);
            assert!(!entry.freeze_eligible);
        }

        /// D-27: an UNPICKED pseudo-entry never computes freezeEligible:true
        #[test]
        fn an_unpicked_pseudo_entry_is_never_freeze_eligible() {
            let entry = classify(&fixture("unpickedChoiceMonthOrder"), never_revealed);
            assert_eq!(first(&entry).state, HumbleKeyState::Unpicked);
            assert!(!entry.freeze_eligible);
        }
    }
}
