/**
 * D-02 (phase 34.18): `README.md` must carry the verbatim sentence
 * `GameLib will not support Intel Macs on macOS` inside its
 * `## Supported Operating Systems` list. The string is normative, not a
 * paraphrase of an intent -- D-02 deliberately specified a literal sentence
 * instead of "communicate the Intel drop somewhere" so that this gate can be
 * a plain `toContain` and the requirement can be closed by grep rather than
 * human judgement.
 *
 * This assertion was RED-proven against HEAD's `README.md` (which lacked the
 * sentence -- line 82 read only `- macOS 14 or newer`) before the disclosure
 * edit landed in the same plan's next task. A gate written after the edit
 * would prove only that the file contains what was just written; the RED run
 * is quoted verbatim in that plan's SUMMARY.md.
 *
 * D-03 is a prohibition, not just an absence of a requirement: the runner
 * situation (`macos-13` retirement, GitHub's Fall 2027 x86_64 EOL, the
 * `F-34.16-G` finding) is the project's problem, not the reader's, and must
 * never leak into user-facing text. That belongs in the phase record and the
 * commit body only. The second assertion below makes that prohibition
 * mechanical: a later well-meaning edit that "explains why" fails here.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const README = readFileSync(join(__dirname, '..', '..', 'README.md'), 'utf-8')

/** The body of the `## Supported Operating Systems` section: from its
 *  heading to the next level-2 heading (or end of file). Empty if the
 *  heading is missing, so the assertion below fails rather than passing on a
 *  sentence that sits elsewhere in the file. */
function supportedOsSection(markdown: string): string {
  const match =
    /^## Supported Operating Systems[ \t]*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(
      markdown
    )
  return match ? match[1] : ''
}

describe('D-02: README Intel-Mac disclosure', () => {
  // 2026-10-05 (phase 34.18 review): scoped to the section the requirement
  // names. A whole-file `toContain` also passed with the sentence anywhere.
  it('contains the verbatim disclosure sentence in the OS-support list', () => {
    expect(supportedOsSection(README)).toContain(
      'GameLib will not support Intel Macs on macOS'
    )
  })

  it('D-03: states the fact only -- no rationale, runner names, or finding IDs leak into README.md', () => {
    expect(README).not.toMatch(/macos-13|Fall 2027|F-34\.16-G/i)
  })
})
