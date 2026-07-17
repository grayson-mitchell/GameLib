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

  /**
   * D-UAT-08: pressing the DownloadManager's main-action button on a
   * finished-failed Steam item ALWAYS re-enqueues via Retry — it never
   * removes. Without a separate remove affordance, a failed Steam item could
   * never be dismissed without also re-triggering the install (the field bug:
   * "X press emitted a fresh 'Cyberpunk 2077 was added to the download
   * queue'"). showRemoveAction gates that separate, remove-ONLY control.
   */
  describe('showRemoveAction', () => {
    it('is true for a finished (non-current) steam error — the only case needing a separate remove control', () => {
      const info = classifyDMItemStatus('error', 'steam', false)
      expect(info.showRemoveAction).toBe(true)
    })

    it('is false while the steam item is still current (actively retrying/installing) — nothing to remove yet', () => {
      const info = classifyDMItemStatus('error', 'steam', true)
      expect(info.showRemoveAction).toBe(false)
    })

    it('is false for a plain cancel/abort — that case already removes via the existing canceled + handleClearItem main-action path', () => {
      const info = classifyDMItemStatus('abort', 'steam', false)
      expect(info.showRemoveAction).toBe(false)
    })

    it.each(['gog', 'legendary', 'nile'] as const)(
      'is false for a %s error — non-steam runners keep their existing merged canceled+remove main-action path, unchanged',
      (runner) => {
        const info = classifyDMItemStatus('error', runner, false)
        expect(info.showRemoveAction).toBe(false)
      }
    )

    it('is false for a finished (done) steam item — nothing to remove, main action opens the game', () => {
      const info = classifyDMItemStatus('done', 'steam', false)
      expect(info.showRemoveAction).toBe(false)
    })
  })
})
