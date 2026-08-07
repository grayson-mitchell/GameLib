// D-03: pins the i18next-parser.config.js settings that a fork-safe `pnpm i18n` run depends
// on. `require`, not `import` — the config file is CommonJS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require('../../i18next-parser.config')

describe('i18next-parser config', () => {
  it('keeps keepRemoved true (D-03) -- flipping this back deletes fork keys the static lexer cannot see', () => {
    expect({
      keepRemoved: config.keepRemoved,
      note:
        'A measured 2026-08-07 run with keepRemoved:false deleted 36 real fork keys ' +
        '(33 in translation.json, 3 in gamepage.json) reached only via dynamic key ' +
        'construction or an aliased `t`. See decision D-03.'
    }).toEqual({
      keepRemoved: true,
      note:
        'A measured 2026-08-07 run with keepRemoved:false deleted 36 real fork keys ' +
        '(33 in translation.json, 3 in gamepage.json) reached only via dynamic key ' +
        'construction or an aliased `t`. See decision D-03.'
    })
  })

  it('keeps namespaceSeparator and keySeparator so `gamelib:steam.installQueued` parses into namespace + dotted key', () => {
    expect(config.namespaceSeparator).toBe(':')
    expect(config.keySeparator).toBe('.')
  })

  it('writes catalogs to the D-01 namespace-file layout', () => {
    expect(config.output).toBe('public/locales/$LOCALE/$NAMESPACE.json')
  })

  it('only ever writes English (D-04)', () => {
    expect(config.locales).toEqual(['en'])
  })

  it('recognises the tGamelib alias in both lexers (plan 34.8-09) -- without this, every gamelib: call site using the second-aliased-hook idiom (`const { t: tGamelib } = useTranslation(\'gamelib\')`) is invisible to the static lexer, whose default `functions` list is only [\'t\']', () => {
    const [tsLexerEntry] = config.lexers.ts
    const [tsxLexerEntry] = config.lexers.tsx

    expect(tsLexerEntry.functions).toEqual(
      expect.arrayContaining(['t', 'tGamelib'])
    )
    expect(tsxLexerEntry.functions).toEqual(
      expect.arrayContaining(['t', 'tGamelib'])
    )
  })
})
