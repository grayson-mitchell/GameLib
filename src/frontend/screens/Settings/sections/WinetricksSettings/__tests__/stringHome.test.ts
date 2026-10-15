import { readFileSync } from 'fs'
import { join } from 'path'

// D-20: the redesigned tab's strings live in gamelib.json, never translation.json.
const LOCALES = join(__dirname, '../../../../../../../public/locales/en')
const read = (f: string) => JSON.parse(readFileSync(join(LOCALES, f), 'utf-8'))

describe('winetricks browse strings live in gamelib.json only (D-20)', () => {
  it('gamelib.json holds a populated winetricksBrowse subtree', () => {
    const subtree = read('gamelib.json').winetricksBrowse
    expect(Object.keys(subtree ?? {}).length).toBeGreaterThan(10)
  })

  it('translation.json carries no winetricksBrowse key', () => {
    expect(read('translation.json').winetricksBrowse).toBeUndefined()
    expect(JSON.stringify(read('translation.json'))).not.toContain(
      'winetricksBrowse'
    )
  })
})
