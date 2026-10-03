/**
 * Fills postings.skill_tiers and postings.years_min from postings.requirements, with the same code the job page runs
 * (src/lib/skill-tiers.ts), so the list, the ranking, the dashboard and the job page all compare a CV on the same skills at the same
 * tiers and gate it on the same minimum years. years_min comes from the lines that REQUIRE a number of years: the old value came from
 * any "N years" in the text, which also caught PhD contract lengths and a company's age, and a false minimum is a hard 0% for
 * the person. A posting with no requirement lines at all keeps its old value. The old values are kept in public.postings_years_backup.
 * Run it after every run of scripts/jev-requirements.ts.
 *   set -a; . ./.env.local; set +a; SUPABASE_ACCESS_TOKEN=... bun scripts/make-skill-tiers.ts [--dry]
 */
import { minYearsFor, skillTiersFor } from "../src/lib/skill-tiers"

const REF = "ukpmpyfcnbhngkgbnkxi"
const SB = process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const PAT = process.env.SUPABASE_ACCESS_TOKEN
const dry = process.argv.includes("--dry")
if (!dry && !PAT) throw new Error("Set SUPABASE_ACCESS_TOKEN (or use --dry)")

const rows: Array<{ id: string; body: string | null; years_min: number | null; requirements: Array<{ text: string; tier: string }> | null }> = []
for (let from = 0; ; from += 150) {
  const r = await fetch(`${SB}/rest/v1/postings?select=id,body,years_min,requirements&order=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + 149}` } })
  const part = (await r.json()) as typeof rows
  rows.push(...part)
  if (part.length < 150) break
}
const out = rows.map((r) => ({
  id: r.id,
  tiers: r.body ? skillTiersFor(r.body, r.requirements) : null,
  // undefined: no requirement lines were read, so the old value stays
  years: r.requirements && r.requirements.length > 0 ? minYearsFor(r.requirements) : undefined,
  was: r.years_min,
}))
const changed = out.filter((o) => o.years !== undefined && o.years !== o.was)
const cleared = changed.filter((o) => o.years === null).length
console.log(`years_min: ${changed.length} postings change (${cleared} lose a minimum that no requirement line backs up, ${changed.filter((o) => o.was === null).length} gain one, ${changed.filter((o) => o.years !== null && o.was !== null).length} move)`)
const withTiers = out.filter((o) => o.tiers && Object.keys(o.tiers).length > 0)
const counts: Record<string, number> = {}
for (const o of withTiers) for (const t of Object.values(o.tiers!)) counts[String(t)] = (counts[String(t)] ?? 0) + 1
console.log(`${rows.length} postings; ${rows.filter((r) => r.requirements && r.requirements.length).length} have Jev requirement lines; ${withTiers.length} compare at least one skill. Skill tiers:`, counts)
const mixed = withTiers.filter((o) => new Set(Object.values(o.tiers!).filter(Boolean)).size > 1).length
console.log(`${mixed} postings have skills at more than one tier`)
if (dry) process.exit(0)

async function sql(query: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })
    if (r.ok) return
    // The management API throttles; wait and try again rather than stopping half way.
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt)); continue }
    throw new Error(`write ${r.status} ${(await r.text()).slice(0, 300)}`)
  }
  throw new Error("write kept being throttled")
}
await sql("create table if not exists public.postings_years_backup (id text, years_min int, saved_at timestamptz default now())")
await sql("insert into public.postings_years_backup (id, years_min) select id, years_min from public.postings where not exists (select 1 from public.postings_years_backup)")
for (let i = 0; i < out.length; i += 100) {
  await new Promise((res) => setTimeout(res, 400))
  await sql(out.slice(i, i + 100).map((o) => `update public.postings set skill_tiers = ${o.tiers ? `$j$${JSON.stringify(o.tiers).replace(/\$j\$/g, "")}$j$::jsonb` : "null"}${o.years === undefined ? "" : `, years_min = ${o.years === null ? "null" : o.years}`} where id = '${o.id.replace(/'/g, "''")}'`).join(";\n"))
}
console.log("written")
