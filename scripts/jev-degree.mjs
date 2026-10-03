// Asks TypeSafe Jev the lowest degree each posting accepts, to replace the keyword guess in postings.degree_asked
// that blocks bachelor's students on postings saying "Bachelor's or Master's" or "Master's preferred".
//   TYPESAFE_API_KEY=... node scripts/jev-degree.mjs [limit] [--all]
// Read-only: prints a comparison and writes a JSON file next to the script's output folder; never touches the database.
const KEY = process.env.TYPESAFE_API_KEY
const SB = "https://ukpmpyfcnbhngkgbnkxi.supabase.co"
const ANON = (await import("node:fs")).readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim()
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 30)
const all = process.argv.includes("--all")
if (!KEY) { console.error("Set TYPESAFE_API_KEY"); process.exit(1) }
const LEVEL = {
  none: "No degree is asked for, or only 'studying' or 'enrolled' with no level, or work experience can replace it",
  bachelor: "A bachelor's (BSc, BA, HBO) is enough, including 'bachelor's or master's', 'BSc/MSc', and 'master's preferred', 'master's a plus', 'or equivalent experience'",
  master: "A master's (MSc, MA, MBA) is clearly compulsory with no bachelor's alternative, including 'currently pursuing a master's'",
  phd: "A PhD or doctorate is compulsory",
}
const r = await fetch(`${SB}/rest/v1/postings?select=id,title,employer_display,degree_asked,body&degree_asked=in.(master,phd)&order=id&limit=1000`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
let rows = await r.json()
if (!all) rows = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / limit)) === 0).slice(0, limit)
console.log(`${rows.length} postings`)
const ask = async (p) => {
  const body = { state: `Job title: ${p.title}\nEmployer: ${p.employer_display}\nPosting:\n${(p.body ?? "").slice(0, 6000)}`, model: "jev-latest", questions: { degree: { type: "choice", instructions: "What is the lowest education level this posting accepts from an applicant?", criteria: LEVEL } } }
  for (let i = 0; i < 4; i++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (res.ok) return (await res.json()).answers.degree
    if (res.status === 429 || res.status >= 500) { await new Promise((s) => setTimeout(s, 1000 * 2 ** i)); continue }
    throw new Error(`Jev ${res.status}: ${await res.text()}`)
  }
}
const out = []
const queue = [...rows]
await Promise.all(Array.from({ length: 6 }, async () => { for (let p; (p = queue.shift()); ) { try { const a = await ask(p); out.push({ id: p.id, employer: p.employer_display, title: p.title, old: p.degree_asked, jev: a.choice, confidence: a.confidence, snippet: (p.body ?? "").match(/.{0,70}\b(master|msc|bsc|bachelor|phd|degree)\b.{0,90}/i)?.[0]?.replace(/\s+/g, " ") ?? "" }) } catch (e) { console.error(p.id, e.message) } } }))
const tally = {}
for (const o of out) tally[`${o.old} -> ${o.jev}`] = (tally[`${o.old} -> ${o.jev}`] ?? 0) + 1
console.log(tally)
for (const o of out.sort((a, b) => a.jev.localeCompare(b.jev))) console.log(`[${o.old}->${o.jev} ${o.confidence?.toFixed?.(2)}] ${o.employer} | ${o.title.slice(0, 40)} | ${o.snippet}`)
await (await import("node:fs/promises")).writeFile(process.env.OUT ?? "jev_degree.json", JSON.stringify(out, null, 1))
