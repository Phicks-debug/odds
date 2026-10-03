/**
 * Dry run of the open/closed check against the live job boards, without writing anything:
 *   bun scripts/check-open.ts
 * Prints, per ATS, how many postings are open, closed or unknown, and lists the closed ones so they can be spot-checked by hand.
 */
import { CHECKED, checkRows, type Row } from "../supabase/functions/_shared/ats-check"

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY")
}
const rows: Row[] = []
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${url}/rest/v1/postings?select=id,ats,employer,title,url&order=id`, { headers: { apikey: key, "Range-Unit": "items", Range: `${from}-${from + 999}` } })
  const page = (await res.json()) as Row[]
  rows.push(...page)
  if (page.length < 1000) {
    break
  }
}
const todo = rows.filter((r) => CHECKED.includes(r.ats))
const started = Date.now()
const verdicts = await checkRows(todo)
const table = new Map<string, Record<string, number>>()
for (const r of todo) {
  const t = table.get(r.ats) ?? { open: 0, closed: 0, unknown: 0 }
  t[verdicts.get(r.id) ?? "unknown"]++
  table.set(r.ats, t)
}
console.log(`${todo.length} postings in ${((Date.now() - started) / 1000).toFixed(0)}s`)
console.table(Object.fromEntries(table))
for (const r of todo) {
  const v = verdicts.get(r.id)
  if (v !== "open") {
    console.log(v, r.ats, r.employer, "|", r.title, "|", r.url ?? "(no link)")
  }
}
