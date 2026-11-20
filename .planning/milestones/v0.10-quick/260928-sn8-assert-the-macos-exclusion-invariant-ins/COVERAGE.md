No external API integration: this change rewrites one assertion inside a `#[cfg(test)]` Rust test
(`f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`, `src-tauri/src/main.rs`) that reads its
own file's bytes via `include_str!` and scans them as text. It calls no external service, SDK, or
endpoint; it adds, upgrades, and removes no dependency (`Cargo.toml` and `Cargo.lock` are
untouched); and it uses only `core`/`std` surface already exercised by the same test — `Option`,
`str::contains`, `Vec::sort`, `assert!`/`assert_eq!`, `concat!`. Production source is out of scope
by construction and is held byte-identical to HEAD by an explicit gate over lines 1..11609, the
whole of the file above `#[cfg(test)] mod tests`.

The `api-coverage` detector fired on exactly one signal, and it is this document's own subject:
the verb "integration" adjacent to the noun "api" inside the sentence "**No external API
integration:**" in the plan's `<threat_model>` — the declaration itself, not an integration point.
Re-reading the plan scope confirms the detector's verdict is a false positive: the only API-shaped
name anywhere in scope is wry's `WebView::cookies()`, which is an in-process Rust method call in
production code this plan does not touch and only scans as source text.

Fabricating a capability matrix for a nonexistent external surface would be the
green-check-proving-nothing shape this repo stamps out, so this reasoned declaration stands in its
place, per the `ai-integration` `plan:pre` contribution hook's own instruction.
