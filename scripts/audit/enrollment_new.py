"""Reads the student requirement for postings that have none yet (enrollment empty), the way enrollment.py did for all of them.
Kept only for internship-type postings with Jev >= 0.85 sure (graduate programmes were mis-read, so they stay open); everything else is 'open'.
  T=sbp_... JEVKEY=... python3 scripts/audit/enrollment_new.py     (run after level_jev is filled)
"""
import json, os, queue, sys, threading, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from q import q
KEY = os.environ["JEVKEY"]
rows = q("select id, title, employer_display, level_jev, left(body, 7000) body from postings where enrollment is null and closed_at is null order by id")
Q = {"enrollment": {"type": "choice", "instructions": "Must the applicant be a current student (enrolled at a university or college) to apply?", "criteria": {
    "required": "Yes: the applicant must be enrolled or studying now. For example 'enrolled', 'currently studying', 'student status', 'you are a student', 'internship agreement with your school or university', 'pursuing a bachelor or master'.",
    "recent": "Current students and recent graduates are both accepted, for example 'student or graduated in the last 12 months'",
    "open": "No: being a student is not needed. Graduates and working people can apply, or the posting says nothing about studying"}}}
def ask(r):
    body = {"state": f"Job title: {r['title']}\nEmployer: {r['employer_display']}\nPosting:\n{r['body'] or ''}", "model": "jev-latest", "questions": Q}
    for i in range(5):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request("https://api.typesafe.ai/v1/systemone", data=json.dumps(body).encode(), headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"}), timeout=90))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504): time.sleep(2 ** i); continue
            return {"error": e.code}
        except Exception: time.sleep(2 ** i)
    return {"error": "failed"}
out, qq, lock, tokens = {}, queue.Queue(), threading.Lock(), [0]
for r in rows: qq.put(r)
def w():
    while True:
        try: r = qq.get_nowait()
        except queue.Empty: return
        a = ask(r)
        with lock:
            out[r["id"]] = a
            tokens[0] += (a.get("usage") or {}).get("input_tokens", 0)
ts = [threading.Thread(target=w) for _ in range(6)]; [t.start() for t in ts]; [t.join() for t in ts]
sets = {"required": [], "recent": [], "open": []}
errors = 0
for r in rows:
    a = out.get(r["id"], {})
    c = (a.get("answers") or {}).get("enrollment")
    if not c: errors += 1; continue
    internship = r["level_jev"] == "internship"
    v = c.get("choice") if internship and c.get("confidence", 0) >= 0.85 and c.get("choice") in ("required", "recent") else "open"
    sets[v].append(r["id"])
for v, ids in sets.items():
    if ids: q("update postings set enrollment = '%s' where id in (%s)" % (v, ", ".join("'" + i + "'" for i in ids)))
print({k: len(v) for k, v in sets.items()}, "errors", errors, "input tokens", tokens[0], "~$%.3f" % (tokens[0] * 42 / 1e9))
