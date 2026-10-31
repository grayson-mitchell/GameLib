/**
 * Pure helpers for the in-app "Report a problem" form: on-device redaction of
 * diagnostics, log tailing, diagnostics formatting and the Web3Forms payload.
 * No window, no node imports, no logging, so it runs in any jest project.
 */

// Log size bound. Keep the last 300 whole lines, redact, then cap to 24 KiB at a
// line boundary (keeping the tail). There are at most 2 logs, so diagnostics stay
// under ~50 KB. The failure is almost always at the tail, the report arrives as an
// email the operator has to read, and Web3Forms documents no request size limit,
// so requests stay small. Cutting by whole lines BEFORE redaction means a token is
// never split at the cut, so a half-token cannot slip past the patterns. Capping
// AFTER redaction means placeholder length changes cannot push it over the limit.
export const REPORT_LOG_MAX_LINES = 300
export const REPORT_LOG_MAX_BYTES = 24 * 1024

const utf8Length = (s: string) => new TextEncoder().encode(s).length

const omittedMarker = (n: number) => `[... ${n} earlier lines omitted ...]`

export function tailLog(
  text: string,
  opts: { maxLines?: number; maxBytes?: number } = {}
): string {
  const maxLines = opts.maxLines ?? REPORT_LOG_MAX_LINES
  const maxBytes = opts.maxBytes ?? REPORT_LOG_MAX_BYTES
  if (!text) return ''

  const all = text.split(/\r?\n/)
  if (all.length && all[all.length - 1] === '') all.pop()
  if (!all.length) return ''

  let start = Math.max(0, all.length - maxLines)
  for (;;) {
    const body = all.slice(start).join('\n')
    const out = start > 0 ? `${omittedMarker(start)}\n${body}` : body
    if (utf8Length(out) <= maxBytes || start >= all.length) {
      return start >= all.length ? omittedMarker(start) : out
    }
    start++
  }
}

// --- redaction -------------------------------------------------------------

const REDACTED = '<redacted>'
const SKIP_NAMES = new Set([
  'shared',
  'public',
  'steamuser',
  'default',
  'all',
  'user',
  'users',
  'steam',
  'root',
  'home'
])

const NAME = '([^/\\\\\\s"\'<>:*?|]+)'
const UNIX_HOME_RE = new RegExp(
  `(\\/(?:Users|home)\\/|\\/var\\/home\\/)${NAME}`,
  'g'
)
const WIN_HOME_RE = new RegExp(`([A-Za-z]:[\\\\/]+Users[\\\\/]+)${NAME}`, 'gi')
const WINE_HOME_RE = new RegExp(`(drive_c[\\\\/]+users[\\\\/]+)${NAME}`, 'gi')
const HOME_RES = [UNIX_HOME_RE, WIN_HOME_RE, WINE_HOME_RE]

const SECRET_KEYS = [
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'token',
  'password',
  'passwd',
  'client_secret',
  'secret',
  'set-cookie',
  'cookie',
  'authorization',
  'session_id',
  'sessionid',
  'code',
  'api_key',
  'apikey'
]
const IDENTITY_KEYS = [
  'username',
  'userid',
  'user_id',
  'galaxyuserid',
  'galaxy_user_id',
  'accountname',
  'account_name',
  'personaname',
  'persona_name',
  'displayname',
  'display_name',
  'steamid',
  'steam_id',
  'accountid',
  'account_id'
]
const KEY_ALT = [...SECRET_KEYS, ...IDENTITY_KEYS]
  .sort((a, b) => b.length - a.length)
  .join('|')

// key (optionally quoted / escape-quoted), separator, then a quoted or bare value.
// "Exact" key match: the lookbehind stops `exit_code` matching `code`.
const KEY_VALUE_RE = new RegExp(
  `(?<![A-Za-z0-9_-])(\\\\?["']?)(${KEY_ALT})(\\\\?["']?)(\\s*[:=]\\s*)` +
    `(\\\\"[^"\\\\]*\\\\"|"(?:[^"\\\\]|\\\\.)*"|'[^']*'|(?:(?:Bearer|Basic)\\s+)?[^\\s,;&"'}\\])]+)`,
  'gi'
)

const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/g
const JWT_RE = /\bey[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/g
const STEAM64_RE = /(?<!\d)7656119\d{10}(?!\d)/g
const STEAM3_RE = /\[U:\d:\d+\]/g
const STEAM2_RE = /STEAM_\d:\d:\d+/g
const STEAM_USERDATA_RE = /(\/userdata\/)\d+/g
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function redactWholeWords(text: string, words: string[], to: string): string {
  const unique = [...new Set(words)].sort((a, b) => b.length - a.length)
  if (!unique.length) return text
  const re = new RegExp(
    `(?<![A-Za-z0-9_])(?:${unique.map(escapeRe).join('|')})(?![A-Za-z0-9_])`,
    'gi'
  )
  return text.replace(re, to)
}

export function redactDiagnostics(
  text: string,
  opts: { knownIdentifiers?: Array<string | null | undefined> } = {}
): string {
  if (!text) return text

  // 1. harvest usernames from home paths
  const harvested: string[] = []
  for (const re of HOME_RES) {
    for (const m of text.matchAll(re)) {
      const name = m[2]
      if (name.length >= 3 && !SKIP_NAMES.has(name.toLowerCase())) {
        harvested.push(name)
      }
    }
  }

  let out = text
  // 2. tokens (Bearer before JWT so the Bearer form keeps its prefix)
  out = out.replace(BEARER_RE, `Bearer ${REDACTED}`).replace(JWT_RE, '<token>')
  // 3. key-based identity and secret values
  out = out.replace(
    KEY_VALUE_RE,
    (
      _m,
      open: string,
      key: string,
      close: string,
      sep: string,
      val: string
    ) => {
      let value = REDACTED
      if (val.startsWith('\\"')) value = `\\"${REDACTED}\\"`
      else if (val.startsWith('"')) value = `"${REDACTED}"`
      else if (val.startsWith("'")) value = `'${REDACTED}'`
      return `${open}${key}${close}${sep}${value}`
    }
  )
  // 4. Steam IDs
  out = out
    .replace(STEAM64_RE, '<steamid>')
    .replace(STEAM3_RE, '<steamid>')
    .replace(STEAM2_RE, '<steamid>')
    .replace(STEAM_USERDATA_RE, '$1<steamid>')
  // 5. emails
  out = out.replace(EMAIL_RE, '<email>')
  // 6. home paths and wine user folders
  for (const re of HOME_RES) {
    out = out.replace(re, (m, prefix: string, name: string) =>
      SKIP_NAMES.has(name.toLowerCase()) ? m : `${prefix}<user>`
    )
  }
  // 7. harvested names and known identifiers as whole words
  out = redactWholeWords(out, harvested, '<user>')
  const known = (opts.knownIdentifiers ?? []).filter(
    (s): s is string => typeof s === 'string' && s.length >= 3
  )
  out = redactWholeWords(out, known, REDACTED)
  return out
}

// --- formatting ------------------------------------------------------------

interface ReportDiagnosticsInput {
  appVersion: string
  os: string
  store?: string
  gameTitle?: string
  appId?: string
  launchRoute?: string
  appLog: string
  gameLog?: string
}

function countLogLines(log: string): number {
  const lines = log.split('\n')
  if (
    lines.length &&
    /^\[\.\.\. \d+ earlier lines omitted \.\.\.\]$/.test(lines[0])
  ) {
    lines.shift()
  }
  return lines.length
}

export function formatDiagnostics(d: ReportDiagnosticsInput): string {
  const head = [`App version: ${d.appVersion}`, `OS: ${d.os}`]
  if (d.store) head.push(`Store: ${d.store}`)
  if (d.gameTitle) head.push(`Game: ${d.gameTitle}`)
  if (d.appId) head.push(`AppId: ${d.appId}`)
  if (d.launchRoute) head.push(`Launch route: ${d.launchRoute}`)

  const parts = [
    head.join('\n'),
    `--- GameLib log (last ${countLogLines(d.appLog)} lines) ---\n${d.appLog}`
  ]
  if (d.gameLog !== undefined) {
    parts.push(`--- Game log ---\n${d.gameLog}`)
  }
  return parts.join('\n\n')
}

// --- payload ---------------------------------------------------------------

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function buildWeb3FormsPayload(args: {
  accessKey: string
  message: string
  replyEmail?: string
  diagnostics?: string
  appVersion: string
  osLabel: string
}): Record<string, string> {
  const payload: Record<string, string> = {
    access_key: args.accessKey,
    subject: `GameLib problem report — v${args.appVersion} — ${args.osLabel}`,
    from_name: 'GameLib in-app report',
    message: args.message
  }
  const email = args.replyEmail?.trim()
  if (email && SIMPLE_EMAIL_RE.test(email)) payload.email = email
  if (args.diagnostics) payload.diagnostics = args.diagnostics
  return payload
}
