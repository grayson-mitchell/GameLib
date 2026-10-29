/**
 * Session-kept Games search text and alphabet letter.
 *
 * Opening a game page unmounts `Library`, which threw `filterText` and
 * `alphabetFilterLetter` away. They stay session-only by design (D-22 /
 * WR-11, quick 260827-vpl): nothing is kept across launches, so this is
 * plain JS memory, never localStorage. sessionStorage was rejected because
 * whether WKWebView/WebView2 restore it across a Tauri relaunch was not
 * measured; module memory has no such question. It dies with the webview
 * (relaunch or window reload).
 *
 * Safe for the lazily loaded Library route: the module is imported once
 * and stays loaded.
 */
type LibrarySessionSearch = {
  filterText: string
  alphabetFilterLetter: string | null
}

let kept: LibrarySessionSearch = { filterText: '', alphabetFilterLetter: null }

export function readLibrarySessionSearch(): LibrarySessionSearch {
  return { ...kept }
}

export function writeLibrarySessionSearch(value: LibrarySessionSearch): void {
  kept = { ...value }
}

export function resetLibrarySessionSearchForTests(): void {
  kept = { filterText: '', alphabetFilterLetter: null }
}
