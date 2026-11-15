//! Op table for the shell and `gamelib-steampoll-cli`. The arm table is plan 17's deliverable;
//! until then every op answers `{op}:unknown-op`. `dispatch` is wrapped in `catch_unwind`
//! (T-80-03) so a panic is `{op}:panic`.

use serde_json::Value;

/// Ops reachable from the shell. Keep sorted.
pub const OPS: &[&str] = &[
    "steampoll_acf_enumerate_copies",
    "steampoll_acf_find_other_manifests",
    "steampoll_acf_read_state",
    "steampoll_acf_read_update",
    "steampoll_acf_read_update_from_dir",
    "steampoll_acf_remove_copy",
    "steampoll_acf_scan_downloading",
    "steampoll_breadcrumb_installed_on_disk",
    "steampoll_bridge_finalized",
    "steampoll_install_cancel_delegated",
    "steampoll_install_start",
    "steampoll_install_stop",
    "steampoll_mac_arch_verdict",
    "steampoll_native_in_flight",
    "steampoll_next_notice_seq",
    "steampoll_read_running_app_id",
    "steampoll_running_hold",
    "steampoll_running_last_app_id",
    "steampoll_running_release",
    "steampoll_running_start",
    "steampoll_running_stop",
    "steampoll_status",
    "steampoll_uninstall_start",
    "steampoll_uninstall_stop",
];

fn run_op(op: &str, _args: &[Value]) -> Result<Value, String> {
    Err(format!("{op}:unknown-op"))
}

pub fn dispatch(op: &str, args: &[Value]) -> Result<Value, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_op(op, args)))
        .unwrap_or_else(|_| Err(format!("{op}:panic")))
}
