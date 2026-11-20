//! Frontend push seam.

/// The Rust twin of the sidecar's frontend push: the renderer sees the same
/// `FRONTEND_MESSAGE_EVENT` payload (`{ channel, args }`) whether a message originates in the
/// sidecar relay or in a Rust crate. The shell implements this once; crates only call it.
pub trait FrontendEmitter: Send + Sync + 'static {
    fn emit(&self, channel: &str, args: Vec<serde_json::Value>);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    type Pushed = Vec<(String, Vec<serde_json::Value>)>;

    struct Recording(Mutex<Pushed>);

    impl FrontendEmitter for Recording {
        fn emit(&self, channel: &str, args: Vec<serde_json::Value>) {
            self.0.lock().unwrap().push((channel.to_string(), args));
        }
    }

    #[test]
    fn an_emitter_is_usable_as_a_shared_trait_object() {
        let rec = Arc::new(Recording(Mutex::new(Vec::new())));
        let dynamic: Arc<dyn FrontendEmitter> = rec.clone();
        dynamic.emit(
            "gameStatusUpdate",
            vec![serde_json::json!({"appName": "480"})],
        );
        let got = rec.0.lock().unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].0, "gameStatusUpdate");
    }
}
