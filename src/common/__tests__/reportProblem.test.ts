import {
  REPORT_LOG_MAX_BYTES,
  REPORT_LOG_MAX_LINES,
  buildWeb3FormsPayload,
  formatDiagnostics,
  redactDiagnostics,
  tailLog
} from '../reportProblem'

const bytes = (s: string) => new TextEncoder().encode(s).length

describe('redactDiagnostics: home paths', () => {
  test.each([
    ['/Users/alice/Library/Application Support/GameLib/x.log', 'alice'],
    ['/home/alice/.config/heroic/config.json', 'alice'],
    ['/var/home/alice/.local/share/x', 'alice'],
    ['C:\\Users\\alice\\AppData\\Local\\x', 'alice'],
    ['C:\\\\Users\\\\alice\\\\AppData', 'alice'],
    ['C:/Users/alice/Documents', 'alice']
  ])('redacts the user segment of %s', (input, name) => {
    const out = redactDiagnostics(`path=${input}`)
    expect(out).not.toContain(name)
    expect(out).toContain('<user>')
  })

  test('keeps the rest of the path', () => {
    expect(redactDiagnostics('/Users/alice/Library/x.log')).toBe(
      '/Users/<user>/Library/x.log'
    )
    expect(redactDiagnostics('C:\\\\Users\\\\alice\\\\AppData')).toBe(
      'C:\\\\Users\\\\<user>\\\\AppData'
    )
  })

  test('leaves /Users/Shared alone', () => {
    expect(redactDiagnostics('/Users/Shared/Games')).toBe('/Users/Shared/Games')
  })
})

describe('redactDiagnostics: wine user folder', () => {
  test('redacts drive_c/users/<name>', () => {
    expect(redactDiagnostics('pfx/drive_c/users/alice/AppData')).toBe(
      'pfx/drive_c/users/<user>/AppData'
    )
  })

  test('leaves Public and steamuser alone', () => {
    expect(redactDiagnostics('drive_c/users/Public/x')).toBe(
      'drive_c/users/Public/x'
    )
    expect(redactDiagnostics('drive_c/users/steamuser/x')).toBe(
      'drive_c/users/steamuser/x'
    )
  })
})

describe('redactDiagnostics: harvested usernames', () => {
  test('redacts a harvested name elsewhere as a whole word', () => {
    const out = redactDiagnostics(
      'cwd /Users/alice/Games\nwhoami: alice\nmalice stays'
    )
    expect(out).not.toMatch(/\balice\b/)
    expect(out).toContain('malice stays')
  })
})

describe('redactDiagnostics: steam ids', () => {
  test('SteamID64', () => {
    expect(redactDiagnostics('id 76561198012345678 ok')).toBe('id <steamid> ok')
  })
  test('SteamID3', () => {
    expect(redactDiagnostics('id [U:1:52079950] ok')).toBe('id <steamid> ok')
  })
  test('SteamID2', () => {
    expect(redactDiagnostics('id STEAM_0:1:26039975 ok')).toBe(
      'id <steamid> ok'
    )
  })
  test('a non-Steam 17-digit number is untouched', () => {
    expect(redactDiagnostics('n 12345678901234567')).toBe('n 12345678901234567')
  })
})

describe('redactDiagnostics: identity keys', () => {
  test.each([
    'username',
    'userId',
    'galaxyUserId',
    'accountName',
    'personaName',
    'displayName',
    'user_id',
    'steamid',
    'accountId'
  ])('JSON string and number values for %s', (key) => {
    const s = redactDiagnostics(`{"${key}": "secretvalue123"}`)
    expect(s).toBe(`{"${key}": "<redacted>"}`)
    const n = redactDiagnostics(`{"${key}": 482912345}`)
    expect(n).toBe(`{"${key}": <redacted>}`)
  })

  test('is case-insensitive on the key', () => {
    expect(redactDiagnostics('{"USERNAME":"bob"}')).toBe(
      '{"USERNAME":"<redacted>"}'
    )
  })

  test('key=value and key: value forms', () => {
    expect(redactDiagnostics('username=bob next')).toBe(
      'username=<redacted> next'
    )
    expect(redactDiagnostics('userId: 12345 next')).toBe(
      'userId: <redacted> next'
    )
  })

  test('escaped JSON inside a log string', () => {
    const out = redactDiagnostics('payload {\\"username\\":\\"bob\\"} end')
    expect(out).not.toContain('bob')
    expect(out).toContain('username')
  })
})

describe('redactDiagnostics: tokens and secrets', () => {
  test.each([
    'access_token',
    'refresh_token',
    'refreshToken',
    'id_token',
    'token',
    'password',
    'secret',
    'cookie',
    'authorization',
    'session_id',
    'code',
    'api_key'
  ])('redacts %s in JSON, k=v and k: v forms', (key) => {
    expect(redactDiagnostics(`{"${key}": "abc123xyz"}`)).not.toContain(
      'abc123xyz'
    )
    expect(redactDiagnostics(`${key}=abc123xyz`)).not.toContain('abc123xyz')
    expect(redactDiagnostics(`${key}: abc123xyz`)).not.toContain('abc123xyz')
  })

  test('URL query form keeps unrelated params', () => {
    expect(redactDiagnostics('GET /cb?code=abc123&state=x')).toBe(
      'GET /cb?code=<redacted>&state=x'
    )
  })

  test('does not touch keys that merely end in code', () => {
    expect(redactDiagnostics('exit_code: 1')).toBe('exit_code: 1')
  })

  test('Bearer values', () => {
    expect(redactDiagnostics('hdr Bearer abc.DEF-123_x')).toBe(
      'hdr Bearer <redacted>'
    )
  })

  test('JWT shapes, including a steam-session refresh token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl'
    expect(redactDiagnostics(`got ${jwt} done`)).toBe('got <token> done')
    const steam =
      'eyAidHlwIjogIkpXVCIsICJhbGciOiAiRWREU0EiIH0.eyJpc3MiOiJyIn0.AbCdEf'
    expect(redactDiagnostics(`rt ${steam}`)).toBe('rt <token>')
  })

  test('a JWT inside a token key is fully removed', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl'
    const out = redactDiagnostics(`{"token": "${jwt}"}`)
    expect(out).not.toContain('eyJ')
  })
})

describe('redactDiagnostics: emails', () => {
  test('redacts emails anywhere', () => {
    expect(redactDiagnostics('mail me at a.b+c@example.co.uk now')).toBe(
      'mail me at <email> now'
    )
  })
})

describe('redactDiagnostics: knownIdentifiers', () => {
  test('whole-word, case-insensitive', () => {
    const out = redactDiagnostics('hello Alice_Gamer and alice_gamer2', {
      knownIdentifiers: ['alice_gamer', 'ab', '', undefined]
    })
    expect(out).toBe('hello <redacted> and alice_gamer2')
  })

  test('ignores entries shorter than 3 chars', () => {
    expect(
      redactDiagnostics('ab cab ab', { knownIdentifiers: ['ab', null, ''] })
    ).toBe('ab cab ab')
  })

  test('escapes regex metacharacters', () => {
    expect(
      redactDiagnostics('x a.b+c y aXb+c', { knownIdentifiers: ['a.b+c'] })
    ).toBe('x <redacted> y aXb+c')
  })
})

describe('redactDiagnostics: idempotence and combined fixture', () => {
  const combined = [
    '[2026-10-31] gog session: {"userId":"48292345678901234","username":"bobgog","galaxyUserId":"51234567890123456"}',
    'storing in /Users/bobmac/Library/Application Support/GameLib/gog.json',
    'refresh_token=abcDEF123456 user bobmac logged in'
  ].join('\n')

  test('removes every raw secret', () => {
    const out = redactDiagnostics(combined)
    for (const secret of [
      '48292345678901234',
      'bobgog',
      '51234567890123456',
      'bobmac',
      'abcDEF123456'
    ]) {
      expect(out).not.toContain(secret)
    }
  })

  test('twice equals once', () => {
    const once = redactDiagnostics(combined, { knownIdentifiers: ['bobgog'] })
    expect(redactDiagnostics(once, { knownIdentifiers: ['bobgog'] })).toBe(once)
  })
})

describe('tailLog', () => {
  test('empty stays empty', () => {
    expect(tailLog('')).toBe('')
  })

  test('short logs are unchanged', () => {
    expect(tailLog('a\nb\nc')).toBe('a\nb\nc')
  })

  test('1000 lines -> the last 300 with a marker', () => {
    const text = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join(
      '\n'
    )
    const out = tailLog(text)
    const lines = out.split('\n')
    expect(lines[0]).toBe(
      `[... ${1000 - REPORT_LOG_MAX_LINES} earlier lines omitted ...]`
    )
    expect(lines[1]).toBe(`line ${1000 - REPORT_LOG_MAX_LINES + 1}`)
    expect(lines[lines.length - 1]).toBe('line 1000')
    expect(lines).toHaveLength(REPORT_LOG_MAX_LINES + 1)
  })

  test('respects the byte cap and never starts mid-line', () => {
    const text = Array.from(
      { length: 300 },
      (_, i) => `row${i} ${'x'.repeat(200)}`
    ).join('\n')
    const out = tailLog(text)
    expect(bytes(out)).toBeLessThanOrEqual(REPORT_LOG_MAX_BYTES)
    const lines = out.split('\n')
    expect(lines[0]).toMatch(/^\[\.\.\. \d+ earlier lines omitted \.\.\.\]$/)
    for (const l of lines.slice(1)) expect(l).toMatch(/^row\d+ x{200}$/)
    expect(lines[lines.length - 1]).toMatch(/^row299 /)
  })

  test('honours custom bounds', () => {
    const out = tailLog('a\nb\nc\nd', { maxLines: 2, maxBytes: 1000 })
    expect(out).toBe('[... 2 earlier lines omitted ...]\nc\nd')
  })
})

describe('formatDiagnostics', () => {
  test('renders labelled lines and log sections', () => {
    const out = formatDiagnostics({
      appVersion: '2.20.0',
      os: 'macOS 15',
      store: 'steam',
      gameTitle: 'Half-Life',
      appId: '70',
      launchRoute: 'bridge',
      appLog: 'one\ntwo',
      gameLog: 'g1'
    })
    expect(out).toContain('App version: 2.20.0')
    expect(out).toContain('OS: macOS 15')
    expect(out).toContain('Store: steam')
    expect(out).toContain('Game: Half-Life')
    expect(out).toContain('AppId: 70')
    expect(out).toContain('Launch route: bridge')
    expect(out).toContain('--- GameLib log (last 2 lines) ---')
    expect(out).toContain('--- Game log ---')
    expect(out).toContain('g1')
  })

  test('absent game omits game fields and the game log section', () => {
    const out = formatDiagnostics({
      appVersion: '1',
      os: 'x',
      appLog: 'one'
    })
    expect(out).not.toContain('Game:')
    expect(out).not.toContain('AppId:')
    expect(out).not.toContain('Launch route:')
    expect(out).not.toContain('--- Game log ---')
  })
})

describe('buildWeb3FormsPayload', () => {
  const base = {
    accessKey: 'key',
    message: 'it broke',
    appVersion: '2.20.0',
    osLabel: 'macOS 15'
  }

  test('required fields', () => {
    expect(buildWeb3FormsPayload(base)).toEqual({
      access_key: 'key',
      subject: 'GameLib problem report — v2.20.0 — macOS 15',
      from_name: 'GameLib in-app report',
      message: 'it broke'
    })
  })

  test('includes diagnostics only when given', () => {
    expect(
      buildWeb3FormsPayload({ ...base, diagnostics: 'D' }).diagnostics
    ).toBe('D')
    expect(buildWeb3FormsPayload(base)).not.toHaveProperty('diagnostics')
    expect(
      buildWeb3FormsPayload({ ...base, diagnostics: '' })
    ).not.toHaveProperty('diagnostics')
  })

  test('email only when valid', () => {
    expect(
      buildWeb3FormsPayload({ ...base, replyEmail: ' me@x.io ' }).email
    ).toBe('me@x.io')
    expect(
      buildWeb3FormsPayload({ ...base, replyEmail: 'nope' })
    ).not.toHaveProperty('email')
    expect(
      buildWeb3FormsPayload({ ...base, replyEmail: '' })
    ).not.toHaveProperty('email')
  })
})
