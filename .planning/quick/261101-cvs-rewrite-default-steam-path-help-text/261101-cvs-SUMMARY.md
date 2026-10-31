# Quick 261101-cvs Summary

Rewrote the Default Steam path help text (`help.steam_path.info`) in the English locale and the matching in-code fallback in `DefaultSteamPath.tsx`. The new text describes the Steam install root's real uses and scopes Proton to Linux.

- Files: `public/locales/en/translation.json`, `src/frontend/screens/Settings/components/DefaultSteamPath.tsx`
- Verify: prettier --check on the .tsx passed; the JSON parses (it is prettier-ignored); the old string is gone from both files; the new string is identical in both; no other locale touched.
- Deviations: none.
