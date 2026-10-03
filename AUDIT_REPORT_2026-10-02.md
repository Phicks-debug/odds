# Data audit, 2 Oct 2026

Scripts: `scripts/audit/` (read-only except `apply_fixes.py`). Every correction is in `postings_audit_log` (old value, new value, reason) and can be put back.

## What was checked
1. Schema: 35 tables, column types, row counts, row-level security.
2. Rules on all 2,095 postings: blanks, ranges, enums, dates, consistency between columns, links.
3. Jev as a second reader: every posting re-read with fresh closed questions (level, degree, years, Dutch, country, real job, family, workplace, job type), compared with the stored value (`jev_reread.py`, `compare.py`). Disagreements that mattered were read by a person (`adjudicate.py`).

## Corrected (311 + 167 rows)
| Column | Rows | Why |
|---|---|---|
| dutch_required to true | 212 | Text asks for Dutch ("fluency in Dutch and English"); 10 of 10 sampled confirmed. The gate let international students through. |
| years_min | 32 | Range top stored as the minimum (11), "0-3 years" talent programmes (7), PhD / professor / fixed-term lengths (12), a supervisor's 12 years (2). Each wrongly blocked students. |
| family filled | 46 | Was empty, Jev >= 0.9 sure |
| degree_asked to master | 21 | Text states a master's, database had none |
| url | 167 | Link missing; recovered from the employer's own Greenhouse / Ashby board by exact title, unique match |

## Not changed, on purpose
- level: 83% agreement. The differences are mostly "1 to 3 years" jobs (entry or mid): a product decision, not an error.
- workplace (1,280 empty): Jev guesses from benefit text. "Not stated" is the honest value.
- job type: Jev says "contract" for fixed-term academic posts. True but not useful; the filter is hidden.
- degree "bachelor" vs none (132 + 44): ambiguous wording, left.
- 75 postings carry a minimum number of years that the text does not state (inferred from "Senior"). The gate says "N+ asked" when the posting does not. Decide whether to keep the inference.

## Still open
- 72 postings have no link (49 share a title with another posting on the same board; 23 are no longer on the board and are probably closed).
- 835 open postings have never been checked for being closed.
- 130 postings have no family.
- `LOCK_BACKUP_TABLES.sql`: the three `postings_*_backup` tables are open to the public key. Run it.
- 1 posting dated 2018 (Magnet.me internship), 29 titles with stray spaces, 46 employer+title+region repeats (the app merges them).

## Added after the audit: "must be a student"
Insight from the owner: some jobs require being a current university student. Jev read every posting for it (`scripts/audit/enrollment.py`):
75% of internships (341 of 452) need a current student, 44 more accept students or recent graduates, only 67 internships are open to graduates.
Kept only for internship-type postings with Jev >= 0.85 sure (full-time graduate programmes were mis-read, so they are left open):
`postings.enrollment` = required 330, recent 43, open 1,722. 316 of the 637 jobs in the default "Internship & entry" view need a student.
App: sign-up asks "Are you studying now?" (`profile.studying`, else read from the education dates; no dates = unknown, never a no). New gate "Student":
a student passes, a graduate fails ("recent" jobs also pass within 12 months of graduating), someone who has not said is not blocked.
SQL: `AUDIT_ENROLLMENT_2026-10-02.sql`.
