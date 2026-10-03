"""Applies AUDIT_FIXES_2026-10-02.sql in one transaction and prints how many rows each column changed. T=sbp_... python3 scripts/audit/apply_fixes.py"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from q import q
sql = open(os.path.join(os.path.dirname(__file__), "..", "..", "AUDIT_FIXES_2026-10-02.sql")).read()
before = q("select count(*) n from public.postings")[0]["n"]
q("begin;\n" + sql + "\ncommit;")
print("postings before/after:", before, q("select count(*) n from public.postings")[0]["n"])
for r in q("select col, count(*) n from public.postings_audit_log where at::date = current_date group by 1 order by 1"): print(" ", r["col"], r["n"], "changed")
