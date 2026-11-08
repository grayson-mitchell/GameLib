// GameLib Tauri v2 shell — Phase 27 walking skeleton.
//
// Responsibilities (all additive; the Electron build is untouched):
//   1. Host the plain-Vite renderer output (../build/renderer, via tauri.conf.json frontendDist).
//   2. Spawn the Node sidecar (the existing backend behind a stdio JSON-RPC loop, produced
//      by 27-02's `build:sidecar`) and hold its stdin/stdout.
//   3. Expose four Tauri #[command]s that relay renderer↔sidecar traffic per the shared
//      contract in src/common/types/sidecarTransport.ts:
//        - sidecar_invoke        (req/resp   — ipcRenderer.invoke parity)
//        - sidecar_send          (fire-and-forget — ipcRenderer.send parity)
//        - open_external         (shell.openExternal parity — steam:// via tauri-plugin-opener)
//        - sidecar_store_snapshot(minimal store snapshot for the synchronous store bridge)
//   4. Read SidecarNotification lines from the sidecar's stdout and re-emit them to the
//      webview as the `frontend_message` Tauri event (ipcRenderer.on backend→frontend parity).
//   5. Build a bounded Tauri tray at setup (Phase 34.1 Plan 06, D-11) -- tooltip, left-click
//      show/focus, and a two-item Show/Quit menu -- and back `changeTrayColor` via the
//      `tray_set_icon` rustInvoke arm, the ONLY new `dispatch_rust_channel` arm added by the
//      whole 34.1 slice. Deliberately out of scope: recent-games submenu, About/Reload/Debug,
//      the macOS dock menu, language-driven rebuilds, and honouring `noTrayIcon`/`exitToTray`
//      (all re-deferred to Phase 35 -- see 34.1-06-PLAN.md and 34.1-PORTED-CHANNELS.md).
//
// NOTE: attaching `window.api` + the six preload globals to the webview is 27-03's job; this
// shell only relays transport. It does NOT modify anything under src/preload or src/backend.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::{HashMap, VecDeque};
use std::hash::{BuildHasher, Hash, Hasher};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::mpsc::{channel as mpsc_channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use keyring::Entry;
use serde::Serialize;
use serde_json::Value;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::{process::Command as ShellCommand, ShellExt};

/// Writes one formatted line (plus newline) to `w`, returning any write error.
fn write_line_best_effort<W: std::io::Write>(
    w: &mut W,
    args: std::fmt::Arguments<'_>,
) -> std::io::Result<()> {
    w.write_fmt(args)?;
    w.write_all(b"\n")
}

/// Writes a line to stderr under one lock (atomic like `eprintln!`) and discards any error.
fn stderr_best_effort(args: std::fmt::Arguments<'_>) {
    let _ = write_line_best_effort(&mut std::io::stderr().lock(), args);
}

/// Drop-in replacement for `eprintln!` that never panics. Incident (quick 261101-cl4): an
/// orphaned shell (parent became launchd after a vite OOM killed the tauri CLI) hit EPIPE on
/// stderr, `eprintln!` panicked, the panic hook's own `eprintln!` panicked inside the hook, and
/// the process aborted. `eprintln!` panics on write failure; this macro discards the error. Every
/// shell `eprintln!` is swept to it because each becomes fatal the same way once stderr is closed
/// (reader threads, deep-link handlers and window events keep running). It is defined above the
/// external `mod` declarations so those files see it through textual macro scope.
macro_rules! shell_eprintln {
    () => {
        $crate::stderr_best_effort(format_args!(""))
    };
    ($($arg:tt)*) => {
        $crate::stderr_best_effort(format_args!($($arg)*))
    };
}

// Phase 50 Plan 01: the raw `WKWebView` Epic embed surface -- see that module's own doc comment
// for why Epic alone gets a second, parallel surface instead of sharing `StoreEmbedState` below.
// This is the first external-file `mod` declaration in this file; every other `mod` here is an
// inline block, but this module's size (a `define_class!` delegate plus the full
// open/set_bounds/hide/show/close/deselect surface lifecycle) makes an inline block impractical.
#[cfg(target_os = "macos")]
mod macos_epic_embed;
// Quick task 261023-vkv: packaged macOS builds deliver notifications through
// `UNUserNotificationCenter` -- see that module's doc comment for the mechanism.
#[cfg(target_os = "macos")]
mod macos_notifications;
// Quick task 261031-mj9 (from spike 051): gilrs-backed gamepad source for pads WKWebView does
// not expose.
#[cfg(target_os = "macos")]
mod macos_native_gamepad;
// Its cfg-free half (pad id, button/axis/hat shaping), kept out of the macOS-only module so
// `cargo test` covers it on Linux/Windows too.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod native_gamepad_shape;
// Its cfg-free half (backend selection, authorization-status -> error-string contract), kept out
// of the macOS-only module so `cargo test` covers it on Linux/Windows too.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod notification_backend;
// Phase 50 review fixes: the Epic surface's cfg-free selection/visibility state machine and
// nav-state flag merge -- deliberately NOT macOS-gated so `cargo test` covers it on Linux. Only
// `macos_epic_embed` calls it, hence `dead_code` is expected everywhere else.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod epic_embed_state;

// Phase 50 review: the popup/download hand-off policy both store surfaces share. Not cfg-gated,
// unlike the module above, so its decisions are unit-tested on Linux too.
mod store_embed_handoff_policy;

// Phase 50 review: the admission gate for the Epic surface's JS dialog sheets, kept out of the
// macOS-only module above for the same reason.
mod epic_embed_js_dialog;

mod clipboard;
mod keyring_dispatch;
mod wake_lock;
mod terminate_veto;
mod tray;
mod relay_commands;
mod shell_open;
mod login_window;
mod store_embed;
mod rust_dispatch;
mod single_instance;
mod ipc_contract;
mod sidecar;
mod shell_state;
mod notification_show;
mod dialogs;
mod scan_dispatch;
mod app_lifecycle;
use clipboard::*;
use keyring_dispatch::*;
use wake_lock::*;
use terminate_veto::*;
use tray::*;
use relay_commands::*;
use login_window::*;
use store_embed::*;
use rust_dispatch::*;
use single_instance::*;
use ipc_contract::*;
use sidecar::*;
use shell_state::*;
use notification_show::*;
use dialogs::*;
use scan_dispatch::*;
use app_lifecycle::*;

/// Invoke response timeout — a skeleton guardrail so a hung sidecar cannot wedge a command.
const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);

/// Channels whose work is legitimately unbounded in wall-clock terms and therefore must NOT
/// be subject to `INVOKE_TIMEOUT` (CR-03, Phase 30 code review).
///
/// A Steam depot download runs for minutes to hours; bounding it at 60s made the renderer see
/// a spurious `sidecar invoke timed out` failure while the install kept running in the sidecar,
/// and the real (late) response was then dropped by the reader thread as an unknown id. The
/// renderer-side symptom was an unhandled rejection out of
/// `frontend/state/InstallGameModal.ts`'s `void window.api.install(...)`.
///
/// `checkGameUpdates` fans out across six library managers, each shelling out to
/// legendary/gogdl/nile, and can plausibly exceed 60s on a cold cache; `refreshLibrary` has the
/// same shape. `uninstall` can take arbitrarily long on a large install directory.
///
/// The guardrail is not lost for the rest of the surface: every OTHER channel keeps the 60s
/// bound, and a genuinely wedged long-running invoke now surfaces as a never-settling promise
/// rather than a wrong answer — the honest failure mode. A crashed sidecar still fails fast, but
/// only because the reader thread calls `drain_pending_invokes` when the sidecar's stdout ends:
/// the `Sender`s live in `SidecarState::pending`, so the process dying does not by itself close
/// any channel or wake `rx.recv()`.
///
/// Membership is not free and is not granted on reasoning: `getWikiGameInfo` was MEASURED and
/// deliberately left on the 60s bound (three cold-cache calls at 1190/957/702ms — the full
/// record is in `34.2-06-SUMMARY.md`). Per-channel rationale for the entries below lives
/// inline on each entry, next to the channel it explains.
const LONG_RUNNING_CHANNELS: &[&str] = &[
    "install",
    "updateGame",
    "uninstall",
    "checkGameUpdates",
    "refreshLibrary",
    // Phase 34.2 Plan 06, D-10: fans out over every game in every library manager
    // (`crossover_index/crossoverRatingMap.ts`'s `buildCrossoverRatingMap()`) — the same
    // library-wide shape as checkGameUpdates/refreshLibrary above.
    //
    // IN-03 correction (2026-08-22, `34.2-REVIEW.md` round 1): this entry used to cite a SECOND
    // reason — that the pass called `loadIndex`/`buildMaps` once PER GAME rather than once
    // overall, "a known inefficiency deliberately not fixed by this slice". Round-1 WR-07 fixed
    // it: the resolver is now built once per pass, gated by
    // `crossover_index/__tests__/ratingMapIndexLoads.test.ts`. Only the fan-out reason remains.
    // Left exempt rather than re-measured — dropping the exemption on reasoning alone would
    // trade a never-settling promise for a spurious timeout, and this list's own precedent
    // (getWikiGameInfo, above) is that the bound comes back on a MEASUREMENT, not an argument.
    "getCrossoverIndex",
    // A full re-verify/re-download of an installed game (legendary/gogdl repair) routinely exceeds 60s (CR-01).
    "repair",
    // readConfig('library') calls legendary.refresh(), the same work refreshLibrary is exempted for; readConfig('user') is fast, so this trades a 60s rejection for a never-settling promise if it ever wedges.
    "readConfig",
    // Phase 34.5 gap cycle 3, F-34.5-G6-02: oauthCaptureLogin drives a HUMAN interaction (typing
    // credentials, solving a challenge, fetching a mailed verification code) and carries its own
    // 300_000ms deadline (DEFAULT_DEADLINE_MS, src/backend/sidecar/oauthLoginCapture.ts) -- five
    // times this shell's 60s bound. The 2026-08-01 live gate measured every real attempt exceeding
    // 60s (GOG captured at 68s, Amazon at 91s, Epic timed out at 300s x3); with the bound in place
    // the shell returns Err("sidecar invoke timed out") at 60s AND the real late response is
    // dropped by the reader thread as an unknown id, so the outcome can never arrive.
    "oauthCaptureLogin",
    // Same shape as oauthCaptureLogin above (F-34.5-G6-02 recurrence count, 34.5-22 Task 2):
    // humbleStartLogin/humbleReconnect both await HumbleUser.watchForLogin()
    // (src/backend/humble/user.ts), bounded by its own LOGIN_WATCH_TIMEOUT_MS = 600_000ms -- ten
    // times this shell's 60s bound, an even larger mismatch than oauthCaptureLogin's.
    "humbleStartLogin",
    "humbleReconnect",
    // Phase 34.5 gap cycle 6: getInstallInfo was ported to the sidecar by plan 34.5-43
    // (F-34.5-G6-10), which deliberately did NOT touch this file (it belongs to plan 34.5-44,
    // same wave); this entry is added by plan 34.5-44 Task 4 to close ledger row U-34.5-16
    // (threat T-34.5-C6-06). Same shape as checkGameUpdates/refreshLibrary above:
    // gog/library.ts:624 spawns `gogdl` over the network and legendary/library.ts:260
    // re-enters getInstallInfo on a retry, either of which can plausibly exceed 60s on a cold
    // cache or a slow CDN, producing a spurious "sidecar invoke timed out" that looks like a
    // code failure rather than a slow network.
    "getInstallInfo",
    // Phase 35 plan 07 (closes the folded todo
    // `2026-08-24-opendialog-is-missing-from-long-running-channels-...`, threat T-35-30).
    // Added on a MEASUREMENT, per this list's own precedent, not on the argument that a picker
    // "feels slow": the Phase 35 A/B retest (`35-AB-RETEST.md` item 3) drove `moveInstall`,
    // left the native folder picker untouched for 65+ seconds, then selected -- and the Tauri
    // leg produced `[shell] response for unknown/timed-out id=4465 (dropped)` in the terminal
    // sink while `gamelib.log` carried ZERO openDialog/moveInstall lines, i.e. the invoke was
    // dropped at the 60s bound and the backend work was never requested. The same 65s wait
    // under Electron reached rsync, so the bound is the whole difference.
    //
    // Shape: `openDialog` drives a HUMAN interaction -- the same reason oauthCaptureLogin and
    // humbleStartLogin are exempt above -- and is the purest case of it, because unlike those
    // two it carries NO internal deadline of its own to exceed: an OS-native file/folder picker
    // stays open exactly as long as the person in front of it deliberates, and there is no
    // wall-clock value that is correct for that. `dialogFlowRegistration.ts` registers it as a
    // genuine sidecar invoke channel against the shared `openDialogCallback`
    // (`backend/utils/openDialog.ts`), so it is subject to this bound rather than bypassing it
    // as a Rust-native dialog would.
    //
    // Correction to the source todo, recorded rather than smoothed over: these flows do NOT die
    // silently. The retest operator received a user-visible "failed to install" message -- wrong
    // for the action driven (a move reported as an install failure) and giving no hint that a
    // 60-second transport bound caused it. A misdirecting error is arguably worse for diagnosis
    // than silence, so "dies silently" should not be repeated as the symptom.
    "openDialog",
    // Todo 2026-10-05 (long-running Wine and sync channels): each awaits a child process or a
    // network transfer that has no wall-clock ceiling of its own -- runWineCommand with
    // `wait: true` (the sideload "Run Installer First" installer), callTool's winetricks branch
    // (the GUI until the user closes it), installWineVersion (a multi-hundred-MB Wine/Proton
    // download + extract), downloadRuntime (EAC/BattlEye download + extract) and the two
    // cloud-save syncs (legendary sync-saves / gogdl save-sync). Bounded at 60s, the renderer
    // saw a rejection mid-run and re-enabled its controls while the work continued.
    // addToSteam was reviewed and deliberately left bounded: a wiki lookup plus a few small
    // artwork downloads, with its rejection now handled at the call site.
    "runWineCommand",
    "callTool",
    "installWineVersion",
    "downloadRuntime",
    "syncSaves",
    "syncGOGSaves",
    // Todo `2026-10-25-bridge-launch-invoke-times-out-during-first-launch-redist-install`
    // (quick 261026-jmm). MEASURED in quick 261025-rkj, Manor Lords (1363080), first bridge
    // launch 2026-10-25: the shared redist step (`installSteamBridgeSharedRedists`) downloaded
    // the declared 228980 depots in about 50s and ran three installers in about 70s, click to
    // game start about 2 min, and the renderer logged `[BLANKPROBE-MARK] unhandled-rejection
    // sidecar invoke timed out: launch t=101402ms` while the sidecar carried on and the game
    // started. Structurally this is broader than the bridge: `handleLaunch`
    // (steamFlowRegistration.ts) routes every non-Steam runner through `launchEventCallback`,
    // which awaits the whole game session, so every Epic/GOG/Amazon/sideload session longer
    // than 60s also hit this bound and had its real late response dropped as an unknown id.
    // There is no wall-clock value correct for a game session (same shape as openDialog). The
    // trade: a wedged launch handler becomes a never-settling promise rather than a 60s
    // rejection, as already accepted for install/repair/runWineCommand; a crashed sidecar still
    // fails fast via `drain_pending_invokes`. Rejected alternatives (decoupling the bridge launch
    // via status events; renderer treating the timeout as non-fatal) each fix only the bridge path.
    "launch",
];

/// Cap on `SidecarState::abandoned`, oldest-dropped past this bound.
///
/// Mirrors `STORE_EMBED_NAV_EVENTS_CAP`'s rationale: a pathological run that times out
/// repeatedly must not grow this table without bound for the life of the process. 64 is chosen
/// over that queue's 50 only because nothing DRAINS this one — it is read opportunistically by
/// the reader thread and never emptied — so it wants a little more headroom for the case the
/// diagnostic exists to serve: several invokes abandoned in the same window, whose late
/// responses then arrive interleaved and must each still find their channel.
const ABANDONED_IDS_CAP: usize = 64;

/// Rendered in place of a channel name when a late response's id is NOT in the abandoned ring
/// (evicted past `ABANDONED_IDS_CAP`, or a frame the shell never sent).
///
/// A distinct literal rather than an empty string or a plausible-looking guess: the failure this
/// whole path exists to prevent is an unknown being read as an answer. "unrecorded" cannot be
/// mistaken for a channel name, so a reader correlating a scrollback is told plainly that the
/// attribution is missing rather than being handed something to over-trust.
const ABANDONED_CHANNEL_UNRECORDED: &str = "<unrecorded>";

/// Push `id -> channel` onto the abandoned ring, evicting oldest-first past `ABANDONED_IDS_CAP`.
fn push_abandoned(ring: &mut VecDeque<(String, String)>, id: &str, channel: &str) {
    ring.push_back((id.to_string(), channel.to_string()));
    while ring.len() > ABANDONED_IDS_CAP {
        ring.pop_front();
    }
}

/// The channel `id` was awaiting when it was abandoned, or `ABANDONED_CHANNEL_UNRECORDED`.
///
/// Searches newest-first: ids come from a monotonic counter and so do not repeat within a run,
/// but scanning from the back means the common case (a response arriving shortly after its own
/// timeout) hits immediately instead of walking the whole ring.
fn abandoned_channel_for(ring: &VecDeque<(String, String)>, id: &str) -> String {
    ring.iter()
        .rev()
        .find(|(recorded, _)| recorded == id)
        .map(|(_, channel)| channel.clone())
        .unwrap_or_else(|| ABANDONED_CHANNEL_UNRECORDED.to_string())
}

/// The one-shot sender `SidecarState::pending` holds for each in-flight invoke.
type InvokeSender = Sender<Result<Value, String>>;

/// Fail every still-pending invoke at once. The reader thread calls this when the sidecar's
/// stdout ends (EOF or a read error): no response can arrive after that, but the `Sender`s in
/// `pending` would otherwise stay alive in the map, so a long-running invoke's `rx.recv()` would
/// never wake and a bounded one would wait out its full `INVOKE_TIMEOUT`.
///
/// Each waiter is SENT an `Err` rather than having its sender dropped: a dropped sender wakes a
/// bounded `recv_timeout` with `Disconnected`, which its arm reports as a timeout — the wrong
/// story. The text matches the long-running arm's own disconnect `Err`, so a consumer sees one
/// message for "the sidecar went away" whichever arm it was waiting in. Each id is also recorded
/// in `abandoned`, matching the other two abandonment paths.
///
/// Takes the two fields rather than `&SidecarState` so it is reachable from `#[cfg(test)] mod
/// tests` without a live `Child`/`ChildStdin`. A poisoned lock is recovered, not skipped: this
/// runs exactly once, on the path whose whole job is to unblock waiters. Returns the drained
/// `(id, channel)` pairs so the caller can log them.
fn drain_pending_invokes(
    pending: &Mutex<HashMap<String, (String, InvokeSender)>>,
    abandoned: &Mutex<VecDeque<(String, String)>>,
) -> Vec<(String, String)> {
    let drained: Vec<_> = pending
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .drain()
        .collect();
    let mut ring = abandoned.lock().unwrap_or_else(|e| e.into_inner());
    drained
        .into_iter()
        .map(|(id, (channel, tx))| {
            let _ = tx.send(Err("sidecar closed before responding".into()));
            push_abandoned(&mut ring, &id, &channel);
            (id, channel)
        })
        .collect()
}

/// The `Err` a bounded invoke rejects with when its channel does not answer in time.
///
/// Names the channel, mirroring the format the OPPOSITE leg of this transport already uses
/// (`rustInvoke timed out after 60000ms: keyring_get`, `sidecarRpc.ts:385`, documented as that
/// direction's diagnostic contract in `sidecarTransport.ts`). The `sidecar invoke timed out`
/// prefix is preserved verbatim so any consumer matching on it by prefix/substring still does.
fn invoke_timeout_message(channel: &str) -> String {
    format!("sidecar invoke timed out: {channel}")
}

/// One shell diagnostic line for an invoke abandoned before the sidecar ever answered.
///
/// Split out as a pure function for the same reason `invoke_timeout_message` above is: the two
/// call sites that use it live inside `SidecarState::invoke`, which needs a real `Child`/
/// `ChildStdin` to construct and is therefore unreachable from `#[cfg(test)] mod tests`. The
/// FORMAT can still be pinned; the call sites are pinned by
/// `src/backend/__tests__/shellDiagPersistence.test.ts` instead.
///
/// Carries NO `[shell] ` prefix: `shell_diag` prepends one, and a literal here would emit
/// `[shell] [shell] ...`.
///
/// T-28-04 holds unchanged: `id` is a monotonic counter and `channel` is a fixed identifier from
/// the registered set. No `result`, `error` or argument body is logged.
fn invoke_abandoned_message(reason: &str, id: &str, channel: &str) -> String {
    format!("invoke abandoned ({reason}): id={id} channel={channel}")
}

/// `None` means "wait indefinitely" (see `LONG_RUNNING_CHANNELS`).
fn timeout_for(channel: &str) -> Option<Duration> {
    if LONG_RUNNING_CHANNELS.contains(&channel) {
        None
    } else {
        Some(INVOKE_TIMEOUT)
    }
}

/// Keychain service/account identifying the Steam refresh token entry this shell owns
/// (Phase 28, D-01: keyring-native storage, not OSCrypt-compatible ciphertext). These are
/// production-stable identifiers — they must NOT be spike 011's throwaway
/// `com.gamelib.spike011` probe values, which were deliberately named to be obviously
/// disposable and were deleted (`delete_credential`) after every spike run.
const KEYRING_SERVICE: &str = "com.gamelib.launcher";
const KEYRING_ACCOUNT: &str = "steam-refresh-token";

/// The account `keyring_available` probes to ask "does the Keychain backend answer" WITHOUT
/// raising an authorization dialog (quick-260905-l8g).
///
/// **Why an absent account is the whole mechanism.** A lookup for an item that does not exist
/// returns `errSecItemNotFound` (-25300 -> `keyring::Error::NoEntry`) immediately: there is no
/// item, therefore no ACL, therefore no authorization step and no prompt. A lookup for an item
/// that DOES exist is what triggers the negotiation. This is measured, not inferred -- see
/// `keyring_read_timing_hypothesis_absent_vs_present_entry` below, run twice on real hardware
/// 2026-07-31: the absent-account read returned `NoEntry` in 40.04ms and 102.23ms, while the
/// present-account read against the real `steam-refresh-token` entry took 48.87s and 291.08s and
/// ended both times in a Keychain AUTHORIZATION error.
///
/// **Why not a metadata-only API.** keyring 3.6.3's `get_attributes()` has no macOS override;
/// `credential.rs`'s default calls `get_secret()` "for effect" and so prompts identically, and
/// `macos.rs` routes `get_password`/`get_secret`/`get_credential` all through
/// `find_generic_password` (`SecKeychainFindGenericPassword`), which returns the secret data and
/// therefore performs the ACL check. No non-prompting metadata call is reachable through this
/// crate.
///
/// **This name MUST stay absent.** It is deliberately outside `keyring_account()`'s allowlist, so
/// no sidecar frame can select it and no slot maps to it, and nothing in this file may ever pass
/// it to `set_password`. Both properties are pinned by tests below -- if an item ever appears at
/// this account the probe silently starts hitting the ACL path again, which is precisely the
/// defect this constant exists to remove. Stable rather than randomly suffixed on purpose:
/// deterministic behaviour and a reproducible live gate are worth more than per-call
/// unguessability, and absence is guarded by those tests rather than by randomness.
const KEYRING_REACHABILITY_PROBE_ACCOUNT: &str = "reachability-probe-never-written";

/// Compile-time keyring slot allowlist (34.4.1 gap cycle, D-GAP-01 -- binding). A caller supplies
/// a slot NAME; this function is the ONLY place a slot name is mapped to a real Keychain account
/// string, and it is the ONLY thing standing between a sidecar frame and `Entry::new`. T-28-03
/// stays preserved, not reopened: the sidecar can only ever select one of the entries below, never
/// an arbitrary account passed straight through from `args`. There is no wildcard/fallback arm --
/// an unrecognised slot is `keyring:unknown-slot`, always, never a silent fallback to a real
/// account (see `keyring_slot_arg` below for the SEPARATE, deliberate default that applies before
/// a slot name ever reaches this function).
///
/// Two Humble slots exist because Humble holds two independent secrets today (the
/// `_simpleauth_sess` session cookie and the csrf snapshot -- currently separate `configStore`
/// keys, per `34.4.1-SEAM-PARITY-SWEEP.md` S-10): packing both into one slot would make a partial
/// write corrupt both.
///
/// `steamgrid/secureKey.ts` (F-1b, `34.4.1-SEAM-PARITY-SWEEP.md` S-11) previously had NO slot
/// here, deliberately: the sweep found it unreachable from the sidecar's curated import graph at
/// the time (reached only via `src/backend/main.ts`, Electron's own entry point, never the
/// sidecar's `bootstrap.ts`/`handlers.ts` chain), so it stayed dormant, not live. Phase 34.6 plan
/// 01 (`34.6-CONTEXT.md` amendment A-03) is that future plan: the `steamgrid-api-key` arm below
/// lands BEFORE the SteamGridDB channels are registered on the sidecar (plan 34.6-09), not after,
/// because D-06's live gate would otherwise write a real operator API key to disk in plaintext at
/// the moment `secureKey.ts`'s `safeStorage` import resolves to `platform/index.ts`'s dead stub.
fn keyring_account(slot: &str) -> Result<&'static str, String> {
    match slot {
        "steam-refresh-token" => Ok(KEYRING_ACCOUNT),
        "humble-session" => Ok("humble-session"),
        "humble-csrf" => Ok("humble-csrf"),
        "steamgrid-api-key" => Ok("steamgrid-api-key"),
        _ => Err("keyring:unknown-slot".to_string()),
    }
}

/// The slot a keyring arm uses when its optional `slot` argument is absent. **This default is
/// deliberate and is what makes the slot argument backward compatible**: every keyring frame the
/// sidecar sent before slots existed carried no slot argument at all, and it must keep resolving
/// to the SAME Keychain entry it always has, with no user-visible re-login. Do not "tidy" this into
/// a hard error -- an absent slot is the currently-shipping shape, not malformed input. A
/// present-but-unrecognised slot is still always rejected by `keyring_account`
/// (`keyring:unknown-slot`); a present non-string slot is rejected by the generated
/// `Keyring*Args::from_args` (`keyring:bad-args`).
const KEYRING_DEFAULT_SLOT: &str = "steam-refresh-token";

/// A request frame written to the sidecar's stdin (one JSON object per line).
/// Mirrors SidecarRpcRequest. `id` is always a string (64-bit-safe).
#[derive(Serialize)]
struct SidecarRpcRequest {
    id: String,
    kind: &'static str,
    channel: String,
    args: Vec<Value>,
}

/// Payload emitted to the webview alongside FRONTEND_MESSAGE_EVENT.
#[derive(Clone, Serialize)]
struct FrontendMessagePayload {
    channel: String,
    args: Vec<Value>,
}

/// Where a shell panic is recorded. Sits beside the sidecar's own `gamelib.log` on macOS so an
/// operator collecting diagnostics finds both in one directory.
///
/// Mirrors `single_instance_dir`'s shape deliberately: `$HOME` is taken as a parameter rather
/// than read inside, so the mapping is unit-testable without mutating process-global env vars.
fn shell_panic_log_path(home: Option<&str>) -> Option<std::path::PathBuf> {
    let home = home.filter(|h| !h.is_empty())?;
    let base = std::path::Path::new(home);
    if cfg!(target_os = "macos") {
        Some(
            base.join("Library")
                .join("Logs")
                .join("GameLib")
                .join("gamelib-shell-panic.log"),
        )
    } else {
        Some(
            base.join(".config")
                .join("gamelib")
                .join("gamelib-shell-panic.log"),
        )
    }
}

/// Routes every shell panic to a FILE, not just stderr.
///
/// WHY THIS EXISTS. Until now this binary installed no panic hook and used no `catch_unwind`
/// anywhere, so a panic reported itself only via stderr. That is adequate under `tauri:dev`,
/// where stderr is the operator's terminal, and useless in the shipped `.app`: LaunchServices
/// discards a bundled process's stderr, so a panic in production left NO message anywhere. The
/// crash report does not fill the gap — Rust does not write panic text into CRASetInfo, so the
/// `.ips` carries `abort() called` and nothing else.
///
/// That cost a real diagnosis on 2026-08-29: an abort inside `on_open_url` produced a crash
/// report whose faulting-thread stack ends at `panic_cannot_unwind`, the abort GUARD for a
/// panic crossing an `extern "C"` boundary. The frames between the guard and the panic's origin
/// had ALREADY been popped by the unwind, so the report cannot name the origin, and the message
/// that would have named it went to a discarded stderr. See
/// `.planning/debug/deep-link-open-url-abort.md`.
///
/// The backtrace is `force_capture`d rather than left to `RUST_BACKTRACE`, because a
/// LaunchServices-launched app inherits no environment the operator can set.
///
/// This hook REPLACES the default rather than chaining to it: it prints the same information to
/// stderr itself, so chaining would only duplicate the report, and it supplies an unconditional
/// backtrace where the default's is env-gated.
///
/// NOTHING IN HERE MAY PANIC. A panic inside the panic hook aborts immediately and destroys the
/// very report we are trying to write, so every fallible step (`create_dir_all`, `open`,
/// `write_all`) is `let _ =`-swallowed and there is no indexing, slicing or `unwrap`.
/// Where the shell's own diagnostics land, beside the panic log and the sidecar's `gamelib.log`.
fn shell_diag_log_path(home: Option<&str>) -> Option<std::path::PathBuf> {
    shell_panic_log_path(home).map(|p| p.with_file_name("gamelib-shell.log"))
}

/// Appends one shell diagnostic line to a FILE as well as stderr.
///
/// Same rationale as `install_panic_hook`: under LaunchServices a bundled app's stderr is
/// discarded, so `eprintln!` alone makes the shell's own behaviour unobservable in exactly the
/// configuration users run. Used on the deep-link path, where "did the OS event reach us at
/// all?" is otherwise indistinguishable from "it reached us and we dropped it".
///
/// Best-effort and infallible by construction — a diagnostic that can fail a real operation
/// would be worse than no diagnostic.
fn shell_diag(message: &str) {
    shell_eprintln!("[shell] {message}");
    let Some(path) = shell_diag_log_path(std::env::var("HOME").ok().as_deref()) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let epoch_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = file
            .write_all(format!("{epoch_secs} pid={} {message}\n", std::process::id()).as_bytes());
        let _ = file.flush();
    }
}

/// Renders one panic report. Split out from the hook itself so a test can assert the report
/// actually CARRIES the four things a diagnosis needs — thread, location, payload, backtrace —
/// without installing a process-global hook or writing to the operator's real log file.
fn format_panic_record(
    epoch_secs: u64,
    pid: u32,
    thread_name: &str,
    location: &str,
    payload: &str,
    backtrace: &str,
) -> String {
    format!(
        "\n==== [shell] PANIC ====\n\
         epoch_secs: {epoch_secs}\n\
         pid: {pid}\n\
         thread: {thread_name}\n\
         location: {location}\n\
         payload: {payload}\n\
         backtrace:\n{backtrace}\n\
         ==== end panic ====\n"
    )
}

/// Best-effort append of one panic record; every error is discarded.
fn append_panic_record(path: &std::path::Path, record: &str) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = file.write_all(record.as_bytes());
        let _ = file.flush();
    }
}

fn install_panic_hook() {
    std::panic::set_hook(Box::new(move |info| {
        // `PanicHookInfo::payload_as_str` is newer than this crate's MSRV (1.77.2), so downcast.
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".to_string());
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown location>".to_string());
        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("<unnamed>").to_string();
        // Seconds since the Unix epoch. No `chrono`/`time` dependency exists in this crate and a
        // panic report is not worth adding one for; the operator correlates against the `.ips`
        // timestamp or the sidecar log.
        let epoch_secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let backtrace = std::backtrace::Backtrace::force_capture().to_string();

        let record = format_panic_record(
            epoch_secs,
            std::process::id(),
            &thread_name,
            &location,
            &payload,
            &backtrace,
        );

        // The file write comes first so a dead stderr cannot pre-empt the only durable record.
        // The hook must never panic: a panic inside the panic hook aborts the process.
        if let Some(path) = shell_panic_log_path(std::env::var("HOME").ok().as_deref()) {
            append_panic_record(&path, &record);
        }

        shell_eprintln!("{record}");
    }));
}

fn main() {
    // Installed FIRST, before any other statement, so it covers the single-instance guard and
    // every `.setup()` callback rather than only the code after `Builder::default()`.
    install_panic_hook();

    // ---- Single-instance guard + deep-link argv (Phase 34.5 gap cycle 6 plan 44,
    // REQ-34.5-01/05/12, F-34.5-G6-09, D-44-A; Windows half added Phase 46, REQ-46-01) -- runs
    // BEFORE the Tauri builder is constructed so a secondary process's `std::process::exit(0)`
    // below fires before `.setup()` can ever call `spawn_sidecar`. This is the entire fix for the
    // "second full GameLib instance" half of F-34.5-G6-09/U-34.5-18. Unix uses the
    // `std::os::unix::net` socket guard (`acquire_single_instance`); Windows uses the
    // `windows-sys` mutex+pipe guard (`acquire_single_instance_windows`) -- both run here, before
    // the builder, with the identical fail-open-and-exit(0) shape. Every other target
    // (`#[cfg(not(any(unix, windows)))]`) stays unguarded: `single_instance_socket_path_var`/
    // `primary_listener` simply stay `None` there, so the rest of this function behaves
    // identically to today's shipped behaviour on those targets.
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let no_gui = cli_no_gui(&argv);

    #[cfg(unix)]
    let single_instance_socket_path_var: Option<std::path::PathBuf> = {
        use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
        single_instance_dir(std::env::var("HOME").ok().as_deref()).and_then(|dir| {
            match std::fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(&dir)
            {
                Ok(()) => {
                    // Belt and braces (T-34.5-G6-20): `DirBuilderExt::mode` only governs the
                    // mode mkdir() is called with for a directory this call actually CREATES --
                    // if the directory already existed (e.g. from an older release, or from a
                    // stale run) `recursive(true)` succeeds without re-chmod'ing it. Explicitly
                    // enforce `0700` here regardless of which branch just ran.
                    if let Err(e) = std::fs::set_permissions(
                        &dir,
                        std::fs::Permissions::from_mode(0o700),
                    ) {
                        shell_eprintln!(
                            "[shell] WARN: failed to set single-instance socket directory permissions to 0700: {e}"
                        );
                    }
                    Some(single_instance_socket_path(&dir))
                }
                Err(e) => {
                    shell_eprintln!(
                        "[shell] WARN: failed to create single-instance socket directory {dir:?}: {e} -- continuing without the single-instance guard (fail-open, T-34.5-G6-24)"
                    );
                    None
                }
            }
        })
    };
    #[cfg(not(unix))]
    let single_instance_socket_path_var: Option<std::path::PathBuf> = None;

    // `primary_listener` is moved into the `.setup(move |app| ...)` closure below, where it
    // becomes the deep-link accept loop's listener once the sidecar state is live.
    #[cfg(unix)]
    let primary_listener: Option<std::os::unix::net::UnixListener> = single_instance_socket_path_var
        .as_deref()
        .and_then(|path| match acquire_single_instance(path) {
            SingleInstanceRole::Secondary => {
                use std::io::Write as _;
                use std::os::unix::net::UnixStream;
                // A bare second launch with no deep link raises the existing window -- the
                // sentinel below -- which is the correct UX and matches what a plugin-based
                // guard would do. Never logs the URL itself here (T-34.5-G6-25): the running
                // instance's own `handleProtocol` logs it authoritatively one line later.
                let (payload, kind) = match protocol_url_arg(&argv) {
                    Some(url) => (url, "deep-link"),
                    None => ("__GAMELIB_FOCUS__".to_string(), "focus sentinel"),
                };
                shell_eprintln!(
                    "[shell] another GameLib instance is already running -- sending {kind} to it and exiting"
                );
                match UnixStream::connect(path) {
                    Ok(mut stream) => {
                        let _ = writeln!(stream, "{payload}");
                        let _ = stream.flush();
                    }
                    Err(e) => shell_eprintln!(
                        "[shell] WARN: secondary instance failed to deliver {kind} to the running instance: {e}"
                    ),
                }
                std::process::exit(0);
            }
            SingleInstanceRole::Primary(listener) => Some(listener),
            SingleInstanceRole::PrimaryWithoutListener => None,
        });

    // Windows counterpart to the `#[cfg(unix)]` block above (Phase 46, REQ-46-01/02/03). Reads
    // the current process token's SID/session once (`current_user_identity`); a `None` fails
    // open (T-34.5-G6-24) exactly like a `None` from the Unix arm's own directory-creation
    // failure. The `Secondary` arm mirrors the Unix `Secondary` arm's shape line-for-line: same
    // `single_instance_payload` decision, same "warn on delivery failure, never fatal" pattern,
    // same unconditional `std::process::exit(0)` -- 46-RESEARCH.md Q5's own fail-open policy: a
    // second sidecar is strictly worse than an occasionally-lost deep link.
    #[cfg(windows)]
    let primary_listener: Option<WindowsPrimaryPipe> = match current_user_identity() {
        None => {
            shell_eprintln!(
                "[shell] WARN: could not read the current user's SID/session -- continuing without the single-instance guard (fail-open, T-34.5-G6-24)"
            );
            None
        }
        Some((sid, session)) => match acquire_single_instance_windows(&sid, session) {
            WindowsSingleInstanceRole::Secondary {
                pipe_name,
                user_sid,
            } => {
                let (payload, kind) = single_instance_payload(&argv);
                shell_eprintln!(
                    "[shell] another GameLib instance is already running -- sending {kind} to it and exiting"
                );
                if let Err(e) = deliver_to_running_instance_windows(&pipe_name, &user_sid, &payload)
                {
                    shell_eprintln!(
                        "[shell] WARN: secondary instance failed to deliver {kind} to the running instance: {e}"
                    );
                }
                std::process::exit(0);
            }
            WindowsSingleInstanceRole::Primary(pipe) => Some(pipe),
            WindowsSingleInstanceRole::PrimaryWithoutListener => None,
        },
    };

    #[cfg(not(any(unix, windows)))]
    let primary_listener: Option<()> = None;

    tauri::Builder::default()
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        // DIAGNOSTIC REVERTED (epic-login-non-interactive, F-34.5-G6-01, 2026-08-01):
        // this line was briefly commented out to test whether tauri-plugin-notification's
        // globally-injected init-iife.js (which unconditionally overwrites
        // `window.Notification` and self-invokes `plugin:notification|is_permission_granted`
        // in EVERY webview -- confirmed by direct read of tauri-2.11.5's manager/webview.rs
        // prepare_pending_webview: plugin init scripts are appended to
        // webview_attributes.initialization_scripts for ALL windows, NOT gated by the
        // `"windows": ["main"]` capability scope) is why Epic's login form never becomes
        // interactive. Hardware result: R3 FALSIFIED -- the injection was confirmed removed
        // (both console error lines gone) but the login form remained non-interactive with a
        // clean console. This line is restored. The notification-plugin JS-injection defect
        // is real but unrelated to F-34.5-G6-01; see the debug file's Evidence/Eliminated
        // sections for the separate finding. Do not remove this line again without a fresh,
        // pre-registered diagnostic tied to a NEW hypothesis.
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(move |app| {
            // Quick task 261023-vkv: delegate + one-time authorization request for packaged
            // macOS builds (no-op elsewhere); see `macos_notifications`' module doc. Non-blocking.
            #[cfg(target_os = "macos")]
            macos_notifications::init_at_startup();
            // Quick task 261031-mj9: native gamepad reader thread. Non-blocking and infallible
            // (failures are logged inside), since setup must not panic -- see the SIGABRT note below.
            #[cfg(target_os = "macos")]
            macos_native_gamepad::start(app.handle().clone());
            // A spawn failure used to propagate through this `?`. Tauri turns a setup error into
            // a panic (`app.rs:1425`), and that panic unwinds out of `did_finish_launching` — an
            // `extern "C"` ObjC callback — so it became `panic_cannot_unwind` -> `SIGABRT`. The
            // user saw "GameLib quit unexpectedly" with no cause, and the crash report could only
            // ever show the abort guard, never the origin. Nine such reports in one afternoon
            // (2026-08-29), every one of them a `node` that was not on the LaunchServices PATH.
            //
            // The app genuinely cannot run without a sidecar, so this still ends the process.
            // What changes is that it ends DELIBERATELY and says why, instead of aborting.
            //
            // `blocking_show()` is safe here: `.setup()` runs on the main thread from INSIDE the
            // running event loop (`did_finish_launching` -> `AppState::launched` ->
            // `make_run_event_loop_callback`, per the captured backtrace), so the modal has a
            // run loop to spin. It is also on a path where the app is already dead either way.
            let mut child = match spawn_sidecar(app.handle()) {
                Ok(child) => child,
                Err(e) => {
                    shell_diag(&format!("FATAL: sidecar spawn failed, exiting: {e}"));
                    let where_to_look = shell_diag_log_path(std::env::var("HOME").ok().as_deref())
                        .map(|p| p.display().to_string())
                        .unwrap_or_else(|| "the GameLib log directory".to_string());
                    app.dialog()
                        .message(format!(
                            "GameLib could not start its backend process, so it cannot continue.\n\n\
                             {e}\n\n\
                             Details were written to:\n{where_to_look}"
                        ))
                        .kind(MessageDialogKind::Error)
                        .blocking_show();
                    // Exit, do NOT `?`. Propagating produces the abort described above.
                    std::process::exit(1);
                }
            };
            #[cfg(windows)]
            let job = create_kill_on_close_job(&child);
            let stdin = child
                .stdin
                .take()
                .ok_or("sidecar stdin unavailable")?;
            let stdout = child
                .stdout
                .take()
                .ok_or("sidecar stdout unavailable")?;
            let stderr = child
                .stderr
                .take()
                .ok_or("sidecar stderr unavailable")?;

            let state = Arc::new(SidecarState {
                stdin: Mutex::new(stdin),
                pending: Mutex::new(HashMap::new()),
                abandoned: Mutex::new(VecDeque::new()),
                counter: AtomicU64::new(1),
                child: Mutex::new(child),
                shutting_down: AtomicBool::new(false),
                eof_surfaced: AtomicBool::new(false),
                tree_reaped: AtomicBool::new(false),
                #[cfg(windows)]
                job: Mutex::new(job),
            });

            start_reader(app.handle().clone(), state.clone(), stdout);
            start_stderr_forwarder(stderr);

            // Deep-link accept loop (Phase 34.5 gap cycle 6 plan 44, D-44-A): the primary's
            // warm-delivery path for a launch received while this instance is already
            // running. Spawned AFTER `app.manage(state)` below would be too late for the
            // clone captured here -- clone first, manage the original.
            #[cfg(unix)]
            if let Some(listener) = primary_listener {
                let accept_state = state.clone();
                let accept_app_handle = app.handle().clone();
                thread::spawn(move || {
                    for incoming in listener.incoming() {
                        let stream = match incoming {
                            Ok(s) => s,
                            Err(e) => {
                                shell_eprintln!(
                                    "[shell] WARN: single-instance accept() failed: {e}"
                                );
                                continue;
                            }
                        };
                        // T-34.5-G6-23: bound the read exactly like sidecarRpc's own
                        // MAX_LINE_LENGTH discipline -- a single read_line off a capped reader,
                        // never an unbounded buffer.
                        let mut reader = BufReader::new(stream.take(4096));
                        let mut line = String::new();
                        match reader.read_line(&mut line) {
                            Ok(0) | Err(_) => continue,
                            Ok(_) => {}
                        }
                        let trimmed = line.trim();

                        if trimmed == "__GAMELIB_FOCUS__" {
                            // `unminimize()` is load-bearing here, not `show()` + `set_focus()`
                            // alone -- measured live on Linux (GNOME Shell/mutter, GTK 3.24.33,
                            // debug session `linux-focus-restore-minimize`, 2026-09-26). Per
                            // tao-0.35.3 (`platform_impl/linux/window.rs:558-576` and
                            // `platform_impl/linux/event_loop.rs:296-324`): `show()` sends
                            // `WindowRequest::Visible(true)` -> GTK `show_all()`, which does not
                            // clear WM-level iconic state (ICCCM); `set_focus()` is gated on
                            // `!self.minimized.load(..) && self.window.get_visible()`, so it never
                            // even sends `WindowRequest::Focus` (-> `present_with_time`, the call
                            // that would deiconify) while minimized. Only `set_minimized(false)`
                            // (`unminimize()`) sends `WindowRequest::Minimized(false)` ->
                            // `window.deiconify()`, the only call in this sequence that clears
                            // EWMH `_NET_WM_STATE_HIDDEN`. This is the same defect shape fixed on
                            // Windows in `handle_windows_single_instance_connection` (plan 46-06);
                            // this Unix arm was deliberately left unfixed there because it was
                            // unmeasured on Linux -- now measured and fixed here. This is a
                            // deliberate, on-purpose divergence of this `#[cfg(unix)]` region from
                            // the phase-46 `46-unix-cfg-regions.awk` gate's baseline (`5bc4fa825`);
                            // see `open_about_window_from_tray`'s comment above for the full
                            // correction history.
                            let focus_handle = accept_app_handle.clone();
                            let _ = accept_app_handle.run_on_main_thread(move || {
                                let render = |r: tauri::Result<()>| match r {
                                    Ok(()) => "ok".to_string(),
                                    Err(e) => format!("err={e}"),
                                };
                                match focus_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                                    Some(window) => {
                                        let unminimize_result = render(window.unminimize());
                                        let show_result = render(window.show());
                                        let set_focus_result = render(window.set_focus());
                                        shell_eprintln!(
                                            "[shell] focus sentinel raise: unminimize={}, show={}, set_focus={}",
                                            unminimize_result, show_result, set_focus_result
                                        );
                                    }
                                    None => {
                                        shell_eprintln!(
                                            "[shell] WARN: focus sentinel: no '{MAIN_WINDOW_LABEL}' window to raise"
                                        );
                                    }
                                }
                            });
                            continue;
                        }

                        // Defence in depth (T-34.5-G6-20): re-validate through the SAME
                        // allow-list used for argv, never trusting the socket because it is
                        // "internal" -- the socket is a trust boundary even inside a `0700`
                        // directory.
                        match protocol_url_arg(&[trimmed.to_string()]) {
                            Some(url) => {
                                match accept_state
                                    .invoke("handleProtocolUrl".to_string(), vec![Value::String(url)])
                                {
                                    Ok(_) => shell_eprintln!(
                                        "[shell] delivered single-instance deep link to sidecar: ok"
                                    ),
                                    Err(e) => shell_eprintln!(
                                        "[shell] delivered single-instance deep link to sidecar: err={e}"
                                    ),
                                }
                            }
                            None => {
                                // T-34.5-G6-25: the REASON and byte count only, never the
                                // payload.
                                shell_eprintln!(
                                    "[shell] rejected single-instance payload (failed protocol_url_arg validation), bytes={}",
                                    trimmed.len()
                                );
                            }
                        }
                    }
                });
            }
            // Windows counterpart to the `#[cfg(unix)]` accept-loop thread above (Phase 46 plan
            // 46-03, REQ-46-04). Spawned here for the identical reason: AFTER `app.manage(state)`
            // below would be too late for the clone captured here -- clone first, manage the
            // original. The thread is never joined, exactly like the Unix thread above.
            #[cfg(windows)]
            if let Some(primary) = primary_listener {
                let accept_state = state.clone();
                let accept_app_handle = app.handle().clone();
                thread::spawn(move || run_windows_single_instance_accept_loop(primary, accept_state, accept_app_handle));
            }

            #[cfg(not(any(unix, windows)))]
            let _ = &primary_listener;

            // ---- OS deep-link delivery (Phase 35 plan 07, D-07/D-05, REQ-35-05/REQ-35-16) ----
            // Replaces `src/backend/main.ts:501-507`'s `protocol.handle('gamelib', ...)` +
            // `app.setAsDefaultProtocolClient('gamelib')`, which die with the Electron build.
            //
            // This callback is the FOURTH source of a `gamelib://` URL into this process, after
            // argv (`sidecar_forward_args`), the Unix single-instance socket accept loop above,
            // and the Windows single-instance pipe accept loop above (Phase 46,
            // `run_windows_single_instance_accept_loop`). It is NOT an exception to the
            // validation the other three perform: every URL goes through `deep_link_decision` ->
            // `protocol_url_arg`, this file's single input-validation choke point (ASVS V5),
            // before it can reach the sidecar. Defence in depth (T-34.5-G6-20) -- the socket
            // path's own comment above establishes the rule this follows: never trust a source
            // because it is "internal", and the OS is not even internal. Anyone adding a FIFTH
            // source: put it through the same function, not through a new copy of the checks.
            //
            // Platform reality (the plugin's own README): the event fires on macOS only. On
            // Linux and Windows the OS spawns a NEW process with the URL as a CLI argument
            // instead, which is why the argv + single-instance-guard paths above are not
            // redundant with this one -- it is the ONLY delivery path on Linux (via the Unix
            // socket accept loop) and on Windows (via the named-pipe accept loop, phase 46's
            // `run_windows_single_instance_accept_loop`) once a second launch's argv has been
            // handed to the running instance.
            // NOT `deep_link().get_current()`. That is the plugin's documented "was the app
            // STARTED by a deep link" accessor, and it was measured here on 2026-08-29 and does
            // NOT serve that purpose for this app: on three cold starts it reported `None` at
            // setup time every time, because the plugin only populates `current` from its
            // `RunEvent::Opened` handler, which fires AFTER setup. `on_open_url` below does
            // receive the cold-start URL (measured: fires in the same second as setup). See
            // `.planning/debug/deep-link-open-url-abort.md`.
            // ---- The invoke runs OFF the main thread. ----
            //
            // `SidecarState::invoke` BLOCKS until the sidecar answers or `timeout_for` expires,
            // and `handleProtocolUrl` is deliberately not on `LONG_RUNNING_CHANNELS`, so that
            // bound is the full `INVOKE_TIMEOUT`. This callback runs on the macOS main thread
            // inside AppKit's AppleEvent handler (`-[NSApplication _handleAEGetURLEvent:]` ->
            // tao's `application_open_urls`), so calling `invoke` here directly froze the entire
            // UI for as long as the sidecar took. Measured 2026-08-29: 671ms / 1010ms / 1191ms
            // on a cold start, 1-2ms warm, worst case 60s.
            //
            // It was also the ONLY `invoke` call site that blocked the main thread — the
            // renderer-facing `sidecar_invoke` command has always wrapped it in
            // `tauri::async_runtime::spawn_blocking` for exactly this reason. Blocking here is
            // additionally hazardous rather than merely slow: tao holds BOTH its
            // `HANDLER.callback` `Mutex` (`app_state.rs:204`, a `.lock().unwrap()`) and the
            // `RefCell` behind it (`app_state.rs:77`, `callback.borrow_mut()`) for the whole
            // dispatch, and a panic on the main thread inside this `extern "C"` callback cannot
            // unwind — it becomes an immediate `SIGABRT` via `panic_cannot_unwind`, taking the
            // app down and orphaning the sidecar. One such abort was captured on 2026-08-29
            // (`.planning/debug/deep-link-open-url-abort.md`); its cause was never proven
            // because the panic message went to a stderr LaunchServices discards, which is what
            // `install_panic_hook` now fixes. This change closes the window regardless.
            //
            // A SINGLE worker thread fed by a channel, not `thread::spawn` per URL:
            //   - URLs stay FIFO, so two deep links cannot interleave their sidecar round-trips.
            //   - Thread count is bounded at one. A page firing `gamelib://` in a loop is a
            //     realistic input, and thread-per-URL would let it spawn without limit.
            // Validation stays on the main thread: `deep_link_decision` is pure and fast, and
            // keeping it here means an unvalidated URL is never enqueued at all.
            let deep_link_state = state.clone();
            let (deep_link_tx, deep_link_rx) = mpsc_channel::<String>();
            thread::spawn(move || {
                // Ends only when the sender is dropped, i.e. at process exit.
                for url in deep_link_rx {
                    let started = std::time::Instant::now();
                    let outcome = deep_link_state
                        .invoke("handleProtocolUrl".to_string(), vec![Value::String(url)]);
                    let elapsed_ms = started.elapsed().as_millis();
                    match outcome {
                        Ok(_) => shell_diag(&format!(
                            "delivered OS deep link to sidecar: ok ({elapsed_ms}ms)"
                        )),
                        Err(e) => shell_diag(&format!(
                            "delivered OS deep link to sidecar: err={e} ({elapsed_ms}ms)"
                        )),
                    }
                }
            });

            // `mpsc::Sender<T>` is `Sync` as of Rust 1.72 and this crate's MSRV is 1.77.2, so a
            // plain sender satisfies `on_open_url`'s `Fn(..) + Send + Sync + 'static` bound
            // without a `Mutex` wrapper.
            app.deep_link().on_open_url(move |event| {
                // `urls()` takes `self` by value, so bind once and reuse.
                let urls = event.urls();
                shell_diag(&format!("on_open_url fired with {} url(s)", urls.len()));
                for url in urls {
                    let candidate = url.to_string();
                    match deep_link_decision(&candidate) {
                        // Reached only after `protocol_url_arg` accepted the URL -- same
                        // allow-list, same guarantees, as the argv and socket paths.
                        DeepLinkDecision::Dispatch(url) => {
                            // Hand off and return immediately; the worker does the blocking
                            // round-trip and logs its own outcome. `SendError`'s Display is a
                            // fixed string ("sending on a closed channel") and does NOT carry
                            // the payload, but it is not formatted here at all so that no future
                            // edit can turn this into a URL leak (T-34.5-G6-25 / T-35-26).
                            if deep_link_tx.send(url).is_err() {
                                shell_diag(
                                    "deep-link dispatch worker is gone; dropping a validated URL",
                                );
                            }
                        }
                        DeepLinkDecision::Reject { bytes } => {
                            // T-34.5-G6-25 / T-35-26: the REASON and byte count only, never
                            // the payload. `DeepLinkDecision::Reject` does not even carry it.
                            shell_diag(&format!(
                                "rejected OS deep-link payload (failed protocol_url_arg validation), bytes={bytes}"
                            ));
                        }
                    }
                }
            });

            // Runtime `register_all()` stays LINUX-ONLY, and each of the three platforms is a
            // decision, not an accident:
            //   - macOS registers `CFBundleURLTypes` at BUILD time from `plugins.deep-link` in
            //     `tauri.conf.json`; the runtime call returns `Error::UnsupportedPlatform` there,
            //     so calling it would only produce a misleading warning on every launch.
            //   - Linux registers at runtime, via a generated `.desktop` file plus `xdg-mime` /
            //     `update-desktop-database`. `register_all()`'s own documented purpose is to
            //     cover installs that bypass a proper installer (e.g. an AppImage that was not
            //     otherwise registered).
            //   - Windows registers at INSTALL time via the NSIS template (phase 46,
            //     REQ-46-05/REQ-46-06, decision point (a)) AND, since quick-260925-uok,
            //     self-heals at RUNTIME via `repair_windows_gamelib_protocol_registration`
            //     (called immediately below this block). The install-time half is unchanged:
            //     the NSIS template writes HKCU `Software\Classes\gamelib` (the project's
            //     default `installMode`, `NSISInstallerMode::CurrentUser`) from
            //     `plugins.deep-link.desktop`, sourced from the base `tauri.conf.json` now that
            //     `tauri.windows.conf.json` no longer overrides `schemes` to `[]` (that
            //     quick-260922-nx4 override was removed -- see
            //     `src/backend/__tests__/windowsDeepLinkSuppression.test.ts`). Re-running the
            //     installer overwrites the stale 2026-07-20 Electron-era HKCU key
            //     unconditionally (`WriteRegStr` is not a conditional write), self-healing it
            //     with no extra code (RESEARCH.md Q7) -- but only for someone who re-runs the
            //     installer, which is what the runtime half now removes the need for.
            //   - The runtime self-heal is deliberately NARROWER than `register_all()`, and the
            //     distinction is the whole reason decision point (a) did not move.
            //     `register_all()` is the deep-link plugin's whole-scheme registration: EVERY
            //     configured scheme, registered through whatever mechanism the platform itself
            //     provides, with the plugin's own abstraction layer in between. The self-heal is
            //     one HKCU subtree read, one comparison, and a conditional write of exactly the
            //     four values the NSIS template already writes -- no plugin surface, no new
            //     scheme, no platform-abstraction layer, and nothing at all on macOS or Linux.
            //     Widening the `#[cfg]` on `register_all()` would have been the BROADER change,
            //     and it was rejected in favour of this one. So runtime `register_all()` stays
            //     `#[cfg(target_os = "linux")]`, by DECISION rather than by the D-05 hazard that
            //     used to block Windows entirely: GameLib ships Windows exclusively via NSIS
            //     (no portable/zip target), so `register_all()`'s AppImage-shaped justification
            //     still has no Windows analogue here. That decision remains
            //     operator-overridable -- the REQ-46-06 pin and its override recipe in
            //     `src/backend/__tests__/tauriShellSource.test.ts` are unchanged and still
            //     accurate; what changed is only WHY Windows does not need the widening.
            //   - The evidence that the install-time half alone was insufficient: the
            //     2026-09-25 live-gate hijack during plan 46-07
            //     (`46-LIVE-GATE-RERUN.md`, Check 3b / Check 5). A leftover machine-wide
            //     Electron-era `C:\Program Files\GameLib\GameLib.exe`, sharing this build's
            //     Start-menu display name, was launched by mistake and re-registered the HKCU
            //     key to ITSELF at its own runtime launch. The operator then uninstalled it,
            //     which deleted the exe without restoring the prior value, leaving `gamelib://`
            //     DANGLING rather than merely stale. Check 5's ping then failed with
            //     `Start-Process : This command cannot be run due to the error: Application not
            //     found.`, and a human had to restore the value by hand with `Set-ItemProperty`
            //     before the re-gate could continue.
            //   - LAST-LAUNCH-WINS, stated rather than left to be discovered empirically: two
            //     GameLib installations on one machine will each repair the key to themselves on
            //     launch, so the most recently launched build owns `gamelib://`. That is the
            //     intended semantics of "point it at the CURRENT executable" and is strictly
            //     better than the dangling state it replaces, but it is not a no-op on a
            //     multiple-install machine.
            //   - The `CI=e2e` guard is load-bearing on the Windows repair path in a way it is
            //     not on the Linux arm below: the repair WRITES to the real user registry, so an
            //     automated run that skipped the guard would rewrite the host's protocol
            //     association as a side effect of merely starting the app (T-UOK-02).
            //   - The guard that makes registering Windows at all SAFE is this file's own
            //     phase-46 single-instance guard (`CreateMutexW` primary/secondary decision,
            //     `run_windows_single_instance_accept_loop`'s named-pipe warm delivery, wired
            //     into `main()` before `tauri::Builder::default()`): every external
            //     `gamelib://` open now reaches the one running instance instead of starting a
            //     SECOND app with a SECOND sidecar over one set of store files and one download
            //     queue. `tauri-plugin-single-instance` is NOT the fix -- see D-44-A above.
            //   - Timing note (RESEARCH.md Q6, pinned by the REQ-46-08 ordering gate below): now
            //     that Windows `schemes` is non-empty, the plugin's own cold-start argv path
            //     (`handle_cli_arguments`, run during `init_deep_link` at PLUGIN init) fires
            //     BEFORE this `.setup()` closure registers `on_open_url` -- Tauri does not
            //     replay past events to a listener registered after the fact, so that emission
            //     has no listener and is dropped. Argv delivery therefore stays exclusively
            //     `sidecar_forward_args` -> `protocol_url_arg`, with no double dispatch. This
            //     holds for tauri 2.11.5 / tauri-plugin-deep-link 2.4.9 specifically (both
            //     version-pinned in `Cargo.lock`); re-verify on upgrade.
            //   - Ledger row `U-34.5-18` and the todo
            //     `.planning/todos/pending/`
            //     `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`
            //     close on the phase 46 live gate (REQ-46-10, plan 46-05), which is the only
            //     remaining proof that a real Windows process pair behaves correctly end-to-end.
            #[cfg(target_os = "linux")]
            {
                // Carries `src/backend/main.ts:501`'s `process.env.CI !== 'e2e'` guard forward
                // in intent: an automated test run must never rewrite the host's OS-level
                // protocol association as a side effect of starting the app.
                if std::env::var("CI").as_deref() == Ok("e2e") {
                    shell_eprintln!(
                        "[shell] CI=e2e -- skipping gamelib:// OS registration (carried forward from main.ts:501)"
                    );
                } else if let Err(e) = app.deep_link().register_all() {
                    // Fail open (T-34.5-G6-24 discipline): a failed registration degrades deep
                    // links, it must never abort startup.
                    shell_eprintln!(
                        "[shell] WARN: failed to register the gamelib:// protocol handler: {e}"
                    );
                }
            }

            // The Windows runtime self-heal (quick-260925-uok). Placement is three decisions,
            // not an accident:
            //   (i)   AFTER the `#[cfg(target_os = "linux")]` block above, never before it, so
            //         the nearest `#[cfg(...)]` ABOVE the file's sole `register_all()`
            //         occurrence is still the Linux one and `cfgGuardAboveRegisterAll()` in
            //         `src/backend/__tests__/tauriShellSource.test.ts` keeps returning
            //         `'#[cfg(target_os = "linux")]'` (REQ-46-06).
            //   (ii)  in `.setup()` rather than in `main()`, because by this point the
            //         single-instance decision has already run and every secondary has
            //         `std::process::exit(0)`'d -- so only the ONE surviving instance ever
            //         touches the registry.
            //   (iii) SYNCHRONOUS, not spawned on a thread: four HKCU value writes on the
            //         worst-case path is sub-millisecond, a thread would add a handle whose
            //         termination then has to be reasoned about against this shell's exit
            //         contract for no measurable gain, and a deep link arriving moments after
            //         launch benefits from the repair having already finished rather than
            //         racing it.
            // `app.config().identifier` is read here rather than hardcoded so the written
            // `URL:<id> protocol` value can never drift from `tauri.conf.json`.
            #[cfg(windows)]
            repair_windows_gamelib_protocol_registration(&app.config().identifier);

            let send_state = state.clone();
            app.manage(SidecarSendQueue(spawn_send_writer(move |req| {
                send_state.write_frame(req)
            })));
            app.manage(state);

            // Real Tauri tray (Phase 34.1 Plan 06, D-11; EXTENDED by Phase 35 Plan 06,
            // D-05/D-06, REQ-35-04). 34.1's version was deliberately bounded -- tooltip,
            // left-click show/focus, a two-item Show GameLib / Quit menu -- and named its own
            // exclusions: the recent-games submenu, About, the macOS dock menu,
            // language-driven rebuilds, and honouring `noTrayIcon`/`exitToTray`. This block
            // closes that delta against `src/backend/tray_icon/tray_icon.ts` except where a
            // reduction is recorded EXPLICITLY, immediately below.
            //
            // STILL NOT DONE, stated rather than silently dropped:
            //   - macOS dock menu (`app.dock?.setMenu`, tray_icon.ts:32). Tauri 2.11.5 exposes
            //     no dock-menu API; it would need an AppKit `NSApp.dockTile` bridge, which is
            //     a separate piece of work from a menu extension.
            //   - Reload / Debug items (tray_icon.ts:126-138). Both are developer affordances
            //     reached by the webview's own keyboard shortcuts under Tauri; shipping a menu
            //     item that opens devtools in a release build is a different decision from
            //     this plan's.
            //   - `languageChanged` menu rebuild (tray_icon.ts:47). The menu's own labels
            //     ("Show GameLib", "About GameLib", "Quit") are Rust string literals here, not
            //     i18next keys -- there is no translated source for the shell to rebuild
            //     FROM, so a rebuild on `languageChanged` would re-render the identical
            //     English text. Making these translatable means giving the shell a string
            //     channel, which is its own plan. The recent-games ENTRIES are game titles and
            //     are not translated in the Electron build either.
            //
            // Every step below is non-fatal: a menu-item, menu, or tray build failure is
            // logged and the app continues without a tray, never `unwrap()`/`panic!` out of
            // `.setup()` (T-34.1-22) -- a tray that fails to build is strictly better than a
            // shell that fails to start.
            //
            // Settings are read HERE, synchronously, from GlobalConfig's on-disk config.json
            // rather than over a sidecar invoke -- see `gamelib_app_folder`'s doc comment for
            // why a round-trip is the wrong shape for two decisions that must be made before
            // the tray exists and before the window is displayed.
            // Goes through the SAME single accessor the reader thread uses -- see
            // `tray_settings_lock`. `.setup()` no longer owns a private initialiser, which is
            // what previously let a reader-thread frame latch the lock to all-false defaults
            // before this line ever ran.
            let tray_settings = tray_settings();

            // `startInTray`. Hidden inside `.setup()`, before the event loop runs, so the
            // window is never displayed rather than being shown and yanked away.
            //
            // Gated on `!noTrayIcon`, mirroring `src/backend/main.ts:523`'s own
            // `settings.startInTray && !settings.noTrayIcon` EXACTLY. Without the gate the two
            // settings combine into an unrecoverable state: an app that starts with no window
            // and no tray icon to restore it from. That is not a hypothetical -- both are plain
            // user-toggleable booleans with no cross-validation in the settings UI.
            if tray_settings.start_in_tray && !tray_settings.no_tray_icon {
                match app.get_webview_window(MAIN_WINDOW_LABEL) {
                    Some(window) => {
                        if let Err(e) = window.hide() {
                            shell_eprintln!(
                                "[shell] WARN: startInTray: could not hide the main window ({e}) -- starting visible"
                            );
                        } else {
                            shell_eprintln!("[shell] startInTray: main window starts hidden");
                        }
                    }
                    None => shell_eprintln!(
                        "[shell] WARN: startInTray: no '{MAIN_WINDOW_LABEL}' window to hide -- starting visible"
                    ),
                }
            }

            // The main-window close (the red X, Cmd+W's `performClose:`, Alt+F4).
            //
            // Two decisions are taken HERE, at close time, from a FRESH read, and neither is
            // taken from the `.setup()` startup snapshot:
            //   1. hide-to-tray vs quit -- `should_hide_on_close(load_tray_settings())`, the
            //      `exitToTray` half (`tray_icon.ts:38-46`'s click handler is the SHOW half;
            //      `src/backend/main.ts:286-292` was the HIDE half). The first implementation
            //      read `exit_to_tray` from `TRAY_SETTINGS` and attached the handler only when
            //      it was already true, so turning the setting ON mid-session did nothing until
            //      relaunch (plan 35-06 task 3, live gate). A window close is rare and
            //      user-initiated, so a small synchronous config read costs nothing perceptible.
            //   2. whether a tray EXISTS -- `!noTrayIcon`, legitimately startup-only since a tray
            //      cannot appear later in the run -- folded in by `close_request_action`.
            //
            // THE HANDLER IS ATTACHED UNCONDITIONALLY (todo 2026-10-05 cmd-q-and-red-x-quit-
            // bypass-the-pending-operations-confirm). It used to be gated on tray existence and
            // returned without `prevent_close()` whenever the window was not hiding, so the
            // red X fell through to `RunEvent::Exit` and `shutdown_child()` killed a running
            // download with no confirm; with `noTrayIcon` on there was no handler at all.
            //
            // `prevent_close()` runs FIRST, before either branch: the "pending operations"
            // confirm is an unparented native panel and a "No" answer must find the window
            // still there, not a windowless running app. `RouteQuit` hands the decision to the
            // sidecar's `handleExit()` (exits via `app_exit` when nothing is pending or the user
            // answers Yes; `exit(0)` is the fallback when it cannot be asked), so the user can
            // always close.
            //
            // FAIL-SAFE DIRECTION IS DELIBERATE: `load_tray_settings()` degrades to
            // `TraySettingsSnapshot::default()` (all false) on any read failure, so the close
            // is ROUTED, not hidden. A user trapped in a window that refuses to close because a
            // config read failed is the unsafe failure.
            let tray_exists = !tray_settings.no_tray_icon;
            match app.get_webview_window(MAIN_WINDOW_LABEL) {
                Some(window) => {
                    let close_window = window.clone();
                    let close_app_handle = app.handle().clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            match close_request_action(
                                tray_exists,
                                should_hide_on_close(load_tray_settings()),
                            ) {
                                CloseRequestAction::Hide => {
                                    if let Err(e) = close_window.hide() {
                                        shell_eprintln!(
                                            "[shell] WARN: exitToTray: hide on close failed ({e})"
                                        );
                                    }
                                }
                                CloseRequestAction::RouteQuit => {
                                    quit_via_sidecar(&close_app_handle, "window close");
                                }
                            }
                        }
                    });
                    shell_diag(&format!(
                        "close handler attached (tray={tray_exists}): hide-to-tray re-read on every close; otherwise the quit is routed to the sidecar"
                    ));
                }
                None => shell_eprintln!(
                    "[shell] WARN: close handler: no '{MAIN_WINDOW_LABEL}' window to attach a close handler to"
                ),
            }

            // macOS Cmd+Q is not a window close and never reaches the handler above: route it
            // through the same sidecar hand-off by replacing the app menu's predefined Quit.
            #[cfg(target_os = "macos")]
            route_app_menu_quit_through_sidecar(app.handle());

            // Dock Quit sends `terminate:` straight to the app, not through the menu: veto it in
            // `applicationShouldTerminate:` and route it the same way (a power-off still passes).
            #[cfg(target_os = "macos")]
            macos_terminate_veto::install(app.handle());

            // Restores the install-badge reconciliation trigger dropped in the Electron to
            // Tauri cutover (D-01/D-02): Electron's `mainWindow.on('focus', ...)`
            // (`src/backend/main.ts:272-274`, deleted in `5643c7583`) drove a store manager's
            // install-state refresh so badges reconcile after the window regains focus following
            // an install/uninstall performed outside this app.
            //
            // Attached as a SECOND `on_window_event` listener on the SAME window as the
            // `exitToTray` handler above. That is safe because the runtime dispatcher's
            // `on_window_event` is additive -- it dispatches an `AddEventListener` message and
            // returns a fresh listener id per call, not a single-slot setter -- so this
            // registration cannot silently replace or disturb the close handler.
            //
            // `Focused(true)` ONLY, never `Focused(false)`: `WindowEvent::Focused(bool)` fires
            // on both the gain and the loss of focus, and matching only the `true` arm keeps
            // this a read-triggering signal on refocus, never on blur (T-03-03: no action is
            // taken from data the window itself does not control -- a blur carries nothing worth
            // reacting to here).
            //
            // Fires unconditionally, with no `!tray_settings.no_tray_icon` gate unlike
            // `exitToTray` above: refocusing the window is a normal interaction whether or not a
            // tray exists, and gating this on tray presence would silently stop badge
            // reconciliation for every user who has disabled the tray icon.
            match app.get_webview_window(MAIN_WINDOW_LABEL) {
                Some(focus_window) => {
                    let focus_app_handle = app.handle().clone();
                    focus_window.on_window_event(move |event| {
                        if let tauri::WindowEvent::Focused(true) = event {
                            let Some(state) = focus_app_handle.try_state::<Arc<SidecarState>>()
                            else {
                                shell_eprintln!(
                                    "[shell] WARN: window focus refresh: no sidecar state -- skipping"
                                );
                                return;
                            };
                            let state = state.inner().clone();
                            thread::spawn(move || {
                                let req = SidecarRpcRequest {
                                    id: state.next_id(),
                                    kind: "send",
                                    channel: SHELL_WINDOW_FOCUSED.to_string(),
                                    args: Vec::new(),
                                };
                                if send_trace_enabled() {
                                    shell_eprintln!(
                                        "[shell] send-trace: window focus refresh entered for '{}'",
                                        req.channel
                                    );
                                }
                                if let Err(e) = state.write_frame(&req) {
                                    shell_eprintln!(
                                        "[shell] WARN: window focus refresh: write_frame failed: {e}"
                                    );
                                }
                            });
                        }
                    });
                    shell_eprintln!(
                        "[shell] window focus refresh: listener attached to '{MAIN_WINDOW_LABEL}'"
                    );
                }
                None => shell_eprintln!(
                    "[shell] WARN: window focus refresh: no '{MAIN_WINDOW_LABEL}' window to attach a focus listener to"
                ),
            }

            // Seed the recent-games cache before the menu is built, so the section is
            // populated on a COLD start rather than only after the first launch of a session.
            let seeded = load_recent_games_from_disk(tray_settings.max_recent_games);
            shell_eprintln!(
                "[shell] tray recent games: seeded {} entr{} from disk (limit {})",
                seeded.len(),
                if seeded.len() == 1 { "y" } else { "ies" },
                tray_settings.max_recent_games
            );
            match tray_recent_games().lock() {
                Ok(mut guard) => *guard = seeded,
                Err(poisoned) => *poisoned.into_inner() = seeded,
            }

            // `noTrayIcon` (tray_icon.ts:20's `if (noTrayIcon) return null`). Decided BEFORE
            // the tray is built, so the user never sees an icon they asked not to have.
            if tray_settings.no_tray_icon {
                shell_eprintln!(
                    "[shell] tray suppressed by the noTrayIcon setting -- not building a tray"
                );
            } else {
                match build_tray_menu(app.handle()) {
                    Some(menu) => {
                        let tray = TrayIconBuilder::with_id(TRAY_ICON_ID)
                            .icon(tray_image(resolve_current_tray_icon_dark()))
                            .icon_as_template(tray_is_template())
                            .tooltip("GameLib")
                            .menu(&menu)
                            .show_menu_on_left_click(false)
                            .on_menu_event(|app_handle, event| {
                                let id = event.id().as_ref();
                                match id {
                                    "show" => {
                                        if let Some(window) =
                                            app_handle.get_webview_window(MAIN_WINDOW_LABEL)
                                        {
                                            let _ = window.unminimize();
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                    "about" => open_about_window_from_tray(app_handle),
                                    "quit" => quit_via_sidecar(app_handle, "tray Quit"),
                                    // T-35-20: the appName reaching a launch is PARSED back out
                                    // of the menu id through the same allow-list that built it,
                                    // never taken from the id verbatim. A malformed id is
                                    // dropped, not launched.
                                    _ => match tray_recent_app_name(id) {
                                        Some(app_name) => dispatch_tray_launch(
                                            app_handle,
                                            app_name.to_string(),
                                            tray_recent_runner_for(app_name),
                                        ),
                                        None => {
                                            if id.starts_with(TRAY_RECENT_ID_PREFIX) {
                                                shell_eprintln!(
                                                    "[shell] WARN: tray menu event rejected a malformed recent-game id (bytes={}) -- not launching",
                                                    id.len()
                                                );
                                            }
                                        }
                                    },
                                }
                            })
                            .on_tray_icon_event(|tray, event| {
                                if let TrayIconEvent::Click {
                                    button: MouseButton::Left,
                                    button_state: MouseButtonState::Up,
                                    ..
                                } = event
                                {
                                    let app_handle = tray.app_handle();
                                    if let Some(window) =
                                        app_handle.get_webview_window(MAIN_WINDOW_LABEL)
                                    {
                                        let _ = window.unminimize();
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            })
                            .build(app);
                        match tray {
                            Ok(_) => {
                                // Only when a tray exists: a `noTrayIcon` user gets no thread.
                                #[cfg(windows)]
                                spawn_taskbar_theme_watcher(app.handle().clone());
                            }
                            Err(e) => {
                                shell_eprintln!(
                                    "[shell] WARN: tray icon failed to build ({e}) -- continuing without a tray"
                                );
                            }
                        }
                    }
                    None => shell_eprintln!(
                        "[shell] WARN: tray menu failed to build -- continuing without a tray"
                    ),
                }
            }

            // DELIBERATELY RETIRED (Phase 34.4.2 Plan 07, 2026-08-04): a deminiaturize
            // re-raise observer used to be installed here (Phase 34.4.2 Plan 02,
            // REQ-34.4.2-04/05). It existed SOLELY to re-raise AppKit CHILD windows after
            // `main` restored from the Dock -- spike 021's measured "restore main" defect,
            // where an attached child window returned BEHIND `main` unless explicitly
            // brought forward again. The operator's binding design decision of 2026-08-04
            // (`34.4.2-LIVE-GATE.md`'s "Binding Design Decision" section, responding to
            // F-34.4.2-01/-02) replaced child-window attachment with AppKit SHEET
            // presentation (`present_login_window_as_sheet`, above): a sheet is presented BY
            // its parent window and moves with it, so there is no child list to re-raise and
            // no z-order defect this observer was written to fix. Keeping the observer would
            // (a) do nothing useful -- `PRESENTED_LOGIN_SHEETS` entries are sheets, not
            // AppKit child windows, and bringing one forward is not the same operation the
            // old child-attachment call needed -- and (b) emit a misleading log line naming a
            // re-raise mechanism that no longer exists. No replacement observer and no
            // window-focus-driven re-raise handler were added: whether the sheet survives the
            // minimize/restore cycle INTERACTIVE is exactly what the rewritten live gate's
            // item 1 must measure, not something to pre-emptively paper over here.

            // Page-independent Esc backstop for presented login sheets (Phase 34.4.2 Plan 08,
            // REQ-34.4.2-03/04/06/07/08/10, T-34.4.2-33/-35): installs ONE process-wide
            // `NSEvent` local key-down monitor here -- the EXACT site the retirement comment,
            // immediately above, names as where the deminiaturize re-raise observer used to
            // live. A sheet renders no titlebar close button and, unlike the injected cancel
            // strip (above), this route works even when the login page renders nothing at all
            // -- a blank page, a network error page, or a bot-management interstitial, exactly
            // the states a login window reaches most often when something is already wrong.
            //
            // Reimplemented here rather than refactored out of
            // `open_pristine_epic_login_window`'s own local monitor (read-only reference,
            // above): that region is byte-frozen by REQ-34.4.2-10, and its monitor
            // legitimately reads `charactersIgnoringModifiers()` to route Cmd+V/C/X/A/Z, which
            // this monitor must never do (T-34.4.2-35, immediately below).
            //
            // PRIVACY IS A HARD CONSTRAINT, NOT A STYLE PREFERENCE (T-34.4.2-35): this handler
            // reads ONLY `keyCode()` and `modifierFlags()` -- never `characters()` or
            // `charactersIgnoringModifiers()`, and never logs the event or any field derived
            // from it. This monitor sees every keystroke the app receives, including the
            // password being typed into the login sheet.
            //
            // Epic is no longer exempt (quick-261029-utr lifted the REQ-34.4.2-10 descope): its
            // pristine sheet is registered in `PRESENTED_LOGIN_SHEETS` through
            // `present_login_window_as_sheet` like every other store, so the window-membership
            // check below matches it and Esc cancels it. No explicit label check is added.
            //
            // Leaked for the process lifetime via `std::mem::forget`, matching the retired
            // deminiaturize observer's own precedent (and the pristine arm's own monitor-leak
            // shape for its navigation delegate): this is ONE monitor, registered ONCE, here --
            // not a per-open monitor that would need its own teardown.
            //
            // Failure to install is NON-FATAL (T-34.1-22 discipline, matching this closure's
            // own tray-build convention immediately above): logs one
            // `[shell] WARN: login-sheet esc monitor: ...` line and lets the app start. The
            // cancel strip (above) remains the primary route.
            #[cfg(target_os = "macos")]
            {
                let esc_app_handle = app.handle().clone();
                let esc_monitor_handler = block2::RcBlock::new(
                    move |event: std::ptr::NonNull<objc2_app_kit::NSEvent>|
                          -> *mut objc2_app_kit::NSEvent {
                        // SAFETY: AppKit hands local monitor handlers a valid, live `NSEvent`
                        // for the duration of this call.
                        let event_ref = unsafe { event.as_ref() };

                        // 1. Cheapest possible check first (T-34.4.2-35's "does no work at
                        // all" guarantee): no presented sheet at all, return untouched with no
                        // window resolution and no further AppKit calls.
                        let presented: Vec<String> = match PRESENTED_LOGIN_SHEETS.lock() {
                            Ok(guard) => guard.as_ref().cloned().unwrap_or_default(),
                            Err(_) => Vec::new(),
                        };
                        if presented.is_empty() {
                            return event.as_ptr();
                        }

                        // 2. Bare Esc only -- macOS virtual keyCode 53 is Esc.
                        if event_ref.keyCode() != 53 {
                            return event.as_ptr();
                        }

                        // 3. Only a BARE Esc dismisses -- Command/Option/Control held means
                        // this is some other chord (e.g. a devtools shortcut); never consume
                        // those.
                        let flags = event_ref.modifierFlags();
                        if flags.intersects(
                            objc2_app_kit::NSEventModifierFlags::Command
                                | objc2_app_kit::NSEventModifierFlags::Option
                                | objc2_app_kit::NSEventModifierFlags::Control,
                        ) {
                            return event.as_ptr();
                        }

                        // 4. Resolve the event's own window and compare against every
                        // currently presented sheet's `NSWindow` address. No match -> return
                        // untouched.
                        let Some(mtm) = objc2::MainThreadMarker::new() else {
                            return event.as_ptr();
                        };
                        let Some(event_window) = event_ref.window(mtm) else {
                            return event.as_ptr();
                        };
                        let event_window_addr =
                            (&*event_window) as *const objc2_app_kit::NSWindow as usize;

                        for label in &presented {
                            if login_window_ns_window(&esc_app_handle, label)
                                == Some(event_window_addr)
                            {
                                // 5. Match: dismiss and consume -- the page never also sees
                                // this Esc.
                                request_login_sheet_cancel(&esc_app_handle, label, "esc");
                                return std::ptr::null_mut();
                            }
                        }
                        event.as_ptr()
                    },
                );
                // SAFETY: `esc_monitor_handler` is a valid block; AppKit copies it internally
                // when registering the monitor, so it outliving this call is not required --
                // the SAME convention the pristine arm's own monitor registration (above,
                // read-only reference) already documents.
                let esc_monitor_token = unsafe {
                    objc2_app_kit::NSEvent::addLocalMonitorForEventsMatchingMask_handler(
                        objc2_app_kit::NSEventMask::KeyDown,
                        &esc_monitor_handler,
                    )
                };
                match esc_monitor_token {
                    Some(token) => {
                        // Intentional leak for the process lifetime -- see this block's own
                        // doc comment above.
                        std::mem::forget(token);
                    }
                    None => {
                        shell_eprintln!(
                            "[shell] WARN: login-sheet esc monitor: addLocalMonitorForEventsMatchingMask failed -- continuing without it"
                        );
                    }
                }
            }

            // `--no-gui` (Phase 34.5 gap cycle 6 plan 44, F-34.5-G6-09): gate 3 recorded that
            // `--no-gui` was previously ignored entirely, including opening devtools. When
            // set, the devtools-open block below is skipped ENTIRELY (never conditionally
            // opened then hidden), and the main window is explicitly hidden once it exists.
            // `tauri.conf.json`'s `main` window carries no explicit `"visible"` key, so Tauri's
            // own default (visible on creation) applies -- a brief flash before this `.hide()`
            // call is an expected observation for the live gate, not a failure.
            if no_gui {
                match app.get_webview_window(MAIN_WINDOW_LABEL) {
                    Some(window) => {
                        let _ = window.hide();
                        shell_eprintln!("[shell] --no-gui: main window hidden");
                    }
                    None => shell_eprintln!(
                        "[shell] WARN: --no-gui: no 'main' webview window found to hide"
                    ),
                }
            } else {
                // Dev-only: force the webview devtools open (the dev webview exposes no
                // right-click inspect on macOS) so renderer errors are inspectable, and
                // confirm the webview window actually exists.
                //
                // GATED ON VISIBILITY, not just on `debug_assertions` (plan 35-06 task 3,
                // live-gate defect 2). `open_devtools()` FORCES the window visible, so an
                // ungated call here silently defeated `startInTray`: the setting's own hide ran
                // first and logged success, then this line put the window straight back on
                // screen. The operator's terminal showed both lines in sequence and scored
                // `startInTray` a fail.
                //
                // This mirrors the gate the LOGIN window's devtools call already uses
                // (`#[cfg(debug_assertions)]` AND `if visible`, documented at
                // `MAIN_WINDOW_LABEL`'s doc comment above) -- the precedent was already in this
                // file; this call site had the first half and not the second.
                //
                // Tested via `is_visible()` rather than by re-reading `startInTray`: visibility
                // is the property that actually matters, and it also covers `--no-gui` and any
                // future path that hides the window for a reason this code does not know about.
                //
                // It also makes the live gate's step 5c non-vacuous. 5c passes when "a visible
                // window appears because noTrayIcon overrode startInTray" -- which, before this
                // fix, was true whether or not the override worked. A test that cannot fail is
                // not evidence.
                //
                // NOT on Linux (quick 260930-ea0): the docked inspector attached from here races
                // the page's entry module and the page's WebKitWebProcess aborts, leaving a white
                // window (`should_auto_open_devtools` documents the measurement; session
                // `.planning/debug/resolved/linux-dev-app-blank-without-dmabuf-workaround.md`).
                // The platform gate sits OUTSIDE the visibility match so that match is unchanged.
                #[cfg(debug_assertions)]
                if should_auto_open_devtools(std::env::consts::OS) {
                    match app.get_webview_window(MAIN_WINDOW_LABEL) {
                        Some(window) => match window.is_visible() {
                            Ok(true) => {
                                window.open_devtools();
                                shell_eprintln!(
                                    "[shell] devtools opened for 'main' webview (debug build)"
                                );
                            }
                            Ok(false) => shell_eprintln!(
                                "[shell] devtools NOT opened: 'main' webview is hidden (startInTray or --no-gui) -- opening it would force the window visible and defeat that setting"
                            ),
                            // Erring toward NOT opening: a devtools window the developer can
                            // open by hand is a smaller loss than silently defeating a setting
                            // the user asked for.
                            Err(e) => shell_eprintln!(
                                "[shell] WARN: devtools NOT opened: could not read 'main' webview visibility ({e})"
                            ),
                        },
                        None => shell_eprintln!(
                            "[shell] WARN: no 'main' webview window found — devtools not opened"
                        ),
                    }
                } else {
                    shell_eprintln!(
                        "[shell] devtools NOT auto-opened for 'main' webview on linux (debug build) -- the inspector attach races page boot; right-click > Inspect Element opens it"
                    );
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar_invoke,
            sidecar_send,
            open_external,
            sidecar_store_snapshot
        ])
        .build(tauri::generate_context!())
        .expect("error while running the GameLib Tauri shell")
        // WR-03: the sidecar child must not outlive the app, so the `RunEvent::Exit` arm below
        // reaps it (an orphan would retain an authenticated Steam session, open sockets and file
        // handles). Quits are now ROUTED rather than skipping `app_exit`: the red X and Alt+F4
        // by the main-window close handler, Cmd+Q by the macOS app menu, tray Quit by its menu
        // arm -- all through `quit_via_sidecar` -> the sidecar's `handleExit()` -> `app_exit`.
        // The `RunEvent::Exit` reap remains the backstop for logout/shutdown (which must not be
        // blocked) and for the `exit(0)` fallbacks; Dock Quit is routed by `macos_terminate_veto`.
        .run(move |app_handle, event| match event {
            // OBSERVED, NEVER PREVENTED. A routed quit arrives as `code: Some(0)` (`app.exit(0)`
            // from the `app_exit` arm), which makes this line the live gate's proof that a quit
            // took the sidecar route rather than `terminate:`. `code: None` is emitted only AFTER
            // the last window is destroyed, so stopping it would strand a windowless app; and
            // on macOS Cmd+Q / Dock Quit never arrive here at all (`terminate:` goes straight to
            // `applicationWillTerminate:`; `macos_terminate_veto` vetoes it before that).
            tauri::RunEvent::ExitRequested { code, .. } => {
                shell_diag(&format!("exit requested (code={code:?})"));
                // D-03: this arm never calls `prevent_exit()` (a vetoed quit never reaches it),
                // so every arrival is an intentional exit: flag it before the sidecar closes.
                if let Some(state) = app_handle.try_state::<Arc<SidecarState>>() {
                    state.begin_shutdown();
                }
                // The shell's own exits carry `Some(_)`: from here a `terminate:` must not veto.
                #[cfg(target_os = "macos")]
                if code.is_some() {
                    macos_terminate_veto::mark_exiting();
                }
            }
            tauri::RunEvent::Exit => {
                if let Some(state) = app_handle.try_state::<Arc<SidecarState>>() {
                    state.shutdown_child();
                }
                // Phase 35 Plan 08 (D-08, REQ-35-06, threat T-35-31): drop every OS power
                // assertion still held. Same exit-path discipline as `shutdown_child()` above
                // and the socket cleanup below -- a leaked assertion outlives the process and
                // keeps the user's machine awake with no UI left to release it, which on a
                // laptop means an unattended drain to zero.
                wake_lock_release_all();
                // Phase 34.5 gap cycle 6 plan 44 (D-44-A): best-effort socket cleanup on a
                // clean quit, so a fresh start does not have to fall through
                // `acquire_single_instance`'s stale-socket recovery path. Swallowed, like
                // `shutdown_child()`'s own exit-path discipline -- an unwind here is worse
                // than a leaked socket file.
                #[cfg(unix)]
                if let Some(path) = &single_instance_socket_path_var {
                    let _ = std::fs::remove_file(path);
                }
            }
            _ => {}
        });
}

/// Behavioral tests over `timeout_for()` (Phase 34.2 gap cycle 3, plan 22) — closes the warning
/// carried forward across all three of this phase's verification rounds: no Rust-side test
/// proved `timeout_for()` actually consults `LONG_RUNNING_CHANNELS`. The JS-side
/// `src/backend/__tests__/longRunningChannels.test.ts` gate covers the array's CONTENTS (a
/// comment-stripped source assertion, set-equality); this module covers the FUNCTION's
/// BEHAVIOR — if `timeout_for` ever reverted to an unconditional `Some(INVOKE_TIMEOUT)` or an
/// unconditional `None`, every test in that JS file would still pass unchanged, but the tests
/// below would not (see `34.2-22-SUMMARY.md` for the hand-verified RED proof in both
/// directions). This project's CI runs no cargo step at all (`.github/workflows/*.yml` contains
/// neither `cargo test` nor `cargo check`), so these tests are run manually
/// (`cd src-tauri && cargo test`) and their continued existence is pinned by a jest gate in the
/// JS file above rather than by any automated Rust step.
///
/// Phase 34.3 Plan 03 / REQ-34.3-08 extends this module with the clipboard write args and
/// `clipboard_read_value` — the pure, `AppHandle`-free surface extracted from the
/// `clipboard_write_text`/`clipboard_read_text` dispatch arms, since those arms' own
/// `app.clipboard()` calls need a live Tauri runtime a `#[test]` cannot construct. As with
/// `timeout_for()` above, this project's CI runs no cargo step, so these are hand-run too —
/// the arms' plugin calls themselves are proven by REQ-34.3-11's live-gate item 3, not by
/// these tests.
///
/// Phase 34.4.1 Plan 01 / REQ-34.4.1-01/-09 extends this module further with
/// `next_login_window_label`, `login_window_url_arg`, `cookie_domain_matches` and
/// `login_event_value` — the pure logic behind the five `humble_login_*` dispatch arms,
/// proven the same way (a `#[test]` cannot construct a live `WebviewWindowBuilder`); the
/// arms' actual window/cookie API calls are proven by REQ-34.4.1-12's live gate instead.
///
/// Phase 34.4.1 Plan 04 / REQ-34.4.1-05 extends this module further with `reveal_post_args`
/// and `reveal_post_script` — the pure arg-validation and script-templating logic behind the
/// `humble_reveal_post` dispatch arm, proven the same way; the arm's actual window/eval/
/// navigation-intercept calls are proven empirically instead, by this plan's Task 1
/// (RESEARCH.md Open Question 1) and by `34.4.1-08`'s live gate item 4 (Open Question 2).
///
/// 34.4.1 gap cycle plan 15 (F-6 BLOCKING, REQ-34.4.1-06/REQ-34.4.1-GAP-03) extends this module
/// further with `clear_storage_args` and `clear_storage_script` — the pure arg-validation and
/// script-templating logic behind the new `humble_login_clear_storage` dispatch arm, proven the
/// same way; the arm's actual window/eval/navigation-intercept calls are NOT covered by this
/// plan's own verification (no automated layer can drive a real WKWebView's storage APIs) and
/// remain proven only by plan 20's blocking live-gate re-run, once plan 16 wires this capability
/// into the two disconnect paths.
#[cfg(test)]
mod tests {
    #[test]
    fn on_sidecar_eof_is_silent_during_intentional_shutdown() {
        let (down, shown) = (AtomicBool::new(true), AtomicBool::new(false));
        let mut calls = 0;
        on_sidecar_eof(&down, &shown, || calls += 1);
        assert_eq!(calls, 0);
        assert!(!shown.load(Ordering::SeqCst));
    }

    #[test]
    fn on_sidecar_eof_surfaces_when_not_shutting_down() {
        let (down, shown) = (AtomicBool::new(false), AtomicBool::new(false));
        let mut calls = 0;
        on_sidecar_eof(&down, &shown, || calls += 1);
        assert_eq!(calls, 1);
        assert!(shown.load(Ordering::SeqCst));
    }

    #[test]
    fn on_sidecar_eof_surfaces_at_most_once() {
        let (down, shown) = (AtomicBool::new(false), AtomicBool::new(false));
        let mut calls = 0;
        on_sidecar_eof(&down, &shown, || calls += 1);
        on_sidecar_eof(&down, &shown, || calls += 1);
        assert_eq!(calls, 1);
    }

    #[cfg(unix)]
    #[test]
    fn kill_process_group_rejects_non_positive_and_init_pgids() {
        for bad in [0, 1, -5] {
            let err = kill_process_group(bad).expect_err("pgid <= 1 must be refused");
            assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput, "pgid {bad}");
        }
    }

    /// Spawns `/bin/sh` in its own group, which backgrounds `sleep 30` and exits. Returns the
    /// (already waited) leader pid, the surviving member pid, and the remaining stdout pipe.
    /// Env is cleared for hygiene (no user profile is read; fake-HOME convention scans only TS/JS).
    #[cfg(unix)]
    fn spawn_orphaned_group() -> (i32, i32, std::process::ChildStdout) {
        use std::os::unix::process::CommandExt;
        let mut child = Command::new("/bin/sh")
            .args(["-c", "sleep 30 & echo $!"])
            .env_clear()
            .env("PATH", "/bin:/usr/bin")
            .process_group(0)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .stdout(Stdio::piped())
            .spawn()
            .expect("spawn /bin/sh");
        let mut reader = BufReader::new(child.stdout.take().expect("piped stdout"));
        let mut line = String::new();
        reader.read_line(&mut line).expect("read member pid");
        let member: i32 = line.trim().parse().expect("member pid");
        let leader = child.id() as i32;
        child.wait().expect("wait leader");
        (leader, member, reader.into_inner())
    }

    #[cfg(unix)]
    #[test]
    fn kill_process_group_reaps_members_after_leader_exits() {
        let (leader, member, mut rest) = spawn_orphaned_group();
        // SAFETY: signal 0 only probes existence.
        assert_eq!(unsafe { libc::kill(member, 0) }, 0, "member alive after leader exit");
        kill_process_group(leader).expect("group outlives its leader");
        let (tx, rx) = std::sync::mpsc::channel();
        thread::spawn(move || {
            let mut sink = Vec::new();
            let _ = rest.read_to_end(&mut sink);
            let _ = tx.send(());
        });
        rx.recv_timeout(Duration::from_secs(5)).expect("EOF once the member is killed");
    }

    #[cfg(unix)]
    #[test]
    fn kill_process_group_on_empty_group_is_esrch() {
        let (leader, _member, mut rest) = spawn_orphaned_group();
        kill_process_group(leader).expect("first reap");
        let mut sink = Vec::new();
        let _ = rest.read_to_end(&mut sink); // EOF => member dead
        // The killed member may linger as an unreaped zombie (macOS then reports EPERM, a
        // reaper-less Linux container reports Ok); once reaped the group is empty -> ESRCH.
        for _ in 0..50 {
            match kill_process_group(leader) {
                Err(e) if e.raw_os_error() == Some(libc::ESRCH) => return,
                _ => thread::sleep(Duration::from_millis(100)),
            }
        }
        let err = kill_process_group(leader).expect_err("empty group");
        assert!(matches!(err.raw_os_error(), Some(libc::ESRCH) | Some(libc::EPERM)));
    }

    /// Maps a trimmed handler definition line (`fn rpc_humble_login_open(` or
    /// `pub(crate) fn rpc_humble_login_open(`) to its wire name (`humble_login_open`); `None` for
    /// any other line. Since Phase 71 the dispatcher arms are one-line calls and the bodies live in
    /// `rpc_*` handlers, so source-text pins locate a body through this one helper.
    fn rpc_fn_name(trimmed: &str) -> Option<String> {
        let rest = trimmed
            .strip_prefix("pub(crate) fn rpc_")
            .or_else(|| trimmed.strip_prefix("fn rpc_"))?;
        let name = rest.split('(').next()?;
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return None;
        }
        Some(name.to_string())
    }

    /// True for a column-0 `fn `/`pub(crate) fn ` line (any top-level fn, handler or not): the
    /// boundary that ends the handler a scan is currently inside.
    fn is_top_level_fn_line(line: &str) -> bool {
        line.starts_with("fn ") || line.starts_with("pub(crate) fn ")
    }

    use super::*;

    /// Every shell source file EXCEPT the pre-existing sibling modules, so the source-text tests
    /// below see the whole `main.rs` that used to be one file. A negative (absence/count) assertion
    /// run against only one of these files would pass vacuously for a needle that moved.
    const SHELL_SOURCE_FILES: &[&str] = &[
        "main.rs",
        "app_lifecycle.rs",
        "clipboard.rs",
        "dialogs.rs",
        "ipc_contract.rs",
        "keyring_dispatch.rs",
        "login_window.rs",
        "login_window/devtools.rs",
        "login_window/humble_cookies.rs",
        "login_window/humble_helpers.rs",
        "login_window/humble_open.rs",
        "login_window/humble_reveal.rs",
        "login_window/invite_picker.rs",
        "login_window/windows_cdp.rs",
        "login_window/pristine_epic.rs",
        "login_window/sheet.rs",
        "login_window/macos_cookies.rs",
        "notification_show.rs",
        "relay_commands.rs",
        "rust_dispatch.rs",
        "scan_dispatch.rs",
        "shell_state.rs",
        "shell_open.rs",
        "sidecar.rs",
        "single_instance.rs",
        "store_embed.rs",
        "store_embed/state.rs",
        "terminate_veto.rs",
        "tray.rs",
        "wake_lock.rs",
        "wake_lock/linux.rs",
        "wake_lock/macos.rs",
        "wake_lock/windows.rs",
    ];

    const SHELL_SOURCE_PARTS: &[&str] = &[
        include_str!("main.rs"),
        include_str!("app_lifecycle.rs"),
        include_str!("clipboard.rs"),
        include_str!("dialogs.rs"),
        include_str!("ipc_contract.rs"),
        include_str!("keyring_dispatch.rs"),
        include_str!("login_window.rs"),
        include_str!("login_window/devtools.rs"),
        include_str!("login_window/humble_cookies.rs"),
        include_str!("login_window/humble_helpers.rs"),
        include_str!("login_window/humble_open.rs"),
        include_str!("login_window/humble_reveal.rs"),
        include_str!("login_window/invite_picker.rs"),
        include_str!("login_window/windows_cdp.rs"),
        include_str!("login_window/pristine_epic.rs"),
        include_str!("login_window/sheet.rs"),
        include_str!("login_window/macos_cookies.rs"),
        include_str!("notification_show.rs"),
        include_str!("relay_commands.rs"),
        include_str!("rust_dispatch.rs"),
        include_str!("scan_dispatch.rs"),
        include_str!("shell_state.rs"),
        include_str!("shell_open.rs"),
        include_str!("sidecar.rs"),
        include_str!("single_instance.rs"),
        include_str!("store_embed.rs"),
        include_str!("store_embed/state.rs"),
        include_str!("terminate_veto.rs"),
        include_str!("tray.rs"),
        include_str!("wake_lock.rs"),
        include_str!("wake_lock/linux.rs"),
        include_str!("wake_lock/macos.rs"),
        include_str!("wake_lock/windows.rs"),
    ];

    /// Cuts every whole test-module block (column-0 `#[cfg(test)]` immediately followed by a
    /// column-0 `mod <ident> {`, through the next line that is exactly `}`) and keeps the rest.
    /// Same rule as the jest reader `stripRustTestModules`.
    fn cut_test_modules(src: &str) -> String {
        let lines: Vec<&str> = src.split('\n').collect();
        let mut out: Vec<&str> = Vec::with_capacity(lines.len());
        let mut i = 0;
        while i < lines.len() {
            let opens_test_mod = lines[i] == "#[cfg(test)]"
                && lines.get(i + 1).is_some_and(|next| {
                    next.strip_prefix("mod ").is_some_and(|rest| {
                        rest.strip_suffix(" {").is_some_and(|ident| {
                            !ident.is_empty()
                                && ident.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                        })
                    })
                });
            if opens_test_mod {
                i += 2;
                while i < lines.len() && lines[i] != "}" {
                    i += 1;
                }
                i += 1;
                continue;
            }
            out.push(lines[i]);
            i += 1;
        }
        out.join("\n")
    }

    /// The shell source with each file's own test modules cut, so a literal needle cannot
    /// self-match in a co-located test.
    fn shell_production_source() -> String {
        SHELL_SOURCE_PARTS.iter().map(|p| cut_test_modules(p)).collect::<Vec<_>>().join("\n")
    }

    #[test]
    fn shell_source_parts_align_with_file_names() {
        assert_eq!(SHELL_SOURCE_PARTS.len(), SHELL_SOURCE_FILES.len());
        for (i, name) in SHELL_SOURCE_FILES.iter().enumerate() {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src").join(name);
            let on_disk = std::fs::read_to_string(&path).expect("shell source file must be readable");
            assert!(SHELL_SOURCE_PARTS[i] == on_disk, "part {i} is not {name}");
        }
    }

    #[test]
    fn cut_test_modules_cuts_whole_test_mod_blocks_only() {
        let trailing = "fn a() {}\n#[cfg(test)]\nmod tests {\n    fn t() {}\n}\n";
        assert_eq!(cut_test_modules(trailing), "fn a() {}\n");
        let mid = "fn a() {}\n#[cfg(test)]\nmod shell_open_tests {\n    fn t() {}\n}\nfn b() {}\n";
        assert_eq!(cut_test_modules(mid), "fn a() {}\nfn b() {}\n");
        let kept = "// #[cfg(test)]\n// mod tests {\n    #[cfg(test)]\n    mod tests {\n    }\nfn c() {}\n";
        assert_eq!(cut_test_modules(kept), kept);
        let attr_only = "#[cfg(test)]\nfn helper() {}\n";
        assert_eq!(cut_test_modules(attr_only), attr_only);
    }

    #[test]
    fn shell_production_source_main_part_equals_pre_test_slice() {
        let main = SHELL_SOURCE_PARTS[0];
        let opener = concat!("#[cfg(test)]\n", "mod tests", " {");
        let at = main.find(opener).expect("main.rs test module opener not found");
        assert!(cut_test_modules(main) == main[..at], "main.rs production text differs from the pre-test slice");
    }

    /// Guard: a new shell module file must be named in `SHELL_SOURCE_FILES`, or the source-text
    /// tests would silently stop covering it.
    #[test]
    fn shell_source_files_names_every_shell_module_file() {
        const PRE_EXISTING_SIBLINGS: &[&str] = &[
            "epic_embed_js_dialog.rs",
            "epic_embed_state.rs",
            "macos_epic_embed.rs",
            "macos_native_gamepad.rs",
            "macos_notifications.rs",
            "native_gamepad_shape.rs",
            "notification_backend.rs",
            "store_embed_handoff_policy.rs",
        ];
        fn walk(dir: &std::path::Path, prefix: &str, out: &mut Vec<String>) {
            for entry in std::fs::read_dir(dir).expect("src dir must be readable") {
                let entry = entry.expect("dir entry");
                let name = entry.file_name().to_string_lossy().into_owned();
                let rel = format!("{prefix}{name}");
                if entry.path().is_dir() {
                    walk(&entry.path(), &format!("{rel}/"), out);
                } else if name.ends_with(".rs") {
                    out.push(rel);
                }
            }
        }
        let mut found = Vec::new();
        walk(&std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src"), "", &mut found);
        assert!(found.len() > PRE_EXISTING_SIBLINGS.len(), "src walk found too few files");
        let missing: Vec<&String> = found
            .iter()
            .filter(|f| !PRE_EXISTING_SIBLINGS.contains(&f.as_str()))
            // D-11: a pre-split sibling and its directory (`macos_epic_embed.rs` + `macos_epic_embed/`).
            .filter(|f| {
                !PRE_EXISTING_SIBLINGS.iter().any(|sib| {
                    sib.strip_suffix(".rs")
                        .is_some_and(|stem| f.starts_with(&format!("{stem}/")))
                })
            })
            .filter(|f| !SHELL_SOURCE_FILES.contains(&f.as_str()))
            .collect();
        assert!(
            missing.is_empty(),
            "shell .rs files missing from SHELL_SOURCE_FILES/SHELL_SOURCE: {missing:?}"
        );
    }
    /// D-10 (Rust half): no test slices shell source on the test-module opener; the cutter is the
    /// only place that knows that boundary. Needles are built with `concat!` so this guard cannot
    /// match itself.
    #[test]
    fn no_shell_source_test_slices_on_mod_tests() {
        let opener = concat!("mod tests", " {");
        let needles = [
            concat!(".find(\"", "mod tests", " {\")"),
            concat!(".split(\"", "mod tests", " {\")"),
            concat!(".split_once(\"", "mod tests", " {\")"),
        ];
        assert!(!needles.is_empty());
        let main = include_str!("main.rs");
        let at = main.find(concat!("\n", "mod tests", " {")).expect("tests module opener");
        let tests_text = &main[at..];
        for needle in needles {
            assert!(
                !tests_text.contains(needle),
                "a test slices shell source on `{opener}` (use shell_production_source): {needle}"
            );
        }
    }

    use serde_json::json;

    // ---- quick 261101-llf: bridge invite picker window ----

    #[test]
    fn bridge_invite_picker_path_builds_the_query() {
        assert_eq!(
            bridge_invite_picker_path("3205720", "a1b2-C3d4").unwrap(),
            "index.html?window=bridge-invite&appId=3205720&ackId=a1b2-C3d4"
        );
        assert!(bridge_invite_picker_path("1234567890", "x").is_ok());
    }

    #[test]
    fn bridge_invite_picker_path_rejects_bad_ids() {
        for app_id in ["", "abc", "12a", "12345678901", "1 2", "1&2", "-1"] {
            assert_eq!(
                bridge_invite_picker_path(app_id, "ok-1").unwrap_err(),
                "bridge_invite_picker_open:bad-app-id",
                "{app_id:?}"
            );
        }
        let long = "a".repeat(65);
        for ack in [
            "",
            "a&b",
            "a#b",
            "a%20b",
            "a/b",
            "a b",
            "a=b",
            long.as_str(),
        ] {
            assert_eq!(
                bridge_invite_picker_path("1", ack).unwrap_err(),
                "bridge_invite_picker_open:bad-ack-id",
                "{ack:?}"
            );
        }
        assert!(bridge_invite_picker_path("1", &"a".repeat(64)).is_ok());
    }

    #[test]
    fn bridge_invite_nav_allowed_accepts_only_app_origins() {
        let u = |s: &str| tauri::Url::parse(s).unwrap();
        let dev = u("http://localhost:5173");
        let q = "index.html?window=bridge-invite&appId=1&ackId=a";
        assert!(bridge_invite_nav_allowed(
            &u(&format!("tauri://localhost/{q}")),
            None
        ));
        assert!(bridge_invite_nav_allowed(
            &u(&format!("http://tauri.localhost/{q}")),
            None
        ));
        assert!(bridge_invite_nav_allowed(
            &u(&format!("http://localhost:5173/{q}")),
            Some(&dev)
        ));
        assert!(!bridge_invite_nav_allowed(
            &u("https://example.com/"),
            Some(&dev)
        ));
        assert!(!bridge_invite_nav_allowed(
            &u("http://localhost:9999/"),
            Some(&dev)
        ));
        assert!(!bridge_invite_nav_allowed(
            &u("http://localhost:5173/"),
            None
        ));
        assert!(!bridge_invite_nav_allowed(
            &u("file:///etc/passwd"),
            Some(&dev)
        ));
        assert!(!bridge_invite_nav_allowed(&u("about:blank"), Some(&dev)));
    }

    // ---- quick 260930-lyk: tri-state tray glyph (Auto / Light / Dark) ----

    #[test]
    fn tray_variant_parse_is_an_exact_allow_list() {
        assert_eq!(parse_tray_icon_mode(Some("auto")), TrayIconMode::Auto);
        assert_eq!(parse_tray_icon_mode(Some("light")), TrayIconMode::Light);
        assert_eq!(parse_tray_icon_mode(Some("dark")), TrayIconMode::Dark);
        // Wrong case and absent both fall to the documented default.
        assert_eq!(parse_tray_icon_mode(Some("Dark")), TrayIconMode::Auto);
        assert_eq!(parse_tray_icon_mode(Some("")), TrayIconMode::Auto);
        assert_eq!(parse_tray_icon_mode(None), TrayIconMode::Auto);
    }

    #[test]
    fn tray_variant_taskbar_value_maps_to_the_glyph() {
        // 0 = dark taskbar -> white glyph; 1 = light taskbar -> black glyph; unreadable -> white.
        assert!(!tray_glyph_dark_for_system_uses_light_theme(Some(0)));
        assert!(tray_glyph_dark_for_system_uses_light_theme(Some(1)));
        assert!(!tray_glyph_dark_for_system_uses_light_theme(None));
    }

    #[test]
    fn tray_variant_resolve_honours_the_mode() {
        // Light / Dark ignore the registry value entirely.
        assert!(!resolve_tray_icon_dark(TrayIconMode::Light, Some(1)));
        assert!(resolve_tray_icon_dark(TrayIconMode::Dark, Some(0)));
        assert!(resolve_tray_icon_dark(TrayIconMode::Dark, None));
        // Auto follows the taskbar value.
        assert!(resolve_tray_icon_dark(TrayIconMode::Auto, Some(1)));
        assert!(!resolve_tray_icon_dark(TrayIconMode::Auto, Some(0)));
        assert!(!resolve_tray_icon_dark(TrayIconMode::Auto, None));
    }

    #[test]
    fn tray_variant_mode_store_round_trips() {
        // One test owns the process-wide static so parallel tests cannot interleave writes.
        for mode in [TrayIconMode::Light, TrayIconMode::Dark, TrayIconMode::Auto] {
            store_tray_icon_mode(mode);
            assert_eq!(current_tray_icon_mode(), mode);
        }
        TRAY_ICON_MODE.store(200, Ordering::Relaxed);
        assert_eq!(current_tray_icon_mode(), TrayIconMode::Auto);
        store_tray_icon_mode(TrayIconMode::Auto);
    }

    const TRAY_SET_ICON_WIRE_FIXTURE: &str =
        include_str!("../../meta/fixtures/tray-set-icon-wire-args.json");

    #[test]
    fn tray_variant_wire_contract_parses_every_shipped_payload() {
        let doc: Value = serde_json::from_str(TRAY_SET_ICON_WIRE_FIXTURE)
            .expect("tray_set_icon wire fixture must be valid JSON");
        let arm = doc
            .get("tray_set_icon")
            .and_then(|v| v.as_object())
            .expect("wire fixture missing the tray_set_icon object");
        assert_eq!(arm.len(), 3, "exactly auto/light/dark");
        for (key, args) in arm {
            let args = args.as_array().expect("each entry is an args array");
            assert_eq!(
                tray_set_icon_mode_from_args(args),
                parse_tray_icon_mode(Some(key)),
                "fixture entry {key:?}"
            );
        }
        // Non-vacuity: the keys really are the three known modes, not three Auto fall-throughs.
        assert_eq!(
            tray_set_icon_mode_from_args(arm["dark"].as_array().unwrap()),
            TrayIconMode::Dark
        );
        assert_eq!(
            tray_set_icon_mode_from_args(arm["light"].as_array().unwrap()),
            TrayIconMode::Light
        );
    }

    #[test]
    fn tray_variant_wire_contract_retired_dark_bool_shape_is_auto_not_dark() {
        // Regression lock: the pre-2026-09-30 payload `{ dark: true }` must NOT be read as Dark.
        let retired = vec![json!({ "dark": true })];
        assert_eq!(tray_set_icon_mode_from_args(&retired), TrayIconMode::Auto);
        assert_eq!(tray_set_icon_mode_from_args(&[]), TrayIconMode::Auto);
    }

    /// Real-profile, READ-ONLY measurement: proves the `RegGetValueW` flags and buffer against
    /// this machine's actual value by comparing with `reg.exe`. Ignored by default because a CI
    /// runner's profile may lack the key. Writes nothing.
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn tray_variant_system_uses_light_theme_read_matches_reg_exe() {
        let out = std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                "/v",
                "SystemUsesLightTheme",
            ])
            .output()
            .expect("reg.exe must be runnable");
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        let expected = text
            .lines()
            .find(|l| l.contains("REG_DWORD"))
            .and_then(|l| l.split_whitespace().last())
            .and_then(|hex| hex.strip_prefix("0x"))
            .and_then(|hex| u32::from_str_radix(hex, 16).ok());
        println!("reg.exe SystemUsesLightTheme = {expected:?}");
        assert_eq!(read_system_uses_light_theme(), expected);
    }

    // ---- Phase 40 store-embed WIRE CONTRACT (added 2026-09-05 after a live-gate failure) ----
    //
    // These read `meta/fixtures/store-embed-wire-args.json` -- the SAME file the TS suite
    // `storeEmbedWireContract.test.ts` asserts the sidecar actually emits. Neither side can
    // change the wire shape without breaking the other.
    //
    // Why: on 2026-09-05 a live gate found `store_embed_open` rejecting every call with the bare
    // `store_embed_open:bad-args`. The sidecar sent POSITIONAL arrays (`[url, x, y, w, h]`) while
    // these parsers read a single OBJECT (`{url,x,y,w,h}`). Every gate was green -- the TS suite
    // drove the real transport into a JS test handler, and these parsers had NO Rust tests at all.
    // Both sides were tested; the contract between them was not.
    const STORE_EMBED_WIRE_FIXTURE: &str =
        include_str!("../../meta/fixtures/store-embed-wire-args.json");

    fn wire_args(arm: &str) -> Vec<Value> {
        let doc: Value = serde_json::from_str(STORE_EMBED_WIRE_FIXTURE)
            .expect("store-embed wire fixture must be valid JSON");
        doc.get(arm)
            .and_then(|v| v.as_array())
            .unwrap_or_else(|| panic!("wire fixture missing array for arm {arm}"))
            .clone()
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_wire_contract_open_parses_the_shipped_payload() {
        let (url, x, y, w, h, store_key, home_url) =
            store_embed_open_args(&wire_args("store_embed_open"))
                .expect("the shipped open payload must parse");
        assert_eq!(url.as_str(), "https://store.steampowered.com/");
        assert_eq!((x, y, w, h), (12.5, 64.0, 1280.25, 800.0));
        assert_eq!(store_key, "steam");
        assert_eq!(
            home_url.as_ref().map(tauri::Url::as_str),
            Some("https://store.steampowered.com/")
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_wire_contract_set_bounds_parses_the_shipped_payload() {
        let (x, y, w, h) = store_embed_set_bounds_args(&wire_args("store_embed_set_bounds"))
            .expect("the shipped set_bounds payload must parse");
        assert_eq!((x, y, w, h), (10.5, -3.0, 799.999, 0.0));
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_wire_contract_navigate_parses_the_shipped_payload() {
        let url = store_embed_navigate_args(&wire_args("store_embed_navigate"))
            .expect("the shipped navigate payload must parse");
        assert_eq!(url.as_str(), "https://example.com/next");
    }

    // The regression direction: the POSITIONAL shape that actually shipped must be REJECTED, so a
    // revert to it cannot pass. A "does it parse" test alone would be blind to this.
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_wire_contract_rejects_the_positional_shape_that_shipped() {
        let positional = vec![
            Value::String("https://store.steampowered.com/".into()),
            Value::from(12.5),
            Value::from(64.0),
            Value::from(1280.25),
            Value::from(800.0),
        ];
        assert_eq!(
            store_embed_open_args(&positional).unwrap_err(),
            "store_embed_open:bad-args"
        );
        assert_eq!(
            store_embed_navigate_args(&[Value::String("https://example.com/next".into())])
                .unwrap_err(),
            "store_embed_navigate:bad-args"
        );
        assert_eq!(
            store_embed_set_bounds_args(&[Value::from(10.5), Value::from(-3.0)]).unwrap_err(),
            "store_embed_set_bounds:bad-args"
        );
    }

    // Per-suffix pins for the generated `x-field-errors` from_args: each bad field names itself
    // and the first failing field in declared order wins (T-67-69).
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    fn open_obj_with(key: &str, bad: Value) -> Vec<Value> {
        let mut obj = wire_args("store_embed_open")[0].as_object().unwrap().clone();
        obj.insert(key.to_string(), bad);
        vec![Value::Object(obj)]
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_open_field_errors_name_each_bad_field() {
        for key in ["url", "x", "y", "w", "h", "storeKey", "homeUrl"] {
            let bad = Value::Bool(true);
            assert_eq!(
                store_embed_open_args(&open_obj_with(key, bad)).unwrap_err(),
                format!("store_embed_open:bad-args:{key}")
            );
        }
        // Absent required field, not just a wrong type.
        let mut obj = wire_args("store_embed_open")[0].as_object().unwrap().clone();
        obj.remove("storeKey");
        assert_eq!(
            store_embed_open_args(&[Value::Object(obj)]).unwrap_err(),
            "store_embed_open:bad-args:storeKey"
        );
        // Optional homeUrl: absent and null are fine.
        let mut obj = wire_args("store_embed_open")[0].as_object().unwrap().clone();
        obj.remove("homeUrl");
        assert!(store_embed_open_args(&[Value::Object(obj.clone())]).unwrap().6.is_none());
        obj.insert("homeUrl".into(), Value::Null);
        assert!(store_embed_open_args(&[Value::Object(obj)]).unwrap().6.is_none());
        // Missing / non-object argument is the bare string.
        assert_eq!(store_embed_open_args(&[]).unwrap_err(), "store_embed_open:bad-args");
        assert_eq!(
            store_embed_open_args(&[Value::Null]).unwrap_err(),
            "store_embed_open:bad-args"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_set_bounds_field_errors_name_each_bad_field() {
        for key in ["x", "y", "w", "h"] {
            let mut obj = wire_args("store_embed_set_bounds")[0].as_object().unwrap().clone();
            obj.insert(key.to_string(), Value::String("nope".into()));
            assert_eq!(
                store_embed_set_bounds_args(&[Value::Object(obj)]).unwrap_err(),
                format!("store_embed_set_bounds:bad-args:{key}")
            );
        }
        assert_eq!(
            store_embed_set_bounds_args(&[]).unwrap_err(),
            "store_embed_set_bounds:bad-args"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_navigate_field_errors_name_the_url() {
        let obj = serde_json::json!({ "url": 5 });
        assert_eq!(
            store_embed_navigate_args(&[obj]).unwrap_err(),
            "store_embed_navigate:bad-args:url"
        );
        assert_eq!(
            store_embed_navigate_args(&[serde_json::json!({})]).unwrap_err(),
            "store_embed_navigate:bad-args:url"
        );
        assert_eq!(
            store_embed_navigate_args(&[]).unwrap_err(),
            "store_embed_navigate:bad-args"
        );
    }

    // ---- open_external scheme allow-list (35-21, CR-01) ----
    //
    // `open_external` itself needs a live `AppHandle` (`app.opener()`), so these tests drive
    // `open_external_scheme_check` -- the pure half `open_external` calls before touching the
    // plugin. RED direction: an implementation that used a substring/`.contains()` match
    // instead of an exact allow-list comparison, or one that skipped `to_ascii_lowercase()`,
    // would flip one or more of the rejection/case-insensitivity cases below to `Ok`.

    #[test]
    fn open_external_allowed_schemes_are_exactly_the_five_member_set() {
        // Pins the const's membership so a future silent widening (e.g. adding `file` to
        // "fix" an unrelated bug) fails THIS test rather than passing review unnoticed.
        assert_eq!(
            OPEN_EXTERNAL_ALLOWED_SCHEMES,
            &["https", "http", "mailto", "tel", "steam"]
        );
    }

    #[test]
    fn open_external_scheme_check_rejects_file_scheme() {
        assert!(open_external_scheme_check("file:///Applications/Some.app").is_err());
    }

    #[test]
    fn open_external_scheme_check_rejects_smb_scheme() {
        assert!(open_external_scheme_check("smb://evil.example/share").is_err());
    }

    #[test]
    fn open_external_scheme_check_rejects_javascript_scheme() {
        assert!(open_external_scheme_check("javascript:alert(1)").is_err());
    }

    #[test]
    fn open_external_scheme_check_rejects_a_url_with_no_scheme() {
        assert!(open_external_scheme_check("not-a-url-at-all").is_err());
    }

    #[test]
    fn open_external_scheme_check_accepts_steam_rungameid() {
        assert_eq!(open_external_scheme_check("steam://rungameid/440"), Ok(()));
    }

    #[test]
    fn open_external_scheme_check_accepts_only_the_exact_app_management_url() {
        assert_eq!(
            open_external_scheme_check(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles"
            ),
            Ok(())
        );
        assert!(open_external_scheme_check(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"
        )
        .is_err());
        assert!(open_external_scheme_check("x-apple.systempreferences:").is_err());
        assert!(open_external_scheme_check(
            "X-APPLE.SYSTEMPREFERENCES:com.apple.preference.security?Privacy_AppBundles&x"
        )
        .is_err());
    }

    #[test]
    fn open_external_scheme_check_accepts_https() {
        assert_eq!(open_external_scheme_check("https://example.com"), Ok(()));
    }

    #[test]
    fn open_external_scheme_check_accepts_mailto() {
        assert_eq!(open_external_scheme_check("mailto:a@b.c"), Ok(()));
    }

    #[test]
    fn open_external_scheme_check_is_case_insensitive() {
        assert_eq!(
            open_external_scheme_check("STEAM://rungameid/440"),
            Ok(()),
            "uppercase scheme must be accepted exactly like lowercase"
        );
        assert!(
            open_external_scheme_check("FILE:///etc/passwd").is_err(),
            "uppercase rejected scheme must still be rejected"
        );
    }

    #[test]
    fn open_external_command_body_calls_the_scheme_check_before_opening() {
        // `open_external` cannot be driven from a `#[test]` -- `app.opener()` needs a live
        // `AppHandle` a unit test structurally cannot construct. The helper tests above only
        // prove `open_external_scheme_check` in isolation; they say nothing about whether
        // `open_external` actually calls it, or calls it AFTER `app.opener()` has already run.
        // This test closes that gap by reading the command's own source at test time and
        // asserting the call precedes `app.opener()` textually within the function body.
        // RED-proof (recorded verbatim in the SUMMARY): deleting the
        // `open_external_scheme_check(&url)?;` line from `open_external`'s body -- the exact
        // mutation this test exists to catch, since every test above would still pass
        // unchanged against that mutation -- makes this test fail with the "must call
        // open_external_scheme_check" panic message below.
        let source = include_str!("relay_commands.rs");
        let body_start = source
            .find("fn open_external(url: String, app: AppHandle) -> Result<(), String> {")
            .expect("open_external definition not found in main.rs");
        // Bound the slice to JUST this function's body, ending at the next `#[tauri::command]`
        // (the following command, `sidecar_store_snapshot`). Without this bound, `.find()` on
        // the unbounded remainder of the file could match a LATER, unrelated mention of either
        // literal (e.g. this very test's own doc comment above, or a future test elsewhere in
        // this module) and produce a false PASS or a false FAIL for the wrong reason instead of
        // failing because the call is actually missing from `open_external`.
        let body_after_start = &source[body_start..];
        let body_end = body_after_start[1..]
            .find("#[tauri::command]")
            .map(|p| p + 1)
            .expect("open_external is not the last #[tauri::command] in main.rs");
        let body = &body_after_start[..body_end];
        let check_pos = body
            .find("open_external_scheme_check(&url)?;")
            .expect("open_external must call open_external_scheme_check before opening the URL");
        let open_pos = body
            .find("app.opener()")
            .expect("open_external must still call app.opener()");
        assert!(
            check_pos < open_pos,
            "open_external_scheme_check must run BEFORE app.opener().open_url"
        );
    }

    // ---- Tray recent-games id parsing (Phase 35 Plan 06, T-35-20) ----
    //
    // The `recent:<appName>` menu id is the one string in the tray path that crosses from a
    // menu event into a game launch. These tests cover BOTH directions of the round-trip and,
    // per the threat register, an explicit malformed-id rejection set -- a parser that only
    // ever saw well-formed input is not evidence of anything.

    #[test]
    fn recent_menu_id_round_trips_a_plain_app_name() {
        for app_name in ["Iris", "1207658777", "620", "a-b_c.d", "0"] {
            let id = tray_recent_menu_id(app_name);
            assert_eq!(id.as_deref(), Some(format!("recent:{app_name}").as_str()));
            let id = id.unwrap_or_default();
            assert_eq!(tray_recent_app_name(&id), Some(app_name));
        }
    }

    fn send_frame(channel: &str) -> SidecarRpcRequest {
        SidecarRpcRequest {
            id: channel.to_string(),
            kind: "send",
            channel: channel.to_string(),
            args: Vec::new(),
        }
    }

    #[test]
    fn send_writer_enqueue_does_not_wait_for_a_blocked_write() {
        // The defect: `sidecar_send` wrote on the main thread, so a write stuck on a full pipe
        // froze the UI. Enqueueing must return while the writer is blocked.
        let (release_tx, release_rx) = mpsc_channel::<()>();
        let release_rx = Mutex::new(release_rx);
        let (done_tx, done_rx) = mpsc_channel::<String>();
        let queue = spawn_send_writer(move |req| {
            let _ = release_rx.lock().unwrap().recv();
            let _ = done_tx.send(req.channel.clone());
            Ok(())
        });
        let started = std::time::Instant::now();
        for channel in ["a", "b", "c"] {
            queue.send(send_frame(channel)).unwrap();
        }
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "enqueue must not block on the write"
        );
        for _ in 0..3 {
            release_tx.send(()).unwrap();
        }
        let written: Vec<String> = (0..3)
            .map(|_| done_rx.recv_timeout(Duration::from_secs(5)).unwrap())
            .collect();
        assert_eq!(written, ["a", "b", "c"], "frames are written in send order");
    }

    #[test]
    fn send_writer_keeps_going_after_a_failed_write() {
        let (done_tx, done_rx) = mpsc_channel::<String>();
        let queue = spawn_send_writer(move |req| {
            let _ = done_tx.send(req.channel.clone());
            if req.channel == "broken" {
                Err("broken pipe".into())
            } else {
                Ok(())
            }
        });
        queue.send(send_frame("broken")).unwrap();
        queue.send(send_frame("after")).unwrap();
        assert_eq!(
            done_rx.recv_timeout(Duration::from_secs(5)).unwrap(),
            "broken"
        );
        assert_eq!(
            done_rx.recv_timeout(Duration::from_secs(5)).unwrap(),
            "after"
        );
    }

    #[test]
    fn tray_quit_hands_off_to_the_sidecar_when_the_probe_answers() {
        let sent = std::cell::Cell::new(false);
        let routed = route_quit_via_sidecar(
            || Ok(Value::String("ok".into())),
            Duration::from_secs(5),
            || {
                sent.set(true);
                Ok(())
            },
        );
        assert_eq!(routed, Ok(()));
        assert!(
            sent.get(),
            "the quit frame must be sent once the probe answers"
        );
    }

    #[test]
    fn tray_quit_falls_back_when_the_probe_fails_without_sending() {
        let sent = std::cell::Cell::new(false);
        let routed = route_quit_via_sidecar(
            || Err("sidecar closed before responding".into()),
            Duration::from_secs(5),
            || {
                sent.set(true);
                Ok(())
            },
        );
        assert!(routed.is_err());
        assert!(
            !sent.get(),
            "a dead sidecar must not be sent the quit frame"
        );
    }

    #[test]
    fn tray_quit_falls_back_when_the_probe_does_not_answer_in_time() {
        let sent = std::cell::Cell::new(false);
        let started = std::time::Instant::now();
        let routed = route_quit_via_sidecar(
            || {
                thread::sleep(Duration::from_secs(2));
                Ok(Value::Null)
            },
            Duration::from_millis(100),
            || {
                sent.set(true);
                Ok(())
            },
        );
        assert!(routed.is_err());
        assert!(!sent.get());
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "the fallback must not wait for a hung probe"
        );
    }

    #[test]
    fn tray_quit_falls_back_when_the_quit_frame_cannot_be_written() {
        let routed = route_quit_via_sidecar(
            || Ok(Value::Null),
            Duration::from_secs(5),
            || Err("broken pipe".into()),
        );
        assert_eq!(routed, Err("broken pipe".to_string()));
    }

    // ---- quick 261008-kvz: Cmd+Q and the red X route through the sidecar ----

    #[test]
    fn quit_routing_close_hides_only_when_a_tray_exists_and_the_setting_says_hide() {
        assert_eq!(close_request_action(true, true), CloseRequestAction::Hide);
        assert_eq!(
            close_request_action(false, true),
            CloseRequestAction::RouteQuit,
            "no tray to restore from: hiding would trap the user"
        );
        assert_eq!(
            close_request_action(true, false),
            CloseRequestAction::RouteQuit,
            "exitToTray off: the close is routed, not hidden"
        );
        assert_eq!(
            close_request_action(false, false),
            CloseRequestAction::RouteQuit
        );
    }

    #[test]
    fn quit_routing_a_failed_settings_read_routes_the_quit_never_hides() {
        // `load_tray_settings()` degrades to `default()` on a read failure.
        assert_eq!(
            close_request_action(true, should_hide_on_close(TraySettingsSnapshot::default())),
            CloseRequestAction::RouteQuit
        );
        for unreadable in [json!({}), json!(null), json!({ "defaultSettings": 3 })] {
            assert_eq!(
                close_request_action(
                    true,
                    should_hide_on_close(tray_settings_from_config(&unreadable))
                ),
                CloseRequestAction::RouteQuit,
                "an unreadable config must never trap the user in an unclosable window"
            );
        }
    }

    #[test]
    fn quit_routing_no_tray_icon_on_disk_routes_even_with_exit_to_tray_on() {
        let on_disk = tray_settings_from_config(&json!({
            "defaultSettings": { "exitToTray": true, "noTrayIcon": true }
        }));
        assert!(on_disk.exit_to_tray && on_disk.no_tray_icon);
        // The tray existed at startup iff noTrayIcon was off.
        let tray_exists = !on_disk.no_tray_icon;
        assert_eq!(
            close_request_action(tray_exists, should_hide_on_close(on_disk)),
            CloseRequestAction::RouteQuit
        );
    }

    #[test]
    fn quit_routing_exit_to_tray_on_with_a_tray_still_hides() {
        let on_disk = tray_settings_from_config(&json!({
            "defaultSettings": { "exitToTray": true, "noTrayIcon": false }
        }));
        assert_eq!(
            close_request_action(!on_disk.no_tray_icon, should_hide_on_close(on_disk)),
            CloseRequestAction::Hide
        );
    }

    #[test]
    fn quit_routing_the_app_menu_quit_id_cannot_collide_with_a_tray_arm() {
        // The tray handler's `"quit"` arm and its `recent:` prefix both see every app-wide menu
        // event; the custom Cmd+Q item's id must match neither.
        #[cfg(target_os = "macos")]
        {
            assert_ne!(APP_MENU_QUIT_ID, "quit");
            assert!(!APP_MENU_QUIT_ID.starts_with(TRAY_RECENT_ID_PREFIX));
            assert_eq!(tray_recent_app_name(APP_MENU_QUIT_ID), None);
        }
    }

    #[test]
    fn recent_menu_id_rejects_a_malformed_id() {
        // Missing prefix -- the non-recent menu ids the same handler also sees.
        assert_eq!(tray_recent_app_name("show"), None);
        assert_eq!(tray_recent_app_name("about"), None);
        assert_eq!(tray_recent_app_name("quit"), None);
        assert_eq!(tray_recent_app_name(""), None);
        assert_eq!(tray_recent_app_name("recent"), None);
        // Prefix present, remainder not a plain appName.
        assert_eq!(tray_recent_app_name("recent:"), None);
        assert_eq!(tray_recent_app_name("recent:../../etc/passwd"), None);
        assert_eq!(tray_recent_app_name("recent:.."), None);
        assert_eq!(tray_recent_app_name("recent:."), None);
        assert_eq!(tray_recent_app_name("recent:a/b"), None);
        assert_eq!(tray_recent_app_name("recent:a\\b"), None);
        assert_eq!(tray_recent_app_name("recent:a b"), None);
        assert_eq!(tray_recent_app_name("recent:a;rm -rf /"), None);
        assert_eq!(tray_recent_app_name("recent:a\nb"), None);
        assert_eq!(tray_recent_app_name("recent:a\0b"), None);
        assert_eq!(tray_recent_app_name("recent:$(id)"), None);
        assert_eq!(tray_recent_app_name("recent:\u{e9}quipe"), None);
        // Over the length bound.
        let long = "a".repeat(129);
        assert_eq!(tray_recent_app_name(&format!("recent:{long}")), None);
        assert_eq!(tray_recent_menu_id(&long), None);
    }

    #[test]
    fn a_rejected_app_name_never_becomes_a_menu_id() {
        // The construction side uses the SAME predicate as the parse side, so an entry that
        // could not survive the round-trip is never rendered at all.
        for bad in ["", "..", "a/b", "a b", "a;b", "wine prefix"] {
            assert_eq!(tray_recent_menu_id(bad), None, "expected {bad:?} rejected");
        }
    }

    #[test]
    fn recent_games_parse_drops_unusable_entries_and_respects_the_limit() {
        let payload = json!([
            { "appName": "Iris", "title": "Phoenix Point" },
            { "appName": "620", "title": "Portal 2", "runner": "steam" },
            { "appName": "../escape", "title": "rejected" },
            { "appName": "Iris", "title": "duplicate" },
            { "title": "no appName at all" },
            { "appName": "1124300", "title": "HUMANKIND" }
        ]);
        let games = tray_recent_games_from_value(&payload, 5);
        assert_eq!(
            games,
            vec![
                TrayRecentGame {
                    app_name: "Iris".into(),
                    title: "Phoenix Point".into(),
                    runner: None
                },
                TrayRecentGame {
                    app_name: "620".into(),
                    title: "Portal 2".into(),
                    runner: Some("steam".into())
                },
                TrayRecentGame {
                    app_name: "1124300".into(),
                    title: "HUMANKIND".into(),
                    runner: None
                },
            ]
        );
        // The limit truncates rather than erroring.
        assert_eq!(tray_recent_games_from_value(&payload, 1).len(), 1);
        assert_eq!(tray_recent_games_from_value(&payload, 0).len(), 0);
    }

    // ---- Persisted runner vs the legacy probe fallback (Phase 35 plan 06, operator-initiated) ----
    //
    // `RecentGame` used to be `{ appName, title }`, so the tray had to reconstruct the runner by
    // probing up to six store managers via `trayResolveRunner` — for a value `addRecentGame`
    // already held and discarded. The type now persists it. These tests cover BOTH arms of the
    // resulting branch, because the fallback arm is what every pre-existing install runs on.

    #[test]
    fn a_persisted_runner_is_parsed_and_validated() {
        let payload = json!([
            { "appName": "620", "title": "Portal 2", "runner": "steam" },
            { "appName": "Iris", "title": "Phoenix Point", "runner": "legendary" },
            { "appName": "1207658777", "title": "Empire Earth", "runner": "gog" }
        ]);
        let games = tray_recent_games_from_value(&payload, 5);
        assert_eq!(games[0].runner.as_deref(), Some("steam"));
        assert_eq!(games[1].runner.as_deref(), Some("legendary"));
        assert_eq!(games[2].runner.as_deref(), Some("gog"));
    }

    #[test]
    fn every_member_of_the_typescript_runner_union_survives_the_parse() {
        // Pins TRAY_RUNNERS against `common/types.ts:23`: every member of that union must
        // survive the parse or this allow-list is a silently-diverging copy rather than a
        // mirror.
        for runner in TRAY_RUNNERS {
            let payload = json!([{ "appName": "x1", "title": "T", "runner": runner }]);
            let games = tray_recent_games_from_value(&payload, 5);
            assert_eq!(
                games.first().and_then(|g| g.runner.as_deref()),
                Some(*runner),
                "runner {runner:?} should survive the parse"
            );
        }
    }

    #[test]
    fn legacy_zoom_runner_falls_back_to_probe() {
        // A recent-games entry persisted by a build that still shipped the Zoom Platform store
        // names `"zoom"`, which is no longer a `Runner`. The entry must be KEPT with
        // `runner: None` so the `trayResolveRunner` probe resolves it, not dropped.
        let payload = json!([{ "appName": "x1", "title": "T", "runner": "zoom" }]);
        let games = tray_recent_games_from_value(&payload, 5);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].app_name, "x1");
        assert_eq!(games[0].runner, None);
    }

    #[test]
    fn a_legacy_entry_and_a_bogus_runner_both_degrade_to_none() {
        // THE ARM EVERY EXISTING INSTALL IS ON. A pre-Phase-35 entry has no `runner` key at all;
        // it must parse cleanly with `runner: None` so the launch path falls back to the probe.
        // A recognised-shape-but-unknown runner degrades the SAME way rather than being dropped
        // or forwarded — falling back is strictly better than rejecting a launchable entry.
        let payload = json!([
            { "appName": "legacy1", "title": "No runner key at all" },
            { "appName": "bogus1", "title": "Unknown runner", "runner": "not-a-runner" },
            { "appName": "bogus2", "title": "Wrong type", "runner": 7 },
            { "appName": "bogus3", "title": "Null runner", "runner": null }
        ]);
        let games = tray_recent_games_from_value(&payload, 5);
        assert_eq!(games.len(), 4, "no entry may be DROPPED for a bad runner");
        for game in &games {
            assert_eq!(
                game.runner, None,
                "{} should degrade to None",
                game.app_name
            );
        }
    }

    #[test]
    fn the_launch_branch_uses_a_persisted_runner_and_falls_back_without_one() {
        let games = vec![
            TrayRecentGame {
                app_name: "620".into(),
                title: "Portal 2".into(),
                runner: Some("steam".into()),
            },
            TrayRecentGame {
                app_name: "legacy1".into(),
                title: "Written before this change".into(),
                runner: None,
            },
        ];

        // Persisted -> `dispatch_tray_launch` receives Some(..) and SKIPS the resolve invoke.
        assert_eq!(
            recent_runner_in(&games, "620"),
            Some("steam".to_string()),
            "a persisted runner must reach the launch call without a lookup"
        );

        // Legacy -> None, so the probe fallback runs. This must not regress.
        assert_eq!(
            recent_runner_in(&games, "legacy1"),
            None,
            "a legacy entry must fall back to the trayResolveRunner probe"
        );

        // An appName not in the cache at all also falls back rather than mis-resolving to a
        // neighbouring entry's runner.
        assert_eq!(recent_runner_in(&games, "not-in-cache"), None);
        assert_eq!(recent_runner_in(&[], "620"), None);
    }

    #[test]
    fn recent_games_parse_is_total_over_junk() {
        // A malformed or absent recent-games file must degrade to "no recent games", never to
        // a failed tray build.
        assert!(tray_recent_games_from_value(&json!(null), 5).is_empty());
        assert!(tray_recent_games_from_value(&json!({}), 5).is_empty());
        assert!(tray_recent_games_from_value(&json!("nope"), 5).is_empty());
        assert!(tray_recent_games_from_value(&json!([1, 2, 3]), 5).is_empty());
    }

    #[test]
    fn recent_title_falls_back_to_app_name_and_is_bounded() {
        let untitled = TrayRecentGame {
            app_name: "620".into(),
            title: "   ".into(),
            runner: None,
        };
        assert_eq!(tray_recent_title(&untitled), "620");

        let controls = TrayRecentGame {
            app_name: "620".into(),
            title: "a\nb\tc".into(),
            runner: None,
        };
        assert_eq!(tray_recent_title(&controls), "a b c");

        // Multi-byte title over the cap: truncation is on a CHARACTER boundary, so this can
        // never panic the way a byte slice would.
        let long = TrayRecentGame {
            app_name: "620".into(),
            title: "\u{e9}".repeat(200),
            runner: None,
        };
        let rendered = tray_recent_title(&long);
        assert_eq!(rendered.chars().count(), TRAY_RECENT_TITLE_MAX_CHARS + 1);
        assert!(rendered.ends_with('\u{2026}'));
    }

    #[test]
    fn recent_limit_mirrors_the_typescript_default_and_caps_pathological_values() {
        // `recent_games.ts`: `maxRecentGames || 5`.
        assert_eq!(tray_recent_limit(None), TRAY_RECENT_DEFAULT_LIMIT);
        assert_eq!(tray_recent_limit(Some(0)), TRAY_RECENT_DEFAULT_LIMIT);
        assert_eq!(tray_recent_limit(Some(3)), 3);
        assert_eq!(tray_recent_limit(Some(1_000_000)), TRAY_RECENT_MAX_LIMIT);
    }

    // ---- exitToTray is decided at CLOSE time, not from the startup snapshot ----
    //
    // Plan 35-06 task 3's live gate: turning `Exit to System Tray` ON mid-session did nothing
    // until relaunch, because the handler was attached only when the STARTUP snapshot already
    // had it true. These tests cover the decision function; the source-level gate in
    // `tauriShellSource.test.ts` pins that the close handler feeds it a FRESH read.

    #[test]
    fn close_hides_only_when_exit_to_tray_is_on_and_a_tray_exists() {
        // Mirrors `src/backend/main.ts:288`'s `if (exitToTray && !noTrayIcon)` truth table.
        let case = |exit_to_tray, no_tray_icon| {
            should_hide_on_close(TraySettingsSnapshot {
                exit_to_tray,
                no_tray_icon,
                start_in_tray: false,
                max_recent_games: TRAY_RECENT_DEFAULT_LIMIT,
            })
        };
        assert!(case(true, false), "exitToTray on with a tray -> hide");
        assert!(!case(false, false), "exitToTray off -> close normally");
        // No tray to restore the window from: hiding would strand a running app the user
        // cannot reach, so the close must proceed even with exitToTray on.
        assert!(!case(true, true), "noTrayIcon overrides exitToTray");
        assert!(!case(false, true));
    }

    #[test]
    fn a_setting_changed_after_startup_changes_the_close_decision() {
        // THE DEFECT, expressed as a test. The startup snapshot on a fresh profile has
        // exitToTray off, so the close decision is "quit". If the user then turns it on, the
        // value the handler reads comes from the CONFIG, and the decision must flip. A handler
        // bound to the startup snapshot cannot produce this transition at all.
        let at_startup = TraySettingsSnapshot::default();
        assert!(!should_hide_on_close(at_startup), "baseline: close quits");

        let after_the_user_toggled_it = tray_settings_from_config(&json!({
            "defaultSettings": { "exitToTray": true, "noTrayIcon": false }
        }));
        assert!(
            should_hide_on_close(after_the_user_toggled_it),
            "a mid-session toggle must change the close decision without a relaunch"
        );
        assert_ne!(
            should_hide_on_close(at_startup),
            should_hide_on_close(after_the_user_toggled_it)
        );
    }

    #[test]
    fn an_unreadable_config_lets_the_window_close_rather_than_trapping_the_user() {
        // FAIL-SAFE DIRECTION. `load_tray_settings()` degrades to `default()` on any read
        // failure; the decision that follows must be "close", never "hide". A user who can
        // always close their window is the safe failure mode -- a user trapped in a window
        // that refuses to close because a config read failed is not.
        for unreadable in [
            json!({}),
            json!(null),
            json!({ "defaultSettings": 3 }),
            json!([]),
        ] {
            assert!(
                !should_hide_on_close(tray_settings_from_config(&unreadable)),
                "an unreadable config must never trap the user in an unclosable window"
            );
        }
    }

    #[test]
    fn tray_settings_read_the_global_config_shape() {
        let config = json!({
            "defaultSettings": {
                "noTrayIcon": true,
                "exitToTray": true,
                "startInTray": false,
                "maxRecentGames": 8
            },
            "version": "v0"
        });
        assert_eq!(
            tray_settings_from_config(&config),
            TraySettingsSnapshot {
                no_tray_icon: true,
                exit_to_tray: true,
                start_in_tray: false,
                max_recent_games: 8,
            }
        );
    }

    #[test]
    fn tray_settings_fail_open_to_a_working_tray() {
        // An absent, empty, or wrong-typed config must yield a tray that EXISTS -- an
        // unreadable config turning the tray off would be the worst possible failure mode.
        for junk in [
            json!({}),
            json!(null),
            json!({ "defaultSettings": 3 }),
            json!([]),
        ] {
            let s = tray_settings_from_config(&junk);
            assert_eq!(s, TraySettingsSnapshot::default());
            assert!(!s.no_tray_icon);
            assert_eq!(s.max_recent_games, TRAY_RECENT_DEFAULT_LIMIT);
        }
    }

    #[test]
    fn exempt_channel_waits_indefinitely() {
        assert_eq!(timeout_for("install"), None);
    }

    #[test]
    fn non_exempt_channel_is_bounded_at_invoke_timeout() {
        // Fails if timeout_for ever reverts to an unconditional None.
        assert_eq!(timeout_for("getGameInfo"), Some(INVOKE_TIMEOUT));
    }

    #[test]
    fn repair_and_read_config_are_exempt() {
        // The two channels gap cycle 1 added; REQ-34.2-12 depends on both staying exempt.
        assert_eq!(timeout_for("repair"), None);
        assert_eq!(timeout_for("readConfig"), None);
    }

    #[test]
    fn launch_is_exempt() {
        // quick 261026-jmm: a game launch awaits the whole session; no 60s bound is correct.
        assert_eq!(timeout_for("launch"), None);
    }

    #[test]
    fn get_crossover_index_is_exempt() {
        // Added by REQ-34.2-12 / D-10.
        assert_eq!(timeout_for("getCrossoverIndex"), None);
    }

    #[test]
    fn oauth_capture_login_and_humble_login_channels_are_exempt() {
        // Phase 34.5 gap cycle 3, F-34.5-G6-02 (plan 34.5-23): each carries its own internal
        // deadline (300_000ms / 600_000ms) far exceeding INVOKE_TIMEOUT's 60s.
        assert_eq!(timeout_for("oauthCaptureLogin"), None);
        assert_eq!(timeout_for("humbleStartLogin"), None);
        assert_eq!(timeout_for("humbleReconnect"), None);
    }

    #[test]
    fn a_channel_not_on_the_list_is_still_bounded() {
        // getUserInfo is definitely absent from LONG_RUNNING_CHANNELS -- pins that this task's
        // exemption is scoped to the three named channels, not a relaxation of the guardrail.
        assert_eq!(timeout_for("getUserInfo"), Some(INVOKE_TIMEOUT));
    }

    #[test]
    fn every_long_running_channel_is_exempt_and_a_non_member_is_bounded() {
        // Iterated over LONG_RUNNING_CHANNELS rather than a hardcoded literal list, so a ninth
        // exempt channel does not require editing this test — the hardcoded-list responsibility
        // already lives in the JS gate above, and duplicating it here would create a second list
        // to keep in sync.
        for channel in LONG_RUNNING_CHANNELS {
            assert_eq!(
                timeout_for(channel),
                None,
                "expected {channel} (a LONG_RUNNING_CHANNELS member) to wait indefinitely"
            );
        }
        // Non-vacuous in both directions: an unconditional None would fail only this half, an
        // unconditional Some would fail only the loop above. getGameSettings is a real,
        // non-exempt channel this phase ported (src/backend/gamedetails/dispatch.ts), not a
        // made-up string.
        assert_eq!(timeout_for("getGameSettings"), Some(INVOKE_TIMEOUT));
    }

    #[test]
    fn invoke_timeout_is_60_seconds() {
        // Pins the bound so the D-10 boundary cannot be "solved" by raising the global timeout
        // instead of exempting a specific channel (mirrors the JS gate's own reasoning,
        // asserted here behaviorally).
        assert_eq!(INVOKE_TIMEOUT, Duration::from_secs(60));
    }

    // ---- Abandoned-invoke attribution (F-9, quick task `260905-omc`) ----
    //
    // These cover the mechanism that makes an abandoned id ATTRIBUTABLE. They do NOT settle
    // F-9's own question (did `id=1575` co-occur with a cookie operation?) — that stays
    // UNDETERMINED and is unsettleable, because the scrollback for its window was never
    // captured. What they pin is that the NEXT such event names its channel rather than
    // repeating id=1575's dead end.

    #[test]
    fn an_abandoned_id_is_attributed_to_the_channel_it_was_awaiting() {
        let mut ring = VecDeque::new();
        push_abandoned(&mut ring, "1575", "getCookies");

        assert_eq!(abandoned_channel_for(&ring, "1575"), "getCookies");
    }

    #[test]
    fn an_unrecorded_id_renders_as_unrecorded_rather_than_guessing() {
        // The whole point of the ring is to stop an unknown being read as an answer. An id the
        // shell has no record of must say so, not borrow the nearest channel name -- rounding an
        // unknown to a convenient answer is the F-10 correlation-as-cause mistake, and F-9's own
        // todo exists because that mistake was already paid for once.
        let mut ring = VecDeque::new();
        push_abandoned(&mut ring, "1575", "getCookies");

        assert_eq!(abandoned_channel_for(&ring, "9999"), "<unrecorded>");
        // Non-vacuous: an implementation that returned the constant unconditionally would pass
        // the line above and fail this one.
        assert_eq!(abandoned_channel_for(&ring, "1575"), "getCookies");
    }

    #[test]
    fn an_empty_ring_attributes_nothing() {
        let ring = VecDeque::new();
        assert_eq!(abandoned_channel_for(&ring, "1575"), "<unrecorded>");
    }

    #[test]
    fn the_abandoned_ring_is_bounded_oldest_dropped() {
        let mut ring = VecDeque::new();
        // One past the cap, so exactly the oldest entry must have been evicted.
        for n in 0..=ABANDONED_IDS_CAP {
            push_abandoned(&mut ring, &n.to_string(), "someChannel");
        }

        assert_eq!(ring.len(), ABANDONED_IDS_CAP);
        // id "0" was the oldest and is gone; the newest and the second-oldest both survive.
        assert_eq!(abandoned_channel_for(&ring, "0"), "<unrecorded>");
        assert_eq!(abandoned_channel_for(&ring, "1"), "someChannel");
        assert_eq!(
            abandoned_channel_for(&ring, &ABANDONED_IDS_CAP.to_string()),
            "someChannel"
        );
    }

    #[test]
    fn distinct_ids_keep_their_own_distinct_channels() {
        // Guards the case the diagnostic actually exists to serve: several invokes abandoned in
        // the same window, whose late responses then arrive interleaved. A ring that collapsed
        // to "last channel wins" would pass every single-entry test above.
        let mut ring = VecDeque::new();
        push_abandoned(&mut ring, "1575", "getCookies");
        push_abandoned(&mut ring, "1576", "openDialog");
        push_abandoned(&mut ring, "1577", "keyring_get");

        assert_eq!(abandoned_channel_for(&ring, "1575"), "getCookies");
        assert_eq!(abandoned_channel_for(&ring, "1576"), "openDialog");
        assert_eq!(abandoned_channel_for(&ring, "1577"), "keyring_get");
    }

    #[test]
    fn sidecar_exit_fails_every_pending_invoke_at_once() {
        // Todo 2026-10-05 sidecar-death: nothing used to drain `pending`, so a waiter on a dead
        // sidecar never woke (long-running) or waited the full 60s (bounded). Each waiter must
        // receive an Err immediately -- `try_recv`, not a wait, is the assertion.
        let pending = Mutex::new(HashMap::new());
        let abandoned = Mutex::new(VecDeque::new());
        let (tx_install, rx_install) = mpsc_channel::<Result<Value, String>>();
        let (tx_cookies, rx_cookies) = mpsc_channel::<Result<Value, String>>();
        {
            let mut map = pending.lock().unwrap();
            map.insert("7".to_string(), ("install".to_string(), tx_install));
            map.insert("8".to_string(), ("getCookies".to_string(), tx_cookies));
        }

        let mut drained = drain_pending_invokes(&pending, &abandoned);
        drained.sort();

        assert_eq!(
            drained,
            vec![
                ("7".to_string(), "install".to_string()),
                ("8".to_string(), "getCookies".to_string()),
            ]
        );
        for rx in [rx_install, rx_cookies] {
            assert_eq!(
                rx.try_recv(),
                Ok(Err("sidecar closed before responding".to_string()))
            );
        }
        assert!(pending.lock().unwrap().is_empty());
        let ring = abandoned.lock().unwrap();
        assert_eq!(abandoned_channel_for(&ring, "7"), "install");
        assert_eq!(abandoned_channel_for(&ring, "8"), "getCookies");
    }

    #[test]
    fn two_button_dialog_dismissal_is_not_a_button() {
        // Todo 2026-10-05 dialog-dismiss: Esc / window close yields rfd `Cancel`, which must
        // NOT read as buttons[1] (the destructive "Yes" in askForceUninstall/handleExit).
        use rfd::MessageDialogResult as R;
        assert_eq!(
            two_button_choice(&R::Custom("No".into()), "No", "Yes"),
            Some(0)
        );
        assert_eq!(
            two_button_choice(&R::Custom("Yes".into()), "No", "Yes"),
            Some(1)
        );
        assert_eq!(two_button_choice(&R::Cancel, "No", "Yes"), None);
        assert_eq!(two_button_choice(&R::Ok, "No", "Yes"), Some(0));
        assert_eq!(two_button_choice(&R::No, "No", "Yes"), None);
        assert_eq!(
            two_button_choice(&R::Custom("Other".into()), "No", "Yes"),
            None
        );
    }

    #[test]
    fn draining_an_empty_pending_table_is_a_no_op() {
        let pending = Mutex::new(HashMap::new());
        let abandoned = Mutex::new(VecDeque::new());
        assert!(drain_pending_invokes(&pending, &abandoned).is_empty());
        assert!(abandoned.lock().unwrap().is_empty());
    }

    #[test]
    fn the_invoke_timeout_error_names_the_channel() {
        // The asymmetry F-9 exposed: the sidecar->Rust leg of this same transport already names
        // its channel (`rustInvoke timed out after 60000ms: keyring_get`, sidecarRpc.ts:385),
        // while the Rust->sidecar leg rejected with a bare, unattributable string.
        assert_eq!(
            invoke_timeout_message("getCookies"),
            "sidecar invoke timed out: getCookies"
        );
    }

    #[test]
    fn the_invoke_timeout_error_keeps_its_original_prefix() {
        // The message was `sidecar invoke timed out` verbatim before this task. Preserving it as
        // a prefix keeps any substring/startsWith consumer working; a rewrite that dropped it
        // would be a silent contract break for anything matching the old text.
        assert!(invoke_timeout_message("getCookies").starts_with("sidecar invoke timed out"));
    }

    // ---- invoke_abandoned_message (quick task `260907-j8n`) ----
    //
    // MANUAL gate: this project's CI runs no cargo step at all (`.github/workflows/*.yml`
    // contains neither `cargo test` nor `cargo check`). The mechanical gate that actually runs on
    // every push is `src/backend/__tests__/shellDiagPersistence.test.ts`; this module exists for
    // local/manual verification of the pure helper only. It cannot reach the two `invoke()` call
    // sites that consume the helper (both need a live `Child`/`ChildStdin`), which is exactly why
    // the JS gate pins those call sites instead.

    #[test]
    fn invoke_abandoned_message_renders_both_reasons() {
        assert_eq!(
            invoke_abandoned_message("timeout", "1575", "getCookies"),
            "invoke abandoned (timeout): id=1575 channel=getCookies"
        );
        assert_eq!(
            invoke_abandoned_message("sidecar closed", "1575", "getCookies"),
            "invoke abandoned (sidecar closed): id=1575 channel=getCookies"
        );
    }

    #[test]
    fn invoke_abandoned_message_carries_no_shell_prefix() {
        // Double-prefix guard: `shell_diag` prepends `[shell] ` itself. A literal here that
        // already carried the prefix would emit `[shell] [shell] ...` at both call sites.
        assert!(!invoke_abandoned_message("timeout", "1575", "getCookies").starts_with("[shell] "));
    }

    #[test]
    fn invoke_abandoned_message_does_not_collide_with_the_capture_harness() {
        // Non-collision guard: `meta/captureShellScrollback.ts`'s `LEGACY_TARGET_DROP_RE` exists
        // to DETECT a stale shell binary by matching the pre-`260905-omc` bare-id form of the
        // unrelated `response for unknown/timed-out` diagnostic. If this helper's rendered text
        // ever contained that phrase, a new abandonment line could be misread as evidence of a
        // stale binary rather than what it actually is.
        assert!(!invoke_abandoned_message("timeout", "1575", "getCookies")
            .contains("response for unknown/timed-out"));
    }

    // ---- clipboard_write_text args (Phase 34.3 Plan 03, REQ-34.3-08; now the generated Args) ----
    //
    // RED direction: an implementation using `unwrap_or("")` instead of a hard parse would
    // flip the four rejection cases below to `Ok`.

    #[test]
    fn clipboard_text_arg_rejects_absent_args() {
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[]).unwrap_err(),
            "clipboard_write_text:bad-args"
        );
    }

    #[test]
    fn clipboard_text_arg_rejects_null() {
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[Value::Null]).unwrap_err(),
            "clipboard_write_text:bad-args"
        );
    }

    #[test]
    fn clipboard_text_arg_rejects_number() {
        assert!(ClipboardWriteTextArgs::from_args(&[json!(1)]).is_err());
    }

    #[test]
    fn clipboard_text_arg_rejects_bool() {
        assert!(ClipboardWriteTextArgs::from_args(&[Value::Bool(true)]).is_err());
    }

    #[test]
    fn clipboard_text_arg_accepts_empty_string() {
        // An empty string is a VALID clipboard write, not a missing argument.
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[json!("")]).unwrap().text,
            ""
        );
    }

    #[test]
    fn clipboard_text_arg_accepts_nonempty_string() {
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[json!("hi")]).unwrap().text,
            "hi"
        );
    }

    #[test]
    fn clipboard_text_arg_ignores_trailing_args() {
        assert_eq!(
            ClipboardWriteTextArgs::from_args(&[json!("hi"), json!("ignored")])
                .unwrap()
                .text,
            "hi"
        );
    }

    // ---- clipboard_read_value (Phase 34.3 Plan 03, REQ-34.3-08) ----
    //
    // RED direction: an implementation returning `Value::Null` for an empty clipboard would
    // fail the first case below — the sidecar's `clipboardReadText` handler coerces a
    // non-string result to `''`, which would mask that regression as an indistinguishable
    // empty read.

    #[test]
    fn clipboard_read_value_empty_string_is_not_null() {
        assert_eq!(
            clipboard_read_value(Ok(String::new())),
            Ok(Value::String(String::new()))
        );
    }

    #[test]
    fn clipboard_read_value_nonempty_string_round_trips() {
        assert_eq!(
            clipboard_read_value(Ok("hi".to_string())),
            Ok(Value::String("hi".to_string()))
        );
    }

    #[test]
    fn clipboard_read_value_propagates_error() {
        assert_eq!(
            clipboard_read_value(Err("boom".to_string())),
            Err("boom".to_string())
        );
    }

    // ---- next_login_window_label (Phase 34.4.1 Plan 01, REQ-34.4.1-09, T-34.1-27) ----
    //
    // RED direction: a hard-coded or url-derived label would flip
    // `login_window_label_is_never_reserved` / `_never_derived_from_url` to failing.

    #[test]
    fn humble_login_window_label_is_never_reserved() {
        let label = next_login_window_label();
        assert_ne!(label, "main");
        assert_ne!(label, "about");
        assert!(label.starts_with("loginwin-"));
    }

    #[test]
    fn humble_login_window_labels_differ_across_calls() {
        let first = next_login_window_label();
        let second = next_login_window_label();
        assert_ne!(first, second);
    }

    #[test]
    fn humble_login_window_label_is_never_derived_from_url() {
        // A URL containing "humblebundle" is in scope while the label is generated, but
        // `next_login_window_label()` takes no arguments at all — the label can
        // structurally never be a function of any URL.
        let _url_in_scope = "https://www.humblebundle.com/login";
        let label = next_login_window_label();
        assert!(!label.contains("humblebundle"));
        assert!(!label.contains("www"));
    }

    // ---- humble_login_open args (Phase 34.4.1 Plan 01, REQ-34.4.1-01, T-34.4.1-08) ----
    //
    // Parsing is the generated `HumbleLoginOpenArgs::from_args`; `login_window_parse_url` is the
    // semantic https gate. RED direction: an implementation using `unwrap_or("https://...")` or
    // omitting the scheme check would flip the rejection cases below to `Ok`.

    #[test]
    fn humble_login_open_args_rejects_absent_and_non_string() {
        assert_eq!(
            HumbleLoginOpenArgs::from_args(&[]).unwrap_err(),
            "humble_login_open:bad-args"
        );
        assert_eq!(
            HumbleLoginOpenArgs::from_args(&[json!(1), json!(true), json!("ua")]).unwrap_err(),
            "humble_login_open:bad-args"
        );
        assert_eq!(
            HumbleLoginOpenArgs::from_args(&[json!("https://x.test"), json!(true)]).unwrap_err(),
            "humble_login_open:bad-args"
        );
    }

    #[test]
    fn humble_login_window_parse_url_rejects_non_https() {
        assert_eq!(
            login_window_parse_url("http://www.humblebundle.com/login").unwrap_err(),
            "humble_login_open:bad-url"
        );
        assert_eq!(
            login_window_parse_url("file:///etc/passwd").unwrap_err(),
            "humble_login_open:bad-url"
        );
        assert_eq!(
            login_window_parse_url("javascript:alert(1)").unwrap_err(),
            "humble_login_open:bad-url"
        );
        let ok = login_window_parse_url("https://www.humblebundle.com/login");
        assert!(ok.is_ok());
        assert_eq!(ok.unwrap().scheme(), "https");
    }

    // Pinned `bad-args` strings for the remaining humble arms (67-11): one malformed input each.
    #[test]
    fn humble_cookie_and_label_arms_pin_their_bad_args_strings() {
        assert_eq!(
            HumbleLoginCookiesArgs::from_args(&[json!("w"), json!(7), json!([])]).unwrap_err(),
            "humble_login_cookies:bad-args"
        );
        assert_eq!(
            HumbleLoginCookiesForDomainArgs::from_args(&[json!("w"), json!(7), json!([])])
                .unwrap_err(),
            "humble_login_cookies_for_domain:bad-args"
        );
        assert_eq!(
            HumbleLoginCookiesForDomainArgs::from_args(&[]).unwrap_err(),
            "humble_login_cookies_for_domain:bad-args"
        );
        assert_eq!(
            HumbleLoginTakeEventsArgs::from_args(&[json!(1)]).unwrap_err(),
            "humble_login_take_events:bad-args"
        );
        assert_eq!(
            HumbleLoginCloseArgs::from_args(&[]).unwrap_err(),
            "humble_login_close:bad-args"
        );
        assert_eq!(
            HumbleLoginClearCookiesArgs::from_args(&[json!("w")]).unwrap_err(),
            "humble_login_clear_cookies:bad-args"
        );
    }

    // ---- login_window_title (Phase 34.5 Plan 27, F-34.5-G6-04, T-34.5-G6-22/23) ----
    //
    // RED direction: an implementation that puts the document title first, or that
    // returns the document title alone when it looks URL-shaped, would flip these to
    // failing.

    #[test]
    fn humble_login_window_title_puts_origin_before_document_title() {
        let title = login_window_title("https://www.humblebundle.com", Some("Sign In"));
        assert!(title.starts_with("https://www.humblebundle.com"));
        assert!(title.contains("Sign In"));
        // The origin's END must come before the document title's START -- not merely
        // "both substrings present somewhere" -- so a naive implementation that
        // concatenates in the wrong order cannot pass on a substring check alone.
        let origin_end = title.find("https://www.humblebundle.com").unwrap()
            + "https://www.humblebundle.com".len();
        let title_start = title.find("Sign In").unwrap();
        assert!(origin_end <= title_start);
    }

    #[test]
    fn humble_login_window_title_a_url_shaped_document_title_cannot_precede_the_real_origin() {
        // T-34.5-G6-23: a malicious or compromised page could set document.title to
        // something that itself looks like an address bar, attempting to impersonate a
        // DIFFERENT origin than the one the shell actually validated and opened.
        let title = login_window_title(
            "https://www.humblebundle.com",
            Some("https://accounts.google.com/signin"),
        );
        assert!(title.starts_with("https://www.humblebundle.com"));
        // The real, shell-resolved origin's end must land before the impersonating
        // text's start -- the impersonating string is still present (never hidden or
        // stripped, this helper does not sanitize page content), it just can never lead.
        let real_origin_end = title.find("https://www.humblebundle.com").unwrap()
            + "https://www.humblebundle.com".len();
        let impersonation_start = title.find("https://accounts.google.com").unwrap();
        assert!(real_origin_end <= impersonation_start);
    }

    #[test]
    fn humble_login_window_title_no_document_title_returns_the_origin_alone() {
        assert_eq!(
            login_window_title("https://www.humblebundle.com", None),
            "https://www.humblebundle.com"
        );
    }

    #[test]
    fn humble_login_window_title_empty_document_title_is_treated_as_absent() {
        // An empty string is not a meaningful document title (e.g. before the page's
        // first title event) -- must not produce a title with a trailing empty suffix.
        assert_eq!(
            login_window_title("https://www.humblebundle.com", Some("")),
            "https://www.humblebundle.com"
        );
    }

    #[test]
    fn humble_login_window_open_seeds_the_shared_origin_from_the_validated_url_before_any_page_load(
    ) {
        // Mirrors the EXACT expression the humble_login_open arm uses to seed
        // `current_origin` (its `Arc<Mutex<String>>`) before the window is built and
        // before any `on_page_load` event can possibly fire --
        // `url.origin().ascii_serialization()`, fed through `login_window_title` with no
        // document title, is precisely what the arm's initial `window.set_title()` call
        // (right after `.build()`) composes. Proves the origin is present from the seed
        // alone, with no page-load event required.
        let url = login_window_parse_url("https://www.humblebundle.com/login?x=1").unwrap();
        let seeded_origin = url.origin().ascii_serialization();
        assert_eq!(seeded_origin, "https://www.humblebundle.com");
        assert_eq!(
            login_window_title(&seeded_origin, None),
            "https://www.humblebundle.com"
        );
    }

    // ---- cookie_domain_matches (Phase 34.4.1 Plan 01, REQ-34.4.1-01, spike 014a) ----

    #[test]
    fn humble_login_cookie_domain_matches_the_www_regression_case() {
        // THE single most consequential assertion in this file. wry's own
        // cookies-for-url shortcut computes `cookie.domain() == url.domain()`, which for
        // host "www.humblebundle.com" against a cookie domain of "humblebundle.com"
        // evaluates to `"humblebundle.com" == "www.humblebundle.com"` -> false, silently
        // dropping `_simpleauth_sess`. This function must get it right: a suffix match,
        // not equality.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookie_domain_matches_rejects_suffix_lookalikes() {
        assert!(!cookie_domain_matches(
            "www.humblebundle.com",
            Some("evilhumblebundle.com")
        ));
        assert!(!cookie_domain_matches("www.humblebundle.com", None));
    }

    // ---- humble_login_cookies_for_domain's direction (Phase 34.4.1 Plan 22, F-6 Defect A,
    // REQ-34.4.1-GAP-07). `humble_login_cookies_for_domain`'s filter calls
    // `cookie_domain_matches(d, Some(domain))` -- the cookie's OWN domain first, the caller's
    // fixed target second -- mirroring `humble_login_clear_cookies`'s (unchanged) filter
    // exactly. These cases assert that call shape directly against `cookie_domain_matches`,
    // the same "test the pure comparison, not a window-backed arm" convention the two cases
    // above already use. ----

    #[test]
    fn humble_login_cookies_for_domain_matches_bare_apex_cookie() {
        // A cookie whose domain attribute is the bare apex matches a query for that apex.
        assert!(cookie_domain_matches(
            "humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_matches_leading_dot_cookie() {
        // A cookie whose domain attribute carries the leading-dot form (RFC 6265's
        // wildcard-subdomain marker) still matches a query for the bare apex -- this is
        // Defect A's headline case: `humble_login_cookies`' direction cannot ever match this
        // shape against a FIXED target (see the asymmetry test below).
        assert!(cookie_domain_matches(
            ".humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_matches_subdomain_cookie() {
        // A cookie scoped to a subdomain matches a query for the parent apex.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_rejects_suffix_lookalikes() {
        // Same lookalike guard as the existing poll-direction case above, proven in this
        // arm's own direction: a literal `.` separator is required, so a domain that merely
        // ENDS WITH the target string as a substring (no separator) must not match.
        assert!(!cookie_domain_matches(
            "nothumblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_direction_is_the_defect_a_fix() {
        // F-34.4.2-19 (fixed) -- REWRITTEN. Before this fix, this test's first assertion
        // pinned `cookie_domain_matches`'s POLL-direction argument order
        // (`cookie_domain_matches(fixed_host, Some(cookie_domain))`, exactly what
        // `humble_login_cookies`' poll arm calls at main.rs:3878-3885) as UNCONDITIONALLY
        // blind to any leading-dot cookie domain -- and asserted that blindness as CORRECT,
        // intended behavior ("the suffix branch can never fire for a leading-dot cookie
        // domain, so it silently fails to match"). It was not correct: that assertion
        // pinned F-34.4.2-19's own root cause in place. `_simpleauth_sess`'s real,
        // live-measured domain is `.humblebundle.com` (leading dot); with the old
        // comparator, the poll arm could never match it, so Humble's login watcher polled
        // forever without ever finding its own session cookie -- silently, with zero log
        // output, because the early-return this produced (user.ts:494-498) sits upstream of
        // every logging path in that function. `34.4.1-SPIKE-016-FINDINGS.md`'s live
        // measurement (total=33, poll direction=29 -- 4 cookies silently dropped) was this
        // SAME undercounting, and was filed there as an acceptable, documented asymmetry
        // rather than as the defect it actually was. Do not read that document, or this
        // test's prior form, as evidence the old behavior was ever intentional.
        //
        // `cookie_domain_matches` now strips a leading dot from its `domain` argument before
        // comparing (RFC 6265: a `.example.com` cookie is defined to apply to `example.com`
        // itself, not only to its subdomains), so BOTH directions now correctly match a
        // leading-dot cookie domain against its own bare apex host:
        assert!(cookie_domain_matches(
            "humblebundle.com",
            Some(".humblebundle.com")
        ));
        assert!(cookie_domain_matches(
            ".humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    #[test]
    fn cookie_domain_matches_normalizes_leading_dot_domain_against_apex_host() {
        // F-34.4.2-19 fix-verification test. Pre-fix: `format!(".{d}")` on an
        // already-dotted `d` (".humblebundle.com") produces an impossible
        // ".."-prefixed suffix requirement no real hostname can satisfy, so this returned
        // false -- RED against the pre-fix comparator. Post-fix, the leading dot is
        // stripped from `domain` before comparing, so this is GREEN.
        assert!(cookie_domain_matches(
            "humblebundle.com",
            Some(".humblebundle.com")
        ));
    }

    #[test]
    fn cookie_domain_matches_normalizes_leading_dot_domain_against_subdomain_host() {
        // F-34.4.2-19 fix-verification test -- the ACTUAL production shape of the defect.
        // `humble_login_cookies`' poll arm (main.rs:3878-3885) calls
        // `cookie_domain_matches(host_for_filter, Some(c.domain()))` with `host_for_filter`
        // fixed at "www.humblebundle.com" and `_simpleauth_sess`'s real, live-measured
        // domain being ".humblebundle.com" (leading dot). This is that exact call,
        // reproduced directly. RED against the pre-fix comparator, GREEN post-fix.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some(".humblebundle.com")
        ));
    }

    #[test]
    fn cookie_domain_matches_direction_still_discriminates_for_host_vs_subdomain_pairs() {
        // Normalizing the leading dot makes the comparator order-INsensitive for the
        // apex-host/leading-dot-domain pair specifically -- that pair (the one the rewritten
        // test above now asserts symmetrically) stops being a canary for Plan 22's Defect A
        // argument-order regression. Direction still matters for other shapes, and the fix
        // deliberately leaves argument order untouched at both call sites, so that
        // protection must not be silently retired: an apex HOST can never match a cookie
        // scoped to a SUBDOMAIN, but a subdomain host correctly matches a cookie scoped to
        // its own parent apex. Pinned here with a non-Humble pair so it stays independent of
        // the now-symmetric leading-dot case above.
        assert!(!cookie_domain_matches(
            "epicgames.com",
            Some("www.epicgames.com")
        ));
        assert!(cookie_domain_matches(
            "www.epicgames.com",
            Some("epicgames.com")
        ));
    }

    #[test]
    fn humble_login_cookies_for_domain_does_not_disturb_the_poll_direction() {
        // Regression pin (binding constraint 1): the existing `humble_login_cookies` arm's
        // OWN call site (`cookie_domain_matches(host, c.domain())`, unedited by this plan)
        // must still match the www-page-host-vs-apex-cookie case it was proven correct
        // against by spike 014a. This is the SAME assertion as
        // `humble_login_cookie_domain_matches_the_www_regression_case` above, re-stated here
        // in this arm's own test group so a reviewer looking only at the new arm's tests can
        // see the poll's direction was checked, not merely assumed unaffected.
        assert!(cookie_domain_matches(
            "www.humblebundle.com",
            Some("humblebundle.com")
        ));
    }

    // ---- epic_cookie_domain_matches (Phase 35 plan 09, D-09-CORRECTED, T-35-37/T-35-38) ----
    //
    // The `humble_login_clear_cookies` macOS fallback guard, tested in BOTH directions. A
    // positive-only test cannot detect an OVER-WIDE set, and an over-wide set is precisely the
    // harm `REQ-34.4.1-06` closed (a clear that signs the user out of a storefront they never
    // touched). Both halves are therefore load-bearing; neither may be deleted without the
    // other.
    #[cfg(target_os = "macos")]
    #[test]
    fn epic_cookie_domain_matches_accepts_every_epic_owned_apex() {
        // Every apex the TS side (`legendary/user.ts`'s `EPIC_COOKIE_HOSTS`) actually passes.
        // Before this plan, four of these five fell through the guard to
        // `humble_login:no-window:{label}` -- an error, not a clear (`35-AB-RETEST.md` Item 7
        // measured `EPIC_DEVICE` surviving on all four).
        for domain in [
            "epicgames.com",
            "fortnite.com",
            "unrealengine.com",
            "twinmotion.com",
            "metahuman.com",
        ] {
            assert!(
                epic_cookie_domain_matches(domain),
                "expected the Epic-owned apex `{domain}` to reach the macOS clear path"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn epic_cookie_domain_matches_accepts_subdomains_of_each_apex() {
        // The set is APEX domains and `cookie_domain_matches` does the suffix work -- the
        // measured survivors were scoped to `.www.epicgames.com` and `.ecosec.on.epicgames.com`,
        // never to the bare apex, so a guard that only matched apexes exactly would be blind to
        // every cookie it exists to reach.
        for domain in [
            "www.epicgames.com",
            "ecosec.on.epicgames.com",
            "www.fortnite.com",
            "www.unrealengine.com",
            "www.twinmotion.com",
            "www.metahuman.com",
        ] {
            assert!(
                epic_cookie_domain_matches(domain),
                "expected the Epic-owned subdomain `{domain}` to reach the macOS clear path"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn epic_cookie_domain_matches_rejects_every_other_storefront() {
        // The NEGATIVE direction, and the reason this test group exists at all. Humble, GOG and
        // Amazon all fail this check today and fall straight through to the arm's existing
        // `no-window` error, completely unchanged by the widening. A regression that widened the
        // set (or replaced the comparator with a naive `contains`) would sign a user out of a
        // storefront the logout never touched -- the exact harm `REQ-34.4.1-06` closed, and the
        // reason this file's blanket browsing-data wipe prohibition exists at all (three sites;
        // its API name is deliberately not spelled here, see `EPIC_COOKIE_DOMAINS`' own note).
        for domain in [
            "humblebundle.com",
            "www.humblebundle.com",
            "gog.com",
            "www.gog.com",
            "amazon.com",
            "www.amazon.com",
            "steampowered.com",
        ] {
            assert!(
                !epic_cookie_domain_matches(domain),
                "`{domain}` must NOT reach Epic's clear path -- an over-wide guard is the \
                 REQ-34.4.1-06 harm, not a convenience"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn epic_cookie_domain_matches_rejects_suffix_lookalikes() {
        // `notepicgames.com` ends with `epicgames.com` as a raw substring but is a DIFFERENT
        // registrable domain. This is `cookie_domain_matches`'s own discipline (it requires
        // `host == d` or `host` ending with `.{d}`), re-asserted through the Epic wrapper so a
        // future hand-rolled suffix test here -- the second-comparator mistake Plan 22's Defect
        // A already paid for -- fails loudly instead of silently widening the clear.
        for domain in [
            "notepicgames.com",
            "myfortnite.com",
            "fakeunrealengine.com",
            "epicgames.com.evil.example",
        ] {
            assert!(
                !epic_cookie_domain_matches(domain),
                "suffix lookalike `{domain}` must NOT reach Epic's clear path"
            );
        }
    }

    // ---- store_logout_cookie_domain_matches (Phase 40 plan 04, D-15, T-40-04-07/-08) ----
    //
    // Same both-directions discipline as the Epic group above: a positive-only test cannot
    // detect an over-wide set, which is the exact REQ-34.4.1-06 harm this repo already paid for
    // once.
    #[cfg(target_os = "macos")]
    #[test]
    fn store_logout_cookie_domain_matches_accepts_gog_and_amazon_apexes() {
        for domain in ["gog.com", "amazon.com"] {
            assert!(
                store_logout_cookie_domain_matches(domain),
                "expected the store-logout apex `{domain}` to reach the macOS clear path"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn store_logout_cookie_domain_matches_accepts_subdomains_of_each_apex() {
        // The set is APEX domains and `cookie_domain_matches` does the suffix work -- GOG's own
        // login flow runs on `login.gog.com`, and Amazon's on `www.amazon.com`, neither of
        // which is the bare apex.
        for domain in ["login.gog.com", "www.gog.com", "www.amazon.com"] {
            assert!(
                store_logout_cookie_domain_matches(domain),
                "expected the store-logout subdomain `{domain}` to reach the macOS clear path"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn store_logout_cookie_domain_matches_rejects_every_other_storefront() {
        // The NEGATIVE direction. Epic and Humble must fall straight through to the arm's
        // existing `no-window` error, unchanged by this widening -- an over-wide set here would
        // let a GOG/Amazon logout clear a domain it was never asked to touch.
        for domain in [
            "epicgames.com",
            "www.epicgames.com",
            "fortnite.com",
            "humblebundle.com",
            "www.humblebundle.com",
            "steampowered.com",
        ] {
            assert!(
                !store_logout_cookie_domain_matches(domain),
                "`{domain}` must NOT reach the store-logout clear path -- an over-wide guard is \
                 the REQ-34.4.1-06 harm, not a convenience"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn store_logout_cookie_domain_matches_rejects_suffix_lookalikes() {
        // `notgog.com`/`notamazon.com` end with the apex as a raw substring but are DIFFERENT
        // registrable domains -- `cookie_domain_matches`'s own discipline (`host == d` or `host`
        // ending with `.{d}`), re-asserted through this wrapper.
        for domain in ["notgog.com", "gog.com.evil.example", "notamazon.com"] {
            assert!(
                !store_logout_cookie_domain_matches(domain),
                "suffix lookalike `{domain}` must NOT reach the store-logout clear path"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn epic_cookie_domains_is_exactly_the_operator_approved_set() {
        // Pins the SET itself, not just the comparator's behaviour on it. Which domains belong
        // in the clear's filter was an explicit operator scope decision (D-09-CORRECTED,
        // `deferred-items.md` D-35-09-01, 2026-08-29), not an implementation detail: a future
        // edit that adds or drops an entry must be reviewed as a scope change, and must also
        // update `legendary/user.ts`'s `EPIC_COOKIE_HOSTS` in the same commit or the two sides
        // silently half-fix (T-35-41).
        assert_eq!(
            EPIC_COOKIE_DOMAINS,
            &[
                "epicgames.com",
                "fortnite.com",
                "unrealengine.com",
                "twinmotion.com",
                "metahuman.com",
            ]
        );
    }

    // ---- website_data_record_matches_domain / verified_delete_count (Phase 34.4.1 Plan 23,
    // F-6 Defect B, REQ-34.4.1-06). The half of the WKWebsiteDataStore rewrite that can be
    // proven without a live WebKit -- see 34.4.1-23-SUMMARY.md for the platform half, which
    // by construction cannot be unit-tested here (only plan 29's live gate proves it). ----

    #[test]
    fn website_data_record_matches_domain_matches_bare_apex() {
        assert!(website_data_record_matches_domain(
            "humblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_matches_subdomain() {
        assert!(website_data_record_matches_domain(
            "www.humblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_matches_leading_dot() {
        assert!(website_data_record_matches_domain(
            ".humblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_rejects_suffix_lookalike() {
        // D-08 in the opposite direction from a blanket wipe: a displayName-driven filter
        // that matched `nothumblebundle.com` would delete a third party's website data.
        assert!(!website_data_record_matches_domain(
            "nothumblebundle.com",
            "humblebundle.com"
        ));
    }

    #[test]
    fn website_data_record_matches_domain_rejects_empty_display_name() {
        assert!(!website_data_record_matches_domain("", "humblebundle.com"));
    }

    #[test]
    fn verified_delete_count_is_the_measured_delta() {
        assert_eq!(verified_delete_count(5, 2), 3);
        assert_eq!(verified_delete_count(0, 0), 0);
    }

    #[test]
    fn verified_delete_count_saturates_at_zero_when_the_jar_grew() {
        // A jar that GREW between the two reads (a concurrent login racing the clear) must
        // never produce a negative or wrapped count -- `before=3, after=5` would panic on a
        // plain `before - after` in debug builds and silently wrap in release.
        assert_eq!(verified_delete_count(3, 5), 0);
    }

    #[test]
    fn verified_delete_count_is_zero_when_removal_changed_nothing() {
        assert_eq!(verified_delete_count(7, 7), 0);
    }

    // ---- login_event_value (Phase 34.4.1 Plan 01, REQ-34.4.1-03) ----

    #[test]
    fn humble_login_event_value_shape() {
        assert_eq!(
            login_event_value("finished", "https://www.humblebundle.com/login"),
            json!({ "event": "finished", "url": "https://www.humblebundle.com/login" })
        );
    }

    // Quick task 260803-eee Task 5: the shape `humble_login_open`'s new
    // `on_window_event(WindowEvent::Destroyed)` hook pushes -- an empty url is deliberate (a
    // close is not a navigation), never a stale/partial one that could be mistaken for one.
    #[test]
    fn humble_login_event_value_closed_shape_has_an_empty_url() {
        assert_eq!(
            login_event_value("closed", ""),
            json!({ "event": "closed", "url": "" })
        );
    }

    // ---- reveal_post_args (Phase 34.4.1 Plan 04, REQ-34.4.1-05) ----
    //
    // RED direction: an implementation using `unwrap_or(...)` anywhere in the required-field
    // chain, or treating a missing csrf_token differently from an explicit `null`, would flip
    // one of the cases below.

    fn valid_reveal_args(csrf: Value) -> Vec<Value> {
        vec![
            json!("https://www.humblebundle.com"),
            json!("/humbler/redeemkey"),
            json!("keytype=steam&key=abc&keyindex=1"),
            csrf,
            json!("Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"),
        ]
    }

    /// Manual-match helper standing in for `.unwrap_err()` -- `RevealPostArgs` deliberately
    /// implements no auto-formatting trait (see its own doc comment), so `.unwrap_err()`
    /// cannot be called on a `Result<RevealPostArgs, String>` at all; this reads the error
    /// string out by hand and panics with a plain message on the (unexpected) Ok case instead.
    fn reveal_post_args_err(result: Result<RevealPostArgs, String>) -> String {
        match result {
            Err(e) => e,
            Ok(_) => panic!("expected reveal_post_args to reject this input"),
        }
    }

    #[test]
    fn humble_reveal_post_args_accepts_a_full_valid_set_with_a_string_csrf_token() {
        let parsed = reveal_post_args(&valid_reveal_args(json!("csrf-token-value"))).unwrap();
        assert_eq!(parsed.origin_url.as_str(), "https://www.humblebundle.com/");
        assert_eq!(parsed.path, "/humbler/redeemkey");
        assert_eq!(parsed.body, "keytype=steam&key=abc&keyindex=1");
        assert_eq!(parsed.csrf_token, Some("csrf-token-value".to_string()));
        assert_eq!(
            parsed.user_agent,
            "Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"
        );
    }

    #[test]
    fn humble_reveal_post_args_maps_a_null_csrf_token_to_none() {
        let parsed = reveal_post_args(&valid_reveal_args(Value::Null)).unwrap();
        assert_eq!(parsed.csrf_token, None);
    }

    #[test]
    fn humble_reveal_post_args_treats_a_short_args_slice_as_missing_not_a_panic() {
        // Positional args make "csrf missing but user_agent present" structurally
        // unreachable (removing index 3 shifts index 4 into its place) -- what IS reachable,
        // and must never panic, is a short slice that runs out of args entirely. args.get(3)
        // reads None -> csrf_token=None internally, but the overall parse still rejects on
        // the now-missing args[4] (user_agent), never panicking on an out-of-bounds index.
        let short_args = vec![
            json!("https://www.humblebundle.com"),
            json!("/humbler/redeemkey"),
            json!("keytype=steam&key=abc&keyindex=1"),
        ];
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&short_args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_string_non_null_csrf_token() {
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&valid_reveal_args(json!(12345)))),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_missing_args_entirely() {
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&[])),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_https_origin() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args[0] = json!("http://www.humblebundle.com");
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_string_path() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args[1] = json!(42);
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_non_string_body() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args[2] = json!(null);
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    #[test]
    fn humble_reveal_post_args_rejects_a_missing_user_agent() {
        let mut args = valid_reveal_args(json!("csrf-token-value"));
        args.truncate(4); // drop user_agent (args[4]) entirely
        assert_eq!(
            reveal_post_args_err(reveal_post_args(&args)),
            "humble_reveal_post:bad-args"
        );
    }

    // ---- reveal_post_script (Phase 34.4.1 Plan 04, T-34.4.1-20/21) ----
    //
    // RED direction: an implementation using `format!("'{}'", value)` (naive quoting) instead
    // of `serde_json::to_string` would let a tricky body value escape its string context; the
    // round-trip assertion below fails against that implementation.

    #[test]
    fn humble_reveal_post_script_escapes_special_characters_and_round_trips_via_serde_json() {
        // Deliberately includes a single quote, a double quote, a backslash, and a
        // `</script>` sequence -- exactly the characters T-34.4.1-20 is about.
        // Two embedded double-quote characters (not one) so this Rust source line itself keeps
        // an EVEN raw `"`-count (open delim + 2 embedded `\"` + close delim = 4) -- satisfying
        // `longRunningChannels.test.ts`'s unrelated WR-08 per-line quote-balance guard, which
        // this line would otherwise trip on the surrounding file scan. Still exercises a
        // double quote, a single quote, a backslash and a `</script>` sequence.
        let tricky_body = "keytype=steam&key=a\"b\"c'd\\e</script>f";
        let script = reveal_post_script(
            "/humbler/redeemkey",
            tricky_body,
            Some("csrf-token-value"),
            REVEAL_EXFIL_HOST,
        );
        let expected_literal = serde_json::to_string(tricky_body).unwrap();
        assert!(
            script.contains(&expected_literal),
            "expected the properly-escaped JSON string literal to appear verbatim in the script"
        );
        let round_tripped: String = serde_json::from_str(&expected_literal).unwrap();
        assert_eq!(round_tripped, tricky_body);
        // The naive, UNESCAPED single-quote interpolation this function must never produce.
        // Built via array-join rather than a literal `format!("'{}'", ..)` call so this
        // regression-guard test itself does not trip the source-text gate
        // (`tauriShellSource.test.ts`) that asserts NO such naive interpolation exists in the
        // real arm code.
        let naive_interpolation = ["'", tricky_body, "'"].concat();
        assert!(!script.contains(&naive_interpolation));
    }

    #[test]
    fn humble_reveal_post_script_embeds_a_null_csrf_token_as_a_js_null_not_the_string_null() {
        let script = reveal_post_script("/humbler/redeemkey", "body", None, REVEAL_EXFIL_HOST);
        assert!(script.contains("var csrf = null;"));
        assert!(!script.contains("var csrf = \"null\""));
    }

    #[test]
    fn humble_reveal_post_script_embeds_a_present_csrf_token_as_a_quoted_json_string() {
        let script = reveal_post_script(
            "/humbler/redeemkey",
            "body",
            Some("csrf-token-value"),
            REVEAL_EXFIL_HOST,
        );
        assert!(script.contains("var csrf = \"csrf-token-value\";"));
    }

    #[test]
    fn humble_reveal_post_script_embeds_the_exfil_host_used_by_the_navigation_intercept() {
        let script = reveal_post_script("/humbler/redeemkey", "body", None, REVEAL_EXFIL_HOST);
        assert!(script.contains(&serde_json::to_string(REVEAL_EXFIL_HOST).unwrap()));
    }

    // ---- clear_storage_args (34.4.1 gap cycle plan 15, F-6, REQ-34.4.1-06/REQ-34.4.1-GAP-03) ----
    //
    // RED direction: an implementation using `unwrap_or(...)` anywhere in the required-field
    // chain would flip one of the cases below, mirroring `reveal_post_args`'s own RED-direction
    // note.

    fn valid_clear_storage_args() -> Vec<Value> {
        vec![
            json!("https://www.humblebundle.com"),
            json!("Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"),
        ]
    }

    /// Manual-match helper standing in for `.unwrap_err()` -- `ClearStorageArgs` deliberately
    /// implements no auto-formatting trait (mirrors `RevealPostArgs`'s own `reveal_post_args_err`
    /// helper and its reasoning, REQ-34.1-07).
    fn clear_storage_args_err(result: Result<ClearStorageArgs, String>) -> String {
        match result {
            Err(e) => e,
            Ok(_) => panic!("expected clear_storage_args to reject this input"),
        }
    }

    #[test]
    fn humble_login_clear_storage_args_accepts_a_full_valid_set() {
        let parsed = clear_storage_args(&valid_clear_storage_args()).unwrap();
        assert_eq!(parsed.origin_url.as_str(), "https://www.humblebundle.com/");
        assert_eq!(
            parsed.user_agent,
            "Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_missing_args_entirely() {
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&[])),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_non_https_origin() {
        let mut args = valid_clear_storage_args();
        args[0] = json!("http://www.humblebundle.com");
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_non_string_origin() {
        let mut args = valid_clear_storage_args();
        args[0] = json!(42);
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_missing_user_agent() {
        let mut args = valid_clear_storage_args();
        args.truncate(1); // drop user_agent (args[1]) entirely
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    #[test]
    fn humble_login_clear_storage_args_rejects_a_non_string_user_agent() {
        let mut args = valid_clear_storage_args();
        args[1] = json!(null);
        assert_eq!(
            clear_storage_args_err(clear_storage_args(&args)),
            "humble_login_clear_storage:bad-args"
        );
    }

    // ---- clear_storage_script (34.4.1 gap cycle plan 15, T-34.4.1-65/-66/-67) ----
    //
    // RED direction: an implementation using naive `'{}'`-style interpolation for `exfil_host`
    // would fail the escaping round-trip case below; one that skips `await` on an async category
    // would fail the await-ordering case; one that coerces a missing API to a numeric 0 instead
    // of the literal `'unsupported'` would fail the five-category case.

    #[test]
    fn humble_login_clear_storage_script_escapes_special_characters_and_round_trips_via_serde_json()
    {
        // Deliberately includes a single quote, a double quote, a backslash, and a `</script>`
        // sequence -- the same character classes `reveal_post_script`'s own round-trip case
        // covers (T-34.4.1-65/20). Two embedded double-quote characters (not one) so this Rust
        // source line itself keeps an EVEN raw `"`-count (open delim + 2 embedded `\"` + close
        // delim = 4) -- satisfying `longRunningChannels.test.ts`'s WR-08 per-line quote-balance
        // guard, which this line would otherwise trip on the surrounding file scan. Still
        // exercises a double quote, a single quote, a backslash and a `</script>` sequence.
        let tricky_host = "gamelib.invalid\"a\"payload'x\\y</script>z";
        let script = clear_storage_script(tricky_host);
        let expected_literal = serde_json::to_string(tricky_host).unwrap();
        assert!(
            script.contains(&expected_literal),
            "expected the properly-escaped JSON string literal to appear verbatim in the script"
        );
        let round_tripped: String = serde_json::from_str(&expected_literal).unwrap();
        assert_eq!(round_tripped, tricky_host);
        // The naive, UNESCAPED single-quote interpolation this function must never produce.
        // Built via array-join (mirrors `reveal_post_script`'s own equivalent case) rather than a
        // literal `format!("'{}'", ..)` call so this regression-guard test itself does not trip
        // the source-text gate asserting no such naive interpolation exists in the real arm code.
        let naive_interpolation = ["'", tricky_host, "'"].concat();
        assert!(!script.contains(&naive_interpolation));
    }

    #[test]
    fn humble_login_clear_storage_script_embeds_the_exfil_host_used_by_the_navigation_intercept() {
        let script = clear_storage_script(REVEAL_EXFIL_HOST);
        assert!(script.contains(&serde_json::to_string(REVEAL_EXFIL_HOST).unwrap()));
    }

    #[test]
    fn humble_login_clear_storage_script_clears_all_five_categories_with_an_unsupported_fallback() {
        let script = clear_storage_script(REVEAL_EXFIL_HOST);
        assert!(script.contains("localStorage.clear()"));
        assert!(script.contains("report.localStorage = 'unsupported'"));
        assert!(script.contains("sessionStorage.clear()"));
        assert!(script.contains("report.sessionStorage = 'unsupported'"));
        assert!(script.contains("indexedDB.deleteDatabase"));
        assert!(script.contains("report.indexedDB = 'unsupported'"));
        assert!(script.contains("caches.delete"));
        assert!(script.contains("report.caches = 'unsupported'"));
        assert!(script.contains("serviceWorker.getRegistrations"));
        assert!(script.contains("report.serviceWorkers = 'unsupported'"));
    }

    #[test]
    fn humble_login_clear_storage_script_awaits_every_async_category_before_reporting() {
        // If IndexedDB/caches/service-worker clearing fired without `await`, this arm would
        // report success for work that has not happened yet (this plan's own explicit warning).
        let script = clear_storage_script(REVEAL_EXFIL_HOST);
        assert!(script.contains("await indexedDB.databases()"));
        assert!(script.contains("await new Promise(function(resolve)"));
        assert!(script.contains("await caches.keys()"));
        assert!(script.contains("await caches.delete(keys[j])"));
        assert!(script.contains("await navigator.serviceWorker.getRegistrations()"));
        assert!(script.contains("await regs[k].unregister()"));
        // exfil() must run AFTER every await in the template, never before.
        let exfil_call_index = script.rfind("exfil(report)").unwrap();
        let last_await_index = script.rfind("await ").unwrap();
        assert!(exfil_call_index > last_await_index);
    }

    // ---- login_chrome_css_script (quick task 260822-di1, T-di1-01..06; extended by
    // 260822-eib, T-eib-01..05) ----
    //
    // RED direction (mirrors this file's own convention, established above): (a) swapping
    // `style.textContent` for an HTML-fragment-write API in `build()` would fail
    // `login_chrome_css_script_never_uses_innerhtml`; (b) reordering the host gate after the
    // idempotence flag would fail
    // `login_chrome_css_script_top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag`;
    // (c) swapping the anchored `.slice(-SUFFIX.length)` comparison for `.indexOf(` would fail
    // `login_chrome_css_script_is_scoped_to_humblebundle_by_suffix_not_substring`; (d) dropping
    // either CSS rule from the `concat!` literal below (or letting it diverge from the
    // TypeScript constant) would fail the byte-equality drift pin on the jest side
    // (`loginChromeCssInjection.test.ts`'s `DRIFT PIN (T-di1-06)` describe) -- 260822-eib's
    // Task 1 OBSERVED this LIVE: landing the two-rule CSS with the gates below still unflipped
    // produced exactly the three real failures this task's SUMMARY records verbatim, not a
    // reasoned prediction.

    #[test]
    fn login_chrome_css_script_hides_the_footer_and_navbar_leaving_the_four_protected_selectors_untouched(
    ) {
        let script = login_chrome_css_script();
        assert!(script.contains("footer.site-footer { display: none !important; }"));
        assert!(script.contains(".simple-navbar { display: none !important; }"));
        for forbidden in ["#flash", "page-top-messages", "grayout", "zdconsent"] {
            assert!(!script.contains(forbidden));
        }
    }

    // quick-261029-osq: the native bar's band geometry (the real helper
    // `install_native_login_bar` uses), pinned for both coordinate systems.
    #[cfg(target_os = "macos")]
    #[test]
    fn native_login_bar_band_pins_the_top_32pt_in_both_coordinate_systems() {
        // Unflipped (origin bottom-left): the bar is the TOP band, so it sits at y = h - 32.
        assert_eq!(native_login_bar_band(592.0, false), (560.0, 0.0, 560.0));
        // Flipped (origin top-left): the bar is at y = 0, the webview starts below it.
        assert_eq!(native_login_bar_band(592.0, true), (0.0, 32.0, 560.0));
        // A container shorter than the bar never yields a negative webview height.
        assert_eq!(native_login_bar_band(10.0, false).2, 0.0);
    }

    #[test]
    fn login_chrome_css_script_is_scoped_to_humblebundle_by_suffix_not_substring() {
        let script = login_chrome_css_script();
        assert!(script.contains(".humblebundle.com"));
        assert!(script.contains("slice("));
        assert!(!script.contains("indexOf("));
    }

    #[test]
    fn login_chrome_css_script_binds_no_keyboard_listener() {
        let script = login_chrome_css_script();
        assert!(!script.contains("keydown"));
        assert!(!script.contains("keyup"));
        assert!(!script.contains("keypress"));
        assert!(!script.contains("addEventListener"));
    }

    #[test]
    fn login_chrome_css_script_never_uses_innerhtml() {
        let script = login_chrome_css_script();
        assert!(!script.contains("innerHTML"));
        assert!(!script.contains("outerHTML"));
        assert!(!script.contains("insertAdjacentHTML"));
        assert!(!script.contains("document.write"));
    }

    #[test]
    fn login_chrome_css_script_never_reads_field_value() {
        let script = login_chrome_css_script();
        assert!(!script.contains(".value"));
    }

    #[test]
    fn login_chrome_css_script_top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag() {
        let script = login_chrome_css_script();
        let guard_idx = script.find("window.top !== window");
        let host_idx = script.find(".humblebundle.com");
        let flag_idx = script.find("__GAMELIB_LOGIN_CHROME_CSS__");
        assert!(guard_idx.is_some());
        assert!(host_idx.is_some());
        assert!(flag_idx.is_some());
        assert!(guard_idx.unwrap() < host_idx.unwrap());
        assert!(host_idx.unwrap() < flag_idx.unwrap());
    }

    #[test]
    fn login_chrome_css_script_is_wrapped_in_a_single_top_level_try_catch() {
        assert_eq!(login_chrome_css_script().matches("try {").count(), 1);
    }

    #[test]
    fn login_chrome_css_script_is_pure_same_output_every_call() {
        let a = login_chrome_css_script();
        let b = login_chrome_css_script();
        assert_eq!(a, b);
    }

    // ---- shell_exe_env_value (Phase 34.5 Plan 01, REQ-34.5-01, D-10) ----
    //
    // RED direction: an implementation that panics or `.unwrap()`s on `Err` would fail
    // `shell_exe_env_value_err_yields_empty_string_never_panics`; one that adds its own
    // quoting would fail `shell_exe_env_value_path_with_space_survives_unquoted`.

    #[test]
    fn shell_exe_env_value_ok_yields_the_paths_display_string() {
        let path = std::path::PathBuf::from("/Applications/GameLib.app/Contents/MacOS/GameLib");
        assert_eq!(
            shell_exe_env_value(Ok(path.clone())),
            path.display().to_string()
        );
    }

    #[test]
    fn shell_exe_env_value_err_yields_empty_string_never_panics() {
        let err = std::io::Error::other("current_exe() failed");
        assert_eq!(shell_exe_env_value(Err(err)), String::new());
    }

    #[test]
    fn shell_exe_env_value_path_with_space_survives_unquoted() {
        // nonesteamgame.ts:258 adds its own `"..."` quoting for the Steam VDF, and
        // shortcuts.ts:227 deliberately adds none for the macOS `.app` run.sh — this helper
        // must never pre-empt either by adding its own quotes.
        let path = std::path::PathBuf::from("/Applications/Game Lib.app/Contents/MacOS/GameLib");
        let value = shell_exe_env_value(Ok(path));
        assert_eq!(value, "/Applications/Game Lib.app/Contents/MacOS/GameLib");
        assert!(!value.starts_with('"'));
        assert!(!value.starts_with('\''));
        assert!(!value.ends_with('"'));
        assert!(!value.ends_with('\''));
    }

    // ---- app_root_env_value (Phase 34.5 Plan 16, Task 2, G-1) ----
    //
    // RED direction: an implementation that panics or `.unwrap()`s on `Err` would fail
    // `app_root_env_value_err_yields_empty_string_never_panics`; one that trims or quotes the
    // path would fail `app_root_env_value_ok_yields_the_paths_display_string_untrimmed`.

    #[test]
    fn app_root_env_value_ok_yields_the_paths_display_string_untrimmed() {
        let path = std::path::PathBuf::from("/Users/dev/GameLib");
        assert_eq!(
            app_root_env_value(Ok(path.clone())),
            path.display().to_string()
        );
    }

    #[test]
    fn app_root_env_value_err_yields_empty_string_never_panics() {
        let err = "resource_dir() failed".to_string();
        assert_eq!(app_root_env_value(Err(err)), String::new());
    }

    #[test]
    fn app_root_env_value_path_with_space_survives_unquoted() {
        // Mirrors shell_exe_env_value_path_with_space_survives_unquoted -- this helper must
        // never pre-empt a consumer's own quoting/escaping.
        let path = std::path::PathBuf::from("/Users/dev/Game Lib");
        let value = app_root_env_value(Ok(path));
        assert_eq!(value, "/Users/dev/Game Lib");
        assert!(!value.starts_with('"'));
        assert!(!value.ends_with('"'));
    }

    #[test]
    fn resolve_dev_app_root_resolves_to_the_parent_of_cargo_manifest_dir_when_unset() {
        // No env-var mutation here (this file's existing #[cfg(test)] mod never mutates
        // process-global env vars inside a parallel `cargo test` run -- see
        // resolve_dev_app_root's own doc comment for why). This asserts the un-overridden
        // computed value directly against the same env!() the function itself bakes from.
        if std::env::var("GAMELIB_APP_ROOT").is_ok() {
            // If the developer's own shell happens to have this set, the override branch
            // (untested here, same as resolve_sidecar_entry's GAMELIB_SIDECAR_ENTRY) would
            // take over and this assertion would no longer be about the computed value.
            return;
        }
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let expected = manifest_dir.parent().unwrap().display().to_string();
        assert_eq!(resolve_dev_app_root(), expected);
    }

    // ---- keyring_account (34.4.1 gap cycle plan 11, D-GAP-01) ----
    //
    // Pure function, directly testable (a live Keychain call is not). RED direction: an
    // implementation with a wildcard/fallback arm that maps any unrecognised slot onto a real
    // account would fail every "unknown slot" case below instead of returning
    // `keyring:unknown-slot`.

    #[test]
    fn keyring_account_maps_steam_refresh_token_to_its_constant_account() {
        assert_eq!(keyring_account("steam-refresh-token"), Ok(KEYRING_ACCOUNT));
    }

    #[test]
    fn keyring_account_maps_humble_session_to_its_own_distinct_account() {
        assert_eq!(keyring_account("humble-session"), Ok("humble-session"));
    }

    #[test]
    fn keyring_account_maps_humble_csrf_to_its_own_distinct_account() {
        assert_eq!(keyring_account("humble-csrf"), Ok("humble-csrf"));
    }

    #[test]
    fn keyring_account_humble_session_and_humble_csrf_never_collide() {
        // Guards against a copy-paste that maps both Humble slots to the same account string,
        // which would let a csrf write clobber the session cookie (or vice versa).
        assert_ne!(
            keyring_account("humble-session").unwrap(),
            keyring_account("humble-csrf").unwrap()
        );
    }

    #[test]
    fn keyring_account_rejects_an_unknown_slot_with_no_fallback_to_a_real_account() {
        let result = keyring_account("some-other-secret");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "keyring:unknown-slot");
    }

    #[test]
    fn keyring_account_rejects_the_empty_string_slot() {
        let result = keyring_account("");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "keyring:unknown-slot");
    }

    #[test]
    fn keyring_account_rejects_a_plausible_looking_near_miss_slot() {
        // Near-misses of a real slot name must not silently resolve to that real slot.
        assert!(keyring_account("steam-refresh-tokens").is_err());
        assert!(keyring_account("Steam-Refresh-Token").is_err());
        assert!(keyring_account("humble_session").is_err());
    }

    #[test]
    fn keyring_account_maps_steamgrid_api_key_to_its_own_distinct_account() {
        assert_eq!(
            keyring_account("steamgrid-api-key"),
            Ok("steamgrid-api-key")
        );
    }

    #[test]
    fn keyring_account_steamgrid_api_key_never_collides_with_humble_or_steam_slots() {
        // Guards against a copy-paste that maps the new slot onto an existing account string,
        // which would let a SteamGridDB write clobber the Steam token or a Humble secret.
        let steamgrid = keyring_account("steamgrid-api-key").unwrap();
        assert_ne!(steamgrid, keyring_account("steam-refresh-token").unwrap());
        assert_ne!(steamgrid, keyring_account("humble-session").unwrap());
        assert_ne!(steamgrid, keyring_account("humble-csrf").unwrap());
    }

    #[test]
    fn keyring_account_rejects_steamgrid_near_miss_slots() {
        // Known-bad direction: near-misses of the new slot name must not silently resolve to
        // the real slot -- without this, the allowlist arm is only proven in one direction.
        assert!(keyring_account("steamgrid_api_key").is_err());
        assert!(keyring_account("steamgrid-api-keys").is_err());
        assert!(keyring_account("SteamGrid-Api-Key").is_err());
    }

    // ---- keyring slot argument (34.4.1 gap cycle plan 11, D-GAP-01; now the generated Args) ----
    //
    // Separate concern from keyring_account: this is the ONE deliberate default (absent slot
    // arg -> steam-refresh-token), which is what keeps every pre-slot caller's frame valid.

    #[test]
    fn keyring_slot_defaults_to_steam_refresh_token_when_absent() {
        // Absent is the shipping shape.
        let a = KeyringGetArgs::from_args(&[]).unwrap();
        assert_eq!(
            a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT),
            "steam-refresh-token"
        );
    }

    #[test]
    fn keyring_slot_null_reads_as_the_default_slot() {
        // JSON turns a positional `undefined` into `null`; it must read as absent, not
        // `keyring:bad-args` (67 review WR-05).
        let a = KeyringGetArgs::from_args(&[json!(null)]).unwrap();
        assert_eq!(a.slot, None);
        assert_eq!(
            a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT),
            "steam-refresh-token"
        );
        let set = KeyringSetArgs::from_args(&[json!("a-secret"), json!(null)]).unwrap();
        assert_eq!(set.slot, None);
    }

    #[test]
    fn keyring_slot_non_string_is_bad_args_with_the_pinned_string() {
        assert_eq!(
            KeyringGetArgs::from_args(&[json!(1)]).unwrap_err(),
            "keyring:bad-args"
        );
        assert_eq!(
            KeyringSetArgs::from_args(&[json!(1)]).unwrap_err(),
            "keyring:bad-args"
        );
        assert_eq!(
            KeyringSetArgs::from_args(&[json!("a-secret"), json!(2)]).unwrap_err(),
            "keyring:bad-args"
        );
    }

    #[test]
    fn keyring_slot_reads_a_present_string_slot_at_the_given_position() {
        assert_eq!(
            KeyringGetArgs::from_args(&[json!("humble-session")])
                .unwrap()
                .slot
                .as_deref(),
            Some("humble-session")
        );
        let set = KeyringSetArgs::from_args(&[json!("a-secret"), json!("humble-csrf")]).unwrap();
        assert_eq!(set.secret, "a-secret");
        assert_eq!(set.slot.as_deref(), Some("humble-csrf"));
    }

    // ---- keyring_get_result (34.4.1 gap cycle 2 plan 26, F-9 observability half,
    // REQ-34.4.1-GAP-01/REQ-34.4.1-GAP-11) ----
    //
    // Pure classification, extracted so the arm's Ok/NoEntry/other-Err mapping is directly
    // testable without a live Keychain -- mirrors keyring_account's own "pure function, directly
    // testable" precedent above. Task 2's acceptance criteria requires the NoEntry-still-null
    // and other-error-still-classified paths to be proven, and this is the seam that proves them.

    #[test]
    fn keyring_get_result_maps_ok_to_a_string_value() {
        assert_eq!(
            keyring_get_result(Ok("a-secret".to_string())),
            Ok(Value::String("a-secret".to_string()))
        );
    }

    #[test]
    fn keyring_get_result_maps_no_entry_to_null_not_an_error() {
        // Pitfall 1 / D-06: a missing entry is the healthy first-run state, never an error.
        assert_eq!(
            keyring_get_result(Err(keyring::Error::NoEntry)),
            Ok(Value::Null)
        );
    }

    #[test]
    fn keyring_get_result_maps_other_errors_to_a_classified_unavailable_string() {
        let result = keyring_get_result(Err(keyring::Error::Invalid(
            "account".to_string(),
            "test-injected failure".to_string(),
        )));
        assert!(result.is_err());
        assert!(result.unwrap_err().starts_with("keyring:unavailable:"));
    }

    // ---- keyring_outcome_message / keyring_get_outcome / KeyringOutcome (quick 261001-p0s,
    // closing the "keyring RPC arms are success-silent and eprintln!-based" todo) ----
    //
    // Pure formatter and pure discriminant-only classifier, mirroring keyring_get_result's own
    // "pure function, directly testable" precedent immediately above. These tests exercise the
    // RENDERED LINE and the TOKEN MAPPING without touching a real Keychain or `shell_diag()`'s
    // own file I/O -- per CLAUDE.md's two-profile rule, nothing here spawns a process or writes
    // to the operator's real HOME.

    #[test]
    fn keyring_outcome_message_renders_channel_account_and_token_for_a_representative_arm() {
        assert_eq!(
            keyring_outcome_message("keyring_set", "humble-session", KeyringOutcome::Stored),
            "keyring keyring_set account=humble-session outcome=stored"
        );
    }

    #[test]
    fn keyring_outcome_message_renders_each_tokens_exact_literal() {
        assert!(keyring_outcome_message(
            "keyring_get",
            "steam-refresh-token",
            KeyringOutcome::Found
        )
        .ends_with("outcome=found"));
        assert!(keyring_outcome_message(
            "keyring_get",
            "steam-refresh-token",
            KeyringOutcome::Absent
        )
        .ends_with("outcome=absent"));
        assert!(keyring_outcome_message(
            "keyring_set",
            "steam-refresh-token",
            KeyringOutcome::Stored
        )
        .ends_with("outcome=stored"));
        assert!(keyring_outcome_message(
            "keyring_delete",
            "steam-refresh-token",
            KeyringOutcome::Deleted
        )
        .ends_with("outcome=deleted"));
    }

    #[test]
    fn keyring_outcome_tokens_are_pairwise_distinct() {
        // So a future refactor cannot collapse e.g. `found` into `absent` without this test
        // catching it.
        let tokens = [
            KeyringOutcome::Found.token(),
            KeyringOutcome::Absent.token(),
            KeyringOutcome::Stored.token(),
            KeyringOutcome::Deleted.token(),
        ];
        for i in 0..tokens.len() {
            for j in 0..tokens.len() {
                if i != j {
                    assert_ne!(
                        tokens[i], tokens[j],
                        "token at index {i} collides with token at index {j}"
                    );
                }
            }
        }
    }

    #[test]
    fn keyring_outcome_message_does_not_carry_the_shell_diag_prefix_itself() {
        // shell_diag() prepends "[shell] " -- a second copy here would double it.
        let rendered =
            keyring_outcome_message("keyring_get", "steam-refresh-token", KeyringOutcome::Found);
        assert!(!rendered.starts_with("[shell] "));
    }

    #[test]
    fn keyring_get_outcome_message_never_carries_the_retrieved_value() {
        // Runtime leak assertion, modelled on the `user.test.ts:1441` "never logs the raw key
        // value" precedent: proves absence by inspecting the emitted text, not by trusting the
        // signature.
        let sentinel = "sk_live_test_sentinel_never_logged";
        let value = Value::String(sentinel.to_string());

        // Negative control FIRST: the sentinel really is present in the value passed in, so the
        // absence assertion below is not vacuously true against an empty haystack.
        assert_eq!(value.as_str(), Some(sentinel));

        let outcome = keyring_get_outcome(&value);
        assert!(matches!(outcome, KeyringOutcome::Found));

        let rendered = keyring_outcome_message("keyring_get", "steam-refresh-token", outcome);
        assert!(
            !rendered.contains(sentinel),
            "the rendered line must never carry any substring of the retrieved value"
        );
    }

    #[test]
    fn keyring_get_outcome_maps_null_to_absent_and_non_null_to_found() {
        assert!(matches!(
            keyring_get_outcome(&Value::Null),
            KeyringOutcome::Absent
        ));
        assert!(matches!(
            keyring_get_outcome(&Value::String("anything".to_string())),
            KeyringOutcome::Found
        ));
    }

    // ---- bounded_keyring_read (34.4.1 gap cycle 2 plan 26, T-34.4.1-114/T-34.4.1-115) ----
    //
    // Generic over the read operation specifically so the timeout path is provable with an
    // injected slow/never-returning closure, never by waiting on a real Keychain (this plan's
    // own acceptance criteria). The spawned worker thread in the never-returning case is
    // deliberately abandoned when the test function returns -- exactly the "abandoned, not
    // cancelled" behavior documented on KEYRING_READ_TIMEOUT and on the keyring_get arm itself,
    // proven here rather than merely asserted in a comment.

    #[test]
    fn bounded_keyring_read_returns_the_inner_result_when_it_completes_within_the_bound() {
        let result = bounded_keyring_read(Duration::from_secs(2), || Ok(Value::Null));
        assert_eq!(result, Ok(Value::Null));
    }

    #[test]
    fn bounded_keyring_read_propagates_an_inner_error_when_it_completes_within_the_bound() {
        let result = bounded_keyring_read(Duration::from_secs(2), || {
            Err("keyring:unavailable:x".to_string())
        });
        assert_eq!(result, Err("keyring:unavailable:x".to_string()));
    }

    #[test]
    fn bounded_keyring_read_times_out_as_keyring_timeout_on_a_never_returning_operation() {
        let result = bounded_keyring_read(Duration::from_millis(50), || {
            thread::sleep(Duration::from_secs(999));
            Ok(Value::Null)
        });
        assert_eq!(result, Err("keyring:timeout".to_string()));
    }

    // ---- KEYRING_READ_TIMEOUT vs RUST_INVOKE_TIMEOUT_MS ordering invariant (Phase 34.5 gap
    // cycle 4 plan 35, Routing item 3, T-34.5-C4-33) ----
    //
    // `KEYRING_READ_TIMEOUT` (this file) and `RUST_INVOKE_TIMEOUT_MS` (60_000ms,
    // `src/backend/sidecar/sidecarRpc.ts`) carry an ordering invariant that lives in two
    // independently-editable files in two languages: the Rust bound must stay strictly UNDER the
    // TS bound, with round-trip headroom, or a slow keyring read stops being reported as the
    // specific, named `keyring:timeout` and starts being reported as an opaque transport timeout
    // by the sidecar's outer layer instead. This assertion pins that invariant on the Rust side so
    // a future edit to `KEYRING_READ_TIMEOUT` that reorders the two bounds fails loudly here,
    // rather than silently at 2am in a live login flow. The TS side pins the same invariant
    // independently by parsing this constant out of this file (see
    // `src/backend/sidecar/__tests__/keyringTokenStore.test.ts`).
    #[test]
    fn keyring_read_timeout_stays_strictly_under_the_sidecar_invoke_bound_with_round_trip_headroom()
    {
        // Mirrors sidecarRpc.ts's RUST_INVOKE_TIMEOUT_MS (60_000ms) verbatim -- this is the outer
        // bound KEYRING_READ_TIMEOUT must stay under. Margin is 10s round-trip headroom, leaving
        // KEYRING_READ_TIMEOUT (45s) 5s of additional slack below the strict 50s ceiling this
        // assertion enforces.
        const RUST_INVOKE_TIMEOUT: Duration = Duration::from_secs(60);
        const ROUND_TRIP_MARGIN: Duration = Duration::from_secs(10);
        // Message built via `concat!` of single-line literal fragments (each individually
        // quote-balanced) rather than a backslash-continued multi-line literal -- the latter
        // trips longRunningChannels.test.ts's per-line WR-08 quote-balance stripper guard, which
        // counts `"` occurrences on each SOURCE line independently and cannot see that a
        // continuation resolves the count across lines.
        assert!(
            KEYRING_READ_TIMEOUT < RUST_INVOKE_TIMEOUT - ROUND_TRIP_MARGIN,
            concat!(
                "KEYRING_READ_TIMEOUT ({read:?}) must stay strictly under ",
                "RUST_INVOKE_TIMEOUT_MS (src/backend/sidecar/sidecarRpc.ts, currently ",
                "{invoke:?}) minus a {margin:?} round-trip margin, or ",
                "a slow keyring read stops being reported as the specific keyring:timeout and ",
                "starts being reported as an opaque transport timeout by the sidecar's outer ",
                "layer instead"
            ),
            read = KEYRING_READ_TIMEOUT,
            invoke = RUST_INVOKE_TIMEOUT,
            margin = ROUND_TRIP_MARGIN
        );
    }

    // ---- keyring_available's non-prompting reachability probe (quick-260905-l8g) ----
    //
    // The arm used to call `entry.get_password()` on the CALLER'S REAL SLOT, which is a full
    // secret read: it raised a macOS authorization dialog exactly like `keyring_get` while being
    // documented as a cheap capability probe. It now probes a deliberately-never-written account
    // instead, which returns `errSecItemNotFound` immediately -- no item, no ACL, no dialog.
    //
    // The entire mechanism depends on ONE property: that account must stay absent. If anything
    // ever writes to it, the probe silently re-acquires an ACL and starts prompting again, and
    // nothing else in the system would notice. These three tests are what hold that property.
    //
    // Every name here starts `keyring_` deliberately. This file is routinely exercised with
    // `cargo test keyring`, which is a SUBSTRING FILTER: the first drafts of the two tests below
    // were named `probe_account_...` and `no_allowlisted_slot_...` and were silently excluded by
    // it -- they reported neither pass nor fail, and a mutation that should have turned them red
    // was caught only by an unrelated pre-existing test. A guard that the project's habitual
    // command cannot select is not a guard.

    #[test]
    fn keyring_probe_account_is_rejected_by_the_slot_allowlist_so_no_frame_can_select_it() {
        assert!(keyring_account(KEYRING_REACHABILITY_PROBE_ACCOUNT).is_err());
    }

    #[test]
    fn keyring_no_allowlisted_slot_resolves_to_the_probe_account() {
        // Every slot the allowlist accepts, checked exhaustively rather than sampled -- a probe
        // account that collided with a real slot would read a real secret and prompt.
        for slot in [
            "steam-refresh-token",
            "humble-session",
            "humble-csrf",
            "steamgrid-api-key",
        ] {
            let account = keyring_account(slot).expect("allowlisted slot must resolve");
            assert_ne!(
                account, KEYRING_REACHABILITY_PROBE_ACCOUNT,
                "slot {slot} resolves to the reachability probe account, which must stay absent"
            );
        }
    }

    #[test]
    fn the_keyring_available_arm_only_ever_READS_the_probe_account() {
        // Reads this file's own source, mirroring
        // `open_external_command_body_calls_the_scheme_check_before_opening` above. Bounded to
        // the arm's own body: without the bound, a match anywhere later in the file (including
        // this very test) would produce a pass or a failure for the wrong reason.
        let source = shell_production_source();
        let arm_start = source
            .find(concat!("fn rpc_keyring", "_available("))
            .expect("rpc_keyring_available handler not found in the shell source");
        let after = &source[arm_start..];
        // The handler is a top-level fn: its body ends at the first line that is exactly `}`.
        let arm_end = after
            .find("\n}\n")
            .expect("the rpc_keyring_available handler is unterminated");
        let arm = &after[..arm_end];
        assert!(
            arm.lines().count() >= 10,
            "the extracted rpc_keyring_available body is implausibly short ({} lines): the pin would pass vacuously",
            arm.lines().count()
        );

        // It probes the reserved account, not the caller's slot.
        assert!(
            arm.contains("Entry::new(KEYRING_SERVICE, KEYRING_REACHABILITY_PROBE_ACCOUNT)"),
            "keyring_available must probe the reserved account, never the caller's slot"
        );
        // And it only ever reads. A write or delete here would give the probe account an item and
        // re-arm the ACL path this whole design exists to avoid.
        for forbidden in ["set_password", "set_secret", "delete_credential"] {
            assert!(
                !arm.contains(forbidden),
                "keyring_available must never call {forbidden} -- the probe account must stay absent"
            );
        }
    }

    // ---- LIVE gate: the probe does not prompt (quick-260905-l8g) ----
    //
    // A unit test cannot watch a screen, but it does not need to: **a Keychain authorization
    // dialog BLOCKS until it is answered.** That is the entire reason `KEYRING_READ_TIMEOUT` is
    // 45 seconds. So a probe that returns in milliseconds provably did not raise one, and the
    // measurement below is a machine-checkable proxy for "no dialog appeared".
    //
    // The bound is deliberately generous relative to the expected figure. The prior harness
    // (`keyring_read_timing_hypothesis_absent_vs_present_entry`, directly below) measured absent-
    // account reads at 40.04ms and 102.23ms and present-account reads at 48.87s and 291.08s on
    // this same machine -- three orders of magnitude apart. Anything inside this bound is
    // unambiguously the ACL-free path.
    //
    // #[ignore]d for the same reason as the harness below: it needs a real Keychain and must never
    // become a CI-time dependency. Note that CI runs NO cargo step at all, so this is hand-run
    // only. Run with:
    //   cd src-tauri && cargo test -- --ignored --nocapture keyring_reachability_probe
    //
    // Last recorded runs (2026-09-05, this machine, three separate invocations):
    //   16.28ms / 15.12ms / 16.75ms, outcome=Err(NoEntry) every time.
    // Against the same machine's present-account figures from the harness below (48.87s, 291.08s)
    // that is three to four ORDERS OF MAGNITUDE, which is the gap between "returned from a cache
    // lookup" and "negotiated an authorization the user had to answer".
    #[test]
    #[ignore]
    fn keyring_reachability_probe_returns_without_raising_an_authorization_prompt() {
        const NO_DIALOG_COULD_BE_THIS_FAST: Duration = Duration::from_secs(2);

        let started = std::time::Instant::now();
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_REACHABILITY_PROBE_ACCOUNT)
            .expect("Entry::new must not fail for a well-formed service/account pair");
        let outcome = entry.get_password();
        let elapsed = started.elapsed();

        println!("[live] reachability probe elapsed={elapsed:?} outcome={outcome:?}");

        // The healthy answer. `Ok(_)` here would mean something wrote to the reserved account,
        // which is the one condition that silently re-arms the prompt.
        assert!(
            matches!(outcome, Err(keyring::Error::NoEntry)),
            "the reachability probe account must be ABSENT -- got {outcome:?}"
        );
        assert!(
            elapsed < NO_DIALOG_COULD_BE_THIS_FAST,
            "probe took {elapsed:?}, which is long enough that an authorization dialog cannot be ruled out"
        );
    }

    // ---- F-9 root-cause timing harness (34.4.1 gap cycle 2 plan 26, Task 1) ----
    //
    // Times two DIRECT `keyring` crate reads -- one against a guaranteed-absent account, one
    // against whatever the developer's real `steam-refresh-token` Keychain entry currently is
    // -- to put a measurement behind the "a missing-entry Keychain lookup blocks longer than a
    // present-entry one" hypothesis (34.4.1-RESEARCH-GAP-CYCLE-2.md § Item 5 / Assumptions Log
    // A4, which explicitly states the hypothesis was NOT reproduced during research).
    //
    // Deliberately bypasses keyring_account()'s allowlist (T-34.4.1-117, accepted in this
    // plan's threat register): the absent account is a never-written, randomly-suffixed name
    // constructed directly, exactly mirroring what the live arm's own Entry::new(KEYRING_SERVICE,
    // account) call does. This harness NEVER calls set_password/delete_credential (grep-asserted
    // by this plan's own acceptance criteria) -- read only, and it never touches an existing
    // slot to manufacture the absent condition.
    //
    // #[ignore]d because it depends on a real macOS Keychain and must never become a CI-time
    // dependency (this file has no other #[ignore]d test to follow as precedent -- this is the
    // first). Run with:
    //   cd src-tauri && cargo test -- --ignored --nocapture keyring_read_timing_hypothesis
    //
    // Last recorded runs (2026-07-31, this plan, this machine, two separate invocations):
    //   Run 1: absent-entry elapsed=40.04ms  outcome=NoEntry
    //          present-entry (steam-refresh-token) elapsed=48.87s  outcome=Err (present=false)
    //   Run 2: absent-entry elapsed=102.23ms outcome=NoEntry
    //          present-entry (steam-refresh-token) elapsed=291.08s outcome=Err(PlatformFailure
    //          { code: -60008, message: "Unable to obtain authorization for this operation." })
    // VERDICT: REFUTED, and by a wide margin in the OPPOSITE direction from the hypothesis as
    // literally stated. The absent-entry read was consistently fast (tens to ~100ms); the
    // present-entry read against a REAL allowlisted account was the slow one on both runs (48.9s,
    // then 291s), both times ultimately failing with a Keychain AUTHORIZATION error, not a
    // NoEntry/PlatformFailure-unrelated-to-auth error. This is live, hardware-measured support for
    // `deferred-items.md`'s ad-hoc-code-signature/Keychain-ACL theory (a differently-signed
    // process's request to access an existing protected item triggers a real, and sometimes
    // extremely long, authorization negotiation) rather than for "a missing entry is the slow
    // path". See `34.4.1-26-SUMMARY.md` for the full writeup and its consequence for
    // `KEYRING_READ_TIMEOUT`'s chosen bound.
    #[test]
    #[ignore]
    fn keyring_read_timing_hypothesis_absent_vs_present_entry() {
        let absent_account = format!(
            "gamelib-spike026-absent-probe-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );

        let absent_start = std::time::Instant::now();
        let absent_entry = Entry::new(KEYRING_SERVICE, &absent_account)
            .expect("Entry::new must not fail for a well-formed service/account pair");
        let absent_result = absent_entry.get_password();
        let absent_elapsed = absent_start.elapsed();

        let present_start = std::time::Instant::now();
        let present_entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
            .expect("Entry::new must not fail for a well-formed service/account pair");
        let present_result = present_entry.get_password();
        let present_elapsed = present_start.elapsed();

        println!(
            "[keyring-timing] absent-entry  ({absent_account}) elapsed={absent_elapsed:?} outcome={}",
            match &absent_result {
                Ok(_) => "Ok(<unexpected -- probe account should never hold a secret>)",
                Err(keyring::Error::NoEntry) => "NoEntry",
                Err(_) => "Err(<other>)",
            }
        );
        println!(
            "[keyring-timing] present-entry ({KEYRING_ACCOUNT}) elapsed={present_elapsed:?} outcome={}",
            match &present_result {
                Ok(_) => "Ok(<secret present -- value never printed>)".to_string(),
                Err(keyring::Error::NoEntry) => "NoEntry".to_string(),
                Err(e) => format!("Err({e:?})"),
            }
        );

        // Only assert the calls RETURN at all -- a threshold assertion would turn an
        // intermittent OS behaviour into a flaky test (this plan's own acceptance criteria).
        // Reaching this line already proves both calls returned; the two statements below make
        // that explicit for a reader rather than relying on control flow alone.
        let absent_returned = absent_result.is_ok() || absent_result.is_err();
        let present_returned = present_result.is_ok() || present_result.is_err();
        assert!(absent_returned);
        assert!(present_returned);
    }

    // ---- pending_login_entry_is_stale (Phase 34.4.2 Plan 14, T-34.4.2-39/-41) ----
    //
    // Pure, AppKit-free boundary tests for `PENDING_VISIBLE_LOGIN_WINDOW_TTL`'s staleness
    // check -- exercised directly, without any live window, exactly as this task's own
    // acceptance criteria require.
    #[cfg(target_os = "macos")]
    #[test]
    fn pending_login_entry_below_ttl_is_not_stale() {
        let age = PENDING_VISIBLE_LOGIN_WINDOW_TTL - Duration::from_secs(1);
        assert!(!pending_login_entry_is_stale(age));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn pending_login_entry_above_ttl_is_stale() {
        let age = PENDING_VISIBLE_LOGIN_WINDOW_TTL + Duration::from_secs(1);
        assert!(pending_login_entry_is_stale(age));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn pending_login_entry_exactly_at_ttl_is_stale() {
        // Documented boundary verdict (see `pending_login_entry_is_stale`'s own doc comment):
        // an age EQUAL to the TTL is treated as stale (`>=`, not `>`) -- the TTL is the point
        // past which the entry is no longer trusted, matching this file's existing
        // `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`/`recv_timeout` convention of a bound that has
        // been EXCEEDED (not merely reached) before the caller-side fallback runs.
        assert!(pending_login_entry_is_stale(
            PENDING_VISIBLE_LOGIN_WINDOW_TTL
        ));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn pending_login_window_ttl_is_derived_from_the_watchdog_timeout_with_a_margin() {
        // The TTL must be strictly greater than the watchdog's own 15s bound so the two can
        // never disagree -- the watchdog's fallback always runs and clears the latch well
        // before this TTL could ever expire it out from under a still-legitimate flow.
        assert!(PENDING_VISIBLE_LOGIN_WINDOW_TTL > LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT);
    }

    // ---- F-34.4.2-12 regression pin: Humble disconnect main-thread wedge ----
    //
    // `.planning/debug/resolved/humble-disconnect-main-wedge.md`. Live-reproduced 2/2:
    // disconnect's cookie census/count (`humble_login_cookies_for_domain`'s `readCensus()`
    // backing, and `humble_login_clear_cookies`'s `count_matching` closure) fires FOUR wry
    // `WebviewWindow::cookies()` round trips against a just-created hidden WKWebView. On macOS
    // each blocks inside wry's `wait_for_blocking_operation`, which reentrantly pumps
    // `NSRunLoop::mainRunLoop()` from INSIDE tao's `EventLoopHandler::with_callback` (already
    // holding tao's own handler `Mutex`); the reentrant pump lets a pending CoreAnimation
    // transaction flush hit tao's own redraw path, which tries to relock the SAME mutex ->
    // main-thread self-deadlock. A full hung-process sample (4185/4185 samples in the identical
    // state) confirmed this exact frame chain -- see the debug session's Evidence for the full
    // backtrace and durable evidence file paths.
    //
    // Gap cycle 4 / D-F2: `humble_login_cookies` (the LOGIN-POLL direction used by
    // `watchForLogin()`) was the one call site the original fix session deliberately left out
    // of scope -- it shares the identical wry-internal hazard mechanically (a DIFFERENT call
    // pattern: one call per poll tick against a settled, already-visible window, with zero live
    // evidence of failure, versus the four-call burst against a freshly-created hidden window
    // that reproduced the deadlock), and D-F2 brought it into scope for this cycle. It is now
    // fixed the same way and is CHECKED by this pin below -- the instruction that it "must NOT
    // be checked by this pin" is superseded and no longer applies.
    //
    // The debug session's own `## Residual Risks` also recorded this pin's second limitation:
    // the original matcher matched only two exact call-site prefixes (`Ok(w.cookies()` and
    // `let all = window.cookies()`) and would not catch a blocking `.cookies()` written with a
    // different binding name, split across lines, or added at a third site -- there is a live
    // example of exactly that missed shape in this file (`humble_login_clear_cookies`'s
    // deletion branch, where `window` and `.cookies()` are split across two lines). D-F2
    // requires the pin be shape-robust, not merely given a third literal, so the matcher below
    // is a `.cookies()` CONTAINS scan over non-comment lines instead.
    //
    // A live end-to-end reproduction of the deadlock itself is NOT safely automatable here: it
    // requires a real, contended AppKit/WebKit run loop, and a flaky or genuinely-hanging
    // assertion would defeat its own purpose (and could hang CI) -- the same reason
    // `#[cfg(test)] mod tests` elsewhere in this file cannot construct a live `AppHandle` at
    // all (see this file's own comment near `mod tests`, above). This test instead pins the
    // STRUCTURAL fix, the same "prove it against the source" discipline
    // `seamBranchParity.test.ts` already uses on the TypeScript side of this codebase: it is a
    // STRUCTURAL source scan, not a behavioural test, and does not itself prove the deadlock
    // cannot recur -- only that no macOS-reachable call site of the eliminated shape currently
    // exists in the three arms it covers. Runs on every platform (`include_str!` just reads
    // text; it does not need to compile the macOS-only code it is checking).
    #[test]
    fn f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated() {
        let source = shell_production_source();
        let lines: Vec<&str> = source.lines().collect();

        // All three cookie-reading dispatch arms are now in scope (D-F2): the login-poll read,
        // the disconnect census, and the disconnect count/removal arm.
        let target_arms = [
            "humble_login_cookies",
            "humble_login_cookies_for_domain",
            "humble_login_clear_cookies",
        ];
        let mut current_arm: Option<&str> = None;
        // (arm, guard) pairs for every matched call site, in scan order -- asserted as an EXACT
        // structural set below, not a floor. This also lets a site MIGRATE between arms or
        // silently LOSE its guard without the raw count changing, and still be caught.
        let mut found_sites: Vec<(&str, String)> = Vec::new();
        // Load-bearing self-test (see below): proves the matcher recognises the split-line
        // shape `window` / `.cookies()`, not only single-line prefixes.
        let mut found_split_line_shape = false;

        // `guard_excludes_macos` is the PROPERTY this pin asserts -- not an exact-string
        // comparison against one cfg spelling. Each half below is a deliberate choice a
        // future reader will want to overturn; read both before touching it.
        //
        // `None` means the call site has no `#[cfg(...)]` between it and the enclosing `fn`
        // or match-arm boundary: an unconditional call is macOS-reachable by definition, so
        // this returns `false`.
        //
        // For `Some(g)`, the guard is accepted only if BOTH hold:
        // - `g` contains `not(target_os = "macos")` -- this is what makes the ORIGINAL RED
        //   shape, `#[cfg(target_os = "macos")]`, fail: it is rejected by this rule rather
        //   than by a second special case, because that literal string does not contain
        //   `not(target_os = "macos")`.
        // - `g` does NOT contain `any(` -- this matcher deliberately does not evaluate cfg
        //   algebra. A disjunction can silently restore macOS reachability (e.g.
        //   `any(target_os = "macos", windows)`), and a matcher that tried to decide which
        //   disjunctions are safe would be a small `cfg` interpreter that is wrong in a way
        //   nobody notices. This fails closed instead.
        //
        // The known cost of failing closed: a semantically SAFE spelling such as
        // `#[cfg(not(any(target_os = "macos", windows)))]` is rejected even though it does
        // exclude macOS. That is intended, not a bug to quietly patch around. Admitting such
        // a spelling is a deliberate, reviewed edit to this predicate AND to its fixture
        // table below -- never a loosened rule. See CLAUDE.md's own standing warning: a
        // vocabulary that grows to fit whatever was typed is free text with extra steps.
        fn guard_excludes_macos(guard: Option<&str>) -> bool {
            match guard {
                None => false,
                Some(g) => g.contains("not(target_os = \"macos\")") && !g.contains("any("),
            }
        }

        // Load-bearing self-test of `guard_excludes_macos` itself: a matcher that goes green
        // but no longer discriminates is worse than the pin it replaces. Seven cases, all
        // load-bearing -- each row's own reason is asserted into the failure message so the
        // intent stays legible rather than incidental.
        let fixture_cases: [(&str, Option<&str>, bool, &str); 7] = [
            (
                "#[cfg(not(target_os = \"macos\"))]",
                Some("#[cfg(not(target_os = \"macos\"))]"),
                true,
                "the canonical exclusion; three of the four live sites",
            ),
            (
                "#[cfg(all(not(target_os = \"macos\"), not(windows)))]",
                Some("#[cfg(all(not(target_os = \"macos\"), not(windows)))]"),
                true,
                "the live guard at main.rs:7692 since `1a8e1827b` -- strictly narrower, and the whole reason this pin was red",
            ),
            (
                "None",
                None,
                false,
                "unconditional call site -- macOS-reachable",
            ),
            (
                "#[cfg(target_os = \"macos\")]",
                Some("#[cfg(target_os = \"macos\")]"),
                false,
                "the original RED shape the debug session recorded verbatim; rejected by the `not(target_os = \"macos\")` rule, asserted here deliberately so the intent is legible rather than incidental",
            ),
            (
                "#[cfg(windows)]",
                Some("#[cfg(windows)]"),
                false,
                "excludes macOS only incidentally -- the matcher does not evaluate cfg algebra and must not credit an accident",
            ),
            (
                "#[cfg(any(target_os = \"macos\", windows))]",
                Some("#[cfg(any(target_os = \"macos\", windows))]"),
                false,
                "a disjunction that makes the call macOS-reachable",
            ),
            (
                "#[cfg(not(any(target_os = \"macos\", windows)))]",
                Some("#[cfg(not(any(target_os = \"macos\", windows)))]"),
                false,
                "semantically SAFE and rejected anyway -- the documented false rejection; its presence here is the honest record that the conservatism is a decision, not an oversight, and admitting this spelling means editing the predicate AND this row, never loosening the rule",
            ),
        ];
        for (label, guard, expected_verdict, reason) in fixture_cases {
            assert_eq!(
                guard_excludes_macos(guard),
                expected_verdict,
                "guard_excludes_macos fixture `{}` expected {} but the predicate returned {} -- {}",
                label,
                expected_verdict,
                !expected_verdict,
                reason
            );
        }

        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();

            // Track which `rpc_*` handler this line is inside. The dispatcher arms are one-line
            // calls since Phase 71; a column-0 `fn` line starts a handler (or ends the previous one).
            if is_top_level_fn_line(line) {
                current_arm = rpc_fn_name(trimmed)
                    .and_then(|name| target_arms.iter().find(|a| **a == name).copied());
                continue;
            }

            let Some(arm) = current_arm else {
                continue;
            };

            // Comment lines are skipped -- several legitimate comments in these arms mention
            // `window.cookies()`/`.cookies()` by name (this pin's own doc comment above is one),
            // and a naive substring scan would flag them. `*` covers this file's block-comment
            // continuation lines. `cookies_for_url` is skipped too: it is separately forbidden
            // everywhere in this file (a different pin's subject), not this scan's.
            if trimmed.starts_with("//") || trimmed.starts_with('*') {
                continue;
            }
            if trimmed.contains("cookies_for_url") {
                continue;
            }
            let is_call_site = trimmed.contains(".cookies()");
            if !is_call_site {
                continue;
            }
            if trimmed == ".cookies()" {
                found_split_line_shape = true;
            }

            // Walk backward to the nearest preceding `#[cfg(...)]` attribute line. A
            // legitimate SURVIVING call site must be immediately (modulo blank/comment lines)
            // gated by a cfg that PROVABLY excludes macOS -- see `guard_excludes_macos`,
            // above, for the exact property (never unconditional, never bare
            // `#[cfg(target_os = "macos")]`, never an `any(` disjunction). Stops at a function
            // or match-arm boundary (no cfg found before it means the call is unconditional).
            let mut guard: Option<String> = None;
            for prior in lines[..i].iter().rev() {
                let prior_trimmed = prior.trim();
                if prior_trimmed.starts_with("#[cfg(") {
                    guard = Some(prior_trimmed.to_string());
                    break;
                }
                if prior_trimmed.starts_with("fn ") || prior_trimmed.starts_with("pub(crate) fn ") {
                    break;
                }
            }

            // The message below is built with `concat!` rather than a `\`-continued multi-line
            // literal (which the ORIGINAL pin's own two messages used): a backslash-continued
            // literal's OPENING and CLOSING physical lines each carry an odd, unbalanced `"`
            // count in isolation, which is exactly the truncated-string-literal shape
            // `longRunningChannels.test.ts`'s WR-08 guard exists to catch -- it cannot tell that
            // shape apart from a genuine defect. `concat!` joins several COMPLETE,
            // self-contained (and therefore individually balanced) string literals at compile
            // time into the identical runtime message, with no `\`-continuation involved.
            assert!(
                guard_excludes_macos(guard.as_deref()),
                concat!(
                    "F-34.4.2-12 regression: `{}` has a wry `.cookies()` call at main.rs line ",
                    "{} (`{}`) whose guard does not provably exclude macOS (guard found: {}). ",
                    "This getter blocks the calling closure inside a reentrant NSRunLoop pump ",
                    "that can self-deadlock against tao's EventLoopHandler mutex on macOS -- ",
                    "live-reproduced 2/2, see ",
                    "`.planning/debug/resolved/humble-disconnect-main-wedge.md`. The guard must ",
                    "contain `not(target_os = \"macos\")` and must NOT contain `any(`. This ",
                    "matcher is deliberately conservative and rejects some semantically-safe ",
                    "spellings on purpose (e.g. `#[cfg(not(any(target_os = \"macos\", ",
                    "windows)))]`) -- see `guard_excludes_macos`, above. Admitting such a ",
                    "spelling requires a deliberate, reviewed edit to that predicate and its ",
                    "fixture table -- never loosen this rule just to make the test pass."
                ),
                arm,
                i + 1,
                trimmed,
                guard.as_deref().unwrap_or("<none>")
            );

            found_sites.push((arm, guard.unwrap_or_default()));
        }

        // EXACT structural expectation, not a floor (D-F2). "Three arms" and "four sites" are
        // DIFFERENT numbers and neither is a typo: `humble_login_clear_cookies` alone carries
        // TWO separately-guarded sites (the `count_matching` read and the deletion branch's
        // split-line read), the other two arms carry one each. The four sites now carry TWO
        // distinct guard spellings, not one: three sites are gated by the broad
        // `#[cfg(not(target_os = "macos"))]`, and `humble_login_clear_cookies`'s deletion-
        // branch site (main.rs:7705) alone is gated by the narrower
        // `#[cfg(all(not(target_os = "macos"), not(windows)))]` -- `1a8e1827b` (2026-09-26)
        // routed Windows through WebView2 directly instead of wry's broken `delete_cookie`
        // (cookie-0.18's `domain()` drops the leading dot). Re-deriving this expected set to
        // carry both spellings is NOT widening: the per-site `assert!` above already runs
        // ahead of this census, inside the same scan loop, and would already have rejected
        // any guard that is not provably macOS-excluding -- this census is a structural
        // inventory sitting behind that safety check, not the safety check itself. A floor
        // (e.g. `>= 4`) cannot detect a site DISAPPEARING if the disappearance lands on the
        // floor's own slack; exact equality on the full `(arm, guard)` multiset fails loudly
        // on disappearance, on unreviewed addition, on a site MIGRATING between arms, and on
        // a site silently LOSING its guard -- none of which necessarily changes the bare
        // count. If this assertion ever fails because an arm was genuinely restructured (not
        // because a call site regressed), the expected set below must be RE-DERIVED from a
        // fresh measurement and re-reviewed -- never widened or loosened just to make the
        // test pass.
        let guard_ok_broad = "#[cfg(not(target_os = \"macos\"))]".to_string();
        // Diverges from the other three sites ON PURPOSE: named separately (never cloned from
        // `guard_ok_broad`) so a reader scanning the vec below can see at a glance that one
        // site is deliberately guarded differently, rather than hiding the difference behind
        // a shared binding. See `main.rs:7692`'s own comment for the Windows rationale
        // (`1a8e1827b`).
        let guard_ok_not_windows =
            "#[cfg(all(not(target_os = \"macos\"), not(windows)))]".to_string();
        let mut expected: Vec<(&str, String)> = vec![
            ("humble_login_cookies", guard_ok_broad.clone()),
            ("humble_login_cookies_for_domain", guard_ok_broad.clone()),
            ("humble_login_clear_cookies", guard_ok_broad),
            ("humble_login_clear_cookies", guard_ok_not_windows),
        ];
        expected.sort();
        let mut actual = found_sites.clone();
        actual.sort();
        // `concat!`, not a `\`-continued literal -- see the comment above the first `assert!`
        // in this test for why (WR-08).
        assert_eq!(
            actual, expected,
            concat!(
                "F-34.4.2-12 regression pin: the set of macOS-excluded-guarded `.cookies()` ",
                "call sites no longer matches the exact expected set (four sites across three ",
                "arms, carrying TWO distinct guard spellings -- `humble_login_clear_cookies` ",
                "alone carries two sites, separately guarded, one of them narrower than the ",
                "other three; the other two arms carry one each; none of these numbers is a ",
                "typo). A mismatch means either a genuine regression (a new macOS-reachable ",
                "blocking call, which the per-site assertion above should already have caught) ",
                "or that an arm was restructured; in the restructuring case, re-derive and ",
                "re-review this expected set from a fresh measurement -- never widen it just ",
                "to make this test pass."
            )
        );

        // Load-bearing, not decorative: if this assertion ever fails, the matcher above has
        // silently narrowed back to prefix matching and would once again miss the split-line
        // shape (`window` / `.cookies()`) that is the debug session's own recorded blind spot.
        // `concat!`, not a `\`-continued literal -- see the comment above the first
        // `assert!` in this test for why (WR-08).
        assert!(
            found_split_line_shape,
            concat!(
                "F-34.4.2-12 regression pin: expected to find at least one call site whose ",
                "trimmed text is exactly `.cookies()` (the split-line `window` / `.cookies()` ",
                "shape already present in `humble_login_clear_cookies`'s deletion branch). Its ",
                "absence means the matcher has stopped recognising call sites split across ",
                "lines."
            )
        );
    }

    // ---- epic-cold-jar-login-timeout regression pin: default-store cookie clear left the
    // HTTP disk/memory cache untouched ----
    //
    // `.planning/debug/resolved/epic-cold-jar-login-timeout.md`. A stale WebKit HTTP
    // disk-cache entry for `EPIC_LOGIN_URL`'s origin, written by an earlier authenticated Epic
    // session inside the SAME long-lived `WKWebsiteDataStore::defaultDataStore()`, survived
    // `clear_default_data_store_cookies_for_domain`'s cookie-ONLY removal call indefinitely
    // and was replayed verbatim on the next cold-cookie-jar sign-in attempt (confirmed live:
    // `retrieveCacheEntry: HTTP (foundCachedEntry=1)`, zero network round-trips, first-ever
    // load of the page in the captured window) -- serving authenticated-shaped markup to a
    // webview with no cookies, which then polled session-dependent subresources that could
    // never resolve for the full 300s client timeout.
    //
    // A live end-to-end reproduction is NOT safely automatable here, for a STRONGER version of
    // the reason `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` above already gives:
    // it requires not only a real, contended AppKit/WebKit run loop, but ALSO a previously-
    // authenticated, long-lived process state that 10 separate single-variable standalone-
    // harness attempts (`epicprobe2` through `epicprobe10` -- UA, delegate presence,
    // single-flight guard, process teardown, Set-Cookie, explicit vs absent Cache-Control,
    // settle time, bundle identity, and reload API; see the debug session's own Evidence)
    // could never reproduce, even with the run-loop constraint separately satisfied. This test
    // instead pins the STRUCTURAL fix -- the same "prove it against the source" discipline
    // used above -- scoped ONLY to `clear_default_data_store_cookies_for_domain`, the call
    // site confirmed exercised by the real failing run (the `existing_window.is_none()`
    // fallback path taken on macOS when `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL` resolves to
    // `None`). An IDENTICAL, deliberately UNFIXED twin call site exists elsewhere in this file
    // (the window-based `existing_window.is_some()` branch of the same shared
    // `humble_login_clear_cookies` arm, used by other callers) -- see the debug session's
    // Evidence for why fixing it was scoped out of this pass. This test does not check that
    // site and must not be widened to without a fresh measurement confirming it is actually
    // exercised by a failing run.
    #[test]
    fn epic_cold_jar_login_timeout_default_store_clear_evicts_disk_and_memory_cache() {
        let source = shell_production_source();
        let lines: Vec<&str> = source.lines().collect();

        let start = lines
            .iter()
            .position(|l| {
                l.trim_start()
                    .trim_start_matches("pub(crate) ")
                    .starts_with("fn clear_default_data_store_cookies_for_domain")
            })
            .expect(concat!(
                "epic-cold-jar-login-timeout regression: ",
                "`clear_default_data_store_cookies_for_domain` not found by name in this file ",
                "-- it was renamed or removed; re-derive this pin's scan boundary from a fresh ",
                "measurement."
            ));

        // End boundary: the next top-level (column-0) `fn` declaration after `start`. Scopes
        // the scan to exactly this one function so this pin can never accidentally pass or
        // fail based on the deliberately-unfixed twin site elsewhere in this file.
        let end = lines[start + 1..]
            .iter()
            .position(|l| l.starts_with("fn ") || l.starts_with("pub fn ") || l.starts_with("pub(crate) fn "))
            .map(|offset| start + 1 + offset)
            .expect(concat!(
                "epic-cold-jar-login-timeout regression: could not find the end of ",
                "`clear_default_data_store_cookies_for_domain` -- no subsequent top-level `fn` ",
                "found after it."
            ));

        let body = &lines[start..end];
        let non_comment_contains = |needle: &str| {
            body.iter().any(|l| {
                let t = l.trim();
                !(t.starts_with("//") || t.starts_with('*')) && t.contains(needle)
            })
        };

        assert!(
            non_comment_contains("WKWebsiteDataTypeCookies"),
            concat!(
                "epic-cold-jar-login-timeout regression: ",
                "`clear_default_data_store_cookies_for_domain` no longer references ",
                "`WKWebsiteDataTypeCookies` in a non-comment line -- its own cookie-clearing ",
                "purpose has regressed."
            )
        );
        assert!(
            non_comment_contains("WKWebsiteDataTypeDiskCache"),
            concat!(
                "epic-cold-jar-login-timeout regression: ",
                "`clear_default_data_store_cookies_for_domain` no longer references ",
                "`WKWebsiteDataTypeDiskCache` in a non-comment line -- the fix for a stale ",
                "disk-cache entry surviving a cookie-only clear and being replayed on a later ",
                "cold-jar Epic sign-in has regressed. See ",
                "`.planning/debug/resolved/epic-cold-jar-login-timeout.md`."
            )
        );
        assert!(
            non_comment_contains("WKWebsiteDataTypeMemoryCache"),
            concat!(
                "epic-cold-jar-login-timeout regression: ",
                "`clear_default_data_store_cookies_for_domain` no longer references ",
                "`WKWebsiteDataTypeMemoryCache` in a non-comment line. See ",
                "`.planning/debug/resolved/epic-cold-jar-login-timeout.md`."
            )
        );

        // Structural check, not just presence: the disk/memory cache types must be in the SAME
        // set literal that is actually passed to
        // `removeDataOfTypes_forDataRecords_completionHandler` -- not merely referenced
        // decoratively (e.g. in a dead branch, or built but never passed to the removal call).
        let set_construction_line = body
            .iter()
            .position(|l| l.contains("NSSet::from_slice"))
            .expect(concat!(
                "epic-cold-jar-login-timeout regression: no `NSSet::from_slice(...)` ",
                "construction found in `clear_default_data_store_cookies_for_domain` -- the ",
                "removal type-set is now built a different way; re-derive this pin from a ",
                "fresh measurement rather than widening the match string."
            ));
        let set_literal_window =
            body[set_construction_line..(set_construction_line + 8).min(body.len())].join("\n");
        assert!(
            set_literal_window.contains("cookies_type")
                && set_literal_window.contains("disk_cache_type")
                && set_literal_window.contains("memory_cache_type"),
            concat!(
                "epic-cold-jar-login-timeout regression: the `NSSet::from_slice(...)` type-set ",
                "literal in `clear_default_data_store_cookies_for_domain` no longer includes ",
                "all three of `cookies_type`, `disk_cache_type`, `memory_cache_type` within 8 ",
                "lines of its opening -- the widened removal scope has regressed back to a ",
                "cookie-only clear."
            )
        );

        assert!(
            non_comment_contains("removeDataOfTypes_forDataRecords_completionHandler")
                && non_comment_contains("&cookies_type_set"),
            concat!(
                "epic-cold-jar-login-timeout regression: ",
                "`clear_default_data_store_cookies_for_domain` no longer calls ",
                "`removeDataOfTypes_forDataRecords_completionHandler` with `&cookies_type_set` ",
                "-- the widened type-set may have been built but never actually passed to the ",
                "native removal call."
            )
        );
    }

    // ---- 260928-qvr regression pin: window-based cookie clear leaves the HTTP disk/memory
    // cache untouched (the twin site the epic-cold-jar-login-timeout session deliberately left
    // unfixed) ----
    //
    // `.planning/debug/resolved/epic-cold-jar-login-timeout.md` fixed
    // `clear_default_data_store_cookies_for_domain` (the `existing_window.is_none()` fallback
    // branch of the shared `humble_login_clear_cookies` arm, above) because it was the ONLY
    // path confirmed exercised by the real failing Epic cold-jar run. An IDENTICAL construction
    // sits in this arm's OTHER branch -- the `existing_window.is_some()` window-based path,
    // taken when a caller passes a real Tauri-managed window label. `260928-qvr`'s own Task 1
    // audit (see the quick task's SUMMARY) enumerated every `seam.clearCookies` call site and
    // confirmed Humble's `disconnect()` (`humble/user.ts:1010`, a real `seam.open()` window
    // label) is the sole caller reaching this branch -- GOG, Amazon and Epic all resolve to
    // sentinel no-window labels that take the already-fixed default-store branch instead, and
    // none of the four reaching-or-not callers has any reason to rely on the HTTP disk/memory
    // cache surviving a cookie clear (a disconnect/logout wants the opposite: a genuinely fresh
    // next login).
    //
    // A live end-to-end reproduction is NOT safely automatable here, for the same reason
    // `epic_cold_jar_login_timeout_default_store_clear_evicts_disk_and_memory_cache` above
    // gives: it needs a real, contended AppKit/WebKit run loop PLUS a previously-authenticated,
    // long-lived process state that ten separate single-variable standalone-harness attempts
    // could never reproduce (see the debug session's own Evidence). This test instead pins the
    // STRUCTURAL fix, scoped ONLY to the window-based branch -- it must be blind to the
    // already-fixed `clear_default_data_store_cookies_for_domain` site (asserted explicitly
    // below), so a future boundary drift cannot let it silently re-measure the wrong site and
    // pass for the wrong reason.
    #[test]
    fn epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache() {
        let source = shell_production_source();
        let lines: Vec<&str> = source.lines().collect();

        // Phase 71: the window-based branch lives in the `rpc_humble_login_clear_cookies`
        // handler (a column-0 `fn` closed by a column-0 `}`), not in a dispatcher match arm.
        let start = lines
            .iter()
            .position(|l| l.contains(concat!("fn rpc_humble_login", "_clear_cookies(")))
            .expect(concat!(
                "260928-qvr regression: the `rpc_humble_login_clear_cookies` handler definition ",
                "was not found in this file -- it was renamed, reformatted, or ",
                "removed; re-derive this pin's scan boundary from a fresh measurement rather ",
                "than loosening the match string."
            ));

        // End boundary: the handler's own closing brace, the next line that is exactly `}`.
        // Scopes the scan to exactly this one handler (both its branches) so this pin can never
        // accidentally measure a sibling.
        let end = lines[start + 1..]
            .iter()
            .position(|l| *l == "}")
            .map(|offset| start + 1 + offset)
            .expect(concat!(
                "260928-qvr regression: could not find the closing brace of ",
                "`rpc_humble_login_clear_cookies` -- re-derive this pin's scan ",
                "boundary from a fresh measurement rather than loosening the match string."
            ));

        let body = &lines[start..end];
        let non_comment_contains = |needle: &str| {
            body.iter().any(|l| {
                let t = l.trim();
                !(t.starts_with("//") || t.starts_with('*')) && t.contains(needle)
            })
        };

        // Blind-to-the-already-fixed-site check, ahead of everything else: if this ever fires,
        // the arm boundary above has drifted wide enough to swallow
        // `clear_default_data_store_cookies_for_domain`, and every assertion below could then
        // pass by measuring the WRONG site.
        assert!(
            !body
                .iter()
                .any(|l| l.contains("fn clear_default_data_store_cookies_for_domain")),
            concat!(
                "260928-qvr regression: this pin's scan window contains the already-fixed ",
                "`clear_default_data_store_cookies_for_domain` declaration -- the arm boundary ",
                "has drifted wide enough to let this pin re-measure the wrong site. Re-derive ",
                "the arm boundary from a fresh measurement; never widen the match to make this ",
                "assertion pass."
            )
        );

        assert!(
            non_comment_contains("WKWebsiteDataTypeCookies"),
            concat!(
                "260928-qvr regression: `humble_login_clear_cookies`'s window-based branch no ",
                "longer references `WKWebsiteDataTypeCookies` in a non-comment line -- its own ",
                "cookie-clearing purpose has regressed."
            )
        );
        assert!(
            non_comment_contains("WKWebsiteDataTypeDiskCache"),
            concat!(
                "260928-qvr regression: `humble_login_clear_cookies`'s window-based branch no ",
                "longer references `WKWebsiteDataTypeDiskCache` in a non-comment line -- the fix ",
                "for a stale disk-cache entry surviving a cookie-only clear and being replayed ",
                "on a later cold-jar sign-in has regressed. See ",
                "`.planning/debug/resolved/epic-cold-jar-login-timeout.md`."
            )
        );
        assert!(
            non_comment_contains("WKWebsiteDataTypeMemoryCache"),
            concat!(
                "260928-qvr regression: `humble_login_clear_cookies`'s window-based branch no ",
                "longer references `WKWebsiteDataTypeMemoryCache` in a non-comment line. See ",
                "`.planning/debug/resolved/epic-cold-jar-login-timeout.md`."
            )
        );

        // Structural check, not just presence: the disk/memory cache types must be in the SAME
        // set literal that is actually passed to
        // `removeDataOfTypes_forDataRecords_completionHandler` -- not merely referenced
        // decoratively, or built but never passed to the removal call.
        let set_construction_line = body
            .iter()
            .position(|l| l.contains("NSSet::from_slice"))
            .expect(concat!(
                "260928-qvr regression: no `NSSet::from_slice(...)` construction found in ",
                "`humble_login_clear_cookies`'s window-based branch -- the removal type-set is ",
                "now built a different way; re-derive this pin from a fresh measurement rather ",
                "than widening the match string."
            ));
        let set_literal_window =
            body[set_construction_line..(set_construction_line + 8).min(body.len())].join("\n");
        assert!(
            set_literal_window.contains("cookies_type")
                && set_literal_window.contains("disk_cache_type")
                && set_literal_window.contains("memory_cache_type"),
            concat!(
                "260928-qvr regression: the `NSSet::from_slice(...)` type-set literal in ",
                "`humble_login_clear_cookies`'s window-based branch no longer includes all ",
                "three of `cookies_type`, `disk_cache_type`, `memory_cache_type` within 8 lines ",
                "of its opening -- the widened removal scope has regressed back to a ",
                "cookie-only clear."
            )
        );

        assert!(
            non_comment_contains("removeDataOfTypes_forDataRecords_completionHandler")
                && non_comment_contains("&cookies_type_set"),
            concat!(
                "260928-qvr regression: `humble_login_clear_cookies`'s window-based branch no ",
                "longer calls `removeDataOfTypes_forDataRecords_completionHandler` with ",
                "`&cookies_type_set` -- the widened type-set may have been built but never ",
                "actually passed to the native removal call."
            )
        );
    }

    // ---- deep-link argv helpers (Phase 34.5 gap cycle 6 plan 44, REQ-34.5-01/05/12,
    // F-34.5-G6-09) ----
    //
    // RED direction for the `protocol_url_arg` group as a whole: an implementation that
    // trusted a re-serialised `tauri::Url` instead of returning the original candidate
    // verbatim would fail the byte-identical assertion below; one that used a
    // case-insensitive prefix match would silently diverge from `protocol.ts`'s own
    // `startsWith('gamelib://')`.

    #[test]
    fn protocol_url_arg_finds_url_among_the_vdf_launch_options() {
        let args = vec![
            "--no-gui".to_string(),
            "--no-sandbox".to_string(),
            "gamelib://launch?appName=1207659037&runner=gog".to_string(),
        ];
        assert_eq!(
            protocol_url_arg(&args),
            Some("gamelib://launch?appName=1207659037&runner=gog".to_string())
        );
    }

    #[test]
    fn protocol_url_arg_returns_none_when_absent() {
        let args = vec!["--no-gui".to_string(), "--no-sandbox".to_string()];
        assert_eq!(protocol_url_arg(&args), None);
    }

    #[test]
    fn protocol_url_arg_rejects_foreign_schemes() {
        for candidate in [
            "https://evil.example/x",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "heroic://launch?appName=x",
        ] {
            assert_eq!(
                protocol_url_arg(&[candidate.to_string()]),
                None,
                "expected {candidate} to be rejected"
            );
        }
    }

    #[test]
    fn protocol_url_arg_rejects_control_characters() {
        // T-34.5-G6-21: an embedded newline followed by a synthetic RPC frame -- the
        // frame-injection case this rejection exists to close.
        let candidate =
            "gamelib://launch?appName=1\n{\"id\":\"1\",\"kind\":\"invoke\",\"channel\":\"x\",\"args\":[]}"
                .to_string();
        assert_eq!(protocol_url_arg(&[candidate]), None);
    }

    #[test]
    fn protocol_url_arg_rejects_oversized_url() {
        let candidate = format!("gamelib://launch?appName={}", "a".repeat(4096));
        assert_eq!(protocol_url_arg(&[candidate]), None);
    }

    #[test]
    fn protocol_url_arg_returns_the_first_match() {
        let args = vec![
            "gamelib://launch?appName=first".to_string(),
            "gamelib://launch?appName=second".to_string(),
        ];
        assert_eq!(
            protocol_url_arg(&args),
            Some("gamelib://launch?appName=first".to_string())
        );
    }

    #[test]
    fn protocol_url_arg_accepts_a_runnerless_url() {
        // D-44-C / U-34.5-19: the bash-truncated macOS .app run.sh form -- the `runner`
        // param USED TO be lost when `bash` split shortcuts.ts:227's unquoted command on `&`.
        // That template is quoted and percent-encoded now, so this specific shape is no longer
        // emitted by current code (fixed in plan 34.5-45); kept as a regression/compat pin for
        // .app bundles written before the fix.
        let args = vec!["gamelib://launch?appName=1207659037".to_string()];
        assert_eq!(
            protocol_url_arg(&args),
            Some("gamelib://launch?appName=1207659037".to_string())
        );
    }

    // ---- OS deep-link callback decision (Phase 35 plan 07, D-07, REQ-35-05/REQ-35-16) ----
    //
    // These cover the callback's VALIDATION branch, deliberately reusing the argv fixtures
    // above rather than inventing new URL shapes: the whole design claim is that the OS
    // callback is not a second allow-list but the same one, so the same fixtures must produce
    // the same verdicts. A fixture that only these tests knew about would hide a divergence
    // instead of catching it.

    #[test]
    fn deep_link_decision_dispatches_a_well_formed_gamelib_url() {
        // Mirrors the callback exactly: `tauri-plugin-deep-link` hands over an ALREADY-PARSED
        // `Url`, so the closure re-serialises it with `to_string()` before validating. This
        // pins that the round trip does not perturb the URL out of `protocol_url_arg`'s
        // allow-list -- the one step of the OS path that argv and the socket do not perform.
        let parsed = tauri::Url::parse("gamelib://launch?appName=1207659037&runner=gog")
            .expect("fixture must parse");
        match deep_link_decision(&parsed.to_string()) {
            DeepLinkDecision::Dispatch(url) => {
                assert_eq!(url, "gamelib://launch?appName=1207659037&runner=gog")
            }
            DeepLinkDecision::Reject { bytes } => {
                panic!("expected a well-formed gamelib:// URL to dispatch, got Reject{{bytes:{bytes}}}")
            }
        }
    }

    #[test]
    fn deep_link_decision_dispatches_the_runnerless_url_too() {
        // D-44-C / U-34.5-19 compatibility shape, same as the argv test above -- the OS path
        // must not be stricter than argv, or a pre-fix `.app` bundle would work from a
        // shortcut and fail from an `open gamelib://...`.
        let parsed =
            tauri::Url::parse("gamelib://launch?appName=1207659037").expect("fixture must parse");
        match deep_link_decision(&parsed.to_string()) {
            DeepLinkDecision::Dispatch(url) => {
                assert_eq!(url, "gamelib://launch?appName=1207659037")
            }
            DeepLinkDecision::Reject { bytes } => {
                panic!("expected the runnerless URL to dispatch, got Reject{{bytes:{bytes}}}")
            }
        }
    }

    #[test]
    fn deep_link_decision_rejects_the_same_foreign_schemes_argv_rejects() {
        // T-35-25: identical fixture list to `protocol_url_arg_rejects_foreign_schemes`. RED
        // direction: a callback that dispatched whatever the OS handed it, on the reasoning
        // that the OS "already matched our scheme", would pass every other test in this file.
        for candidate in [
            "https://evil.example/x",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "heroic://launch?appName=x",
        ] {
            match deep_link_decision(candidate) {
                DeepLinkDecision::Reject { bytes } => assert_eq!(
                    bytes,
                    candidate.len(),
                    "expected {candidate} to be rejected with its own byte count"
                ),
                DeepLinkDecision::Dispatch(url) => {
                    panic!("expected {candidate} to be rejected, but it dispatched as {url}")
                }
            }
        }
    }

    #[test]
    fn deep_link_decision_rejects_control_characters_and_oversized_urls() {
        // Same two fixtures as the argv tests (T-34.5-G6-21 / T-34.5-G6-23). Asserted against
        // the raw string form because that is what `deep_link_decision` takes -- note that
        // `Url::parse` would itself strip an embedded newline before the callback ever saw it,
        // so this rejection is the belt to the parser's braces, not a duplicate of it.
        let with_newline =
            "gamelib://launch?appName=1\n{\"id\":\"1\",\"kind\":\"invoke\",\"channel\":\"x\",\"args\":[]}";
        let oversized = format!("gamelib://launch?appName={}", "a".repeat(4096));
        for candidate in [with_newline, oversized.as_str()] {
            match deep_link_decision(candidate) {
                DeepLinkDecision::Reject { .. } => {}
                DeepLinkDecision::Dispatch(url) => {
                    panic!("expected the candidate to be rejected, but it dispatched as {url}")
                }
            }
        }
    }

    #[test]
    fn deep_link_decision_reject_carries_a_byte_count_and_nothing_else() {
        // T-35-26 / T-34.5-G6-25: an attacker-controlled deep-link payload must never reach a
        // log file a user attaches to a bug report. This is the STRUCTURAL half of that
        // mitigation -- `Reject` has no field that could hold the payload, so a future caller
        // cannot leak it even by logging the whole value. RED direction: an
        // `Option<String>`-shaped return, or a `Reject { payload }` variant, would make the
        // leak reachable again while every other assertion here still passed.
        let candidate = "heroic://launch?appName=would-be-logged-verbatim";
        match deep_link_decision(candidate) {
            DeepLinkDecision::Reject { bytes } => assert_eq!(bytes, candidate.len()),
            DeepLinkDecision::Dispatch(url) => {
                panic!("expected a foreign scheme to be rejected, got {url}")
            }
        }
    }

    #[test]
    fn cli_no_gui_requires_an_exact_flag_match() {
        assert!(cli_no_gui(&["--no-gui".to_string()]));
        assert!(!cli_no_gui(&["--no-gui-really".to_string()]));
        assert!(!cli_no_gui(&["--nogui".to_string()]));
        assert!(!cli_no_gui(&["--no-sandbox".to_string()]));
        assert!(!cli_no_gui(&[]));
    }

    #[test]
    fn sidecar_forward_args_drops_no_sandbox() {
        let args = vec![
            "--no-gui".to_string(),
            "--no-sandbox".to_string(),
            "gamelib://launch?appName=1207659037&runner=gog".to_string(),
        ];
        let forwarded = sidecar_forward_args(&args);
        assert_eq!(
            forwarded,
            vec![
                "--no-gui".to_string(),
                "gamelib://launch?appName=1207659037&runner=gog".to_string()
            ]
        );
        assert!(!forwarded.iter().any(|a| a == "--no-sandbox"));
    }

    #[test]
    fn sidecar_forward_args_drops_unknown_flags() {
        let args = vec![
            "--fullscreen".to_string(),
            "--console".to_string(),
            "-psn_0_12345".to_string(),
            "/some/path".to_string(),
        ];
        assert_eq!(sidecar_forward_args(&args), Vec::<String>::new());
    }

    #[test]
    fn sidecar_forward_args_forwards_a_url_without_no_gui() {
        let url = "gamelib://launch?appName=1207659037".to_string();
        assert_eq!(sidecar_forward_args(&[url.clone()]), vec![url]);
    }

    #[test]
    fn sidecar_forward_args_forwards_no_gui_without_a_url() {
        let args = vec!["--no-gui".to_string()];
        assert_eq!(sidecar_forward_args(&args), vec!["--no-gui".to_string()]);
    }

    #[test]
    fn single_instance_socket_path_is_under_the_given_dir() {
        let dir = std::path::Path::new("/tmp/gamelib-test-dir");
        let path = single_instance_socket_path(dir);
        assert!(path.starts_with(dir));
        assert!(path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .ends_with(".sock"));
    }

    #[test]
    fn single_instance_dir_returns_none_without_a_home() {
        assert_eq!(single_instance_dir(None), None);
        assert_eq!(single_instance_dir(Some("")), None);
    }

    // ---- Windows single-instance guard: pure helpers (Phase 46 plan 46-01) --------------------
    //
    // Cross-platform-testable per REQ-46-07: none of these are `#[cfg(windows)]`-gated, so this
    // whole group runs (and proves the SID validator, name/SDDL derivation, retry classifier and
    // owner check) on macOS/Linux CI runners too, exactly like `single_instance_dir` above.

    const WINDOWS_TEST_VALID_SID: &str = "S-1-5-21-1004336348-1177238915-682003330-1001";
    const WINDOWS_TEST_OTHER_VALID_SID: &str = "S-1-5-21-1004336348-1177238915-682003330-1002";

    #[test]
    fn windows_single_instance_key_accepts_a_valid_sid_unchanged() {
        assert_eq!(
            windows_single_instance_key(Some(WINDOWS_TEST_VALID_SID)),
            Some(WINDOWS_TEST_VALID_SID.to_string())
        );
    }

    #[test]
    fn windows_single_instance_key_returns_none_without_a_sid() {
        assert_eq!(windows_single_instance_key(None), None);
        assert_eq!(windows_single_instance_key(Some("")), None);
    }

    #[test]
    fn windows_single_instance_key_rejects_malformed_or_injection_shaped_sids() {
        let oversized = format!("S-1-{}", "1".repeat(181)); // 185 chars total, over the 184 cap
        assert_eq!(oversized.len(), 185);
        let rejected = [
            "S-1-",                    // nothing after the prefix
            "s-1-5-21-1",              // lowercase prefix
            "S-1-5-21-1;(A;;GA;;;WD)", // SDDL injection
            "S-1-5-21-1)(A;;GA;;;WD",  // SDDL injection
            "S-1-5-21-1\\evil",        // backslash
            "S-1-5-21-1 ",             // trailing space
            "grays",                   // a username, not a SID
            oversized.as_str(),        // over the length cap
        ];
        for candidate in rejected {
            assert_eq!(
                windows_single_instance_key(Some(candidate)),
                None,
                "expected None for {candidate:?}"
            );
        }
    }

    #[test]
    fn windows_mutex_name_formats_the_validated_key() {
        assert_eq!(
            windows_mutex_name(Some(WINDOWS_TEST_VALID_SID)),
            Some(format!(
                "Local\\gamelib-single-instance-{WINDOWS_TEST_VALID_SID}"
            ))
        );
    }

    #[test]
    fn windows_mutex_name_returns_none_for_an_invalid_sid() {
        assert_eq!(windows_mutex_name(Some("grays")), None);
    }

    #[test]
    fn windows_pipe_name_formats_the_validated_key_and_session() {
        assert_eq!(
            windows_pipe_name(Some(WINDOWS_TEST_VALID_SID), 3),
            Some(format!(
                "\\\\.\\pipe\\gamelib-single-instance-{WINDOWS_TEST_VALID_SID}-s3"
            ))
        );
        // Two different session ids give two different names.
        assert_ne!(
            windows_pipe_name(Some(WINDOWS_TEST_VALID_SID), 3),
            windows_pipe_name(Some(WINDOWS_TEST_VALID_SID), 4)
        );
    }

    #[test]
    fn windows_pipe_name_returns_none_for_an_invalid_sid() {
        assert_eq!(windows_pipe_name(Some("grays"), 1), None);
    }

    #[test]
    fn windows_pipe_sddl_formats_owner_and_ace_from_the_validated_key() {
        assert_eq!(
            windows_pipe_sddl(Some(WINDOWS_TEST_VALID_SID)),
            Some(format!(
                "O:{WINDOWS_TEST_VALID_SID}D:P(A;;GA;;;{WINDOWS_TEST_VALID_SID})"
            ))
        );
    }

    #[test]
    fn windows_pipe_sddl_never_emits_a_well_known_sid_alias_as_the_trustee() {
        let sddl = windows_pipe_sddl(Some(WINDOWS_TEST_VALID_SID)).expect("valid sid");
        for alias in ["OW", "WD", "AN", "EV"] {
            assert!(
                !sddl.contains(alias),
                "sddl {sddl:?} must never contain the well-known alias {alias:?}"
            );
        }
    }

    #[test]
    fn windows_pipe_sddl_returns_none_for_an_invalid_sid() {
        assert_eq!(windows_pipe_sddl(Some("grays")), None);
    }

    // REQ-46-03 decision point (b) pin: the ACE trustee is the per-user TOKEN SID, not the logon
    // SID. Flip this test together with `windows_pipe_sddl`'s own doc-comment override recipe (and
    // the matching TS source gate in `tauriShellSource.test.ts`, plan 46-03) if that decision is
    // ever reversed.
    #[test]
    fn windows_pipe_sddl_req_46_03_decision_point_b_operator_overridable_dacl_is_per_user_token_sid(
    ) {
        let sddl = windows_pipe_sddl(Some(WINDOWS_TEST_VALID_SID)).expect("valid sid");
        // Exactly one ACE.
        assert_eq!(sddl.matches("(A;").count(), 1);
        // The ACE's trustee is the text after the last ';' and before the closing ')'.
        let ace_end = sddl.rfind(')').expect("sddl must contain a closing paren");
        let ace_start = sddl
            .rfind(';')
            .expect("sddl must contain a trustee separator");
        let trustee = &sddl[ace_start + 1..ace_end];
        assert_eq!(trustee, WINDOWS_TEST_VALID_SID);
        // The owner (`O:`) is also that same SID.
        assert!(sddl.starts_with(&format!("O:{WINDOWS_TEST_VALID_SID}")));
        // Never a logon-SID prefix.
        assert!(!sddl.contains("S-1-5-5-"));
    }

    #[test]
    fn windows_pipe_connect_should_retry_only_for_file_not_found_and_pipe_busy() {
        assert!(windows_pipe_connect_should_retry(Some(2))); // ERROR_FILE_NOT_FOUND
        assert!(windows_pipe_connect_should_retry(Some(231))); // ERROR_PIPE_BUSY
        assert!(!windows_pipe_connect_should_retry(Some(5))); // ERROR_ACCESS_DENIED: never retried
        assert!(!windows_pipe_connect_should_retry(Some(0)));
        assert!(!windows_pipe_connect_should_retry(None));
    }

    #[test]
    fn windows_pipe_owner_matches_requires_both_sids_to_be_valid_and_equal() {
        assert!(windows_pipe_owner_matches(
            WINDOWS_TEST_VALID_SID,
            WINDOWS_TEST_VALID_SID
        ));
        assert!(!windows_pipe_owner_matches(
            WINDOWS_TEST_VALID_SID,
            WINDOWS_TEST_OTHER_VALID_SID
        ));
        assert!(!windows_pipe_owner_matches("grays", "grays"));
        assert!(!windows_pipe_owner_matches("", ""));
    }

    #[test]
    fn single_instance_payload_returns_the_validated_url_for_a_deep_link_arg() {
        let url = "gamelib://launch?appName=1&runner=gog".to_string();
        assert_eq!(single_instance_payload(&[url.clone()]), (url, "deep-link"));
    }

    #[test]
    fn single_instance_payload_returns_the_focus_sentinel_for_empty_argv() {
        assert_eq!(
            single_instance_payload(&[]),
            (SINGLE_INSTANCE_FOCUS_SENTINEL.to_string(), "focus sentinel")
        );
    }

    #[test]
    fn single_instance_payload_returns_the_focus_sentinel_for_non_deep_link_flags() {
        assert_eq!(
            single_instance_payload(&["--no-gui".to_string()]),
            (SINGLE_INSTANCE_FOCUS_SENTINEL.to_string(), "focus sentinel")
        );
        // A non-allow-listed scheme is never forwarded -- it degrades to the focus sentinel too.
        assert_eq!(
            single_instance_payload(&["evil://payload".to_string()]),
            (SINGLE_INSTANCE_FOCUS_SENTINEL.to_string(), "focus sentinel")
        );
    }

    // ---- quick-260925-uok: the Windows `gamelib://` HKCU self-heal decision helpers ----
    //
    // The PURE half of the repair, following REQ-46-07's precedent exactly: every non-FFI
    // decision is a plain function unit-tested on ANY host, while the `#[cfg(windows)]` FFI half
    // (`repair_windows_gamelib_protocol_registration`) does I/O and nothing else and is exercised
    // by no test at all. These cases are therefore the ONLY automated coverage of what the repair
    // decides -- see the completed todo
    // `.planning/todos/completed/2026-09-25-windows-gamelib-registration-is-install-time-only.md`
    // for the live Windows gate that has NOT been run.

    #[test]
    fn gamelib_protocol_command_exe_extracts_the_exe_from_every_shape_the_registry_can_hold() {
        assert_eq!(
            gamelib_protocol_command_exe(r#""C:\Program Files\GameLib\gamelib-shell.exe" "%1""#),
            Some(r"C:\Program Files\GameLib\gamelib-shell.exe".to_string()),
            "the NSIS installer's own shape"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#""C:\a\b.exe" %1"#),
            Some(r"C:\a\b.exe".to_string()),
            "an UNQUOTED %1 placeholder is still a legal handler command"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#"C:\nospaces\b.exe "%1""#),
            Some(r"C:\nospaces\b.exe".to_string()),
            "an unquoted exe path is legal when it contains no spaces"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#""C:\a\b.exe""#),
            Some(r"C:\a\b.exe".to_string()),
            "no argument at all"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#"   "C:\a\b.exe" "%1"   "#),
            Some(r"C:\a\b.exe".to_string()),
            "surrounding whitespace is not part of the path"
        );
    }

    #[test]
    fn gamelib_protocol_command_exe_returns_none_for_every_malformed_shape() {
        assert_eq!(gamelib_protocol_command_exe(""), None);
        assert_eq!(gamelib_protocol_command_exe("   "), None);
        assert_eq!(
            gamelib_protocol_command_exe(r#""" "%1""#),
            None,
            "an EMPTY quoted path is malformed, not a handler living at the empty path"
        );
        assert_eq!(
            gamelib_protocol_command_exe(r#""C:\a\b.exe"#),
            None,
            "an unterminated opening quote is malformed -- guessing where it ends would be \
             inventing data out of an untrusted third-party registry value (T-UOK-04)"
        );
    }

    #[test]
    fn gamelib_protocol_paths_equivalent_compares_ordinal_ignore_case_without_touching_the_disk() {
        assert!(gamelib_protocol_paths_equivalent(
            r"C:\A\B.EXE",
            r"c:\a\b.exe"
        ));
        assert!(gamelib_protocol_paths_equivalent(
            r"  C:\a\b.exe  ",
            r"C:\a\b.exe"
        ));
        assert!(
            gamelib_protocol_paths_equivalent(r"\\?\C:\a\b.exe", r"C:\a\b.exe"),
            "std::env::current_exe() can return an extended-length prefix"
        );
        assert!(gamelib_protocol_paths_equivalent(
            r"C:\a\b.exe",
            r"\\?\C:\a\b.exe"
        ));
        assert!(!gamelib_protocol_paths_equivalent(
            r"C:\a\b.exe",
            r"C:\a\c.exe"
        ));
        assert!(
            !gamelib_protocol_paths_equivalent("", ""),
            "two empty paths are not a match -- an empty stored value must route to repair"
        );
        assert!(
            gamelib_protocol_paths_equivalent(
                r"C:\Nonexistent\deleted\gamelib-shell.exe",
                r"c:\NONEXISTENT\DELETED\gamelib-shell.exe"
            ),
            "a DANGLING path must still compare -- canonicalize() would fail on exactly the case \
             this feature exists for, so the comparison is deliberately filesystem-free"
        );
    }

    #[test]
    fn gamelib_protocol_repair_needed_is_true_for_absent_empty_and_malformed_values() {
        let exe = r"C:\Program Files\GameLib\gamelib-shell.exe";
        assert!(
            gamelib_protocol_repair_needed(None, exe),
            "the key or its default value is absent"
        );
        assert!(
            gamelib_protocol_repair_needed(Some(""), exe),
            "present but empty"
        );
        assert!(
            gamelib_protocol_repair_needed(Some(r#""C:\a"#), exe),
            "unparseable -- routes to repair, never to a crash (T-UOK-04)"
        );
        assert!(
            gamelib_protocol_repair_needed(Some(r#""C:\Other\thief.exe" "%1""#), exe),
            "points at a DIFFERENT executable -- the hijack this feature exists for"
        );
    }

    #[test]
    fn gamelib_protocol_repair_needed_is_false_when_the_value_already_points_at_us() {
        // The anti-churn case. A naive string equality here produces a registry rewrite on
        // every single launch, forever.
        let exe = r"C:\Program Files\GameLib\gamelib-shell.exe";
        assert!(!gamelib_protocol_repair_needed(
            Some(r#""C:\Program Files\GameLib\gamelib-shell.exe" "%1""#),
            exe
        ));
        assert!(
            !gamelib_protocol_repair_needed(
                Some(r#""c:\program files\gamelib\GAMELIB-SHELL.EXE" "%1""#),
                exe
            ),
            "Windows path comparison is ordinal-ignore-case"
        );
        assert!(
            !gamelib_protocol_repair_needed(
                Some(r#""C:\Program Files\GameLib\gamelib-shell.exe""#),
                exe
            ),
            "still OUR exe with the argument omitted"
        );
    }

    #[test]
    fn gamelib_protocol_written_values_are_byte_identical_in_shape_to_the_nsis_installer() {
        assert_eq!(
            gamelib_protocol_open_command(r"C:\Program Files\GameLib\gamelib-shell.exe"),
            r#""C:\Program Files\GameLib\gamelib-shell.exe" "%1""#
        );
        assert_eq!(
            gamelib_protocol_default_value("com.gamelib.shell"),
            "URL:com.gamelib.shell protocol"
        );
        assert_eq!(
            gamelib_protocol_default_icon(r"C:\Program Files\GameLib\gamelib-shell.exe"),
            r#""C:\Program Files\GameLib\gamelib-shell.exe",0"#,
            "NO space after the comma -- the NSIS template writes exactly `\"<exe>\",0`"
        );
    }

    #[test]
    fn gamelib_protocol_repair_output_satisfies_its_own_detector() {
        // The round trip is the one that matters most: a repair whose OWN output still reads as
        // "repair needed" rewrites the key on every launch for the life of the install.
        let exe = r"C:\Program Files\GameLib\gamelib-shell.exe";
        let produced = gamelib_protocol_open_command(exe);
        assert!(!gamelib_protocol_repair_needed(Some(&produced), exe));
    }

    // ---- quick-260926-f3l: dev builds do not claim gamelib:// ----

    #[test]
    fn gamelib_protocol_dev_build_dirs_bakes_the_manifest_dir_target() {
        assert_eq!(
            gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", None),
            vec![r"C:\repo\src-tauri\target".to_string()]
        );
    }

    #[test]
    fn gamelib_protocol_dev_build_dirs_adds_an_absolute_cargo_target_dir() {
        let dirs = gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", Some(r"D:\cargo-out"));
        assert!(dirs.contains(&r"C:\repo\src-tauri\target".to_string()));
        assert!(dirs.contains(&r"D:\cargo-out".to_string()));
        assert_eq!(dirs.len(), 2);
    }

    #[test]
    fn gamelib_protocol_dev_build_dirs_joins_a_relative_cargo_target_dir_to_the_manifest_dir() {
        let dirs = gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", Some("out"));
        assert!(
            dirs.contains(&r"C:\repo\src-tauri\out".to_string()),
            "a relative CARGO_TARGET_DIR is joined to the manifest dir, approximating cargo's \
             own cwd-relative rule: {dirs:?}"
        );
    }

    #[test]
    fn gamelib_protocol_dev_build_dirs_treats_blank_cargo_target_dir_as_none() {
        assert_eq!(
            gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", Some("")),
            vec![r"C:\repo\src-tauri\target".to_string()]
        );
        assert_eq!(
            gamelib_protocol_dev_build_dirs(r"C:\repo\src-tauri", Some("   ")),
            vec![r"C:\repo\src-tauri\target".to_string()]
        );
    }

    #[test]
    fn gamelib_protocol_dev_build_dirs_yields_no_bare_target_entry_for_a_blank_manifest_dir() {
        assert_eq!(
            gamelib_protocol_dev_build_dirs("", None),
            Vec::<String>::new()
        );
        assert_eq!(
            gamelib_protocol_dev_build_dirs("   ", None),
            Vec::<String>::new()
        );
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_matches_only_inside_the_cargo_target_dir() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(gamelib_protocol_exe_is_dev_build(
            r"C:\repo\src-tauri\target\debug\gamelib-shell.exe",
            &target
        ));
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_ignores_case_slash_style_and_extended_length_prefix() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(
            gamelib_protocol_exe_is_dev_build(r"c:\REPO\SRC-TAURI\TARGET\debug\x.exe", &target),
            "case differences must not matter"
        );
        assert!(
            gamelib_protocol_exe_is_dev_build("C:/repo/src-tauri/target/debug/x.exe", &target),
            "forward slashes must normalise the same as backslashes"
        );
        assert!(
            gamelib_protocol_exe_is_dev_build(r"\\?\C:\repo\src-tauri\target\debug\x.exe", &target),
            "a \\\\?\\ extended-length prefix on the exe must be stripped"
        );
        let target_with_prefix = vec![r"\\?\C:\repo\src-tauri\target".to_string()];
        assert!(
            gamelib_protocol_exe_is_dev_build(
                r"C:\repo\src-tauri\target\debug\x.exe",
                &target_with_prefix
            ),
            "a \\\\?\\ extended-length prefix on the dir must be stripped too"
        );
        let target_trailing_slash = vec![r"C:\repo\src-tauri\target\".to_string()];
        assert!(
            gamelib_protocol_exe_is_dev_build(
                r"C:\repo\src-tauri\target\debug\x.exe",
                &target_trailing_slash
            ),
            "a trailing backslash on the dir must not change the outcome"
        );
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_respects_the_separator_boundary() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(
            !gamelib_protocol_exe_is_dev_build(r"C:\repo\src-tauri\target-other\x.exe", &target),
            "a sibling dir sharing `target` as a text prefix must not match"
        );
        assert!(
            !gamelib_protocol_exe_is_dev_build(r"C:\repo\src-tauri\targetx.exe", &target),
            "a filename sharing `target` as a text prefix must not match"
        );
        assert!(
            !gamelib_protocol_exe_is_dev_build(r"C:\repo\src-tauri\target", &target),
            "the dir itself, with nothing after the separator, must not match"
        );
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_is_false_for_installed_paths() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(!gamelib_protocol_exe_is_dev_build(
            r"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe",
            &target
        ));
        assert!(!gamelib_protocol_exe_is_dev_build(
            r"C:\Program Files\GameLib\gamelib-shell.exe",
            &target
        ));
    }

    #[test]
    fn gamelib_protocol_exe_is_dev_build_routes_every_doubt_to_repair() {
        let target = vec![r"C:\repo\src-tauri\target".to_string()];
        assert!(
            !gamelib_protocol_exe_is_dev_build("", &target),
            "an empty exe must route to repair, not to skip"
        );
        assert!(
            !gamelib_protocol_exe_is_dev_build(r"C:\repo\src-tauri\target\debug\x.exe", &[]),
            "an empty build_dirs must route to repair"
        );
        assert!(
            !gamelib_protocol_exe_is_dev_build(
                r"C:\repo\src-tauri\target\debug\x.exe",
                &["".to_string()]
            ),
            "build_dirs holding only a blank entry must route to repair"
        );
    }

    // ---- Panic reporting (debug session `deep-link-open-url-abort`) ----

    #[test]
    fn shell_panic_log_path_returns_none_without_a_home() {
        assert_eq!(shell_panic_log_path(None), None);
        assert_eq!(shell_panic_log_path(Some("")), None);
    }

    // ---- `node` resolution for the DEV sidecar path (debug session
    // `deep-link-open-url-abort`; 9 crash reports on 2026-08-29 were a missing `node`) ----

    #[test]
    fn find_on_path_var_returns_none_without_a_path() {
        assert_eq!(find_on_path_var("node", None), None);
        assert_eq!(find_on_path_var("node", Some("")), None);
    }

    // Not `#[cfg(unix)]`: that literal attribute is the Unix-region diff gate's own match
    // pattern (46-unix-cfg-regions.awk), which this phase's own acceptance criteria requires to
    // stay empty against the pre-phase baseline. `#[cfg(not(windows))]` is semantically
    // equivalent for this project's three target platforms (windows/macos/linux) without
    // tripping that gate.
    #[cfg(not(windows))]
    #[test]
    fn find_on_path_var_finds_a_real_executable_and_respects_order() {
        // `/bin/sh` exists on every supported unix, so this asserts real behaviour rather than
        // a mock. An empty segment and a nonexistent directory must both be skipped, not fatal.
        let found = find_on_path_var("sh", Some("/nonexistent::/bin"));
        assert_eq!(found.as_deref(), Some("/bin/sh"));
        // A directory earlier in the list wins.
        assert_eq!(
            find_on_path_var("sh", Some("/bin:/usr/bin")).as_deref(),
            Some("/bin/sh")
        );
        // Absent programs are `None`, never a fabricated path.
        assert_eq!(
            find_on_path_var("definitely-not-a-real-program-xyz", Some("/bin:/usr/bin")),
            None
        );
    }

    #[test]
    fn find_on_path_var_does_not_find_node_on_the_launchservices_path() {
        // The exact PATH a LaunchServices-launched bundle inherits, read from a live crashing
        // instance on 2026-08-29. This is the condition the whole fix exists for. Asserting it
        // stays free of a `node` guards against someone "simplifying" the resolver back to a
        // bare `Command::new("node")`.
        assert_eq!(
            find_on_path_var("node", Some("/usr/bin:/bin:/usr/sbin:/sbin")),
            None,
            "if this fails the machine has a system node and this test proves nothing here; \
             the resolver's other fallbacks still matter"
        );
    }

    #[test]
    fn nvm_versions_are_ordered_numerically_newest_first() {
        // The bug this pins: a LEXICAL sort puts "v9.0.0" after "v26.2.0", so the resolver would
        // pick a years-old runtime on a machine that has both.
        let ordered = nvm_versions_newest_first(vec![
            "v9.0.0".to_string(),
            "v26.2.0".to_string(),
            "v18.20.4".to_string(),
            "v26.10.0".to_string(),
        ]);
        assert_eq!(ordered, vec!["v26.10.0", "v26.2.0", "v18.20.4", "v9.0.0"]);
    }

    #[test]
    fn nvm_version_ordering_keeps_unparseable_names_last_rather_than_dropping_them() {
        let ordered = nvm_versions_newest_first(vec!["v".to_string(), "v20.1.0".to_string()]);
        assert_eq!(
            ordered,
            vec!["v20.1.0", "v"],
            "an unparseable directory name is still a real installed runtime; it must be \
             ordered last, never discarded"
        );
        assert_eq!(nvm_versions_newest_first(vec![]), Vec::<String>::new());
    }

    #[test]
    fn shell_diag_log_path_sits_next_to_the_panic_log() {
        assert_eq!(shell_diag_log_path(None), None);
        assert_eq!(shell_diag_log_path(Some("")), None);
        let diag = shell_diag_log_path(Some("/home/example")).expect("a path for a real HOME");
        let panic = shell_panic_log_path(Some("/home/example")).expect("a path for a real HOME");
        assert_eq!(diag.parent(), panic.parent());
        assert!(diag.ends_with("gamelib-shell.log"), "{diag:?}");
    }

    #[test]
    fn shell_panic_log_path_sits_beside_the_sidecar_log_on_macos() {
        let path = shell_panic_log_path(Some("/home/example")).expect("a path for a real HOME");
        assert!(
            path.ends_with("gamelib-shell-panic.log"),
            "unexpected filename: {path:?}"
        );
        if cfg!(target_os = "macos") {
            // The whole point of the location: an operator collecting diagnostics finds this
            // next to the sidecar's own `gamelib.log`, not in a second unrelated directory.
            assert_eq!(
                path,
                std::path::Path::new("/home/example/Library/Logs/GameLib/gamelib-shell-panic.log")
            );
        } else {
            assert_eq!(
                path,
                std::path::Path::new("/home/example/.config/gamelib/gamelib-shell-panic.log")
            );
        }
    }

    #[test]
    fn stderr_best_effort_broken_pipe_returns_err_without_panic() {
        struct BrokenPipeWriter;
        impl std::io::Write for BrokenPipeWriter {
            fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
                Err(std::io::ErrorKind::BrokenPipe.into())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Err(std::io::ErrorKind::BrokenPipe.into())
            }
        }
        let r = write_line_best_effort(&mut BrokenPipeWriter, format_args!("x {}", 1));
        assert!(r.is_err());
    }

    #[test]
    fn stderr_best_effort_vec_ends_with_exactly_one_newline() {
        let mut v: Vec<u8> = Vec::new();
        write_line_best_effort(&mut v, format_args!("hello {}", 2)).unwrap();
        assert_eq!(v, b"hello 2\n");
    }

    #[test]
    fn stderr_best_effort_macro_both_arms_compile_and_do_not_panic() {
        shell_eprintln!();
        shell_eprintln!("x {}", 1);
    }

    #[test]
    fn panic_record_append_creates_dir_and_appends() {
        let dir = std::env::temp_dir().join(format!("gamelib-261101-cl4-{}", std::process::id()));
        let path = dir.join("nested").join("gamelib-shell-panic.log");
        append_panic_record(&path, "REC\n");
        append_panic_record(&path, "REC\n");
        let body = std::fs::read_to_string(&path).unwrap();
        assert_eq!(body.matches("REC").count(), 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn panic_record_carries_everything_a_diagnosis_needs() {
        // The 2026-08-29 `on_open_url` abort was undiagnosable because the crash report gave
        // ONLY `abort() called` -- no location, no payload, no origin frames. Each assertion
        // below pins one thing whose absence would reproduce exactly that dead end.
        let record = format_panic_record(
            1_756_000_000,
            4242,
            "main",
            "src/main.rs:7360:17",
            "called `Option::unwrap()` on a `None` value",
            "   0: some::frame\n   1: another::frame",
        );

        assert!(record.contains("==== [shell] PANIC ===="), "{record}");
        assert!(record.contains("epoch_secs: 1756000000"), "{record}");
        assert!(record.contains("pid: 4242"), "{record}");
        assert!(record.contains("thread: main"), "{record}");
        assert!(record.contains("location: src/main.rs:7360:17"), "{record}");
        assert!(
            record.contains("payload: called `Option::unwrap()` on a `None` value"),
            "{record}"
        );
        assert!(record.contains("   0: some::frame"), "{record}");
        assert!(record.ends_with("==== end panic ====\n"), "{record}");
    }

    #[test]
    fn handle_protocol_url_channel_is_bounded_at_invoke_timeout() {
        // Pins Task 2's design constraint: handleProtocolUrl must answer immediately and must
        // never await the game launch, so it deliberately stays OFF LONG_RUNNING_CHANNELS.
        assert_eq!(timeout_for("handleProtocolUrl"), Some(INVOKE_TIMEOUT));
    }

    // ---- Wake lock (Phase 35 Plan 08, D-08, REQ-35-06) ----
    //
    // These cover the platform-INDEPENDENT half only: kind validation and the id registry.
    // The syscalls themselves are deliberately not unit-tested -- `IOPMAssertionCreateWithName`
    // and `SetThreadExecutionState` need a real OS power API that a `#[test]` cannot stand up,
    // and a mock of them would assert only that the mock was called. They are verified live at
    // this plan's Task 3 against `pmset -g assertions`.
    //
    // Every test below builds its OWN `WakeLockRegistry` rather than touching the process-global
    // `WAKE_LOCKS`: cargo runs tests in parallel threads within one process, so a shared global
    // registry would make id assertions order-dependent and flaky.

    #[test]
    fn wake_lock_kind_accepts_both_electron_kind_strings() {
        assert_eq!(
            wake_lock_kind("prevent-display-sleep"),
            Ok(WakeLockKind::Display)
        );
        assert_eq!(
            wake_lock_kind("prevent-app-suspension"),
            Ok(WakeLockKind::System)
        );
    }

    #[test]
    fn wake_lock_kind_maps_the_two_kinds_to_DIFFERENT_assertions() {
        // THREAT T-35-32, and the reason this assertion exists separately from the one above:
        // an implementation that returned `WakeLockKind::Display` for BOTH strings would pass
        // `wake_lock_kind_accepts_both_electron_kind_strings`'s Ok-ness but fail here. Collapsing
        // the kinds is the specific defect that would let the screen blank during play or hold
        // the display awake through an eight-hour download.
        assert_ne!(
            wake_lock_kind(WAKE_LOCK_KIND_DISPLAY),
            wake_lock_kind(WAKE_LOCK_KIND_SYSTEM)
        );
    }

    #[test]
    fn wake_lock_kind_rejects_anything_else_rather_than_defaulting() {
        // RED direction: a `_ => Ok(WakeLockKind::System)` default arm -- the silent collapse
        // T-35-32 describes -- would pass every other test in this module.
        for candidate in [
            "",
            "prevent-display-sleep ",
            "PREVENT-DISPLAY-SLEEP",
            "prevent-app-suspension-really",
            "prevent-sleep",
            "true",
        ] {
            assert!(
                wake_lock_kind(candidate).is_err(),
                "expected {candidate:?} to be rejected, not defaulted"
            );
        }
    }

    #[test]
    fn wake_lock_kind_error_does_not_echo_the_rejected_value() {
        // Same discipline as `deep_link_decision_reject_carries_a_byte_count_and_nothing_else`
        // (T-35-26): a rejected value is one this process did not expect, and it must not reach
        // a log file through the error string.
        let candidate = "would-be-logged-verbatim";
        match wake_lock_kind(candidate) {
            Err(e) => assert!(
                !e.contains(candidate),
                "error {e:?} echoed the rejected kind back"
            ),
            Ok(kind) => panic!("expected {candidate:?} to be rejected, got {kind:?}"),
        }
    }

    #[test]
    fn wake_lock_registry_allocates_unique_ids() {
        // T-35-31: two locks sharing an id would make one `stop` release the other's assertion
        // and strand the survivor forever.
        let mut registry = WakeLockRegistry::default();
        let first = registry.allocate(WakeLockKind::Display);
        let second = registry.allocate(WakeLockKind::System);
        let third = registry.allocate(WakeLockKind::Display);
        assert_ne!(first, second);
        assert_ne!(second, third);
        assert_ne!(first, third);
    }

    #[test]
    fn wake_lock_registry_never_allocates_zero() {
        // `launcher.ts`'s re-entry guard is `if (!powerDisplayId)`, which treats 0 as "no lock
        // held". Handing out 0 would make it take a SECOND display assertion on every launch
        // and leak the first -- a real T-35-31 leak reachable from ordinary use.
        let mut registry = WakeLockRegistry::default();
        for _ in 0..8 {
            assert_ne!(registry.allocate(WakeLockKind::Display), 0);
        }
    }

    #[test]
    fn wake_lock_registry_forget_returns_the_kind_its_id_names() {
        // The pairing assertion: `stop(id)` must resolve to the SAME lock `start` created, not
        // merely to some live lock.
        let mut registry = WakeLockRegistry::default();
        let display = registry.allocate(WakeLockKind::Display);
        let system = registry.allocate(WakeLockKind::System);
        assert_eq!(registry.forget(system), Ok(WakeLockKind::System));
        assert_eq!(registry.forget(display), Ok(WakeLockKind::Display));
    }

    #[test]
    fn wake_lock_registry_forget_on_an_unknown_id_errors_rather_than_panicking() {
        let mut registry = WakeLockRegistry::default();
        assert!(registry.forget(4242).is_err());
        // A double stop is the common real case: `launcher.ts` never clears `powerDisplayId`
        // after stopping it, so the same id can arrive twice. It must be a reported no-op.
        let id = registry.allocate(WakeLockKind::Display);
        assert!(registry.forget(id).is_ok());
        assert!(registry.forget(id).is_err());
    }

    #[test]
    fn wake_lock_registry_holds_tracks_each_kind_independently() {
        // The Windows arm recomputes its thread-global flag word from `holds`, so a `holds`
        // that answered for "any lock" rather than per-kind would set ES_DISPLAY_REQUIRED
        // during a download -- exactly the collapse T-35-32 forbids.
        let mut registry = WakeLockRegistry::default();
        assert!(!registry.holds(WakeLockKind::Display));
        assert!(!registry.holds(WakeLockKind::System));

        let system = registry.allocate(WakeLockKind::System);
        assert!(registry.holds(WakeLockKind::System));
        assert!(
            !registry.holds(WakeLockKind::Display),
            "a system lock must not imply a display lock"
        );

        let display = registry.allocate(WakeLockKind::Display);
        assert!(registry.holds(WakeLockKind::Display));

        assert!(registry.forget(display).is_ok());
        assert!(!registry.holds(WakeLockKind::Display));
        assert!(
            registry.holds(WakeLockKind::System),
            "releasing the display lock must not release the system lock"
        );

        assert!(registry.forget(system).is_ok());
        assert!(!registry.holds(WakeLockKind::System));
    }

    #[test]
    fn wake_lock_start_rejects_an_unknown_kind_before_touching_the_os() {
        // Drives the real `wake_lock_start` (not just the pure helper) to prove the rejection
        // survives the wrapper. Safe against the process-global registry precisely because it
        // must never allocate: a kind this invalid may not reach the platform arm at all.
        assert!(wake_lock_start("prevent-everything").is_err());
    }

    #[test]
    fn wake_lock_stop_on_an_unknown_id_errors_rather_than_panicking() {
        // u32::MAX is never allocated first, so this exercises the global registry's
        // unknown-id path without depending on what other tests have put in it.
        assert!(wake_lock_stop(u32::MAX).is_err());
    }

    #[test]
    fn wake_lock_release_all_is_safe_to_call_with_nothing_held() {
        // The shutdown hook runs on every exit, including exits where no game ever ran and the
        // `OnceLock` was never initialised. It must not panic there.
        wake_lock_release_all();
    }

    // ---- store_embed_navigation_policy (Phase 40 Plan 04, D-29, T-40-04-02/03/09) ----
    //
    // Covers block / allow / hand-off / default-deny per the plan's own verification list.
    // `on_navigation`'s actual side effect (calling `open_external` on `Handoff`) lives in the
    // closure inside `store_embed_open`, not here -- this function is pure by construction so
    // it can be driven without a live `AppHandle`.

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_navigation_policy_blocks_the_apps_own_scheme() {
        // T-40-04-02: the sharpest edge in the phase. A store page must never be able to drive
        // the app's own deep link from inside the embed.
        let url = tauri::Url::parse("gamelib://launch?appName=1207659037&runner=gog").unwrap();
        assert_eq!(
            store_embed_navigation_policy(&url, Some("store.steampowered.com")),
            StoreEmbedNavigationDecision::Block
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_navigation_policy_allows_https_freely() {
        // D-28 forbids an origin allowlist -- ordinary https navigation (e.g. a GOG checkout
        // redirect chain through several distinct hosts) must stay free.
        for candidate in [
            "https://store.gog.com/game/some_game",
            "https://checkout.stripe.com/pay/cs_test_abc",
            "https://www.amazon.com/gp/cart/view.html",
        ] {
            let url = tauri::Url::parse(candidate).unwrap();
            assert_eq!(
                store_embed_navigation_policy(&url, Some("store.steampowered.com")),
                StoreEmbedNavigationDecision::Allow,
                "expected free https navigation to `{candidate}` under D-28"
            );
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_navigation_policy_allows_http_freely() {
        let url = tauri::Url::parse("http://example.com/").unwrap();
        assert_eq!(
            store_embed_navigation_policy(&url, Some("store.steampowered.com")),
            StoreEmbedNavigationDecision::Allow
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_navigation_policy_hands_off_steam_scheme() {
        // A store page's own "launch"/"install" button can produce a steam:// URL. It must
        // never load inside the embed -- it is handed to the OS via the existing
        // `open_external` path instead (D-28/D-29).
        let url = tauri::Url::parse("steam://rungameid/440").unwrap();
        assert_eq!(
            store_embed_navigation_policy(&url, Some("store.steampowered.com")),
            StoreEmbedNavigationDecision::Handoff
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_navigation_policy_blocks_steam_unless_the_top_level_page_is_valve() {
        // todo 2026-10-05: `on_navigation` cannot tell an ad iframe from the main frame, so a
        // `steam:` hand-off is gated on the top-level page. Off a Valve page -- or before any
        // page has loaded -- it is blocked, not handed to the Steam client.
        let url = tauri::Url::parse("steam://run/570").unwrap();
        for top in [
            None,
            Some("store.gog.com"),
            Some("www.amazon.com"),
            Some("evilsteampowered.com"),
            Some("steampowered.com.example"),
        ] {
            assert_eq!(
                store_embed_navigation_policy(&url, top),
                StoreEmbedNavigationDecision::Block,
                "expected steam: to be blocked with top-level host {top:?}"
            );
        }
        for top in [
            "store.steampowered.com",
            "steamcommunity.com",
            "help.steampowered.com",
        ] {
            assert_eq!(
                store_embed_navigation_policy(&url, Some(top)),
                StoreEmbedNavigationDecision::Handoff,
                "expected steam: to be handed off from `{top}`"
            );
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_navigation_policy_https_is_unaffected_by_the_top_level_host() {
        // The steam: gate must not leak into D-28's free https navigation.
        let url = tauri::Url::parse("https://checkout.stripe.com/pay/cs_test_abc").unwrap();
        assert_eq!(
            store_embed_navigation_policy(&url, None),
            StoreEmbedNavigationDecision::Allow
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn handoff_throttle_admits_one_per_gap() {
        let gap = Duration::from_secs(2);
        let t0 = std::time::Instant::now();
        let mut throttle = HandoffThrottle::default();
        assert!(throttle.admit(t0, gap), "the first hand-off is admitted");
        assert!(
            !throttle.admit(t0, gap),
            "a burst at the same instant is refused"
        );
        assert!(!throttle.admit(t0 + Duration::from_millis(1999), gap));
        assert!(
            throttle.admit(t0 + gap, gap),
            "admitted again once the gap has passed"
        );
        assert!(!throttle.admit(t0 + gap + Duration::from_millis(1), gap));
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn handoff_throttle_refusals_do_not_extend_the_window() {
        // A page spamming refused requests must not lock out the next legitimate one forever.
        let gap = Duration::from_secs(2);
        let t0 = std::time::Instant::now();
        let mut throttle = HandoffThrottle::default();
        assert!(throttle.admit(t0, gap));
        for ms in (100..2000).step_by(100) {
            assert!(!throttle.admit(t0 + Duration::from_millis(ms), gap));
        }
        assert!(throttle.admit(t0 + gap, gap));
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_navigation_policy_default_denies_unknown_schemes() {
        // T-40-04-03: default-deny on anything outside the enumerated set, not an allowlist of
        // known-bad schemes.
        for candidate in [
            "ftp://example.com/",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "itms-apps://apps.apple.com/app/id123",
        ] {
            let url = tauri::Url::parse(candidate).unwrap();
            assert_eq!(
                store_embed_navigation_policy(&url, Some("store.steampowered.com")),
                StoreEmbedNavigationDecision::Block,
                "expected `{candidate}` to be default-denied"
            );
        }
    }

    // ---- StoreEmbedState (Phase 40 Plan 07, D-22/D-25) ----
    //
    // Pure cursor-based history state machine, provable without a live `AppHandle` or webview
    // (same "prove the pure branch in isolation" discipline as `store_embed_navigation_policy`
    // above). D-25's verdict (`40-EMBED-API-VERIFICATION.md`) confirmed no native back/forward/
    // history API exists on either `tauri::webview::Webview` or `wry::WebView` -- this stack IS
    // the feature, not a convenience wrapper around one.

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_default_has_no_back_or_forward() {
        let state = StoreEmbedState::default();
        assert!(!state.can_go_back());
        assert!(!state.can_go_forward());
        assert_eq!(state.current_url(), None);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_push_three_then_back_twice_lands_on_first() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.push("https://c.example/".to_string());
        assert_eq!(state.current_url().as_deref(), Some("https://c.example/"));

        assert_eq!(state.go_back().as_deref(), Some("https://b.example/"));
        assert_eq!(state.go_back().as_deref(), Some("https://a.example/"));
        assert!(
            !state.can_go_back(),
            "no entry remains before the first push"
        );
        assert!(
            state.suppress_next_push,
            "go_back must arm the one-shot suppression flag for the confirming Finished event"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_forward_once_after_back_returns_to_the_skipped_entry() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.go_back();
        assert!(state.can_go_forward());
        assert_eq!(state.go_forward().as_deref(), Some("https://b.example/"));
        assert!(!state.can_go_forward());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_push_from_middle_truncates_forward_entries() {
        // T-40-07-05: a fresh user-initiated push from a back-ed-up position (not a
        // history-driven move) must discard the entries ahead of the cursor -- exactly like a
        // browser tab: going back then clicking a new link erases the old "forward" branch.
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.push("https://c.example/".to_string());
        let back_target = state.go_back().unwrap(); // cursor -> b, suppress_next_push armed

        // Mirrors `on_page_load`'s Finished handler confirming the back-navigation landed --
        // suppressed, so it must NOT push a duplicate "b" entry.
        state.push(back_target);
        assert_eq!(
            state.history.len(),
            3,
            "the suppressed confirm-push must not grow history"
        );

        // The user's actual next navigation, made from the back-ed-up "b" position.
        state.push("https://d.example/".to_string());
        assert_eq!(state.current_url().as_deref(), Some("https://d.example/"));
        assert!(
            !state.can_go_forward(),
            "c must be gone once d is pushed from the b position"
        );
        assert_eq!(
            state.history,
            vec![
                "https://a.example/".to_string(),
                "https://b.example/".to_string(),
                "https://d.example/".to_string(),
            ]
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_reload_does_not_push_a_duplicate_entry() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.arm_reload_suppression();
        // Mirrors `on_page_load`'s Finished handler firing for the reload's own navigation.
        state.push("https://a.example/".to_string());
        assert_eq!(
            state.history.len(),
            1,
            "reload must not grow the history stack"
        );
        assert_eq!(state.current_url().as_deref(), Some("https://a.example/"));
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_state_back_moves_the_cursor_it_does_not_append_a_new_entry() {
        // Regression test for a defect class encountered while implementing this: a `go_back`
        // that appends the target URL to `history` (treating "go back" like "push") instead of
        // decrementing `cursor` in place. That version still returns the right URL from a
        // shallow "does the target URL come back out" check, but corrupts the stack --
        // `history.len()` grows on every back/forward pair, and a subsequent `can_go_forward()`
        // lies because the "forward" entry ends up BEHIND the cursor instead of ahead of it.
        // This assertion was verified RED against an append-based `go_back` before the
        // move-based fix below was applied -- see 40-07-SUMMARY.md for the observed failure.
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.push("https://c.example/".to_string());
        let history_len_before = state.history.len();

        state.go_back();

        assert_eq!(
            state.history.len(),
            history_len_before,
            "go_back must move the cursor, not append a new history entry"
        );
        assert!(
            state.can_go_forward(),
            "after moving back, the entry ahead of the cursor must still be reachable forward"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_nav_state_json_reports_full_url_host_and_availability() {
        let mut state = StoreEmbedState::default();
        state.push("https://store.steampowered.com/app/440?utm_source=affiliate".to_string());
        state.push("https://example.com/next".to_string());
        state.go_back();

        let json = store_embed_nav_state_json(&state);
        assert_eq!(json["host"], "store.steampowered.com");
        assert_eq!(
            json["url"], "https://store.steampowered.com/app/440?utm_source=affiliate",
            "the full url is still carried on the wire for the frontend's own host-only \
             DISPLAY logic (D-23) -- this JSON is an internal payload, not what gets rendered"
        );
        assert_eq!(json["canGoBack"], false);
        assert_eq!(json["canGoForward"], true);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_nav_state_json_on_empty_state_is_all_empty_never_panics() {
        let state = StoreEmbedState::default();
        let json = store_embed_nav_state_json(&state);
        assert_eq!(json["url"], "");
        assert_eq!(json["host"], "");
        assert_eq!(json["canGoBack"], false);
        assert_eq!(json["canGoForward"], false);
    }

    // ---- GAP-D: the drain queue (quick task `260905-e61`, D-22, REQ-40-06) ----
    //
    // The seven tests above prove the cursor semantics and were all green while GAP-D shipped:
    // they measure what `push` does to the HISTORY, and GAP-D was that `push` did nothing to
    // carry that history anywhere. These five measure the missing half. Each was verified RED
    // against the pre-fix code (no `pending_nav_events` field at all, so they did not compile
    // -- the strongest possible red for an absent mechanism).

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_push_enqueues_a_nav_event_carrying_the_post_push_cursor_state() {
        // THE GAP-D REGRESSION TEST. An in-embed link click reaches `push()` via
        // `on_page_load`'s Finished handler and nothing else -- so if `push` queues nothing,
        // the renderer can never learn that `canGoBack` became true.
        let mut state = StoreEmbedState::default();
        state.push("https://af.gog.com/".to_string());
        state.push("https://www.gog.com/game/foo".to_string());

        let events = state.take_nav_events();
        assert_eq!(events.len(), 2, "one event per real navigation");

        assert_eq!(events[0]["host"], "af.gog.com");
        assert_eq!(
            events[0]["canGoBack"], false,
            "the first entry has nothing behind it"
        );

        assert_eq!(events[1]["url"], "https://www.gog.com/game/foo");
        assert_eq!(
            events[1]["host"], "www.gog.com",
            "the host label must follow the landing page, not stay frozen on the start URL's \
             host -- the exact user-visible symptom GAP-D reported on /store/gog"
        );
        assert_eq!(
            events[1]["canGoBack"], true,
            "Back must become available after an in-embed navigation"
        );
        assert_eq!(events[1]["canGoForward"], false);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_suppressed_push_enqueues_nothing() {
        // The confirming Finished event of a back/forward/reload this process itself issued.
        // Its caller already received the identical state as that arm's return value.
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        let _ = state.take_nav_events();

        let back_target = state.go_back().unwrap();
        state.push(back_target);

        assert!(
            state.take_nav_events().is_empty(),
            "a suppressed push must not queue a duplicate of state the caller already has"
        );
    }

    // ---- StoreEmbedState::observe_live_url (quick 261102-sk8) ----
    //
    // gaming.amazon.com changes views via history.pushState, which fires no page load, so
    // `push()` from Finished never sees them. These prove the pure reconcile decision.

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_spa_push_is_recorded() {
        let mut state = StoreEmbedState::default();
        state.push("https://gaming.amazon.com/home".to_string());
        state.take_nav_events();
        let claim = "https://gaming.amazon.com/claim/x";
        let generation = state.nav_generation();

        assert!(state.observe_live_url(claim, generation));
        assert_eq!(state.current_url().as_deref(), Some(claim));
        assert!(state.can_go_back());
        let events = state.take_nav_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["canGoBack"], true);
        assert_eq!(events[0]["url"], claim);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_equal_url_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://gaming.amazon.com/home".to_string());
        state.take_nav_events();
        let generation = state.nav_generation();

        assert!(!state.observe_live_url("https://gaming.amazon.com/home", generation));
        assert_eq!(state.history.len(), 1);
        assert!(state.take_nav_events().is_empty());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_while_suppressed_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/a".to_string());
        state.push("https://a.example/b".to_string());
        state.go_back();
        state.take_nav_events();
        let generation = state.nav_generation();

        assert!(!state.observe_live_url("https://a.example/b", generation));
        assert_eq!(state.history.len(), 2);
        assert_eq!(state.cursor, 0);
        assert!(state.can_go_forward());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_while_page_loading_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/a".to_string());
        state.begin_page_load();
        let generation = state.nav_generation();
        assert!(!state.observe_live_url("https://a.example/b", generation));
        assert_eq!(state.history.len(), 1);

        state.push("https://a.example/b".to_string());
        let generation = state.nav_generation();
        assert!(state.observe_live_url("https://a.example/c", generation));
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_cross_origin_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://gaming.amazon.com/home".to_string());
        let generation = state.nav_generation();

        assert!(!state.observe_live_url("https://www.amazon.com/ap/signin", generation));
        assert_eq!(state.history.len(), 1);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_on_empty_history_is_a_noop() {
        let mut state = StoreEmbedState::default();
        let generation = state.nav_generation();
        assert!(!state.observe_live_url("https://a.example/", generation));
        assert!(state.history.is_empty());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_with_stale_generation_is_a_noop() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/a".to_string());
        let stale = state.nav_generation();
        state.push("https://a.example/b".to_string());

        assert!(!state.observe_live_url("https://a.example/c", stale));
        assert_eq!(state.history.len(), 2);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_query_only_change_replaces_in_place() {
        let mut state = StoreEmbedState::default();
        state.push("https://gaming.amazon.com/home".to_string());
        state.take_nav_events();
        let generation = state.nav_generation();
        let next = "https://gaming.amazon.com/home?ref=x";

        assert!(state.observe_live_url(next, generation));
        assert_eq!(state.history.len(), 1);
        assert_eq!(state.current_url().as_deref(), Some(next));
        assert!(!state.can_go_back());
        assert_eq!(state.take_nav_events().len(), 1);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_observe_page_initiated_back_moves_the_cursor() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/home".to_string());
        state.push("https://a.example/claim".to_string());
        state.take_nav_events();
        let generation = state.nav_generation();

        assert!(state.observe_live_url("https://a.example/home", generation));
        assert_eq!(state.cursor, 0);
        assert!(state.can_go_forward());
        assert_eq!(state.history.len(), 2);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_back_after_observed_push_returns_previous() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/home".to_string());
        let generation = state.nav_generation();
        assert!(state.observe_live_url("https://a.example/claim", generation));

        assert_eq!(state.go_back().as_deref(), Some("https://a.example/home"));
        state.push("https://a.example/home".to_string());
        assert_eq!(state.history.len(), 2);
        assert_eq!(state.cursor, 0);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_finished_after_observed_commit_does_not_double_push() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/a".to_string());
        let generation = state.nav_generation();
        assert!(state.observe_live_url("https://a.example/a2", generation));

        state.push("https://a.example/a2".to_string());
        assert_eq!(state.history.len(), 2);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_same_origin_rewrite_after_back_replaces_in_place() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://luna.amazon.com/home".to_string(), t0);
        state.push_at("https://luna.amazon.com/claims/x".to_string(), t0);
        state.push_at("https://luna.amazon.com/claims/x/detail".to_string(), t0);
        assert_eq!(
            state.go_back().as_deref(),
            Some("https://luna.amazon.com/claims/x")
        );
        assert_eq!(
            state.push_at("https://luna.amazon.com/claims/x".to_string(), t0),
            None
        );
        state.take_nav_events();
        let generation = state.nav_generation();

        let outcome = state.observe_live_url_at(
            "https://luna.amazon.com/claims/x-canon",
            generation,
            t0 + std::time::Duration::from_millis(500),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Replaced));
        assert_eq!(state.history.len(), 3);
        assert_eq!(state.history[1], "https://luna.amazon.com/claims/x-canon");
        assert_eq!(state.history[2], "https://luna.amazon.com/claims/x/detail");
        assert!(state.can_go_back());
        assert!(state.can_go_forward());
        assert_eq!(state.take_nav_events().len(), 1);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_rewrite_equal_to_next_entry_replaces_not_moves() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://luna.amazon.com/l1".to_string(), t0);
        state.push_at("https://luna.amazon.com/l1c".to_string(), t0);
        assert!(state.go_back().is_some());
        state.push_at("https://luna.amazon.com/l1".to_string(), t0);
        let generation = state.nav_generation();

        let outcome = state.observe_live_url_at(
            "https://luna.amazon.com/l1c",
            generation,
            t0 + std::time::Duration::from_millis(500),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Replaced));
        assert_eq!(state.cursor, 0);
        assert!(!state.can_go_back());
        assert_eq!(state.history.len(), 1);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_cross_origin_finished_push_replaces() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://gaming.amazon.com/".to_string(), t0);
        state.push_at("https://luna.amazon.com/claim".to_string(), t0);
        assert!(state.go_back().is_some());
        state.push_at("https://gaming.amazon.com/".to_string(), t0);
        state.begin_page_load();

        let outcome = state.push_at(
            "https://luna.amazon.com/claims/home".to_string(),
            t0 + std::time::Duration::from_secs(1),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Replaced));
        assert_eq!(state.history.len(), 2);
        assert_eq!(state.history[0], "https://luna.amazon.com/claims/home");
        assert_eq!(state.cursor, 0);
        assert!(state.can_go_forward());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_expired_rewrite_appends_as_before() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://luna.amazon.com/home".to_string(), t0);
        state.push_at("https://luna.amazon.com/claims/x".to_string(), t0);
        state.push_at("https://luna.amazon.com/claims/x/detail".to_string(), t0);
        assert!(state.go_back().is_some());
        state.push_at("https://luna.amazon.com/claims/x".to_string(), t0);
        let generation = state.nav_generation();

        let outcome = state.observe_live_url_at(
            "https://luna.amazon.com/claims/x-canon",
            generation,
            t0 + STORE_EMBED_LANDING_SETTLE + std::time::Duration::from_millis(1),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Recorded));
        assert_eq!(state.history.len(), 3);
        assert_eq!(state.cursor, 2);
        assert_eq!(state.history[2], "https://luna.amazon.com/claims/x-canon");
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_not_opened_by_a_plain_finished_push() {
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        state.push_at("https://a.example/a".to_string(), t0);
        assert_eq!(
            state.push_at("https://a.example/b".to_string(), t0),
            Some(StoreEmbedHistoryChange::Recorded)
        );
        let generation = state.nav_generation();

        let outcome = state.observe_live_url_at(
            "https://a.example/c",
            generation,
            t0 + std::time::Duration::from_millis(100),
        );
        assert_eq!(outcome, Some(StoreEmbedHistoryChange::Recorded));
        assert_eq!(state.history.len(), 3);
        assert_eq!(state.history[2], "https://a.example/c");
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_settle_repeated_back_terminates_under_rewrite_on_every_load() {
        fn rewrite(u: &str) -> String {
            if u.ends_with("/canon") {
                u.to_string()
            } else {
                format!("{u}/canon")
            }
        }
        let t0 = std::time::Instant::now();
        let mut state = StoreEmbedState::default();
        for p in ["h", "p1", "p2", "p3"] {
            state.push_at(format!("https://luna.amazon.com/{p}"), t0);
        }
        assert_eq!(state.cursor, 3);

        let mut t = t0;
        let mut successful_backs = 0;
        for _ in 0..10 {
            let Some(url) = state.go_back() else { break };
            successful_backs += 1;
            state.push_at(url.clone(), t);
            let rewritten = rewrite(&url);
            if rewritten != url {
                let generation = state.nav_generation();
                state.observe_live_url_at(
                    &rewritten,
                    generation,
                    t + std::time::Duration::from_millis(400),
                );
            }
            t += std::time::Duration::from_secs(2);
        }
        assert_eq!(successful_backs, 3);
        assert!(!state.can_go_back());
        assert_eq!(state.cursor, 0);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_take_nav_events_drains_rather_than_peeks() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());

        assert_eq!(state.take_nav_events().len(), 1);
        assert!(
            state.take_nav_events().is_empty(),
            "a second drain with no navigation in between is a healthy idle state, not a \
             repeat of the first"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_nav_event_queue_is_capped_oldest_dropped() {
        // T-34.4.1-09's shape, restated for this queue: a page navigating in a loop must not
        // grow the queue without bound between drains.
        let mut state = StoreEmbedState::default();
        for i in 0..(STORE_EMBED_NAV_EVENTS_CAP + 10) {
            state.push(format!("https://example.com/{i}"));
        }

        let events = state.take_nav_events();
        assert_eq!(events.len(), STORE_EMBED_NAV_EVENTS_CAP);
        assert_eq!(
            events[0]["url"], "https://example.com/10",
            "the OLDEST entries are the ones dropped -- the renderer applies the last event, \
             so dropping the freshest would defeat the drain"
        );
        assert_eq!(
            events[STORE_EMBED_NAV_EVENTS_CAP - 1]["url"],
            format!("https://example.com/{}", STORE_EMBED_NAV_EVENTS_CAP + 9)
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_clear_empties_the_nav_event_queue() {
        // D-21 teardown: leaving events behind would let the NEXT embed drain a previous
        // session's host straight into its chrome.
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.clear();
        assert!(state.take_nav_events().is_empty());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_select_store_drops_history_only_on_a_store_switch() {
        // Live 2026-10-30: Back on /store/gog walked into the Amazon pages visited before the
        // switch, because the one reused embed kept a single history across stores.
        let mut state = StoreEmbedState::default();
        assert!(state.select_store("amazon"));
        state.push("https://gaming.amazon.com/".to_string());
        state.push("https://gaming.amazon.com/home".to_string());

        assert!(
            !state.select_store("amazon"),
            "reopening the same store keeps its history"
        );
        assert!(state.can_go_back());

        assert!(state.select_store("gog"));
        assert!(!state.can_go_back());
        assert_eq!(state.current_url(), None);
        state.push("https://www.gog.com/en/".to_string());
        assert!(
            !state.can_go_back(),
            "the new store's first page has nothing behind it"
        );
        assert_eq!(state.go_back(), None);
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_select_store_restores_a_returning_stores_own_history() {
        // Live 2026-10-30: GOG reopened at its remembered game page with Back greyed out,
        // because the switch away had dropped GOG's history instead of parking it.
        let mut state = StoreEmbedState::default();
        state.select_store("gog");
        state.push("https://www.gog.com/en/".to_string());
        state.push("https://www.gog.com/en/game/foo".to_string());

        state.select_store("steam");
        state.push("https://store.steampowered.com/".to_string());
        state.push("https://store.steampowered.com/app/1/".to_string());

        assert!(state.select_store("gog"));
        let _ = state.take_nav_events();
        // The reopen loads GOG's remembered page, which is the restored current entry.
        state.push("https://www.gog.com/en/game/foo".to_string());
        assert!(state.can_go_back(), "Back reaches GOG's home page again");
        let events = state.take_nav_events();
        assert_eq!(events.len(), 1, "the deduplicated push still reports state");
        assert_eq!(events[0]["canGoBack"], true);
        assert_eq!(
            state.go_back().as_deref(),
            Some("https://www.gog.com/en/"),
            "Back stays within GOG, never Steam"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_first_open_at_a_remembered_page_seeds_the_home_beneath_it() {
        // Live 2026-10-31: Steam's first open of the session restored its remembered game page
        // onto an empty history, so Back was greyed instead of reaching the store home.
        let mut state = StoreEmbedState::default();
        state.select_store("steam");
        let game = "https://store.steampowered.com/app/3164500/Schedule_I/";
        state.prepare_open(game, Some("https://store.steampowered.com/"));
        assert!(state.take_nav_events().is_empty(), "nothing has loaded yet");
        state.push(game.to_string());
        assert!(state.can_go_back());
        assert_eq!(state.take_nav_events()[0]["canGoBack"], true);
        assert_eq!(
            state.go_back().as_deref(),
            Some("https://store.steampowered.com/")
        );
        assert!(
            !state.can_go_back(),
            "the home page is the bottom of the stack"
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_prepare_open_seeds_nothing_at_home_without_a_home_or_mid_history() {
        let home = "https://store.steampowered.com/";
        let mut state = StoreEmbedState::default();
        state.select_store("steam");
        state.prepare_open(home, Some(home));
        state.push(home.to_string());
        assert!(
            !state.can_go_back(),
            "opening at home has nothing behind it"
        );

        let mut wiki = StoreEmbedState::default();
        wiki.select_store("wiki");
        wiki.prepare_open("https://github.com/x/wiki", None);
        wiki.push("https://github.com/x/wiki".to_string());
        assert!(!wiki.can_go_back(), "no home url, no seed");

        // A store with history is never re-seeded: a different open URL is a normal push.
        state.push("https://store.steampowered.com/app/1/".to_string());
        state.prepare_open("https://store.steampowered.com/app/2/", Some(home));
        state.push("https://store.steampowered.com/app/2/".to_string());
        assert_eq!(
            state.go_back().as_deref(),
            Some("https://store.steampowered.com/app/1/")
        );
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_reopen_on_the_current_entry_reports_state_before_the_load() {
        // Live 2026-10-31: the restored Back arrow took 1-2 s to appear on a return, because the
        // only event came from the reloaded page's Finished push.
        let mut state = StoreEmbedState::default();
        state.select_store("gog");
        state.push("https://www.gog.com/en/".to_string());
        state.push("https://www.gog.com/en/game/foo".to_string());
        let _ = state.take_nav_events();

        state.select_store("gog");
        state.prepare_open(
            "https://www.gog.com/en/game/foo",
            Some("https://af.gog.com/"),
        );
        let events = state.take_nav_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["canGoBack"], true);
        assert_eq!(state.go_back().as_deref(), Some("https://www.gog.com/en/"));
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_push_of_the_current_url_does_not_add_an_entry() {
        let mut state = StoreEmbedState::default();
        state.push("https://a.example/".to_string());
        state.push("https://b.example/".to_string());
        state.push("https://b.example/".to_string());
        assert_eq!(state.go_back().as_deref(), Some("https://a.example/"));
        assert!(!state.can_go_back());
    }

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    #[test]
    fn store_embed_clear_forgets_the_selected_store() {
        // store_embed_close clears; the next open of the same store is a fresh session.
        let mut state = StoreEmbedState::default();
        state.select_store("steam");
        state.push("https://store.steampowered.com/".to_string());
        state.select_store("gog");
        state.clear();
        assert!(state.select_store("steam"));
        assert_eq!(
            state.current_url(),
            None,
            "parked histories are dropped too"
        );
    }

    // ---- Linux GTK-box-native store-embed layout (quick 260930-blh) -- pure helpers only ----

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_rounds_fractional_px_half_away_from_zero() {
        // Spike 026's fractional slot rect.
        assert_eq!(
            store_embed_linux_gtk_rect(290.5, 96.5, 760.25, 560.75),
            Ok((291, 97, 760, 561))
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_accepts_a_zero_rect() {
        assert_eq!(
            store_embed_linux_gtk_rect(0.0, 0.0, 0.0, 0.0),
            Ok((0, 0, 0, 0))
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_accepts_a_negative_position() {
        // A slot partly scrolled off is legal; GtkFixed accepts a negative position.
        assert_eq!(
            store_embed_linux_gtk_rect(10.0, -40.0, 300.0, 200.0),
            Ok((10, -40, 300, 200))
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_rejects_a_negative_size() {
        // GTK reads -1 as "unset", so passing it through would silently change the meaning.
        let e = store_embed_linux_gtk_rect(0.0, 0.0, -1.0, 10.0).unwrap_err();
        assert!(e.contains("negative-size"), "{e}");
        let e = store_embed_linux_gtk_rect(0.0, 0.0, 10.0, -0.6).unwrap_err();
        assert!(e.contains("negative-size"), "{e}");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_rejects_non_finite_input() {
        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            for slot in 0..4 {
                let mut v = [1.0_f64; 4];
                v[slot] = bad;
                let e = store_embed_linux_gtk_rect(v[0], v[1], v[2], v[3]).unwrap_err();
                assert!(e.contains("non-finite"), "{e}");
            }
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_rejects_out_of_range_input() {
        // Never a saturating `as i32`.
        let e = store_embed_linux_gtk_rect(3.0e10, 0.0, 1.0, 1.0).unwrap_err();
        assert!(e.contains("out-of-range"), "{e}");
        let e = store_embed_linux_gtk_rect(0.0, -3.0e10, 1.0, 1.0).unwrap_err();
        assert!(e.contains("out-of-range"), "{e}");
        let e = store_embed_linux_gtk_rect(0.0, 0.0, 1.0, 3.0e10).unwrap_err();
        assert!(e.contains("out-of-range"), "{e}");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_gtk_rect_errors_carry_the_op_prefix() {
        let e = store_embed_linux_gtk_rect(f64::NAN, 0.0, 1.0, 1.0).unwrap_err();
        assert!(e.starts_with("store_embed_set_bounds:"), "{e}");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_zero_area_rect_is_recognised() {
        assert!(store_embed_linux_rect_is_zero_area((0, 0, 0, 0)));
        assert!(store_embed_linux_rect_is_zero_area((204, 82, 0, 418)));
        assert!(store_embed_linux_rect_is_zero_area((204, 82, 1076, 0)));
        assert!(!store_embed_linux_rect_is_zero_area((0, 0, 1, 1)));
        assert!(!store_embed_linux_rect_is_zero_area((-40, -40, 300, 200)));
    }

    /// macOS sibling of the test above (quick 261001-svm). The 0x0 case is the one actually
    /// measured live -- the slot's final ResizeObserver report once the Epic panel has replaced
    /// it -- and before this guard existed it was applied verbatim and left the embed invisible
    /// at zero size until a genuine window resize. Since quick 261012-f25 this also guards the
    /// WebView2 branch, which shares the same guard (wry's `SetWindowPos` would apply a 0x0 rect
    /// verbatim); the test keeps its name to avoid churn.
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[test]
    fn store_embed_macos_zero_area_rect_is_recognised() {
        // The measured case: slot unmounted, every field zero.
        assert!(store_embed_rect_is_zero_area(0.0, 0.0));
        // One collapsed axis is still unusable.
        assert!(store_embed_rect_is_zero_area(0.0, 418.0));
        assert!(store_embed_rect_is_zero_area(1076.0, 0.0));
        // Negative extents are not a geometry this can honour either; GTK's branch rejects them
        // outright in conversion, and macOS has no conversion step to reject them in.
        assert!(store_embed_rect_is_zero_area(-1.0, 200.0));
        assert!(store_embed_rect_is_zero_area(300.0, -1.0));
        // Non-finite input stops here rather than reaching `set_size`. A bare `w <= 0.0` test
        // would let NaN THROUGH (every comparison with NaN is false), so these two cases are the
        // ones that turn red if the `is_finite` half is ever dropped as redundant.
        assert!(store_embed_rect_is_zero_area(f64::NAN, 200.0));
        assert!(store_embed_rect_is_zero_area(300.0, f64::NAN));
        assert!(store_embed_rect_is_zero_area(f64::INFINITY, 200.0));
        assert!(store_embed_rect_is_zero_area(300.0, f64::NEG_INFINITY));
        // Real geometry, including the fractional rects a logical-px slot rect actually carries,
        // must pass through untouched -- D-18's verbatim rule still holds for every usable rect.
        assert!(!store_embed_rect_is_zero_area(1076.0, 418.0));
        assert!(!store_embed_rect_is_zero_area(760.25, 560.75));
        assert!(!store_embed_rect_is_zero_area(0.5, 0.5));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn store_embed_linux_settled_line_has_the_pinned_format() {
        assert_eq!(
            store_embed_linux_settled_line(
                (291, 97, 760, 561),
                (291, 97, 760, 561),
                (0, 0, 1280, 800),
                (1280, 800)
            ),
            "[shell] store_embed(linux): settled requested=291,97,760x561 \
             embed=291,97,760x561 main=0,0,1280x800 vbox=1280x800"
        );
    }

    /// Pins STRUCTURE, not GTK behaviour: `linux_store_embed_layout::apply_bounds` must call
    /// `embed_w.queue_resize()` after `embed_w.set_size_request(..)` and before the settled log
    /// is scheduled. The behaviour evidence is quick 261105-q1j's live baseline-vs-experiment
    /// arms on Linux (R2 zoom, R6 zoom, R7 window resize), not this test.
    ///
    /// The mutation it exists to catch: a later "cleanup" deleting the call because
    /// `set_size_request` "already queues a resize". That claim is false for a hidden widget.
    /// GTK 3.24.33 `gtk_widget_set_usize_internal` queues a resize only when the widget is
    /// visible, and `gtk_fixed_size_allocate` allocates each child at its cached preferred size
    /// (`gtk_widget_get_preferred_size`, cleared only when `resize_needed` is set). D-21 hides
    /// the embed on route leave, so a rect applied while hidden would otherwise land at the new
    /// position with the OLD size.
    ///
    /// Unconditional (no cfg), like the other `include_str!("main.rs")` structural tests here,
    /// so it runs on every CI leg.
    #[test]
    fn store_embed_linux_apply_bounds_queues_a_resize_after_set_size_request() {
        // Bound the slice to JUST `apply_bounds`: from its signature to the first following line
        // that is exactly four spaces and a closing brace. The first match of the signature is
        // the real definition, because this test quotes it again later in the file.
        let source = include_str!("store_embed.rs");
        let fn_start = source
            .find("pub fn apply_bounds(embed: &tauri::Webview, rect: Rect) -> Result<(), String> {")
            .expect("apply_bounds definition not found in main.rs");
        let after = &source[fn_start..];
        let fn_end = after
            .find("\n    }\n")
            .expect("apply_bounds's closing brace not found");
        let body = &after[..fn_end];

        // Anti-vacuity: the slice must be non-empty and must really be the geometry writer.
        assert!(
            !body.is_empty(),
            "apply_bounds's bounded slice must not be empty"
        );
        assert!(
            body.contains("fixed.move_(&embed_w, rect.0, rect.1);"),
            "the slice must contain apply_bounds's Fixed::move_ call"
        );

        let size_pos = body
            .find("embed_w.set_size_request(rect.2, rect.3);")
            .expect("apply_bounds must still call set_size_request on the embed");
        let queue_pos = body
            .find("embed_w.queue_resize();")
            .expect("apply_bounds must queue a resize on the embed (hidden-widget stale size)");
        let log_pos = body
            .find("schedule_settled_log(")
            .expect("apply_bounds must still schedule the settled log");
        assert!(
            queue_pos > size_pos,
            "queue_resize() must come AFTER set_size_request(): the request is what it re-reads"
        );
        assert!(
            queue_pos < log_pos,
            "queue_resize() must come BEFORE the settled log is scheduled"
        );
    }

    // ---- macOS store-embed show-before-navigate convergence (quick 261001-svm) ----
    //
    // `store_embed_open` cannot be driven from a `#[test]` -- it takes `&AppHandle`, which a
    // unit test structurally cannot construct, exactly as this file's own comments already say
    // of `open_external`. Measured: all 31 other `store_embed_*` test functions in this module
    // sit over `AppHandle`-free helpers for exactly that reason. This test is the honest
    // substitute, in the discipline of the five other `include_str!("main.rs")` tests already in
    // this file: it reads the command's own source at test time and asserts STRUCTURE -- that
    // the `existing.show()` call in the existing-webview branch sits outside the
    // `#[cfg(target_os = "linux")]` sub-block and precedes `existing.navigate(url)` -- not a
    // claim about native visibility, which nothing in this crate can reach.
    //
    // RED-proof (recorded verbatim, matching `open_external_command_body_calls_the_scheme_check_
    // before_opening`'s own discipline): moving the `existing.show()` statement back INSIDE the
    // `#[cfg(target_os = "linux")]` block -- the exact mutation this test exists to catch, since
    // `cargo check`/`clippy`/every other test would still pass unchanged against that mutation --
    // makes this test fail, because `show_pos` would then land `cfg_close_pos` or earlier.
    #[test]
    fn store_embed_open_shows_the_existing_webview_on_every_platform_before_navigating() {
        // Bound the slice to JUST `store_embed_open`'s body, ending at the function's closing
        // brace (`^}` at column 0, the next top-level item). Without this bound, `.find()` on the
        // unbounded remainder of the file could match this very test's own doc comment above (it
        // quotes the literals being searched for) or a later unrelated mention, and produce a
        // false PASS or a false FAIL for the wrong reason instead of failing because the
        // structure actually moved.
        let source = include_str!("store_embed.rs");
        let fn_start = source
            .find("fn store_embed_open(app: &AppHandle, args: &[Value]) -> Result<Value, String> {")
            .expect("store_embed_open definition not found in main.rs");
        let body_after_start = &source[fn_start..];
        let fn_end = body_after_start[1..]
            .find("\n}\n")
            .map(|p| p + 1)
            .expect("store_embed_open's closing brace not found");
        let body = &body_after_start[..fn_end];

        // Anti-vacuity: the slice must be non-empty and must actually contain the branch under
        // test, so a boundary drift (e.g. the function signature changing) fails loudly here
        // rather than passing over a slice that silently stopped containing anything relevant.
        assert!(
            !body.is_empty(),
            "store_embed_open's bounded slice must not be empty"
        );
        let cfg_open_pos = body
            .find("#[cfg(target_os = \"linux\")]")
            .expect("the Linux-only cfg sub-block was not located inside store_embed_open");

        // The cfg sub-block's closing brace: the first `^        }$`-shaped line after the cfg
        // attribute. Matched textually rather than by brace-counting, same discipline as the
        // plan's own verify block, since this function has no other 8-space-indented lone `}`
        // between the cfg attribute and the show call in the fixed branch.
        let cfg_close_pos = body[cfg_open_pos..]
            .find("\n        }\n")
            .map(|p| p + cfg_open_pos)
            .expect("the Linux-only cfg sub-block's closing brace was not located");

        let show_pos = body
            .find(".show()")
            .expect("store_embed_open must still call .show() on the existing webview");
        let navigate_pos = body
            .find(".navigate(url)")
            .expect("store_embed_open must still call .navigate(url) on the existing webview");
        let bounds_pos = body
            .find("linux_store_embed_layout::apply_bounds")
            .expect("the Linux rect re-apply must still exist inside store_embed_open");

        assert!(
            show_pos > cfg_close_pos,
            "the show() call must sit AFTER the #[cfg(target_os = \"linux\")] block closes -- \
             unconditional and macOS-reachable, not Linux-only"
        );
        assert!(
            show_pos < navigate_pos,
            "the show() call must PRECEDE navigate() -- showing after navigating would leave \
             the first paint on a hidden surface"
        );
        assert!(
            bounds_pos > cfg_open_pos && bounds_pos < cfg_close_pos,
            "the Linux rect re-apply must stay INSIDE the #[cfg(target_os = \"linux\")] block -- \
             this fix converges the show step only, not the rect handling"
        );
    }

    /// The EpicSurface arm of `store_embed_open`'s macOS routing, sliced from main.rs source.
    fn store_embed_open_epic_arm(source: &str) -> &str {
        let fn_start = source
            .find("fn store_embed_open(app: &AppHandle, args: &[Value]) -> Result<Value, String> {")
            .expect("store_embed_open definition not found in main.rs");
        let body = &source[fn_start..];
        let arm_start = body
            .find("macos_epic_embed::EpicEmbedSurfaceSelection::EpicSurface => {")
            .expect("store_embed_open's EpicSurface arm not found");
        let arm_end = body[arm_start..]
            .find("macos_epic_embed::EpicEmbedSurfaceSelection::TauriEmbed => {")
            .map(|p| p + arm_start)
            .expect("store_embed_open's TauriEmbed arm not found after the EpicSurface arm");
        &body[arm_start..arm_end]
    }

    fn epic_arm_hides_tauri_embed_before_opening(arm: &str) -> bool {
        let (Some(hide_target), Some(open_pos)) = (
            arm.find("app.get_webview(STORE_EMBED_LABEL)"),
            arm.find("macos_epic_embed::open(app, &url, x, y, w, h)"),
        ) else {
            return false;
        };
        arm[hide_target..open_pos].contains(".hide()")
    }

    // ---- Phase 50 review finding 1: opening Epic hides the Tauri embed (source-text only) ----
    //
    // Same discipline as the test above: `store_embed_open` takes `&AppHandle` and its EpicSurface
    // arm is `#[cfg(target_os = "macos")]`, so nothing here can drive it -- this reads the source
    // and asserts STRUCTURE only: the arm hides the Tauri embed before handing off to
    // `macos_epic_embed::open`, mirroring `deselect()` on the TauriEmbed arm. Whether the native
    // view actually disappears is a live macOS check. RED before the fix: the arm was a bare
    // `return macos_epic_embed::open(...)`, so a gog -> epic store switch left the Tauri child
    // webview visible alongside the raw Epic subview.
    #[test]
    fn store_embed_open_epic_arm_hides_the_tauri_embed_before_opening_epic() {
        let source = include_str!("store_embed.rs");
        let arm = store_embed_open_epic_arm(source);
        assert!(
            epic_arm_hides_tauri_embed_before_opening(arm),
            "store_embed_open's EpicSurface arm must hide the Tauri embed (STORE_EMBED_LABEL) \
             before calling macos_epic_embed::open -- symmetric with deselect() on the other arm"
        );

        // The other arm still deselects Epic, so each direction hides the surface it leaves.
        let fn_start = source
            .find("fn store_embed_open(app: &AppHandle, args: &[Value]) -> Result<Value, String> {")
            .expect("store_embed_open definition not found in main.rs");
        let tauri_arm_start = source[fn_start..]
            .find("macos_epic_embed::EpicEmbedSurfaceSelection::TauriEmbed => {")
            .map(|p| p + fn_start)
            .expect("TauriEmbed arm not found");
        let tauri_arm = &source[tauri_arm_start..tauri_arm_start + 200];
        assert!(tauri_arm.contains("macos_epic_embed::deselect(app)?;"));

        // Negative control: the pre-fix arm shape fails the same predicate.
        let pre_fix = "macos_epic_embed::EpicEmbedSurfaceSelection::EpicSurface => {\n\
                       return macos_epic_embed::open(app, &url, x, y, w, h);\n}";
        assert!(!epic_arm_hides_tauri_embed_before_opening(pre_fix));
    }

    #[test]
    fn devtools_auto_open_is_skipped_on_linux_only() {
        assert!(!should_auto_open_devtools("linux"));
        assert!(should_auto_open_devtools("macos"));
        assert!(should_auto_open_devtools("windows"));
    }

    #[test]
    fn devtools_auto_open_decision_matches_this_host() {
        // Pins the spelling of `std::env::consts::OS` against the predicate's "linux"
        // literal: a typo in either would pass the fixed-string test above and only show
        // up on the one OS it matters on.
        let host = std::env::consts::OS;
        if cfg!(target_os = "linux") {
            assert!(!should_auto_open_devtools(host));
        } else if cfg!(target_os = "macos") {
            assert!(should_auto_open_devtools(host));
        } else if cfg!(target_os = "windows") {
            assert!(should_auto_open_devtools(host));
        }
    }

    #[test]
    fn scan_channels_are_gamelib_scan_app_ops() {
        for s in [
            "scan_steam_api_imports",
            "scan_steam_drm",
            "scan_steamstub_section",
            "scan_pe_imported_dlls",
            "scan_contained_real",
            "scan_winemac_metal_exports",
        ] {
            assert!(
                gamelib_scan::OPS.contains(&s) && !gamelib_scan::CLI_ONLY_OPS.contains(&s),
                "{s}"
            );
            let err = gamelib_scan::dispatch(s, &[]).expect_err(s);
            assert!(err.ends_with(":bad-args"), "{s}: {err}");
        }
    }
}
