"""
Finds the link for postings that have none, from the employer's own public job board (Greenhouse or Ashby), matching on employer and exact
title and accepting only a single unambiguous match. Prints what it would set; writes scripts/audit/out/url_fill.json.
  T=sbp_... python3 scripts/audit/fill_urls.py
"""
import collections, json, os, re, sys, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from q import q
norm = lambda s: re.sub(r"[^a-z0-9]+", " ", (s or "").lower().replace("&amp;", "&")).strip()
get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "odds-audit"}), timeout=40))
miss = q("select id, employer, ats, title, region from postings where url is null")
boards = collections.defaultdict(list)
for r in miss: boards[(r["ats"], r["employer"])].append(r)
fill, ambiguous, unmatched, failed = {}, [], [], []
for (ats, emp), rs in sorted(boards.items()):
    try:
        if ats == "greenhouse":
            jobs = [(j["title"], j["absolute_url"]) for j in get(f"https://boards-api.greenhouse.io/v1/boards/{emp}/jobs")["jobs"]]
        else:
            jobs = [(j["title"], j.get("jobUrl") or j.get("applyUrl")) for j in get(f"https://api.ashbyhq.com/posting-api/job-board/{emp}")["jobs"]]
    except Exception as e:
        failed.append((ats, emp, str(e)[:60], len(rs))); continue
    by = collections.defaultdict(set)
    for t, u in jobs:
        if u: by[norm(t)].add(u)
    for r in rs:
        urls = by.get(norm(r["title"]), set())
        if len(urls) == 1: fill[r["id"]] = next(iter(urls))
        elif len(urls) > 1: ambiguous.append(r)
        else: unmatched.append(r)
print(f"missing {len(miss)} | filled by a unique match {len(fill)} | several matches {len(ambiguous)} | no longer on the board {len(unmatched)} | boards that failed {failed}")
for i, u in list(fill.items())[:5]: print("  ", i, u)
print("  no longer listed (probably closed):", [(r["employer"], r["title"][:34]) for r in unmatched[:6]])
json.dump(fill, open(os.path.join(os.path.dirname(__file__), "out", "url_fill.json"), "w"))
