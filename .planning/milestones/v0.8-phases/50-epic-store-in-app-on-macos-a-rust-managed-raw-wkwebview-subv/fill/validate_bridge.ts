/**
 * Phase 50 plan 04, Task 1. Preflight check 8 ("real validation with a
 * sabotage control") requires importing the GENUINE `validateTranslation`
 * from `meta/machineFillGamelib.ts` -- not a Python reimplementation of its
 * placeholder/glossary rules, which could silently drift from the real
 * function and validate nothing. Python cannot import a TypeScript module
 * directly, so this is a small bridge: read a JSON payload on stdin, call
 * the real function once per item, write the results as a JSON array on
 * stdout.
 *
 * `JEST_WORKER_ID` MUST be set in the environment of the node process that
 * runs this file (before node starts, not inside this file -- import
 * statements are hoisted ahead of any top-level assignment in this module,
 * so setting it here would be too late) so that `machineFillGamelib.ts`'s
 * own `if (!process.env.JEST_WORKER_ID) void main()` entrypoint guard does
 * not fire a real network call / filesystem write / process.exit.
 */
import { validateTranslation } from '../../../../meta/machineFillGamelib'

interface BridgeItem {
  source: string
  target: string
  countOptional?: boolean
}

interface BridgeInput {
  glossary: string[]
  items: BridgeItem[]
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

async function main(): Promise<void> {
  const raw = await readStdin()
  const input = JSON.parse(raw) as BridgeInput

  const results = input.items.map((item) =>
    validateTranslation(item.source, item.target, input.glossary, {
      countOptional: item.countOptional
    })
  )

  process.stdout.write(JSON.stringify(results))
}

void main()
