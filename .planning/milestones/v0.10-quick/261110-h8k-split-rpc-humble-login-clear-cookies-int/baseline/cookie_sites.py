import re
src = open("src-tauri/src/login_window/humble_cookies.rs").read().split("\n")
cur = None
for i, l in enumerate(src):
    if l.startswith("fn ") or l.startswith("pub(crate) fn "):
        cur = re.split(r"[(<]", l.split("fn ", 1)[1])[0]
    t = l.strip()
    if t.startswith("//") or t.startswith("*") or "cookies_for_url" in l:
        continue
    if ".cookies()" in l:
        g = "NONE"
        j = i - 1
        while j >= 0:
            tj = src[j].strip()
            if tj.startswith("fn ") or tj.startswith("pub(crate) fn "):
                break
            if tj.startswith("#[cfg("):
                g = tj
                break
            j -= 1
        print(f"{cur}\t{g}\t{t}")
