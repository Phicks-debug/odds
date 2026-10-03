// Fills postings.requirements by asking TypeSafe Jev how much each line of a posting insists on it: must, strong plus,
// preferred, nice to have, or not a requirement at all (a responsibility, a benefit, company text). Spec: JEV_REQUIREMENTS_SPEC.md.
// A line is kept only when Jev is sure (0.8). A posting that was read and has no requirement lines gets [] so it is not read twice.
//
// Usage (secrets only in the environment, never in a file):
//   TYPESAFE_API_KEY=... SUPABASE_ACCESS_TOKEN=... node scripts/jev-requirements.mjs [limit] [--dry] [--sample]
//   --dry     reads and prints, writes nothing
//   --sample  with --dry: prints 20 postings, line by line, so the tiers can be checked by eye before filling the table
const { TYPESAFE_API_KEY: KEY, SUPABASE_ACCESS_TOKEN: PAT } = process.env
const REF = "ukpmpyfcnbhngkgbnkxi"
const SB_URL = `https://${REF}.supabase.co`
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? (await import("node:fs")).readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim()
const dry = process.argv.includes("--dry")
const sample = process.argv.includes("--sample")
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? (sample ? 20 : 100000))
if (!KEY || (!dry && !PAT)) { console.error("Set TYPESAFE_API_KEY (and SUPABASE_ACCESS_TOKEN unless --dry)."); process.exit(1) }
const SURE = 0.8
const MAX_LINES = 40

const TIER = {
  must: "A compulsory requirement: the person needs it, as under requirements, you have, must, required, minimum, essential",
  strong: "A strong plus: strongly preferred, highly desirable, a big plus, a significant advantage",
  optional: "Preferred: a plus, an advantage, ideally, beneficial",
  nice: "Nice to have: a bonus, familiarity or exposure only",
  none: "Not a requirement: a responsibility, a benefit, a description of the company or the team, an application instruction or legal text",
}

async function rows() {
  const out = []
  const filter = sample ? "" : "&requirements=is.null"
  for (let o = 0; out.length < limit; o += 1000) {
    const r = await (await fetch(`${SB_URL}/rest/v1/postings?select=id,title,employer_display,body${filter}&order=id&offset=${o}&limit=1000`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })).json()
    if (!Array.isArray(r)) throw new Error(JSON.stringify(r).slice(0, 300))
    out.push(...r)
    if (r.length < 1000) break
  }
  return out.slice(0, limit)
}

const HEADING = /^(what we.?re looking for|what you.?ll bring|what you bring|about you|your profile|who you are|(preferred |required |minimum |basic |other )?(requirements?|qualifications?)( for the role)?|required knowledge and experience|preferred qualifications.*|required qualifications.*)$/i

const candidates = (body) =>
  (body ?? "")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.replace(/^[\s\-•*·▪◦●–—]+/, "").replace(/^\d{1,2}[.)]\s+/, "").replace(/\s+/g, " ").trim())
    // A heading is not a requirement: "Requirements:", "What we're looking for", "To be successful in this role, you will have:".
    .filter((l) => l.length >= 15 && l.length <= 240 && !/[:：]$/.test(l) && !HEADING.test(l))
    .slice(0, 250)

async function ask(p, lines, tries = 4) {
  const questions = {}
  lines.forEach((line, i) => {
    questions[`l${i}`] = { type: "choice", instructions: `In this job posting, how much does the posting insist on the following line? Line: ${line}`, criteria: TIER }
  })
  const state = `Job title: ${p.title}\nEmployer: ${p.employer_display}\nPosting:\n${(p.body ?? "").slice(0, 6000)}`
  for (let i = 0; i < tries; i++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ state, model: "jev-latest", questions }) })
    if (res.ok) return (await res.json()).answers
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue }
    throw new Error(`Jev ${res.status}: ${await res.text()}`)
  }
  throw new Error("Jev kept failing")
}

async function write(batch) {
  const sql = batch.map(({ id, reqs }) => `update public.postings set requirements = $j$${JSON.stringify(reqs).replace(/\$j\$/g, "")}$j$::jsonb where id = '${id.replace(/'/g, "''")}';`).join("\n")
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds-jev" }, body: JSON.stringify({ query: sql }) })
  if (!r.ok) throw new Error(`write ${r.status} ${(await r.text()).slice(0, 300)}`)
}

const all = await rows()
console.log(`${all.length} postings to read${dry ? " (dry run)" : ""}`)
const saved = []
const counts = { must: 0, strong: 0, optional: 0, nice: 0, none: 0, unsure: 0 }
let done = 0, failed = 0
const pending = []
const flush = async (force = false) => { if (!dry && pending.length >= (force ? 1 : 25)) await write(pending.splice(0, pending.length)) }

async function one(p) {
  try {
    const lines = candidates(p.body).slice(0, MAX_LINES)
    const reqs = []
    if (lines.length) {
      const a = await ask(p, lines)
      lines.forEach((text, i) => {
        const r = a[`l${i}`]
        if (!r || r.confidence < SURE) return void counts.unsure++
        counts[r.choice]++
        if (r.choice !== "none") reqs.push({ text, tier: r.choice })
      })
    }
    if (sample) {
      console.log(`\n== ${p.employer_display}: ${p.title}`)
      reqs.forEach((q) => console.log(`  [${q.tier.padEnd(8)}] ${q.text.slice(0, 110)}`))
      if (!reqs.length) console.log("  (no requirement lines)")
    }
    saved.push({ id: p.id, employer: p.employer_display, title: p.title, requirements: reqs })
    pending.push({ id: p.id, reqs })
    await flush()
  } catch (e) { failed++; if (failed <= 3) console.error(p.id, e.message) }
  if (++done % 100 === 0) console.log(`${done}/${all.length} ${JSON.stringify(counts)} failed ${failed}`)
}
const queue = [...all]
await Promise.all(Array.from({ length: 6 }, async () => { for (let p; (p = queue.shift()); ) await one(p) }))
await flush(true)
if (!sample) {
  const { writeFileSync } = await import("node:fs")
  const file = new URL(`../../career-simulator-data/backend/jev_requirements_${new Date().toISOString().slice(0, 10)}${dry ? "_dry" : ""}.json`, import.meta.url)
  writeFileSync(file, JSON.stringify({ read_at: new Date().toISOString(), model: "jev-latest", sure: SURE, counts, postings: saved }, null, 1))
  console.log(`saved ${saved.length} postings to ${file.pathname}`)
}
console.log(`done ${done}, failed ${failed}, ${JSON.stringify(counts)}`)
