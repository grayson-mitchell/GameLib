//! PICS product info and licence ops, reproducing steam-user's JSON shapes so the TS callers
//! (13 `getProductInfo` call sites) keep working unchanged through the adapter.
//!
//! Typing rules, each from the steam-user 5.x source in `node_modules`:
//!
//! Result object (`components/apps.js` `getProductInfo`, lines 188-193, 303-319):
//! `{apps:{[id]:{changenumber, missingToken, appinfo}}, packages:{[id]:{changenumber, missingToken,
//! packageinfo}}, unknownApps, unknownPackages}`. `missingToken` is `!!missing_token`. A package
//! with an empty buffer has `packageinfo: null`. Ids listed in `unknown_*` are reported and the
//! (absent) entry is not synthesised.
//!
//! App buffer (`apps.js` 298-306): UTF-8 text, ONE trailing NUL removed (`/\0$/`), parsed by the
//! `kvparser` package and the `.appinfo` member taken. `kvparser` (`lib/KvParser.js`) rules:
//! - every leaf value is a string (no number or bool coercion), blocks are objects;
//! - the root must be `<name> { ... }`; parsing stops at the root's closing brace;
//! - inside a quoted string a backslash makes the next char literal, so `\n` is the letter `n`
//!   (NOT a newline), `\"` is `"` and `\\` is `\` (KvParser.js 150-160, differs from
//!   `RawStr::decoded`);
//! - keys are case-sensitive; a repeated scalar key is last-wins and a repeated block key REPLACES
//!   the earlier block (`setObjectPath` assigns `{}`, no merge), which is why this module walks
//!   the lossless `kv_text::parse` tree itself instead of using `kv_text::merged` (which merges
//!   and is case-insensitive).
//!
//! Package buffer (`apps.js` 259, 319 and `binarykvparser/index.js`): a 4-byte package-id prefix,
//! then binary KV, and `[packageid]` of the root is the packageinfo. Node typing:
//! - Int32/Color/Pointer: signed 32-bit number (index.js 77-80);
//! - UInt64/Int64: a `Long`; here a JSON number when it fits in 2^53, else a decimal string;
//! - Float32: number; String: string; WideString: not supported upstream (throws), decoded as
//!   UTF-16 here;
//! - an empty key name drops the entry (`if (name)`);
//! - `convertObject`: an object whose keys all `parseInt` to exactly 0..n-1 becomes an array, and
//!   an EMPTY object also becomes an empty array (index.js 117-143).
//!
//! `depotOrder` is an addition: the ids of the numeric blocks under the app's `depots` block in
//! raw source order (what `appinfoOrder.ts`'s tap computed from steam-user's private `_send`).
//!
//! Tokens: with `incl_tokens` the access tokens are fetched BEFORE the product-info request and
//! passed on every entry (CF-05: 1,144 vs 939 app ids). steam-user instead requests first and
//! re-requests the `missingToken` ones; asking with tokens up front yields the same data in one
//! round trip. A denied id carries token 0. No token value is ever logged (T-79-28).

use gamelib_steamfiles::kv_bin::{self, BinLimits, BinNode};
use gamelib_steamfiles::kv_text::{self, Limits, Pair, Value as KvValue};
use serde_json::{json, Map, Value};

use crate::backend::{CmConn, LicenseEntry, PicsId, PicsRequest};
use crate::error::CmError;

/// PICS buffers up to 4 MiB (T-79-26).
const PICS_MAX_BYTES: usize = 4 * 1024 * 1024;
const PICS_MAX_DEPTH: usize = 64;
/// `Number.MAX_SAFE_INTEGER`.
const JS_SAFE_MAX: u64 = (1u64 << 53) - 1;

fn pics_parse() -> CmError {
    CmError::Protocol("pics-parse".into())
}

fn text_limits() -> Limits {
    Limits {
        max_bytes: PICS_MAX_BYTES,
        max_depth: PICS_MAX_DEPTH,
    }
}

fn bin_limits() -> BinLimits {
    BinLimits {
        max_bytes: PICS_MAX_BYTES,
        max_depth: PICS_MAX_DEPTH,
    }
}

/// `kvparser` string decoding: a backslash makes the next char literal.
fn kv_unescape(raw: &[u8]) -> String {
    let mut out = Vec::with_capacity(raw.len());
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'\\' && i + 1 < raw.len() {
            i += 1;
        }
        out.push(raw[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn pairs_to_json(pairs: &[Pair]) -> Value {
    let mut m = Map::new();
    for p in pairs {
        let key = kv_unescape(&p.key.0);
        let v = match &p.value {
            KvValue::Str(s) => Value::String(kv_unescape(&s.0)),
            KvValue::Map(children) => pairs_to_json(children),
        };
        // JS object assignment: later value (scalar or block) replaces an earlier one.
        m.insert(key, v);
    }
    Value::Object(m)
}

/// Depot ids under `depots` in source order, `None` when there is no `depots` block.
fn depot_order(root_children: &[Pair]) -> Option<Vec<String>> {
    let depots = root_children
        .iter()
        .find(|p| p.key.eq_ignore_ascii_case("depots"))?;
    let KvValue::Map(children) = &depots.value else {
        return None;
    };
    Some(
        children
            .iter()
            .filter(|p| matches!(p.value, KvValue::Map(_)))
            .map(|p| kv_unescape(&p.key.0))
            .filter(|k| !k.is_empty() && k.bytes().all(|b| b.is_ascii_digit()))
            .collect(),
    )
}

fn parse_app(buf: &[u8]) -> Result<(Value, Option<Vec<String>>), CmError> {
    // An app Steam answers without a buffer (a missing access token, or an app with no public
    // data) is an entry with no appinfo, not a malformed reply: failing the whole batch for one
    // such app broke Refresh's demo and platform stages (79-33 sweep). steam-user itself throws
    // on a null buffer; the empty-buffer case parses to an absent `appinfo` there.
    if buf.is_empty() {
        return Ok((Value::Null, None));
    }
    let text = buf.strip_suffix(&[0]).unwrap_or(buf);
    let pairs = kv_text::parse(text, &text_limits()).map_err(|_| pics_parse())?;
    // kvparser reads only the root block, `.appinfo` of it.
    let root = pairs.first().ok_or_else(pics_parse)?;
    let KvValue::Map(children) = &root.value else {
        return Err(pics_parse());
    };
    let order = depot_order(children);
    let value = if kv_unescape(&root.key.0) == "appinfo" {
        pairs_to_json(children)
    } else {
        Value::Null
    };
    Ok((value, order))
}

/// Text VDF app buffer to steam-user's `appinfo` object plus the depot ids in source order.
pub fn appinfo_to_json(buf: &[u8]) -> Result<(Value, Vec<String>), CmError> {
    let (v, order) = parse_app(buf)?;
    Ok((v, order.unwrap_or_default()))
}

/// JS `parseInt(key, 10)` for the digit-prefix cases that matter (`None` is NaN).
fn js_parse_int(s: &str) -> Option<i64> {
    let t = s.trim_start();
    let (neg, rest) = match t.strip_prefix('-') {
        Some(r) => (true, r),
        None => (false, t.strip_prefix('+').unwrap_or(t)),
    };
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        return None;
    }
    let n: i64 = digits.parse().ok()?;
    Some(if neg { -n } else { n })
}

fn long_json_u(v: u64) -> Value {
    if v <= JS_SAFE_MAX {
        json!(v)
    } else {
        Value::String(v.to_string())
    }
}

fn long_json_i(v: i64) -> Value {
    if v.unsigned_abs() <= JS_SAFE_MAX {
        json!(v)
    } else {
        Value::String(v.to_string())
    }
}

fn f32_json(b: [u8; 4]) -> Value {
    serde_json::Number::from_f64(f64::from(f32::from_le_bytes(b)))
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn node_to_json(n: &BinNode) -> Value {
    match n {
        BinNode::Map(m) => map_to_json(m),
        BinNode::Str(s) => Value::String(String::from_utf8_lossy(s).into_owned()),
        BinNode::Int32(v) => json!(v),
        BinNode::Color(b) | BinNode::Ptr(b) => json!(i32::from_le_bytes(*b)),
        BinNode::Float32(b) => f32_json(*b),
        BinNode::WStr(b) => {
            let units: Vec<u16> = b
                .as_chunks::<2>()
                .0
                .iter()
                .map(|c| u16::from_le_bytes(*c))
                .collect();
            Value::String(String::from_utf16_lossy(&units))
        }
        BinNode::Uint64(b) => long_json_u(u64::from_le_bytes(*b)),
        BinNode::Int64(b) => long_json_i(i64::from_le_bytes(*b)),
    }
}

/// `binarykvparser` object build plus `convertObject` (array-like and empty objects become arrays).
fn map_to_json(pairs: &[(Vec<u8>, BinNode)]) -> Value {
    let mut obj = Map::new();
    for (k, n) in pairs {
        if k.is_empty() {
            continue;
        }
        obj.insert(String::from_utf8_lossy(k).into_owned(), node_to_json(n));
    }
    let mut nums = Vec::with_capacity(obj.len());
    for k in obj.keys() {
        match js_parse_int(k) {
            Some(n) => nums.push(n),
            None => return Value::Object(obj),
        }
    }
    nums.sort_unstable();
    if nums
        .iter()
        .enumerate()
        .any(|(i, n)| i64::try_from(i) != Ok(*n))
    {
        return Value::Object(obj);
    }
    Value::Array(
        (0..obj.len())
            .map(|i| obj.get(&i.to_string()).cloned().unwrap_or(Value::Null))
            .collect(),
    )
}

/// Package buffer (4-byte header + binary KV) to steam-user's `packageinfo`:
/// `BinaryKVParser.parse(buffer)[packageid]`. The header is NOT the package id (real Steam sends
/// `01 00 00 00`; measured on a live account, 79-24): the root key is, so the lookup is by the
/// id Steam answered for.
pub fn packageinfo_to_json(buf: &[u8], package_id: u32) -> Result<Value, CmError> {
    let body = buf.get(4..).ok_or_else(pics_parse)?;
    let id = package_id.to_string();
    let doc = kv_bin::parse_bin(body, &bin_limits()).map_err(|_| pics_parse())?;
    Ok(doc
        .root
        .iter()
        .find(|(k, _)| k.as_slice() == id.as_bytes())
        .map(|(_, n)| node_to_json(n))
        .unwrap_or(Value::Null))
}

fn token_for(list: &[(u32, u64)], id: u32) -> u64 {
    list.iter()
        .find(|(i, _)| *i == id)
        .map(|(_, t)| *t)
        .unwrap_or(0)
}

/// steam-user's `getProductInfo` result for the requested ids.
///
/// Generic over the connection and does no session handling: the caller supplies the conn.
pub async fn product_info<C: CmConn>(
    conn: &C,
    apps: &[u32],
    packages: &[u32],
    incl_tokens: bool,
) -> Result<Value, CmError> {
    product_info_licensed(conn, apps, packages, incl_tokens, &[]).await
}

/// [`product_info`] with the account's licences: with `incl_tokens`, a package whose licence
/// carries a non-zero access token uses it (steam-user `apps.js` 215-223), ahead of the token
/// PICS hands back. Without this, packages come back with an empty buffer on a real account.
pub async fn product_info_licensed<C: CmConn>(
    conn: &C,
    apps: &[u32],
    packages: &[u32],
    incl_tokens: bool,
    licences: &[LicenseEntry],
) -> Result<Value, CmError> {
    let (app_tokens, pkg_tokens) = if incl_tokens {
        let t = conn
            .pics_access_tokens(apps.to_vec(), packages.to_vec())
            .await?;
        let mut pkg = t.packages;
        for &id in packages {
            if let Some(l) = licences
                .iter()
                .find(|l| l.package_id == id && l.access_token != 0)
            {
                pkg.retain(|(i, _)| *i != id);
                pkg.push((id, l.access_token));
            }
        }
        (t.apps, pkg)
    } else {
        (Vec::new(), Vec::new())
    };
    let req = PicsRequest {
        apps: apps
            .iter()
            .map(|&id| PicsId {
                id,
                access_token: token_for(&app_tokens, id),
            })
            .collect(),
        packages: packages
            .iter()
            .map(|&id| PicsId {
                id,
                access_token: token_for(&pkg_tokens, id),
            })
            .collect(),
        meta_data_only: false,
    };
    let raw = conn.pics_product_info(req).await?;

    let mut out_apps = Map::new();
    for a in &raw.apps {
        let (appinfo, order) = parse_app(&a.buffer)?;
        let mut e = Map::new();
        e.insert("changenumber".into(), json!(a.change_number));
        e.insert("missingToken".into(), json!(a.missing_token));
        e.insert("appinfo".into(), appinfo);
        if let Some(o) = order {
            e.insert("depotOrder".into(), json!(o));
        }
        out_apps.insert(a.app_id.to_string(), Value::Object(e));
    }
    let mut out_pkgs = Map::new();
    for p in &raw.packages {
        let info = if p.buffer.is_empty() {
            Value::Null
        } else {
            packageinfo_to_json(&p.buffer, p.package_id)?
        };
        out_pkgs.insert(
            p.package_id.to_string(),
            json!({
                "changenumber": p.change_number,
                "missingToken": p.missing_token,
                "packageinfo": info,
            }),
        );
    }
    // An id Steam reports unknown is reported, and never also present in apps/packages.
    let unknown_apps: Vec<u32> = raw.unknown_app_ids.clone();
    let unknown_pkgs: Vec<u32> = raw.unknown_package_ids.clone();
    Ok(json!({
        "apps": out_apps,
        "packages": out_pkgs,
        "unknownApps": unknown_apps,
        "unknownPackages": unknown_pkgs,
    }))
}

/// `client.licenses` element shape (`CMsgClientLicenseList.License` via `toObject({longs: String})`:
/// 64-bit fields are decimal strings).
pub fn licenses_json(l: &[LicenseEntry]) -> Value {
    Value::Array(
        l.iter()
            .map(|e| {
                json!({
                    "package_id": e.package_id,
                    "time_created": e.time_created,
                    "owner_id": e.owner_id,
                    "access_token": e.access_token.to_string(),
                    "license_type": e.license_type,
                    "flags": e.flags,
                })
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{AccessTokens, PicsAppRaw, PicsPackageRaw, PicsRaw};
    use crate::fake::FakeBackend;

    const APP: &[u8] = include_bytes!("../../tests/fixtures/pics/app.vdf");
    const PKG: &[u8] = include_bytes!("../../tests/fixtures/pics/package.bin");

    #[test]
    fn appinfo_typing_and_duplicates() {
        let (v, order) = appinfo_to_json(APP).unwrap();
        // every leaf is a string
        assert_eq!(v["appid"], "480");
        // backslash makes the next char literal: \n is the letter n, \" a quote
        let (esc, _) = appinfo_to_json(br#""appinfo" { "n" "Space\"war\n" }"#).unwrap();
        assert_eq!(esc["n"], "Space\"warn");
        // repeated block key REPLACES the earlier block (kvparser, no merge)
        assert_eq!(v["common"], json!({"type": "Demo"}));
        // repeated scalar is last-wins
        assert_eq!(v["dup"], "second");
        assert_eq!(v["depots"]["481"]["manifests"]["public"], "123");
        assert_eq!(order, vec!["481", "228990", "7"]);
    }

    #[test]
    fn appinfo_root_other_than_appinfo_is_null() {
        let (v, order) = appinfo_to_json(b"\"other\" { \"a\" \"b\" }").unwrap();
        assert_eq!(v, Value::Null);
        assert!(order.is_empty());
    }

    #[test]
    fn packageinfo_typing() {
        let v = packageinfo_to_json(PKG, 1234).unwrap();
        assert_eq!(v["billingtype"], 1);
        assert_eq!(v["status"], "ok");
        // array-like object becomes an array
        assert_eq!(v["appids"], json!([480, 481]));
        // uint64 above 2^53 stays a string, below is a number
        assert_eq!(v["big"], "1152921504606846976");
        assert_eq!(v["small"], 42);
        assert_eq!(v["f"], 1.5);
        // an empty object converts to an empty array
        assert_eq!(v["empty"], json!([]));
    }

    #[test]
    fn malformed_buffers_are_protocol_errors() {
        let bad = CmError::Protocol("pics-parse".into());
        assert_eq!(packageinfo_to_json(&[1, 2], 1).unwrap_err(), bad);
        assert_eq!(
            packageinfo_to_json(&[1, 0, 0, 0, 0, b'a'], 1).unwrap_err(),
            bad
        );
        assert_eq!(appinfo_to_json(b"\"appinfo\" { \"a\"").unwrap_err(), bad);
        let huge = vec![b'a'; PICS_MAX_BYTES + 1];
        assert_eq!(appinfo_to_json(&huge).unwrap_err(), bad);
        let deep = "\"appinfo\" { ".to_string() + &"\"k\" { ".repeat(200);
        assert_eq!(appinfo_to_json(deep.as_bytes()).unwrap_err(), bad);
    }

    fn scripted(tokens: bool) -> (FakeBackend, crate::fake::FakeConn) {
        use crate::backend::CmBackend;
        let b = FakeBackend::new();
        b.script(|s| {
            s.tokens.default = AccessTokens {
                apps: vec![(480, 111)],
                packages: vec![(1234, 222)],
                denied_apps: vec![],
                denied_packages: vec![],
            };
            s.pics.default = PicsRaw {
                apps: vec![PicsAppRaw {
                    app_id: 480,
                    change_number: 9,
                    missing_token: !tokens,
                    buffer: APP.to_vec(),
                }],
                packages: vec![
                    PicsPackageRaw {
                        package_id: 1234,
                        change_number: 5,
                        missing_token: false,
                        buffer: PKG.to_vec(),
                    },
                    PicsPackageRaw {
                        package_id: 77,
                        change_number: 1,
                        missing_token: true,
                        buffer: vec![],
                    },
                ],
                unknown_app_ids: vec![999],
                unknown_package_ids: vec![],
            };
        });
        let conn = futures_block(b.connect_anon()).unwrap();
        (b, conn)
    }

    fn futures_block<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap()
            .block_on(f)
    }

    #[test]
    fn tokens_first_then_info_with_tokens_on_every_entry() {
        let (b, conn) = scripted(true);
        let v = futures_block(product_info(&conn, &[480, 999], &[1234, 77], true)).unwrap();
        b.script(|s| {
            assert_eq!(s.log, vec!["pics_access_tokens", "pics_product_info"]);
            assert_eq!(s.token_reqs, vec![(vec![480, 999], vec![1234, 77])]);
            let r = &s.pics_reqs[0];
            let toks =
                |l: &Vec<PicsId>| l.iter().map(|p| (p.id, p.access_token)).collect::<Vec<_>>();
            assert_eq!(toks(&r.apps), vec![(480, 111), (999, 0)]);
            assert_eq!(toks(&r.packages), vec![(1234, 222), (77, 0)]);
        });
        assert_eq!(v["apps"]["480"]["changenumber"], 9);
        assert_eq!(v["apps"]["480"]["missingToken"], false);
        assert_eq!(
            v["apps"]["480"]["depotOrder"],
            json!(["481", "228990", "7"])
        );
        assert_eq!(
            v["packages"]["1234"]["packageinfo"]["appids"],
            json!([480, 481])
        );
        assert_eq!(v["packages"]["77"]["packageinfo"], Value::Null);
        assert_eq!(v["packages"]["77"]["missingToken"], true);
        assert_eq!(v["unknownApps"], json!([999]));
        assert_eq!(v["unknownPackages"], json!([]));
    }

    #[test]
    fn licence_token_is_used_for_a_package_with_incl_tokens() {
        let (b, conn) = scripted(true);
        let lic = |id, tok| LicenseEntry {
            package_id: id,
            access_token: tok,
            ..Default::default()
        };
        // 1234 has a licence token (wins over PICS's 222); 77 has a zero licence token (PICS's 0 stays).
        futures_block(product_info_licensed(
            &conn,
            &[],
            &[1234, 77],
            true,
            &[lic(1234, 555), lic(77, 0)],
        ))
        .unwrap();
        b.script(|s| {
            let toks: Vec<_> = s.pics_reqs[0]
                .packages
                .iter()
                .map(|p| (p.id, p.access_token))
                .collect();
            assert_eq!(toks, vec![(1234, 555), (77, 0)]);
        });
    }

    #[test]
    fn no_token_job_without_incl_tokens() {
        let (b, conn) = scripted(false);
        let v = futures_block(product_info(&conn, &[480], &[1234], false)).unwrap();
        b.script(|s| {
            assert_eq!(s.log, vec!["pics_product_info"]);
            let r = &s.pics_reqs[0];
            assert!(r
                .apps
                .iter()
                .chain(&r.packages)
                .all(|p| p.access_token == 0));
        });
        assert_eq!(v["apps"]["480"]["missingToken"], true);
    }

    #[test]
    fn app_without_depots_has_no_depot_order() {
        use crate::backend::CmBackend;
        let b = FakeBackend::new();
        b.script(|s| {
            s.pics.default = PicsRaw {
                apps: vec![PicsAppRaw {
                    app_id: 1,
                    change_number: 1,
                    missing_token: false,
                    buffer: b"\"appinfo\" { \"appid\" \"1\" }\0".to_vec(),
                }],
                ..Default::default()
            };
        });
        let conn = futures_block(b.connect_anon()).unwrap();
        let v = futures_block(product_info(&conn, &[1], &[], false)).unwrap();
        assert!(v["apps"]["1"].get("depotOrder").is_none());
        assert_eq!(v["apps"]["1"]["appinfo"]["appid"], "1");
    }

    #[test]
    fn app_with_empty_buffer_is_an_entry_without_appinfo_not_a_failed_batch() {
        use crate::backend::CmBackend;
        let b = FakeBackend::new();
        b.script(|s| {
            s.pics.default = PicsRaw {
                apps: vec![
                    PicsAppRaw {
                        app_id: 1,
                        change_number: 1,
                        missing_token: true,
                        buffer: Vec::new(),
                    },
                    PicsAppRaw {
                        app_id: 2,
                        change_number: 1,
                        missing_token: false,
                        buffer: b"\"appinfo\" { \"appid\" \"2\" }\0".to_vec(),
                    },
                ],
                ..Default::default()
            };
        });
        let conn = futures_block(b.connect_anon()).unwrap();
        let v = futures_block(product_info(&conn, &[1, 2], &[], false)).unwrap();
        assert_eq!(v["apps"]["1"]["missingToken"], true);
        assert!(v["apps"]["1"]["appinfo"].is_null());
        assert!(v["apps"]["1"].get("depotOrder").is_none());
        assert_eq!(v["apps"]["2"]["appinfo"]["appid"], "2");
    }

    #[test]
    fn parse_failure_propagates() {
        use crate::backend::CmBackend;
        let b = FakeBackend::new();
        b.script(|s| {
            s.pics.default = PicsRaw {
                packages: vec![PicsPackageRaw {
                    package_id: 1,
                    buffer: vec![1, 0, 0, 0, 9],
                    ..Default::default()
                }],
                ..Default::default()
            };
        });
        let conn = futures_block(b.connect_anon()).unwrap();
        let e = futures_block(product_info(&conn, &[], &[1], false)).unwrap_err();
        assert_eq!(e, CmError::Protocol("pics-parse".into()));
    }

    #[test]
    fn licenses_shape() {
        let v = licenses_json(&[LicenseEntry {
            package_id: 5,
            time_created: 6,
            owner_id: 7,
            access_token: 8,
            license_type: 1,
            flags: 2,
        }]);
        assert_eq!(
            v,
            json!([{"package_id":5,"time_created":6,"owner_id":7,"access_token":"8","license_type":1,"flags":2}])
        );
    }
}
