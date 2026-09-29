import json,glob
for f in sorted(glob.glob('results/control028-*.jsonl')):
    print(f)
    for l in open(f):
        d=json.loads(l)
        if d['category']=='autorun' and d['message'][:2] in ('9b','9d','9f','9h','9k','9m','9n','9g','9l'):
            dd=d['data']
            if 'children' in dd: v=[(c['type'][:8],c['allocationOwnParent']['w'],c['allocationOwnParent']['h']) for c in dd['children']]
            elif 'webviews' in dd: v=[(w['label'],w['boundsPhysical'][-36:]) for w in dd['webviews']]
            else: v=dd
            print(' ',d['message'][:3],v)
