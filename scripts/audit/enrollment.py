"""
Which postings require the applicant to be a current student? Jev reads every posting for it and the answer is compared with a plain text search.
  T=sbp_... JEVKEY=... python3 scripts/audit/enrollment.py   ->  scripts/audit/out/enrollment.json
"""
import json, os, queue, re, sys, threading, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from q import q
KEY = os.environ["JEVKEY"]
rows = q("select id, ats, title, employer_display, level_jev, closed_at is not null closed, left(body, 7000) body from postings order by id")
Q = {"enrollment": {"type": "choice", "instructions": "Must the applicant be a current student (enrolled at a university or college) to apply?", "criteria": {
    "required": "Yes: the applicant must be enrolled or studying now. For example 'enrolled', 'currently studying', 'student status', 'you are a student', 'internship agreement with your school or university', 'mandatory internship for your studies', 'graduation project or thesis', 'final-year student'",
    "recent": "Current students and recent graduates are both accepted, for example 'student or graduated in the last 12 months'",
    "open": "No: being a student is not needed. Graduates and working people can apply, or the posting says nothing about studying"}}}
def ask(r):
    body = {"state": f"Job title: {r['title']}\nEmployer: {r['employer_display']}\nPosting:\n{r['body'] or ''}", "model": "jev-latest", "questions": Q}
    for i in range(5):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request("https://api.typesafe.ai/v1/systemone", data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"}), timeout=120))["answers"]["enrollment"]
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504): time.sleep(2 ** i); continue
            return {"choice": "error"}
        except Exception: time.sleep(2 ** i)
    return {"choice": "error"}
out, qq, lock = {}, queue.Queue(), threading.Lock()
for r in rows: qq.put(r)
def w():
    while True:
        try: r = qq.get_nowait()
        except queue.Empty: return
        a = ask(r)
        with lock: out[r["id"]] = a
ts = [threading.Thread(target=w) for _ in range(6)]; [t.start() for t in ts]; [t.join() for t in ts]
STUDENT = re.compile(r"(currently|actively)?\s*(enrolled|studying|pursuing)|student status|you are a student|final[- ]year|internship agreement|stageovereenkomst|stage[- ]?overeenkomst|school or university|mandatory internship|obligatory|thesis|graduation (project|internship|assignment)|afstudeer|studying at|studeer|ingeschreven|student at", re.I)
json.dump({"rows": [{k: v for k, v in r.items() if k != "body"} | {"regex": bool(STUDENT.search(r["body"] or "") or STUDENT.search(r["title"]))} for r in rows], "jev": out}, open(os.path.join(os.path.dirname(__file__), "out", "enrollment.json"), "w"))
print("done", len(out))
