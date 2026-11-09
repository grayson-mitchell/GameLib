//! Spike 072: Steam sign-in from Rust, producing a refresh token GameLib can log on with.
//!
//! A local page at http://127.0.0.1:7172 drives three flows so the operator's password and codes
//! go from the browser to this process only, never through a terminal transcript:
//!   QR          IAuthenticationService over the Web API (HTTPS, protobuf-encoded); steam-vent
//!               keeps unauthenticated CM service calls crate-private, so this needs no patch.
//!   Password    steam-vent's own `UnAuthenticatedConnection::login` with a confirmation handler
//!               that waits for a Steam Guard code typed into the page (email or mobile).
//!   Verify      log on to the CM with the newly issued refresh token (steam-vent, no account name).
//!
//! Every CM logon of the user runs inside the macOS go-offline wrap (071a/run-authed.sh, here in
//! Rust). Tokens stay in memory: the page and out/events.json show only the JWT's sub/aud/exp and
//! the token length, never the token, password or codes.

use axum::extract::{Form, State as AxState};
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::StreamExt;
use base64::Engine;
use serde::Deserialize;
use serde_json::{Value, json};
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};
use steam_vent::auth::{
    AuthConfirmationHandler, ClientInfo, ConfirmationAction, ConfirmationMethod, ConfirmationMethodClass,
    GuardDataStore, RefreshToken, SteamGuardToken,
};
use steam_vent::connection::UnAuthenticatedConnection;
use steam_vent::{ReadonlyConnection, ServerList};
use steam_vent_proto::protobuf::{EnumOrUnknown, Message, MessageField};
use steam_vent_proto::steammessages_auth_steamclient::{
    CAuthentication_BeginAuthSessionViaQR_Request, CAuthentication_BeginAuthSessionViaQR_Response,
    CAuthentication_DeviceDetails, CAuthentication_PollAuthSessionStatus_Request,
    CAuthentication_PollAuthSessionStatus_Response, EAuthTokenPlatformType,
};
use steam_vent_proto::steammessages_clientserver::CMsgClientLicenseList;
use tokio::sync::oneshot;

type R<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;
const DEVICE_NAME: &str = "GameLib spike 072";

#[derive(Default)]
struct St {
    t0: Option<Instant>,
    events: Vec<Value>,
    qr_svg: Option<String>,
    waiting_for_code: Option<String>,
    code_tx: Option<oneshot::Sender<String>>,
    token: Option<(String, String)>, // (source, refresh token) — never serialized
    results: serde_json::Map<String, Value>,
    busy: bool,
}
type Shared = Arc<Mutex<St>>;

fn ev(s: &Shared, cat: &str, msg: impl Into<String>) {
    let mut st = s.lock().unwrap();
    let t = st.t0.get_or_insert_with(Instant::now).elapsed().as_secs_f64();
    let iso = humantime_now();
    let msg = msg.into();
    eprintln!("[{t:>8.3}s] {cat:<8} {msg}");
    st.events.push(json!({ "t": t, "at": iso, "cat": cat, "msg": msg }));
    let _ = std::fs::create_dir_all("out");
    let _ = std::fs::write("out/events.json", serde_json::to_string_pretty(&json!({ "events": st.events, "results": st.results })).unwrap());
}

fn result(s: &Shared, key: &str, v: Value) {
    s.lock().unwrap().results.insert(key.into(), v);
    ev(s, "result", format!("{key} recorded"));
}

fn humantime_now() -> String {
    let d = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap();
    format!("{}.{:03}Z(unix)", d.as_secs(), d.subsec_millis())
}

/// Public JWT claims only.
fn token_info(token: &str) -> Value {
    let claims = token
        .split('.')
        .nth(1)
        .and_then(|p| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(p.trim_end_matches('=')).ok())
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or(Value::Null);
    json!({ "len": token.len(), "sub": claims["sub"], "aud": claims["aud"], "exp": claims["exp"] })
}

// ---------- macOS go-offline wrap ----------

fn connection_log() -> std::path::PathBuf {
    std::path::PathBuf::from(std::env::var("HOME").unwrap()).join("Library/Application Support/Steam/logs/connection_log.txt")
}

fn steam_running() -> bool {
    std::process::Command::new("pgrep").args(["-x", "steam_osx"]).output().map(|o| o.status.success()).unwrap_or(false)
}

/// gooffline, then wait ≤5 s for Mac Steam's user-initiated LogOff. Returns false (and goes back
/// online) when it isn't seen; the caller must then not log on.
async fn wrap_offline(s: &Shared) -> bool {
    if !steam_running() {
        ev(s, "wrap", "Mac Steam not running: no wrap needed");
        return true;
    }
    let start = std::fs::metadata(connection_log()).map(|m| m.len()).unwrap_or(0);
    let _ = std::process::Command::new("open").args(["-g", "steam://open/gooffline"]).status();
    for i in 0..50 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        if let Ok(b) = std::fs::read(connection_log()) {
            if b.len() as u64 > start && String::from_utf8_lossy(&b[start as usize..]).contains("user initiated logoff") {
                ev(s, "wrap", format!("Mac Steam LogOff seen after ~{} ms", (i + 1) * 100));
                return true;
            }
        }
    }
    ev(s, "wrap", "LogOff NOT seen in 5 s: refusing to log on");
    wrap_online(s);
    false
}

fn wrap_online(s: &Shared) {
    if steam_running() {
        let _ = std::process::Command::new("open").args(["-g", "steam://open/goonline"]).status();
        ev(s, "wrap", "goonline sent");
    }
}

// ---------- QR over the Web API ----------

async fn webapi<Req: Message, Rsp: Message>(method: &str, req: &Req) -> R<Rsp> {
    let body = base64::engine::general_purpose::STANDARD.encode(req.write_to_bytes()?);
    let resp = reqwest::Client::new()
        .post(format!("https://api.steampowered.com/IAuthenticationService/{method}/v1"))
        .form(&[("input_protobuf_encoded", body)])
        .send()
        .await?;
    let eresult = resp.headers().get("x-eresult").and_then(|v| v.to_str().ok()).unwrap_or("?").to_string();
    let status = resp.status();
    let bytes = resp.bytes().await?;
    if eresult != "1" {
        return Err(format!("{method}: HTTP {status}, x-eresult {eresult}").into());
    }
    Ok(Rsp::parse_from_bytes(&bytes)?)
}

async fn qr_flow(s: Shared) -> R<()> {
    let details = CAuthentication_DeviceDetails {
        device_friendly_name: Some(DEVICE_NAME.into()),
        platform_type: Some(EnumOrUnknown::new(EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient)),
        os_type: Some(-500), // EOSType macOS (generic); steam-session sends the host OS
        ..Default::default()
    };
    let begin: CAuthentication_BeginAuthSessionViaQR_Response = webapi(
        "BeginAuthSessionViaQR",
        &CAuthentication_BeginAuthSessionViaQR_Request {
            device_friendly_name: Some(DEVICE_NAME.into()),
            platform_type: Some(EnumOrUnknown::new(EAuthTokenPlatformType::k_EAuthTokenPlatformType_SteamClient)),
            device_details: MessageField::some(details),
            ..Default::default()
        },
    )
    .await?;
    let mut client_id = begin.client_id();
    let request_id = begin.request_id().to_vec();
    let interval = Duration::from_secs_f32(begin.interval().max(1.0));
    let set_qr = |url: &str| {
        let svg = qrcode::QrCode::new(url.as_bytes()).map(|c| c.render::<qrcode::render::svg::Color>().min_dimensions(260, 260).build()).ok();
        s.lock().unwrap().qr_svg = svg;
    };
    set_qr(begin.challenge_url());
    ev(&s, "qr", format!("session started (platform SteamClient over Web API), poll every {:?}; scan with the Steam mobile app", interval));
    let deadline = Instant::now() + Duration::from_secs(180);
    let mut remote_seen = false;
    while Instant::now() < deadline {
        tokio::time::sleep(interval).await;
        let p: CAuthentication_PollAuthSessionStatus_Response = webapi(
            "PollAuthSessionStatus",
            &CAuthentication_PollAuthSessionStatus_Request { client_id: Some(client_id), request_id: Some(request_id.clone()), ..Default::default() },
        )
        .await?;
        if p.has_new_client_id() {
            client_id = p.new_client_id();
            set_qr(p.new_challenge_url());
            ev(&s, "qr", "challenge rotated, QR updated");
        }
        if p.had_remote_interaction() && !remote_seen {
            remote_seen = true;
            ev(&s, "qr", "scanned on the phone, waiting for approval");
        }
        if p.has_refresh_token() {
            let tok = p.refresh_token().to_string();
            let info = token_info(&tok);
            ev(&s, "qr", format!("APPROVED: refresh token issued ({} chars), account name returned: {}", tok.len(), p.has_account_name()));
            result(&s, "qr", json!({ "status": "PASS", "token": info, "account_name_returned": p.has_account_name(), "via": "Web API, platform SteamClient" }));
            let mut st = s.lock().unwrap();
            st.qr_svg = None;
            st.token = Some(("qr".into(), tok));
            return Ok(());
        }
    }
    s.lock().unwrap().qr_svg = None;
    Err("QR not approved within 180 s".into())
}

// ---------- password + Steam Guard via steam-vent ----------

struct PageCode(Shared);

impl AuthConfirmationHandler for PageCode {
    fn handle_confirmation<'this>(&'this mut self, allowed: &[ConfirmationMethod]) -> Box<dyn Future<Output = Option<ConfirmationAction>> + 'this> {
        let kinds: Vec<&str> = allowed.iter().map(|m| m.confirmation_type()).collect();
        ev(&self.0, "guard", format!("Steam offers: {}", kinds.join(", ")));
        let code_method = allowed.iter().find(|m| m.class() == ConfirmationMethodClass::Code);
        let confirm = allowed.iter().any(|m| m.class() == ConfirmationMethodClass::Confirmation);
        let s = self.0.clone();
        match code_method {
            Some(m) => {
                let kind = m.confirmation_type().to_string();
                let tt = m.token_type();
                let (tx, rx) = oneshot::channel();
                {
                    let mut st = s.lock().unwrap();
                    st.waiting_for_code = Some(kind.clone());
                    st.code_tx = Some(tx);
                }
                ev(&s, "guard", format!("waiting for a {kind} code from the page{}", if confirm { " (approving in the app also works)" } else { "" }));
                Box::new(async move {
                    let code = rx.await.ok()?;
                    s.lock().unwrap().waiting_for_code = None;
                    ev(&s, "guard", format!("{kind} code submitted ({} chars)", code.len()));
                    s.lock().unwrap().results.insert("cred_guard_type".into(), json!(kind));
                    Some(ConfirmationAction::GuardToken(SteamGuardToken::new(code), tt?))
                })
            }
            None if confirm => {
                ev(&s, "guard", "approve the sign-in in the Steam mobile app");
                s.lock().unwrap().results.insert("cred_guard_type".into(), json!("device confirmation"));
                Box::new(async { Some(ConfirmationAction::None) })
            }
            None => Box::new(async { None }),
        }
    }
}

/// No stored machine token: forces a Guard prompt and writes nothing to disk.
struct NoGuardData;
impl GuardDataStore for NoGuardData {
    type Err = std::io::Error;
    fn store(&mut self, _a: &str, _t: String) -> impl Future<Output = Result<(), Self::Err>> + Send {
        async { Ok(()) }
    }
    fn load(&mut self, _a: &str) -> impl Future<Output = Result<Option<String>, Self::Err>> + Send {
        async { Ok(None) }
    }
}

async fn cred_flow(s: Shared, account: String, password: String) -> R<()> {
    if !wrap_offline(&s).await {
        return Err("go-offline wrap failed".into());
    }
    let out = async {
        let servers = ServerList::discover().await?;
        let unauth = UnAuthenticatedConnection::connect(&servers).await?;
        let mut lic = Box::pin(unauth.on::<CMsgClientLicenseList>());
        ev(&s, "cred", "CM connected; beginning password auth (platform SteamClient)");
        let conn = unauth
            .login(&account, &password, NoGuardData, PageCode(s.clone()), &ClientInfo::new(DEVICE_NAME.into()))
            .await?;
        drop(password);
        let licenses = match tokio::time::timeout(Duration::from_secs(10), lic.next()).await {
            Ok(Some(Ok(l))) => Some(l.licenses.len()),
            _ => None,
        };
        let tok = conn.refresh_token().token().to_string();
        ev(&s, "cred", format!("SIGNED IN and logged on: refresh token issued ({} chars), {licenses:?} licenses", tok.len()));
        let gt = s.lock().unwrap().results.get("cred_guard_type").cloned();
        result(&s, &format!("credentials_{}", gt.as_ref().and_then(|v| v.as_str()).unwrap_or("none").replace(' ', "_")), json!({ "status": "PASS", "token": token_info(&tok), "licenses": licenses, "guard": gt }));
        s.lock().unwrap().token = Some(("credentials".into(), tok));
        R::Ok(())
    }
    .await;
    wrap_online(&s);
    out
}

// ---------- verify the new token by logging on ----------

async fn verify_flow(s: Shared) -> R<()> {
    let Some((source, tok)) = s.lock().unwrap().token.clone() else { return Err("no token yet".into()) };
    let token = RefreshToken::new(tok)?;
    if !wrap_offline(&s).await {
        return Err("go-offline wrap failed".into());
    }
    let out = async {
        let servers = ServerList::discover().await?;
        let unauth = UnAuthenticatedConnection::connect(&servers).await?;
        let mut lic = Box::pin(unauth.on::<CMsgClientLicenseList>());
        let _conn = unauth.login_with_refresh_token(&token).await?;
        let licenses = match tokio::time::timeout(Duration::from_secs(10), lic.next()).await {
            Ok(Some(Ok(l))) => Some(l.licenses.len()),
            _ => None,
        };
        ev(&s, "verify", format!("logon with the {source} token (no account name): ok, {licenses:?} licenses"));
        result(&s, &format!("verify_{source}_token"), json!({ "status": "PASS", "licenses": licenses }));
        R::Ok(())
    }
    .await;
    wrap_online(&s);
    out
}

// ---------- web ----------

fn spawn_flow<F, Fut>(s: &Shared, name: &'static str, f: F)
where
    F: FnOnce(Shared) -> Fut + Send + 'static,
    Fut: Future<Output = R<()>> + 'static,
{
    {
        let mut st = s.lock().unwrap();
        if st.busy {
            drop(st);
            ev(s, "page", format!("{name}: another flow is running"));
            return;
        }
        st.busy = true;
    }
    let s = s.clone();
    // steam-vent's confirmation futures aren't Send: run each flow on its own current-thread runtime.
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let r = rt.block_on(f(s.clone()));
        if let Err(e) = r {
            ev(&s, "error", format!("{name}: {e}"));
            s.lock().unwrap().results.entry(name.to_string()).or_insert(json!({ "status": "FAIL", "error": e.to_string() }));
        }
        let mut st = s.lock().unwrap();
        st.busy = false;
        st.waiting_for_code = None;
        st.code_tx = None;
    });
}

#[derive(Deserialize)]
struct CredForm {
    account: String,
    password: String,
}
#[derive(Deserialize)]
struct CodeForm {
    code: String,
}

async fn state(AxState(s): AxState<Shared>) -> Json<Value> {
    let st = s.lock().unwrap();
    Json(json!({
        "events": st.events, "qr_svg": st.qr_svg, "waiting_for_code": st.waiting_for_code, "busy": st.busy,
        "token": st.token.as_ref().map(|(src, t)| json!({ "source": src, "info": token_info(t) })), "results": st.results,
    }))
}

#[tokio::main]
async fn main() {
    let s: Shared = Arc::new(Mutex::new(St::default()));
    ev(&s, "start", "spike 072 harness on http://127.0.0.1:7172");
    let app = Router::new()
        .route("/", get(|| async { Html(include_str!("page.html")) }))
        .route("/state", get(state))
        .route("/qr", post(|AxState(s): AxState<Shared>| async move { spawn_flow(&s, "qr", qr_flow); "ok" }))
        .route(
            "/cred",
            post(|AxState(s): AxState<Shared>, Form(f): Form<CredForm>| async move {
                spawn_flow(&s, "credentials", move |s| cred_flow(s, f.account, f.password));
                "ok"
            }),
        )
        .route(
            "/code",
            post(|AxState(s): AxState<Shared>, Form(f): Form<CodeForm>| async move {
                let tx = s.lock().unwrap().code_tx.take();
                match tx {
                    Some(tx) => {
                        let _ = tx.send(f.code.trim().to_string());
                        "ok".into_response()
                    }
                    None => "no code requested".into_response(),
                }
            }),
        )
        .route("/verify", post(|AxState(s): AxState<Shared>| async move { spawn_flow(&s, "verify", verify_flow); "ok" }))
        .with_state(s.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:7172").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
