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
/// `new Date(tpk.expiration)` is read in `zone` when the string carries none of its own.
pub fn classify_tpk(
    tpk: &TpkSignals,
    is_locally_revealed: bool,
    is_locally_redeemed: bool,
    now_ms: i64,
    zone: LocalZone,
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
/// `None` when no recognised, parseable expiration is present. Never panics.
pub fn extract_expiration(tpk: &JsValue, now_ms: i64, zone: LocalZone) -> Option<String> {
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
pub fn classify_order(
    raw_order: &JsValue,
    is_revealed: impl Fn(&str) -> bool,
    now_ms: i64,
    zone: LocalZone,
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
    zone: LocalZone,
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
