# API Coverage — dpaste.com (paste service)

Decided in Phase 84 plan 84-06 (2026-11-21). The paste service is the only third-party API the logger
talks to, and only on a user-initiated upload (there is no automatic, background or crash-time upload).

This is a full-coverage decision: every capability of the service's public surface is listed, each as
INTEGRATE (the app uses it) or OPT-OUT (the app deliberately does not), and every OPT-OUT carries its reason.
The Rust client lives in `src-tauri/src/log_upload.rs`.

| capability | decision | reason |
| --- | --- | --- |
| create paste (POST /api/v2/ with `content` and `expiry_days`) | INTEGRATE | The one feature the Upload button needs: the first 10 MiB of a log is sent with a 2-day expiry and the returned `https://dpaste.com/...` URL is stored and shown. |
| title and syntax fields | OPT-OUT | Not needed: parity with the TS uploader this replaces, which never sent them. |
| poster field | OPT-OUT | Not needed: it would identify the user to a public paste service. |
| raw or JSON retrieval of a paste | OPT-OUT | Not needed: the app only hands the URL to the user, who opens it in a browser. |
| delete paste | INTEGRATE | Parity only: the request (`token=1&delete=`) is still sent to a stored URL, but dpaste.com has no delete endpoint, so it cannot remove anything. The UI control stays commented out (`deleteButtonReachability.test.tsx`), so this row is proven by the localhost round-trip test in `log_upload.rs`, not from the UI. |
| account or API-key authentication | OPT-OUT | Explicitly out of scope: pastes are anonymous only, as before. |
