// Checks posting quality with Jev: is the title a real job title, and what level is it? Reads postings with the public key.
// Usage: TYPESAFE_API_KEY=... node scripts/jev-quality.mjs [sampleSize]    (writes nothing to the database)
import { readFileSync } from "node:fs"
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]))
const key = process.env.TYPESAFE_API_KEY
if (!key) { console.error("Set TYPESAFE_API_KEY in the environment."); process.exit(1) }
const n = Number(process.argv[2] ?? 30)
const rows = await (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/postings?select=id,title,employer_display,level,body&limit=${n}&offset=${Math.floor(Math.random() * 1500)}&order=id`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } })).json()
const LEVELS = { internship: "An internship, traineeship or working-student job", entry: "A first job, graduate or junior role", mid: "A few years of experience, an individual contributor", senior: "Senior, lead or principal individual contributor", manager: "Manages people or a team", director: "Director, head of or VP", academic: "A PhD, postdoc or professor position" }
for (const r of rows) {
  const state = `Job title: ${r.title}\nEmployer: ${r.employer_display}\nPosting:\n${(r.body ?? "").slice(0, 2500)}`
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state, model: "jev-latest", questions: {
      real_title: { type: "noul", instructions: "Is the job title a real role a person would hold, not a company name, a slogan or a fragment?" },
      level: { type: "choice", instructions: "What seniority level is this job?", criteria: LEVELS },
      usable: { type: "noul", instructions: "Does the posting describe a real job with duties or requirements, not just an advert, a list of unrelated links or a few words?" },
    } }),
  })
  const a = (await res.json()).answers ?? {}
  console.log(`${String(a.real_title?.noul).padEnd(5)} ${String(a.usable?.noul).padEnd(5)} ${(a.level?.choice ?? "?").padEnd(16)} (was ${r.level}, ${a.level?.confidence}) ${r.title.slice(0, 60)}`)
}
