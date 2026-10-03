"""Builds src/lib/intern-pay.json: the internship allowances that employers state in their own postings.

Reads every internship posting from the live database (anon key, read only), finds the sentence where the
posting names an allowance or compensation and an amount, and keeps the amount as written. Nothing is guessed:
a posting that names no amount is left out. Run again after the postings change:

    python3 scripts/make_intern_pay.py
"""
import collections, datetime, json, os, re, statistics, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".env.local")) if "=" in l and not l.startswith("#"))
URL, KEY = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]


def get(q):
    req = urllib.request.Request(URL + "/rest/v1/postings?" + q, headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    return json.load(urllib.request.urlopen(req))


rows, off = [], 0
while True:
    page = get("select=id,employer,employer_display,title,body,seniority&order=id&limit=200&offset=%d" % off)
    rows += page
    if len(page) < 200:
        break
    off += 200

INTERN = re.compile(r"\b(intern|internship|stagiair\w*|stage|meewerkstage)\b", re.I)
KW = re.compile(r"(?:allowance|compensation|stipend|stagevergoeding|internship fee|vergoeding|remuneration)[^.\n;]{0,170}", re.I)
SKIP = re.compile(r"travel|reimburs|laptop|bonus|relocation|housing|per year|annual|fitness", re.I)


def to_int(s):
    s = s.replace(" ", "")
    return int(re.sub(r"[.,](?=\d{3}\b)", "", s).split(",")[0].split(".")[0])


def amounts(seg):
    out = set()
    cur = r"(?:€|EUR|euros?)"
    for m in re.finditer(cur + r"\s?(\d{1,2}[.,]?\d{3}|\d{3,4})(?:[.,]-)?\s?(?:-|–|to|and|tot)\s?" + cur + r"?\s?(\d{1,2}[.,]?\d{3}|\d{3,4})", seg, re.I):
        out |= {to_int(m.group(1)), to_int(m.group(2))}
    for m in re.finditer(r"(\d{3,4})\s?(?:-|–)\s?(\d{3,4})\s?" + cur, seg, re.I):
        out |= {int(m.group(1)), int(m.group(2))}
    for m in re.finditer(cur + r"\s?(\d{1,2}[.,]?\d{3}|\d{3,4})|(\d{3,4})(?:[.,]-)?\s?" + cur, seg, re.I):
        g = m.group(1) or m.group(2)
        out.add(to_int(g))
    return sorted(v for v in out if 150 <= v <= 2500)


postings, per_employer, display = {}, collections.defaultdict(list), {}
for r in rows:
    if not (INTERN.search(r["title"] or "") or r["seniority"] == "Internship"):
        continue
    body = (r["body"] or "").replace("\xa0", " ").replace("&amp;", "&")
    for m in KW.finditer(body):
        seg = m.group(0)
        if SKIP.search(seg) and not re.search(r"allowance of|compensation of|stagevergoeding|allowance:|allowance between", seg, re.I):
            continue
        n = amounts(seg)
        if n:
            postings[r["id"]] = [n[0], n[-1]]
            per_employer[r["employer"]].append((n[0], n[-1]))
            display[r["employer"]] = r["employer_display"]
            break

# One employer can sit under two keys ("Philips" twice), so group by the written name.
groups = collections.defaultdict(lambda: {"keys": set(), "ranges": []})
for e, v in per_employer.items():
    g = groups[re.sub(r"[^a-z0-9]+", " ", display[e].lower()).strip()]
    g["keys"].add(e)
    g["ranges"] += v
employers, mids = {}, []
for name, g in groups.items():
    low, high = min(a for a, _ in g["ranges"]), max(b for _, b in g["ranges"])
    # An employer whose own postings disagree widely (250 in one, 1,250 in another) gets no single range.
    steady = high <= low * 1.6
    for key in g["keys"]:
        employers[key] = {"name": display[key], "low": low if steady else None, "high": high if steady else None, "postings": len(g["ranges"])}
    mids.append((low + high) / 2)
q = statistics.quantiles(mids, n=4)
market = {"employers": len(groups), "postings": len(postings), "low": min(a for g in groups.values() for a, _ in g["ranges"]), "p25": round(q[0]), "median": round(statistics.median(mids)), "p75": round(q[2]), "high": max(b for g in groups.values() for _, b in g["ranges"])}
out = {"generated": datetime.date.today().isoformat(), "market": market, "employers": employers, "postings": postings}
json.dump(out, open(os.path.join(ROOT, "src/lib/intern-pay.json"), "w"), indent=1, sort_keys=True)
print(len(postings), "postings name an amount;", len(groups), "employers;", market)
