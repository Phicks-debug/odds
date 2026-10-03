/**
 * Finds people to ask for a referral through Google (SerpApi) instead of a LinkedIn scraper: one search per employer and department,
 * "site:linkedin.com/in <company> <department word> Netherlands", then Jev (TypeSafe) judges every result (in the Netherlands, works at the
 * company now, headline is a job title; supabase/functions/_shared/people-judge.ts). The free SerpApi plan is 250 searches a month.
 *
 *   SERPAPI_KEY=... TYPESAFE_API_KEY=... SUPABASE_ACCESS_TOKEN=... bun scripts/prefill-people-serp.ts --employers "Picnic,ABN AMRO"        test: prints, stores nothing
 *   ... bun scripts/prefill-people-serp.ts --limit 40 --days 7 --store                                                          fills job_people for the newest employers
 */
import { DEPARTMENT_TITLES } from "../supabase/functions/_shared/departments"
import { buildQuestions, keepPerson, readPersonAnswers, stateOf, type PersonFacts } from "../supabase/functions/_shared/people-judge"
import companyPages from "../src/lib/company-linkedin.json"

const KEY = process.env.SERPAPI_KEY, JEV = process.env.TYPESAFE_API_KEY, PAT = process.env.SUPABASE_ACCESS_TOKEN
if (!KEY || !JEV || !PAT) throw new Error("Set SERPAPI_KEY, TYPESAFE_API_KEY and SUPABASE_ACCESS_TOKEN")
const arg = (n: string, d: string): string => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const STORE = process.argv.includes("--store")
const ONLY = arg("--employers", "").split(",").map((x) => x.trim()).filter(Boolean)
const LIMIT = Number(arg("--limit", "10")), DAYS = Number(arg("--days", "7")), PER = Number(arg("--queries", "2"))
const HL = arg("--hl", "nl") // Google in Dutch shows LinkedIn snippets with a "Locatie:" line, which is what lets Jev confirm the Netherlands
const PAGES = companyPages as Record<string, string>
const REF = "ukpmpyfcnbhngkgbnkxi"
const lit = (s: string): string => `$q$${s.replace(/\$q\$/g, "")}$q$`
async function sql<T = Record<string, any>>(query: string): Promise<T[]> {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })
    if (r.status === 429) { await new Promise((x) => setTimeout(x, 3000 * 2 ** i)); continue }
    if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return (await r.json()) as T[]
  }
  throw new Error("throttled")
}
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const pageName = (display: string): string => {
  const mine = norm(display).split(" ")
  const hit = Object.entries(PAGES).filter(([k]) => { const w = norm(k).split(" "); return mine.every((x, i) => w[i] === x) || w.every((x, i) => mine[i] === x) }).sort((a, b) => a[0].length - b[0].length)[0]
  return (hit?.[1] ?? "").split("/").filter(Boolean).pop() ?? ""
}

// Google needs a role phrase to anchor on: a single generic word ("finance") made it drop the site: filter and return company pages.
const ROLE_WORDS: Record<string, string[]> = {
  "Finance & accounting": ["financial analyst", "accountant"], "Software engineering": ["software engineer", "developer"], "Data, analytics & AI": ["data analyst", "data scientist"],
  "Sales & account management": ["account manager", "sales manager"], "Product & project management": ["product manager", "project manager"], "Risk, compliance & legal": ["risk analyst", "compliance officer"],
  "Operations & supply chain": ["supply chain planner", "operations manager"], "IT, cloud & security": ["IT specialist", "security engineer"], "Research & academia": ["research scientist", "researcher"],
  "Consulting & strategy": ["consultant", "strategy consultant"], "Hardware & engineering": ["mechanical engineer", "systems engineer"], "Marketing & communications": ["marketing manager", "communications specialist"],
  "HR & recruiting": ["recruiter", "HR business partner"], "Healthcare & life sciences": ["clinical research", "regulatory affairs"], "Customer support & service": ["customer success", "customer service"], "Design & UX": ["product designer", "UX designer"],
}
interface Employer { employer: string; display: string; families: string[]; jobs: number }
const AGE = "case when posted_on is not null then current_date - posted_on else days_open end"
const employers: Employer[] = ONLY.length
  ? await sql<Employer>(`select employer, max(employer_display) display, array_agg(distinct family) filter (where family is not null) families, count(*)::int jobs from active_jobs where employer in (${ONLY.map(lit).join(",")}) group by 1`)
  : await sql<Employer>(`select employer, max(employer_display) display, array_agg(distinct family) filter (where family is not null) families, count(*)::int jobs from active_jobs
      where level_view in ('Internship','Entry') and (${AGE}) is not null and (${AGE}) <= ${DAYS} and coalesce(freshness_state,'') <> 'still_listed_30_plus' and employer not in (select employer from job_people_runs)
      group by 1 order by count(*) desc limit ${LIMIT}`)

interface Hit { name: string; url: string; headline: string; place: string; snippet: string }
let searches = 0
async function serp(q: string): Promise<Hit[]> {
  searches++
  const r = await fetch(`https://serpapi.com/search.json?${new URLSearchParams({ engine: "google", q, gl: "nl", hl: HL, api_key: KEY! })}`)
  if (!r.ok) throw new Error(`serpapi ${r.status}: ${(await r.text()).slice(0, 120)}`)
  const d = (await r.json()) as { organic_results?: Array<{ title?: string; link?: string; snippet?: string }> }
  return (d.organic_results ?? []).filter((x) => /linkedin\.com\/in\//i.test(x.link ?? "")).map((x) => {
    const title = (x.title ?? "").replace(/\s*[|·-]\s*LinkedIn\s*$/i, "")
    const [name, ...rest] = title.split(/\s[-–—]\s/)
    const headline = rest.join(" - ").split(/\s\|\s/)[0].trim()
    const place = /(?:Locatie|Location|Standort|Lieu|Ubicación)\s*[:：]\s*([^·|.]+)/i.exec(x.snippet ?? "")?.[1]?.trim() ?? ""
    return { name: name.trim(), url: (x.link ?? "").split("?")[0].replace(/\/$/, ""), headline, place, snippet: (x.snippet ?? "").replace(/\s+/g, " ") }
  })
}
async function judge(e: Employer, h: Hit): Promise<PersonFacts | null> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${JEV}`, "Content-Type": "application/json" }, body: JSON.stringify({ state: stateOf({ place: h.place || "(not given separately: read where the person is based now from the search text)", headline: h.headline, company: e.display, employerLine: h.headline, about: h.snippet, pageName: pageName(e.display) }), model: "jev-latest", questions: buildQuestions() }) })
    if (r.ok) return readPersonAnswers((await r.json()) as Parameters<typeof readPersonAnswers>[0])
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 1000 * 2 ** i)); continue }
    throw new Error(`jev ${r.status}`)
  }
  return null
}
const slug = (u: string): string => (u.split("/in/")[1] ?? u).split(/[/?]/)[0].toLowerCase()

let kept = 0, seen = 0
for (const e of employers) {
  const words = [...new Set((e.families?.length ? e.families : ["Operations & supply chain"]).map((f) => (ROLE_WORDS[f] ?? DEPARTMENT_TITLES[f] ?? [])[0]).filter(Boolean))].slice(0, PER)
  const hits = new Map<string, Hit>()
  for (const w of words) for (const h of await serp(`site:linkedin.com/in ${e.display} ${w} Netherlands`)) if (h.name && !hits.has(slug(h.url))) hits.set(slug(h.url), h)
  const list = [...hits.values()]
  const facts: Array<PersonFacts | null> = []
  for (let i = 0; i < list.length; i += 6) facts.push(...(await Promise.all(list.slice(i, i + 6).map((h) => judge(e, h).catch(() => null)))))
  const ok = list.map((h, i) => ({ h, f: facts[i] })).filter((x) => keepPerson(x.f))
  seen += list.length; kept += ok.length
  const old = new Set((await sql<{ profile_url: string }>(`select profile_url from job_people where employer = ${lit(e.employer)}`)).map((r) => slug(r.profile_url)))
  const overlap = ok.filter((x) => old.has(slug(x.h.url))).length
  console.log(`\n### ${e.display} (${e.jobs} jobs; queries: ${words.join(", ")}): ${list.length} profiles found, ${ok.length} kept by Jev; already in the Apify list: ${overlap}${old.size ? ` of ${old.size}` : ""}`)
  for (const x of ok.slice(0, 8)) console.log(`   + ${x.h.name.slice(0, 26).padEnd(26)} | ${x.h.headline.slice(0, 52).padEnd(52)} | ${x.h.place || "-"}  (NL ${x.f!.inNetherlands.toFixed(2)}, at-co ${x.f!.worksAt?.toFixed(2)})`)
  for (const x of list.map((h, i) => ({ h, f: facts[i] })).filter((x) => !keepPerson(x.f)).slice(0, 3)) console.log(`   - left out: ${x.h.name.slice(0, 22)} | ${x.h.headline.slice(0, 40)} | NL ${x.f?.inNetherlands.toFixed(2)} at-co ${x.f?.worksAt?.toFixed(2)} | ${x.h.snippet.slice(0, 70)}`)
  if (STORE && ok.length) {
    await sql(`insert into job_people (employer, profile_url, name, headline, place, about, jev) values ${ok.map(({ h, f }) => `(${lit(e.employer)}, ${lit(h.url)}, ${lit(h.name)}, ${lit(h.headline)}, ${lit(h.place)}, ${lit(h.snippet.slice(0, 300))}, ${lit(JSON.stringify({ ...f, source: "serp" }))}::jsonb)`).join(",")} on conflict (employer, profile_url) do nothing`)
    await sql(`insert into job_people_runs (employer, found, kept, cost_usd) values (${lit(e.employer)}, ${list.length}, ${ok.length}, 0) on conflict (employer) do update set searched_at = now(), found = excluded.found, kept = excluded.kept`)
  }
}
console.log(`\n${employers.length} employers, ${searches} SerpApi searches (free plan: 250 a month), ${seen} profiles, ${kept} kept by Jev (${seen ? ((100 * kept) / seen).toFixed(0) : 0}%)${STORE ? ", stored" : ", nothing stored (test)"}`)
