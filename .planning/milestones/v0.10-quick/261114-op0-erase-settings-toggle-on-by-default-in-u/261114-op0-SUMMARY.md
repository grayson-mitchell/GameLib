---
quick_id: 261114-op0
status: complete
commit: 4c9a8ee4a
---

# Quick 261114-op0 Summary

The uninstall dialog's "Erase settings and remove log" toggle now starts ON. DLC
uninstalls, where the toggle is hidden, pass `false` so they cannot silently erase.

Verified: prettier check clean, no tsc errors in the file, DotsMenu.disclosure suite
14/14. Not live-checked in the running app.
