//! Tauri-free Steam CM client library. `dispatch` is the single entry point shared by the
//! in-process sidecar bridge and `gamelib-steamcm-cli`.
//!
//! Results, not errors: a CM failure is a typed result `{ok:false, kind, eresult?}`, never `Err`.
//! `Err` means bad arguments, an unknown op, a panic or a serialize failure only.
//!
//! Secret hygiene (T-28-04): never log args, results, tokens, passwords or request codes, and
//! never derive `Debug` on a secret-bearing struct.

pub mod anon;
pub mod backend;
pub mod error;
pub mod facade;
#[cfg(test)]
pub(crate) mod fake;
pub mod liveness;
pub mod macowned;
pub mod ops;
pub mod refresh;
pub mod runtime;
pub mod session;
pub mod vent;
pub mod webauth;
pub mod wrap;

use serde::Deserialize;
use serde_json::Value;

/// Ops reachable from the sidecar and the CLI. Keep sorted. CLI-only ops are listed here too
/// (the library dispatches them) and again in `CLI_ONLY_OPS`.
pub const OPS: &[&str] = &[
    "steamcm_anon_close",
    "steamcm_anon_product_info",
    "steamcm_capture_anon_pics",
    "steamcm_configure",
    "steamcm_content_servers",
    "steamcm_depot_key",
    "steamcm_licenses",
    "steamcm_mac_owned_apps",
    "steamcm_manifest_request_code",
    "steamcm_owned_apps",
    "steamcm_personas",
    "steamcm_product_info",
    "steamcm_redeem_key",
    "steamcm_refresh",
    "steamcm_session_acquire",
    "steamcm_session_acquire_open",
    "steamcm_session_ensure_connected",
    "steamcm_session_logout",
    "steamcm_session_release",
    "steamcm_session_shutdown",
    "steamcm_session_status",
    "steamcm_signin_cancel",
    "steamcm_signin_credentials_start",
    "steamcm_signin_guard_submit",
    "steamcm_signin_qr_start",
    "steamcm_signin_status",
    "steamcm_store_appdetails",
    "steamcm_store_enrich",
    "steamcm_wrap_restore_if_owed",
];
/// Ops reachable from the CLI only (the sidecar bridge does not expose them).
pub const CLI_ONLY_OPS: &[&str] = &["steamcm_capture_anon_pics"];

/// Install the process-wide rustls crypto provider (ring, CF-07). Idempotent: an already-installed
/// provider is not an error.
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &[Value]) -> Result<T, String> {
    let bad = || format!("{op}:bad-args");
    if args.len() != 1 {
        return Err(bad());
    }
    serde_json::from_value(args[0].clone()).map_err(|_| bad())
}

/// A no-arg op. The app-side contract sends these as `[]` (`z.tuple([])`); `[{}]` is also accepted.
fn no_args(op: &str, args: &[Value]) -> Result<(), String> {
    match args {
        [] => Ok(()),
        [one] => serde_json::from_value::<EmptyArgs>(one.clone())
            .map(|_| ())
            .map_err(|_| format!("{op}:bad-args")),
        _ => Err(format!("{op}:bad-args")),
    }
}

// Arg structs. None derives Debug: several carry a refresh token, password, code or key.

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyArgs {}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ConfigureArgs {
    app_folder: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AcquireArgs {
    refresh_token: String,
    reason: String,
    logon_id: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReasonArgs {
    reason: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct LeaseArgs {
    lease_id: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BoundArgs {
    bound_ms: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ProductInfoArgs {
    lease_id: u32,
    apps: Vec<u32>,
    packages: Vec<u32>,
    incl_tokens: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AnonProductInfoArgs {
    apps: Vec<u32>,
    packages: Vec<u32>,
    incl_tokens: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DepotKeyArgs {
    lease_id: u32,
    app_id: u32,
    depot_id: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RequestCodeArgs {
    lease_id: u32,
    app_id: u32,
    depot_id: u32,
    manifest_id: String,
    branch: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ContentServersArgs {
    lease_id: u32,
    app_id: Option<u32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct OwnedArgs {
    lease_id: u32,
    steam_id: String,
    include_appinfo: bool,
    include_played_free_games: bool,
    include_free_sub: bool,
    skip_unvetted_apps: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PersonasArgs {
    lease_id: u32,
    steam_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RedeemArgs {
    lease_id: u32,
    key: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppsArgs {
    apps: Vec<u32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CredentialsArgs {
    account_name: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct GuardArgs {
    flow_id: String,
    code: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct FlowArgs {
    flow_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum TriggerArg {
    Boot,
    Shutdown,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WrapArgs {
    trigger: TriggerArg,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct StoreEnrichArgs {
    app_id: String,
    cached: Option<refresh::meta_entry::SteamMetadataEntry>,
    current: Value,
    known_fix_mac32: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct MacOwnedAppsArgs {
    helper_path: String,
    steam_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct StoreAppdetailsArgs {
    app_id: String,
}

fn id64(op: &str, s: &str) -> Result<u64, String> {
    s.parse::<u64>().map_err(|_| format!("{op}:bad-args"))
}

fn run_op(op: &str, args: &[Value]) -> Result<Value, String> {
    use session::RestoreTrigger;
    match op {
        #[cfg(test)]
        "__panic_probe" => panic!("probe"),
        "steamcm_configure" => {
            let a: ConfigureArgs = parse_args(op, args)?;
            facade::configure(&a.app_folder)
        }
        "steamcm_session_acquire" => {
            let a: AcquireArgs = parse_args(op, args)?;
            facade::session_acquire(a.refresh_token, a.reason, a.logon_id)
        }
        "steamcm_session_acquire_open" => {
            let a: ReasonArgs = parse_args(op, args)?;
            facade::session_acquire_open(a.reason)
        }
        "steamcm_session_release" => {
            let a: LeaseArgs = parse_args(op, args)?;
            facade::session_release(a.lease_id)
        }
        "steamcm_session_ensure_connected" => {
            no_args(op, args)?;
            facade::session_ensure_connected()
        }
        "steamcm_session_logout" => {
            no_args(op, args)?;
            facade::session_logout()
        }
        "steamcm_session_shutdown" => {
            let a: BoundArgs = parse_args(op, args)?;
            facade::session_shutdown(std::time::Duration::from_millis(a.bound_ms))
        }
        "steamcm_session_status" => {
            no_args(op, args)?;
            facade::session_status()
        }
        "steamcm_licenses" => {
            let a: LeaseArgs = parse_args(op, args)?;
            facade::licenses(a.lease_id)
        }
        "steamcm_product_info" => {
            let a: ProductInfoArgs = parse_args(op, args)?;
            facade::product_info(a.lease_id, a.apps, a.packages, a.incl_tokens)
        }
        "steamcm_depot_key" => {
            let a: DepotKeyArgs = parse_args(op, args)?;
            facade::depot_key(a.lease_id, a.app_id, a.depot_id)
        }
        "steamcm_manifest_request_code" => {
            let a: RequestCodeArgs = parse_args(op, args)?;
            facade::manifest_request_code(a.lease_id, a.app_id, a.depot_id, a.manifest_id, a.branch)
        }
        "steamcm_content_servers" => {
            let a: ContentServersArgs = parse_args(op, args)?;
            facade::content_servers(a.lease_id, a.app_id)
        }
        "steamcm_owned_apps" => {
            let a: OwnedArgs = parse_args(op, args)?;
            let steam_id = id64(op, &a.steam_id)?;
            facade::owned_apps(
                a.lease_id,
                steam_id,
                backend::OwnedOpts {
                    include_appinfo: a.include_appinfo,
                    include_played_free_games: a.include_played_free_games,
                    include_free_sub: a.include_free_sub,
                    skip_unvetted_apps: a.skip_unvetted_apps,
                },
            )
        }
        "steamcm_personas" => {
            let a: PersonasArgs = parse_args(op, args)?;
            let ids = a
                .steam_ids
                .iter()
                .map(|s| id64(op, s))
                .collect::<Result<Vec<_>, _>>()?;
            facade::personas(a.lease_id, ids)
        }
        "steamcm_redeem_key" => {
            let a: RedeemArgs = parse_args(op, args)?;
            facade::redeem_key(a.lease_id, a.key)
        }
        "steamcm_anon_product_info" => {
            let a: AnonProductInfoArgs = parse_args(op, args)?;
            facade::anon_product_info(a.apps, a.packages, a.incl_tokens)
        }
        "steamcm_anon_close" => {
            let a: ReasonArgs = parse_args(op, args)?;
            facade::anon_close(&a.reason)
        }
        "steamcm_capture_anon_pics" => {
            let a: AppsArgs = parse_args(op, args)?;
            facade::capture_anon_pics(a.apps)
        }
        "steamcm_refresh" => {
            let a: refresh::RefreshArgs = parse_args(op, args)?;
            // The Mac source validates its own SteamID and answers with a typed fallback.
            if let refresh::RefreshSource::Cm { steam_id, .. } = &a.source {
                id64(op, steam_id)?;
            }
            facade::refresh_library(a)
        }
        "steamcm_mac_owned_apps" => {
            let a: MacOwnedAppsArgs = parse_args(op, args)?;
            let id = id64(op, &a.steam_id)?;
            facade::mac_owned_apps(&a.helper_path, id)
        }
        "steamcm_store_enrich" => {
            let a: StoreEnrichArgs = parse_args(op, args)?;
            facade::store_enrich(&a.app_id, a.cached, a.current, a.known_fix_mac32)
        }
        "steamcm_store_appdetails" => {
            let a: StoreAppdetailsArgs = parse_args(op, args)?;
            facade::store_appdetails(&a.app_id)
        }
        "steamcm_signin_qr_start" => {
            no_args(op, args)?;
            facade::signin_qr_start()
        }
        "steamcm_signin_credentials_start" => {
            let a: CredentialsArgs = parse_args(op, args)?;
            facade::signin_credentials_start(a.account_name, a.password)
        }
        "steamcm_signin_guard_submit" => {
            let a: GuardArgs = parse_args(op, args)?;
            facade::signin_guard_submit(a.flow_id, a.code)
        }
        "steamcm_signin_status" => {
            let a: FlowArgs = parse_args(op, args)?;
            facade::signin_status(&a.flow_id)
        }
        "steamcm_signin_cancel" => {
            let a: FlowArgs = parse_args(op, args)?;
            facade::signin_cancel(&a.flow_id)
        }
        "steamcm_wrap_restore_if_owed" => {
            let a: WrapArgs = parse_args(op, args)?;
            facade::wrap_restore_if_owed(match a.trigger {
                TriggerArg::Boot => RestoreTrigger::Boot,
                TriggerArg::Shutdown => RestoreTrigger::Shutdown,
            })
        }
        _ => Err(format!("unknown-op:{op}")),
    }
}

pub fn dispatch(op: &str, args: &[Value]) -> Result<Value, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_op(op, args)))
        .unwrap_or_else(|_| Err(format!("{op}:panic")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unknown_op() {
        assert_eq!(
            dispatch("nope", &[json!({})]),
            Err("unknown-op:nope".to_string())
        );
    }

    #[test]
    fn panic_is_caught() {
        assert_eq!(
            dispatch("__panic_probe", &[]),
            Err("__panic_probe:panic".to_string())
        );
    }

    #[test]
    fn ops_list_is_sorted_and_unique() {
        let mut v: Vec<&str> = OPS.to_vec();
        v.sort_unstable();
        v.dedup();
        assert_eq!(v, OPS.to_vec());
        assert!(!OPS.contains(&"__panic_probe"));
    }

    #[test]
    fn cli_only_ops_are_registered() {
        for op in CLI_ONLY_OPS {
            assert!(OPS.contains(op), "{op}");
        }
    }

    #[test]
    fn parse_args_requires_exactly_one() {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct A {
            #[allow(dead_code)]
            x: u8,
        }
        assert_eq!(
            parse_args::<A>("o", &[]).err(),
            Some("o:bad-args".to_string())
        );
        assert!(parse_args::<A>("o", &[json!({"x": 1})]).is_ok());
        assert!(parse_args::<A>("o", &[json!({"x": 1, "y": 2})]).is_err());
    }

    #[test]
    fn no_arg_ops_accept_the_empty_tuple_the_app_sends() {
        // The app's zod contract sends no-arg channels as `[]`; requiring `[{}]` broke QR sign-in live.
        assert!(no_args("o", &[]).is_ok());
        assert!(no_args("o", &[json!({})]).is_ok());
        assert_eq!(
            no_args("o", &[json!({"x": 1})]).err(),
            Some("o:bad-args".to_string())
        );
        assert_eq!(
            no_args("o", &[json!("bad")]).err(),
            Some("o:bad-args".to_string())
        );
        assert_eq!(
            no_args("o", &[json!({}), json!({})]).err(),
            Some("o:bad-args".to_string())
        );
    }

    #[test]
    fn ops_are_the_full_table_and_every_op_is_routed() {
        assert_eq!(OPS.len(), 29);
        assert_eq!(CLI_ONLY_OPS, &["steamcm_capture_anon_pics"]);
        for op in OPS {
            // Bad args (a string, not an object) must reach the arg parser, never `unknown-op`.
            let e = dispatch(op, &[json!("bad")]).unwrap_err();
            assert_eq!(e, format!("{op}:bad-args"), "{op}");
        }
    }

    #[test]
    fn extra_field_is_bad_args() {
        let r = dispatch(
            "steamcm_session_acquire",
            &[json!({"refreshToken": "x", "reason": "login", "logonId": 0, "extra": 1})],
        );
        assert_eq!(r, Err("steamcm_session_acquire:bad-args".to_string()));
        assert_eq!(
            dispatch("steamcm_session_status", &[json!({}), json!({})]),
            Err("steamcm_session_status:bad-args".to_string())
        );
    }

    #[test]
    fn non_decimal_steam_id_is_bad_args() {
        let r = dispatch(
            "steamcm_owned_apps",
            &[
                json!({"leaseId": 1, "steamId": "abc", "includeAppinfo": true,
                "includePlayedFreeGames": true, "includeFreeSub": false,
                "skipUnvettedApps": true}),
            ],
        );
        assert_eq!(r, Err("steamcm_owned_apps:bad-args".to_string()));
    }

    #[test]
    fn refresh_with_an_unknown_lease_is_a_typed_result() {
        let base = json!({"source": {"kind": "cm", "leaseId": 9, "steamId": "76561198000000001"},
            "metadata": {}, "previousGames": [], "installState": {},
            "bridgeAllowlist": [], "knownFixMac32": [], "isMac": false});
        let v = dispatch("steamcm_refresh", std::slice::from_ref(&base)).unwrap();
        assert_eq!(v, json!({"ok": false, "kind": "leaseUnknown"}));
        let mut extra = base.clone();
        extra["x"] = json!(1);
        assert_eq!(
            dispatch("steamcm_refresh", &[extra]),
            Err("steamcm_refresh:bad-args".to_string())
        );
        let mut badid = base;
        badid["source"]["steamId"] = json!("abc");
        assert_eq!(
            dispatch("steamcm_refresh", &[badid]),
            Err("steamcm_refresh:bad-args".to_string())
        );
    }

    #[test]
    fn store_ops_reject_a_non_numeric_app_id_without_a_request() {
        let e = dispatch(
            "steamcm_store_enrich",
            &[json!({"appId": "abc", "cached": null, "current": {}, "knownFixMac32": false})],
        )
        .unwrap();
        assert_eq!(e, json!({"ok": false, "kind": "badAppId"}));
        let d = dispatch("steamcm_store_appdetails", &[json!({"appId": "abc"})]).unwrap();
        assert_eq!(d, json!({"ok": false, "kind": "badAppId"}));
    }

    #[test]
    fn status_runs_unconfigured_through_dispatch() {
        let v = dispatch("steamcm_session_status", &[json!({})]).unwrap();
        assert_eq!(v["leaseCount"], 0);
    }

    #[test]
    fn crypto_provider_install_is_idempotent() {
        install_crypto_provider();
        install_crypto_provider();
    }
}
