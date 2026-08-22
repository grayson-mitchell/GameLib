/**
 * Renderer-supplied log text is untrusted input. IN-04 (Phase 34.2 gap cycle 2,
 * `34.2-REVIEW-GAP-CYCLE-2.md`): the renderer can send arbitrary text through
 * the `logError`/`logInfo` send channels, embedded newlines included, and
 * `LogWriter#writeString` appends it verbatim — so a caller can forge whole log
 * lines in `gamelib.log`, e.g. a fake `(12:34:56) [ERROR]:   [Backend]:` entry
 * that a reader, a support bundle, or a log-scraping gate would take at face
 * value. This is exact parity with the Electron handler
 * (`src/backend/logger/ipc_handler.ts`), so it is faithfully-ported
 * pre-existing behaviour rather than a regression introduced by the port.
 *
 * ## Why this is NOT fixed in `LogWriter#writeString`, as the review prescribed
 *
 * The review's remedy was "do it once in `LogWriter#writeString` (escape `\n` →
 * `\\n` for non-forced messages)". Both halves of that are wrong, and applying
 * it verbatim would have been a significant regression:
 *
 * 1. **`forceLog` is not a trust signal.** It is the logs-disabled override —
 *    `writeString` reads it only as `if (this.#logsDisabled && !forceLog)`
 *    (`log_writer.ts:115`). Gating escaping on it would escape trusted
 *    backend messages (nearly all of which are non-forced) while leaving a
 *    renderer message unescaped the moment it travelled a forced path. That is
 *    a gate keyed to the wrong property.
 *
 * 2. **`writeString` sees backend output that is legitimately multi-line.**
 *    Every log call funnels through `logBase` → `formatLogMessage` →
 *    `convertUnknownToString` (`formatter.ts:32-48`), which returns
 *    `message.stack` for an `Error` and `JSON.stringify(message, null, 2)` for
 *    anything else. Escaping newlines there would flatten EVERY stack trace and
 *    EVERY pretty-printed object in the entire application's logs onto one
 *    line — a large, permanent readability loss traded for an info-severity
 *    finding.
 *
 * So the escape belongs at the trust boundary, where the input is known to be
 * renderer-controlled, and nowhere else. The review's underlying intent — "do
 * it once rather than per-channel" — is honoured by there being ONE
 * implementation here that every renderer-facing log channel calls, rather than
 * an escape open-coded into each `ipcMain.on` body.
 *
 * ## Scope
 *
 * Only strings, and strings nested one level inside an array, can inject a raw
 * line break into the formatted output: `convertUnknownToString` returns
 * strings as-is and joins array elements with `' '`. Every other shape is
 * routed through `JSON.stringify`, which escapes line breaks inside string
 * values itself, so a forged prefix would still land inside quoted, indented
 * JSON rather than passing as a real log line. `Error` instances are not
 * reachable from the renderer at all — the structured-clone hop across IPC
 * strips the prototype and delivers a plain object.
 */

/**
 * `\n` and `\r` are the only characters that end a line for a reader of
 * `gamelib.log` or for anything splitting that file on line boundaries.
 * Deliberately NOT included: U+2028 / U+2029. They terminate lines for a
 * JavaScript parser but not for a line-oriented log reader, and widening this
 * class without a demonstrated vector would be escaping for its own sake.
 */
const LINE_BREAK_RE = /[\n\r]/g

const LINE_BREAK_ESCAPES: Readonly<Record<string, string>> = {
  '\n': '\\n',
  '\r': '\\r'
}

/**
 * Replaces raw line breaks with their visible two-character escapes, so the
 * text a caller sent is still legible in the log — and still attributable to
 * the single line it was logged on — without being able to forge a new one.
 */
function escapeLineBreaks(value: string): string {
  return value.replace(LINE_BREAK_RE, (char) => LINE_BREAK_ESCAPES[char])
}

/**
 * Sanitises one renderer-supplied log message. Shape-preserving: a string comes
 * back a string and an array comes back an array of the same length, so the
 * downstream `formatLogMessage` behaviour a caller sees is unchanged apart from
 * the escaping itself.
 */
export function sanitizeRendererLogMessage(message: unknown): unknown {
  if (typeof message === 'string') return escapeLineBreaks(message)
  if (Array.isArray(message)) return message.map(sanitizeRendererLogMessage)
  return message
}
