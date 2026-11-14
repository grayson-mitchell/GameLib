//! The synchronous facade over the CM layer that `dispatch` calls.
//!
//! `Core<B>` owns the signed-in session actor, the anonymous actor, the sign-in flows and the
//! wrap host; it is generic over the backend so tests drive it with `FakeBackend`. The module
//! level functions delegate to one global `Core<SteamVentBackend>` and run it on the crate
//! runtime (`runtime::block_on_guarded`).
//!
//! CM failures are typed results `{ok:false, kind, eresult?}`, never `Err`. `Err` is only the
//! nested-runtime refusal.
//!
//! Nothing here formats a token, password, guard code, key or request code into a log line
//! (T-28-04).

use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::Duration;

use futures_util::future::BoxFuture;
use serde_json::{json, Map, Value};

use crate::anon::AnonHandle;
use crate::backend::{CmBackend, CmConn, OwnedOpts, RefreshTokenSecret};
use crate::error::{eresult_of, CmError};
use crate::ops::{account, depot, pics};
use crate::runtime::block_on_guarded;
use crate::session::{
    LeaseId, LogonWrap, NoWrap, OpFailure, RestoreOnlyWrap, RestoreOutcome, RestoreTrigger,
    SessionHandle,
};
use crate::vent::SteamVentBackend;
use crate::webauth::{WebAuth, WebAuthError, STEAM_API_BASE};
use crate::wrap::WrapHost;

/// `STEAM_PICS_TIMEOUT_MS`.
pub const PICS_TIMEOUT: Duration = Duration::from_secs(25);
pub const DEPOT_KEY_TIMEOUT: Duration = Duration::from_secs(10);
pub const REQUEST_CODE_TIMEOUT: Duration = Duration::from_secs(10);
pub const CONTENT_SERVERS_TIMEOUT: Duration = Duration::from_secs(15);
pub const OWNED_TIMEOUT: Duration = Duration::from_secs(30);
pub const REDEEM_TIMEOUT: Duration = Duration::from_secs(20);
/// `SIGN_IN_PERSONA_TIMEOUT_MS`.
pub const PERSONAS_TIMEOUT: Duration = Duration::from_secs(5);

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// `{ok:false, kind, eresult?}` for a failed signed-in or anonymous op.
pub(crate) fn failure(f: &OpFailure) -> Value {
    let mut m = Map::new();
    m.insert("ok".into(), json!(false));
    let kind = match f {
        OpFailure::LeaseUnknown => "leaseUnknown",
        OpFailure::Timeout => "timeout",
        OpFailure::Replaced => "replaced",
        OpFailure::Ambiguous => "ambiguous",
        OpFailure::ShuttingDown => "shuttingDown",
        OpFailure::Cm(e) => {
            if let Some(n) = eresult_of(e) {
                m.insert("eresult".into(), json!(n));
            }
            match e {
                CmError::EResult(_) => "eresult",
                CmError::Timeout => "timeout",
                CmError::Closed | CmError::Io(_) | CmError::Discovery => "network",
                CmError::Replaced => "replaced",
                CmError::Protocol(_) => "protocol",
                CmError::Unsupported => "unsupported",
            }
        }
    };
    m.insert("kind".into(), json!(kind));
    Value::Object(m)
}

fn web_failure(e: &WebAuthError) -> Value {
    match e {
        WebAuthError::EResult(n) => json!({"ok": false, "kind": "eresult", "eresult": n}),
        WebAuthError::Timeout => json!({"ok": false, "kind": "timeout"}),
        WebAuthError::Network => json!({"ok": false, "kind": "network"}),
        WebAuthError::Protocol(_) => json!({"ok": false, "kind": "protocol"}),
    }
}

fn ok_result(v: Value) -> Value {
    json!({"ok": true, "result": v})
}

/// Serialise `v` (a tagged object) with `ok:true` merged in.
fn ok_merged<T: serde::Serialize>(v: &T) -> Value {
    let mut val = serde_json::to_value(v).unwrap_or(Value::Null);
    if let Value::Object(m) = &mut val {
        m.insert("ok".into(), json!(true));
    }
    val
}

pub(crate) struct Core<B: CmBackend> {
    backend: Arc<B>,
    session: Mutex<Option<SessionHandle<B>>>,
    anon: Mutex<Option<AnonHandle<B>>>,
    webauth: OnceLock<WebAuth>,
    host: Mutex<Option<Arc<dyn WrapHost>>>,
    app_folder: Mutex<Option<PathBuf>>,
}

impl<B: CmBackend> Core<B> {
    pub(crate) fn new(backend: Arc<B>) -> Self {
        Self {
            backend,
            session: Mutex::new(None),
            anon: Mutex::new(None),
            webauth: OnceLock::new(),
            host: Mutex::new(None),
            app_folder: Mutex::new(None),
        }
    }

    pub(crate) fn set_wrap_host(&self, host: Arc<dyn WrapHost>) {
        *lock(&self.host) = Some(host);
    }

    fn session(&self) -> Option<SessionHandle<B>> {
        lock(&self.session).clone()
    }

    /// Must run inside the runtime (the actor is `tokio::spawn`ed).
    fn anon(&self) -> AnonHandle<B> {
        lock(&self.anon)
            .get_or_insert_with(|| AnonHandle::spawn(self.backend.clone()))
            .clone()
    }

    fn webauth(&self) -> &WebAuth {
        self.webauth.get_or_init(|| {
            crate::install_crypto_provider();
            WebAuth::new(STEAM_API_BASE)
        })
    }

    /// Choose the platform wrap: macOS needs a host (so a logon can never skip it), the PASS
    /// branch of D-09 uses `RestoreOnlyWrap`; everything else `NoWrap`.
    pub(crate) fn configure(&self, app_folder: PathBuf) -> Result<(), String> {
        if cfg!(target_os = "macos") {
            let host = lock(&self.host)
                .clone()
                .ok_or_else(|| "steamcm:wrap-host-missing".to_string())?;
            self.configure_with(
                app_folder.clone(),
                Arc::new(RestoreOnlyWrap { host, app_folder }),
            );
        } else {
            self.configure_with(app_folder, Arc::new(NoWrap));
        }
        Ok(())
    }

    /// Must run inside the runtime. Idempotent: the first configure wins.
    pub(crate) fn configure_with<W: LogonWrap>(&self, app_folder: PathBuf, wrap: Arc<W>) {
        *lock(&self.app_folder) = Some(app_folder);
        let mut s = lock(&self.session);
        if s.is_none() {
            *s = Some(SessionHandle::spawn(self.backend.clone(), wrap));
        }
    }

    // ---- session ----

    pub(crate) async fn session_acquire(
        &self,
        refresh_token: String,
        reason: String,
        logon_id: u32,
    ) -> Value {
        let Some(s) = self.session() else {
            return json!({"ok": false, "refusal": "client-not-ready"});
        };
        match s
            .acquire(RefreshTokenSecret::new(refresh_token), reason, logon_id)
            .await
        {
            Ok((lease, steam_id)) => {
                json!({"ok": true, "leaseId": lease, "steamId": steam_id.to_string()})
            }
            Err(r) => {
                let mut v = json!({"ok": false, "refusal": r});
                if let Some(f) = s.status().await.logon_failure {
                    v["logonFailure"] = serde_json::to_value(f).unwrap_or(Value::Null);
                }
                v
            }
        }
    }

    pub(crate) async fn session_acquire_open(&self, reason: String) -> Value {
        let Some(s) = self.session() else {
            return json!({"ok": false});
        };
        match s.acquire_open(reason).await {
            Some((lease, steam_id)) => {
                json!({"ok": true, "leaseId": lease, "steamId": steam_id.to_string()})
            }
            None => json!({"ok": false}),
        }
    }

    pub(crate) fn session_release(&self, lease: LeaseId) -> Value {
        if let Some(s) = self.session() {
            s.release(lease);
        }
        json!({})
    }

    pub(crate) async fn session_ensure_connected(&self) -> Value {
        let connected = match self.session() {
            Some(s) => s.ensure_connected().await,
            None => false,
        };
        json!({"connected": connected})
    }

    pub(crate) async fn session_logout(&self) -> Value {
        if let Some(s) = self.session() {
            s.logout().await;
        }
        json!({})
    }

    pub(crate) async fn session_shutdown(&self, bound: Duration) -> Value {
        let restore = match self.session() {
            Some(s) => tokio::time::timeout(bound, s.shutdown(bound))
                .await
                .unwrap_or(RestoreOutcome::TimedOut),
            None => RestoreOutcome::NotOwed,
        };
        json!({"restore": restore})
    }

    pub(crate) async fn session_status(&self) -> Value {
        match self.session() {
            Some(s) => {
                let st = s.status().await;
                json!({
                    "connected": st.connected,
                    "leaseCount": st.lease_count,
                    "logonFailure": st.logon_failure,
                })
            }
            None => json!({"connected": false, "leaseCount": 0, "logonFailure": null}),
        }
    }

    // ---- signed-in ops ----

    async fn signed(
        &self,
        lease: LeaseId,
        idempotent: bool,
        timeout: Duration,
        f: impl Fn(Arc<B::Conn>) -> BoxFuture<'static, Result<Value, CmError>>,
    ) -> Value {
        let Some(s) = self.session() else {
            return failure(&OpFailure::LeaseUnknown);
        };
        match s.run_op(lease, idempotent, timeout, f).await {
            Ok(v) => ok_result(v),
            Err(e) => failure(&e),
        }
    }

    pub(crate) async fn licenses(&self, lease: LeaseId) -> Value {
        let Some(s) = self.session() else {
            return failure(&OpFailure::LeaseUnknown);
        };
        match s.licenses(lease).await {
            Ok(l) => ok_result(pics::licenses_json(&l)),
            Err(e) => failure(&e),
        }
    }

    pub(crate) async fn product_info(
        &self,
        lease: LeaseId,
        apps: Vec<u32>,
        packages: Vec<u32>,
        incl_tokens: bool,
    ) -> Value {
        self.signed(lease, true, PICS_TIMEOUT, move |c| {
            let (a, p) = (apps.clone(), packages.clone());
            Box::pin(async move { pics::product_info(c.as_ref(), &a, &p, incl_tokens).await })
        })
        .await
    }

    pub(crate) async fn depot_key(&self, lease: LeaseId, app_id: u32, depot_id: u32) -> Value {
        self.signed(
            lease,
            depot::DEPOT_KEY_IDEMPOTENT,
            DEPOT_KEY_TIMEOUT,
            move |c| Box::pin(async move { depot::depot_key(c.as_ref(), app_id, depot_id).await }),
        )
        .await
    }

    pub(crate) async fn manifest_request_code(
        &self,
        lease: LeaseId,
        app_id: u32,
        depot_id: u32,
        manifest_id: String,
        branch: String,
    ) -> Value {
        self.signed(
            lease,
            depot::REQUEST_CODE_IDEMPOTENT,
            REQUEST_CODE_TIMEOUT,
            move |c| {
                let (m, b) = (manifest_id.clone(), branch.clone());
                Box::pin(async move {
                    depot::manifest_request_code(c.as_ref(), app_id, depot_id, &m, &b).await
                })
            },
        )
        .await
    }

    pub(crate) async fn content_servers(&self, lease: LeaseId, app_id: Option<u32>) -> Value {
        self.signed(
            lease,
            depot::CONTENT_SERVERS_IDEMPOTENT,
            CONTENT_SERVERS_TIMEOUT,
            move |c| Box::pin(async move { depot::content_servers(c.as_ref(), app_id).await }),
        )
        .await
    }

    pub(crate) async fn owned_apps(&self, lease: LeaseId, steam_id: u64, opts: OwnedOpts) -> Value {
        self.signed(lease, account::OWNED_IDEMPOTENT, OWNED_TIMEOUT, move |c| {
            Box::pin(async move { account::owned_apps(c.as_ref(), steam_id, opts).await })
        })
        .await
    }

    pub(crate) async fn personas(&self, lease: LeaseId, steam_ids: Vec<u64>) -> Value {
        self.signed(
            lease,
            account::PERSONAS_IDEMPOTENT,
            PERSONAS_TIMEOUT,
            move |c| {
                let ids = steam_ids.clone();
                Box::pin(async move { account::personas(c.as_ref(), &ids, PERSONAS_TIMEOUT).await })
            },
        )
        .await
    }

    /// Non-idempotent: after a rebuild the reply is `ambiguous`, never a resend.
    pub(crate) async fn redeem_key(&self, lease: LeaseId, key: String) -> Value {
        self.signed(
            lease,
            account::REDEEM_IDEMPOTENT,
            REDEEM_TIMEOUT,
            move |c| {
                let k = key.clone();
                Box::pin(async move { account::redeem_key(c.as_ref(), &k).await })
            },
        )
        .await
    }

    // ---- refresh and store (79-30) ----

    /// The whole Refresh (D-12). `client`/`base_url` are injectable for tests.
    pub(crate) async fn refresh_library(
        &self,
        client: &reqwest::Client,
        base_url: &str,
        args: crate::refresh::RefreshArgs,
    ) -> Value
    where
        B::Conn: Send + Sync + 'static,
    {
        let anon = self.anon();
        crate::refresh::refresh_library(self.session(), &anon, client, base_url, args).await
    }

    // ---- anonymous ----

    pub(crate) async fn anon_product_info(
        &self,
        apps: Vec<u32>,
        packages: Vec<u32>,
        incl_tokens: bool,
    ) -> Value {
        let a = self.anon();
        match a
            .run_read("product-info", PICS_TIMEOUT, move |c| {
                Box::pin(async move {
                    pics::product_info(c.as_ref(), &apps, &packages, incl_tokens).await
                })
            })
            .await
        {
            Ok(v) => ok_result(v),
            Err(e) => failure(&e),
        }
    }

    pub(crate) fn anon_close(&self, reason: &str) -> Value {
        let reason: &'static str = match reason {
            "logout" => "logout",
            "shutdown" => "shutdown",
            "signed-in" => "signed-in",
            _ => "requested",
        };
        if let Some(a) = lock(&self.anon).clone() {
            a.close(reason);
        }
        json!({})
    }

    // ---- sign-in ----

    pub(crate) async fn signin_qr_start(&self) -> Value {
        match self.webauth().qr_start().await {
            Ok(q) => ok_merged(&q),
            Err(e) => web_failure(&e),
        }
    }

    pub(crate) async fn signin_credentials_start(
        &self,
        account_name: String,
        password: String,
    ) -> Value {
        match self
            .webauth()
            .credentials_start(&account_name, password)
            .await
        {
            Ok(c) => ok_merged(&c),
            Err(e) => web_failure(&e),
        }
    }

    pub(crate) async fn signin_guard_submit(&self, flow_id: String, code: String) -> Value {
        use crate::webauth::credentials::GuardOutcome;
        match self.webauth().guard_submit(&flow_id, &code).await {
            Ok(GuardOutcome::Accepted) => json!({"ok": true}),
            Ok(GuardOutcome::UnknownFlow) => json!({"ok": false, "kind": "unknownFlow"}),
            Err(e) => web_failure(&e),
        }
    }

    pub(crate) fn signin_status(&self, flow_id: &str) -> Value {
        serde_json::to_value(self.webauth().status(flow_id)).unwrap_or(Value::Null)
    }

    pub(crate) fn signin_cancel(&self, flow_id: &str) -> Value {
        self.webauth().cancel(flow_id);
        json!({})
    }

    // ---- wrap ----

    pub(crate) async fn wrap_restore_if_owed(&self, trigger: RestoreTrigger) -> Value {
        let host = lock(&self.host).clone();
        let folder = lock(&self.app_folder).clone();
        let restore = match (host, folder) {
            (Some(h), Some(f)) => crate::wrap::restore_if_owed(h.as_ref(), &f, trigger).await,
            _ => RestoreOutcome::NotOwed,
        };
        json!({"restore": restore})
    }

    // ---- shutdown ----

    /// Cancel sign-in flows, close the anonymous connection, close the signed-in session and pay
    /// any owed go-online, all within `bound`.
    pub(crate) async fn shutdown_all(&self, bound: Duration) -> RestoreOutcome {
        if let Some(w) = self.webauth.get() {
            w.cancel_all();
        }
        let anon = lock(&self.anon).clone();
        if let Some(a) = anon {
            a.shutdown();
        }
        match self.session() {
            None => RestoreOutcome::NotOwed,
            Some(s) => tokio::time::timeout(bound, s.shutdown(bound))
                .await
                .unwrap_or(RestoreOutcome::TimedOut),
        }
    }

    #[cfg(test)]
    pub(crate) fn host_for_tests(&self) -> Option<Arc<dyn WrapHost>> {
        lock(&self.host).clone()
    }
}

// ---- the global, sync surface ----

static CORE: OnceLock<Core<SteamVentBackend>> = OnceLock::new();

fn core() -> &'static Core<SteamVentBackend> {
    CORE.get_or_init(|| Core::new(Arc::new(SteamVentBackend)))
}

/// Must be called before `configure` on macOS. The shell supplies the production host.
pub fn set_wrap_host(host: Arc<dyn WrapHost>) {
    core().set_wrap_host(host);
}

fn run<F: std::future::Future<Output = Value>>(f: F) -> Result<Value, String> {
    block_on_guarded(f)
}

pub fn configure(app_folder: &str) -> Result<Value, String> {
    crate::vent::install_vent_log_forwarder();
    let folder = PathBuf::from(app_folder);
    block_on_guarded(async { core().configure(folder) })??;
    Ok(json!({}))
}

pub fn session_acquire(
    refresh_token: String,
    reason: String,
    logon_id: u32,
) -> Result<Value, String> {
    run(core().session_acquire(refresh_token, reason, logon_id))
}

pub fn session_acquire_open(reason: String) -> Result<Value, String> {
    run(core().session_acquire_open(reason))
}

pub fn session_release(lease: LeaseId) -> Result<Value, String> {
    run(async { core().session_release(lease) })
}

pub fn session_ensure_connected() -> Result<Value, String> {
    run(core().session_ensure_connected())
}

pub fn session_logout() -> Result<Value, String> {
    run(core().session_logout())
}

pub fn session_shutdown(bound: Duration) -> Result<Value, String> {
    run(core().session_shutdown(bound))
}

pub fn session_status() -> Result<Value, String> {
    run(core().session_status())
}

pub fn licenses(lease: LeaseId) -> Result<Value, String> {
    run(core().licenses(lease))
}

pub fn product_info(
    lease: LeaseId,
    apps: Vec<u32>,
    packages: Vec<u32>,
    incl_tokens: bool,
) -> Result<Value, String> {
    run(core().product_info(lease, apps, packages, incl_tokens))
}

pub fn depot_key(lease: LeaseId, app_id: u32, depot_id: u32) -> Result<Value, String> {
    run(core().depot_key(lease, app_id, depot_id))
}

pub fn manifest_request_code(
    lease: LeaseId,
    app_id: u32,
    depot_id: u32,
    manifest_id: String,
    branch: String,
) -> Result<Value, String> {
    run(core().manifest_request_code(lease, app_id, depot_id, manifest_id, branch))
}

pub fn content_servers(lease: LeaseId, app_id: Option<u32>) -> Result<Value, String> {
    run(core().content_servers(lease, app_id))
}

pub fn owned_apps(lease: LeaseId, steam_id: u64, opts: OwnedOpts) -> Result<Value, String> {
    run(core().owned_apps(lease, steam_id, opts))
}

pub fn personas(lease: LeaseId, steam_ids: Vec<u64>) -> Result<Value, String> {
    run(core().personas(lease, steam_ids))
}

pub fn redeem_key(lease: LeaseId, key: String) -> Result<Value, String> {
    run(core().redeem_key(lease, key))
}

pub fn anon_product_info(
    apps: Vec<u32>,
    packages: Vec<u32>,
    incl_tokens: bool,
) -> Result<Value, String> {
    run(core().anon_product_info(apps, packages, incl_tokens))
}

pub fn anon_close(reason: &str) -> Result<Value, String> {
    run(async { core().anon_close(reason) })
}

pub fn signin_qr_start() -> Result<Value, String> {
    run(core().signin_qr_start())
}

pub fn signin_credentials_start(account_name: String, password: String) -> Result<Value, String> {
    run(core().signin_credentials_start(account_name, password))
}

pub fn signin_guard_submit(flow_id: String, code: String) -> Result<Value, String> {
    run(core().signin_guard_submit(flow_id, code))
}

pub fn signin_status(flow_id: &str) -> Result<Value, String> {
    run(async { core().signin_status(flow_id) })
}

pub fn signin_cancel(flow_id: &str) -> Result<Value, String> {
    run(async { core().signin_cancel(flow_id) })
}

pub fn wrap_restore_if_owed(trigger: RestoreTrigger) -> Result<Value, String> {
    run(core().wrap_restore_if_owed(trigger))
}

/// CLI-only: raw anonymous PICS buffers, base64, for the golden captures (79-21).
pub fn refresh_library(args: crate::refresh::RefreshArgs) -> Result<Value, String> {
    run(core().refresh_library(
        http_client(),
        crate::refresh::store_http::STEAM_STORE_API,
        args,
    ))
}

pub fn store_enrich(
    app_id: &str,
    cached: Option<crate::refresh::meta_entry::SteamMetadataEntry>,
    current: Value,
    known_fix_mac32: bool,
) -> Result<Value, String> {
    run(crate::refresh::store_enrich(
        http_client(),
        crate::refresh::store_http::STEAM_STORE_API,
        app_id,
        cached.as_ref(),
        &current,
        known_fix_mac32,
    ))
}

pub fn store_appdetails(app_id: &str) -> Result<Value, String> {
    run(crate::refresh::store_appdetails_op(
        http_client(),
        crate::refresh::store_http::STEAM_STORE_API,
        app_id,
    ))
}

/// One store HTTP client for the process, built after the rustls provider is installed.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        crate::install_crypto_provider();
        reqwest::Client::new()
    })
}

pub fn capture_anon_pics(apps: Vec<u32>) -> Result<Value, String> {
    use crate::backend::{PicsId, PicsRequest};
    use base64::Engine;
    let b64 = |b: &[u8]| base64::engine::general_purpose::STANDARD.encode(b);
    run(async {
        let a = core().anon();
        let req = PicsRequest {
            apps: apps
                .iter()
                .map(|&id| PicsId {
                    id,
                    access_token: 0,
                })
                .collect(),
            packages: Vec::new(),
            meta_data_only: false,
        };
        match a
            .run_read("capture", PICS_TIMEOUT, move |c| {
                Box::pin(async move { c.pics_product_info(req).await })
            })
            .await
        {
            Ok(raw) => {
                let apps: Vec<Value> = raw
                    .apps
                    .iter()
                    .map(|x| {
                        json!({
                            "appId": x.app_id,
                            "changeNumber": x.change_number,
                            "missingToken": x.missing_token,
                            "bufferBase64": b64(&x.buffer),
                        })
                    })
                    .collect();
                ok_result(json!({"apps": apps, "unknownApps": raw.unknown_app_ids}))
            }
            Err(e) => failure(&e),
        }
    })
}

/// Called by the shell's EOF and exit hooks (79-16).
pub fn shutdown_all(bound: Duration) -> RestoreOutcome {
    block_on_guarded(core().shutdown_all(bound)).unwrap_or(RestoreOutcome::TimedOut)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::FakeBackend;

    fn core_fake() -> Core<FakeBackend> {
        Core::new(Arc::new(FakeBackend::new()))
    }

    #[tokio::test]
    async fn acquire_before_configure_is_client_not_ready() {
        let c = core_fake();
        let v = c.session_acquire("tok".into(), "login".into(), 0).await;
        assert_eq!(v, json!({"ok": false, "refusal": "client-not-ready"}));
        assert_eq!(
            c.session_acquire_open("x".into()).await,
            json!({"ok": false})
        );
        assert_eq!(
            c.session_status().await,
            json!({"connected": false, "leaseCount": 0, "logonFailure": null})
        );
    }

    #[test]
    fn failure_kinds_map() {
        let k = |f: OpFailure| failure(&f);
        assert_eq!(k(OpFailure::LeaseUnknown)["kind"], "leaseUnknown");
        assert_eq!(k(OpFailure::Timeout)["kind"], "timeout");
        let e = k(OpFailure::Cm(CmError::EResult(5)));
        assert_eq!(
            (e["kind"].clone(), e["eresult"].clone()),
            (json!("eresult"), json!(5))
        );
        for c in [CmError::Closed, CmError::Io("x".into()), CmError::Discovery] {
            assert_eq!(k(OpFailure::Cm(c))["kind"], "network");
        }
        assert_eq!(k(OpFailure::Replaced)["kind"], "replaced");
        assert_eq!(k(OpFailure::Ambiguous)["kind"], "ambiguous");
        assert_eq!(k(OpFailure::ShuttingDown)["kind"], "shuttingDown");
        assert_eq!(
            k(OpFailure::Cm(CmError::Unsupported))["kind"],
            "unsupported"
        );
        assert!(k(OpFailure::Timeout).get("eresult").is_none());
    }

    #[tokio::test]
    async fn configured_session_leases_and_reads() {
        let c = core_fake();
        c.configure_with(PathBuf::from("/nonexistent"), Arc::new(NoWrap));
        let v = c.session_acquire("tok".into(), "login".into(), 0).await;
        assert_eq!(v["ok"], true);
        assert!(v["steamId"].is_string());
        let lease = v["leaseId"].as_u64().unwrap() as LeaseId;
        let l = c.licenses(lease).await;
        assert_eq!(l, json!({"ok": true, "result": []}));
        let r = c.redeem_key(lease, "AAAAA-BBBBB-CCCCC".into()).await;
        assert_eq!(r["ok"], true);
        assert!(r["result"]["eresult"].is_number());
        let bad = c.depot_key(lease + 100, 1, 2).await;
        assert_eq!(bad["kind"], "leaseUnknown");
        let st = c.session_status().await;
        assert_eq!(st["leaseCount"], 1);
        assert!(c.host_for_tests().is_none());
    }

    #[tokio::test]
    async fn anon_product_info_is_a_result() {
        let c = core_fake();
        let v = c.anon_product_info(vec![480], vec![], false).await;
        assert_eq!(v["ok"], true);
        assert!(v["result"]["apps"].is_object());
        assert_eq!(c.anon_close("logout"), json!({}));
    }

    struct HangWrap;
    impl LogonWrap for HangWrap {
        async fn before_logon(
            &self,
        ) -> Result<crate::session::WrapTicket, crate::session::WrapRefused> {
            Ok(crate::session::WrapTicket(0))
        }
        async fn after_logon(&self, _t: crate::session::WrapTicket) {}
        async fn pay_owed(&self, _t: RestoreTrigger) -> RestoreOutcome {
            std::future::pending().await
        }
    }

    #[tokio::test]
    async fn shutdown_all_is_bounded_by_a_hanging_wrap() {
        let c = core_fake();
        c.configure_with(PathBuf::from("/nonexistent"), Arc::new(HangWrap));
        let t = std::time::Instant::now();
        let r = c.shutdown_all(Duration::from_millis(200)).await;
        assert_eq!(r, RestoreOutcome::TimedOut);
        assert!(t.elapsed() < Duration::from_secs(3));
    }

    #[tokio::test]
    async fn signin_status_of_unknown_flow_and_wrap_without_host() {
        let c = core_fake();
        assert_eq!(
            c.signin_status("nope"),
            json!({"status": "error", "reason": "unknownFlow"})
        );
        assert_eq!(
            c.wrap_restore_if_owed(RestoreTrigger::Boot).await,
            json!({"restore": "not-owed"})
        );
    }

    #[test]
    fn global_sync_surface_refuses_nested_runtime_without_panic() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        rt.block_on(async {
            assert_eq!(session_status(), Err("steamcm:nested-runtime".to_string()));
        });
    }
}
