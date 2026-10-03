/**
 * Judges people read by hand from LinkedIn people search (cards: name, headline, place) with Jev and stores the ones it is sure of in
 * public.job_people, the same way scripts/prefill-people.ts does (same questions, same SHOW_AT, same job_people_runs bookkeeping).
 * Input: the worklist (employer per search) and a rows file, one card per line: searchIndex|slug|name|headline|place|currentLine.
 *
 *   TYPESAFE_API_KEY=... SUPABASE_ACCESS_TOKEN=... bun scripts/store-li-people.ts --worklist li-worklist.json --rows li-rows.txt [--only Accenture] [--store]
 * Without --store nothing is written: it prints what would be stored. Up to PER_EMPLOYER people per employer, picked with rankForJob for each
 * department the employer's past-week internship and entry jobs are in.
 */
import { readFileSync } from "node:fs"
import { rankForJob, type Suggestion } from "../src/lib/suggest"
import { buildQuestions, keepPerson, readPersonAnswers, stateOf, type PersonFacts } from "../supabase/functions/_shared/people-judge"

const JEV = process.env.TYPESAFE_API_KEY
const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = "ukpmpyfcnbhngkgbnkxi"
if (!JEV || !PAT) throw new Error("Set TYPESAFE_API_KEY and SUPABASE_ACCESS_TOKEN")
const arg = (n: string, d = ""): string => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const STORE = process.argv.includes("--store")
const ONLY = arg("--only").toLowerCase()
const PER_EMPLOYER = 3
const DAYS = 7
const decode = (s: string): string => s.replace(/&amp;/g, "&")

async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })
    if (r.status === 429) { await new Promise((x) => setTimeout(x, 3000 * 2 ** i)); continue }
    if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return (await r.json()) as T[]
  }
  throw new Error("sql kept being throttled")
}
const lit = (s: string): string => `$q$${s.replace(/\$q\$/g, "")}$q$`

async function judge(company: string, p: Card): Promise<PersonFacts | null> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${JEV}`, "Content-Type": "application/json" }, body: JSON.stringify({ state: stateOf({ place: p.place, headline: p.headline, company, employerLine: p.current.replace(/^Current:\s*/i, "") || p.headline }), model: "jev-latest", questions: buildQuestions() }) })
    if (r.ok) return readPersonAnswers((await r.json()) as Parameters<typeof readPersonAnswers>[0])
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 1000 * 2 ** i)); continue }
    throw new Error(`jev ${r.status}: ${(await r.text()).slice(0, 160)}`)
  }
  return null
}

interface Card { search: number; slug: string; name: string; headline: string; place: string; current: string }
const work = JSON.parse(readFileSync(arg("--worklist"), "utf8")) as Array<{ employer: string; display: string; jobs: number; kw: string }>
const cards: Card[] = readFileSync(arg("--rows"), "utf8").split("\n").filter(Boolean).map((l) => {
  const [search, slug, name, headline, place, current] = l.split("|")
  return { search: Number(search), slug, name, headline: headline ?? "", place: place ?? "", current: current ?? "" }
})

// One pool per employer (two searches of the same employer are merged, one profile once).
const pools = new Map<string, { display: string; cards: Map<string, Card>; searches: Set<string> }>()
for (const c of cards) {
  const w = work[c.search]
  if (!w) continue
  const p = pools.get(w.employer) ?? { display: decode(w.display), cards: new Map(), searches: new Set() }
  p.cards.set(c.slug, c); p.searches.add(decode(w.kw)); pools.set(w.employer, p)
}

const AGE = "case when posted_on is not null then current_date - posted_on else days_open end"
const familiesOf = async (employer: string): Promise<Array<{ family: string | null; n: number }>> =>
  sql<{ family: string | null; n: number }>(`select family, count(*)::int as n from active_jobs where employer = ${lit(employer)} and level_view in ('Internship','Entry') and (${AGE}) is not null and (${AGE}) <= ${DAYS} and coalesce(freshness_state,'') <> 'still_listed_30_plus' group by family order by n desc`)

let totalStored = 0, totalRead = 0
const summary: string[] = []
for (const [employer, pool] of pools) {
  if (ONLY && !employer.toLowerCase().includes(ONLY) && !pool.display.toLowerCase().includes(ONLY)) continue
  const list = [...pool.cards.values()]
  const facts: Array<PersonFacts | null> = []
  for (let i = 0; i < list.length; i += 6) facts.push(...(await Promise.all(list.slice(i, i + 6).map((c) => judge(pool.display, c).catch(() => null)))))
  const kept = list.map((c, i) => ({ c, j: facts[i] })).filter((x) => keepPerson(x.j))
  const asSugg = (c: Card): Suggestion => ({ name: c.name, headline: c.headline, place: c.place, url: `https://www.linkedin.com/in/${c.slug}` })
  const people = kept.map((x) => asSugg(x.c))
  // Rank for each department the employer's jobs are in (most jobs first), then fill up to PER_EMPLOYER without repeating anyone.
  const fams = await familiesOf(employer)
  const chosen: Suggestion[] = []
  const lists = (fams.length ? fams : [{ family: null, n: 0 }]).map((f) => rankForJob(people, f.family, PER_EMPLOYER))
  for (let k = 0; k < PER_EMPLOYER && chosen.length < PER_EMPLOYER; k++) for (const l of lists) if (l[k] && !chosen.some((s) => s.url === l[k].url) && chosen.length < PER_EMPLOYER) chosen.push(l[k])
  totalRead += list.length
  const rows = chosen.map((s) => ({ s, j: kept.find((x) => asSugg(x.c).url === s.url)!.j! }))
  summary.push(`${pool.display} | ${list.length} read, ${kept.length} kept by Jev, ${rows.length} stored | families ${fams.map((f) => `${f.family ?? "?"}x${f.n}`).join(", ") || "none"}`)
  for (const { s, j } of rows) summary.push(`    ${s.name} - ${s.headline} - ${s.place || "(no place)"}  [NL ${j.inNetherlands}, works at ${j.worksAt}, title ${j.isTitle}]`)
  if (STORE) {
    if (rows.length) await sql(`insert into job_people (employer, profile_url, name, headline, place, positions, jev) values ${rows.map(({ s, j }) => `(${lit(employer)}, ${lit(s.url)}, ${lit(s.name)}, ${lit(s.headline)}, ${lit(s.place)}, '[]'::jsonb, ${lit(JSON.stringify({ ...j, source: "linkedin-by-hand" }))}::jsonb)`).join(",")} on conflict (employer, profile_url) do update set headline = excluded.headline, place = excluded.place, jev = excluded.jev, fetched_at = now()`)
    await sql(`insert into job_people_runs (employer, found, kept, cost_usd) values (${lit(employer)}, ${list.length}, ${rows.length}, 0) on conflict (employer) do update set searched_at = now(), found = excluded.found, kept = excluded.kept, cost_usd = excluded.cost_usd`)
  }
  totalStored += rows.length
}
console.log(summary.join("\n"))
console.log(`\n${STORE ? "STORED" : "DRY RUN (nothing written)"}: employers ${summary.filter((s) => !s.startsWith("    ")).length}, cards read ${totalRead}, people ${totalStored}`)
