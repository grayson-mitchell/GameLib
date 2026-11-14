//! Test-only HTTP/1.1 mock of the Steam Web API. Never talks to Steam.
//!
//! Content-Length framing only, `Connection: close`. Answers from a scripted per-path queue, then
//! from a per-path default (if set), else `404`.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use base64::Engine;

/// One scripted answer: HTTP status, optional `x-eresult` header, body bytes.
#[derive(Clone)]
pub(crate) struct Reply {
    pub status: u16,
    pub x_eresult: Option<i32>,
    pub body: Vec<u8>,
}

impl Reply {
    pub fn ok(body: Vec<u8>) -> Self {
        Reply {
            status: 200,
            x_eresult: Some(1),
            body,
        }
    }
    pub fn eresult(n: i32) -> Self {
        Reply {
            status: 200,
            x_eresult: Some(n),
            body: Vec::new(),
        }
    }
}

/// A recorded request.
#[derive(Clone)]
pub(crate) struct Recorded {
    pub method: String,
    /// Path without the query string.
    pub path: String,
    /// Decoded `input_protobuf_encoded` bytes (form body or query), empty when absent.
    pub input: Vec<u8>,
}

#[derive(Default)]
struct Script {
    queues: HashMap<String, VecDeque<Reply>>,
    defaults: HashMap<String, Reply>,
    requests: Vec<Recorded>,
}

pub(crate) struct Mock {
    base: String,
    script: Arc<Mutex<Script>>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for Mock {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl Mock {
    pub async fn start() -> Mock {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let script = Arc::new(Mutex::new(Script::default()));
        let s = script.clone();
        let task = tokio::spawn(async move {
            loop {
                let Ok((sock, _)) = listener.accept().await else {
                    return;
                };
                let s = s.clone();
                tokio::spawn(async move {
                    let _ = serve(sock, s).await;
                });
            }
        });
        Mock { base, script, task }
    }

    pub fn base_url(&self) -> String {
        self.base.clone()
    }

    /// Queue a reply for `path` (e.g. `/IAuthenticationService/PollAuthSessionStatus/v1`).
    pub fn push(&self, path: &str, reply: Reply) {
        self.script
            .lock()
            .unwrap()
            .queues
            .entry(path.to_string())
            .or_default()
            .push_back(reply);
    }

    /// Reply used once the queue for `path` is empty.
    pub fn set_default(&self, path: &str, reply: Reply) {
        self.script
            .lock()
            .unwrap()
            .defaults
            .insert(path.to_string(), reply);
    }

    pub fn requests(&self) -> Vec<Recorded> {
        self.script.lock().unwrap().requests.clone()
    }

    pub fn count(&self, path: &str) -> usize {
        self.requests().iter().filter(|r| r.path == path).count()
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => {
                let h = std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("");
                if let Ok(v) = u8::from_str_radix(h, 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
                out.push(b'%');
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn extract_input(encoded: &str) -> Vec<u8> {
    for pair in encoded.split('&') {
        if let Some(v) = pair.strip_prefix("input_protobuf_encoded=") {
            return base64::engine::general_purpose::STANDARD
                .decode(percent_decode(v))
                .unwrap_or_default();
        }
    }
    Vec::new()
}

async fn serve(mut sock: tokio::net::TcpStream, script: Arc<Mutex<Script>>) -> std::io::Result<()> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 4096];
    let header_end = loop {
        let n = sock.read(&mut tmp).await?;
        if n == 0 {
            return Ok(());
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break p + 4;
        }
    };
    let head = String::from_utf8_lossy(&buf[..header_end]).into_owned();
    let mut lines = head.lines();
    let mut first = lines.next().unwrap_or("").split(' ');
    let method = first.next().unwrap_or("").to_string();
    let target = first.next().unwrap_or("").to_string();
    let content_length = lines
        .filter_map(|l| l.split_once(':'))
        .find(|(k, _)| k.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, v)| v.trim().parse::<usize>().ok())
        .unwrap_or(0);
    while buf.len() < header_end + content_length {
        let n = sock.read(&mut tmp).await?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
    }
    let body = String::from_utf8_lossy(&buf[header_end..]).into_owned();
    let (path, query) = match target.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (target.clone(), String::new()),
    };
    let input = if method == "GET" {
        extract_input(&query)
    } else {
        extract_input(&body)
    };
    let reply = {
        let mut s = script.lock().unwrap();
        s.requests.push(Recorded {
            method,
            path: path.clone(),
            input,
        });
        s.queues
            .get_mut(&path)
            .and_then(|q| q.pop_front())
            .or_else(|| s.defaults.get(&path).cloned())
    };
    let reply = reply.unwrap_or(Reply {
        status: 404,
        x_eresult: None,
        body: Vec::new(),
    });
    let mut head = format!(
        "HTTP/1.1 {} X\r\nContent-Length: {}\r\nConnection: close\r\n",
        reply.status,
        reply.body.len()
    );
    if let Some(e) = reply.x_eresult {
        head.push_str(&format!("x-eresult: {e}\r\n"));
    }
    head.push_str("\r\n");
    sock.write_all(head.as_bytes()).await?;
    sock.write_all(&reply.body).await?;
    sock.shutdown().await?;
    Ok(())
}
