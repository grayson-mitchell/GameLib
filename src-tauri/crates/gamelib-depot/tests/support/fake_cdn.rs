//! Local HTTP/1.1 CDN for fetch tests. Scripted replies are keyed by the full request target
//! (path plus query), so a test can serve one answer for `?t=OLD` and another for `?t=NEW`.
//! The last reply for a target is sticky; an unscripted target answers 404.

use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Debug, Clone)]
pub enum Reply {
    Status(u16, Vec<u8>),
    /// 302 with a Location header.
    Redirect(String),
    /// Accept the request and never answer.
    Hang,
}

#[derive(Debug, Clone)]
pub struct Hit {
    pub target: String,
    /// Raw lower-cased header block.
    pub headers: String,
}

pub struct FakeCdn {
    pub addr: SocketAddr,
    hits: Arc<Mutex<Vec<Hit>>>,
    script: Arc<Mutex<HashMap<String, VecDeque<Reply>>>>,
}

impl FakeCdn {
    pub async fn start() -> FakeCdn {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let hits: Arc<Mutex<Vec<Hit>>> = Arc::default();
        let script: Arc<Mutex<HashMap<String, VecDeque<Reply>>>> = Arc::default();
        let (h, s) = (hits.clone(), script.clone());
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else {
                    return;
                };
                let (h, s) = (h.clone(), s.clone());
                tokio::spawn(async move {
                    let mut buf = Vec::new();
                    let mut tmp = [0u8; 2048];
                    while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
                        match sock.read(&mut tmp).await {
                            Ok(0) | Err(_) => return,
                            Ok(n) => buf.extend_from_slice(&tmp[..n]),
                        }
                    }
                    let text = String::from_utf8_lossy(&buf).to_string();
                    let mut lines = text.split("\r\n");
                    let target = lines
                        .next()
                        .and_then(|l| l.split(' ').nth(1))
                        .unwrap_or("")
                        .to_string();
                    let headers = lines.collect::<Vec<_>>().join("\n").to_lowercase();
                    h.lock().unwrap().push(Hit {
                        target: target.clone(),
                        headers,
                    });
                    let reply = {
                        let mut s = s.lock().unwrap();
                        match s.get_mut(&target) {
                            Some(q) if q.len() > 1 => q.pop_front().unwrap(),
                            Some(q) => q.front().cloned().unwrap_or(Reply::Status(404, vec![])),
                            None => Reply::Status(404, vec![]),
                        }
                    };
                    let out = match reply {
                        Reply::Hang => {
                            std::future::pending::<()>().await;
                            return;
                        }
                        Reply::Status(code, body) => {
                            let mut v = format!(
                                "HTTP/1.1 {code} X\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                                body.len()
                            )
                            .into_bytes();
                            v.extend_from_slice(&body);
                            v
                        }
                        Reply::Redirect(loc) => format!(
                            "HTTP/1.1 302 Found\r\nLocation: {loc}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        )
                        .into_bytes(),
                    };
                    let _ = sock.write_all(&out).await;
                    let _ = sock.shutdown().await;
                });
            }
        });
        FakeCdn { addr, hits, script }
    }

    /// `host:port` as a depot host string.
    pub fn host(&self) -> String {
        self.addr.to_string()
    }

    pub fn script(&self, target: &str, replies: Vec<Reply>) {
        self.script
            .lock()
            .unwrap()
            .insert(target.to_string(), replies.into());
    }

    /// A copy of the replies currently queued for `target`.
    pub fn replies(&self, target: &str) -> Vec<Reply> {
        self.script
            .lock()
            .unwrap()
            .get(target)
            .map(|q| q.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn hits(&self) -> Vec<Hit> {
        self.hits.lock().unwrap().clone()
    }

    pub fn hit_count(&self, target: &str) -> usize {
        self.hits().iter().filter(|h| h.target == target).count()
    }
}
