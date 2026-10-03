// Gives every posting a line of work ("family") by reading it with TypeSafe Jev, so a career path can be built from postings like this one.
// Needs:  alter table public.postings add column if not exists family text;
// Usage: SB_URL=... SB_KEY=<service role> TYPESAFE_API_KEY=... node scripts/jev-family.mjs [limit] [--dry]
const { SB_URL, SB_KEY, TYPESAFE_API_KEY: KEY } = process.env
if (!SB_URL || !SB_KEY || !KEY) { console.error("Set SB_URL, SB_KEY and TYPESAFE_API_KEY in the environment."); process.exit(1) }
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 100000)
const dry = process.argv.includes("--dry")
// Only postings Jev has never read (level_jev empty), so a re-run does not pay for the same postings twice. --rescan reads all of them again.
const rescan = process.argv.includes("--rescan")
const rest = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
const FAMILIES = {
  "Finance & accounting": "Accounting, audit, tax, controlling, treasury, financial analysis, banking operations",
  "Risk, compliance & legal": "Risk management, compliance, regulatory, legal counsel, AML",
  "Software engineering": "Building software: backend, frontend, mobile, full-stack, embedded software, DevOps, QA",
  "Data, analytics & AI": "Data science, data engineering, business intelligence, analytics, machine learning",
  "IT, cloud & security": "IT support, infrastructure, cloud, networks, cybersecurity, IT consulting",
  "Hardware & engineering": "Electrical, mechanical, civil, process, chemical, systems, optical, semiconductor engineering",
  "Research & academia": "PhD, postdoc, professor, researcher, lab science, university teaching",
  "Marketing & communications": "Marketing, content, brand, social media, PR, copywriting, growth, events",
  "Sales & account management": "Sales, business development, account managers, customer success, partnerships",
  "Product & project management": "Product managers, project and programme managers, scrum masters, business analysts",
  "Operations & supply chain": "Operations, logistics, procurement, planning, production, facilities",
  "HR & recruiting": "Human resources, recruiting, talent, payroll, people operations",
  "Consulting & strategy": "Management and strategy consulting, corporate strategy, transformation",
  "Customer support & service": "Customer service, support, helpdesk, front office",
  "Design & UX": "Product, graphic, UX and UI design, creative",
  "Healthcare & life sciences": "Clinical, pharma, biotech, medical devices, regulatory affairs for health",
  Other: "None of the above",
}
async function all() {
  const rows = []
  for (let o = 0; ; o += 1000) {
    const r = await (await fetch(`${SB_URL}/rest/v1/postings?select=id,title,body,family&order=id&offset=${o}&limit=1000${rescan ? "" : "&level_jev=is.null"}`, { headers: rest })).json()
    if (!Array.isArray(r)) throw new Error(JSON.stringify(r))
    rows.push(...r)
    if (r.length < 1000) break
  }
  return rows
}
async function ask(p, tries = 4) {
  const state = `Job title: ${p.title}\nPosting:\n${(p.body ?? "").slice(0, 1500)}`
  for (let i = 0; i < tries; i++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ state, model: "jev-latest", questions: { family: { type: "choice", instructions: "Which line of work is this job in? Judge by the work itself, not the employer's industry.", criteria: FAMILIES } } }) })
    if (res.ok) return (await res.json()).answers.family
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue }
    throw new Error(`Jev ${res.status}: ${await res.text()}`)
  }
  throw new Error("Jev kept failing")
}
const rows = (await all()).filter((p) => p.family == null).slice(0, limit)
console.log(`${rows.length} postings${dry ? " (dry run)" : ""}`)
const counts = {}
let done = 0, failed = 0
async function one(p) {
  try {
    const a = await ask(p)
    const family = a.confidence >= 0.6 ? a.choice : null
    counts[family ?? "(unsure)"] = (counts[family ?? "(unsure)"] ?? 0) + 1
    if (!dry && family) {
      const r = await fetch(`${SB_URL}/rest/v1/postings?id=eq.${p.id}`, { method: "PATCH", headers: { ...rest, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ family }) })
      if (!r.ok) throw new Error(`write ${r.status} ${await r.text()}`)
    }
  } catch (e) { failed++; if (failed <= 3) console.error(p.id, e.message) }
  if (++done % 200 === 0) console.log(`${done}/${rows.length} failed ${failed}`)
}
const queue = [...rows]
await Promise.all(Array.from({ length: 8 }, async () => { for (let p; (p = queue.shift()); ) await one(p) }))
console.log(`done ${done}, failed ${failed}`, counts)
