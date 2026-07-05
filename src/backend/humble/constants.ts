// Humble domain constants (Phase 10 scaffold).
// Mirrors src/backend/storeManagers/steam/constants.ts's TOKEN_STORE_KEY/TOKEN_PREFIX shape.

export const HUMBLE_TOKEN_STORE_KEY = 'sessionCookie'
export const HUMBLE_TOKEN_PREFIX = 'humble:v1:'

// Persistent (Chromium-backed) session partition shared between the
// /loginweb/humble embedded WebView (renderer) and this main-process cookie
// watch (D-18). Renamed from the in-memory 'humble-login' value so the login
// survives restarts and reconnect (D-11) can skip re-authentication.
export const HUMBLE_LOGIN_PARTITION = 'persist:humble'

export const HUMBLE_BASE_URL = 'https://www.humblebundle.com'
export const HUMBLE_LOGIN_URL = 'https://www.humblebundle.com/login'

// Required on every outgoing Humble API request (adapter.ts) — the likely
// cause of prior third-party Humble integration failures when omitted.
export const HUMBLE_REQUIRED_HEADERS = {
  'X-Requested-By': 'hb_android_app',
  Accept: 'application/json'
}
