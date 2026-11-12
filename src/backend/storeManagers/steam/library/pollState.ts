/**
 * Install-poll state leaf (Phase 65, D-16).
 *
 * Handle-free by design: this module holds the install-poll registry factory, tick
 * constants, the bridge-finalized set and the request-notice sequence (closure
 * fields of createInstallPollState, one instance per boot, D-05, 66.4-09), and
 * nothing else. It creates no timer, registers no process hook and calls no
 * unref. That is the documented D-10 exception under Phase 65 D-16: the
 * install-poll interval is created and unref'd in installPolling.ts, beside
 * the `activePolls.set(...)` that registers it (sidecar exit contract). This
 * leaf exists to break the pollInstallOnce <-> hold helpers <->
 * startInstallPolling cycle, so each of those can import the state without
 * importing each other.
 */
import type { AcfSource } from './installRoot'
import type { SteamRestartHoldStore } from '../steamRestartHold'

/**
 * The exact StateFlags value GameLib writes on handoff (D-UAT-04 / 21-16):
 * bit 4 (FullyInstalled) is deliberately unset until Steam adopts the
 * manifest, which only happens on a full Steam client restart (focusing the
 * window is not enough). Steam replaces this value the moment it adopts the
 * install. See 21-RESEARCH for the full ACF field list.
 */
export const GAMELIB_HANDOFF_STATE_FLAGS = 1026

/**
 * Status context while a bridge install runs its post-download tail (quick
 * 261029-exu). The frontend matches the same literal, like the other Steam
 * install contexts.
 */
export const STEAM_BRIDGE_FINISHING_CONTEXT = 'steam-bridge-finishing'

/** Minimum gap between Steam-process re-probes while a poll is holding for a
 *  Steam restart. The poll ticks every 3 s but a restart takes Steam far
 *  longer, so probing every tick would only spawn children for nothing. */
export const STEAM_HOLD_PROBE_MIN_INTERVAL_MS = 10_000

export const GRACE_TICKS = 20 // ≈60 s at 3 000 ms default interval — stop if no manifest appeared
export const MAX_TICKS = 7200 // ≈6 h at 3 000 ms default interval — absolute safety cap
// quick 261105-vfq: no-activity window after GameLib sends a steam://install /
// InstallApp / steam://uninstall request. 40 ticks ≈ 2 min at 3 000 ms. A
// signed-out Mac Steam silently drops these requests; real requests show
// activity within seconds. Any activity (install: a manifest or a
// downloading/staging entry; uninstall: StateFlags 0x800, bit 4 cleared, or
// the manifest gone) disarms it, after which today's rules apply unchanged.
// MAX_TICKS stays the absolute ceiling. It is tick-counted inside the
// existing unref'd interval, so no new handle is created (sidecar exit
// contract). 10 consecutive absent ticks (≈30 s) after a manifest was seen =
// cancelled/removed in Steam (quick 261024-exo), tolerant of Steam briefly
// rewriting the acf.
export const STEAM_REQUEST_NO_ACTIVITY_TICKS = 40
export const MANIFEST_GONE_TICKS = 10
/** T-AOG (quick/260719-aog): consecutive frozen 'downloading' ticks (at the
 *  default 3 000 ms poll interval, ≈9 s) before a genuinely in-flight
 *  download is surfaced as 'steam-paused' rather than a silently frozen
 *  progress bar. */
export const STALLED_TICKS_THRESHOLD = 3
/** Bytes per MiB — mirrors depot.ts's own (unexported) constant so this
 *  poller's `downSpeed` matches the native depot-download path's MiB/s
 *  convention (the DownloadManager UI renders `downSpeed` with a "MB/s"
 *  label; see depot.ts's BYTES_PER_MIB docstring, UAT D-UAT-02). */
export const BYTES_PER_MIB = 1024 * 1024

/** One active install poll's bookkeeping, keyed by appId string in InstallPollState.activePolls. */
export type ActiveInstallPoll = {
  timer: NodeJS.Timeout
  ticks: number
  seenDownloading: boolean
  /** quick 261027-g9o: the ACF root this poll reads (see readAcfState),
   *  read per tick. Mutable for one reason only: the finalize-time native
   *  handoff (isNativeHandoff:true) may land after
   *  resumeInterruptedSteamInstall's bare native poll, and GameLib's
   *  finalize knows which root it actually wrote the manifest into, so it
   *  is authoritative. */
  source: AcfSource
  /** Fire-once guard (T-21-16-03) — the "restart Steam" notification must
   *  fire exactly once per install, not on every poll tick. */
  notifiedWaiting: boolean
  /** T-AOG (quick/260719-aog): the PREVIOUS tick's BytesDownloaded + the
   *  wall-clock time it was observed at, used to derive an instantaneous
   *  download speed. Undefined until the first tick with an active poll
   *  has run once — the very first tick therefore never has a speed. */
  lastBytesDownloaded?: number
  lastTickMs?: number
  /** T-AOG: consecutive 'downloading' ticks where a real in-flight
   *  download's BytesDownloaded did not advance — drives the
   *  'steam-paused' gameStatusUpdate hint once it crosses
   *  STALLED_TICKS_THRESHOLD. Reset to 0 the moment bytes advance again. */
  stalledTicks: number
  /** debug/steam-1026-download-restart: true ONLY for a poll started
   *  immediately after GameLib's OWN depot.ts download has already
   *  finished (games.ts's runNativeDepotDownload, native-install-ON —
   *  either the native or the bottle root) — the one scenario where
   *  StateFlags 1026 genuinely means "GameLib wrote this handoff manifest,
   *  waiting for a Steam restart to adopt it". Every OFF-path poll (Steam
   *  itself owns the download, via steam://install) leaves this false —
   *  on that path StateFlags 1026 is an ORDINARY Steam active-download
   *  state (0x400 update-running | 0x2 update-required), not a handoff.
   *  Root cause of the 1026-collision bug: this distinction cannot be made
   *  from the ACF alone, only from which call site started the poll. */
  isNativeHandoff: boolean
  /** quick 261029-ji2: native Mac GameLib depot install; Play restarts Steam
   *  to adopt it, so the installed branch shows no restart hint. */
  macNativeRoute: boolean
  /** 23.2-04 (D-06/D-07): depot ids GameLib's own downloadSteamDepots run
   *  dropped because Steam refused their decryption key (skip-and-warn,
   *  phase 23.2). Threaded from the DepotDownloadOutcome through
   *  startInstallPolling's PollOptions. Always [] on an OFF-path poll
   *  (Steam owns the download and GameLib has no skipped-depot knowledge
   *  for it) — see the isNativeHandoff docstring above for the same
   *  native-vs-OFF distinction. */
  skippedDepots: string[]
  /** Fire-once guard for the skip completion notice, mirroring the
   *  "restart Steam" toast's own fire-once flag immediately above —
   *  deliberately a SEPARATE flag. Reusing that flag would make the
   *  "Restart Steam" toast and the skip notice mutually exclusive:
   *  whichever notify() ran first would permanently suppress the other,
   *  and a native-handoff install with a skipped depot (this phase's
   *  exact scenario) would silently lose one of the two notices it must
   *  show. */
  notifiedDepotSkipped: boolean
  /** quick 261024-exo: true when Steam owns the download (steam://install). Selects the long no-manifest window and
   *  the manifest-gone stop and the no-activity window instead of the
   *  20-tick GRACE_TICKS branch. */
  delegatedToSteamClient: boolean
  /** quick 261105-vfq: the tick at which the poll became delegated, so the
   *  no-activity window counts from the request, not from an older bare poll. */
  delegatedSinceTick: number
  /** quick 261024-exo: consecutive 'absent' ticks AFTER a manifest was seen
   *  (seenDownloading). Reset on every 'downloading' tick; reaching
   *  MANIFEST_GONE_TICKS on a delegated poll means Steam-side cancel. */
  absentTicksSinceSeen: number
  /** debug/steam-waiting-for-restart-windows (D-UAT-13): where this
   *  native-handoff poll is in the "wait for the running Steam client to
   *  restart" lifecycle, for the StateFlags=4 fast path where GameLib's own
   *  finalize wrote a fully-installed manifest that the running client has
   *  never read (the 1026 path expresses the same wait through the ACF
   *  itself, so it never needs this).
   *   - 'unprobed': no finalized manifest has been seen yet.
   *   - 'holding':  the manifest is finalized AND a Steam client process was
   *                 alive at that moment. The poll stays registered, keeps
   *                 `status:'installing'` + `steam-waiting-for-restart`, and
   *                 does NOT report the game installed (Play would open
   *                 Steam's install dialog).
   *   - 'released': the wait is over (the recorded Steam process exited or
   *                 was replaced, Steam rewrote the manifest, or no Steam
   *                 was running / the probe was inconclusive) — the normal
   *                 installed flow runs. Terminal. */
  steamHold: 'unprobed' | 'holding' | 'released'
  /** The restart-hold store, captured from the deps that armed this poll so
   *  the deps-less poll-driven sites (stop, release) reach the same store. */
  restartHoldStore: SteamRestartHoldStore
  /** PIDs of the Steam client captured when `steamHold` became 'holding'. */
  steamPidsAtHandoff: number[]
  /** Wall-clock ms of the last Steam-process probe, to throttle re-probes
   *  while holding (a probe spawns one short-lived child). */
  lastSteamProbeMs: number
}

export interface InstallPollState {
  /** Registry of active install polls, keyed by appId string. */
  activePolls: Map<string, ActiveInstallPoll>
  // installBridgeGame sets this just before its final 'done'; the bridge poller
  // then must not re-assert finishing (quick 261031-ihs, Schedule I 2026-10-31).
  markBridgeInstallFinalized(appId: string): void
  clearBridgeInstallFinalized(appId: string): void
  isBridgeInstallFinalized(appId: string): boolean
  // quick 261106-pvk: monotonic id so the renderer shows each give-up notice once.
  nextSteamRequestNoticeSeq(): number
}

/**
 * The install-poll state of one boot (D-05, 66.4-09). Construction allocates an empty map, an empty
 * set and a counter: no I/O, timer or handle (sidecar exit contract). The interval handles the
 * registry holds are created and unref'd in installPolling.ts.
 */
export function createInstallPollState(): InstallPollState {
  const bridgeInstallFinalized = new Set<string>()
  let steamRequestNoticeSeq = 0
  return {
    activePolls: new Map(),
    markBridgeInstallFinalized: (appId) => {
      bridgeInstallFinalized.add(appId)
    },
    clearBridgeInstallFinalized: (appId) => {
      bridgeInstallFinalized.delete(appId)
    },
    isBridgeInstallFinalized: (appId) => bridgeInstallFinalized.has(appId),
    nextSteamRequestNoticeSeq: () => ++steamRequestNoticeSeq
  }
}

/** Registry of active uninstall polls, keyed by appId string. */
export interface UninstallPolls {
  activeUninstallPolls: Map<
    string,
    { timer: NodeJS.Timeout; ticks: number; seenUninstalling: boolean }
  >
}

/**
 * The uninstall-poll registry of one boot (D-05, 66.4-09). Construction allocates an empty map: no
 * I/O, timer or handle. The interval handles it holds are created and unref'd in
 * startUninstallPolling and cleared when the poll ends.
 */
export function createUninstallPolls(): UninstallPolls {
  return { activeUninstallPolls: new Map() }
}
