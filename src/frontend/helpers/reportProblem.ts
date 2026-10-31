import {
  buildWeb3FormsPayload,
  formatDiagnostics,
  redactDiagnostics,
  tailLog
} from 'common/reportProblem'

import type { GameInfo } from 'common/types'

/**
 * Web3Forms Access Key. The operator pastes it here. Access keys are public by
 * design (they ship in public HTML forms), so committing one is acceptable.
 * Empty means reporting is disabled: the form says so and no request is made.
 * Do not invent a key.
 */
export const WEB3FORMS_ACCESS_KEY = ''

export const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isReportingConfigured(key: string = WEB3FORMS_ACCESS_KEY) {
  return UUID_RE.test(key.trim())
}

export type SubmitResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'not-configured'
        | 'rejected'
        | 'rate-limited'
        | 'server'
        | 'network'
      message?: string
    }

type ReportGame = Pick<GameInfo, 'app_name' | 'runner' | 'title'>

async function safe<T>(fn: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

const LOG_UNAVAILABLE = '(log unavailable)'

async function launchRouteFor(game: ReportGame): Promise<string> {
  try {
    const native = await window.api.isNative({
      appName: game.app_name,
      runner: game.runner
    })
    if (native) return 'native'
    if (game.runner !== 'steam') return 'compatibility layer'
    const verdict = await window.api.getSteamBridgeRoute(game.app_name)
    return verdict.route === 'bottle' ? 'bottled' : verdict.route
  } catch {
    return 'unknown'
  }
}

async function readLog(args: Parameters<typeof window.api.getLogContent>[0]) {
  try {
    const content = await window.api.getLogContent(args)
    return tailLog(content ?? '')
  } catch {
    return LOG_UNAVAILABLE
  }
}

/**
 * Collect diagnostics and redact them in the renderer. Never throws: each
 * source falls back, so collecting can never block sending.
 */
export async function collectDiagnostics(opts: {
  game?: ReportGame
  knownIdentifiers: Array<string | null | undefined>
}): Promise<string> {
  const { game, knownIdentifiers } = opts

  const info = await safe(() => window.api.systemInfo.get(true), undefined)
  const appVersion = await safe(() => window.api.getHeroicVersion(), 'unknown')
  const os = info
    ? `${info.OS.name} ${info.OS.version} (${info.OS.platform})`
    : 'unknown'

  const appLog = await readLog({})
  const gameLog = game
    ? await readLog({ appName: game.app_name, runner: game.runner })
    : undefined
  const launchRoute = game ? await launchRouteFor(game) : undefined

  const text = formatDiagnostics({
    appVersion,
    os,
    store: game?.runner,
    gameTitle: game?.title,
    appId: game?.app_name,
    launchRoute,
    appLog: appLog || LOG_UNAVAILABLE,
    gameLog: gameLog === undefined ? undefined : gameLog || LOG_UNAVAILABLE
  })
  return redactDiagnostics(text, { knownIdentifiers })
}

/**
 * POST the report straight from the renderer: Web3Forms' free plan rejects
 * server-side submissions, so the sidecar is not an option. Nothing about the
 * payload, diagnostics or reply email is ever logged.
 */
export async function submitReport(args: {
  message: string
  replyEmail?: string
  diagnostics?: string
  appVersion: string
  osLabel: string
  accessKey?: string
  fetchImpl?: typeof fetch
}): Promise<SubmitResult> {
  const accessKey = (args.accessKey ?? WEB3FORMS_ACCESS_KEY).trim()
  if (!isReportingConfigured(accessKey)) {
    return { ok: false, reason: 'not-configured' }
  }
  const doFetch = args.fetchImpl ?? fetch
  const payload = buildWeb3FormsPayload({
    accessKey,
    message: args.message,
    replyEmail: args.replyEmail,
    diagnostics: args.diagnostics,
    appVersion: args.appVersion,
    osLabel: args.osLabel
  })

  let res: Response
  try {
    res = await doFetch(WEB3FORMS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    })
  } catch {
    return { ok: false, reason: 'network' }
  }

  if (res.status === 429) return { ok: false, reason: 'rate-limited' }

  let json: {
    success?: boolean
    message?: string
    body?: { message?: string }
  }
  try {
    json = await res.json()
  } catch {
    return { ok: false, reason: 'server' }
  }
  if (res.status >= 500) return { ok: false, reason: 'server' }
  if (res.ok && json?.success === true) return { ok: true }
  return {
    ok: false,
    reason: 'rejected',
    message: json?.body?.message ?? json?.message
  }
}
