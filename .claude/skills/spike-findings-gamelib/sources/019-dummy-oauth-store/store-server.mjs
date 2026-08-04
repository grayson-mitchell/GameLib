// Spike 019 — "DummyStore": a local OAuth 2.0 authorization-code-grant provider.
//
// Purpose: an anti-bot-free stand-in for a real store (Epic/GOG/Humble) so login-window
// UX changes (modal windows, password-manager autofill, form iteration) can be tested
// against a login flow we fully control and fully observe.
//
// Zero dependencies — node:http + node:crypto only. Run: node store-server.mjs
//
// Endpoints:
//   GET  /                     store landing page (shows session state)
//   GET  /login                the login form (the UI-iteration surface; ?autologin=1 self-submits)
//   POST /login                credential check → session cookie → redirect to ?next
//   GET  /authorize            OAuth authorize endpoint (auth-code grant, PKCE S256|plain)
//   GET  /callback             redirect_uri landing page ("login complete")
//   POST /token                code + PKCE verifier → access token (CORS-open)
//   GET  /me                   Bearer-protected profile (CORS-open)
//   GET  /logout               clears the session
//   GET  /events               forensic event-log export (JSON)
//
// Demo credentials: user `demo` / password `dummy-store-pw` (shown on the form).

import http from 'node:http'
import crypto from 'node:crypto'

const PORT = 17940
const ORIGIN = `http://127.0.0.1:${PORT}`
const CLIENT_ID = 'gamelib-dummy'
const REDIRECT_URI = `${ORIGIN}/callback`
const DEMO_USER = 'demo'
const DEMO_PASS = 'dummy-store-pw'
const CODE_TTL_MS = 60_000
const TOKEN_TTL_MS = 3_600_000

// ────────────────────────── forensic log ──────────────────────────

const started = Date.now()
const events = []
function log(category, message, data = {}) {
  const event = {
    t: new Date().toISOString(),
    ms: Date.now() - started,
    category,
    message,
    data
  }
  events.push(event)
  console.error(`[${category}] ${message} ${JSON.stringify(data)}`)
}

// Codes/tokens are OUR values, but model the project's secrecy discipline anyway:
// log a 3-char prefix + length, never the full value.
const redact = (v) =>
  typeof v === 'string' && v.length > 0 ? `${v.slice(0, 3)}…<${v.length} chars>` : '<empty>'

// ────────────────────────── in-memory state ──────────────────────────

const sessions = new Map() // sid -> { user, createdAt }
const authCodes = new Map() // code -> { user, clientId, redirectUri, challenge, method, expiresAt, used }
const tokens = new Map() // token -> { user, expiresAt }

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const rand = (n = 32) => b64url(crypto.randomBytes(n))
const sha256b64url = (s) => crypto.createHash('sha256').update(s).digest('base64url')

// ────────────────────────── helpers ──────────────────────────

function parseCookies(req) {
  const out = {}
  for (const kv of (req.headers.cookie || '').split(';')) {
    const i = kv.indexOf('=')
    if (i > 0) out[kv.slice(0, i).trim()] = kv.slice(i + 1).trim()
  }
  return out
}

function sessionOf(req) {
  const sid = parseCookies(req)['dummystore_sess']
  if (!sid) return null
  const s = sessions.get(sid)
  return s ? { sid, ...s } : null
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

function formParams(body, contentType = '') {
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(body)
    } catch {
      return {}
    }
  }
  return Object.fromEntries(new URLSearchParams(body))
}

function html(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers })
  res.end(body)
}

function json(res, status, obj, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    ...headers
  })
  res.end(JSON.stringify(obj, null, 2))
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// ────────────────────────── page chrome ──────────────────────────

const PAGE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: linear-gradient(160deg, #10131a 0%, #1a2030 100%); color: #dfe5ee; }
  .card { width: 380px; background: #171c28; border: 1px solid #262f42; border-radius: 14px;
          padding: 32px 34px 30px; box-shadow: 0 18px 50px rgba(0,0,0,.45); }
  .logo { font-size: 21px; font-weight: 700; letter-spacing: .01em; margin-bottom: 2px; }
  .logo span { color: #5aa2ff; }
  .tag { color: #7c8798; font-size: 12.5px; margin-bottom: 22px; }
  label { display: block; font-size: 12.5px; color: #9aa5b5; margin: 14px 0 5px; }
  input[type=text], input[type=email], input[type=password] {
    width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2c3750;
    background: #0f131d; color: #e8edf5; font: inherit; }
  input:focus { outline: none; border-color: #5aa2ff; }
  button { width: 100%; margin-top: 20px; padding: 11px; border: 0; border-radius: 8px;
           background: #2f6fd6; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  button:hover { background: #3a7ce6; }
  .hint { margin-top: 16px; font-size: 12px; color: #6d7889; text-align: center; }
  .hint code { background: #0f131d; border: 1px solid #262f42; border-radius: 5px; padding: 1px 6px; color: #9fd6ff; }
  .err { margin-top: 14px; padding: 9px 12px; border-radius: 8px; background: #3a1c22;
         border: 1px solid #6e2f3a; color: #ffb4c0; font-size: 13px; }
  .ok { color: #63d992; } .muted { color: #7c8798; }
  a { color: #5aa2ff; }
`

const page = (title, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${PAGE_CSS}</style></head><body><div class="card">${inner}</div></body></html>`

const brand = `<div class="logo">Dummy<span>Store</span></div>
<div class="tag">OAuth 2.0 test store — spike 019</div>`

// ────────────────────────── routes ──────────────────────────

async function route(req, res) {
  const url = new URL(req.url, ORIGIN)
  const path = url.pathname

  log('request', `${req.method} ${path}`, {
    query: Object.fromEntries(
      [...url.searchParams].map(([k, v]) =>
        ['code', 'code_challenge', 'code_verifier'].includes(k) ? [k, redact(v)] : [k, v]
      )
    ),
    hasSession: !!sessionOf(req),
    ua: (req.headers['user-agent'] || '').slice(0, 80)
  })

  // CORS preflight for the API endpoints the harness UI calls with fetch()
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization'
    })
    return res.end()
  }

  // ── landing ──
  if (req.method === 'GET' && path === '/') {
    const s = sessionOf(req)
    return html(
      res,
      200,
      page(
        'DummyStore',
        `${brand}
         <p>${s ? `Signed in as <b class="ok">${esc(s.user)}</b> — <a href="/logout">sign out</a>` : `<span class="muted">Not signed in.</span> <a href="/login?next=/">Sign in</a>`}</p>
         <p class="hint">OAuth clients start at <code>/authorize</code>.</p>`
      )
    )
  }

  // ── login form ──
  if (req.method === 'GET' && path === '/login') {
    const next = url.searchParams.get('next') || '/'
    const autologin = url.searchParams.get('autologin') === '1'
    const error = url.searchParams.get('error')
    log('auth', 'login form served', { next, autologin, error: error || null })
    return html(
      res,
      200,
      page(
        'Sign in — DummyStore',
        `${brand}
        <form method="POST" action="/login" id="loginForm">
          <input type="hidden" name="next" value="${esc(next)}">
          <label for="username">Username or email</label>
          <input type="text" id="username" name="username" autocomplete="username" autofocus required>
          <label for="password">Password</label>
          <input type="password" id="password" name="password" autocomplete="current-password" required>
          ${error ? `<div class="err">${esc(error)}</div>` : ''}
          <button type="submit">Sign in</button>
          <div class="hint">demo creds: <code>${DEMO_USER}</code> / <code>${DEMO_PASS}</code></div>
        </form>
        ${
          autologin
            ? `<script>
                 setTimeout(() => {
                   document.getElementById('username').value = ${JSON.stringify(DEMO_USER)};
                   document.getElementById('password').value = ${JSON.stringify(DEMO_PASS)};
                   document.getElementById('loginForm').submit();
                 }, 600);
               </script>`
            : ''
        }`
      )
    )
  }

  // ── credential check ──
  if (req.method === 'POST' && path === '/login') {
    const body = formParams(await readBody(req), req.headers['content-type'] || '')
    const next = typeof body.next === 'string' && body.next.startsWith('/') ? body.next : '/'
    if (body.username === DEMO_USER && body.password === DEMO_PASS) {
      const sid = rand(24)
      sessions.set(sid, { user: DEMO_USER, createdAt: new Date().toISOString() })
      log('auth', 'login SUCCESS', { user: DEMO_USER, sid: redact(sid), next })
      res.writeHead(302, {
        'set-cookie': `dummystore_sess=${sid}; Path=/; HttpOnly; SameSite=Lax`,
        location: next
      })
      return res.end()
    }
    log('auth', 'login FAILED', { user: String(body.username || ''), next })
    res.writeHead(302, {
      location: `/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent('Invalid username or password.')}`
    })
    return res.end()
  }

  // ── authorize (OAuth entry point) ──
  if (req.method === 'GET' && path === '/authorize') {
    const q = Object.fromEntries(url.searchParams)
    const fail = (why) => {
      log('oauth', 'authorize REJECTED', { why, query: { ...q, code_challenge: redact(q.code_challenge) } })
      return html(res, 400, page('authorize error', `${brand}<div class="err">${esc(why)}</div>`))
    }
    if (q.response_type !== 'code') return fail(`response_type must be "code", got "${q.response_type}"`)
    if (q.client_id !== CLIENT_ID) return fail(`unknown client_id "${q.client_id}"`)
    if (q.redirect_uri !== REDIRECT_URI) return fail(`redirect_uri mismatch: "${q.redirect_uri}"`)
    if (!q.state) return fail('missing state')

    const s = sessionOf(req)
    if (!s) {
      log('oauth', 'authorize → no session, redirecting to login form', {
        state: q.state,
        autologin: q.autologin === '1'
      })
      const next = `/authorize?${url.searchParams.toString()}`
      res.writeHead(302, {
        location: `/login?next=${encodeURIComponent(next)}${q.autologin === '1' ? '&autologin=1' : ''}`
      })
      return res.end()
    }

    const method = q.code_challenge ? q.code_challenge_method || 'plain' : null
    if (method && !['S256', 'plain'].includes(method)) return fail(`unsupported code_challenge_method "${method}"`)
    if (!q.code_challenge) log('oauth', 'WARNING: no PKCE challenge on authorize', { state: q.state })

    const code = rand(24)
    authCodes.set(code, {
      user: s.user,
      clientId: q.client_id,
      redirectUri: q.redirect_uri,
      challenge: q.code_challenge || null,
      method,
      expiresAt: Date.now() + CODE_TTL_MS,
      used: false
    })
    log('oauth', 'authorization code ISSUED', {
      user: s.user,
      code: redact(code),
      pkceMethod: method || 'NONE',
      state: q.state
    })
    res.writeHead(302, { location: `${REDIRECT_URI}?code=${code}&state=${encodeURIComponent(q.state)}` })
    return res.end()
  }

  // ── redirect landing (the harness watches navigation for this URL) ──
  if (req.method === 'GET' && path === '/callback') {
    const code = url.searchParams.get('code')
    log('oauth', 'callback landing served', { code: redact(code || '') })
    return html(
      res,
      200,
      page(
        'Login complete — DummyStore',
        `${brand}
         <p class="ok" style="font-size:17px">✓ Login complete</p>
         <p class="muted">The application has received an authorization code
            (<code>${esc(redact(code || ''))}</code>) and this window can be closed.</p>`
      )
    )
  }

  // ── token exchange ──
  if (req.method === 'POST' && path === '/token') {
    const body = formParams(await readBody(req), req.headers['content-type'] || '')
    const fail = (status, error, why) => {
      log('oauth', 'token exchange REJECTED', { error, why })
      return json(res, status, { error, error_description: why })
    }
    if (body.grant_type !== 'authorization_code')
      return fail(400, 'unsupported_grant_type', `grant_type "${body.grant_type}"`)
    const rec = authCodes.get(body.code)
    if (!rec) return fail(400, 'invalid_grant', 'unknown authorization code')
    if (rec.used) return fail(400, 'invalid_grant', 'code REPLAY detected — code already redeemed')
    if (Date.now() > rec.expiresAt) return fail(400, 'invalid_grant', 'code expired')
    if (body.client_id !== rec.clientId) return fail(400, 'invalid_client', 'client_id mismatch')
    if (body.redirect_uri !== rec.redirectUri) return fail(400, 'invalid_grant', 'redirect_uri mismatch')

    if (rec.challenge) {
      if (!body.code_verifier) return fail(400, 'invalid_grant', 'PKCE verifier missing')
      const derived = rec.method === 'S256' ? sha256b64url(body.code_verifier) : body.code_verifier
      if (derived !== rec.challenge)
        return fail(400, 'invalid_grant', `PKCE verification FAILED (method ${rec.method})`)
    }

    rec.used = true
    const token = rand(32)
    tokens.set(token, { user: rec.user, expiresAt: Date.now() + TOKEN_TTL_MS })
    log('oauth', 'token ISSUED', {
      user: rec.user,
      token: redact(token),
      pkce: rec.challenge ? `verified (${rec.method})` : 'ABSENT'
    })
    return json(res, 200, {
      access_token: token,
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_MS / 1000,
      scope: 'profile'
    })
  }

  // ── protected resource ──
  if (req.method === 'GET' && path === '/me') {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    const rec = token && tokens.get(token)
    if (!rec || Date.now() > rec.expiresAt) {
      log('api', '/me UNAUTHORIZED', { hadToken: !!token })
      return json(res, 401, { error: 'invalid_token' })
    }
    log('api', '/me OK', { user: rec.user })
    return json(res, 200, {
      username: rec.user,
      displayName: 'Demo Gamer',
      library: ['WazHack', 'Avernum 4', 'Hoard'],
      fetchedAt: new Date().toISOString()
    })
  }

  // ── logout ──
  if (req.method === 'GET' && path === '/logout') {
    const s = sessionOf(req)
    if (s) sessions.delete(s.sid)
    log('auth', 'logout', { hadSession: !!s })
    res.writeHead(302, {
      'set-cookie': 'dummystore_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      location: '/'
    })
    return res.end()
  }

  // ── forensic export ──
  if (req.method === 'GET' && path === '/events') {
    return json(res, 200, {
      exportedAt: new Date().toISOString(),
      eventCount: events.length,
      counts: events.reduce((m, e) => ((m[e.category] = (m[e.category] || 0) + 1), m), {}),
      events
    })
  }

  log('request', '404', { path })
  return html(res, 404, page('404', `${brand}<div class="err">No such page: ${esc(path)}</div>`))
}

http
  .createServer((req, res) =>
    route(req, res).catch((e) => {
      log('error', 'unhandled route error', { error: String(e) })
      json(res, 500, { error: 'server_error' })
    })
  )
  .listen(PORT, '127.0.0.1', () => {
    log('server', `DummyStore listening on ${ORIGIN}`, {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      demoUser: DEMO_USER
    })
  })
