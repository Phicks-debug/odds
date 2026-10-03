"""
Checks every stored years_min against the posting text. A stored minimum is "supported" when the text asks for that many years of
experience (a single figure, or the LOWER end of a range). Unsupported ones are sorted by cause: the upper end of a range was kept,
a contract or programme length was read as experience, or nothing in the text asks for it. Read-only.
  T=sbp_... python3 scripts/audit/years_audit.py
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from q import q

rows = q("select id, title, employer_display, family, level_jev, years_min, left(body, 14000) body from postings where years_min is not null")
NUM = r"(\d{1,2})"
SEP = r"\s*(?:-|–|—|to|and|or)\s*"
UNIT = r"\s*\+?\s*(?:years?|yrs?|jaar|jaren)"
RANGE = re.compile(NUM + r"\s*\+?" + SEP + NUM + r"\s*\+?" + UNIT, re.I)
SINGLE = re.compile(r"(?<![\d–-])" + NUM + r"\s*\+?" + UNIT + r"(?!\s*(?:-|–|to)\s*\d)", re.I)
EXPCTX = re.compile(r"experience|ervaring|background|track record|practice|working|professional|relevant|hands-on|in a similar|in the field|as a ", re.I)
DURATION = re.compile(r"(contract|position|programme|program|appointment|term|duration|tenure|vest|ending|period|phd|funded|starting|for|over)\b", re.I)
SUP = re.compile(r"over\s+\d+\s+years[’']?\s+experience\s+in\s+forensic|heritage|for\s+\d+\s+years\s+we\s+have|we have been|since\s+\d{4}|\d+\+?\s+years\s+of\s+(?:expertise|history|heritage)", re.I)

def ctx(body, m, w=70): return body[max(0, m.start() - w): m.end() + w]

res = {"supported": [], "range_upper": [], "duration": [], "unsupported": []}
for r in rows:
    body, Y = r["body"] or "", r["years_min"]
    lows, ups, singles = set(), set(), []
    for m in RANGE.finditer(body):
        a, b = int(m.group(1)), int(m.group(2))
        if a <= b <= 40 and EXPCTX.search(ctx(body, m)): lows.add(a); ups.add(b)
    for m in SINGLE.finditer(body):
        n = int(m.group(1))
        c = ctx(body, m)
        if EXPCTX.search(c) and not SUP.search(c): singles.append((n, c))
    supported_vals = lows | {n for n, _ in singles}
    if Y in supported_vals: res["supported"].append(r["id"]); continue
    if Y in ups and lows: res["range_upper"].append((r, sorted(lows), sorted(ups))); continue
    dur = [c for n, c in [(int(m.group(1)), ctx(body, m)) for m in SINGLE.finditer(body)] if n == Y and DURATION.search(c) and not re.search(r"experience|ervaring", c, re.I)]
    if dur: res["duration"].append((r, dur[0])); continue
    res["unsupported"].append((r, sorted(supported_vals)))
print({k: len(v) for k, v in res.items()}, "of", len(rows), "postings with a stored minimum\n")
def show(k, n=12):
    print(f"== {k}")
    for it in res[k][:n]:
        r = it[0] if isinstance(it, tuple) else None
        print("  ", Y := r["years_min"], r["title"][:48], "|", r["employer_display"][:16], "|", str(it[1:])[:150].replace("\n", " "))
show("range_upper", 20); show("duration", 14); show("unsupported", 24)
json.dump({k: [(x[0]["id"], x[0]["years_min"], x[1:]) if isinstance(x, tuple) else x for x in v] for k, v in res.items()}, open(os.path.join(os.path.dirname(__file__), "out", "years_audit.json"), "w"), default=str)
