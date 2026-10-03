// Fills postings.title_clean, level_jev, level_conf and usable with TypeSafe Jev.
// Usage: SB_URL=... SB_KEY=<service role> TYPESAFE_API_KEY=... node scripts/jev-fill.mjs [limit] [--dry]
// Keys come from the environment only. Safe to re-run: it rewrites the same four columns.
const { SB_URL, SB_KEY, TYPESAFE_API_KEY: KEY } = process.env
if (!SB_URL || !SB_KEY || !KEY) { console.error("Set SB_URL, SB_KEY and TYPESAFE_API_KEY in the environment."); process.exit(1) }
const limit = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 100000)
const dry = process.argv.includes("--dry")
// Only postings Jev has never read (level_jev empty), so a re-run does not pay for the same postings twice. --rescan reads all of them again.
const rescan = process.argv.includes("--rescan")
const rest = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

const LEVELS = { internship: "An internship, traineeship or working-student job", entry: "A first job, graduate or junior role", mid: "A few years of experience, an individual contributor", senior: "Senior, lead or principal individual contributor", manager: "Manages people or a team", director: "Director, head of or VP", academic: "A PhD, postdoc or professor position" }
const ROLE_NOUN = /\b(manager|analyst|engineer|developer|consultant|accountant|specialist|associate|scientist|designer|director|officer|lead|trainee|advis[eo]r|architect|coordinator|assistant|representative|writer|controller|auditor|researcher|technician|administrator|executive|head|president|intern(ship)?|student|postdoc|professor|phd|recruiter|buyer|planner|underwriter|actuary|lawyer|attorney|strategist|editor|operator|tester|owner|partner)\b/i
/** The title as posted with the noise taken off: "Senior Accountant (m/f/x) - Amsterdam" is "Senior Accountant". */
function clean(title) {
  const t = title.replace(/&amp;/g, "&").replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\b(m\/[fwvx](\/[dxfmw])?|f\/m(\/[dx])?|all genders|h\/f)\b/gi, " ").split(/\s[-–—|:]\s|,|\s\/\s/)[0].replace(/\s+/g, " ").trim()
  return t.length >= 3 && t.split(" ").length <= 6 && ROLE_NOUN.test(t) ? t : null
}

async function all() {
  const rows = []
  for (let o = 0; rows.length < limit; o += 1000) {
    const r = await (await fetch(`${SB_URL}/rest/v1/postings?select=id,title,employer_display,body&order=id&offset=${o}&limit=1000${rescan ? "" : "&level_jev=is.null"}`, { headers: rest })).json()
    rows.push(...r)
    if (r.length < 1000) break
  }
  return rows.slice(0, limit)
}

async function ask(p, tries = 4) {
  const state = `Job title: ${p.title}\nEmployer: ${p.employer_display}\nPosting:\n${(p.body ?? "").slice(0, 2500)}`
  for (let i = 0; i < tries; i++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: "jev-latest", questions: {
        real_title: { type: "noul", instructions: "Is the job title a real role a person would hold, not a company name, a slogan or a fragment?" },
        level: { type: "choice", instructions: "What seniority level is this job?", criteria: LEVELS },
        usable: { type: "noul", instructions: "Does the posting describe a real job with duties or requirements, not just an advert, a list of unrelated links or a few words?" },
      } }),
    })
    if (res.ok) return (await res.json()).answers
    if (res.status === 429 || res.status === 529 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue }
    throw new Error(`Jev ${res.status}: ${await res.text()}`)
  }
  throw new Error("Jev kept failing")
}

const rows = await all()
console.log(`${rows.length} postings${dry ? " (dry run, nothing written)" : ""}`)
let done = 0, failed = 0
const stats = { low: 0, unusable: 0 }
async function one(p) {
  try {
    const a = await ask(p)
    const real = a.real_title.noul
    const patch = { title_clean: real >= 0.8 ? clean(p.title) : null, level_jev: a.level.choice, level_conf: a.level.confidence, usable: a.usable.noul }
    if (patch.usable < 0.5) stats.unusable++
    if (patch.level_conf < 0.7) stats.low++
    if (!dry) {
      const r = await fetch(`${SB_URL}/rest/v1/postings?id=eq.${p.id}`, { method: "PATCH", headers: { ...rest, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(patch) })
      if (!r.ok) throw new Error(`write ${r.status} ${await r.text()}`)
    }
  } catch (e) { failed++; if (failed <= 3) console.error(p.id, e.message) }
  if (++done % 100 === 0) console.log(`${done}/${rows.length}  unusable<0.5: ${stats.unusable}  level conf<0.7: ${stats.low}  failed: ${failed}`)
}
const queue = [...rows]
await Promise.all(Array.from({ length: 8 }, async () => { for (let p; (p = queue.shift()); ) await one(p) }))
console.log(`done ${done}, failed ${failed}, unusable<0.5: ${stats.unusable}, level confidence<0.7: ${stats.low}`)
