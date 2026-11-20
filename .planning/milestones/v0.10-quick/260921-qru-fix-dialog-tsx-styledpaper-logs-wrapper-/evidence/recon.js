// Reconnaissance only. Answers: does the app boot under bare Vite, what is on
// screen, and is there any route to a Settings dialog carrying .logs-wrapper?
// Measures NOTHING about heights -- if this comes back empty the real probe is
// not worth running.
const out = {};

out.href = location.href;
out.title = document.title;
out.hasTauriGlobal = typeof window.__TAURI__ !== 'undefined';
out.hasWindowApi = typeof window.api !== 'undefined';
out.hasIsTauri = typeof window.isTauri !== 'undefined' ? String(window.isTauri) : 'absent';

const root = document.getElementById('root');
out.rootExists = !!root;
out.rootChildCount = root ? root.children.length : 0;
out.bodyTextLen = (document.body.innerText || '').length;
out.bodyTextHead = (document.body.innerText || '').slice(0, 400);

// Stylesheet reachability -- if the app's CSS never loaded, every later
// computed-style number would be a false negative.
out.styleSheetCount = document.styleSheets.length;
let emotionSheets = 0;
for (const s of document.styleSheets) {
  try {
    if (s.ownerNode && s.ownerNode.getAttribute && s.ownerNode.getAttribute('data-emotion')) emotionSheets++;
  } catch (e) { /* cross-origin, ignore */ }
}
out.emotionSheetCount = emotionSheets;

// Is the rule under test present anywhere in the injected CSS?
const found = [];
for (const s of document.styleSheets) {
  let rules;
  try { rules = s.cssRules; } catch (e) { continue; }
  if (!rules) continue;
  for (const r of rules) {
    const t = r.cssText || '';
    if (t.includes('logs-wrapper')) found.push(t.slice(0, 220));
  }
}
out.logsWrapperRulesInjected = found;

// What navigable surface exists right now?
out.buttonLabels = Array.from(document.querySelectorAll('button'))
  .map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim())
  .filter(Boolean)
  .slice(0, 25);
out.linkHrefs = Array.from(document.querySelectorAll('a[href]'))
  .map((a) => a.getAttribute('href'))
  .slice(0, 25);

out.logsWrapperInDom = !!document.querySelector('.logs-wrapper');
out.settingsContentInDom = !!document.querySelector('.settingsDialogContent');
out.muiPaperCount = document.querySelectorAll('.MuiPaper-root').length;

return JSON.stringify(out, null, 2);
