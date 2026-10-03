// Reads which occupation group (the CBS pay band) each posting belongs to, with TypeSafe Jev, from the title and the start of the text.
// Pilot:  SB_URL=... SB_KEY=<anon key> TYPESAFE_API_KEY=... bun scripts/jev-occupation.mjs --sample 60
// Keys come from the environment only. Nothing is written without --write (which needs SUPABASE_ACCESS_TOKEN).
const { SB_URL, SB_KEY, TYPESAFE_API_KEY: KEY, SUPABASE_ACCESS_TOKEN: PAT } = process.env
if (!SB_URL || !SB_KEY || !KEY) { console.error("Set SB_URL, SB_KEY and TYPESAFE_API_KEY."); process.exit(1) }
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }
const sample = Number(arg("--sample") ?? 0)
const write = process.argv.includes("--write")
const outFile = arg("--out")
const SURE = 0.8
const rest = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
const bands = await (await fetch(`${SB_URL}/rest/v1/cbs_bands?select=code,label`, { headers: rest })).json()
const criteria = Object.fromEntries(bands.map((b) => [b.code, b.label]))
criteria.none = "None of these describes the job"
const rows = []
for (let o = 0; ; o += 1000) {
  const r = await (await fetch(`${SB_URL}/rest/v1/postings?select=id,title,employer_display,body,cbs_group&closed_at=is.null&order=id&offset=${o}&limit=1000`, { headers: rest })).json()
  rows.push(...r)
  if (r.length < 1000) break
}
let pick = rows
if (sample) { let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; pick = [...rows].sort(() => rnd() - 0.5).slice(0, sample) }
async function ask(p) {
  const state = `Job title: ${p.title}\nEmployer: ${p.employer_display}\nPosting:\n${(p.body ?? "").slice(0, 1800)}`
  const questions = { occupation: { type: "choice", instructions: "Which occupation group does the person in this job belong to? Decide by the work they do (the duties), not by the employer's industry or the seniority in the title. An intern or working student belongs to the group of the work they assist with.", criteria } }
  for (let i = 0; i < 4; i++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ state, model: "jev-latest", questions }) })
    if (res.ok) { const j = await res.json(); return { a: j.answers.occupation, tokens: j.usage?.input_tokens ?? 0 } }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue }
    throw new Error(`Jev ${res.status}: ${await res.text()}`)
  }
  throw new Error("Jev kept failing")
}
const out = []; let tokens = 0
const queue = [...pick]
await Promise.all(Array.from({ length: 8 }, async () => { for (let p; (p = queue.shift()); ) { try { const { a, tokens: t } = await ask(p); tokens += t; out.push({ p, code: a.choice, conf: a.confidence }) } catch (e) { console.error(p.id, e.message) } } }))
const lab = (c) => (c && c !== "none" ? `${c} ${String(criteria[c] ?? "").slice(0, 30)}` : "none")
let same = 0, diff = 0, low = 0
const lines = []
for (const { p, code, conf } of out) {
  const sure = conf >= SURE && code !== "none"
  if (!sure) low++
  const now = p.cbs_group ?? null, next = sure ? code : null
  if (now === next) same++; else { diff++; lines.push(`${p.title.slice(0, 44).padEnd(44)} | now ${lab(now).padEnd(34)} | jev ${lab(next).padEnd(34)} ${conf.toFixed(2)}`) }
}
console.log(`${out.length} read, same ${same}, different ${diff}, Jev not sure ${low}, input tokens ${tokens} (~$${((tokens * 42) / 1e9).toFixed(4)})`)
if (sample) console.log(lines.slice(0, 60).join("\n"))
if (outFile) { const { writeFileSync } = await import("node:fs"); writeFileSync(outFile, JSON.stringify(out.map(({ p, code, conf }) => ({ id: p.id, title: p.title, now: p.cbs_group ?? null, jev: code, conf })))) }
if (write) {
  if (!PAT) throw new Error("--write needs SUPABASE_ACCESS_TOKEN")
  const REF = SB_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1]
  const sets = out.filter(({ code, conf }) => conf >= SURE && code !== "none").map(({ p, code }) => `('${p.id}','${code}')`)
  for (let i = 0; i < sets.length; i += 200) {
    const sql = `update public.postings p set cbs_group = v.c from (values ${sets.slice(i, i + 200).join(",")}) as v(id,c) where p.id = v.id;`
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query: sql }) })
    if (!r.ok) throw new Error(`write ${r.status} ${await r.text()}`)
  }
  console.log(`wrote ${sets.length}`)
}
