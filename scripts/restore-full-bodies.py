#!/usr/bin/env python3
"""
Puts the full text back on postings whose stored text was cut at 4,000 characters by app/build_data.py
(`x['text']=(x['text'] or '')[:4000]`). The raw collection files keep the whole text; ids are a hash of url|company|title|location,
so each stored posting is matched to its raw row exactly as build_data.py did it. Nothing is guessed: a row is changed only when the
stored text is exactly the start of the raw text.
  python3 scripts/restore-full-bodies.py            dry run: counts and checks, writes nothing
  SUPABASE_ACCESS_TOKEN=... python3 scripts/restore-full-bodies.py --write
Run from careerapp2/. Reads ../career-simulator-data/postings/*.json and the database (anon key from .env.local).
"""
import os,sys,json,hashlib,re,urllib.request
RAW='/Users/ad/career-simulator-data/postings/'
REF='ukpmpyfcnbhngkgbnkxi'
CAP=20000
write='--write' in sys.argv
env=dict(l.strip().split('=',1) for l in open('.env.local') if '=' in l)
ANON=env['VITE_SUPABASE_ANON_KEY']; SB=f'https://{REF}.supabase.co'

def load(f): return json.load(open(RAW+f)) if os.path.exists(RAW+f) else []
pool=[dict(p,_src='ats_board') for p in load('nl_postings.json')]
pool+=[dict(p,_src='corporate_api') for p in load('nl_postings_corporate.json')]
pool+=[dict(p,_src='corporate_api') for p in load('nl_postings_student_wd.json')]
for f in ['nl_postings_linkedin.json','nl_postings_linkedin2.json']:
    for j in load(f):
        pool.append({'co':(j.get('companyName') or 'unknown').strip(),'ats':'linkedin','title':j.get('jobTitle') or '','loc':j.get('location') or '','text':j.get('jobDescription') or '','url':j.get('jobUrl'),'_src':'linkedin_apify'})
for f,src in [('nl_postings_ats2.json','open_feed'),('nl_postings_public.json','public_sector')]:
    for p in load(f): pool.append(dict(p,_src=src))

full={}; seen={}
for p in pool:
    co=(p.get('co') or 'Unknown').strip(); title=p.get('title') or ''
    i='p'+hashlib.sha1(((p.get('url') or '')+'|'+co+'|'+title+'|'+(p.get('loc') or '')).encode()).hexdigest()[:12]
    if i in seen: seen[i]+=1; i=i+'_'+str(seen[i])
    else: seen[i]=0
    full[i]=p.get('text') or ''
print(f'{len(full)} raw postings rebuilt')

rows=[]
for o in range(0,3000,500):
    r=urllib.request.Request(f'{SB}/rest/v1/postings?select=id,body&order=id',headers={'apikey':ANON,'Range':f'{o}-{o+499}'})
    rows+=json.load(urllib.request.urlopen(r))
print(f'{len(rows)} postings in the database')
todo=[]; stats={'no raw row':0,'not cut':0,'already full':0,'prefix mismatch':0,'to restore':0}
gain=0
for r in rows:
    body=r['body'] or ''
    f=full.get(r['id'])
    if f is None: stats['no raw row']+=1; continue
    if len(body)<3990: stats['not cut']+=1; continue
    if len(f)<=len(body): stats['already full']+=1; continue
    if not f.startswith(body): stats['prefix mismatch']+=1; continue
    todo.append((r['id'],f[:CAP])); stats['to restore']+=1; gain+=len(f[:CAP])-len(body)
print(stats, f'| {gain:,} characters of text come back')
if todo:
    lens=sorted(len(t) for _,t in todo)
    print(f'restored length: median {lens[len(lens)//2]}, p90 {lens[int(len(lens)*.9)]}, max {lens[-1]}')
if not write: print('dry run: nothing written'); sys.exit(0)
tok=os.environ['SUPABASE_ACCESS_TOKEN']
def q(sql):
    req=urllib.request.Request(f'https://api.supabase.com/v1/projects/{REF}/database/query',data=json.dumps({'query':sql}).encode(),headers={'Authorization':'Bearer '+tok,'Content-Type':'application/json','User-Agent':'odds'})
    return urllib.request.urlopen(req,timeout=120).status
q('create table if not exists public.postings_body_backup as select id, body, now() as saved_at from public.postings where false')
done=0
for i in range(0,len(todo),15):
    part=todo[i:i+15]
    sql=';\n'.join(f"insert into public.postings_body_backup(id, body) select id, body from public.postings where id='{pid}' and not exists (select 1 from public.postings_body_backup b where b.id='{pid}')" for pid,_ in part)
    sql+=';\n'+';\n'.join("update public.postings set body = $b$%s$b$ where id = '%s'"%(t.replace('$b$',''),pid) for pid,t in part)
    q(sql); done+=len(part)
    if done%150==0 or done==len(todo): print(f'  {done}/{len(todo)}')
print('written. The old texts are kept in public.postings_body_backup.')
