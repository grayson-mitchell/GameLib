No external API integration: this change widens an existing native WebKit removal call's
(`WKWebsiteDataStore.removeDataOfTypes(forDataRecords:completionHandler:)`) data-type set in
already-shipped code — from `WKWebsiteDataTypeCookies` alone to also include
`WKWebsiteDataTypeDiskCache` and `WKWebsiteDataTypeMemoryCache` — inside
`humble_login_clear_cookies`'s window-based branch (`src-tauri/src/main.rs`). It adds no
external service, SDK, or dependency: `objc2_web_kit::WKWebsiteDataTypeDiskCache` and
`WKWebsiteDataTypeMemoryCache` are already-linked extern statics from the existing
`objc2-web-kit` crate dependency, in use elsewhere in this same file
(`clear_default_data_store_cookies_for_domain`, commit `9359883c7`) since the default-store
branch's twin fix. The `api-coverage` detector fired on a single signal — the noun "api" inside
the phrase "Cache Storage API" in the source todo's prose, which is the WebKit terminology this
change exists to disambiguate (JS-observable Cache Storage API vs. WebKit's native HTTP
disk/memory cache), not an integration point.
