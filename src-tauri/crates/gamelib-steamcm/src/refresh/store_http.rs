//! Steam store `appdetails` over reqwest (replaces axios for Steam only) and the requirement
//! parsers ported from `gameRequirements.ts`.
//!
//! HTML in `pc_requirements` / `mac_requirements` is read by plain scanning into numbers and
//! short strings only; it is never passed on as markup (T-79-90).

use std::time::Duration;

use serde_json::Value;

/// `STEAM_STORE_API`.
pub const STEAM_STORE_API: &str = "https://store.steampowered.com/api/appdetails";
/// `METADATA_FETCH_TIMEOUT_MS`.
pub const METADATA_FETCH_TIMEOUT: Duration = Duration::from_millis(15_000);
/// Response body cap (T-79-89).
pub const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    BadAppId,
    Http {
        status: u16,
    },
    TooLarge,
    Timeout,
    Parse,
    /// Connection-level failure (refused, reset, DNS).
    Network,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BadAppId => f.write_str("badAppId"),
            Self::Http { status } => write!(f, "http {status}"),
            Self::TooLarge => f.write_str("tooLarge"),
            Self::Timeout => f.write_str("timeout"),
            Self::Parse => f.write_str("parse"),
            Self::Network => f.write_str("network"),
        }
    }
}

impl std::error::Error for StoreError {}

/// The parsed appdetails envelope for one app.
#[derive(Debug, Clone, PartialEq)]
pub struct StoreDetails {
    /// `success: false` -- Steam says the app no longer exists.
    pub delisted: bool,
    /// The appdetails `data` object. `None` with `delisted == false` is an ambiguous envelope
    /// (transient; never a delisted verdict).
    pub data: Option<Value>,
    pub storage_bytes: Option<u64>,
    /// Lowest macOS version evidenced in `mac_requirements.minimum`, as `"major.minor"`.
    pub mac_min_os: Option<String>,
    /// `"64"` or `"unknown"` for a response that carried a `data` object.
    pub mac_arch: Option<String>,
}

// ---- parsers ----------------------------------------------------------------------------

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn skip_ws(cs: &[char], mut i: usize) -> usize {
    while i < cs.len() && cs[i].is_whitespace() {
        i += 1;
    }
    i
}

fn eat_word_ci(cs: &[char], i: usize, w: &str) -> Option<usize> {
    let n = w.chars().count();
    if i + n > cs.len() {
        return None;
    }
    cs[i..i + n]
        .iter()
        .zip(w.chars())
        .all(|(a, b)| a.eq_ignore_ascii_case(&b))
        .then_some(i + n)
}

/// `parseSteamStorageRequirement`: first `<n> <TB|GB|MB|KB> available space`, rounded to bytes.
pub fn parse_storage_requirement(html: Option<&str>) -> Option<u64> {
    let cs: Vec<char> = html?.chars().collect();
    for start in 0..cs.len() {
        if !cs[start].is_ascii_digit() {
            continue;
        }
        let mut i = start;
        while i < cs.len() && cs[i].is_ascii_digit() {
            i += 1;
        }
        if i + 1 < cs.len() && cs[i] == '.' && cs[i + 1].is_ascii_digit() {
            i += 1;
            while i < cs.len() && cs[i].is_ascii_digit() {
                i += 1;
            }
        }
        let num: String = cs[start..i].iter().collect();
        let j = skip_ws(&cs, i);
        let mult: f64 = [
            ("tb", 1024f64.powi(4)),
            ("gb", 1024f64.powi(3)),
            ("mb", 1024f64.powi(2)),
            ("kb", 1024.0),
        ]
        .iter()
        .find(|(u, _)| eat_word_ci(&cs, j, u).is_some())
        .map_or(0.0, |(_, m)| *m);
        if mult == 0.0 {
            continue;
        }
        let k = skip_ws(&cs, j + 2);
        if k == j + 2 {
            continue;
        }
        let Some(k) = eat_word_ci(&cs, k, "available") else {
            continue;
        };
        let l = skip_ws(&cs, k);
        if l == k || eat_word_ci(&cs, l, "space").is_none() {
            continue;
        }
        let value: f64 = num.parse().ok()?;
        return Some((value * mult).round() as u64);
    }
    None
}

/// macOS version as `(major, minor)`.
pub type MacVersion = (u32, u32);

const MACOS_CODENAMES: &[(&str, MacVersion)] = &[
    ("sequoia", (15, 0)),
    ("sonoma", (14, 0)),
    ("ventura", (13, 0)),
    ("monterey", (12, 0)),
    ("big sur", (11, 0)),
    ("catalina", (10, 15)),
    ("mojave", (10, 14)),
    ("high sierra", (10, 13)),
    ("sierra", (10, 12)),
    ("el capitan", (10, 11)),
    ("yosemite", (10, 10)),
    ("mavericks", (10, 9)),
    ("mountain lion", (10, 8)),
    ("lion", (10, 7)),
    ("snow leopard", (10, 6)),
    ("leopard", (10, 5)),
];

/// `<[^>]*>` -> space.
fn strip_tags(s: &str) -> Vec<char> {
    let cs: Vec<char> = s.chars().collect();
    let mut out = Vec::with_capacity(cs.len());
    let mut i = 0;
    while i < cs.len() {
        if cs[i] == '<' {
            if let Some(off) = cs[i..].iter().position(|c| *c == '>') {
                out.push(' ');
                i += off + 1;
                continue;
            }
        }
        out.push(cs[i]);
        i += 1;
    }
    out
}

fn digits_at(cs: &[char], i: usize, max: usize) -> usize {
    cs[i..]
        .iter()
        .take(max)
        .take_while(|c| c.is_ascii_digit())
        .count()
}

/// `\b(\d{1,2})\.(\d{1,2})(?:\.\d{1,2})?\b`, global.
fn extract_version_tokens(cs: &[char]) -> Vec<MacVersion> {
    let mut found = Vec::new();
    let mut i = 0;
    let boundary_after = |end: usize| end >= cs.len() || !is_word(cs[end]);
    while i < cs.len() {
        if !cs[i].is_ascii_digit() || (i > 0 && is_word(cs[i - 1])) {
            i += 1;
            continue;
        }
        let mut matched: Option<(MacVersion, usize)> = None;
        let maj_max = digits_at(cs, i, 2);
        'outer: for maj_len in (1..=maj_max).rev() {
            let d = i + maj_len;
            if d >= cs.len() || cs[d] != '.' {
                continue;
            }
            let min_start = d + 1;
            let min_max = if min_start <= cs.len() {
                digits_at(cs, min_start, 2)
            } else {
                0
            };
            for min_len in (1..=min_max).rev() {
                let m_end = min_start + min_len;
                let ver = (
                    cs[i..i + maj_len]
                        .iter()
                        .collect::<String>()
                        .parse()
                        .unwrap_or(0),
                    cs[min_start..m_end]
                        .iter()
                        .collect::<String>()
                        .parse()
                        .unwrap_or(0),
                );
                if m_end < cs.len() && cs[m_end] == '.' {
                    let pmax = digits_at(cs, m_end + 1, 2);
                    for plen in (1..=pmax).rev() {
                        let end = m_end + 1 + plen;
                        if boundary_after(end) {
                            matched = Some((ver, end));
                            break 'outer;
                        }
                    }
                }
                if boundary_after(m_end) {
                    matched = Some((ver, m_end));
                    break 'outer;
                }
            }
        }
        match matched {
            Some((v, end)) => {
                found.push(v);
                i = end;
            }
            None => i += 1,
        }
    }
    found
}

fn is_line_end(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// `parseSteamMacMinOSVersion`: the LOWEST macOS version in the `OS:` clause.
pub fn parse_mac_min_os(html: Option<&str>) -> Option<MacVersion> {
    let cs = strip_tags(html?);
    // \bOS(?:\s*X)?\s*:?\s*(.*)
    let mut segment: Option<Vec<char>> = None;
    for i in 0..cs.len() {
        if i > 0 && is_word(cs[i - 1]) {
            continue;
        }
        let Some(mut j) = eat_word_ci(&cs, i, "os") else {
            continue;
        };
        let after_ws = skip_ws(&cs, j);
        if let Some(e) = eat_word_ci(&cs, after_ws, "x") {
            j = e;
        }
        j = skip_ws(&cs, j);
        if j < cs.len() && cs[j] == ':' {
            j += 1;
        }
        j = skip_ws(&cs, j);
        let end = cs[j..]
            .iter()
            .position(|c| is_line_end(*c))
            .map_or(cs.len(), |p| j + p);
        segment = Some(cs[j..end].to_vec());
        break;
    }
    let mut seg = segment?;
    // Stop at the next competing spec keyword.
    const STOPS: [&str; 9] = [
        "processor",
        "cpu",
        "memory",
        "ram",
        "graphics",
        "gpu",
        "storage",
        "network",
        "additional",
    ];
    let cut = (0..seg.len()).find(|&i| {
        (i == 0 || !is_word(seg[i - 1]))
            && STOPS.iter().any(|w| {
                eat_word_ci(&seg, i, w).is_some_and(|e| e >= seg.len() || !is_word(seg[e]))
            })
    });
    if let Some(c) = cut {
        seg.truncate(c);
    }
    let versions = extract_version_tokens(&seg);
    if let Some(v) = versions.into_iter().min() {
        return Some(v);
    }
    let lower: String = seg.iter().collect::<String>().to_lowercase();
    MACOS_CODENAMES
        .iter()
        .find(|(n, _)| lower.contains(n))
        .map(|(_, v)| *v)
}

/// `macArchFromMinOS`. NEVER `"32"`: a low min-OS proves nothing about bitness.
pub fn mac_arch_from_min_os(html: Option<&str>) -> &'static str {
    match parse_mac_min_os(html) {
        Some((maj, min)) if maj > 10 || (maj == 10 && min >= 15) => "64",
        _ => "unknown",
    }
}

// ---- fetch --------------------------------------------------------------------------------

/// Fetch `appdetails` for one app. `app_id` must be all digits (T-79-88).
pub async fn store_appdetails(
    client: &reqwest::Client,
    base_url: &str,
    app_id: &str,
) -> Result<StoreDetails, StoreError> {
    store_appdetails_with(client, base_url, app_id, METADATA_FETCH_TIMEOUT).await
}

pub(crate) async fn store_appdetails_with(
    client: &reqwest::Client,
    base_url: &str,
    app_id: &str,
    timeout: Duration,
) -> Result<StoreDetails, StoreError> {
    if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
        return Err(StoreError::BadAppId);
    }
    let url = format!("{base_url}?appids={app_id}&l=english");
    let map_err = |e: reqwest::Error| {
        if e.is_timeout() {
            StoreError::Timeout
        } else {
            StoreError::Network
        }
    };
    let mut resp = client
        .get(&url)
        .timeout(timeout)
        .send()
        .await
        .map_err(map_err)?;
    let status = resp.status();
    if !status.is_success() {
        return Err(StoreError::Http {
            status: status.as_u16(),
        });
    }
    if resp
        .content_length()
        .is_some_and(|n| n > MAX_BODY_BYTES as u64)
    {
        return Err(StoreError::TooLarge);
    }
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(map_err)? {
        if body.len() + chunk.len() > MAX_BODY_BYTES {
            return Err(StoreError::TooLarge);
        }
        body.extend_from_slice(&chunk);
    }
    let json: Value = serde_json::from_slice(&body).map_err(|_| StoreError::Parse)?;
    Ok(details_from_body(&json, app_id))
}

fn details_from_body(body: &Value, app_id: &str) -> StoreDetails {
    let envelope = body.get(app_id);
    if envelope.and_then(|e| e.get("success")) == Some(&Value::Bool(false)) {
        return StoreDetails {
            delisted: true,
            data: None,
            storage_bytes: None,
            mac_min_os: None,
            mac_arch: None,
        };
    }
    let data = envelope
        .and_then(|e| e.get("data"))
        .filter(|d| !d.is_null())
        .cloned();
    let (mut storage_bytes, mut mac_min_os, mut mac_arch) = (None, None, None);
    if let Some(d) = &data {
        let min = |k: &str| {
            d.get(k)
                .and_then(|r| r.get("minimum"))
                .and_then(Value::as_str)
        };
        storage_bytes = parse_storage_requirement(min("pc_requirements"));
        let mac_min = min("mac_requirements");
        mac_min_os = parse_mac_min_os(mac_min).map(|(a, b)| format!("{a}.{b}"));
        mac_arch = Some(mac_arch_from_min_os(mac_min).to_string());
    }
    StoreDetails {
        delisted: false,
        data,
        storage_bytes,
        mac_min_os,
        mac_arch,
    }
}

// ---- local HTTP mock (tests only) ------------------------------------------------------

#[cfg(test)]
pub(crate) mod mock {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[derive(Clone)]
    pub struct Reply {
        pub status: u16,
        pub body: Vec<u8>,
        pub delay: Duration,
        /// Accept and never answer.
        pub stall: bool,
    }

    impl Reply {
        pub fn json(v: serde_json::Value) -> Self {
            Self {
                status: 200,
                body: v.to_string().into_bytes(),
                delay: Duration::ZERO,
                stall: false,
            }
        }
        pub fn status(status: u16) -> Self {
            Self {
                status,
                body: Vec::new(),
                delay: Duration::ZERO,
                stall: false,
            }
        }
        pub fn delayed(mut self, d: Duration) -> Self {
            self.delay = d;
            self
        }
    }

    pub struct Mock {
        pub base: String,
        pub max_concurrent: Arc<AtomicUsize>,
        pub paths: Arc<Mutex<Vec<String>>>,
    }

    /// `handler` maps the request target (`/?appids=N`) to a reply.
    pub async fn spawn<F>(handler: F) -> Mock
    where
        F: Fn(&str) -> Reply + Send + Sync + 'static,
    {
        crate::install_crypto_provider();
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}/", l.local_addr().unwrap());
        let active = Arc::new(AtomicUsize::new(0));
        let max = Arc::new(AtomicUsize::new(0));
        let paths = Arc::new(Mutex::new(Vec::new()));
        let handler = Arc::new(handler);
        let (a2, m2, p2) = (active.clone(), max.clone(), paths.clone());
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = l.accept().await else {
                    return;
                };
                let (h, a, m, p) = (handler.clone(), a2.clone(), m2.clone(), p2.clone());
                tokio::spawn(async move {
                    let mut buf = Vec::new();
                    let mut tmp = [0u8; 1024];
                    while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
                        match sock.read(&mut tmp).await {
                            Ok(0) | Err(_) => return,
                            Ok(n) => buf.extend_from_slice(&tmp[..n]),
                        }
                    }
                    let text = String::from_utf8_lossy(&buf).to_string();
                    let target = text.split_whitespace().nth(1).unwrap_or("").to_string();
                    p.lock().unwrap().push(target.clone());
                    let now = a.fetch_add(1, Ordering::SeqCst) + 1;
                    m.fetch_max(now, Ordering::SeqCst);
                    let reply = h(&target);
                    if reply.stall {
                        std::future::pending::<()>().await;
                    }
                    tokio::time::sleep(reply.delay).await;
                    let head = format!(
                        "HTTP/1.1 {} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        reply.status,
                        reply.body.len()
                    );
                    let _ = sock.write_all(head.as_bytes()).await;
                    let _ = sock.write_all(&reply.body).await;
                    let _ = sock.shutdown().await;
                    a.fetch_sub(1, Ordering::SeqCst);
                });
            }
        });
        Mock {
            base,
            max_concurrent: max,
            paths,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::mock::{spawn, Reply};
    use super::*;
    use serde_json::json;

    fn client() -> reqwest::Client {
        crate::install_crypto_provider();
        reqwest::Client::new()
    }

    // ---- storage

    #[test]
    fn storage_parses_units() {
        let p = |s: &str| parse_storage_requirement(Some(s));
        assert_eq!(
            p("<li><strong>Storage:</strong> 15 GB available space</li>"),
            Some(15 * 1024 * 1024 * 1024)
        );
        assert_eq!(p("512 MB available space"), Some(512 * 1024 * 1024));
        assert_eq!(p("1.5 TB available space"), Some(1_649_267_441_664));
        assert_eq!(p("100 KB available space"), Some(102_400));
    }

    #[test]
    fn storage_is_case_insensitive_and_flexible_on_whitespace() {
        assert_eq!(
            parse_storage_requirement(Some("2 gb  AVAILABLE   Space")),
            Some(2 * 1024 * 1024 * 1024)
        );
        assert_eq!(
            parse_storage_requirement(Some("2\u{a0}GB available space")),
            Some(2 * 1024 * 1024 * 1024)
        );
    }

    #[test]
    fn storage_none_cases() {
        assert_eq!(parse_storage_requirement(None), None);
        assert_eq!(parse_storage_requirement(Some("")), None);
        assert_eq!(parse_storage_requirement(Some("no figure here")), None);
        assert_eq!(parse_storage_requirement(Some("15 GB RAM")), None);
        assert_eq!(
            parse_storage_requirement(Some("15 GBavailable space")),
            None
        );
        assert_eq!(
            parse_storage_requirement(Some("15 GB availablespace")),
            None
        );
    }

    #[test]
    fn storage_takes_first_match_and_skips_non_matching_numbers() {
        let html = "<li>Memory: 8 GB RAM</li><li>Storage: 40 GB available space</li><li>9 MB available space</li>";
        assert_eq!(
            parse_storage_requirement(Some(html)),
            Some(40 * 1024 * 1024 * 1024)
        );
        assert_eq!(
            parse_storage_requirement(Some("1.5.3 GB available space")),
            Some((5.3f64 * 1024f64.powi(3)).round() as u64)
        );
    }

    // ---- mac min os

    fn v(s: &str) -> Option<MacVersion> {
        parse_mac_min_os(Some(s))
    }

    #[test]
    fn mac_min_os_the_five_observed_shapes() {
        assert_eq!(
            v("<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>"),
            Some((10, 9))
        );
        assert_eq!(
            v("<strong>OS: OSX 10.9.5 - 10.11.6</strong>"),
            Some((10, 9))
        );
        assert_eq!(v("OS: Snow Leopard 10.6.8, ...<br />"), Some((10, 6)));
        assert_eq!(
            v("OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM,"),
            Some((10, 5))
        );
    }

    #[test]
    fn mac_min_os_lowest_of_alternatives() {
        assert_eq!(
            v("OS: Leopard 10.5.8, Snow Leopard 10.6.3, or higher"),
            Some((10, 5))
        );
        assert_eq!(v("OS: 12.3 or 10.15"), Some((10, 15)));
    }

    #[test]
    fn mac_min_os_stops_at_next_spec_keyword() {
        assert_eq!(
            v("OS: macOS Big Sur Processor: 2.0 GHz Intel 11.4"),
            Some((11, 0))
        );
        assert_eq!(v("OS: 10.14 Memory: 8.5 GB"), Some((10, 14)));
    }

    #[test]
    fn mac_min_os_codename_fallback() {
        assert_eq!(v("OS: macOS Sequoia"), Some((15, 0)));
        assert_eq!(v("OS: High Sierra"), Some((10, 13)));
        assert_eq!(v("OS: Sierra"), Some((10, 12)));
        assert_eq!(v("OS: Mountain Lion or later"), Some((10, 8)));
    }

    #[test]
    fn mac_min_os_none_cases() {
        assert_eq!(parse_mac_min_os(None), None);
        assert_eq!(v(""), None);
        assert_eq!(v("no label at all 10.9"), None);
        assert_eq!(v("Chaos 10.9"), None, "mid-word OS must not match");
        assert_eq!(v("OS: 32/64-bit"), None, "a bare number is never a version");
        assert_eq!(v("OS: 123.4"), None);
    }

    #[test]
    fn mac_min_os_label_spans_only_one_line() {
        assert_eq!(v("OS: Catalina\nProcessor: 10.9"), Some((10, 15)));
    }

    #[test]
    fn mac_arch_never_32() {
        assert_eq!(mac_arch_from_min_os(Some("OS: 10.15")), "64");
        assert_eq!(mac_arch_from_min_os(Some("OS: 10.14.6")), "unknown");
        assert_eq!(mac_arch_from_min_os(Some("OS: 10.11.6")), "unknown");
        assert_eq!(mac_arch_from_min_os(Some("OS: 11.0")), "64");
        assert_eq!(mac_arch_from_min_os(Some("OS: Sonoma")), "64");
        assert_eq!(mac_arch_from_min_os(None), "unknown");
        assert_eq!(mac_arch_from_min_os(Some("OS: 32-bit")), "unknown");
    }

    // ---- fetch

    #[tokio::test]
    async fn non_numeric_app_id_is_rejected_without_a_request() {
        let m = spawn(|_| Reply::json(json!({}))).await;
        for bad in ["", "12a", "12&x=1", "../1", "1 2", "١٢"] {
            let r = store_appdetails(&client(), &m.base, bad).await;
            assert_eq!(r.err(), Some(StoreError::BadAppId), "{bad:?}");
        }
        assert!(m.paths.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn success_false_is_delisted() {
        let m = spawn(|_| Reply::json(json!({"570": {"success": false}}))).await;
        let d = store_appdetails(&client(), &m.base, "570").await.unwrap();
        assert!(d.delisted);
        assert_eq!(d.data, None);
        assert_eq!(m.paths.lock().unwrap()[0], "/?appids=570&l=english");
    }

    #[tokio::test]
    async fn full_body_parses_data_and_requirements() {
        let data = json!({
            "name": "G", "short_description": "d",
            "platforms": {"windows": true, "mac": true, "linux": false},
            "pc_requirements": {"minimum": "<li>Storage: 15 GB available space</li>"},
            "mac_requirements": {"minimum": "<li><strong>OS:</strong> 10.15</li>"}
        });
        let body = json!({"570": {"success": true, "data": data.clone()}});
        let m = spawn(move |_| Reply::json(body.clone())).await;
        let d = store_appdetails(&client(), &m.base, "570").await.unwrap();
        assert!(!d.delisted);
        assert_eq!(d.data, Some(data));
        assert_eq!(d.storage_bytes, Some(15 * 1024 * 1024 * 1024));
        assert_eq!(d.mac_min_os.as_deref(), Some("10.15"));
        assert_eq!(d.mac_arch.as_deref(), Some("64"));
    }

    #[tokio::test]
    async fn empty_requirements_arrays_are_tolerated() {
        let body = json!({"1": {"success": true, "data": {"pc_requirements": [], "mac_requirements": []}}});
        let m = spawn(move |_| Reply::json(body.clone())).await;
        let d = store_appdetails(&client(), &m.base, "1").await.unwrap();
        assert_eq!(d.storage_bytes, None);
        assert_eq!(d.mac_min_os, None);
        assert_eq!(d.mac_arch.as_deref(), Some("unknown"));
    }

    #[tokio::test]
    async fn missing_envelope_is_ambiguous_not_delisted() {
        let m = spawn(|_| Reply::json(json!({}))).await;
        let d = store_appdetails(&client(), &m.base, "9").await.unwrap();
        assert!(!d.delisted);
        assert_eq!(d.data, None);
    }

    #[tokio::test]
    async fn http_429_is_an_error() {
        let m = spawn(|_| Reply::status(429)).await;
        let r = store_appdetails(&client(), &m.base, "1").await;
        assert_eq!(r.err(), Some(StoreError::Http { status: 429 }));
    }

    #[tokio::test]
    async fn oversized_body_is_an_error() {
        let m = spawn(|_| Reply {
            status: 200,
            body: vec![b' '; MAX_BODY_BYTES + 1],
            delay: Duration::ZERO,
            stall: false,
        })
        .await;
        let r = store_appdetails(&client(), &m.base, "1").await;
        assert_eq!(r.err(), Some(StoreError::TooLarge));
    }

    #[tokio::test]
    async fn stalled_server_times_out() {
        let m = spawn(|_| Reply {
            status: 200,
            body: vec![],
            delay: Duration::ZERO,
            stall: true,
        })
        .await;
        let r = store_appdetails_with(&client(), &m.base, "1", Duration::from_millis(200)).await;
        assert_eq!(r.err(), Some(StoreError::Timeout));
    }

    #[tokio::test]
    async fn garbage_body_is_a_parse_error() {
        let m = spawn(|_| Reply {
            status: 200,
            body: b"<html>".to_vec(),
            delay: Duration::ZERO,
            stall: false,
        })
        .await;
        let r = store_appdetails(&client(), &m.base, "1").await;
        assert_eq!(r.err(), Some(StoreError::Parse));
    }
}
