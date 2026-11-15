/**
 * UAT 79-A item 7: after a rejected Steam Guard code the out-of-band poll must resume, or a phone
 * approval that follows the wrong code is never noticed and sign-in hangs. This jest project has
 * no DOM, so this is a source gate on handleGuardSubmit.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Steam Guard retry', () => {
  it('a rejected guard code restarts the credential poll', () => {
    const src = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
    const body = src.slice(
      src.indexOf('async function handleGuardSubmit'),
      src.indexOf('// --- Tab change ---')
    )
    expect(body).toMatch(/clearCredPollInterval\(\)/)
    const errorBranch = body.slice(body.lastIndexOf('} else {'))
    expect(errorBranch).toMatch(/startCredPoll\(\)/)
  })
})
