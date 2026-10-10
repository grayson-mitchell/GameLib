/**
 * Unit coverage for the pure winetricks output classifier (Phase 45 D-15).
 *
 * FIXTURE RULE: every line here is a synthetic string modelled on the measured facts of the
 * pinned winetricks script (`20260125-next`): it downloads with plain `curl -L -o ... -C -
 * --fail --retry ...` (no `-s`, no `-#`), so stderr carries curl's default meter - a
 * `% Total` header, a `Dload  Upload` header, and `\r`-redrawn rows whose first column is the
 * percentage; `w_warn` prints a dashed line, `warning: <message>`, a dashed line; `w_die` is
 * `w_warn` then `exit 1`, so a fatal message also arrives as `warning:` and the exit code (not
 * the text) decides failure; `w_try` failures say `Note: command ... returned status N.
 * Aborting.`
 */
import type { WinetricksLogLine } from 'common/types'
import {
  appendLogLine,
  classifyWinetricksLine,
  parseUnsupportedWineVersion,
  splitOutputChunk
} from '../winetricksOutputClassifier'

const CURL_HEADER =
  '  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current'
const CURL_SUBHEADER =
  '                                 Dload  Upload   Total   Spent    Left  Speed'
const CURL_ROW_42 =
  ' 42 12.3M   42 5229k    0     0  1234k      0  0:00:10  0:00:04  0:00:06 1233k'
const CURL_ROW_100 =
  '100 12.3M  100 12.3M    0     0  1530k      0  0:00:08  0:00:08 --:--:-- 1660k'

describe('classifyWinetricksLine', () => {
  describe('progress (curl meter)', () => {
    it('classifies the "% Total" header as progress without a percent', () => {
      expect(classifyWinetricksLine(CURL_HEADER)).toEqual({
        kind: 'progress',
        text: CURL_HEADER
      })
    })

    it('classifies the "Dload  Upload" sub-header as progress without a percent', () => {
      const result = classifyWinetricksLine(CURL_SUBHEADER)
      expect(result?.kind).toBe('progress')
      expect(result?.percent).toBeUndefined()
    })

    it('reads the first column of a meter row as the percent', () => {
      expect(classifyWinetricksLine(CURL_ROW_42)).toMatchObject({
        kind: 'progress',
        percent: 42
      })
    })

    it('reads 100 as a percent', () => {
      expect(classifyWinetricksLine(CURL_ROW_100)).toMatchObject({
        kind: 'progress',
        percent: 100
      })
    })

    it('does not treat a numeric first column above 100 as a percent', () => {
      const row = ' 420 12.3M   42 5229k    0     0  1234k      0'
      expect(classifyWinetricksLine(row)?.kind).not.toBe('progress')
    })
  })

  describe('noise (wine debug channels and separators)', () => {
    it.each([
      '0024:fixme:ntdll:NtQuerySystemInformation info_class SYSTEM_PERFORMANCE_INFORMATION',
      '002c:err:module:import_dll Library MSVCR120.dll (which is needed by L"C:\\\\windows\\\\system32\\\\x.dll") not found',
      'fixme:heap:RtlSetHeapInformation (nil) 1 (nil) 0 stub',
      '0110:trace:seh:foo bar',
      '------------------------------------------------------'
    ])('classifies %p as noise', (line) => {
      expect(classifyWinetricksLine(line)?.kind).toBe('noise')
    })

    it('classifies a 20-dash separator as noise', () => {
      expect(classifyWinetricksLine('-'.repeat(20))?.kind).toBe('noise')
    })

    it('never classifies a wine err channel line as error', () => {
      expect(
        classifyWinetricksLine('002c:err:module:import_dll something')?.kind
      ).not.toBe('error')
    })
  })

  describe('environment', () => {
    it('classifies the unsupported-wine notice as environment', () => {
      const line =
        'warning: Your version of wine 7.7 is no longer supported upstream. You should upgrade to 8.x'
      expect(classifyWinetricksLine(line)?.kind).toBe('environment')
    })

    it('classifies a missing-dependency notice as environment', () => {
      const line =
        'cabextract not installed! Winetricks might fail to install some packages or even open'
      expect(classifyWinetricksLine(line)?.kind).toBe('environment')
    })

    it('classifies a generic non-fatal warning as environment, not error', () => {
      expect(
        classifyWinetricksLine(
          'warning: taskset/cpuset not available on your platform!'
        )?.kind
      ).toBe('environment')
    })
  })

  describe('error', () => {
    it('classifies "returned status N. Aborting." as error even behind a warning: prefix', () => {
      const line =
        'warning: Note: command wine vc_redist.x86.exe returned status 1. Aborting.'
      expect(classifyWinetricksLine(line)?.kind).toBe('error')
    })

    it('classifies a bare "Aborting." as error', () => {
      expect(classifyWinetricksLine('Aborting.')?.kind).toBe('error')
    })

    it('classifies "returned status N" without Aborting as error', () => {
      expect(
        classifyWinetricksLine(
          'Note: command "wine setup.exe" returned status 5'
        )?.kind
      ).toBe('error')
    })
  })

  describe('info', () => {
    it.each([
      'Executing w_do_call vcrun2019',
      'Using winetricks 20260125-next - sha256sum: abc123 with wine-7.7 and WINEARCH=win64'
    ])('classifies %p as info', (line) => {
      expect(classifyWinetricksLine(line)?.kind).toBe('info')
    })
  })

  describe('blank lines', () => {
    it.each(['', '   ', '\t', '\r'])('returns null for %p', (line) => {
      expect(classifyWinetricksLine(line)).toBeNull()
    })
  })

  it('keeps the original text on the result', () => {
    expect(classifyWinetricksLine('Executing w_do_call vcrun2019')).toEqual({
      kind: 'info',
      text: 'Executing w_do_call vcrun2019'
    })
  })

  it('truncates an absurdly long line instead of forwarding it whole', () => {
    const result = classifyWinetricksLine('x'.repeat(10000))
    expect(result?.text.length).toBeLessThan(10000)
  })
})

describe('parseUnsupportedWineVersion', () => {
  it('returns the wine version named in the notice', () => {
    expect(
      parseUnsupportedWineVersion(
        'warning: Your version of wine 7.7 is no longer supported upstream. You should upgrade to 8.x'
      )
    ).toBe('7.7')
  })

  it('returns null for any other line', () => {
    expect(parseUnsupportedWineVersion('Executing w_do_call vcrun2019')).toBe(
      null
    )
    expect(parseUnsupportedWineVersion('')).toBe(null)
  })
})

describe('splitOutputChunk', () => {
  it('splits on \\n and \\r and returns the unterminated tail as the remainder', () => {
    expect(splitOutputChunk('', 'a\nb\r c')).toEqual({
      lines: ['a', 'b'],
      remainder: ' c'
    })
  })

  it('prepends the previous remainder to the next chunk', () => {
    const first = splitOutputChunk('', 'Exec')
    expect(first).toEqual({ lines: [], remainder: 'Exec' })
    expect(splitOutputChunk(first.remainder, 'uting x\n')).toEqual({
      lines: ['Executing x'],
      remainder: ''
    })
  })

  it('does not emit blank lines for a \\r\\n pair', () => {
    expect(splitOutputChunk('', 'a\r\nb\r\n')).toEqual({
      lines: ['a', 'b'],
      remainder: ''
    })
  })

  it('splits curl meter redraws that are separated only by \\r', () => {
    const { lines } = splitOutputChunk('', `${CURL_ROW_42}\r${CURL_ROW_100}\r`)
    expect(lines).toEqual([CURL_ROW_42, CURL_ROW_100])
  })

  it('keeps a remainder of at most 65536 chars for a 70,000-char chunk with no newline', () => {
    const { remainder } = splitOutputChunk('', 'x'.repeat(70000))
    expect(remainder.length).toBeLessThanOrEqual(65536)
  })

  it('does not lose the text of an over-cap chunk', () => {
    const { lines, remainder } = splitOutputChunk('', 'x'.repeat(70000))
    expect(lines.join('').length + remainder.length).toBe(70000)
  })
})

describe('appendLogLine', () => {
  const info = (text: string): WinetricksLogLine => ({ kind: 'info', text })
  const progress = (text: string, percent?: number): WinetricksLogLine =>
    percent === undefined
      ? { kind: 'progress', text }
      : { kind: 'progress', text, percent }

  it('replaces the previous progress line instead of appending another', () => {
    const buffer: WinetricksLogLine[] = []
    appendLogLine(buffer, progress('a', 42))
    appendLogLine(buffer, progress('b', 60))
    expect(buffer).toEqual([progress('b', 60)])
  })

  it('still replaces across wine noise that arrived in between', () => {
    const buffer: WinetricksLogLine[] = []
    appendLogLine(buffer, progress('a', 42))
    appendLogLine(buffer, { kind: 'noise', text: 'fixme:x' })
    appendLogLine(buffer, progress('b', 60))
    expect(buffer.map((line) => line.text)).toEqual(['b', 'fixme:x'])
  })

  it('does not replace a progress line from before an intervening info line', () => {
    const buffer: WinetricksLogLine[] = []
    appendLogLine(buffer, progress('a', 100))
    appendLogLine(buffer, info('Executing w_do_call next'))
    appendLogLine(buffer, progress('b', 5))
    expect(buffer.map((line) => line.text)).toEqual([
      'a',
      'Executing w_do_call next',
      'b'
    ])
  })

  it('keeps the last known percent when the replacing line carries none', () => {
    const buffer: WinetricksLogLine[] = []
    appendLogLine(buffer, progress('row', 42))
    appendLogLine(buffer, progress('header'))
    expect(buffer).toEqual([progress('header', 42)])
  })

  it('drops the oldest entries beyond the cap', () => {
    const buffer: WinetricksLogLine[] = []
    for (let i = 0; i < 250; i++) {
      appendLogLine(buffer, info(`line ${i}`))
    }
    expect(buffer).toHaveLength(200)
    expect(buffer[0].text).toBe('line 50')
  })
})
