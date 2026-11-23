/**
 * Helpers the engine oracles share (87-09, D-08): they record the log lines (the evidence lines the live
 * gates cite). The tar builder, the platform pin and the tree settle wait went with the TS tools oracles
 * in 87-37.
 */
// `instanceof Error` is false for an error graceful-fs made in another jest realm, so the check is
// by tag.
const isError = (item: unknown): item is Error =>
  Object.prototype.toString.call(item) === '[object Error]'

const renderItem = (item: unknown): string =>
  typeof item === 'string'
    ? item
    : isError(item)
      ? `${item.name}: ${item.message}`
      : JSON.stringify(item)

/** A log message (a string, or the array form with errors in it) as one line. */
const renderLogMessage = (message: unknown): string =>
  Array.isArray(message)
    ? message.map(renderItem).join(' ')
    : renderItem(message)

export interface LogLine {
  level: string
  prefix: string
  message: string
}

/** Fills `into` from one logger call: the level, the prefix and the rendered message. */
export function captureLog(
  into: LogLine[],
  level: string,
  message: unknown,
  options: unknown
): void {
  const prefix =
    typeof options === 'string'
      ? options
      : ((options as { prefix?: string } | undefined)?.prefix ?? '')
  into.push({ level, prefix, message: renderLogMessage(message) })
}
