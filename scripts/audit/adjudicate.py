"""Prints the passage of the posting that decides a field, for the postings where Jev and the database differ, so a person can say which is right.
  T=sbp_... python3 scripts/audit/adjudicate.py dutch|degree_master|degree_phd|years|workplace|level_mid_entry|jobtype [n]"""
import json, os, random, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from q import q
D = json.load(open(os.path.join(os.path.dirname(__file__), "out", "jev_reread.json")))
rows, jev = {r["id"]: r for r in D["rows"]}, D["jev"]
kind, n = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 8
ch = lambda a, k: a[k]["choice"]
pick = {
  "dutch": lambda r, a: not (r["dutch_required"] or (r["dutch_jev"] or 0) >= 0.8) and a["dutch"]["noul"] >= 0.8,
  "degree_master": lambda r, a: (r["degree_asked"] or "none") == "none" and ch(a, "degree") == "master",
  "degree_phd": lambda r, a: (r["degree_asked"] or "none") == "none" and ch(a, "degree") == "phd",
  "degree_none": lambda r, a: r["degree_asked"] == "bachelor" and ch(a, "degree") == "none",
  "years": lambda r, a: r["years_min"] is None and ch(a, "years") in ("5", "6to7", "8plus"),
  "workplace": lambda r, a: r["workplace"] is None and ch(a, "workplace") in ("onsite", "hybrid", "remote"),
  "level_mid_entry": lambda r, a: r["level_jev"] in ("mid", "senior") and ch(a, "level") in ("entry", "internship"),
  "jobtype": lambda r, a: (r["job_type"] or "fulltime") == "fulltime" and ch(a, "jobtype") == "contract",
}[kind]
KEY = {"dutch": r"dutch|nederlands|netherlands-speaking", "degree_master": r"master|msc|m\.sc|degree|graduate|bachelor", "degree_phd": r"phd|doctor",
       "degree_none": r"degree|bachelor|msc|master|diploma", "years": r"\d+\s*(\+|plus)?\s*(years|jaar|yrs)", "workplace": r"remote|hybrid|on-?site|office|work from home|home office|wfh|at our",
       "level_mid_entry": r"years|experience|junior|entry|graduate|senior", "jobtype": r"temporary|fixed[- ]term|contract|permanent|tijdelijk|vast|duration|months"}[kind]
ids = [i for i, a in jev.items() if pick(rows[i], a)]
random.Random(7).shuffle(ids)
print(f"{kind}: {len(ids)} postings differ; showing {min(n, len(ids))}\n")
for i in ids[:n]:
    r = rows[i]
    body = q(f"select left(body, 9000) b from postings where id='{i}'")[0]["b"] or ""
    hits = [m for m in re.finditer(KEY, body, re.I)][:3]
    snip = " … ".join(re.sub(r"\s+", " ", body[max(0, m.start() - 90): m.end() + 110]) for m in hits) or "(no keyword in the text)"
    stored = {"dutch": r["dutch_required"], "degree_master": r["degree_asked"], "degree_phd": r["degree_asked"], "degree_none": r["degree_asked"], "years": r["years_min"], "workplace": r["workplace"], "level_mid_entry": r["level_jev"], "jobtype": r["job_type"]}[kind]
    print(f"* {r['title'][:70]} | {r['employer_display'][:22]}  [stored={stored}]  Jev: {json.dumps({k: (v.get('choice') or round(v.get('noul', 0), 2)) for k, v in jev[i].items() if k in ('dutch','degree','years','workplace','level','jobtype')})}")
    print("   ", snip[:520], "\n")
