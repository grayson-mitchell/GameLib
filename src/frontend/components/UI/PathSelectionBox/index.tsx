import TextInputWithIconField from '../TextInputWithIconField'
import Backspace from '@mui/icons-material/Backspace'
import Folder from '@mui/icons-material/Folder'
import { ReactNode, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileFilter } from 'backend/platform'
import './index.css'

interface Props {
  htmlId: string
  // Whether the selected item should be a directory or a file
  type: 'file' | 'directory'
  // Called when a new path is selected. Note that this function also has to
  // store the new path (for example with a `useState`)
  onPathChange: (path: string) => void
  // The path to display
  path: string
  // The "placeholder" attribute of the <input> element
  placeholder?: string
  // The window title of the file/directory chooser
  pathDialogTitle: string
  pathDialogDefaultPath?: string
  pathDialogFilters?: FileFilter[]
  // Dictates if the user can manually edit the path
  canEditPath?: boolean
  // Disables the Backspace/Delete button, always opening the file picker
  // when the user clicks the icon
  noDeleteButton?: boolean
  label?: string
  afterInput?: ReactNode
  disabled?: boolean
}

const PathSelectionBox = ({
  onPathChange,
  path,
  placeholder,
  pathDialogTitle,
  pathDialogDefaultPath,
  pathDialogFilters,
  type,
  canEditPath = true,
  noDeleteButton = false,
  htmlId,
  label,
  afterInput,
  disabled = false
}: Props) => {
  const { t } = useTranslation()
  // REQ-34.17-03: the commit-hint row's two fixed strings live only in the
  // fork-owned gamelib namespace, never translation.json. Explicit
  // `gamelib:` prefix kept even though the hook is already namespace-scoped
  // -- belt-and-suspenders convention from RedeemSteamKeyDialog/copy.ts.
  const { t: tGamelib } = useTranslation('gamelib')
  // We only send `onPathChange` updates when the user is done editing, so we
  // have to store the partially-edited path *somewhere*
  const [tmpPath, setTmpPath] = useState(path)

  useEffect(() => setTmpPath(path), [path])

  // REQ-34.17-03: true for ~2000ms immediately after a commit that actually
  // fired onPathChange (never after a commit suppressed by guard G1 --
  // nothing was saved, so nothing should flash a confirmation).
  const [justSaved, setJustSaved] = useState(false)

  // Self-clearing pulse. The early return when `justSaved` is false is
  // load-bearing, not defensive style: this test harness's useEffect mock
  // runs effects eagerly on every render, so an unconditional setTimeout
  // here would arm a fresh, never-cleared timer on every single render of
  // every mounted PathSelectionBox in the suite.
  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [justSaved])

  // Derived, not stored: the edit buffer diverges from the committed path.
  const isUnsaved = tmpPath !== path

  // Holds the exact string the most recent Enter keystroke committed, and is
  // armed for exactly one subsequent blur. See commitFromEnter/commitFromBlur.
  const enterCommittedRef = useRef<string | null>(null)

  // The single funnel every commit route goes through.
  //
  // Two guards, not one, because neither alone is sufficient:
  //
  // Guard G1 (below): never re-commit a value already equal to the
  // committed `path` prop. This is what suppresses a redundant commit at
  // 12 of this component's 13 call sites. It is NOT enough on its own —
  // 34.17-RESEARCH.md recommends this comparison alone, but at
  // EgsSettings.tsx the `path` prop (`egsPath`) is only updated AFTER
  // `window.api.egsSync` resolves, so during an Enter-then-Tab in the same
  // tick `path` is still the OLD value, G1 does not fire, and `egsSync`
  // runs twice.
  //
  // Guard G2 (in commitFromBlur): one-shot, value-scoped suppression of the
  // blur that immediately follows an Enter commit of the same string. This
  // is what actually closes REQ-34.17-02 at EgsSettings. G2 alone would
  // leave the unchanged-value blur firing `egsSync` on every focus change
  // at the other 12 sites, so G1 is still needed there. Neither guard
  // subsumes the other.
  function commitPath(next: string) {
    enterCommittedRef.current = null
    if (next === path) {
      // Guard G1
      return
    }
    onPathChange(next)
    // REQ-34.17-03: only this branch actually saved anything, so only this
    // branch may start the "Saved" pulse.
    setJustSaved(true)
  }

  function commitFromEnter(next: string) {
    commitPath(next)
    // Must be set AFTER commitPath, which unconditionally clears the ref.
    enterCommittedRef.current = next
  }

  function commitFromBlur(next: string) {
    if (enterCommittedRef.current === next) {
      // Guard G2. One-shot and value-scoped rather than a blanket "ignore
      // the next blur": if the parent rejects the commit (egsSync fails,
      // egsPath stays as it was), the user must still be able to retry —
      // pressing Enter again re-enters commitFromEnter, and G1 compares
      // against the still-stale `path` and lets the retry through. A
      // flag-based "skip next blur" that ignored the value would also
      // swallow a genuine edit made between the Enter and the blur.
      enterCommittedRef.current = null
      return
    }
    commitPath(next)
  }

  function handleIconClick() {
    if (!noDeleteButton && path) {
      // "Backspace" icon was pressed
      commitPath('')
      setTmpPath(path)
      return
    }

    // "Folder" icon was pressed
    window.api
      .openDialog({
        buttonLabel: t('box.choose'),
        properties: type === 'directory' ? ['openDirectory'] : ['openFile'],
        title: pathDialogTitle,
        filters: pathDialogFilters,
        defaultPath: pathDialogDefaultPath
      })
      .then((selectedPath) => {
        if (selectedPath) {
          commitPath(selectedPath)
          setTmpPath(path)
        }
      })
  }

  // REQ-34.17-03: `justSaved` wins over `isUnsaved` for the one render
  // between a commit firing and the parent's `path` prop actually arriving
  // -- during that window tmpPath still differs from the (stale) `path`
  // prop, which would otherwise flash "unsaved" for a value that just saved.
  const hintClassName = justSaved
    ? 'pathSelectionBoxCommitHint pathSelectionBoxCommitHint--saved'
    : isUnsaved
      ? 'pathSelectionBoxCommitHint pathSelectionBoxCommitHint--unsaved'
      : 'pathSelectionBoxCommitHint'
  const hintText = justSaved
    ? tGamelib('gamelib:pathSelectionBox.saved', 'Saved')
    : isUnsaved
      ? tGamelib(
          'gamelib:pathSelectionBox.unsaved',
          'Not saved yet — press Enter'
        )
      : ''

  return (
    <TextInputWithIconField
      value={tmpPath}
      onChange={(newVal) => setTmpPath(newVal)}
      onBlur={(e) => commitFromBlur(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.repeat) return
        // Bail on auto-repeat: a held Enter key auto-repeats at roughly
        // 30ms intervals, and at EgsSettings each repeat would be a real
        // egsSync IPC that G1 cannot suppress (path is stale for the whole
        // duration of the commit).
        //
        // Read e.currentTarget.value, not tmpPath: this mirrors what
        // onBlur already does with e.target.value and reads the live DOM
        // value, which matters because TextInputField drives the input
        // through a hand-wired addEventListener('input', ...) rather than
        // React's onChange, so tmpPath can lag the DOM by a render.
        commitFromEnter(e.currentTarget.value)
      }}
      onIconClick={handleIconClick}
      placeholder={placeholder}
      icon={!noDeleteButton && path ? <Backspace /> : <Folder />}
      disabled={!canEditPath || disabled}
      htmlId={htmlId}
      label={label}
      afterInput={
        <>
          <span className={hintClassName} role="status">
            {hintText}
          </span>
          {afterInput}
        </>
      }
    />
  )
}

export default PathSelectionBox
