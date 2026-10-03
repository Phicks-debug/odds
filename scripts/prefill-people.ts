/**
 * Finds people to ask for a referral, once per employer, and stores them in public.job_people, so the Find people button reads the table and
 * scrapes nothing. One search per employer asks LinkedIn (through the Apify actor harvestapi/linkedin-profile-search) for people at the company
 * in the Netherlands whose current job title is in the departments of that employer's new jobs. The actor charges per search page ($0.10),
 * not per person, so each search takes the first 25. Jev (TypeSafe) then judges every person: in the Netherlands, works at the company, headline
 * is a job title (supabase/functions/_shared/people-judge.ts). Only people Jev is sure of are stored, with its probabilities kept.
 *
 *   APIFY_PEOPLE_TOKEN=... TYPESAFE_API_KEY=... SUPABASE_ACCESS_TOKEN=... bun scripts/prefill-people.ts --limit 40 [--days 7] [--levels Internship,Entry] [--dry]
 * Employers already in job_people_runs are skipped, newest posting first, so a re-run only spends on new employers.
 */
import companyPages from "../src/lib/company-linkedin.json"
import { DEPARTMENT_TITLES } from "../supabase/functions/_shared/departments"
import { buildQuestions, keepPerson, readPersonAnswers, stateOf, type PersonFacts } from "../supabase/functions/_shared/people-judge"

const APIFY = process.env.APIFY_PEOPLE_TOKEN
const JEV = process.env.TYPESAFE_API_KEY
const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = "ukpmpyfcnbhngkgbnkxi"
const arg = (n: string, d: string): string => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const dry = process.argv.includes("--dry")
if (!dry && (!APIFY || !JEV || !PAT)) throw new Error("Set APIFY_PEOPLE_TOKEN, TYPESAFE_API_KEY and SUPABASE_ACCESS_TOKEN")
if (dry && !PAT) throw new Error("Set SUPABASE_ACCESS_TOKEN")
const LIMIT = Number(arg("--limit", "10"))
const DAYS = Number(arg("--days", "7"))
const LEVELS = arg("--levels", "Internship,Entry").split(",").map((l) => `'${l.replace(/'/g, "''")}'`).join(",")
const PAGES = companyPages as Record<string, string>
const PRICE_PER_SEARCH = 0.1

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

interface Employer { employer: string; display: string; families: string[]; jobs: number }
// The window is the app's own "Past week" rule (src/lib/filters.ts): a job counts when its posted age is within the days and it is not
// marked still_listed_30_plus; a job with no posted age at all is not in it. Employers with the most jobs come first, so a limited budget covers
// the most jobs. --limit is a number of SEARCHES: employers with no LinkedIn page are skipped without counting.
const AGE = "case when posted_on is not null then current_date - posted_on else days_open end"
const employers = await sql<Employer>(`
  select employer, max(employer_display) as display, array_agg(distinct family) filter (where family is not null) as families, count(*)::int as jobs
  from active_jobs
  where level_view in (${LEVELS}) and (${AGE}) is not null and (${AGE}) <= ${DAYS} and coalesce(freshness_state, '') <> 'still_listed_30_plus'
    and employer not in (select employer from job_people_runs)
  group by employer order by count(*) desc, max(coalesce(posted_on, fetched_at::date)) desc`)
console.log(`${employers.length} employers in the last ${DAYS} days (${LEVELS.replace(/'/g, "")}); searching at most ${LIMIT}, up to $${(LIMIT * PRICE_PER_SEARCH).toFixed(2)}${dry ? " (dry run: nothing is searched)" : ""}`)

const kept0 = (found: unknown[]): boolean => found.length > 0
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
// The list is keyed by legal names ("abn amro bank n.v.", "picnic technologies"), so after the exact keys a name matches when one side's words
// are the start of the other's ("abn amro" starts "abn amro bank n v"). The shortest such key wins. Jev's works-at check catches a wrong page.
const ENTRIES = Object.entries(PAGES).map(([k, url]) => ({ words: norm(k).split(" ").filter(Boolean), url }))
const startsWith = (a: string[], b: string[]): boolean => b.length > 0 && b.length <= a.length && b.every((w, i) => a[i] === w)
const pageOf = (e: Employer): string | null => {
  const exact = PAGES[e.employer.toLowerCase()] ?? PAGES[norm(e.display)] ?? PAGES[e.display.trim().toLowerCase()]
  if (exact) return exact
  const mine = norm(e.display).split(" ").filter(Boolean)
  if (mine.join("").length < 3) return null
  const hits = ENTRIES.filter((x) => startsWith(x.words, mine) || (x.words.join("").length >= 3 && startsWith(mine, x.words))).sort((a, b) => a.words.length - b.words.length)

  return hits[0]?.url ?? null
}
const titlesFor = (fam: string[]): string[] => [...new Set(fam.flatMap((f) => (DEPARTMENT_TITLES[f] ?? []).slice(0, 4)))].slice(0, 12)

interface Found { name: string; url: string; headline: string; place: string; employerLine: string; positions: Array<{ title: string; company: string; since: string }> }
function toFound(items: Array<Record<string, any>>, e: Employer): Found[] {
  return items.filter((p) => p.linkedinUrl && (p.firstName || p.lastName)).map((p) => {
    const cur = (Array.isArray(p.currentPositions) ? p.currentPositions : []) as Array<Record<string, any>>
    const here = cur.find((c) => norm(String(c.companyName ?? "")).includes(norm(e.display).split(" ")[0] ?? "")) ?? cur[0] ?? {}
    return {
      name: [p.firstName, p.lastName].filter(Boolean).join(" "), url: String(p.linkedinUrl),
      headline: String(here.title ?? ""), place: String(p.location?.linkedinText ?? ""), employerLine: String(here.companyName ?? ""),
      positions: cur.filter((c) => c.title).slice(0, 3).map((c) => ({ title: String(c.title), company: String(c.companyName ?? ""), since: c.startedOn?.year ? String(c.startedOn.year) : "" })),
    }
  })
}

// --from-dataset "Employer=datasetId" re-judges what an earlier search already returned (Apify keeps run results), without a new search or any cost.
const FROM = new Map(process.argv.flatMap((a, i) => (process.argv[i - 1] === "--from-dataset" ? [a.split("=") as [string, string]] : [])))
async function datasetItems(id: string): Promise<Array<Record<string, any>>> {
  const r = await fetch(`https://api.apify.com/v2/datasets/${id}/items?clean=true&token=${APIFY}`)
  if (!r.ok) throw new Error(`dataset ${id}: ${r.status}`)
  return (await r.json()) as Array<Record<string, any>>
}

async function search(e: Employer, page: string): Promise<Found[]> {
  const titles = titlesFor((e.families ?? []).length ? e.families : ["Operations & supply chain"])
  const r = await fetch(`https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/run-sync-get-dataset-items?token=${APIFY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentCompanies: [page], locations: ["Netherlands"], currentJobTitles: titles, maxItems: 25, takePages: 1, excludeSeniorityLevelIds: ["220", "300", "310", "320"], profileScraperMode: "Short" }),
    signal: AbortSignal.timeout(175_000),
  })
  if (!r.ok) throw new Error(`apify ${r.status}: ${(await r.text()).slice(0, 160)}`)

  return toFound((await r.json()) as Array<Record<string, any>>, e)
}

/** The last part of the LinkedIn page address ("picnictechnologies"), which carries the company's own spelling. */
const pageName = (e: Employer): string => (pageOf(e) ?? "").split("/").filter(Boolean).pop() ?? ""
async function judge(e: Employer, f: Found): Promise<PersonFacts | null> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${JEV}`, "Content-Type": "application/json" }, body: JSON.stringify({ state: stateOf({ place: f.place, headline: f.headline, company: e.display, employerLine: f.employerLine, pageName: pageName(e) }), model: "jev-latest", questions: buildQuestions() }) })
    if (r.ok) return readPersonAnswers((await r.json()) as Parameters<typeof readPersonAnswers>[0])
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 1000 * 2 ** i)); continue }
    throw new Error(`jev ${r.status}: ${(await r.text()).slice(0, 160)}`)
  }
  return null
}

// Two spellings of one employer ("ABN AMRO", "ABN AMRO Bank N.V.") share a LinkedIn page: what was found for one is copied to the other, free.
const searchedPages = new Map<string, string>()
for (const r of await sql<{ employer: string; display: string }>(`select r.employer, coalesce(max(p.employer_display), r.employer) as display from job_people_runs r left join postings p on p.employer = r.employer where r.kept > 0 group by r.employer`)) {
  const pg = pageOf({ employer: r.employer, display: r.display, families: [], jobs: 0 })
  if (pg && !searchedPages.has(pg)) searchedPages.set(pg, r.employer)
}
/** An empty answer can mean the actor refused to run: its log says "Free users are limited to 10 runs". Then the batch must stop, not record empty searches. */
async function limitReached(): Promise<boolean> {
  const runs = (await (await fetch(`https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/runs?limit=1&desc=1&token=${APIFY}`)).json()) as { data?: { items?: Array<{ id: string }> } }
  const id = runs.data?.items?.[0]?.id
  if (!id) return false
  const log = await (await fetch(`https://api.apify.com/v2/actor-runs/${id}/log?token=${APIFY}`)).text()

  return /limited to \d+ runs|run limit|upgrade to a paid plan|exceeded|insufficient/i.test(log)
}
let spent = 0, stored = 0, skipped = 0, searched = 0, covered = 0, reused = 0
for (const e of employers) {
  if (searched >= LIMIT) break
  if (FROM.size > 0 && !FROM.has(e.employer)) continue // recovering from datasets: nothing else is searched
  const page = pageOf(e)
  if (!page) { console.log(`- ${e.display}: no LinkedIn company page known, skipped (nothing spent)`); skipped++; continue }
  const twin = searchedPages.get(page)
  if (twin) {
    if (!dry) {
      await sql(`insert into job_people (employer, profile_url, name, headline, place, photo, about, positions, jev) select ${lit(e.employer)}, profile_url, name, headline, place, photo, about, positions, jev from job_people where employer = ${lit(twin)} on conflict (employer, profile_url) do nothing`)
      await sql(`insert into job_people_runs (employer, found, kept, cost_usd) select ${lit(e.employer)}, found, kept, 0 from job_people_runs where employer = ${lit(twin)} on conflict (employer) do nothing`)
    }
    reused++; covered += e.jobs
    console.log(`- ${e.display}: same LinkedIn page as ${twin}, people copied, nothing spent`)
    continue
  }
  if (dry) { console.log(`- ${e.display} (${e.jobs} jobs, ${(e.families ?? []).join(" / ") || "no department"}) -> ${page}`); searched++; covered += e.jobs; searchedPages.set(page, e.employer); continue }
  try {
    const dataset = FROM.get(e.employer)
    const found = dataset ? toFound(await datasetItems(dataset), e) : await search(e, page)
    if (!dataset && found.length === 0 && (await limitReached())) { console.log("\nThe Apify actor says the account has reached its run limit (free accounts get 10 runs). Stopping; nothing was recorded for this employer."); break }
    searched++
    covered += e.jobs
    spent += dataset ? 0 : found.length > 0 ? PRICE_PER_SEARCH : 0.004
    if (kept0(found)) searchedPages.set(page, e.employer)
    const facts: Array<PersonFacts | null> = []
    for (let i = 0; i < found.length; i += 6) facts.push(...(await Promise.all(found.slice(i, i + 6).map((f) => judge(e, f).catch(() => null)))))
    const kept = found.map((f, i) => ({ f, j: facts[i] })).filter((x) => keepPerson(x.j))
    if (kept.length) {
      await sql(`insert into job_people (employer, profile_url, name, headline, place, positions, jev) values ${kept.map(({ f, j }) => `(${lit(e.employer)}, ${lit(f.url)}, ${lit(f.name)}, ${lit(f.headline)}, ${lit(f.place)}, ${lit(JSON.stringify(f.positions))}::jsonb, ${lit(JSON.stringify(j))}::jsonb)`).join(",")} on conflict (employer, profile_url) do update set headline = excluded.headline, place = excluded.place, positions = excluded.positions, jev = excluded.jev, fetched_at = now()`)
    }
    await sql(`insert into job_people_runs (employer, found, kept, cost_usd) values (${lit(e.employer)}, ${found.length}, ${kept.length}, ${dataset ? 0 : PRICE_PER_SEARCH}) on conflict (employer) do update set searched_at = now(), found = excluded.found, kept = excluded.kept, cost_usd = excluded.cost_usd`)
    stored += kept.length
    // Why people were left out, so a wrong rule shows up here and not as a mystery later.
    const why = { notNetherlands: 0, notAtCompany: 0, noAnswer: 0 }
    for (const { j } of found.map((f, i) => ({ f, j: facts[i] })).filter((x) => !keepPerson(x.j))) {
      if (!j) why.noAnswer++
      else if (j.inNetherlands < 0.8) why.notNetherlands++
      else why.notAtCompany++
    }
    console.log(`- ${e.display}: ${found.length} found, ${kept.length} kept by Jev (left out: not in NL ${why.notNetherlands}, not at the company ${why.notAtCompany}, no answer ${why.noAnswer})  ${kept.slice(0, 3).map((x) => `${x.f.name} (${x.f.headline})`).join("; ")}`)
  } catch (err) { console.log(`- ${e.display}: failed, ${(err as Error).message}`) }
}
console.log(`\nsearched ${searched}, skipped ${skipped} (no page), copied from a twin ${reused}, jobs covered ${covered}, people stored ${stored}, search cost about $${spent.toFixed(2)}`)
