// Reads what KIND of first job each active internship/entry posting is, with TypeSafe Jev: internship, working student, traineeship or a regular entry job.
//   SB_URL=... SB_KEY=<anon key> TYPESAFE_API_KEY=... bun scripts/jev-kind.mjs --out kind.json
// Read-only. Keys come from the environment only. A separate step writes postings.role_kind.
const { SB_URL, SB_KEY, TYPESAFE_API_KEY: KEY } = process.env
if (!SB_URL || !SB_KEY || !KEY) { console.error("Set SB_URL, SB_KEY and TYPESAFE_API_KEY."); process.exit(1) }
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }
const rest = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
const KINDS = {
  internship: "An internship (stage): a fixed-term placement for a student, as part of the studies or in a gap, usually with an allowance, not a salary. Includes graduation or thesis internships and graduation projects.",
  working_student: "A working student job (werkstudent, student assistant): part-time paid work, a few days or hours a week, alongside the studies, with no end date set by the studies.",
  traineeship: "A traineeship or management trainee programme: a paid full-time job for a recent graduate with a structured development programme, rotations or training, often 1 to 2 years, at a normal salary.",
  entry_job: "A regular entry-level job: a junior, graduate or associate role that is a normal employment position without a programme or a student placement.",
  other: "None of these: a senior role, a PhD or postdoc position, a volunteer role or something else.",
}
const ids = []
for (let o = 0; ; o += 1000) { const r = await (await fetch(`${SB_URL}/rest/v1/active_internship_entry?select=id&order=id&offset=${o}&limit=1000`, { headers: rest })).json(); ids.push(...r.map((x) => x.id)); if (r.length < 1000) break }
const rows = []
for (let i = 0; i < ids.length; i += 100) {
  const list = ids.slice(i, i + 100).map((x) => `"${x}"`).join(",")
  rows.push(...(await (await fetch(`${SB_URL}/rest/v1/postings?select=id,title,employer_display,body,pay_posted&id=in.(${list})`, { headers: rest })).json()))
}
async function ask(p) {
  const state = `Job title: ${p.title}\nEmployer: ${p.employer_display}\nPay stated: ${p.pay_posted ?? "not stated"}\nPosting:\n${(p.body ?? "").slice(0, 2500)}`
  const questions = { kind: { type: "choice", instructions: "What kind of first job is this? Decide from what the posting says about the contract, the pay, the duration and the programme, not from the title alone: for example a 'trainee' at a hotel paid a small monthly amount for a few months is an internship.", criteria: KINDS } }
  for (let i = 0; i < 4; i++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ state, model: "jev-latest", questions }) })
    if (res.ok) { const j = await res.json(); return { a: j.answers.kind, t: j.usage?.input_tokens ?? 0 } }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue }
    throw new Error(`Jev ${res.status}: ${await res.text()}`)
  }
  throw new Error("Jev kept failing")
}
const out = []; let tokens = 0; const q = [...rows]
await Promise.all(Array.from({ length: 8 }, async () => { for (let p; (p = q.shift()); ) { try { const { a, t } = await ask(p); tokens += t; out.push({ id: p.id, title: p.title, employer: p.employer_display, pay: p.pay_posted, kind: a.choice, conf: a.confidence }) } catch (e) { console.error(p.id, e.message) } } }))
console.log(`${out.length} read, input tokens ${tokens} (~$${((tokens * 42) / 1e9).toFixed(4)})`)
const { writeFileSync } = await import("node:fs")
if (arg("--out")) writeFileSync(arg("--out"), JSON.stringify(out))
