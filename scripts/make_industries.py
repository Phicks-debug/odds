"""Builds src/lib/industries.json: employer (as stored in the database) -> standard industry.
Source: LinkedIn's own industry field on each LinkedIn posting (primary listed industry, most common per employer);
the 44 employer-board companies are classified by hand below. Regenerate with: python3 scripts/make_industries.py"""
import json, re, collections, urllib.request, html, os
D='/Users/ad/career-simulator-data/postings/'
ENV=open('/Users/ad/careerapp2/.env.local').read()
URL=re.search(r'VITE_SUPABASE_URL=(\S+)',ENV).group(1); KEY=re.search(r'VITE_SUPABASE_(?:ANON|PUBLISHABLE)\w*=(\S+)',ENV).group(1)

RULES=[  # first match wins; order matters
 ('Banking',r'^(banking|investment banking|capital markets)'),
 ('Insurance',r'^(insurance|pension)'),
 ('Accounting',r'^accounting'),
 ('Financial services',r'^(financial|investment management|venture capital|funds and trusts|holding companies|securities)'),
 ('Legal',r'^(legal|law practice)'),
 ('Staffing & recruiting',r'^(staffing|human resources)'),
 ('Consulting',r'^(business consulting|professional services|operations consulting|strategic management|administrative and support|facilities services|security and investigations|research services|international trade|environmental services|events services|printing|professional training|repair and maintenance)'),
 ('Software & internet',r'^(software|technology, information and internet|desktop computing|internet marketplace|artificial intelligence|computer and network security|data infrastructure|online audio|information services|information technology|technology, information and media|e-learning)'),
 ('IT services',r'^(it services|it system)'),
 ('Telecommunications',r'^telecom'),
 ('Semiconductors',r'^(semiconductor|appliances|electrical equipment|robotics)'),
 ('Health & life sciences',r'^(pharma|biotech|medical|hospitals|health|wellness|farming, ranching)'),
 ('Energy & utilities',r'^(oil|energy|utilities|services for renewable|renewables|mining)'),
 ('Construction',r'^(construction|civil engineering|building construction|engineering services|mechanical or industrial|architecture)'),
 ('Transport & logistics',r'^(transport|truck|freight|airlines|maritime|aviation and aerospace|logistics)'),
 ('Manufacturing',r'^(motor vehicle|industrial machinery|machinery|automation machinery|manufacturing|chemical|plastics|packaging|paper|furniture|defense|aviation and aerospace component|shipbuilding|automotive)'),
 ('Food & consumer goods',r'^(food and beverage manufacturing|dairy|animal feed|cosmetics|personal care|consumer goods|retail apparel)'),
 ('Retail & e-commerce',r'^(retail|wholesale)'),
 ('Hospitality & travel',r'^(hospitality|food and beverage services|travel|recreational|gambling|hotels|restaurants|consumer services)'),
 ('Media & marketing',r'^(advertising|marketing|broadcast|newspaper|book and periodical|museums)'),
 ('Education',r'^(higher education|education)'),
 ('Government & non-profit',r'^(government|non-profit|public|international affairs|community)'),
 ('Real estate',r'^real estate'),
]
def sector(s):
    s=html.unescape(s or '').strip()
    s=re.sub(r'Transportation, Logistics, Supply Chain and Storage','Transportation Logistics',s)
    s=re.sub(r'Technology, Information and (Internet|Media)',r'Technology Information and \1',s)
    s=s.replace('Transportation/Trucking/Railroad','Transportation')
    first=s.split(',')[0].strip().lower()
    first=first.replace('technology information and internet','technology, information and internet').replace('technology information and media','technology, information and media')
    for name,rx in RULES:
        if re.match(rx,first): return name
    return None

HAND={'neema - better than a bank':'Financial services','blue skies group':'Food & consumer goods','sprint intermediair':'Staffing & recruiting','kryne opvolging':'Consulting','kws group':'Food & consumer goods', # employer-board companies, by what the company mainly does
 'accenture':'Consulting','adyen':'Financial services','asml':'Semiconductors','axelera':'Semiconductors',
 'bolcom':'Retail & e-commerce','bynder':'Software & internet','catawiki':'Retail & e-commerce','cisco':'Software & internet','crisp':'Software & internet',
 'damen':'Manufacturing','databricks':'Software & internet','dept':'Media & marketing','elastic':'Software & internet',
 'ey':'Accounting','flowtraders':'Financial services','fugro':'Energy & utilities','heijmans':'Construction','hellofresh':'Food & consumer goods',
 'imc':'Financial services','ing':'Banking','medtronic':'Health & life sciences','miro':'Software & internet','mollie':'Financial services','netflix':'Media & marketing',
 'nike':'Food & consumer goods','nngroup':'Consulting','nutreco':'Food & consumer goods','nxp':'Semiconductors',
 'philips':'Health & life sciences','prosus':'Software & internet','pwc':'Accounting','quantware':'Semiconductors','rabobank':'Banking','relx':'Media & marketing',
 'robeco':'Financial services','salesforce':'Software & internet','shell':'Energy & utilities','signify':'Semiconductors','thermofisher':'Health & life sciences',
 'unilever':'Food & consumer goods','vopak':'Energy & utilities','weaviate':'Software & internet','wolterskluwer':'Media & marketing','workday':'Software & internet'}

# employer -> rows in the database
rows=[];off=0
while True:
    req=urllib.request.Request(f'{URL}/rest/v1/postings?select=employer,source,title&limit=1000&offset={off}',headers={'apikey':KEY,'Authorization':'Bearer '+KEY})
    part=json.load(urllib.request.urlopen(req)); rows+=part; off+=1000
    if len(part)<1000: break
L=json.load(open(D+'nl_postings_linkedin.json'))
by=collections.defaultdict(collections.Counter)
for p in L:
    s=sector(p.get('industry'))
    if s: by[(p.get('companyName') or '').strip()][s]+=1
out={};missing=collections.Counter()
for r in rows:
    e=r['employer']
    if e in out: continue
    key=e
    if key in by: out[e]=by[key].most_common(1)[0][0]
    elif key.lower() in HAND: out[e]=HAND[key.lower()]
    elif key.lower().replace(' ','') in HAND: out[e]=HAND[key.lower().replace(' ','')]
    else: missing[e]+=1
print('employers',len({r['employer'] for r in rows}),'mapped',len(out),'unmapped',len(missing)); print(list(missing)[:60])
json.dump(out,open('/Users/ad/careerapp2/src/lib/industries.json','w'),indent=0,ensure_ascii=False,sort_keys=True)
print(collections.Counter(out[r['employer']] for r in rows if r['employer'] in out).most_common())
