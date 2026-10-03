"""Runs read-only SQL against the odds database through the Supabase Management API. Token from the environment: T=sbp_... (never saved here)."""
import json, os, urllib.request

def q(sql):
    r = urllib.request.Request(
        "https://api.supabase.com/v1/projects/ukpmpyfcnbhngkgbnkxi/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": "Bearer " + os.environ["T"], "Content-Type": "application/json", "User-Agent": "odds"},
    )
    return json.load(urllib.request.urlopen(r, timeout=120))
