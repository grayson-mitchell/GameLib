module.exports = {
  contextSeparator: '_',
  // Key separator used in your translation keys

  createOldCatalogs: false,
  // Save the \_old files

  customValueTemplate: null,
  // If you wish to customize the value output the value as an object, you can set your own format.
  // ${defaultValue} is the default value you set in your translation function.
  // Any other custom property will be automatically extracted.
  //
  // Example:
  // {
  //   message: "${defaultValue}",
  //   description: "${maxLength}", // t('my-key', {maxLength: 150})
  // }

  defaultNamespace: 'translation',
  // Default namespace used in your i18next config

  defaultValue: '',
  // Default value to give to empty keys

  failOnWarnings: false,
  // Exit with an exit code of 1 on warnings

  indentation: 4,
  // Indentation of the catalog files

  input: [
    'src/**/*.{ts,tsx}',
    // 260901-ud5 bucket T: test files are not shipped runtime call sites -- excluding them
    // stops test-local sentinel keys (e.g. a deliberately-wrong `bottle.setup.done` default
    // in a __tests__ fixture) from shadowing the real production default because the parser
    // sorts test files after their production counterpart. Negation globs are supported
    // natively by vinyl-fs/glob-stream, which is what the `i18next` CLI feeds `config.input`
    // into (see node_modules/i18next-parser/bin/cli.js).
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}'
  ],
  // An array of globs that describe where to look for source files
  // relative to the location of the configuration file

  keepRemoved: true,
  // D-03: a measured 2026-08-07 run with keepRemoved:false DELETED 36 real fork keys the
  // static lexer cannot see (33 in translation.json, 3 in gamepage.json) — reached only via
  // dynamic key construction or an aliased `t`. Accepted cost: genuinely dead upstream keys
  // are no longer auto-pruned, which is harmless in a fork that is not the translation
  // source of truth.

  keySeparator: '.',
  // Key separator used in your translation keys
  // If you want to use plain english keys, separators such as `.` and `:` will conflict. You might want to set `keySeparator: false` and `namespaceSeparator: false`. That way, `t('Status: Loading...')` will not think that there are a namespace and three separator dots for instance.

  // see below for more details
  lexers: {
    ts: [
      {
        lexer: 'JavascriptLexer',
        // Plan 34.8-09: the retrofit's second-aliased-hook idiom
        // (`const { t: tGamelib } = useTranslation('gamelib')`) is
        // universal across every gamelib: call site outside the
        // injected-TFunction sibling modules (17 files, confirmed via
        // grep). The lexer's default `functions: ['t']` only matches the
        // literal identifier `t`, so it silently could not see any
        // `tGamelib(...)` call -- 16 of 48 retrofitted keys measured
        // absent from the generated catalog before this fix. Adding
        // `tGamelib` here is additive only; it does not change which `t`
        // calls are still recognised.
        functions: ['t', 'tGamelib']
      }
    ],
    tsx: [
      {
        attr: 'i18nKey', // Attribute for the keys
        lexer: 'JsxLexer',
        transSupportBasicHtmlNodes: true,
        // Same reasoning as the `ts` lexer above.
        functions: ['t', 'tGamelib']
      }
    ]
  },

  lineEnding: 'auto',
  // Control the line ending. See options at https://github.com/ryanve/eol

  locales: ['en'],
  // An array of the locales in your applications

  namespaceSeparator: ':',
  // Namespace separator used in your translation keys
  // If you want to use plain english keys, separators such as `.` and `:` will conflict. You might want to set `keySeparator: false` and `namespaceSeparator: false`. That way, `t('Status: Loading...')` will not think that there are a namespace and three separator dots for instance.

  output: 'public/locales/$LOCALE/$NAMESPACE.json',
  // Supports $LOCALE and $NAMESPACE injection
  // Supports JSON (.json) and YAML (.yml) file formats
  // Where to write the locale files relative to process.cwd()

  skipDefaultValues: false,
  // Whether to ignore default values.

  sort: true,
  // Whether or not to sort the catalog

  useKeysAsDefaultValue: false,
  // Whether to use the keys as the default value; ex. "Hello": "Hello", "World": "World"
  // This option takes precedence over the `defaultValue` and `skipDefaultValues` options

  verbose: true,
  // Display info about the parsing including some stat

  transSupportBasicHtmlNodes: true
}
