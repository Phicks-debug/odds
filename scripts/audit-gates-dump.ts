/** Dumps every active posting with full text and the values each hard gate reads, for the hand check (scripts/audit-gates-*.ts). */
import { supabase } from "../src/lib/supabase"

const cols = "id,employer,title,url,body,degree_asked,degree_asked_raw,years_min,dutch_required,dutch_jev,enrollment,requirements,usable,closed_at"
const all: Array<Record<string, unknown>> = []
for (let from = 0; ; from += 500) {
  let { data, error } = await supabase.from("postings").select(cols).order("id").range(from, from + 499)
  if (error) {
    ;({ data, error } = await supabase.from("postings").select(cols.replace(",degree_asked_raw", "")).order("id").range(from, from + 499))
  }
  if (error) throw new Error(error.message)
  all.push(...((data ?? []) as unknown as Array<Record<string, unknown>>))
  if ((data ?? []).length < 500) break
}
const pool = all.filter((p) => (p.usable == null || (p.usable as number) >= 0.5) && !p.closed_at)
await Bun.write(process.argv[2], JSON.stringify(pool))
const has = (k: string) => pool.filter((p) => p[k] != null && p[k] !== false).length
console.log({ total: all.length, active: pool.length, hasRaw: "degree_asked_raw" in (pool[0] ?? {}), degree: has("degree_asked"), years: has("years_min"), dutch: pool.filter((p) => p.dutch_required || ((p.dutch_jev as number) ?? 0) >= 0.8).length, enrollment: pool.filter((p) => p.enrollment === "required" || p.enrollment === "recent").length, bodyMissing: pool.filter((p) => !p.body).length })
