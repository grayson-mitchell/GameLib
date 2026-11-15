// DEBT-02 / 57 WR-09: bound the request body whether Content-Length is
// absent or lying. Stops and cancels the stream once past `max` bytes.
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
