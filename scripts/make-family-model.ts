/**
 * Teaches the app which line of work a CV points to, from the postings themselves. Every posting already carries the job
 * family Jev read from the whole text; this counts which title words and listed skills go with which family and writes
 * src/lib/family-model.json. A CV's job titles, degree and skills are then scored against it (src/lib/field.ts).
 * Plain counting, no model call: the same postings always give the same file. Run it after a new collection:
 *   set -a; . ./.env.local; set +a; bun scripts/make-family-model.ts
 */
import { writeFileSync } from "node:fs"
import { stem, words } from "../src/lib/fit"

const SB = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
if (!SB || !ANON) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY")

interface Row { title: string; title_clean: string | null; family: string | null; skills: string[] | null; closed_at: string | null }
const rows: Row[] = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${SB}/rest/v1/postings?select=title,title_clean,family,skills,closed_at&order=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + 999}` } })
  const part = (await r.json()) as Row[]
  rows.push(...part)
  if (part.length < 1000) break
}
const labelled = rows.filter((r) => r.family && r.family !== "Other")
const families = [...new Set(labelled.map((r) => r.family as string))].sort()
const counts = new Map<string, number[]>()
for (const r of labelled) {
  const f = families.indexOf(r.family as string)
  const tokens = new Set([...words(r.title_clean ?? r.title).map(stem), ...(r.skills ?? []).map((s) => `skill:${s.toLowerCase()}`)])
  for (const t of tokens) {
    const c = counts.get(t) ?? new Array<number>(families.length).fill(0)
    c[f]++
    counts.set(t, c)
  }
}
// A word seen in fewer than three postings says nothing reliable.
const vocab: Record<string, number[]> = {}
for (const [t, c] of counts) if (c.reduce((a, b) => a + b, 0) >= 3) vocab[t] = c
const totals = families.map((_, f) => Object.values(vocab).reduce((n, c) => n + c[f], 0))
writeFileSync(new URL("../src/lib/family-model.json", import.meta.url), JSON.stringify({ families, totals, vocab }))
console.log(`${labelled.length} labelled postings, ${families.length} families, ${Object.keys(vocab).length} words kept`)
