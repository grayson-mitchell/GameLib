import json
rows={}
for l in open('runs/stage1.jsonl'):
    r=json.loads(l); rows[r['appid']]=r
M=2**20
print("| Game | files =/~/+/- | old-manifest files OK | mismatch | full MiB | file-level MiB | chunk-level MiB | reuse moved-in-file MiB | reuse cross-file MiB | reuse same-offset MiB |")
print("|---|---|---|---|---|---|---|---|---|---|")
for r in rows.values():
    d=r['diff']; f=d['files']; b=d['bytes']; lo=d['local']
    fs="%d/%d/%d/%d"%(f['unchanged'],f['changed'],f['added'],f['removed'])
    print("| %s | %s | %d of %d | %s | %.1f | %.1f | %.1f | %.1f | %.1f | %.1f |"%(r['name'],fs,lo['oldFilesOk'],f['old'],", ".join(lo['mismatch']),b['fullDownloadCompressed']/M,b['fileLevelDeltaCompressed']/M,b['chunkLevelDeltaCompressed']/M,b['reuseMovedInFile']/M,b['reuseCrossFile']/M,b['reuseSameOffset']/M))
for r in rows.values():
    lo=r['diff']['local']
    print("-", r['name'], "| mismatch in changed files:", lo['mismatchInChangedFiles'], "| unowned:", lo['unownedSample'][:6])
