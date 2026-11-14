//! Spike 085: hold one authenticated steam-vent (a9e8164) session for hours across network drops
//! and sleep/wake, and measure what steam-vent tells us and what recovery GameLib must own.
//!
//!   spike-085-vent-long <vault.json> <hold_s> [period_s=30] [reconnect=1]
//!
//! Every period: a liveness job (PICS access token for app 480, 10 s timeout). ClientLoggedOff is
//! subscribed for the session's life. On failure: DEAD with the error, then (reconnect=1) a fresh
//! discover + connect + refresh-token logon with backoff; RECOVERED reports how long it took.
//! Wall-clock gaps (sleep) are logged as GAP. steam-vent's own tracing (warn+) is interleaved on
//! stderr so its silent heartbeat/read-loop errors become visible. No secrets are printed.

use futures_util::StreamExt;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use steam_vent::auth::RefreshToken;
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{Connection, ConnectionTrait, ReadonlyConnection, ServerList};
use steam_vent_proto::steammessages_clientserver_appinfo::{CMsgClientPICSAccessTokenRequest, CMsgClientPICSAccessTokenResponse};
use steam_vent_proto::steammessages_clientserver_login::CMsgClientLoggedOff;

type R<T> = Result<T, Box<dyn std::error::Error>>;
type Off = std::pin::Pin<Box<dyn futures_util::Stream<Item = Result<CMsgClientLoggedOff, steam_vent::NetworkError>> + Send>>;

fn now_s() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs_f64()
}
fn iso() -> String {
    let ms = (now_s() * 1000.0) as i64;
    let secs = ms.div_euclid(1000);
    let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let dd = doy - (153 * mp + 2) / 5 + 1;
    let mm = if mp < 10 { mp + 3 } else { mp - 9 };
    let yy = yoe + era * 400 + if mm <= 2 { 1 } else { 0 };
    format!("{yy:04}-{mm:02}-{dd:02}T{:02}:{:02}:{:02}.{:03}Z", rem / 3600, (rem % 3600) / 60, rem % 60, ms.rem_euclid(1000))
}
macro_rules! ev { ($cat:expr, $($a:tt)*) => { eprintln!("{} {:<9} {}", iso(), $cat, format!($($a)*)) } }

async fn logon(vault: &str) -> R<(Connection, Off)> {
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(vault)?)?;
    let token = RefreshToken::new(v["steam-refresh-token"].as_str().ok_or("no token")?.to_string())?;
    let servers = ServerList::discover().await?;
    let unauth = UnAuthenticatedConnection::connect(&servers).await?;
    let off: Off = Box::pin(unauth.on::<CMsgClientLoggedOff>());
    let c = unauth.login_with_refresh_token(&token).await?;
    Ok((c, off))
}

async fn alive(c: &Connection) -> Result<(), String> {
    let r: Result<CMsgClientPICSAccessTokenResponse, _> = tokio::time::timeout(
        Duration::from_secs(10),
        c.job(CMsgClientPICSAccessTokenRequest { appids: vec![480], ..Default::default() }),
    )
    .await
    .map_err(|_| "outer timeout 10s".to_string())?;
    r.map(|_| ()).map_err(|e| format!("{e:?}"))
}

#[tokio::main]
async fn main() -> R<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new("steam_vent=warn"))
        .with_ansi(false)
        .with_writer(std::io::stderr)
        .init();
    let a: Vec<String> = std::env::args().skip(1).collect();
    if a.len() < 2 {
        eprintln!("usage: <vault.json> <hold_s> [period_s] [reconnect]");
        std::process::exit(64);
    }
    let vault = a[0].clone();
    let hold = a[1].parse::<f64>()?;
    let period = a.get(2).map(|s| s.parse::<u64>()).transpose()?.unwrap_or(30);
    let reconnect = a.get(3).map(|s| s != "0").unwrap_or(true);
    ev!("start", "steam-vent@a9e8164, hold {hold}s, liveness every {period}s, reconnect={reconnect}");
    let (mut c, mut off) = logon(&vault).await?;
    ev!("logon", "logged on");
    let t_end = now_s() + hold;
    let (mut ok, mut sessions, mut dead_at): (u64, u32, Option<f64>) = (0, 1, None);
    let mut last_wall = now_s();
    let mut last_mono = Instant::now();
    let mut next = now_s() + 2.0;
    while now_s() < t_end {
        tokio::select! {
            m = off.next() => {
                match m {
                    Some(Ok(m)) => ev!("KICKED", "ClientLoggedOff eresult {}", m.eresult()),
                    Some(Err(e)) => ev!("KICKED", "ClientLoggedOff undecodable: {e}"),
                    None => { ev!("OFFEND", "ClientLoggedOff stream ended"); off = Box::pin(futures_util::stream::pending()); }
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(500)) => {}
        }
        // Sleep detection: wall clock advanced far more than the monotonic (uptime) clock.
        let (w, m) = (now_s(), Instant::now());
        let gap = (w - last_wall) - m.duration_since(last_mono).as_secs_f64();
        if gap > 5.0 {
            ev!("GAP", "wall clock jumped {gap:.0}s past the monotonic clock (system sleep)");
            next = w; // check liveness right after wake
        }
        last_wall = w;
        last_mono = m;
        if w < next {
            continue;
        }
        next = w + period as f64;
        match alive(&c).await {
            Ok(()) => {
                ok += 1;
                if ok % 20 == 1 {
                    ev!("alive", "liveness ok (#{ok}, session {sessions})");
                }
            }
            Err(e) => {
                if dead_at.is_none() {
                    dead_at = Some(now_s());
                }
                ev!("DEAD", "liveness failed: {e}");
                if !reconnect {
                    continue;
                }
                let mut backoff = 5u64;
                loop {
                    let t = now_s();
                    match tokio::time::timeout(Duration::from_secs(30), logon(&vault)).await {
                        Ok(Ok((nc, noff))) => {
                            c = nc;
                            off = noff;
                            sessions += 1;
                            ev!("RECOVERED", "new session {sessions} after {:.1}s dead (logon took {:.1}s)", now_s() - dead_at.unwrap(), now_s() - t);
                            dead_at = None;
                            next = now_s() + 2.0;
                            break;
                        }
                        Ok(Err(e)) => ev!("RETRY", "reconnect failed: {e}; backoff {backoff}s"),
                        Err(_) => ev!("RETRY", "reconnect timed out 30s; backoff {backoff}s"),
                    }
                    if now_s() > t_end {
                        break;
                    }
                    tokio::time::sleep(Duration::from_secs(backoff)).await;
                    backoff = (backoff * 2).min(60);
                }
            }
        }
    }
    ev!("end", "liveness ok={ok} sessions={sessions} dead_at_end={}", dead_at.is_some());
    Ok(())
}
