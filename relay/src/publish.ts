// GitHub decision flow for a validated known-fix report (D-05..D-08, D-11,
// D-20). GitHub is the source of truth; every call is awaited in sequence
// (the contents API answers 409 to parallel writes). The caller must hold the
// per-appId publish lease (CR-02), so no other request touches the branch.
import {
  KNOWN_FIX_REPORT_PAIRS,
  type KnownFixReport
} from '../../src/common/knownFixReport'
import { fixFilePath, planAdd, planRemove } from './fileEdit'
import type { RepoClient } from './githubFiles'
import {
  issueTitle,
  parseReportMarker,
  prTitle,
  renderIssueBody,
  renderPrBody,
  type BodyEntry
} from './prBody'

export type PublishInput = {
  report: KnownFixReport
  title: string
  detector: 'macho' | 'ceg'
  gh: RepoClient
  baseBranch: string
  /**
   * CR-01: body entries for a PR: the rows that PR proposed plus this report.
   * `null` means a PR that does not exist yet (this report alone).
   */
  entriesFor: (prNumber: number | null) => Promise<BodyEntry[]>
  reserveCreation: () => Promise<boolean>
}

export type PublishOutcome = {
  status:
    | 'created'
    | 'updated'
    | 'counted'
    | 'already-known'
    | 'suppressed'
    | 'skipped'
    | 'rate-limited'
  prNumber?: number
  issueNumber?: number
  detail?: string
}

type Plan =
  | { kind: 'create' | 'update'; text: string }
  | { kind: 'delete' }
  | { kind: 'already-known' }
  | { kind: 'not-in-repo' }
  | { kind: 'skipped'; reason: string }

export async function publishReport(
  input: PublishInput
): Promise<PublishOutcome> {
  const { report, gh, baseBranch } = input
  const { appId, key, op } = report
  const branch = `report/steam-${appId}`
  const path = fixFilePath(appId)
  const value = KNOWN_FIX_REPORT_PAIRS[key]
  const title = prTitle(appId, { key, op })
  const message = `known-fix: ${title}`

  const ownEntries = await input.entriesFor(null)
  const own = ownEntries.find((e) => e.key === key && e.op === op)
  const note = {
    gamelibVersion: report.gamelibVersion,
    firstSeen: own?.firstSeen ?? Date.now()
  }
  const plan = (text: string | null): Plan =>
    op === 'add'
      ? planAdd(text, key, value, input.title, note)
      : planRemove(text)

  const body = (entries: BodyEntry[]) =>
    renderPrBody({ appId, title: input.title, entries })

  const main = await gh.getFile(path, baseBranch)
  const mainPlan = plan(main?.text ?? null)
  if (mainPlan.kind === 'already-known') return { status: 'already-known' }
  if (mainPlan.kind === 'skipped') {
    return { status: 'skipped', detail: mainPlan.reason }
  }

  if (mainPlan.kind === 'not-in-repo') {
    // D-11: only a bundled copy carries the entry; ask for a release fix.
    const label = 'bundled-removal'
    const existing = await gh.findIssueByTitle(label, issueTitle(appId))
    if (existing !== null) return { status: 'counted', issueNumber: existing }
    if (!(await input.reserveCreation())) return { status: 'rate-limited' }
    const issueNumber = await gh.createIssue({
      title: issueTitle(appId),
      body: renderIssueBody({
        appId,
        title: input.title,
        count: own?.count ?? 1,
        lastVersion: own?.lastVersion ?? report.gamelibVersion
      }),
      labels: [label]
    })
    return { status: 'created', issueNumber }
  }

  const open = await gh.findPulls(branch, 'open')
  if (open.length > 0) {
    // D-06: fold into the existing PR, never open a second one.
    const prNumber = open[0].number
    const branchFile = await gh.getFile(path, branch)
    const branchPlan = plan(branchFile?.text ?? null)
    if (branchPlan.kind === 'create' || branchPlan.kind === 'update') {
      await gh.putFile({
        path,
        branch,
        text: branchPlan.text,
        message,
        sha: branchFile?.sha
      })
    } else if (branchPlan.kind === 'delete' && branchFile) {
      await gh.deleteFile({ path, branch, sha: branchFile.sha, message })
    }
    await gh.updatePullBody(prNumber, body(await input.entriesFor(prNumber)))
    return { status: 'updated', prNumber }
  }

  // D-20: an operator-closed (unmerged) PR for this key/op suppresses.
  const closed = await gh.findPulls(branch, 'closed')
  const wanted = `${key}:${op}`
  if (
    closed.some(
      (p) => p.mergedAt === null && parseReportMarker(p.body).includes(wanted)
    )
  ) {
    return { status: 'suppressed' }
  }

  if (!(await input.reserveCreation())) return { status: 'rate-limited' }

  const baseSha = await gh.getBranchSha(baseBranch)
  // No open PR and the lease is ours: a surviving branch is a leftover of a
  // merged or closed PR, so resetting it to base cannot drop live work.
  if ((await gh.createBranch(branch, baseSha)) === 'exists') {
    await gh.forceBranch(branch, baseSha)
  }
  if (mainPlan.kind === 'create' || mainPlan.kind === 'update') {
    await gh.putFile({
      path,
      branch,
      text: mainPlan.text,
      message,
      sha: mainPlan.kind === 'update' ? main?.sha : undefined
    })
  } else if (main) {
    await gh.deleteFile({ path, branch, sha: main.sha, message })
  }
  const prNumber = await gh.createPull({
    title,
    head: branch,
    base: baseBranch,
    body: body(ownEntries)
  })
  return { status: 'created', prNumber }
}
