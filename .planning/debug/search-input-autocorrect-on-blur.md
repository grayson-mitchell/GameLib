---
status: diagnosed
trigger: "search-input-autocorrect-on-blur — Search inputs (Store Search and Library) never rewrite the typed query on blur: no OS autocorrect replacement fires when clicking outside the control (e.g. 'xcom' stays 'xcom', not 'com') (UAT 47 test 12, issue 2, gap G-47-12b)"
created: 2026-11-19T00:00:00Z
updated: 2026-11-19T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED (root cause; fix efficacy not empirically verified, see Evidence #7). The shared SearchBar `<input>` carries no `spellcheck`/`autocorrect` attributes, so WKWebView's macOS text-checking pipeline runs on it with system defaults and macOS "Correct spelling automatically" commits its pending correction (xcom -> com) when the field loses focus; that commit arrives as a native `input` event, SearchBar's listener forwards it, and the whole result set re-filters.
test: inventory inputs + attributes, find shared component, read WebKit source for which attributes gate the correction path, probe the OS spell engine, eliminate app-code rewrite.
expecting: n/a (diagnosis complete)
next_action: return ROOT CAUSE FOUND to the caller (goal: find_root_cause_only). No source modified.

bug_class: Bohrbug (deterministic given a non-dictionary word + macOS autocorrect on; always reproduces for 'xcom')
known_pattern_candidate: none (knowledge-base.md has no spellcheck/autocorrect entry)

candidate_causes:
- environment/OS: macOS system "Correct spelling automatically" + WebKit default state (CONFIRMED, necessary condition)
- code: SearchBar `<input>` does not opt out via spellcheck=false / autocorrect="off" (CONFIRMED, the contributing code defect and the fix point)
- code: app code rewrites query on blur (ELIMINATED, see Eliminated)
- config: Tauri/wry/webview config disables or enables text checking (ELIMINATED as a cause, nothing configured anywhere)
and_gate: yes, two conditions must hold together: (1) the user's macOS has automatic spelling correction on AND (2) the field has not opted out. Remove either and the symptom disappears. Only (2) is in our control, which is why the fix is on the input.

## Symptoms

expected: Typing 'xcom' into a search box and clicking elsewhere leaves the query as 'xcom'.
actual: "as part of the search testing I have deturmined thee major issue with the auto spell check of the control. if you click outside the control the 'correction' is activated. In library this has the most noticibal effect, you might be about to click on a game when the whole set of tiles change because the search wording changes while you are not even in the control! (xcom is a good example - changes to 'com'"
errors: None reported
reproduction: Test 12 in UAT; macOS, `pnpm tauri:dev`. Type 'xcom' in Library search (or Store Search), click outside the input; the text becomes 'com' and the results change.
started: Discovered during UAT 2026-11-19. macOS WKWebView (Tauri) is the renderer.

## Eliminated

- hypothesis: App code rewrites the query on blur (blur handler, normalisation, or a React state sync).
  evidence: No onBlur/blur/focusout handler exists on any search path (SearchBar, LibrarySearchBar, Header, StoreSearch, Library; the only repo hit is the unrelated Sideload dialog image search). Library `handleSearch` is `setFilterText` directly (Library/index.tsx:1196), no transformation. Store Search `query` is stored raw; `trim()` applies only to the debounced copy (useDebouncedStoreSearch.ts:78). 'xcom' -> 'com' is not an operation any of our code performs.
  timestamp: 2026-11-19
- hypothesis: Tauri/wry webview configuration is enabling the correction (or a config is needed to stop it).
  evidence: No spellcheck/autocorrect/NSUserDefaults/WebAutomatic* anywhere in src-tauri/src or tauri.conf.json; GameLib's defaults domains (com.gamelib.shell, gamelib-shell) hold no WebKit text keys. The behaviour is WebKit's system default, not something the shell sets. wry 0.55.1 offers no per-webview API for it either.
  timestamp: 2026-11-19

## Evidence

- timestamp: 2026-11-19
  #: 1
  checked: grep of src/frontend, src-tauri/src, tauri.conf.json for autoCorrect|spellCheck|autoCapitalize
  found: NO search input sets any of them. Only ThemeEditor ColourField/GradientField/AdvancedSection set spellCheck={false}; SteamLogin sets autoCapitalize="characters". No Rust/Tauri/wry text-check config exists.
  implication: nothing disables WebKit's text checking for the search box; it runs on system defaults.
- timestamp: 2026-11-19
  #: 2
  checked: shared component inventory
  found: Library search = Header (Header/index.tsx:317) -> LibrarySearchBar -> SearchBar (components/UI/SearchBar/index.tsx:95, a bare `<input ref id="search" class="searchBarInput">`, no type, no attrs). Store Search (screens/StoreSearch/index.tsx:161) uses the same SearchBar. Other SearchBar callers: Discounts DiscountFilters:286, WineManager:159, Humble Keys:571.
  implication: ONE component is the single fix point for all five search boxes.
- timestamp: 2026-11-19
  #: 3
  checked: macOS NSSpellChecker on this machine (scratchpad/spellprobe.swift)
  found: isAutomaticSpellingCorrectionEnabled=true, isAutomaticTextReplacementEnabled=true, language en_NZ. correction("xcom") == "com" (guesses: com, xclm, xcim...). "com", "hades", "portal" are not flagged.
  implication: reproduces the exact reported rewrite at the OS layer and explains why only 'xcom' ever showed it (hades/portal are dictionary words).
- timestamp: 2026-11-19
  #: 4
  checked: WebKit UIProcess/mac/TextCheckerMac.mm (main)
  found: AutomaticSpellingCorrectionEnabled state = NSUserDefaults `WebAutomaticSpellingCorrectionEnabled` if set, else `[NSSpellChecker isAutomaticTextReplacementEnabled]` (true here). ContinuousSpellCheckingEnabled (squiggles) defaults OFF (key absent). GameLib's app domain has neither key.
  implication: in GameLib, automatic correction is ON out of the box while no red underline is shown, so the rewrite looks like it comes from nowhere. Matches the report.
- timestamp: 2026-11-19
  #: 5
  checked: WebKit WebCore Editor.cpp / AlternativeTextController.cpp / HTMLElement.cpp (main)
  found: Both the typing-completion path (Editor::markMisspellingsAfterTypingToWord) and the correction-panel timer (AlternativeTextController::timerFired, line 272) funnel into Editor::markAllMisspellingsAndBadGrammarInRanges, which returns early when `isSpellCheckingEnabledFor(node)` is false (Editor.cpp:3316); for an `<input>` that resolves to the text control's `spellcheck` attribute. Separately, `AlternativeTextController::canEnableAutomaticSpellingCorrection` (line 374) returns false when the enclosing text control has `autocorrect="off"` (HTMLElement::shouldAutocorrect, HTMLElement.cpp:1005), and `isAutomaticSpellingCorrectionEnabled()` (line 393) and `startAlternativeTextUITimer` (line 114) both consult it. That check is under ENABLE(AUTOCORRECT), which PlatformEnableCocoa.h:252 defines as 1 unconditionally for Cocoa (macOS included). ENABLE(AUTOCAPITALIZE) excludes macOS, so `autocapitalize` is a no-op here.
  implication: per source, `spellcheck="false"` alone kills the entire check/correction pipeline for that field, and `autocorrect="off"` independently disables automatic correction. WKWebView honours both. This is WebKit main; the exact WebKit in the user's macOS 27 was not inspected, and `spellcheck` is the long-standing gate so it is the safer of the two.
- timestamp: 2026-11-19
  #: 6
  checked: why a blur triggers it at all
  found: AlternativeTextController shows the correction bubble after typing a non-dictionary word and the system accepts a pending correction when focus leaves the field (Accepted dismissal, ACC lines 161/233). Accepted replacement lands via the editing pipeline as an `input` event (inputType insertReplacementText). SearchBar listens to the native `input` event (SearchBar/index.tsx:49-52) and calls onInputChanged(element.value), so 'com' flows into filterText/query and re-filters Library or re-runs Store Search.
  implication: explains "tiles change while you are not even in the control". The blur-accept step is from WebKit/AppKit behaviour and was not directly observed in this session; see #7.
- timestamp: 2026-11-19
  #: 7
  checked: throwaway WKWebView harness (scratchpad/wkprobe.swift, outside the repo) driving real NSEvent key/mouse events with default / spellcheck=false / autocorrect=off / all-off / type=search inputs, blurred by click, tab, JS focus, and space, window key+active, with and without explicit Web* prefs
  found: NULL RESULT. Even the UNMODIFIED default input was never rewritten (xcom stayed xcom in every case), so the harness does not reproduce the bug at all. The user reproduces it in the real app.
  implication: the harness proves nothing about whether the attributes fix it. Do NOT cite it as verification. Synthetic NSEvents evidently do not drive the real text-input/correction-bubble path. The fix must be confirmed live (type xcom, click away) in `pnpm tauri:dev`.

## Resolution

root_cause: Not an app-logic defect. The shared `SearchBar` `<input>` (src/frontend/components/UI/SearchBar/index.tsx:95) has no `spellcheck="false"` / `autocorrect="off"`, so WKWebView's macOS text-checking runs on it. GameLib sets no WebKit text prefs, and WebKit's default turns automatic correction ON (it follows the system "Correct spelling automatically", true here), with squiggles off so it is invisible. For a non-dictionary word (xcom) the OS correction is 'com'; it is committed when the field loses focus and arrives as a native `input` event, which SearchBar's native listener forwards to onInputChanged, so Library filterText / Store Search query becomes 'com' and the results change. Two conditions must coincide (macOS autocorrect on AND field not opted out); only the second is in our control.
fix: (not applied, diagnosis only) Add `spellCheck={false}` and `autoCorrect="off"` to the `<input>` in SearchBar (React 18.3.1 / @types/react 18.3.21 accept both: index.d.ts:2920, 2946). `autoCapitalize="off"` and `autoComplete="off"` are optional hygiene (autocapitalize is a no-op on macOS WebKit). One change covers Library, Store Search, Deals, Wine Manager and Humble Keys.
verification: (not run) Live: `pnpm tauri:dev`, type 'xcom' in Library search and in Store Search, click elsewhere, confirm it stays 'xcom' and tiles do not change. Automated guard: a SearchBar test asserting the rendered input has spellcheck="false" and autocorrect="off" (jsdom cannot exercise the OS behaviour, so this only pins the attributes). Add next to src/frontend/components/UI/SearchBar/__tests__/searchBarTypingRace.test.ts.
files_changed: []
