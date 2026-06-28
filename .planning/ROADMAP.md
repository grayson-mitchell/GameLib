### Phase 4: Branding
**Goal**: App is identified and distributed as GameLib, not Heroic
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: BRAND-01
**Success Criteria** (what must be TRUE):
  1. Title bar displays "GameLib" instead of "Heroic"
  2. About page reflects the GameLib name
  3. Package metadata (package.json and electron-builder config) correctly identifies the app as GameLib
**Plans**: 2 plans

**Wave 1** — Identity rename slice:
- [ ] `04-01-PLAN.md` — Failing GameLib identity smoke script (RED) → targeted rename of 7 locations (package.json name/author/description, electron-builder appId + Linux Name, translation.json sidebar/About values, React fallbacks, APP_DISPLAY_NAME constant + clipboard text) → assert already-correct surfaces intact (GREEN). Gate: `node scripts/verify-branding.cjs` + `npm run codecheck`. (BRAND-01)

**Wave 2** *(blocked on Wave 1 — live-app verification)*:
- [ ] `04-02-PLAN.md` — Human-verify checkpoint: title bar, sidebar version label, About page label, and Copy-to-clipboard text all read "GameLib" in the running app. Gate: human sign-off. (BRAND-01)

**Cross-cutting constraints:**
- Targeted rename only (D-04) — do NOT sweep the ~82 files containing "Heroic".
- Do NOT change the `heroic://` protocol scheme (main.ts / protocol.ts / electron-builder protocols block) — functional deep-link handler.
- Do NOT change `paths.ts` `appFolder = join(configFolder, 'heroic')` — stores user game configs, independent of appId.
- Change i18n string VALUES only, never KEY paths (breaks 50+ locale files).
- `package.json` `name` must be lowercase `gamelib`; capitalized "GameLib" lives in productName + i18n.
- Zero new npm packages.

**UI hint**: yes
