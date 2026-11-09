//! Spike 077: hold a steam-vent (a9e8164) session on GameLib's refresh token and report whether it
//! gets kicked while another session for the same account (steam-user) is alive.
//!
//!   spike-077-vent-hold <vault.json> <label> <hold_s>
//!
//! steam-vent sends obfuscated_private_ip = 0 (hard-coded in session.rs). Every 10 s the session
//! proves it is alive with a PICS access-token call. A ClientLoggedOff, a failed call or a closed
//! stream ends the hold. Lines: "<ISO ms> <label> <cat> <msg>" on stderr and out/<label>.log.
//! No secrets are printed.

use futures_util::StreamExt;
use std::io::Write;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use steam_vent::auth::RefreshToken;
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{ConnectionTrait, ReadonlyConnection, ServerList};
use steam_vent_proto::steammessages_clientserver_appinfo::{CMsgClientPICSAccessTokenRequest, CMsgClientPICSAccessTokenResponse};
use steam_vent_proto::steammessages_clientserver_login::CMsgClientLoggedOff;

type R<T> = Result<T, Box<dyn std::error::Error>>;

fn iso() -> String {
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    let ms = d.as_millis() as i64;
    // UTC ISO-8601 with ms, no chrono dependency
    let secs = ms.div_euclid(1000);
    let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // civil-from-days (Howard Hinnant)
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let dd = doy - (153 * mp + 2) / 5 + 1;
    let mm = if mp < 10 { mp + 3 } else { mp - 9 };
    let yy = if mm <= 2 { y + 1 } else { y };
    format!("{yy:04}-{mm:02}-{dd:02}T{h:02}:{m:02}:{s:02}.{:03}Z", ms.rem_euclid(1000))
}

struct Log {
    label: String,
    f: std::fs::File,
}
impl Log {
    fn ev(&mut self, cat: &str, msg: impl AsRef<str>) {
        let line = format!("{} {:<10} {:<7} {}", iso(), self.label, cat, msg.as_ref());
        eprintln!("{line}");
        let _ = writeln!(self.f, "{line}");
    }
}

#[tokio::main]
async fn main() -> R<()> {
    let a: Vec<String> = std::env::args().skip(1).collect();
    if a.len() < 3 {
        eprintln!("usage: <vault.json> <label> <hold_s>");
        std::process::exit(64);
    }
    let (vault, label, hold) = (&a[0], a[1].clone(), a[2].parse::<u64>()?);
    std::fs::create_dir_all("out")?;
    let mut log = Log { f: std::fs::File::create(format!("out/{label}.log"))?, label };
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(vault)?)?;
    let token = RefreshToken::new(v["steam-refresh-token"].as_str().ok_or("no token")?.to_string())?;
    log.ev("start", format!("steam-vent@a9e8164, obfuscated_private_ip=0 (hard-coded), hold {hold}s"));

    let servers = ServerList::discover().await?;
    let unauth = UnAuthenticatedConnection::connect(&servers).await?;
    let mut loggedoff = Box::pin(unauth.on::<CMsgClientLoggedOff>());
    let c = match unauth.login_with_refresh_token(&token).await {
        Ok(c) => c,
        Err(e) => {
            log.ev("LOGONERR", format!("{e}"));
            std::process::exit(2);
        }
    };
    log.ev("logon", "logged on");

    let end = Instant::now() + Duration::from_secs(hold);
    let mut next_ping = Instant::now() + Duration::from_secs(2);
    let mut answered = 0u32;
    let mut alive = true;
    let mut kicked = false;
    while Instant::now() < end {
        tokio::select! {
            m = loggedoff.next(), if !kicked => {
                match m {
                    Some(Ok(m)) => log.ev("KICKED", format!("ClientLoggedOff eresult {}", m.eresult())),
                    other => log.ev("KICKED", format!("ClientLoggedOff stream: {}", if other.is_none() { "ended" } else { "undecodable" })),
                }
                alive = false;
                if std::env::var("SPIKE_KEEP_PINGING").is_err() { break; }
                log.ev("probe", "SPIKE_KEEP_PINGING: continuing calls on the kicked connection");
                kicked = true;
            }
            _ = tokio::time::sleep(Duration::from_millis(250)) => {}
        }
        if Instant::now() >= next_ping {
            next_ping += Duration::from_secs(10);
            let r: Result<CMsgClientPICSAccessTokenResponse, _> =
                tokio::time::timeout(Duration::from_secs(8), c.job(CMsgClientPICSAccessTokenRequest { appids: vec![480], ..Default::default() }))
                    .await
                    .unwrap_or_else(|_| Err(steam_vent::NetworkError::Timeout));
            match r {
                Ok(_) => {
                    answered += 1;
                    if !alive { log.ev("ZOMBIE", "call answered AFTER the kick"); }
                    log.ev("alive", format!("PICS access token answered (#{answered})"));
                }
                Err(e) => {
                    log.ev("DEAD", format!("call failed: {e}"));
                    alive = false;
                    if std::env::var("SPIKE_KEEP_PINGING").is_err() || answered > 1000 { break; }
                }
            }
        }
    }
    log.ev("end", format!("alive_at_end={alive} answered={answered}"));
    std::process::exit(if alive { 0 } else { 1 });
}
