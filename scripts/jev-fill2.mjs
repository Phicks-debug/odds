// Fills what postings leave unstated by reading the text with TypeSafe Jev: minimum years, degree asked and, with --columns,
// industry, workplace, job type and whether Dutch is needed. It only fills what is empty and only when Jev is sure (0.8).
// Usage: SB_URL=... SB_KEY=<service role> TYPESAFE_API_KEY=... node scripts/jev-fill2.mjs [limit] [--columns] [--dry]
// --columns needs these to exist:  alter table public.postings add column if not exists industry text, add column if not exists workplace text, add column if not exists job_type text, add column if not exists dutch_jev real;
const { SB_URL, SB_KEY, TYPESAFE_API_KEY: KEY } = process.env
if (!SB_URL || !SB_KEY || !KEY) { console.error("Set SB_URL, SB_KEY and TYPESAFE_API_KEY in the environment."); process.exit(1) }
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 100000)
const dry = process.argv.includes("--dry")
// Only postings Jev has never read (dutch_jev empty), so a re-run does not pay for the same postings twice. --rescan reads all of them again.
const rescan = process.argv.includes("--rescan")
const withColumns = process.argv.includes("--columns")
const SURE = 0.8
const rest = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

const YEARS = { none: "No minimum experience is stated", y1: "At least 1 year is asked", y2: "At least 2 years are asked", y3: "At least 3 years are asked", y4: "At least 4 years are asked", y5: "At least 5 years are asked", y7: "7 or more years are asked" }
const DEGREE = { none: "No degree is asked for", bachelor: "A bachelor's degree is asked for", master: "A master's degree is asked for", phd: "A PhD is asked for" }
const INDUSTRY = { Banking: "The employer is a bank", "Financial services": "Payments, fintech, asset management, brokers", Insurance: "Insurance or pensions", Accounting: "Audit, tax or accounting firm", Consulting: "Management or strategy consulting", Legal: "Law firm or legal services", "Staffing & recruiting": "Staffing or recruitment agency", "Software & internet": "Software, internet or tech product company", "IT services": "IT services and consulting", Telecommunications: "Telecom", Semiconductors: "Chips and electronics equipment", Manufacturing: "Industrial manufacturing, engineering, shipbuilding", "Health & life sciences": "Pharma, biotech, medical devices, hospitals", "Energy & utilities": "Energy, oil, gas, utilities", Construction: "Construction and infrastructure", "Transport & logistics": "Transport, shipping, logistics, airlines", "Food & consumer goods": "Food, drink and consumer goods", "Retail & e-commerce": "Retail, fashion or e-commerce", "Hospitality & travel": "Hotels, travel, leisure", "Media & marketing": "Media, advertising, marketing", Education: "University or school", "Government & non-profit": "Government, public body or non-profit", "Real estate": "Real estate" }
const WORKPLACE = { onsite: "Work is at the employer's site", hybrid: "Some days at the office and some at home", remote: "Fully remote", unknown: "The posting does not say" }
const JOBTYPE = { fulltime: "A full-time job", parttime: "A part-time job", internship: "An internship or traineeship", contract: "A contract or freelance job" }

async function all() {
  const rows = []
  const cols = "id,title,employer_display,body,years_min,degree_asked" + (withColumns ? ",industry,workplace,job_type,dutch_jev" : "")
  for (let o = 0; ; o += 1000) {
    const r = await (await fetch(`${SB_URL}/rest/v1/postings?select=${cols}&order=id&offset=${o}&limit=1000${rescan ? "" : "&dutch_jev=is.null"}`, { headers: rest })).json()
    if (!Array.isArray(r)) throw new Error(JSON.stringify(r))
    rows.push(...r)
    if (r.length < 1000) break
  }
  return rows
}
const need = (p) => p.years_min == null || p.degree_asked == null || (withColumns && (p.industry == null || p.workplace == null || p.job_type == null || p.dutch_jev == null))

async function ask(p, tries = 4) {
  const state = `Job title: ${p.title}\nEmployer: ${p.employer_display}\nPosting:\n${(p.body ?? "").slice(0, 3500)}`
  const questions = {
    years: { type: "choice", instructions: "How many years of relevant professional work experience does the posting make a MUST for the applicant? If it gives alternatives (for example a bachelor plus 5 years, or a master plus 3), answer the lowest. If it gives a range (2 to 5, or 2 to 10+), answer where it starts. Answer none when the years are only preferred, typical, ideal or a plus, when fresh graduates are welcome, or when no years are named. Ignore the age of the company, contract or project lengths, ages, and the length of studies.", criteria: YEARS },
    degree: { type: "choice", instructions: "What is the lowest degree level the applicant must ALREADY HOLD? Answer none if no degree is named, if a degree is only preferred, if equivalent experience or another route is accepted (bachelor or equivalent experience means none), or if the job is an internship or traineeship for a current student (currently pursuing a bachelor or master means none: the degree is the one being studied). A PhD position, where the person will do a PhD, asks for a master. If a bachelor or a master is accepted, answer bachelor.", criteria: DEGREE },
  }
  if (withColumns) {
    questions.industry = { type: "choice", instructions: "Which industry is the employer in?", criteria: INDUSTRY }
    questions.workplace = { type: "choice", instructions: "Where is the work done?", criteria: WORKPLACE }
    questions.job_type = { type: "choice", instructions: "What kind of job is this?", criteria: JOBTYPE }
    questions.dutch = { type: "noul", instructions: "Does the posting require the candidate to speak Dutch?" }
  }
  for (let i = 0; i < tries; i++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ state, model: "jev-latest", questions }) })
    if (res.ok) return (await res.json()).answers
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue }
    throw new Error(`Jev ${res.status}: ${await res.text()}`)
  }
  throw new Error("Jev kept failing")
}
const sure = (a) => a && a.confidence >= SURE
// Jev must not infer from the word "senior": the text itself has to name years or a degree before an answer is accepted.
const SAYS_YEARS = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(\+|-|–|to)?\s*(\d+)?\s*\+?\s*(years?|yrs?|jaar)\b/i
const SAYS_DEGREE = /\b(bachelor|master|msc|bsc|ba|ma|phd|doctorate|degree|university|hbo|wo)\b/i

const rows = (await all()).filter(need).slice(0, limit)
console.log(`${rows.length} postings with something unstated${dry ? " (dry run)" : ""}`)
const filled = { years_min: 0, degree_asked: 0, industry: 0, workplace: 0, job_type: 0, dutch_jev: 0 }
let done = 0, failed = 0
async function one(p) {
  try {
    const a = await ask(p)
    const patch = {}
    if (p.years_min == null && sure(a.years) && a.years.choice !== "none" && SAYS_YEARS.test(p.body ?? "")) patch.years_min = Number(a.years.choice.slice(1))
    if (p.degree_asked == null && sure(a.degree) && a.degree.choice !== "none" && SAYS_DEGREE.test(p.body ?? "")) patch.degree_asked = a.degree.choice
    if (withColumns) {
      if (p.industry == null && sure(a.industry)) patch.industry = a.industry.choice
      if (p.workplace == null && sure(a.workplace) && a.workplace.choice !== "unknown") patch.workplace = a.workplace.choice
      if (p.job_type == null && sure(a.job_type)) patch.job_type = a.job_type.choice
      if (p.dutch_jev == null) patch.dutch_jev = a.dutch.noul
    }
    for (const k of Object.keys(patch)) filled[k]++
    if (!dry && Object.keys(patch).length) {
      const r = await fetch(`${SB_URL}/rest/v1/postings?id=eq.${p.id}`, { method: "PATCH", headers: { ...rest, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(patch) })
      if (!r.ok) throw new Error(`write ${r.status} ${await r.text()}`)
    }
  } catch (e) { failed++; if (failed <= 3) console.error(p.id, e.message) }
  if (++done % 200 === 0) console.log(`${done}/${rows.length} filled ${JSON.stringify(filled)} failed ${failed}`)
}
const queue = [...rows]
await Promise.all(Array.from({ length: 8 }, async () => { for (let p; (p = queue.shift()); ) await one(p) }))
console.log(`done ${done}, failed ${failed}, filled ${JSON.stringify(filled)}`)
