import { readCappedBody } from '../readCappedBody'

const enc = new TextEncoder()

function streamOf(
  parts: Uint8Array[],
  opts: { close?: boolean; onCancel?: () => void } = {}
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(p)
      if (opts.close !== false) controller.close()
    },
    cancel() {
      opts.onCancel?.()
    }
  })
}

const reqOf = (body: ReadableStream<Uint8Array>) =>
  new Request('https://relay.test/v1/reports', {
    method: 'POST',
    body,
    duplex: 'half'
  } as RequestInit & { duplex: 'half' })

const bytes = (n: number, ch = 0x61) => new Uint8Array(n).fill(ch)

describe('readCappedBody (DEBT-02)', () => {
  it('returns empty text for a null body', async () => {
    const r = new Request('https://relay.test/v1/reports', { method: 'POST' })
    expect(await readCappedBody(r, 2048)).toEqual({ ok: true, text: '' })
  })

  it('concatenates an under-cap multi-chunk body', async () => {
    const parts = [bytes(40, 0x61), bytes(30, 0x62), bytes(30, 0x63)]
    const res = await readCappedBody(reqOf(streamOf(parts)), 2048)
    expect(res).toEqual({
      ok: true,
      text: 'a'.repeat(40) + 'b'.repeat(30) + 'c'.repeat(30)
    })
  })

  it('accepts a body of exactly max bytes', async () => {
    const res = await readCappedBody(reqOf(streamOf([bytes(2048)])), 2048)
    expect(res.ok).toBe(true)
  })

  it('rejects a body of max + 1 bytes', async () => {
    const res = await readCappedBody(reqOf(streamOf([bytes(2049)])), 2048)
    expect(res).toEqual({ ok: false })
  })

  it('cancels a never-closing stream once over the cap', async () => {
    let cancelled = false
    const parts = [bytes(1000), bytes(1000), bytes(1000)]
    const res = await readCappedBody(
      reqOf(
        streamOf(parts, {
          close: false,
          onCancel: () => {
            cancelled = true
          }
        })
      ),
      2048
    )
    expect(res).toEqual({ ok: false })
    expect(cancelled).toBe(true)
  })

  it('decodes a multibyte character split across chunks exactly', async () => {
    const all = enc.encode('{"note":"café"}')
    const i = all.indexOf(0xc3) + 1
    const res = await readCappedBody(
      reqOf(streamOf([all.slice(0, i), all.slice(i)])),
      2048
    )
    expect(res).toEqual({ ok: true, text: '{"note":"café"}' })
  })

  it('propagates a stream read error', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('boom'))
      }
    })
    await expect(readCappedBody(reqOf(body), 2048)).rejects.toThrow('boom')
  })
})
