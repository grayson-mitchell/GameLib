//! What `funnel.rs` and `single_flight.rs` share (88.3-04): the profile and context a launch runs in, and the
//! recorders that write to one tape (the frontend push, the log sink, the store host's change listener), so the
//! order of what the funnel did across every seam is part of what a replay compares.
//!
//! The tape's events are in the TS funnel recorder's vocabulary (`golden/funnel`'s `events.json`): `kind`,
//! `channel`, `args`. A replay of a driver with its own vocabulary (golden/single_flight's launcher cases)
//! converts at compare time.
#![allow(dead_code)]

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::Clock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::paths::LogTarget;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::funnel::shell::FunnelShell;
use gamelib_launch::funnel::steps::FunnelSteps;
use gamelib_launch::funnel::testing::Tape;
use gamelib_launch::hooks::ManagerHooks;
use gamelib_launch::runner::stream::LaunchLogSink;
use gamelib_log::{Entry, Level, Prefix, TargetBatch};
use gamelib_store::host::{OpSummary, StoreHost};
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use serde_json::{json, Value};

use super::lock;

/// 2026-01-01T00:00:00.000Z, the instant `funnelTrace.ts` pins its clock to.
pub const PINNED_NOW_MS: u64 = 1_767_225_600_000;

/// The wall clock the TS oracle faked: a fixed instant that only the scripted launch moves.
pub struct FakeClock(pub AtomicU64);

impl Clock for FakeClock {
    fn now_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}

/// Waits until the store host has delivered every change it queued, so a change written before this call is on
/// the tape before whatever the caller writes next.
pub fn settle_store(host: &StoreHost) {
    let (tx, rx) = mpsc::channel();
    host.post(Box::new(move || {
        let _ = tx.send(());
    }));
    let _ = rx.recv_timeout(Duration::from_secs(5));
}

fn target_json(target: &LogTarget) -> Value {
    match target {
        LogTarget::General => json!({ "kind": "general" }),
        LogTarget::GogRedist => json!({ "kind": "gogRedist" }),
        LogTarget::Runner(runner) => json!({ "kind": "runner", "runner": runner.as_str() }),
        LogTarget::Game {
            app_name,
            runner,
            kind,
        } => {
            json!({ "kind": "game", "appName": app_name, "runner": runner.as_str(), "type": kind.as_str() })
        }
    }
}

/// The log sink of a replay: the general log's lines and the per-game log's entries, as the TS recorder's
/// `log` and `gameLog` events.
pub struct TapeSink(pub Tape);

impl LaunchLogSink for TapeSink {
    fn stamp(&self) -> (u64, i32) {
        (0, 0)
    }

    fn submit(&self, batches: Vec<TargetBatch>) {
        for batch in batches {
            for (index, entry) in batch.entries.iter().enumerate() {
                let rotate = batch.rotate && index == 0;
                let target = target_json(&batch.target);
                (self.0)(match entry {
                    Entry::Raw(text) => {
                        json!({ "kind": "gameLog", "target": target, "rotate": rotate, "raw": text })
                    }
                    Entry::Line {
                        level, prefix, msg, ..
                    } => json!({
                        "kind": "gameLog",
                        "target": target,
                        "rotate": rotate,
                        "level": level.as_str(),
                        "prefix": prefix.as_str(),
                        "text": msg,
                    }),
                });
            }
        }
    }

    fn general(&self, prefix: Prefix, level: Level, msg: &str) {
        (self.0)(json!({
            "kind": "log",
            "level": level.as_str().to_lowercase(),
            "prefix": prefix.as_str(),
            "text": msg,
        }));
    }
}

/// The renderer push of a replay: the frontend half of `sendGameStatusUpdate`.
pub struct TapeEmitter(pub Tape);

impl FrontendEmitter for TapeEmitter {
    fn emit(&self, channel: &str, args: Vec<Value>) {
        (self.0)(json!({ "kind": "frontend", "channel": channel, "args": args }));
    }
}

/// A fresh fake profile, the tape, and the contexts a replay builds over them.
pub struct FunnelRig {
    pub home: FakeHome,
    pub events: Arc<Mutex<Vec<Value>>>,
    pub host: Arc<StoreHost>,
    pub tape: Tape,
    pub clock: Arc<FakeClock>,
}

impl FunnelRig {
    pub fn new() -> FunnelRig {
        let events: Arc<Mutex<Vec<Value>>> = Arc::new(Mutex::new(Vec::new()));
        let host = Arc::new(StoreHost::new());
        let tape: Tape = {
            let events = Arc::clone(&events);
            let host = Arc::clone(&host);
            Arc::new(move |event| {
                settle_store(&host);
                lock(&events).push(event);
            })
        };
        FunnelRig {
            home: FakeHome::new("launch-funnel-"),
            events,
            host,
            tape,
            clock: Arc::new(FakeClock(AtomicU64::new(PINNED_NOW_MS))),
        }
    }

    fn app_folder(&self) -> PathBuf {
        self.home.root().join(".config").join("GameLib")
    }

    fn user_data(&self) -> PathBuf {
        self.home
            .root()
            .join("Library")
            .join("Application Support")
            .join("GameLib")
    }

    /// The play-time store before the Play (`tsStore.hasApp`, `totalPlayed`), written before anything listens.
    pub fn seed_total_played(&self, app_name: &str, total: &Value) {
        let row = gamelib_store::table::row_for_key("store/timestamp").unwrap();
        let store = self
            .host
            .open_row(row, self.user_data().join("store").join("timestamp.json"))
            .unwrap();
        store
            .set(
                &format!("{app_name}.totalPlayed"),
                gamelib_store::json::Json::from(total.clone()),
            )
            .unwrap();
    }

    /// The store already holds the game (`tsStore.has(app)`), without a `totalPlayed` of its own: so no
    /// `firstPlayed` is written, and the first `totalPlayed` write is a change.
    pub fn seed_first_played(&self, app_name: &str) {
        let row = gamelib_store::table::row_for_key("store/timestamp").unwrap();
        let store = self
            .host
            .open_row(row, self.user_data().join("store").join("timestamp.json"))
            .unwrap();
        store
            .set(
                &format!("{app_name}.firstPlayed"),
                gamelib_store::json::Json::from(json!("seeded")),
            )
            .unwrap();
    }

    /// Puts every change of the play-time store on the tape, from now on.
    pub fn listen_to_play_time(&self) {
        let events = Arc::clone(&self.events);
        self.host.on_any_change(Box::new(move |change| {
            if change.store != "store/timestamp" {
                return;
            }
            if let (OpSummary::Set { key }, Some(value)) = (&change.op, &change.value) {
                lock(&events).push(json!({
                    "kind": "tsStore",
                    "op": "set",
                    "key": key,
                    "value": value.to_value(),
                }));
            }
        }));
    }

    /// The launch context: the recorders on the tape, the clock faked, the managers, steps and shell given.
    pub fn ctx(
        &self,
        platform: Platform,
        online: bool,
        hooks: Arc<dyn ManagerHooks>,
        steps: Arc<dyn FunnelSteps>,
        shell: Arc<dyn FunnelShell>,
    ) -> LaunchCtx {
        let root = self.home.root().to_path_buf();
        let app_folder = self.app_folder();
        let engine = Arc::new(
            EngineCtx::new(
                Arc::clone(&self.host),
                self.clock.clone(),
                platform,
                EnginePaths {
                    tools_path: app_folder.join("tools"),
                    user_data: self.user_data(),
                    app_folder: app_folder.clone(),
                    user_home: root.clone(),
                    temp: root.join("tmp"),
                },
                Shutdown::new(),
            )
            .with_emitter(Arc::new(TapeEmitter(self.tape.clone())))
            .with_online(online),
        );
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            Some(root.join("public").join("fixes")),
            "https://relay.test",
            "0.0.0",
        ));
        let wine = Arc::new(WineCtx::new(
            engine.clone(),
            app_folder.join("tools").join("runtimes"),
        ));
        let info = Arc::new(InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(gamelib_core::clock::SystemClock),
            InfoPlatform::Linux,
            InfoPaths {
                app_folder: app_folder.clone(),
                user_data: app_folder,
                temp: root.join("tmp"),
                public_dir: None,
            },
            "0.0.0".to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        LaunchCtx::new(engine, knownfix, wine, info)
            .with_log_sink(Arc::new(TapeSink(self.tape.clone())))
            .with_hooks(hooks)
            .with_shell(shell)
            .with_steps(steps)
    }

    /// What the tape holds now.
    pub fn events(&self) -> Vec<Value> {
        lock(&self.events).clone()
    }
}
