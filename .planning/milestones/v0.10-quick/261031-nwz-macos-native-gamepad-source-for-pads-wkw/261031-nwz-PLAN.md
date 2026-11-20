---
phase: quick-261031-nwz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/native_gamepad_shape.rs
  - src-tauri/src/macos_native_gamepad.rs
  - src/preload/__tests__/tauriNativeGamepad.test.ts
autonomous: false
requirements:
  - todo-2026-10-30-macos-native-gamepad-source
must_haves:
  truths:
    - "If gilrs init fails, the reader returns without emitting anything or entering the poll loop, and app startup carries on"
    - "Unplugging a pad emits a payload without it; replugging emits a payload with it again (same or new gilrs index), and the renderer dispatches gamepaddisconnected then gamepadconnected"
    - "While a stick is held, the reader emits at most once per MIN_EMIT_INTERVAL (8 ms). The final state is always delivered (trailing emit). Connect and disconnect changes are emitted at once"
    - "On an idle tick (no gilrs events, nothing pending) the reader takes no snapshot and emits nothing"
    - "macOS-only gating is unchanged: cfg(target_os = \"macos\") on the reader module and start call, isMacWebview() on the shim install"
  artifacts:
    - path: "src-tauri/src/native_gamepad_shape.rs"
      provides: "cfg-free PadSource trait, EmitGate coalescing policy, run_reader driver, plus their unit tests"
      contains: "fn run_reader"
    - path: "src-tauri/src/macos_native_gamepad.rs"
      provides: "gilrs-backed PadSource; start() delegates to run_reader"
      contains: "impl PadSource"
    - path: "src/preload/__tests__/tauriNativeGamepad.test.ts"
      provides: "unplug-by-absence / replug renderer cases"
      contains: "replug"
  key_links:
    - from: "src-tauri/src/macos_native_gamepad.rs"
      to: "native_gamepad_shape::run_reader"
      via: "start() spawns a thread that calls run_reader(init, emit, keep_going)"
      pattern: "run_reader\\("
---

<objective>
Finish the "To ship" list of todo `.planning/todos/pending/2026-10-30-macos-native-gamepad-source-for-pads-wkwebview-does-not-expose.md`.

**Most of that list is already on main. Do NOT cherry-pick `a030fda87`.** Quick task 261031-mj9
(commits `70f7022af`, `c1abed746`, `d60cd6ccb`, `8d0b59963`) brought the spike 051 prototype onto
main and hardened it, and its live gates L1-L3 passed on 2026-10-31 (`ec00ae96e`). What is
already done:
- Rust payload-shape tests: 4 tests in `src-tauri/src/native_gamepad_shape.rs`, covering hat
  (measured values and diagonals), pad id, button indexing and padding, and axis placement with
  the Y flip.
- Renderer merge tests: 14 tests in `src/preload/__tests__/tauriNativeGamepad.test.ts`, covering
  slot 8 placement, dedupe by id, vid/pid and name, connect/disconnect, and failure isolation.
- macOS-only gating: gilrs sits under the macOS target dependency table, the module and start
  call are behind `cfg(target_os = "macos")`, and the shim installs only under `isMacWebview()`.

Still open, and the subject of this plan:
1. gilrs init failure and hot-plug are not tested. The reader loop is an untestable infinite
   loop inside `start()`.
2. Event rate. The reader polls every 4 ms and takes a snapshot on every tick, even when idle.
   It also emits on every state change with no cap. Its consumer, `gamepad.ts`, reads through
   `requestAnimationFrame` (60-120 Hz), so anything above that rate is wasted IPC.
3. The renderer has no test for replug after unplug-by-absence (gilrs `gamepads()` lists only
   connected pads, so an unplug arrives as absence), including replug under a new gilrs index.
4. The todo's live Gate includes unplug/replug, which mj9's L1-L3 gate did not exercise.

Purpose: the remaining hardening, and the evidence the todo's Gate needs.
Output: a testable reader driver with coalescing, new Rust and renderer tests, and a live-gate checkpoint.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-30-macos-native-gamepad-source-for-pads-wkwebview-does-not-expose.md
@.planning/quick/261031-mj9-land-spike-051-native-gamepad-reader-on-/261031-mj9-SUMMARY.md
@src-tauri/src/native_gamepad_shape.rs
@src-tauri/src/macos_native_gamepad.rs
@src/preload/__tests__/tauriNativeGamepad.test.ts

<interfaces>
Current code on main (read the files in full before editing):

native_gamepad_shape.rs (cfg-free; in main.rs as `#[cfg_attr(not(target_os = "macos"), allow(dead_code))] mod native_gamepad_shape;`):
- `pub const NATIVE_GAMEPAD_EVENT: &str = "native_gamepad";`
- `#[derive(Serialize, Clone, PartialEq, Debug)] #[serde(rename_all = "camelCase")] pub struct NativePad { index: usize, id: String, name: String, vendor_id: Option<u16>, product_id: Option<u16>, connected: bool, buttons: Vec<f64>, axes: Vec<f64> }`
- `#[derive(Serialize, Clone, Debug)] pub struct NativeGamepadPayload { pub pads: Vec<NativePad> }`
- `pub fn hat_value`, `pub fn pad_id`, `pub fn shape_buttons`, `pub fn shape_axes`, plus a `#[cfg(test)] mod tests` with a `close` helper.

macos_native_gamepad.rs (`#[cfg(target_os = "macos")]`):
- `const POLL_INTERVAL: Duration = Duration::from_millis(4);`
- `fn snapshot(gilrs: &Gilrs) -> Vec<NativePad>`
- `pub fn start(app: AppHandle)` spawns the "native-gamepad" thread. On `Gilrs::new()` Err it
  eprintlns `[native-gamepad] gilrs init failed: {e}` and returns. Otherwise it loops forever:
  drain `next_event()` (Connected/Disconnected sets `changed_pads`), snapshot, emit if
  `changed_pads || pads != last`, eprintln each pad on a connection change, then sleep POLL_INTERVAL.
- main.rs ~line 12711: `#[cfg(target_os = "macos")] macos_native_gamepad::start(app.handle().clone());`. Do not touch main.rs.

gilrs 0.11.2 facts (read from ~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gilrs-0.11.2/src/gamepad.rs):
- `Gilrs::gamepads()` returns "all connected gamepads", so an unplugged pad disappears from the snapshot.
- `Gilrs::new()` applies default filters (jitter, deadzone). It returns `Err(Error::NotImplemented(Gilrs))` on an unsupported platform, and that Err already takes the quiet-exit path.

Renderer test harness (tauriNativeGamepad.test.ts): `setup()` loads and installs the shim,
`send(pads)` delivers a payload, `events` records `{type, slot}`, `getPads()` reads the merged
array, and `POWERA` is a NativePad fixture with `index: 0`, so it lands at slot 8.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Testable reader driver with emit coalescing, init-failure and hot-plug tests</name>
  <files>src-tauri/src/native_gamepad_shape.rs, src-tauri/src/macos_native_gamepad.rs</files>
  <behavior>
    - init_failure_returns_quietly: run_reader with an init that returns Err never calls emit or keep_going, and returns.
    - hotplug_emits_disconnect_and_reconnect: a scripted fake source goes [pad 0 present, connection change], then [absent, connection change], then [pad 0 present, connection change], then [pad 1 present (new index), connection change]. Payloads arrive in that order (with pad, empty, with pad, with pad index 1), each on its own tick, none delayed by the interval.
    - held_stick_is_coalesced: over 250 ticks 4 ms apart (1 s of virtual time) with an axis value changing on every tick, emits stay at or below 1000/8 + 1. After the changes stop, the next tick at least MIN_EMIT_INTERVAL after the last emit delivers the final value (trailing emit, so no stale state).
    - idle_tick_takes_no_snapshot: a tick with no events and nothing pending does not call snapshot and does not emit (count snapshot calls on the fake).
    - unchanged_state_not_reemitted: events that leave the snapshot equal to the last emitted one produce no emit.
  </behavior>
  <action>
    Add to native_gamepad_shape.rs, keeping it cfg-free and gilrs-free so `cargo test` covers it on every OS. Update the module doc to say this module now also holds the reader's loop policy.
    (a) `pub trait PadSource { fn drain_events(&mut self) -> Drained; fn snapshot(&mut self) -> Vec<NativePad>; }`, where `pub struct Drained { pub any: bool, pub connection_changed: bool }`.
    (b) `pub const MIN_EMIT_INTERVAL: Duration = Duration::from_millis(8);`. Its doc comment must cite the basis: the spike 051 pad reports at about 125 Hz (Live 3), and gamepad.ts consumes through requestAnimationFrame at 60-120 Hz, so 8 ms caps IPC at the pad's own rate and adds at most 8 ms latency.
    (c) `pub struct EmitGate { last: Vec<NativePad>, last_emit: Option<Instant>, pending: bool }` with `pub fn tick(&mut self, now: Instant, source: &mut impl PadSource) -> Option<NativeGamepadPayload>`. The rules, in this order:
      1. Drain events.
      2. If `!any && !pending`, return None without calling snapshot.
      3. Otherwise snapshot. If `connection_changed`, emit now and clear pending.
      4. Otherwise, if the snapshot equals `last`, clear pending and return None.
      5. Otherwise, if `last_emit` is None or at least MIN_EMIT_INTERVAL has passed, emit and clear pending.
      6. Otherwise set pending and return None.
      Emitting means: store the snapshot as `last`, set `last_emit = now`, and return the payload. Pending stays set across ticks, so the next tick re-snapshots and catches the trailing state.
    (d) `pub fn run_reader<S: PadSource>(init: impl FnOnce() -> Result<S, String>, mut emit: impl FnMut(&NativeGamepadPayload), mut keep_going: impl FnMut() -> bool)`. On init Err, eprintln `[native-gamepad] gilrs init failed: {e}` and return. Otherwise, while `keep_going()`, call `gate.tick(Instant::now(), &mut source)` and emit on Some. Also eprintln each pad's `[native-gamepad] pad {index} {id:?} connected=...` line on a connection-change emit, and a `[native-gamepad] all pads disconnected` line when that payload is empty.
      For deterministic timing tests, add a `#[cfg(test)]` helper that drives `EmitGate::tick` with explicit Instants (base `Instant::now()` plus offsets), rather than putting a clock parameter on run_reader.
    In macos_native_gamepad.rs, wrap gilrs in `struct GilrsSource(Gilrs)` and `impl PadSource for GilrsSource`. Its drain_events loops `next_event()`, sets `any` for every event and `connection_changed` for Connected/Disconnected. Its snapshot calls the existing `snapshot(&self.0)`. Reduce `start()`'s thread body to `run_reader(|| Gilrs::new().map(GilrsSource).map_err(|e| e.to_string()), |p| { let _ = app.emit(NATIVE_GAMEPAD_EVENT, p.clone()); }, || { std::thread::sleep(POLL_INTERVAL); true })`. Keep POLL_INTERVAL at 4 ms; its latency was live-validated, so do not switch to `next_event_blocking`. Keep the spawn-failure eprintln, and keep `start` non-blocking and infallible (setup must not panic; see the SIGABRT comment in main.rs).
    Write the behavior tests first in the existing tests module, with a `FakeSource` holding a `VecDeque` of scripted `(Drained, Vec<NativePad>)` steps and a snapshot-call counter. They must fail before the implementation exists. Then implement until they pass. Do not change hat_value, pad_id, shape_buttons or shape_axes, or their tests. Do not touch main.rs, Cargo.toml or Cargo.lock.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test --bin gamelib-shell native_gamepad && rustfmt --check --edition 2021 src/native_gamepad_shape.rs src/macos_native_gamepad.rs && git diff --quiet -- src/main.rs Cargo.toml Cargo.lock && echo "main.rs/Cargo untouched"</automated>
    Prettier: no prettier check. Both paths are .rs; `npx prettier --file-info` on a src-tauri .rs/.toml path gives inferredParser null, so prettier has nothing to check. rustfmt --check is the formatter gate here.
  </verify>
  <done>The 5 new tests and the 4 existing shape tests pass on macOS, where the build also compiles macos_native_gamepad.rs. start() delegates to run_reader. Init failure returns without emitting. Hot-plug sequences emit at once. A held stick is capped at the 8 ms interval with a trailing emit. Idle ticks skip the snapshot. Both files are rustfmt-clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Renderer tests for unplug-by-absence and replug, then full suites</name>
  <files>src/preload/__tests__/tauriNativeGamepad.test.ts</files>
  <behavior>
    - replug same index after absence: send([POWERA]), then send([]), then send([POWERA]). Events are connected@8, disconnected@8, connected@8, and getPads()[8].id equals POWERA.id at the end.
    - replug under a new gilrs index: send([POWERA]), then send([]), then send([{...POWERA, index: 1}]). Events are connected@8, disconnected@8, connected@9. getPads() has null at slot 8 and the pad at slot 9, length 10.
    - stick motion does not re-announce: send([POWERA]), then send a POWERA copy with a different axes[0]. There is exactly one gamepadconnected, and getPads()[8].axes[0] reflects the new value.
  </behavior>
  <action>
    Add a `describe('hot-plug', ...)` block to tauriNativeGamepad.test.ts using the existing harness (setup, send, events, getPads, POWERA). Do not add new mocks. These cover the Rust reader's unplug semantics: gilrs `gamepads()` drops an unplugged pad, so the renderer sees absence, not connected:false. Run them. If one fails, it is a real shim defect: fix it minimally in src/preload/api/tauriNativeGamepad.ts, add that path to the prettier check, and record it as a deviation. Otherwise leave the shim untouched. Do not change src/frontend/helpers/gamepad.ts or nintendo.ts.
    Then run the whole Preload jest project, `pnpm codecheck`, and the full shell crate tests, to show nothing else moved.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Preload && pnpm codecheck && npx prettier --check src/preload/__tests__/tauriNativeGamepad.test.ts $(git diff --name-only -- src/preload/api/tauriNativeGamepad.ts) && git diff --quiet -- src/frontend/helpers/gamepad.ts src/frontend/helpers/nintendo.ts && (cd src-tauri && cargo test --bin gamelib-shell)</automated>
  </verify>
  <done>The 3 new hot-plug cases pass alongside the existing 14. The Preload project, codecheck and the full `cargo test --bin gamelib-shell` are green. The test file passes the scoped prettier check (preload printWidth 120). gamepad.ts and nintendo.ts are unchanged.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Live gate with the PowerA pad (the todo's Gate)</name>
  <what-built>
    The reader loop is now a tested driver. It emits at most every 8 ms with a trailing emit, connection changes go out at once, idle ticks skip the snapshot, and init failure exits quietly. The renderer hot-plug cases are tested. Claude cannot run this gate: it needs the physical pad and an operator.
  </what-built>
  <how-to-verify>
    1. Fully stop and restart `pnpm tauri:dev`. The Rust shell changed and tauri dev does not hot-rebuild it, so a running session still has the old reader. Confirm the shell rebuilt (cargo output on start).
    2. With the PowerA Advantage Wired Controller for Nintendo Switch 2 (20d6:a720) plugged in, focus the window and press A. Then `grep -E '\[NATIVE-GAMEPAD\] connected|\[GAMEPAD\]' ~/Library/Logs/GameLib/gamelib.log | tail -5` should show `[NATIVE-GAMEPAD] connected slot=8 ...` and `[GAMEPAD] id="PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720)" mapping="" buttons=17 axes=10`.
    3. In the library, the D-pad and the left stick move focus. A activates and B goes back. Hold the left stick in one direction for about 3 s: focus keeps stepping at the normal repeat rate, with no lag or stutter and no visible CPU spike for the app in Activity Monitor (event-rate check).
    4. Unplug the pad. Wait about 2 s and replug it. The terminal running tauri:dev should show `[native-gamepad] all pads disconnected`, then a `[native-gamepad] pad N ... connected=true` line. A new `[NATIVE-GAMEPAD] connected slot=...` line appears in gamelib.log. The D-pad and A/B work again without restarting.
    Record the result for each step. Do not move or close the todo; the orchestrator handles that after this gate.
  </how-to-verify>
  <files>none (operator-run live check; results go in the SUMMARY)</files>
  <action>Pause and present the how-to-verify steps to the operator. Write no code in this task. Record each step's result verbatim in the SUMMARY. If a step fails, stop and report it; do not attempt a fix inside this plan.</action>
  <verify><human-check>Operator runs steps 1-4 with the physical pad and reports pass or fail for each.</human-check></verify>
  <done>The operator has reported each of the 4 steps, and the SUMMARY records them. The todo is still in pending/.</done>
  <resume-signal>Type "approved", or name the step that failed and what you saw</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HID device -> Rust reader | Untrusted USB HID input values (any pad can be plugged in) |
| Rust shell -> webview (Tauri event) | The reader pushes payloads into the renderer |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nwz-01 | Denial of Service | EmitGate / run_reader | mitigate | The 8 ms MIN_EMIT_INTERVAL caps IPC at about 125/s however noisy a device is, and idle ticks skip the snapshot. The held_stick_is_coalesced test pins the cap. |
| T-nwz-02 | Denial of Service | gilrs init on startup | mitigate | run_reader returns quietly on init Err and start() stays infallible, so setup never panics. The init_failure_returns_quietly test pins this. |
| T-nwz-03 | Tampering | payload shape in renderer | accept | Values are numbers and strings shaped by Rust. The shim already ignores malformed payloads (an existing failure-isolation test). No code execution path. |
| T-nwz-04 | Information Disclosure | eprintln pad lines | accept | Only the device name and vid/pid go to the dev terminal. No user data. |
</threat_model>

<verification>
- `cargo test --bin gamelib-shell` (whole crate) green, including the 5 new reader tests.
- Preload jest project green, including the 3 new hot-plug cases. `pnpm codecheck` clean.
- rustfmt clean on both Rust files. Scoped prettier clean on the TS test file, plus the shim if it was touched.
- main.rs, Cargo.toml, Cargo.lock, gamepad.ts and nintendo.ts unchanged.
- Live gate (Task 3) reported by the operator.
</verification>

<success_criteria>
- Every todo "To ship" item has evidence. Shape and merge tests came from mj9 and are still green. Init failure and hot-plug now have Rust and renderer tests. macOS gating is unchanged. The event rate is capped and tested, with a live held-stick check.
- The todo stays in pending/ and its Gate result is recorded in the SUMMARY.
</success_criteria>

<output>
Create `.planning/quick/261031-nwz-macos-native-gamepad-source-for-pads-wkw/261031-nwz-SUMMARY.md` when done, with the live-gate result for each step.
</output>
