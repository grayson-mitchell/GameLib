//! Spike 081: an authenticated steam-vent session on GameLib's refresh token doing a depot-shaped
//! cycle every <period_s> (PICS access token + product info for <app>, depot decryption key for
//! <depot>, manifest request code for the public gid, CDN server list) while steam-user (non-zero
//! logonID) and Mac Steam are online on the same account.
//!
//!   spike-081-vent-work <vault.json> <label> <hold_s> <app> <depot> [period_s=20]
//!
//! Only eresults, counts and "ok"/"ZERO" are logged: never the key, the request code or the token.
//! ClientLoggedOff is subscribed for the whole hold (077). Lines go to stderr and out/<label>.log.

use futures_util::StreamExt;
use std::io::Write;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use steam_vent::auth::RefreshToken;
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{Connection, ConnectionTrait, ReadonlyConnection, ServerList};
use steam_vent_proto::steammessages_clientserver_2::{CMsgClientGetDepotDecryptionKey, CMsgClientGetDepotDecryptionKeyResponse};
use steam_vent_proto::steammessages_clientserver_appinfo::{
    CMsgClientPICSAccessTokenRequest, CMsgClientPICSAccessTokenResponse, CMsgClientPICSProductInfoRequest,
    CMsgClientPICSProductInfoResponse, cmsg_client_picsproduct_info_request,
};
use steam_vent_proto::steammessages_clientserver_login::CMsgClientLoggedOff;
use steam_vent_proto::steammessages_contentsystem_steamclient::{
    CContentServerDirectory_GetManifestRequestCode_Request, CContentServerDirectory_GetServersForSteamPipe_Request,
};

type R<T> = Result<T, Box<dyn std::error::Error>>;

fn iso() -> String {
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let secs = ms.div_euclid(1000);
    let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let dd = doy - (153 * mp + 2) / 5 + 1;
    let mm = if mp < 10 { mp + 3 } else { mp - 9 };
    let yy = yoe + era * 400 + if mm <= 2 { 1 } else { 0 };
    format!("{yy:04}-{mm:02}-{dd:02}T{h:02}:{m:02}:{s:02}.{:03}Z", ms.rem_euclid(1000))
}

struct Log {
    label: String,
    f: std::fs::File,
}
impl Log {
    fn ev(&mut self, cat: &str, msg: impl AsRef<str>) {
        let line = format!("{} {:<8} {:<7} {}", iso(), self.label, cat, msg.as_ref());
        eprintln!("{line}");
        let _ = writeln!(self.f, "{line}");
    }
}

fn public_gid(buf: &[u8], depot: u32) -> Option<String> {
    let text = String::from_utf8_lossy(buf);
    let vdf = keyvalues_parser::Vdf::parse(text.trim().trim_end_matches('\0')).ok()?;
    let root = vdf.value.get_obj()?;
    let dep = root.get("depots")?.first()?.get_obj()?.get(depot.to_string().as_str())?.first()?.get_obj()?;
    let public = dep.get("manifests")?.first()?.get_obj()?.get("public")?.first()?;
    match public {
        keyvalues_parser::Value::Str(s) => Some(s.to_string()),
        keyvalues_parser::Value::Obj(o) => o.get("gid")?.first()?.get_str().map(str::to_string),
    }
}

async fn cycle(c: &Connection, app: u32, depot: u32) -> R<String> {
    let tok: CMsgClientPICSAccessTokenResponse =
        c.job(CMsgClientPICSAccessTokenRequest { appids: vec![app], ..Default::default() }).await?;
    let at = tok.app_access_tokens.iter().find(|t| t.appid() == app).map(|t| t.access_token()).unwrap_or(0);
    let req = CMsgClientPICSProductInfoRequest {
        apps: vec![cmsg_client_picsproduct_info_request::AppInfo { appid: Some(app), access_token: Some(at), ..Default::default() }],
        meta_data_only: Some(false),
        ..Default::default()
    };
    let mut buf = None;
    let mut stream = std::pin::pin!(c.job_multi::<_, CMsgClientPICSProductInfoResponse>(req));
    while let Some(part) = stream.next().await {
        for a in part?.apps {
            if a.appid() == app {
                buf = Some(a.buffer().to_vec());
            }
        }
    }
    let gid = public_gid(&buf.ok_or("app missing from PICS")?, depot).ok_or("no public gid")?;
    let key: CMsgClientGetDepotDecryptionKeyResponse =
        c.job(CMsgClientGetDepotDecryptionKey { depot_id: Some(depot), app_id: Some(app), ..Default::default() }).await?;
    let code = c
        .service_method(CContentServerDirectory_GetManifestRequestCode_Request {
            app_id: Some(app),
            depot_id: Some(depot),
            manifest_id: Some(gid.parse()?),
            app_branch: Some("public".into()),
            ..Default::default()
        })
        .await?
        .manifest_request_code();
    let cdn = c
        .service_method(CContentServerDirectory_GetServersForSteamPipe_Request { cell_id: Some(0), max_servers: Some(20), ..Default::default() })
        .await?;
    Ok(format!(
        "pics=ok depotkey eresult {} reqcode {} cdn {} servers",
        key.eresult(),
        if code != 0 { "ok" } else { "ZERO" },
        cdn.servers.len()
    ))
}

#[tokio::main]
async fn main() -> R<()> {
    let a: Vec<String> = std::env::args().skip(1).collect();
    if a.len() < 5 {
        eprintln!("usage: <vault.json> <label> <hold_s> <app> <depot> [period_s]");
        std::process::exit(64);
    }
    let (vault, label, hold, app, depot) = (&a[0], a[1].clone(), a[2].parse::<u64>()?, a[3].parse::<u32>()?, a[4].parse::<u32>()?);
    let period = a.get(5).map(|p| p.parse::<u64>()).transpose()?.unwrap_or(20);
    std::fs::create_dir_all("out")?;
    let mut log = Log { f: std::fs::File::create(format!("out/{label}.log"))?, label };
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(vault)?)?;
    let token = RefreshToken::new(v["steam-refresh-token"].as_str().ok_or("no token")?.to_string())?;
    log.ev("start", format!("steam-vent@a9e8164, ip=0, app {app} depot {depot}, hold {hold}s, cycle every {period}s"));
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
    let mut next = Instant::now() + Duration::from_secs(2);
    let (mut cycles, mut alive) = (0u32, true);
    while Instant::now() < end && alive {
        tokio::select! {
            m = loggedoff.next() => {
                log.ev("KICKED", match m { Some(Ok(m)) => format!("ClientLoggedOff eresult {}", m.eresult()), _ => "ClientLoggedOff stream ended".into() });
                alive = false;
            }
            _ = tokio::time::sleep(Duration::from_millis(250)) => {}
        }
        if alive && Instant::now() >= next {
            next += Duration::from_secs(period);
            let t = Instant::now();
            match tokio::time::timeout(Duration::from_secs(30), cycle(&c, app, depot)).await {
                Ok(Ok(s)) => {
                    cycles += 1;
                    log.ev("cycle", format!("#{cycles} {s} {}ms", t.elapsed().as_millis()));
                }
                Ok(Err(e)) => {
                    log.ev("DEAD", format!("cycle failed: {e}"));
                    alive = false;
                }
                Err(_) => {
                    log.ev("DEAD", "cycle timed out after 30s");
                    alive = false;
                }
            }
        }
    }
    log.ev("end", format!("alive_at_end={alive} cycles={cycles}"));
    std::process::exit(if alive { 0 } else { 1 });
}
