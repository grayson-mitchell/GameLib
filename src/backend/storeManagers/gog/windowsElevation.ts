/**
 * Elevated Windows launches for GOG (quick 261120-uzn).
 *
 * Every value that reaches an elevated PowerShell statement is a single-quoted literal, so no
 * install path, GOG-supplied version name, language or product id can run as PowerShell code.
 *
 * Three facts, measured on 2026-11-20 with Windows PowerShell 5.1:
 *  - powershell.exe rebuilds its script text from argv WITHOUT quotes, so a bare path with a
 *    space (`...\Some Game\unins000.exe`) splits into two tokens and Start-Process never launches
 *    the uninstaller;
 *  - double-quoted PowerShell strings expand `$(...)`, and GOG-supplied strings reached elevated
 *    statements through them;
 *  - Start-Process resolves -FilePath and -WorkingDirectory as wildcard paths, so `[`, `]` and
 *    the backtick must be backtick-escaped in a path literal.
 */
import type { SpawnAsync } from 'backend/spawnAsync'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'

/** One program to run elevated: its path, its argv and an optional working directory. */
export interface ElevatedStep {
  filePath: string
  args: readonly string[]
  workingDirectory?: string
}

/** A single-quoted PowerShell literal: nothing inside is expanded, apostrophes are doubled. */
export function toPowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * A single-quoted literal for a path handed to a wildcard-resolving parameter
 * (-FilePath, -WorkingDirectory): backtick, `[` and `]` are backtick-escaped first.
 */
export function toPowerShellPathLiteral(path: string): string {
  return toPowerShellLiteral(path.replaceAll(/[`[\]]/g, '`$&'))
}

/**
 * One argv element quoted by the MSVCRT / CommandLineToArgvW rules (libuv's quote_cmd_arg):
 * the text is wrapped in double quotes when it is empty or holds whitespace or a double quote,
 * each embedded quote is backslash-escaped, and the backslashes that precede a quote, or the
 * closing quote, are doubled.
 */
export function toWindowsArgument(arg: string): string {
  if (arg.length === 0) return '""'
  if (!/[\s"]/.test(arg)) return arg
  let result = '"'
  let backslashes = 0
  for (const char of arg) {
    if (char === '\\') {
      backslashes++
    } else if (char === '"') {
      result += `${'\\'.repeat(backslashes * 2 + 1)}"`
      backslashes = 0
    } else {
      result += `${'\\'.repeat(backslashes)}${char}`
      backslashes = 0
    }
  }
  return `${result}${'\\'.repeat(backslashes * 2)}"`
}

/** The -ArgumentList value: every argument Windows-quoted, then a PowerShell literal. */
function toStartProcessArgumentList(args: readonly string[]): string {
  return args
    .map((arg) => toPowerShellLiteral(toWindowsArgument(arg)))
    .join(',')
}

/** One Start-Process statement for a step. */
export function startProcessStatement(
  step: ElevatedStep,
  opts: { elevate: boolean; hidden?: boolean }
): string {
  let statement = `Start-Process -FilePath ${toPowerShellPathLiteral(step.filePath)}`
  if (step.args.length > 0) {
    statement += ` -ArgumentList ${toStartProcessArgumentList(step.args)}`
  }
  if (step.workingDirectory !== undefined) {
    statement += ` -WorkingDirectory ${toPowerShellPathLiteral(step.workingDirectory)}`
  }
  if (opts.hidden) statement += ' -WindowStyle Hidden'
  if (opts.elevate) statement += ' -Verb RunAs'
  return `${statement} -Wait`
}

/** The powershell.exe argv that runs one statement. */
export function powershellCommandArgs(statement: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', statement]
}

/** The powershell.exe argv that runs one step elevated. */
export function elevatedStartProcessArgs(step: ElevatedStep): string[] {
  return powershellCommandArgs(startProcessStatement(step, { elevate: true }))
}

/** The silent-uninstall switches GOG Galaxy passes. /KEEPSAVES stops the keep-saved-games dialog. */
export function gogUninstallerSwitches(productId: string): string[] {
  return [
    '/VERYSILENT',
    `/ProductId=${productId}`,
    '/galaxyclient',
    '/KEEPSAVES'
  ]
}

/** The uninstaller as an elevated step, pointed at the install directory. */
export function gogUninstallStep(
  uninstallerPath: string,
  productId: string,
  installDirectory: string
): ElevatedStep {
  return {
    filePath: uninstallerPath,
    args: [...gogUninstallerSwitches(productId), `/dir=${installDirectory}`]
  }
}

/**
 * The longest batch statement that is sent as one elevated launch. CreateProcess caps a command
 * line at 32,767 characters, and a 32,560-character -EncodedCommand went through Start-Process on
 * 2026-11-20; 30,000 stays safely below both. A longer batch falls back to one prompt per step.
 */
export const MAX_BATCH_STATEMENT_CHARS = 30_000

/**
 * One Start-Process statement that launches a hidden powershell.exe running every step, one
 * statement per line, in order. $ErrorActionPreference is left alone on purpose: each step stays
 * independent, so one failing step does not stop the next.
 */
export function batchStatement(
  steps: readonly ElevatedStep[],
  opts: { elevate: boolean }
): string {
  const script = steps
    .map((step) => startProcessStatement(step, { elevate: false }))
    .join('\n')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return startProcessStatement(
    {
      filePath: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]
    },
    { elevate: opts.elevate, hidden: true }
  )
}

async function spawnElevated(
  deps: { spawnAsync: SpawnAsync },
  args: string[],
  workingDirectory: string | undefined
): Promise<{ failed: boolean }> {
  const res = await deps.spawnAsync('powershell', args, {
    windowsHide: true,
    ...(workingDirectory !== undefined ? { cwd: workingDirectory } : {})
  })
  if (res.code !== 0) {
    // A declined UAC prompt lands here.
    logWarning(
      [
        'Elevated step exited with code',
        res.code,
        `stderrLength=${res.stderr.length}`
      ],
      LogPrefix.Gog
    )
    return { failed: true }
  }
  return { failed: false }
}

/**
 * Runs the steps elevated. Several steps share ONE UAC prompt through batchStatement; a batch
 * that is too long, and a single step, elevate directly (one prompt per step). A failing step is
 * counted, never thrown; a spawn that rejects is not swallowed.
 */
export async function runElevatedSteps(
  deps: { spawnAsync: SpawnAsync },
  steps: readonly ElevatedStep[]
): Promise<{ spawns: number; failed: number }> {
  for (const step of steps) {
    logInfo(
      ['Running elevated', step.filePath, step.args.join(' ')],
      LogPrefix.Gog
    )
  }
  if (steps.length === 0) return { spawns: 0, failed: 0 }
  if (steps.length > 1) {
    const statement = batchStatement(steps, { elevate: true })
    if (statement.length <= MAX_BATCH_STATEMENT_CHARS) {
      logInfo(
        ['Running', steps.length, 'elevated steps under one prompt'],
        LogPrefix.Gog
      )
      const result = await spawnElevated(
        deps,
        powershellCommandArgs(statement),
        undefined
      )
      return { spawns: 1, failed: result.failed ? 1 : 0 }
    }
    logWarning(
      ['Elevated batch is too long, elevating one step at a time'],
      LogPrefix.Gog
    )
  }
  let spawns = 0
  let failed = 0
  for (const step of steps) {
    spawns++
    const result = await spawnElevated(
      deps,
      elevatedStartProcessArgs(step),
      step.workingDirectory
    )
    if (result.failed) failed++
  }
  return { spawns, failed }
}
