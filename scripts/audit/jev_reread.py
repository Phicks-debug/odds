"""
Has Jev read every posting again, with fresh closed questions, and saves its answers next to what the database holds.
  T=sbp_... JEVKEY=... python3 scripts/audit/jev_reread.py [limit]  ->  scripts/audit/out/jev_reread.json
Read-only on the database. The comparison is in compare.py. Jev is a second reader, not the truth: a disagreement is a
reason to look, and the cases that matter are read by a person.
"""
import json, os, queue, sys, threading, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from q import q

KEY = os.environ["JEVKEY"]
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 100000
OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

rows = q(f"""select id, ats, title, employer_display, region, left(body, 6000) body, level_jev, degree_asked, years_min, dutch_required, dutch_jev,
  family, workplace, job_type, usable, closed_at is not null closed from postings order by md5(id) limit {LIMIT}""")
print(len(rows), "postings", flush=True)

LEV = {"internship": "An internship, thesis project, or student position for a current student",
       "entry": "An entry-level job or graduate programme for someone with little or no work experience (0 to 2 years)",
       "mid": "A mid-level job asking for roughly 3 to 6 years", "senior": "A senior or expert individual-contributor job asking for roughly 6 or more years",
       "manager": "A job managing people, a team or a function", "director": "A director, head of, VP or executive job",
       "academic": "An academic job such as a PhD position, postdoc or research fellowship"}
DEG = {"none": "No degree is required or none is mentioned", "bachelor": "A bachelor's degree is the lowest accepted (includes 'bachelor's or master's')",
       "master": "A master's is required and a bachelor's is not enough", "phd": "A PhD or doctorate is required"}
YRS = {"none": "No minimum years of experience are stated", "1": "At least 1 year", "2": "At least 2 years", "3": "At least 3 years", "4": "At least 4 years",
       "5": "At least 5 years", "6to7": "At least 6 or 7 years", "8plus": "At least 8 years"}
CTRY = {"netherlands": "The work is located in the Netherlands", "other": "The work is located outside the Netherlands", "unclear": "The country cannot be told"}
WORK = {"onsite": "Mostly at the employer's site", "hybrid": "A mix of office and home", "remote": "Mostly remote", "notstated": "The posting does not say"}
JT = {"fulltime": "A full-time job", "parttime": "A part-time job", "internship": "An internship or student placement", "contract": "A temporary or contract job"}
FAM = ["Finance & accounting", "Data, analytics & AI", "Software engineering", "Research & academia", "Sales & account management", "Risk, compliance & legal",
       "Consulting & strategy", "Product & project management", "IT, cloud & security", "Operations & supply chain", "Marketing & communications",
       "Hardware & engineering", "HR & recruiting", "Healthcare & life sciences", "Customer support & service", "Design & UX", "Other"]
QS = {
    "level": {"type": "choice", "instructions": "What kind of job is this, going by what the posting asks of the applicant?", "criteria": LEV},
    "degree": {"type": "choice", "instructions": "What is the lowest degree level the posting accepts from an applicant?", "criteria": DEG},
    "years": {"type": "choice", "instructions": "What minimum years of work experience does the posting ask for?", "criteria": YRS},
    "dutch": {"type": "noul", "instructions": "Does the posting require the applicant to speak or write Dutch?", "criteria": {"true": "Dutch is required, or the posting says Dutch speaking, fluent Dutch or native Dutch", "false": "Dutch is not required, or only a plus"}},
    "country": {"type": "choice", "instructions": "In which country is the work located?", "criteria": CTRY},
    "real": {"type": "noul", "instructions": "Is this a real job with duties or requirements, not an advert, a list of links or a few words?", "criteria": {"true": "A real job", "false": "Not a real job"}},
    "family": {"type": "choice", "instructions": "Which line of work is this job in?", "criteria": {f: f for f in FAM}},
    "workplace": {"type": "choice", "instructions": "Where is the work done?", "criteria": WORK},
    "jobtype": {"type": "choice", "instructions": "What kind of employment is this?", "criteria": JT},
}

def ask(r):
    body = {"state": f"Job title: {r['title']}\nEmployer: {r['employer_display']}\nPlace: {r['region']}\nPosting:\n{r['body'] or ''}", "model": "jev-latest", "questions": QS}
    for i in range(5):
        try:
            req = urllib.request.Request("https://api.typesafe.ai/v1/systemone", data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
            return json.load(urllib.request.urlopen(req, timeout=120))["answers"]
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** i); continue
            return {"error": e.code}
        except Exception:
            time.sleep(2 ** i)
    return {"error": "failed"}

out, Q, lock = {}, queue.Queue(), threading.Lock()
for r in rows: Q.put(r)

def worker():
    while True:
        try: r = Q.get_nowait()
        except queue.Empty: return
        a = ask(r)
        with lock:
            out[r["id"]] = a
            if len(out) % 200 == 0: print(len(out), "done", flush=True)

ts = [threading.Thread(target=worker) for _ in range(6)]
[t.start() for t in ts]; [t.join() for t in ts]
json.dump({"rows": [{k: v for k, v in r.items() if k != "body"} for r in rows], "jev": out}, open(os.path.join(OUT, "jev_reread.json"), "w"))
print("done", len(out), "errors", sum(1 for v in out.values() if "error" in v), flush=True)
