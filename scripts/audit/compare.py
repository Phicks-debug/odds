"""
Compares Jev's fresh reading with the stored values, field by field: how often they agree, what the disagreements look like,
and the individual postings where both Jev is confident and the two differ by a lot. Run jev_reread.py first.
  python3 scripts/audit/compare.py
"""
import collections, json, os
D = json.load(open(os.path.join(os.path.dirname(__file__), "out", "jev_reread.json")))
rows, jev = {r["id"]: r for r in D["rows"]}, D["jev"]
ok = {i: a for i, a in jev.items() if "error" not in a}
print(f"{len(rows)} postings, {len(ok)} read by Jev, {len(jev) - len(ok)} failed\n")

def ch(a, k): return a[k]["choice"], a[k].get("confidence") or 0
def noul(a, k): return a[k]["noul"]

def years_bucket(y):
    if y is None: return "none"
    return "none" if y <= 0 else str(y) if y <= 5 else "6to7" if y <= 7 else "8plus"
ORDER_Y = ["none", "1", "2", "3", "4", "5", "6to7", "8plus"]
ORDER_L = ["internship", "entry", "mid", "senior", "manager", "director"]
ORDER_D = ["none", "bachelor", "master", "phd"]
WORK = {"onsite": "onsite", "hybrid": "hybrid", "remote": "remote", None: "notstated"}

fields = {
    "level": (lambda r: r["level_jev"], lambda a: ch(a, "level")),
    "degree": (lambda r: r["degree_asked"] or "none", lambda a: ch(a, "degree")),
    "years": (lambda r: years_bucket(r["years_min"]), lambda a: ch(a, "years")),
    "family": (lambda r: r["family"] or "Other", lambda a: ch(a, "family")),
    "workplace": (lambda r: WORK.get(r["workplace"], r["workplace"]), lambda a: ch(a, "workplace")),
    "job type": (lambda r: r["job_type"] or "fulltime", lambda a: ch(a, "jobtype")),
}
disagree = {}
for name, (mine, theirs) in fields.items():
    agree, conf = 0, collections.Counter()
    pairs, strong = [], []
    for i, a in ok.items():
        s, (j, c) = mine(rows[i]), theirs(a)
        if s == j: agree += 1
        else:
            conf[(s, j)] += 1; pairs.append(i)
            if c >= 0.9: strong.append((i, s, j, c))
    n = len(ok)
    print(f"{name:10s} agree {agree}/{n} = {100 * agree / n:.1f}%   disagree with Jev >=0.9 sure: {len(strong)}")
    print("           most common (stored -> Jev): " + "; ".join(f"{a}->{b} x{n_}" for (a, b), n_ in conf.most_common(5)))
    disagree[name] = strong
# one step vs far for ordered scales
def far(order, a, b): return abs(order.index(a) - order.index(b)) if a in order and b in order else None
for name, order, f in [("level", ORDER_L, "level"), ("degree", ORDER_D, "degree"), ("years", ORDER_Y, "years")]:
    d = collections.Counter()
    for i, a in ok.items():
        s, (j, _) = fields[name][0](rows[i]), fields[name][1](a)
        k = far(order, s, j)
        if k is not None and k > 0: d[min(k, 3)] += 1
    print(f"   {name}: off by one step {d[1]}, two steps {d[2]}, three or more {d[3]}")

# Dutch, the real one the app uses: the column or Jev's stored score >= 0.8
dutch_stored = lambda r: bool(r["dutch_required"])
dutch_app = lambda r: bool(r["dutch_required"]) or (r["dutch_jev"] or 0) >= 0.8
for label, fn in [("dutch_required column", dutch_stored), ("what the app uses (column or stored Jev>=0.8)", dutch_app)]:
    a_ = sum(1 for i, a in ok.items() if fn(rows[i]) == (noul(a, "dutch") >= 0.5))
    fp = [i for i, a in ok.items() if fn(rows[i]) and noul(a, "dutch") < 0.2]
    fn_ = [i for i, a in ok.items() if (not fn(rows[i])) and noul(a, "dutch") >= 0.8]
    print(f"dutch      {label}: agree {a_}/{len(ok)} = {100 * a_ / len(ok):.1f}%   says required but Jev<0.2: {len(fp)}   says not required but Jev>=0.8: {len(fn_)}")
    disagree["dutch " + label] = [(i, fn(rows[i]), noul(ok[i], "dutch"), 0) for i in (fp + fn_)]

# Country and real job
other = [i for i, a in ok.items() if ch(a, "country")[0] == "other" and ch(a, "country")[1] >= 0.8]
print(f"country    Jev is >=0.8 sure the work is outside the Netherlands: {len(other)}")
notreal = [i for i, a in ok.items() if noul(a, "real") < 0.3]
mismatch = [i for i in notreal if (rows[i]["usable"] or 0) >= 0.5]
print(f"real job   Jev says not a real job (<0.3): {len(notreal)}; of those the database still treats as usable: {len(mismatch)}")
reals = [i for i, a in ok.items() if noul(a, "real") >= 0.7 and (rows[i]["usable"] or 1) < 0.5]
print(f"           database hides as not real (usable<0.5) but Jev says real (>=0.7): {len(reals)}")

# Show the worst cases to read
def show(title, items, k=8):
    print(f"\n-- {title} ({len(items)})")
    for it in items[:k]:
        i = it[0]; r = rows[i]
        print(f"   {r['ats']:11s} {r['title'][:58]:58s} | {r['employer_display'][:20]:20s} | {it[1:]}")
for name in ["level", "degree", "years", "family"]:
    show(f"{name}: stored vs Jev, Jev >=0.9 sure", sorted(disagree[name], key=lambda t: -t[3]))
show("outside the Netherlands per Jev", [(i, ch(ok[i], "country")[0], rows[i]["region"][:30]) for i in other], 10)
show("not a real job per Jev but still usable", [(i, round(noul(ok[i], "real"), 2), rows[i]["usable"]) for i in mismatch], 10)
