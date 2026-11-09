/**
 * The test capture sink of D-07: a LogSink that records every line so a test
 * can assert on what a module logged. State lives in the factory closure.
 */
import type { LogSink } from '../process/types'

export interface CaptureLog extends LogSink {
  readonly lines: readonly {
    level: 'info' | 'warn' | 'error'
    msg: string
  }[]
}

export function createCaptureLog(): CaptureLog {
  const lines: { level: 'info' | 'warn' | 'error'; msg: string }[] = []
  return {
    lines,
    info: (msg) => void lines.push({ level: 'info', msg }),
    warn: (msg) => void lines.push({ level: 'warn', msg }),
    error: (msg) => void lines.push({ level: 'error', msg })
  }
}
