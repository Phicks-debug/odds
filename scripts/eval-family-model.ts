/**
 * How good is the field classifier (src/lib/field.ts) on postings it has not seen? Leave-one-out: each labelled posting is
 * removed from the counts, then its own title words and skills are scored. Reports accuracy, the log loss (lower is better,
 * punishes being confidently wrong) and how sure it says it is against how often it is right, for several damping exponents.
 * The exponent used in field.ts is the one with the lowest log loss here.
 *   set -a; . ./.env.local; set +a; bun scripts/eval-family-model.ts
 */
import { stem, words } from "../src/lib/fit"

const SB = process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
interface Row { title: string; title_clean: string | null; family: string | null; skills: string[] | null }
const rows: Row[] = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${SB}/rest/v1/postings?select=title,title_clean,family,skills&order=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + 999}` } })
  const part = (await r.json()) as Row[]
  rows.push(...part)
  if (part.length < 1000) break
}
const lab = rows.filter((r) => r.family && r.family !== "Other")
const fams = [...new Set(lab.map((r) => r.family as string))].sort()
const toks = (r: Row): string[] => [...new Set([...words(r.title_clean ?? r.title).map(stem), ...(r.skills ?? []).map((s) => `skill:${s.toLowerCase()}`)])]
const counts = new Map<string, number[]>()
for (const r of lab) for (const t of toks(r)) { const c = counts.get(t) ?? new Array(fams.length).fill(0); c[fams.indexOf(r.family!)]++; counts.set(t, c) }
const keep = (c: number[]) => c.reduce((a, b) => a + b, 0) >= 3
const ALPHA = 0.5
for (const mode of ["title only", "title + skills"]) {
  for (const e of [0, 0.25, 0.5, 0.75, 1]) {
    let ok = 0, ll = 0, n = 0
    const bins = Array.from({ length: 5 }, () => ({ n: 0, right: 0, sum: 0 }))
    for (const r of lab) {
      const f = fams.indexOf(r.family!)
      let tk = toks(r)
      if (mode === "title only") tk = tk.filter((t) => !t.startsWith("skill:"))
      // remove this posting's own counts, rebuild the totals without it
      const own = new Set(toks(r))
      const vocabOf = (t: string): number[] | null => { const c = counts.get(t); if (!c) return null; const x = c.slice(); if (own.has(t)) x[f]--; return keep(x) ? x : null }
      const known = tk.filter((t) => vocabOf(t) !== null)
      if (known.length === 0) continue
      const V = [...counts.keys()].filter((t) => vocabOf(t) !== null).length
      const totals = fams.map((_, i) => { let s = 0; for (const t of counts.keys()) { const x = vocabOf(t); if (x) s += x[i] } return s })
      const logits = fams.map((_, i) => known.reduce((s, t) => s + Math.log((vocabOf(t)![i] + ALPHA) / (totals[i] + ALPHA * V)), 0) / known.length ** e)
      const top = Math.max(...logits), ex = logits.map((l) => Math.exp(l - top)), sum = ex.reduce((a, b) => a + b, 0), p = ex.map((x) => x / sum)
      n++; if (p.indexOf(Math.max(...p)) === f) ok++
      ll += -Math.log(Math.max(p[f], 1e-6))
      const conf = Math.max(...p), b = Math.min(4, Math.floor(conf * 5)); bins[b].n++; bins[b].sum += conf; if (p.indexOf(conf) === f) bins[b].right++
    }
    console.log(`${mode.padEnd(15)} damp n^${e}: accuracy ${(100 * ok / n).toFixed(1)}%  log loss ${(ll / n).toFixed(3)}  (n=${n})  sure-vs-right: ${bins.map((b) => (b.n ? `${(100 * b.sum / b.n).toFixed(0)}→${(100 * b.right / b.n).toFixed(0)}` : "-")).join("  ")}`)
  }
}
