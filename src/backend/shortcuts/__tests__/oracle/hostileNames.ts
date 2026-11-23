/**
 * The hostile name set the shortcut oracles drive the TypeScript with (94-05, D-14).
 *
 * A shortcut is written from three attacker-influenced strings: the game title (a file name and the
 * `Name=` line), the `app_name` (the launch URL and the icon file name) and the `runner` (the
 * launch URL). Each entry below is a title and an app name chosen to break a shell template, a
 * desktop-entry line or a path. Every one is an INPUT only: what the TypeScript wrote for it is
 * recorded by running it, never typed.
 *
 * `iconSafe` marks the entries whose app name can also be a file name on every OS the oracle runs
 * on (the with-icon variant pre-creates `<icons>/<appName>.jpg`).
 */

export interface HostileName {
  /** ASCII-only, used in a case id and a golden file name. */
  id: string
  title: string
  appName: string
  iconSafe: boolean
}

export const HOSTILE_NAMES: readonly HostileName[] = [
  { id: 'plain', title: 'Plain Game', appName: 'plainapp', iconSafe: true },
  {
    id: 'semicolon',
    title: 'Game; rm -rf ~',
    appName: 'app;touch pwned',
    iconSafe: true
  },
  {
    id: 'subshell',
    title: 'Game $(touch pwned)',
    appName: '$(touch pwned)',
    iconSafe: true
  },
  {
    id: 'backtick',
    title: 'Game `touch pwned`',
    appName: '`touch pwned`',
    iconSafe: true
  },
  {
    id: 'single-quote',
    title: "Rock'n'Roll",
    appName: "a'b'; touch pwned; '",
    iconSafe: true
  },
  {
    id: 'double-quote',
    title: '"Quoted" Title',
    appName: 'a"b"; touch pwned; "',
    iconSafe: false
  },
  {
    id: 'ampersand',
    title: 'Tom & Jerry && echo hi',
    appName: 'a&b&&c',
    iconSafe: true
  },
  {
    id: 'spaces',
    title: '  spaced   out  ',
    appName: ' a  b ',
    iconSafe: true
  },
  {
    id: 'tab',
    title: 'Tab\tTitle',
    appName: 'a\tb',
    iconSafe: false
  },
  {
    id: 'newline',
    title: 'Line1\nLine2',
    appName: 'x\ny',
    iconSafe: false
  },
  {
    id: 'non-ascii',
    title: 'Ünïcödé 日本語 Ωmega',
    appName: 'ünï-日本',
    iconSafe: true
  },
  {
    id: 'astral',
    title: 'Emoji \u{1F3AE} Game \u{1D4B3}',
    appName: '\u{1F3AE}-\u{1D4B3}',
    iconSafe: true
  },
  {
    id: 'percent-query',
    title: '100% #1 ?q=1',
    appName: 'a%20b#c?d=e',
    iconSafe: false
  },
  {
    id: 'everything',
    title: '$(a);`b`\'"&|<>',
    appName: '$(a);`b`\'"&|<>\\',
    iconSafe: false
  },
  {
    id: 'separators',
    title: 'A/B\\C:D*E?F"G<H>I|J',
    appName: 'plain-sep',
    iconSafe: true
  },
  {
    id: 'dots',
    title: '...',
    appName: 'dotsapp',
    iconSafe: true
  },
  {
    id: 'empty',
    title: '',
    appName: 'emptyapp',
    iconSafe: true
  },
  {
    id: 'reserved-con',
    title: 'CON',
    appName: 'conapp',
    iconSafe: true
  },
  {
    id: 'reserved-aux-ext',
    title: 'aux.txt',
    appName: 'auxapp',
    iconSafe: true
  },
  {
    id: 'trailing-dots',
    title: 'Trailing dots... ',
    appName: 'trailapp',
    iconSafe: true
  },
  {
    id: 'long',
    title: `Long ${'x'.repeat(115)}`,
    appName: 'longapp',
    iconSafe: true
  }
]

/** The runners that can make a desktop shortcut (every `Runner`; Steam is hidden only for Add to Steam). */
export const SHORTCUT_RUNNERS = [
  'legendary',
  'gog',
  'sideload',
  'nile',
  'steam'
] as const

/**
 * Runner strings that are not a real runner, to pin how the launch URL escapes the runner on each
 * platform. `addSteamShortcuts` is off in every case, so the runner never reaches `storeCapabilities`.
 */
export const HOSTILE_RUNNERS: readonly { id: string; runner: string }[] = [
  { id: 'r-semicolon', runner: 'a;touch pwned' },
  { id: 'r-subshell', runner: '$(touch pwned)' },
  { id: 'r-backtick', runner: '`touch pwned`' },
  { id: 'r-quotes', runner: `a'b"c` },
  { id: 'r-ampersand', runner: 'a&b=c#d' },
  { id: 'r-space', runner: 'a b\tc' },
  { id: 'r-unicode', runner: 'ünï\u{1F3AE}' }
]

/**
 * The inputs of the `sanitize-filename` vectors (Pitfall 9). The oracle also runs every hostile
 * title above. A string is stored as UTF-16 code units in the golden so a lone surrogate survives.
 */
export const SANITIZE_VECTORS: readonly { id: string; input: string }[] = [
  { id: 'plain', input: 'Hello World' },
  { id: 'empty', input: '' },
  { id: 'dot', input: '.' },
  { id: 'dotdot', input: '..' },
  { id: 'many-dots', input: '.....' },
  { id: 'trailing-dot', input: 'name.' },
  { id: 'trailing-dots', input: 'name...' },
  { id: 'trailing-space', input: 'name ' },
  { id: 'trailing-mixed', input: 'name . . ' },
  { id: 'leading-dot', input: '.hidden' },
  { id: 'leading-space', input: ' lead' },
  { id: 'slash', input: 'a/b' },
  { id: 'backslash', input: 'a\\b' },
  { id: 'colon', input: 'a:b' },
  { id: 'star', input: 'a*b' },
  { id: 'question', input: 'a?b' },
  { id: 'quote', input: 'a"b' },
  { id: 'lt-gt', input: 'a<b>c' },
  { id: 'pipe', input: 'a|b' },
  { id: 'all-illegal', input: '/?<>\\:*|"' },
  { id: 'nul', input: 'a\u0000b' },
  { id: 'c0-controls', input: 'a\u0001\u001fb' },
  { id: 'c1-controls', input: 'a\u0080\u009fb' },
  { id: 'del', input: 'a\u007fb' },
  { id: 'tab-newline', input: 'a\tb\nc\rd' },
  { id: 'reserved-con', input: 'con' },
  { id: 'reserved-CON', input: 'CON' },
  { id: 'reserved-prn', input: 'prn' },
  { id: 'reserved-aux', input: 'AUX' },
  { id: 'reserved-nul', input: 'nul' },
  { id: 'reserved-com1', input: 'COM1' },
  { id: 'reserved-com9', input: 'com9' },
  { id: 'reserved-lpt1', input: 'LPT1' },
  { id: 'reserved-lpt9-ext', input: 'lpt9.txt' },
  { id: 'reserved-con-ext', input: 'con.tar.gz' },
  { id: 'reserved-prefix-ok', input: 'console' },
  { id: 'reserved-com10-ok', input: 'com10' },
  { id: 'unicode', input: 'Ünïcödé 日本語' },
  { id: 'astral', input: 'a\u{1F3AE}b' },
  { id: 'astral-only', input: '\u{1F3AE}\u{1D4B3}' },
  { id: 'lone-high-surrogate', input: 'a\ud83cb' },
  { id: 'lone-low-surrogate', input: 'a\udf6eb' },
  { id: 'surrogate-pair-split-at-255', input: `${'a'.repeat(254)}\u{1F3AE}` },
  { id: 'ascii-255', input: 'a'.repeat(255) },
  { id: 'ascii-256', input: 'a'.repeat(256) },
  { id: 'ascii-1000', input: 'a'.repeat(1000) },
  { id: 'utf8-3byte-over', input: '日'.repeat(100) },
  { id: 'utf8-2byte-edge', input: `${'a'.repeat(254)}é` },
  { id: 'trailing-after-truncate', input: `${'a'.repeat(254)}. ` },
  { id: 'spaces-only', input: '   ' },
  { id: 'mixed-everything', input: '  $(a);`b`\'"&|<>/\\?*:  ...' }
]
