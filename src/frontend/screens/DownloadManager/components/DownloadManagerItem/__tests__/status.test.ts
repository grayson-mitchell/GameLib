/**
 * D-UAT-06 regression: a genuine Steam install/update failure must be
 * classified distinctly from a user cancel/abort — never lumped into the
 * generic "canceled" state (which the DownloadManager renders as
 * "(Canceled)" with only an X-remove action, no Retry).
 *
 * gog/epic/amazon (and any other non-steam runner) must keep their
 * pre-existing merged error+cancel treatment byte-for-byte unchanged —
 * D-UAT-06 acceptance explicitly requires no regression there.
 */
import { classifyDMItemStatus } from '../status'

describe('classifyDMItemStatus', () => {
  it('marks a steam "error" status as isSteamError, never canceled', () => {
    const info = classifyDMItemStatus('error', 'steam', false)

    expect(info.isSteamError).toBe(true)
    expect(info.canceled).toBe(false)
    expect(info.finished).toBe(false)
  })

  it('marks a steam "error" status as isSteamError regardless of `current`', () => {
    const info = classifyDMItemStatus('error', 'steam', true)

    expect(info.isSteamError).toBe(true)
    expect(info.canceled).toBe(false)
  })

  it('a steam "abort" (non-current) is still treated as a genuine cancel — never isSteamError', () => {
    const info = classifyDMItemStatus('abort', 'steam', false)

    expect(info.isSteamError).toBe(false)
    expect(info.canceled).toBe(true)
  })

  it('a steam "abort" while current is neither canceled nor isSteamError (still actively running)', () => {
    const info = classifyDMItemStatus('abort', 'steam', true)

    expect(info.isSteamError).toBe(false)
    expect(info.canceled).toBe(false)
  })

  it.each(['gog', 'legendary', 'nile'] as const)(
    'a %s "error" status keeps the LEGACY merged "canceled" treatment — never isSteamError (D-UAT-06: do not regress non-steam runners)',
    (runner) => {
      const info = classifyDMItemStatus('error', runner, false)

      expect(info.isSteamError).toBe(false)
      expect(info.canceled).toBe(true)
    }
  )

  it('a "done" status is finished, regardless of runner', () => {
    const info = classifyDMItemStatus('done', 'steam', false)

    expect(info.finished).toBe(true)
    expect(info.isSteamError).toBe(false)
    expect(info.canceled).toBe(false)
  })

  it('an undefined status (still queued/never run) is neither finished, canceled, nor a steam error', () => {
    const info = classifyDMItemStatus(undefined, 'steam', false)

    expect(info.finished).toBe(false)
    expect(info.isSteamError).toBe(false)
    expect(info.canceled).toBe(false)
  })
})
