/** Past-week internship and entry jobs that have at least one person the app would show (rankForJob over job_people, same window as prefill-people.ts). SUPABASE_ACCESS_TOKEN=... bun scripts/coverage-people.ts */
import { rankForJob, type Suggestion } from "../src/lib/suggest"
const PAT = process.env.SUPABASE_ACCESS_TOKEN
if (!PAT) throw new Error("Set SUPABASE_ACCESS_TOKEN")
const sql = async <T>(query: string): Promise<T[]> => (await (await fetch("https://api.supabase.com/v1/projects/ukpmpyfcnbhngkgbnkxi/database/query", { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })).json()) as T[]
const AGE = "case when posted_on is not null then current_date - posted_on else days_open end"
const jobs = await sql<{ employer: string; family: string | null }>(`select employer, family from active_jobs where level_view in ('Internship','Entry') and (${AGE}) is not null and (${AGE}) <= 7 and coalesce(freshness_state,'') <> 'still_listed_30_plus'`)
const people = await sql<{ employer: string; name: string; headline: string; place: string; profile_url: string; src: string | null }>(`select employer, name, headline, place, profile_url, jev->>'source' as src from job_people`)
const by = new Map<string, Suggestion[]>()
for (const p of people) (by.get(p.employer) ?? by.set(p.employer, []).get(p.employer)!).push({ name: p.name, headline: p.headline, place: p.place, url: p.profile_url })
const hand = new Set(people.filter((p) => p.src === "linkedin-by-hand").map((p) => p.employer))
let any = 0, covered = 0, coveredHand = 0
for (const j of jobs) {
  const list = by.get(j.employer) ?? []
  if (list.length) any++
  if (rankForJob(list, j.family).length) { covered++; if (hand.has(j.employer)) coveredHand++ }
}
console.log(`jobs ${jobs.length}; employer has people ${any}; job has someone to show ${covered} (${((covered / jobs.length) * 100).toFixed(0)}%); of those, employers filled by hand ${coveredHand}`)
