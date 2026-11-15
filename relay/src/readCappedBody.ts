// DEBT-02 / 57 WR-09: bound the request body whether Content-Length is
// absent or lying. Stops and cancels the stream once past `max` bytes.
//
// Memory bound: at most `max` bytes of accepted chunks plus ONE chunk. The
// cap is checked after a chunk is read, so a single oversized chunk is held
// in memory before it is rejected. On Workers the platform request-size limit
// and chunk sizing keep that one chunk small; this does not bound the body
// to exactly `max`.
export async function readCappedBody(
  request: Request,
  max: number
): Promise<{ ok: true; text: string } | { ok: false }> {
  if (request.body === null) return { ok: true, text: '' }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      // Fire and forget: a source whose cancel() never settles must not
      // hold the response.
      void reader.cancel().catch(() => undefined)
      return { ok: false }
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    buf.set(c, off)
    off += c.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(buf) }
}
