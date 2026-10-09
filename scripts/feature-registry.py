import os,re,json,glob
root='src/routes'
allsrc=""
for f in glob.glob('src/**/*.tsx',recursive=True)+glob.glob('src/**/*.ts',recursive=True):
    if 'routeTree.gen' in f: continue
    allsrc+=open(f,encoding='utf-8',errors='ignore').read()
rows=[]
for f in sorted(glob.glob(root+'/**/*.ts*',recursive=True)):
    f=f.replace('\\','/')
    s=open(f,encoding='utf-8',errors='ignore').read()
    m=re.search(r'createFileRoute\(\s*"([^"]+)"',s)
    if not m: continue
    path=m.group(1)
    if path.endswith('/') and path!='/': path=path[:-1]
    url=re.sub(r'/_[a-zA-Z]+','',path) or '/'
    is_api=url.startswith('/api')
    redirect=bool(re.search(r'throw redirect\(',s)) and len(s)<1800
    to=re.search(r'redirect\(\{\s*to:\s*"([^"]+)"',s)
    auth='/_authenticated' in path
    admin=url.startswith('/admin') or 'has_role' in s and 'admin' in s
    linked = (f'to="{url}"' in allsrc) or (f'"{url}"' in allsrc.replace(m.group(0),'')) or (f"'{url}'" in allsrc)
    tables=sorted(set(re.findall(r'\.from\("([a-z_0-9]+)"\)',s)))
    if is_api: status='API'; crit='CORE'
    elif redirect: status='REDIRECT'; crit='DEPRECATED'
    elif admin: status='LIVE'; crit='ADMIN ONLY'
    else: status='LIVE'; crit='CORE'
    top=url.split('/')[1] if len(url)>1 else 'play'
    if top in ('play','score','courses','tournaments','leagues','events','td') and not redirect and not admin: crit='PRODUCTION CRITICAL'
    rows.append(dict(feature_id=url.strip('/').replace('/','.').replace('$','') or 'root',route=url,file=f,auth_required=auth or url.startswith('/admin'),admin_only=admin,status=status,classification=crit,redirect_to=to.group(1) if to else None,linked_from_app=linked or is_api,direct_tables=tables))
json.dump(rows,open('docs/feature-registry.json','w',encoding='utf-8'),indent=1)
from collections import Counter
print(len(rows),Counter(r['classification'] for r in rows))
orph=[r['route'] for r in rows if not r['linked_from_app'] and r['status']=='LIVE' and '$' not in r['route']]
print('ORPHANS',len(orph),orph)
