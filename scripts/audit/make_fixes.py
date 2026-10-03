"""
Builds AUDIT_FIXES_2026-10-02.sql from the audit: every correction with its reason, each change first copied to postings_audit_log
(old value, new value, reason) so it can be put back. Prints the SQL path; apply it with apply_fixes.py.
  T=sbp_... python3 scripts/audit/make_fixes.py
"""
import json, os, sys
HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
from q import q

sets = json.load(open(os.path.join(HERE, "out", "fix_sets.json")))
A = json.load(open(os.path.join(HERE, "out", "years_audit.json")))
lit = lambda s: "'" + str(s).replace("'", "''") + "'"
sections = []

def section(title, col, reason, pairs, cast=""):
    """pairs: list of (id, new_value or None). Logs then updates only rows whose value actually changes."""
    if not pairs: return
    vals = ",".join(f"({lit(i)},{('null' if v is None else lit(v))})" for i, v in pairs)
    c = cast
    sections.append(f"""-- {title}: {len(pairs)} rows
with v(id, new_value) as (values {vals}),
chg as (select p.id, p.{col}::text old_value, v.new_value from public.postings p join v on v.id = p.id where p.{col}::text is distinct from v.new_value),
logged as (insert into public.postings_audit_log (id, col, old_value, new_value, reason) select id, '{col}', old_value, new_value, {lit(reason)} from chg returning id)
update public.postings p set {col} = (select new_value{c} from chg where chg.id = p.id) where p.id in (select id from chg);
""")

section("Dutch is required", "dutch_required", "Jev reads Dutch as required (stored score >= 0.8 or fresh reading >= 0.8; 10 of 10 sampled passages confirmed)", [(i, "true") for i in sets["dutch"]], "::boolean")
section("Master's is required, stated in the text", "degree_asked", "Text asks for a master's; Jev >= 0.9 sure; database had no degree", [(i, "master") for i in sets["master"]])
section("Job family filled", "family", "Family was empty; Jev >= 0.9 sure", sorted(sets["family"].items()))

# years: lower end of a range
rng = []
for rid, Y, rest in A["range_upper"]:
    lows = rest[0]
    lo = min(lows)
    rng.append((rid, None if lo == 0 else str(lo)))
section("Minimum years: lower end of a range was stored as the upper end", "years_min", "Text gives a range ('a-b years'); the minimum is the lower end", rng, "::integer")
ids_null = [x["id"] for x in q("""select id from public.postings where years_min > 0 and (
   (employer_display ilike 'Mploy%') or id in ('p5e083067053b','p658dfc1f0594')
   or title ~* '^(\\(?(msc/)?phd|doctoral|phd:)' or title ~* '^(assistant professor|tenure-track|tenure track|associate professor)'
   or (employer_display ilike 'Wageningen%' and title ilike 'Assistant Floormanager%') or (employer_display ilike 'CRH%' and title ilike '%Graduate Programme%')
   or (employer_display ilike 'Atlassian%' and title ilike 'Atlassian Solution Sales Executive%') or (employer_display ilike 'Erasmus%' and title ilike 'Optimising Cancer follow-up%'))""")]
section("Minimum years: not a requirement (0-N years talent programme, supervisor's years, contract or programme length, PhD or academic post)", "years_min", "The number in the text is a range top, a contract or programme length, or someone else's experience, not what the applicant needs", [(i, None) for i in ids_null if i not in dict(rng)], "::integer")

head = """-- Corrections from the data audit of 2 Oct 2026 (scripts/audit). Every change is copied to postings_audit_log first (old value, new value, reason).
-- To undo one column: update public.postings p set <col> = l.old_value::<type> from public.postings_audit_log l where l.id = p.id and l.col = '<col>' and l.at::date = date '2026-10-02';
create table if not exists public.postings_audit_log (id text not null, col text not null, old_value text, new_value text, reason text, at timestamptz not null default now());
alter table public.postings_audit_log enable row level security;
"""
sql = head + "\n".join(sections)
path = os.path.join(HERE, "..", "..", "AUDIT_FIXES_2026-10-02.sql")
open(path, "w").write(sql)
print(os.path.abspath(path), len(sql), "bytes;", len(sections), "sections")
