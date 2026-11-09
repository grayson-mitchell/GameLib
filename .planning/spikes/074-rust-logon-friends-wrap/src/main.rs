//! Spike 074: does Mac Steam's Friends list stay signed in when a *Rust* client (steam-vent) logs
//! on to the same account, (a) inside the go-offline wrap, (b) without it (control)?
//!
//!   wrapped   <vault.json> [hold_s]   gooffline → wait for LogOff → Rust logon → goonline → hold
//!   unwrapped <vault.json> [hold_s]   Rust logon while Mac Steam is online → hold   (control)
//!
//! During the hold the session proves it is alive every 20 s (a PICS access-token call), and any
//! ClientLoggedOff is logged. New lines in Mac Steam's connection_log.txt are mirrored into the
//! log. Everything goes to stderr and out/run-<mode>.log; no secrets.

use futures_util::StreamExt;
use std::io::Write;
use std::time::{Duration, Instant, SystemTime};
use steam_vent::auth::RefreshToken;
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{ConnectionTrait, ReadonlyConnection, ServerList};
use steam_vent_proto::steammessages_clientserver_appinfo::{CMsgClientPICSAccessTokenRequest, CMsgClientPICSAccessTokenResponse};
use steam_vent_proto::steammessages_clientserver_login::CMsgClientLoggedOff;

type R<T> = Result<T, Box<dyn std::error::Error>>;

struct Log {
    t0: Instant,
    f: std::fs::File,
}
impl Log {
    fn ev(&mut self, cat: &str, msg: impl AsRef<str>) {
        let unix = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs();
        let line = format!("[{:>7.2}s unix {unix}] {cat:<8} {}", self.t0.elapsed().as_secs_f64(), msg.as_ref());
        eprintln!("{line}");
        let _ = writeln!(self.f, "{line}");
    }
}

fn clog() -> std::path::PathBuf {
    std::path::PathBuf::from(std::env::var("HOME").unwrap()).join("Library/Application Support/Steam/logs/connection_log.txt")
}
fn clog_len() -> u64 {
    std::fs::metadata(clog()).map(|m| m.len()).unwrap_or(0)
}
/// New connection_log lines since `from`; advances `from`.
fn clog_new(from: &mut u64) -> Vec<String> {
    let Ok(b) = std::fs::read(clog()) else { return vec![] };
    if (b.len() as u64) <= *from {
        return vec![];
    }
    let s = String::from_utf8_lossy(&b[*from as usize..]).into_owned();
    *from = b.len() as u64;
    s.lines().filter(|l| !l.trim().is_empty()).map(str::to_string).collect()
}
fn open_url(u: &str) {
    let _ = std::process::Command::new("open").args(["-g", u]).status();
}

#[tokio::main]
async fn main() -> R<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mode = args.first().cloned().unwrap_or_default();
    if mode != "wrapped" && mode != "unwrapped" {
        eprintln!("usage: wrapped|unwrapped <vault.json> [hold_s]");
        std::process::exit(64);
    }
    let hold = args.get(2).and_then(|h| h.parse().ok()).unwrap_or(120u64);
    std::fs::create_dir_all("out")?;
    let mut log = Log { t0: Instant::now(), f: std::fs::File::create(format!("out/run-{mode}.log"))? };
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&args[1])?)?;
    let token = RefreshToken::new(v["steam-refresh-token"].as_str().ok_or("no token")?.to_string())?;
    let mut cpos = clog_len();
    log.ev("start", format!("mode {mode}, hold {hold}s, steam-vent@a9e8164 (client_os_type 203, chat_mode 2)"));

    if mode == "wrapped" {
        open_url("steam://open/gooffline");
        let mut seen = false;
        for _ in 0..50 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let lines = clog_new(&mut cpos);
            for l in &lines {
                log.ev("macsteam", l);
            }
            if lines.iter().any(|l| l.contains("user initiated logoff")) {
                seen = true;
                break;
            }
        }
        if !seen {
            log.ev("wrap", "LogOff NOT seen in 5 s: refusing to log on");
            open_url("steam://open/goonline");
            std::process::exit(3);
        }
        log.ev("wrap", "Mac Steam LogOff seen");
    }

    let servers = ServerList::discover().await?;
    let unauth = UnAuthenticatedConnection::connect(&servers).await?;
    let mut loggedoff = Box::pin(unauth.on::<CMsgClientLoggedOff>());
    let c = unauth.login_with_refresh_token(&token).await?;
    log.ev("logon", "Rust session logged on");

    if mode == "wrapped" {
        open_url("steam://open/goonline");
        log.ev("wrap", "goonline sent");
    }

    let end = Instant::now() + Duration::from_secs(hold);
    let mut next_ping = Instant::now() + Duration::from_secs(20);
    let mut alive = true;
    while Instant::now() < end {
        tokio::select! {
            m = loggedoff.next() => {
                match m {
                    Some(Ok(m)) => log.ev("KICKED", format!("ClientLoggedOff eresult {}", m.eresult())),
                    _ => log.ev("KICKED", "ClientLoggedOff (undecodable) / stream ended"),
                }
                alive = false;
                break;
            }
            _ = tokio::time::sleep(Duration::from_millis(500)) => {}
        }
        for l in clog_new(&mut cpos) {
            log.ev("macsteam", l);
        }
        if Instant::now() >= next_ping {
            next_ping += Duration::from_secs(20);
            let r: Result<CMsgClientPICSAccessTokenResponse, _> =
                tokio::time::timeout(Duration::from_secs(10), c.job(CMsgClientPICSAccessTokenRequest { appids: vec![480], ..Default::default() }))
                    .await
                    .unwrap_or_else(|_| Err(steam_vent::NetworkError::Timeout));
            match r {
                Ok(_) => log.ev("alive", "session answers (PICS access token)"),
                Err(e) => {
                    log.ev("DEAD", format!("session call failed: {e}"));
                    alive = false;
                    break;
                }
            }
        }
    }
    for l in clog_new(&mut cpos) {
        log.ev("macsteam", l);
    }
    log.ev("end", format!("hold over; Rust session alive at end: {alive}. Now check Friends in Mac Steam."));
    Ok(())
}
