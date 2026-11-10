//! TEMPORARY live-gate diagnostics for the Windows Humble cookie clear (debug `webview2-humble-deletecookie`; todo 2026-11-11-webview2-deletecookie-leaves-non-partitioned-humble-cookies). DEBUG BUILDS ONLY, called solely behind `cfg!(debug_assertions)` from `remove_window_cookies_windows`. Child of `login_window`; sees its private items.
//!
//! Why it exists: the first Humble-on-Windows measurement (2026-11-11) showed `DeleteCookie` removing 10 of 35 matching cookies, 25 surviving the full 2s settle, only 2 of them partitioned. The mechanism cannot be reasoned out at the desk (a Chromium repro does not reproduce WebView2), so this module measures it live.
//!
//! Hard rule (T-34.4.1-02, T-34.4.1-94): NEVER log a cookie name, value or domain. Everything that reaches a log line is a count, an index, a boolean, an enum name, or a bucket (leading dot vs host-only, subdomain depth, path depth, expiry bucket). `CookieSnap` holds the name/domain/path/value in memory ONLY to tell "the same cookie survived" from "a different one appeared"; it has no `Debug`/`Display` on purpose, so it cannot be formatted into a log line by accident.
//!
//! Removal: delete this file, its two entries in `SHELL_SOURCE_FILES`/`SHELL_SOURCE_PARTS` (main.rs), its `mod`/`use` lines in `login_window.rs`, the `pub(crate)` on `webview2_cdp_call`, and the two `TEMP-DIAG` call sites in `remove_window_cookies_windows`.

use super::*;
use std::collections::{BTreeMap, HashMap};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_2, COREWEBVIEW2_COOKIE_SAME_SITE_KIND,
};
use windows::core::{Interface, BOOL, HSTRING, PCWSTR, PWSTR};

/// One diagnostic line: to the shell's stderr (the terminal running `pnpm tauri:dev`; the shell's
/// stderr never reaches `gamelib.log`) AND appended to `%LOCALAPPDATA%\GameLib\logs\humble-cookie-diag.log`,
/// so the operator has one file to read back. Every line carries the `humble_login_clear_cookies`
/// tag, so `grep humble_login_clear_cookies` pulls the whole story on either sink. Best-effort and
/// infallible: a diagnostic must never fail the clear.
fn diag_emit(line: &str) {
    let full = format!("[shell] humble_login_clear_cookies: DIAG {line}");
    shell_eprintln!("{full}");
    let Some(base) = std::env::var_os("LOCALAPPDATA") else {
        return;
    };
    let dir = std::path::Path::new(&base).join("GameLib").join("logs");
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("humble-cookie-diag.log"))
    {
        let _ = writeln!(file, "{:.0} {full}", now_secs());
    }
}

macro_rules! diag_line {
    ($($arg:tt)*) => {
        diag_emit(&format!($($arg)*))
    };
}

/// One cookie as seen by a diagnostic read. Deliberately NOT `Debug`/`Display`: `key` and `value`
/// hold the cookie's name, domain, path and value for in-memory identity comparison only.
pub(crate) struct CookieSnap {
    /// name + domain + path (+ partition key for CDP), NUL-joined. In-memory identity only.
    key: String,
    /// The cookie value. In-memory equality only ("was it re-set after the delete?").
    value: String,
    /// Position among the matching cookies, in enumeration order.
    idx: usize,
    /// Shape dimensions, attribute name -> bucketed value. Nothing here is a name, value or domain.
    dims: Vec<(&'static str, String)>,
}

impl CookieSnap {
    fn joint(&self) -> String {
        self.dims
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// What a diagnostic COM pass does to each matching cookie it enumerates.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ComAction {
    /// Read only.
    Survey,
    /// `ICoreWebView2CookieManager::DeleteCookie` on the original `GetCookies` object (what
    /// production does).
    DeleteCookie,
    /// `DeleteCookiesWithDomainAndPath(name, domain, path)` built from the original cookie.
    DeleteWithDomainAndPath,
}

pub(crate) struct ComPass {
    snaps: Vec<CookieSnap>,
    /// How many delete calls were made, and how many of those returned an error HRESULT.
    calls: u32,
    errs: u32,
}

fn now_secs() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

/// Leading dot vs host-only, and how many labels deeper than the target domain the host is.
fn domain_dims(raw_domain: &str, target: &str) -> [(&'static str, String); 2] {
    let host = raw_domain.strip_prefix('.').unwrap_or(raw_domain);
    let target = target.strip_prefix('.').unwrap_or(target);
    let extra = host
        .split('.')
        .count()
        .saturating_sub(target.split('.').count());
    [
        (
            "dot",
            if raw_domain.starts_with('.') {
                "dot"
            } else {
                "host"
            }
            .to_string(),
        ),
        ("depth", extra.to_string()),
    ]
}

fn path_dim(path: &str) -> String {
    if path == "/" {
        "root".to_string()
    } else {
        format!("d{}", path.split('/').filter(|s| !s.is_empty()).count())
    }
}

fn life_dim(is_session: bool, expires_secs: f64, now: f64) -> &'static str {
    if is_session {
        return "session";
    }
    let left = expires_secs - now;
    if left <= 0.0 {
        "expired"
    } else if left <= 86_400.0 {
        "le1d"
    } else if left <= 30.0 * 86_400.0 {
        "le30d"
    } else if left <= 400.0 * 86_400.0 {
        "le400d"
    } else {
        "gt400d"
    }
}

fn bool_dim(b: bool) -> String {
    if b { "1" } else { "0" }.to_string()
}

/// One `GetCookies` pass over `window`'s WebView2 jar, filtered with the same matcher production
/// uses, applying `action` to every matching cookie. Runs on the calling (worker) thread; the
/// COM work is posted to the main thread by `with_webview`, as in production.
pub(crate) fn com_pass(
    window: &tauri::WebviewWindow,
    domain: &str,
    action: ComAction,
) -> Result<ComPass, String> {
    let (tx, rx) = mpsc_channel::<Result<ComPass, String>>();
    let target = domain.to_string();
    let now = now_secs();
    window
        .with_webview(move |webview| {
            let tx_done = tx.clone();
            let outcome = (|| -> windows::core::Result<()> {
                // SAFETY: `controller()` is tauri's live controller for this window, valid for
                // the closure's duration on the main thread; every call below is a plain COM
                // method on it or on objects it hands back.
                let core =
                    unsafe { webview.controller().CoreWebView2()? }.cast::<ICoreWebView2_2>()?;
                let manager = unsafe { core.CookieManager()? };
                let manager_for_delete = manager.clone();
                let handler = webview2_com::GetCookiesCompletedHandler::create(Box::new(
                    move |error_code, list| {
                        let result = (|| -> windows::core::Result<ComPass> {
                            error_code?;
                            let mut pass = ComPass {
                                snaps: Vec::new(),
                                calls: 0,
                                errs: 0,
                            };
                            let Some(list) = list else {
                                return Ok(pass);
                            };
                            let mut count = 0u32;
                            unsafe { list.Count(&mut count)? };
                            for i in 0..count {
                                let cookie = unsafe { list.GetValueAtIndex(i)? };
                                let mut raw = PWSTR::null();
                                unsafe { cookie.Domain(&mut raw)? };
                                let raw_domain = webview2_com::take_pwstr(raw);
                                let host = raw_domain.strip_prefix('.').unwrap_or(&raw_domain);
                                if !cookie_domain_matches(host, Some(&target)) {
                                    continue;
                                }
                                let mut raw = PWSTR::null();
                                unsafe { cookie.Name(&mut raw)? };
                                let name = webview2_com::take_pwstr(raw);
                                let mut raw = PWSTR::null();
                                unsafe { cookie.Value(&mut raw)? };
                                let value = webview2_com::take_pwstr(raw);
                                let mut raw = PWSTR::null();
                                unsafe { cookie.Path(&mut raw)? };
                                let path = webview2_com::take_pwstr(raw);
                                let mut expires = 0f64;
                                unsafe { cookie.Expires(&mut expires)? };
                                let (mut http, mut secure, mut session) =
                                    (BOOL::default(), BOOL::default(), BOOL::default());
                                unsafe { cookie.IsHttpOnly(&mut http)? };
                                unsafe { cookie.IsSecure(&mut secure)? };
                                unsafe { cookie.IsSession(&mut session)? };
                                let mut same_site = COREWEBVIEW2_COOKIE_SAME_SITE_KIND(0);
                                unsafe { cookie.SameSite(&mut same_site)? };

                                let mut dims: Vec<(&'static str, String)> =
                                    domain_dims(&raw_domain, &target).to_vec();
                                dims.push(("path", path_dim(&path)));
                                dims.push(("http", bool_dim(http.as_bool())));
                                dims.push(("secure", bool_dim(secure.as_bool())));
                                dims.push((
                                    "samesite",
                                    match same_site.0 {
                                        0 => "none",
                                        1 => "lax",
                                        2 => "strict",
                                        _ => "other",
                                    }
                                    .to_string(),
                                ));
                                dims.push((
                                    "life",
                                    life_dim(session.as_bool(), expires, now).to_string(),
                                ));
                                dims.push(("empty", bool_dim(value.is_empty())));
                                pass.snaps.push(CookieSnap {
                                    key: format!("{name}\0{raw_domain}\0{path}"),
                                    value,
                                    idx: pass.snaps.len(),
                                    dims,
                                });

                                match action {
                                    ComAction::Survey => {}
                                    ComAction::DeleteCookie => {
                                        pass.calls += 1;
                                        if unsafe { manager_for_delete.DeleteCookie(&cookie) }
                                            .is_err()
                                        {
                                            pass.errs += 1;
                                        }
                                    }
                                    ComAction::DeleteWithDomainAndPath => {
                                        pass.calls += 1;
                                        if unsafe {
                                            manager_for_delete.DeleteCookiesWithDomainAndPath(
                                                &HSTRING::from(name.as_str()),
                                                &HSTRING::from(raw_domain.as_str()),
                                                &HSTRING::from(path.as_str()),
                                            )
                                        }
                                        .is_err()
                                        {
                                            pass.errs += 1;
                                        }
                                    }
                                }
                            }
                            Ok(pass)
                        })();
                        let _ = tx_done.send(result.map_err(|e| format!("com_pass:{e}")));
                        Ok(())
                    },
                ));
                unsafe { manager.GetCookies(PCWSTR::null(), &handler)? };
                Ok(())
            })();
            if let Err(e) = outcome {
                let _ = tx.send(Err(format!("com_pass:setup:{e}")));
            }
        })
        .map_err(|e| format!("com_pass:dispatch:{e}"))?;
    rx.recv_timeout(CLEAR_COOKIES_TIMEOUT)
        .map_err(|_| "com_pass:timeout".to_string())?
}

/// Read-only CDP view of the same jar: `Storage.getCookies`, filtered to `domain`. Carries the
/// fields COM cannot show (`partitionKey`, `sourceScheme`, `sourcePort`, `priority`).
pub(crate) fn cdp_survey(
    window: &tauri::WebviewWindow,
    domain: &str,
) -> Result<Vec<CookieSnap>, String> {
    let listed = webview2_cdp_call(window, "Storage.getCookies", serde_json::json!({}))?;
    let now = now_secs();
    let mut snaps = Vec::new();
    for cookie in listed
        .get("cookies")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let text = |k: &str| cookie.get(k).and_then(Value::as_str).unwrap_or("");
        let raw_domain = text("domain");
        let host = raw_domain.strip_prefix('.').unwrap_or(raw_domain);
        if !cookie_domain_matches(host, Some(domain)) {
            continue;
        }
        let flag = |k: &str| cookie.get(k).and_then(Value::as_bool).unwrap_or(false);
        let partition = cookie.get("partitionKey");
        let port = match cookie.get("sourcePort").and_then(Value::as_i64) {
            Some(443) => "443".to_string(),
            Some(80) => "80".to_string(),
            Some(-1) => "unset".to_string(),
            Some(_) => "other".to_string(),
            None => "absent".to_string(),
        };
        let mut dims: Vec<(&'static str, String)> = domain_dims(raw_domain, domain).to_vec();
        dims.push(("path", path_dim(text("path"))));
        dims.push(("http", bool_dim(flag("httpOnly"))));
        dims.push(("secure", bool_dim(flag("secure"))));
        dims.push((
            "samesite",
            cookie
                .get("sameSite")
                .and_then(Value::as_str)
                .unwrap_or("absent")
                .to_string(),
        ));
        dims.push((
            "life",
            life_dim(
                flag("session"),
                cookie
                    .get("expires")
                    .and_then(Value::as_f64)
                    .unwrap_or(-1.0),
                now,
            )
            .to_string(),
        ));
        dims.push((
            "empty",
            bool_dim(cookie.get("value").and_then(Value::as_str) == Some("")),
        ));
        dims.push(("part", bool_dim(partition.is_some())));
        dims.push((
            "scheme",
            cookie
                .get("sourceScheme")
                .and_then(Value::as_str)
                .unwrap_or("absent")
                .to_string(),
        ));
        dims.push(("port", port));
        dims.push((
            "prio",
            cookie
                .get("priority")
                .and_then(Value::as_str)
                .unwrap_or("absent")
                .to_string(),
        ));
        snaps.push(CookieSnap {
            key: format!(
                "{}\0{raw_domain}\0{}\0{}",
                text("name"),
                text("path"),
                partition.map(|p| p.to_string()).unwrap_or_default()
            ),
            value: text("value").to_string(),
            idx: snaps.len(),
            dims,
        });
    }
    Ok(snaps)
}

/// The jar as it stood BEFORE the natural delete pass, from both views.
pub(crate) struct Baseline {
    com: Vec<CookieSnap>,
    cdp: Vec<CookieSnap>,
}

impl Baseline {
    /// Read-only. A failed read is logged and leaves that view empty; it never fails the clear.
    pub(crate) fn capture(window: &tauri::WebviewWindow, domain: &str) -> Self {
        diag_line!("==== capture before the natural DeleteCookie pass ====");
        let com = match com_pass(window, domain, ComAction::Survey) {
            Ok(p) => p.snaps,
            Err(e) => {
                diag_line!("pre COM survey failed: {e}");
                Vec::new()
            }
        };
        let cdp = match cdp_survey(window, domain) {
            Ok(s) => s,
            Err(e) => {
                diag_line!("pre CDP survey failed: {e}");
                Vec::new()
            }
        };
        let cdp_partitioned = cdp
            .iter()
            .filter(|s| s.dims.iter().any(|(k, v)| *k == "part" && v == "1"))
            .count();
        diag_line!(
            "pre: com_matching={} cdp_matching={} cdp_partitioned={cdp_partitioned}",
            com.len(),
            cdp.len()
        );
        Baseline { com, cdp }
    }

    /// Called once the natural pass and its 2s settle left survivors, before the production CDP
    /// pass: reports what survived and what each alternative removal path can still remove.
    pub(crate) fn report_and_experiment(
        &self,
        window: &tauri::WebviewWindow,
        domain: &str,
        count_matching: &dyn Fn(&tauri::WebviewWindow) -> Result<usize, String>,
        natural: (usize, usize, u32),
    ) {
        diag_line!(
            "natural DeleteCookie pass: before={} after={} settle_rereads={}",
            natural.0,
            natural.1,
            natural.2
        );
        match com_pass(window, domain, ComAction::Survey) {
            Ok(p) => report("com", &self.com, &p.snaps),
            Err(e) => diag_line!("post COM survey failed: {e}"),
        }
        match cdp_survey(window, domain) {
            Ok(s) => report("cdp", &self.cdp, &s),
            Err(e) => diag_line!("post CDP survey failed: {e}"),
        }
        if let Err(e) = experiments(window, domain, count_matching) {
            diag_line!("experiments aborted: {e}");
        }
    }
}

/// Before/survived histograms: one line per dimension value, then one per joint shape. `before`
/// is the pre-delete survey; a cookie "survived" when its in-memory key is still present after.
fn report(tag: &str, before: &[CookieSnap], after: &[CookieSnap]) {
    let pre: HashMap<&str, &CookieSnap> = before.iter().map(|s| (s.key.as_str(), s)).collect();
    let post: HashMap<&str, &CookieSnap> = after.iter().map(|s| (s.key.as_str(), s)).collect();
    let new_since_pre = after
        .iter()
        .filter(|s| !pre.contains_key(s.key.as_str()))
        .count();
    let value_changed = after
        .iter()
        .filter(|s| pre.get(s.key.as_str()).is_some_and(|p| p.value != s.value))
        .count();
    let survived: Vec<&CookieSnap> = before
        .iter()
        .filter(|s| post.contains_key(s.key.as_str()))
        .collect();
    diag_line!(
        "{tag} post-settle: pre={} post={} survived={} removed={} new_since_pre={new_since_pre} value_changed={value_changed}",
        before.len(),
        after.len(),
        survived.len(),
        before.len() - survived.len()
    );
    let mut survivor_idx: Vec<usize> = survived.iter().map(|s| s.idx).collect();
    survivor_idx.sort_unstable();
    diag_line!("{tag} survivor_pre_enumeration_idx={survivor_idx:?}");

    // `before/survived` per dimension value. Dimension order is the construction order.
    let Some(first) = before.first() else {
        return;
    };
    for (pos, (dim, _)) in first.dims.iter().enumerate() {
        let mut hist: BTreeMap<&str, (usize, usize)> = BTreeMap::new();
        for s in before {
            hist.entry(s.dims[pos].1.as_str()).or_default().0 += 1;
        }
        for s in &survived {
            hist.entry(s.dims[pos].1.as_str()).or_default().1 += 1;
        }
        let cells: Vec<String> = hist
            .iter()
            .map(|(v, (b, s))| format!("{v}={b}/{s}"))
            .collect();
        diag_line!("{tag} dim {dim} (before/survived): {}", cells.join(" "));
    }
    let mut joint: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    for s in before {
        joint.entry(s.joint()).or_default().0 += 1;
    }
    for s in &survived {
        joint.entry(s.joint()).or_default().1 += 1;
    }
    for (shape, (b, s)) in &joint {
        diag_line!("{tag} shape [{shape}] before/survived={b}/{s}");
    }
}

/// Re-reads (via production's `count_matching`) until the matched set is empty or `budget` runs
/// out, returning the last count.
fn settle(
    window: &tauri::WebviewWindow,
    count_matching: &dyn Fn(&tauri::WebviewWindow) -> Result<usize, String>,
    budget: Duration,
) -> Result<usize, String> {
    let deadline = std::time::Instant::now() + budget;
    let mut count = count_matching(window)?;
    while count > 0 && std::time::Instant::now() < deadline {
        thread::sleep(Duration::from_millis(100));
        count = count_matching(window)?;
    }
    Ok(count)
}

/// Mutating experiments on whatever the natural pass left, in order, each measured by a re-read.
/// They run BEFORE the production CDP pass, so that pass then sees only what none of them could
/// remove. Order matters for reading the result: each arm acts on the survivors of the previous.
fn experiments(
    window: &tauri::WebviewWindow,
    domain: &str,
    count_matching: &dyn Fn(&tauri::WebviewWindow) -> Result<usize, String>,
) -> Result<(), String> {
    // E1 (H-async): keep watching for 3 more seconds with no new action. Logs every change.
    let start = std::time::Instant::now();
    let mut last = count_matching(window)?;
    let first = last;
    let mut changes: Vec<(u128, usize)> = Vec::new();
    while last > 0 && start.elapsed() < Duration::from_secs(3) {
        thread::sleep(Duration::from_millis(250));
        let now = count_matching(window)?;
        if now != last {
            changes.push((start.elapsed().as_millis(), now));
            last = now;
        }
    }
    diag_line!("E1 extended-settle +3s (no new action): start={first} end={last} changes_ms_count={changes:?}");
    if last == 0 {
        return Ok(());
    }

    // E2 (H-quota, H-stale): repeat the production `DeleteCookie` pass with FRESH objects. A
    // per-call quota predicts ~10 more per pass; a genuine refusal predicts 0.
    for pass in 2..=4u32 {
        let before = last;
        let p = com_pass(window, domain, ComAction::DeleteCookie)?;
        last = settle(window, count_matching, Duration::from_secs(1))?;
        diag_line!(
            "E2 DeleteCookie pass {pass}: before={before} after={last} calls={} errs={} enumerated={}",
            p.calls,
            p.errs,
            p.snaps.len()
        );
        if last == 0 || last >= before {
            break;
        }
    }
    if last == 0 {
        return Ok(());
    }

    // E3 (Q3): `DeleteCookiesWithDomainAndPath` per survivor, keyed by the original cookie's own
    // name/domain/path (domain keeps its leading dot).
    let before = last;
    let p = com_pass(window, domain, ComAction::DeleteWithDomainAndPath)?;
    last = settle(window, count_matching, Duration::from_secs(1))?;
    diag_line!(
        "E3 DeleteCookiesWithDomainAndPath: before={before} after={last} calls={} errs={} enumerated={}",
        p.calls,
        p.errs,
        p.snaps.len()
    );
    Ok(())
}
