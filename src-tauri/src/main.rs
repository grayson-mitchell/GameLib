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
mod steamfiles_dispatch;
mod depot_dispatch;
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
use steamfiles_dispatch::*;
use depot_dispatch::*;
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

/// Creates the `0700` single-instance socket directory and returns the socket path inside it.
/// Fails open (`None`) when the directory cannot be created.
#[cfg(unix)]
fn prepare_single_instance_socket_path() -> Option<std::path::PathBuf> {
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
}

/// A secondary instance's hand-off to the running primary over the Unix socket, then exit(0).
#[cfg(unix)]
fn hand_off_to_running_instance_unix(path: &std::path::Path, argv: &[String]) -> ! {
    use std::io::Write as _;
    use std::os::unix::net::UnixStream;
    // A bare second launch with no deep link raises the existing window -- the
    // sentinel below -- which is the correct UX and matches what a plugin-based
    // guard would do. Never logs the URL itself here (T-34.5-G6-25): the running
    // instance's own `handleProtocol` logs it authoritatively one line later.
    let (payload, kind) = match protocol_url_arg(argv) {
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

/// What the single-instance guard hands the primary: the listener its accept loop will own.
#[cfg(unix)]
type PrimaryListener = std::os::unix::net::UnixListener;
#[cfg(windows)]
type PrimaryListener = WindowsPrimaryPipe;
#[cfg(not(any(unix, windows)))]
type PrimaryListener = ();

/// `RunEvent::Exit`: cancel depot jobs, reap the sidecar, release power assertions, remove the socket.
fn handle_exit(app_handle: &tauri::AppHandle, single_instance_socket_path: Option<&std::path::Path>) {
    // D-08: cancel every depot job and give finalize (the 1026 record) up to 5 s to
    // land BEFORE the sidecar is killed. Count only; no job detail is logged.
    let still_running = gamelib_depot::registry::cancel_all_and_wait(EXIT_FINALIZE_WAIT);
    if still_running > 0 {
        shell_eprintln!("[shell] depot jobs still running at exit deadline: {still_running}");
    }
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
    if let Some(path) = single_instance_socket_path {
        let _ = std::fs::remove_file(path);
    }
    #[cfg(not(unix))]
    let _ = single_instance_socket_path;
}

/// Spawns the sidecar, wires its reader and stderr forwarder, and returns the shared state.
fn spawn_sidecar_state(app: &tauri::App) -> Result<Arc<SidecarState>, Box<dyn std::error::Error>> {
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
    Ok(state)
}

/// Spawns the primary's deep-link accept loop on the single-instance listener.
fn start_single_instance_accept_loop(
    app: &tauri::App,
    state: &Arc<SidecarState>,
    primary_listener: Option<PrimaryListener>,
) {
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
    let _ = (&primary_listener, app, state);
}

/// Per-platform `gamelib://` scheme registration (Linux `register_all`, Windows self-heal).
fn register_os_deep_link_scheme(app: &tauri::App) {
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

    #[cfg(not(any(target_os = "linux", windows)))]
    let _ = app;
}

/// Registers the sidecar send queue and the sidecar state itself as Tauri managed state.
fn manage_sidecar_state(app: &tauri::App, state: Arc<SidecarState>) {
    let send_state = state.clone();
    app.manage(SidecarSendQueue(spawn_send_writer(move |req| {
        send_state.write_frame(req)
    })));
    app.manage(state);
}

fn apply_start_in_tray(app: &tauri::App, tray_settings: &TraySettingsSnapshot) {
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
}

fn attach_main_window_close_handler(app: &tauri::App, tray_exists: bool) {
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
}

#[cfg(target_os = "macos")]
fn route_macos_quit_paths(app: &tauri::App) {
    // macOS Cmd+Q is not a window close and never reaches the handler above: route it
    // through the same sidecar hand-off by replacing the app menu's predefined Quit.
    #[cfg(target_os = "macos")]
    route_app_menu_quit_through_sidecar(app.handle());

    // Dock Quit sends `terminate:` straight to the app, not through the menu: veto it in
    // `applicationShouldTerminate:` and route it the same way (a power-off still passes).
    #[cfg(target_os = "macos")]
    macos_terminate_veto::install(app.handle());
}

fn attach_main_window_focus_refresh(app: &tauri::App) {
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
}

fn seed_tray_recent_games(max_recent_games: usize) {
    // Seed the recent-games cache before the menu is built, so the section is
    // populated on a COLD start rather than only after the first launch of a session.
    let seeded = load_recent_games_from_disk(max_recent_games);
    shell_eprintln!(
        "[shell] tray recent games: seeded {} entr{} from disk (limit {})",
        seeded.len(),
        if seeded.len() == 1 { "y" } else { "ies" },
        max_recent_games
    );
    match tray_recent_games().lock() {
        Ok(mut guard) => *guard = seeded,
        Err(poisoned) => *poisoned.into_inner() = seeded,
    }
}

fn build_tray_icon(app: &tauri::App, no_tray_icon: bool) {
    // `noTrayIcon` (tray_icon.ts:20's `if (noTrayIcon) return null`). Decided BEFORE
    // the tray is built, so the user never sees an icon they asked not to have.
    if no_tray_icon {
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
}

#[cfg(target_os = "macos")]
fn install_login_sheet_esc_monitor(app: &tauri::App) {
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

fn hide_for_no_gui_or_open_devtools(app: &tauri::App, no_gui: bool) {
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
}

/// The body of `.setup(..)`: each step is a named fn, called in the original order.
fn run_setup(
    app: &mut tauri::App,
    primary_listener: Option<PrimaryListener>,
    no_gui: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // Quick task 261023-vkv: delegate + one-time authorization request for packaged
    // macOS builds (no-op elsewhere); see `macos_notifications`' module doc. Non-blocking.
    #[cfg(target_os = "macos")]
    macos_notifications::init_at_startup();
    // Quick task 261031-mj9: native gamepad reader thread. Non-blocking and infallible
    // (failures are logged inside), since setup must not panic -- see the SIGABRT note below.
    #[cfg(target_os = "macos")]
    macos_native_gamepad::start(app.handle().clone());
    let state = spawn_sidecar_state(app)?;
    start_single_instance_accept_loop(app, &state, primary_listener);
    install_os_deep_link_handler(app, &state);
    register_os_deep_link_scheme(app);
    manage_sidecar_state(app, state);

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
    apply_start_in_tray(app, &tray_settings);

    let tray_exists = !tray_settings.no_tray_icon;
    attach_main_window_close_handler(app, tray_exists);

    #[cfg(target_os = "macos")]
    route_macos_quit_paths(app);

    attach_main_window_focus_refresh(app);

    seed_tray_recent_games(tray_settings.max_recent_games);

    build_tray_icon(app, tray_settings.no_tray_icon);

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

    #[cfg(target_os = "macos")]
    install_login_sheet_esc_monitor(app);

    hide_for_no_gui_or_open_devtools(app, no_gui);
    Ok(())
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
    let single_instance_socket_path_var: Option<std::path::PathBuf> =
        prepare_single_instance_socket_path();
    #[cfg(not(unix))]
    let single_instance_socket_path_var: Option<std::path::PathBuf> = None;

    // `primary_listener` is moved into the `.setup(move |app| ...)` closure below, where it
    // becomes the deep-link accept loop's listener once the sidecar state is live.
    #[cfg(unix)]
    let primary_listener: Option<PrimaryListener> = single_instance_socket_path_var
        .as_deref()
        .and_then(|path| match acquire_single_instance(path) {
            SingleInstanceRole::Secondary => hand_off_to_running_instance_unix(path, &argv),
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
    let primary_listener: Option<PrimaryListener> = match current_user_identity() {
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
    let primary_listener: Option<PrimaryListener> = None;

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
        .setup(move |app| run_setup(app, primary_listener, no_gui))
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
            tauri::RunEvent::Exit => handle_exit(app_handle, single_instance_socket_path_var.as_deref()),
            _ => {}
        });
}

/// OS deep-link delivery: validated URLs go through one worker thread to the sidecar.
fn install_os_deep_link_handler(app: &tauri::App, state: &Arc<SidecarState>) {
    // Stays BELOW `fn main`: the REQ-46-08 gate in tauriShellSource.test.ts pins `.setup(move |app|`
    // before `on_open_url(` in source order.
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
        "login_window/owned_modal.rs",
        "login_window/windows_cdp.rs",
        "login_window/pristine_epic.rs",
        "login_window/sheet.rs",
        "login_window/macos_cookies.rs",
        "notification_show.rs",
        "relay_commands.rs",
        "rust_dispatch.rs",
        "depot_dispatch.rs",
        "scan_dispatch.rs",
        "steamfiles_dispatch.rs",
        "shell_state.rs",
        "shell_open.rs",
        "sidecar.rs",
        "single_instance.rs",
        "single_instance/windows_pipe.rs",
        "single_instance/windows_protocol.rs",
        "store_embed.rs",
        "store_embed/controls.rs",
        "store_embed/layout.rs",
        "store_embed/open.rs",
        "store_embed/policy.rs",
        "store_embed/state.rs",
        "terminate_veto.rs",
        "tray.rs",
        "tray/icon.rs",
        "tray/recent.rs",
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
        include_str!("login_window/owned_modal.rs"),
        include_str!("login_window/windows_cdp.rs"),
        include_str!("login_window/pristine_epic.rs"),
        include_str!("login_window/sheet.rs"),
        include_str!("login_window/macos_cookies.rs"),
        include_str!("notification_show.rs"),
        include_str!("relay_commands.rs"),
        include_str!("rust_dispatch.rs"),
        include_str!("depot_dispatch.rs"),
        include_str!("scan_dispatch.rs"),
        include_str!("steamfiles_dispatch.rs"),
        include_str!("shell_state.rs"),
        include_str!("shell_open.rs"),
        include_str!("sidecar.rs"),
        include_str!("single_instance.rs"),
        include_str!("single_instance/windows_pipe.rs"),
        include_str!("single_instance/windows_protocol.rs"),
        include_str!("store_embed.rs"),
        include_str!("store_embed/controls.rs"),
        include_str!("store_embed/layout.rs"),
        include_str!("store_embed/open.rs"),
        include_str!("store_embed/policy.rs"),
        include_str!("store_embed/state.rs"),
        include_str!("terminate_veto.rs"),
        include_str!("tray.rs"),
        include_str!("tray/icon.rs"),
        include_str!("tray/recent.rs"),
        include_str!("wake_lock.rs"),
        include_str!("wake_lock/linux.rs"),
        include_str!("wake_lock/macos.rs"),
        include_str!("wake_lock/windows.rs"),
    ];

    #[derive(PartialEq, Eq, Debug)]
    enum CfgTest {
        Test,
        Other,
        Ambiguous,
    }

    /// Same rule as the jest `classifyCfgTestAttr`: `Test` = exactly `#[cfg(test)]` or a
    /// `#[cfg(all(..))]` whose top-level arguments include the bare token `test`; `Ambiguous` = any
    /// other `#[cfg(` line mentioning the word `test`; `Other` = anything else.
    fn classify_cfg_test_attr(line: &str) -> CfgTest {
        if !line.starts_with("#[cfg(") {
            return CfgTest::Other;
        }
        if line == "#[cfg(test)]" {
            return CfgTest::Test;
        }
        let mentions_test = line
            .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
            .any(|w| w == "test");
        if !mentions_test {
            return CfgTest::Other;
        }
        let Some(inner) = line.strip_prefix("#[cfg(all(").and_then(|r| r.strip_suffix("))]")) else {
            return CfgTest::Ambiguous;
        };
        let mut args: Vec<String> = Vec::new();
        let (mut depth, mut in_str, mut cur) = (0i32, false, String::new());
        for c in inner.chars() {
            if c == '"' {
                in_str = !in_str;
            }
            if !in_str {
                if c == '(' {
                    depth += 1;
                } else if c == ')' {
                    depth -= 1;
                } else if c == ',' && depth == 0 {
                    args.push(cur.trim().to_string());
                    cur.clear();
                    continue;
                }
            }
            cur.push(c);
        }
        args.push(cur.trim().to_string());
        if args.iter().any(|a| a == "test") {
            CfgTest::Test
        } else {
            CfgTest::Ambiguous
        }
    }

    fn is_mod_open(line: &str) -> bool {
        line.strip_prefix("mod ").is_some_and(|rest| {
            rest.strip_suffix(" {").is_some_and(|ident| {
                !ident.is_empty() && ident.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
            })
        })
    }

    /// Cuts every whole test-gated module block (a column-0 `mod <ident> {` preceded by a contiguous
    /// run of column-0 `#[..]` lines, at least one a recognised test cfg, through the next line that
    /// is exactly `}`; the cut starts at the run's first attribute) and keeps the rest. An unrecognised
    /// `cfg` mentioning `test` panics (fail closed). Same rule as the jest `stripRustTestModules`.
    fn cut_test_modules(src: &str) -> String {
        let lines: Vec<&str> = src.split('\n').collect();
        let mut drop = vec![false; lines.len()];
        let mut i = 0;
        while i < lines.len() {
            if !is_mod_open(lines[i]) {
                i += 1;
                continue;
            }
            let mut start = i;
            while start > 0 && lines[start - 1].starts_with("#[") {
                start -= 1;
            }
            let mut is_test = false;
            for (k, line) in lines.iter().enumerate().take(i).skip(start) {
                match classify_cfg_test_attr(line) {
                    CfgTest::Ambiguous => panic!("ambiguous test cfg at line {}: {}", k + 1, line),
                    CfgTest::Test => is_test = true,
                    CfgTest::Other => {}
                }
            }
            if !is_test {
                i += 1;
                continue;
            }
            let mut end = i + 1;
            while end < lines.len() && lines[end] != "}" {
                end += 1;
            }
            for d in drop.iter_mut().take((end + 1).min(lines.len())).skip(start) {
                *d = true;
            }
            i = end + 1;
        }
        lines
            .iter()
            .zip(drop.iter())
            .filter(|(_, d)| !**d)
            .map(|(l, _)| *l)
            .collect::<Vec<_>>()
            .join("\n")
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
    fn cut_test_modules_cuts_cfg_all_and_stacked_test_mods() {
        let all = "fn a() {}\n#[cfg(all(test, target_os = \"macos\"))]\nmod terminate_reply_tests {\n    fn t() {}\n}\nfn b() {}\n";
        assert_eq!(cut_test_modules(all), "fn a() {}\nfn b() {}\n");
        let stacked = "fn a() {}\n#[cfg(windows)]\n#[allow(dead_code)]\n#[cfg(test)]\nmod w {\n}\nfn b() {}\n";
        assert_eq!(cut_test_modules(stacked), "fn a() {}\nfn b() {}\n");
        let non_test = "#[cfg(windows)]\nmod win {\n}\nfn a() {}\n";
        assert_eq!(cut_test_modules(non_test), non_test);
        assert!(!shell_production_source().contains("mod terminate_reply_tests"));
    }

    #[test]
    #[should_panic(expected = "ambiguous test cfg")]
    fn cut_test_modules_panics_on_cfg_any_test() {
        cut_test_modules("#[cfg(any(test, feature = \"x\"))]\nmod m {\n}\n");
    }

    #[test]
    #[should_panic(expected = "ambiguous test cfg")]
    fn cut_test_modules_panics_on_cfg_not_test() {
        cut_test_modules("#[cfg(not(test))]\nmod m {\n}\n");
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
    fn three_button_choice_maps_clicks_and_never_guesses() {
        use rfd::MessageDialogResult as R;
        let l = ["A".to_string(), "B".to_string(), "C".to_string()];
        assert_eq!(three_button_choice(&R::Custom("A".into()), &l), Some(0));
        assert_eq!(three_button_choice(&R::Custom("B".into()), &l), Some(1));
        assert_eq!(three_button_choice(&R::Custom("C".into()), &l), Some(2));
        assert_eq!(three_button_choice(&R::Yes, &l), Some(0));
        assert_eq!(three_button_choice(&R::No, &l), Some(1));
        assert_eq!(three_button_choice(&R::Cancel, &l), None);
        assert_eq!(three_button_choice(&R::Ok, &l), None);
        assert_eq!(three_button_choice(&R::Custom("Z".into()), &l), None);
    }

    #[test]
    fn alert_response_choice_maps_buttons_and_dismissals() {
        assert_eq!(alert_response_choice(1000), Some(0));
        assert_eq!(alert_response_choice(1001), Some(1));
        assert_eq!(alert_response_choice(1002), Some(2));
        assert_eq!(alert_response_choice(0), None); // NSModalResponseCancel
        assert_eq!(alert_response_choice(-1001), None); // NSModalResponseAbort
        assert_eq!(alert_response_choice(1003), None);
    }

    #[test]
    fn is_bare_escape_rejects_chords_and_other_keys() {
        assert!(is_bare_escape(53, 0));
        assert!(is_bare_escape(53, 1 << 16)); // CapsLock is ignored
        for bit in [17, 18, 19, 20] {
            assert!(!is_bare_escape(53, 1 << bit));
        }
        assert!(!is_bare_escape(36, 0)); // Return
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
        // The named step fns `rpc_humble_login_clear_cookies` delegates to
        // (`login_window/humble_cookies.rs`). They are column-0 fns that are NOT `rpc_*`, so
        // without this list the scan would reset `current_arm` to `None` on them and silently
        // stop reading their bodies. They are scanned as part of the `humble_login_clear_cookies`
        // arm; the "every step seen" assertion after the loop fails if one is renamed or removed.
        let clear_cookies_steps = [
            "count_window_cookies_matching_macos",
            "remove_window_cookies_macos",
            "remove_window_cookies_windows",
        ];
        let mut steps_seen: Vec<&str> = Vec::new();
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
                "the live guard on `rpc_humble_login_clear_cookies`'s Linux block (`login_window/humble_cookies.rs`) since `1a8e1827b` -- strictly narrower, and the whole reason this pin was red",
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
                let fn_name = trimmed
                    .strip_prefix("pub(crate) fn ")
                    .or_else(|| trimmed.strip_prefix("fn "))
                    .and_then(|rest| rest.split(['(', '<']).next());
                if let Some(step) =
                    fn_name.and_then(|n| clear_cookies_steps.iter().find(|s| **s == n).copied())
                {
                    steps_seen.push(step);
                    current_arm = Some("humble_login_clear_cookies");
                    continue;
                }
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

        // Every named step fn must have been reached by the scan above. `concat!`, not a
        // `\`-continued literal -- see the comment above the first `assert!` in this test (WR-08).
        for step in clear_cookies_steps {
            assert!(
                steps_seen.contains(&step),
                concat!(
                    "F-34.4.2-12 regression pin: the step fn `{}` was not found as a column-0 ",
                    "fn in the production source -- it was renamed or removed. A renamed or ",
                    "removed step fn silently drops its body from this scan's coverage; ",
                    "re-derive `clear_cookies_steps` from a fresh measurement of ",
                    "`rpc_humble_login_clear_cookies`'s callees rather than deleting the name."
                ),
                step
            );
        }

        // EXACT structural expectation, not a floor (D-F2). "Three arms" and "four sites" are
        // DIFFERENT numbers and neither is a typo: `humble_login_clear_cookies` alone carries
        // TWO separately-guarded sites (the `count_matching` read and the deletion branch's
        // split-line read), the other two arms carry one each. The four sites now carry TWO
        // distinct guard spellings, not one: three sites are gated by the broad
        // `#[cfg(not(target_os = "macos"))]`, and `humble_login_clear_cookies`'s deletion-
        // branch site (the Linux block of `rpc_humble_login_clear_cookies`) alone is gated by the narrower
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
        // a shared binding. See that Linux block's own comment in `login_window/humble_cookies.rs` for the Windows rationale
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

        // Linkage: the `rpc_humble_login_clear_cookies` handler (a column-0 `fn` closed by a
        // column-0 `}`) must still call the step fn this pin measures; otherwise the pin would
        // be measuring an orphaned step.
        let handler_start = lines
            .iter()
            .position(|l| l.contains(concat!("fn rpc_humble_login", "_clear_cookies(")))
            .expect(concat!(
                "260928-qvr regression: the `rpc_humble_login_clear_cookies` handler definition ",
                "was not found in this file -- it was renamed, reformatted, or ",
                "removed; re-derive this pin's scan boundary from a fresh measurement rather ",
                "than loosening the match string."
            ));
        let handler_end = lines[handler_start + 1..]
            .iter()
            .position(|l| *l == "}")
            .map(|offset| handler_start + 1 + offset)
            .expect(concat!(
                "260928-qvr regression: could not find the closing brace of ",
                "`rpc_humble_login_clear_cookies` -- re-derive this pin's scan ",
                "boundary from a fresh measurement rather than loosening the match string."
            ));
        assert!(
            lines[handler_start..handler_end].iter().any(|l| {
                let t = l.trim();
                !(t.starts_with("//") || t.starts_with('*'))
                    && t.contains("remove_window_cookies_macos(")
            }),
            concat!(
                "260928-qvr regression: `rpc_humble_login_clear_cookies` no longer calls ",
                "`remove_window_cookies_macos(` in a non-comment line -- the pin below would ",
                "be measuring an orphaned step, not the live disconnect path."
            )
        );

        // The window-based branch lives in the `remove_window_cookies_macos` step fn (a
        // column-0 `fn` closed by a column-0 `}`), which the handler above delegates to.
        let start = lines
            .iter()
            .position(|l| l.contains(concat!("fn remove_window_cookies", "_macos(")))
            .expect(concat!(
                "260928-qvr regression: the `remove_window_cookies_macos` step fn definition ",
                "was not found in this file -- it was renamed, reformatted, or ",
                "removed; re-derive this pin's scan boundary from a fresh measurement rather ",
                "than loosening the match string."
            ));

        // End boundary: the step fn's own closing brace, the next line that is exactly `}`.
        // Scopes the scan to exactly this one step fn so this pin can never accidentally
        // measure a sibling.
        let end = lines[start + 1..]
            .iter()
            .position(|l| *l == "}")
            .map(|offset| start + 1 + offset)
            .expect(concat!(
                "260928-qvr regression: could not find the closing brace of ",
                "`remove_window_cookies_macos` -- re-derive this pin's scan ",
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

    // ---- Panic reporting (debug session `deep-link-open-url-abort`) ----

    #[test]
    fn shell_panic_log_path_returns_none_without_a_home() {
        assert_eq!(shell_panic_log_path(None), None);
        assert_eq!(shell_panic_log_path(Some("")), None);
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
        let source = include_str!("store_embed/layout.rs");
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
        let source = include_str!("store_embed/open.rs");
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
        let source = include_str!("store_embed/open.rs");
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

    #[test]
    fn steamfiles_channels_are_gamelib_steamfiles_app_ops() {
        for s in [
            "steamfiles_find_acf",
            "steamfiles_parse_valve_manifest",
            "steamfiles_read_acf",
            "steamfiles_read_installscript",
            "steamfiles_read_library_folders",
            "steamfiles_read_localconfig_beta_key",
            "steamfiles_read_running_app_id",
            "steamfiles_scan_acfs",
            "steamfiles_shortcuts_apply",
            "steamfiles_shortcuts_read",
        ] {
            assert!(
                gamelib_steamfiles::OPS.contains(&s)
                    && !gamelib_steamfiles::CLI_ONLY_OPS.contains(&s),
                "{s}"
            );
            let err = gamelib_steamfiles::dispatch(s, &[]).expect_err(s);
            assert!(err.ends_with(":bad-args"), "{s}: {err}");
        }
    }

    #[test]
    fn steam_root_default_env_is_passed_on_both_spawn_paths() {
        let src = include_str!("sidecar.rs");
        assert_eq!(src.matches(".env(\"GAMELIB_STEAM_ROOT_DEFAULT\"").count(), 2);
        assert!(src.contains("gamelib_steamfiles::discover::discover_default()"));
    }
}
