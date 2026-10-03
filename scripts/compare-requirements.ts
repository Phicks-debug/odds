/**
 * Grades Jev's requirement tiers against an answer key of real postings read line by line.
 *   bun scripts/compare-requirements.ts <gold dir> <jev result.json> [--show N]
 * <gold dir> holds sample.json (the postings and their candidate lines), gold_0..7.json (the key) and optionally gold_overlap.json
 * (a second, independent reading of some postings, to show how steady the key itself is). Prints agreement by tier, the confusion
 * matrix, and the disagreements on soft tiers, where the app's behaviour changes most.
 */
import { readFileSync, existsSync } from "node:fs"

const dir = process.argv[2]
const jevFile = process.argv[3]
const show = Number(process.argv[process.argv.indexOf("--show") + 1] || 0) || 0
const TIERS = ["must", "strong", "optional", "nice", "none"] as const
const sample = JSON.parse(readFileSync(`${dir}/sample.json`, "utf8")) as Array<{ id: string; employer: string; title: string; lines: Array<{ text: string; section: string | null }> }>
const gold = new Map<string, { tiers: string[]; ambiguous: number[] }>()
for (let k = 0; existsSync(`${dir}/gold_${k}.json`); k++) for (const g of JSON.parse(readFileSync(`${dir}/gold_${k}.json`, "utf8")) as Array<{ id: string; tiers: string[]; ambiguous?: number[] }>) gold.set(g.id, { tiers: g.tiers, ambiguous: g.ambiguous ?? [] })
const matrix = (): Record<string, Record<string, number>> => Object.fromEntries(TIERS.map((a) => [a, Object.fromEntries(TIERS.map((b) => [b, 0]))]))
const pct = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a")

// 1. How steady is the key itself?
if (existsSync(`${dir}/gold_overlap.json`)) {
  const m = matrix(); let n = 0, same = 0
  for (const g2 of JSON.parse(readFileSync(`${dir}/gold_overlap.json`, "utf8")) as Array<{ id: string; tiers: string[] }>) {
    const g1 = gold.get(g2.id); if (!g1) continue
    g2.tiers.forEach((t, i) => { n++; if (t === g1.tiers[i]) same++; if (m[g1.tiers[i]]?.[t] !== undefined) m[g1.tiers[i]][t]++ })
  }
  console.log(`THE KEY AGAINST ITSELF (two independent readings of the same ${n} lines): ${pct(same, n)} agree`)
  const soft = (t: string) => ["strong", "optional", "nice"].includes(t)
  let sg = 0, sa = 0; for (const a of TIERS) for (const b of TIERS) { if (soft(a) || soft(b)) { sg += m[a][b]; if (a === b) sa += m[a][b] } }
  console.log(`  on lines where either reading says soft (strong/optional/nice): ${pct(sa, sg)} agree (${sg} lines)\n`)
}

// 2. Jev against the key
const jev = new Map<string, Array<{ text: string; tier: string; confidence: number }>>()
for (const r of JSON.parse(readFileSync(jevFile, "utf8")) as Array<{ id: string; lines: Array<{ text: string; tier: string; confidence: number }> }>) jev.set(r.id, r.lines)
const M = matrix(); let n = 0, ok = 0, nA = 0, okA = 0; const wrong: string[] = []
for (const p of sample) {
  const g = gold.get(p.id); const j = jev.get(p.id); if (!g || !j) continue
  const byText = new Map(j.map((l) => [l.text, l]))
  p.lines.forEach((l, i) => {
    const jl = byText.get(l.text); if (!jl) return
    const gt = g.tiers[i]; if (!gt) return
    M[gt][jl.tier]++; n++; if (gt === jl.tier) ok++
    if (!g.ambiguous.includes(i)) { nA++; if (gt === jl.tier) okA++ }
    if (gt !== jl.tier && (["strong", "optional", "nice"].includes(gt) || ["strong", "optional", "nice"].includes(jl.tier))) wrong.push(`[key ${gt} | jev ${jl.tier} ${jl.confidence.toFixed(2)}] ${p.employer.slice(0, 16)} :: ${l.section ?? "-"} :: ${l.text.slice(0, 100)}`)
  })
}
console.log(`JEV AGAINST THE KEY: ${pct(ok, n)} of ${n} lines agree (${pct(okA, nA)} excluding the ${n - nA} lines the key marks ambiguous)`)
console.log("rows = key, columns = Jev")
console.log("            " + TIERS.map((t) => t.padStart(9)).join(""))
for (const a of TIERS) console.log(a.padEnd(12) + TIERS.map((b) => String(M[a][b]).padStart(9)).join("") + `   recall ${pct(M[a][a], TIERS.reduce((s, b) => s + M[a][b], 0))}`)
const isReq = (t: string) => t !== "none"
let tp = 0, fp = 0, fn = 0; for (const a of TIERS) for (const b of TIERS) { if (isReq(a) && isReq(b)) tp += M[a][b]; if (!isReq(a) && isReq(b)) fp += M[a][b]; if (isReq(a) && !isReq(b)) fn += M[a][b] }
console.log(`is it a requirement at all (anything but 'none'): precision ${pct(tp, tp + fp)}, recall ${pct(tp, tp + fn)}`)
const softTrue = TIERS.filter((t) => t !== "must" && t !== "none"); let sTot = 0, sHit = 0, sAny = 0
for (const a of softTrue) for (const b of TIERS) { sTot += M[a][b]; if (softTrue.includes(b as never)) sAny += M[a][b]; if (a === b) sHit += M[a][b] }
console.log(`soft lines in the key: ${sTot}; Jev calls ${pct(sAny, sTot)} of them soft (some soft tier) and ${pct(sHit, sTot)} the exact same tier`)
console.log(`\nDISAGREEMENTS INVOLVING A SOFT TIER: ${wrong.length}`); wrong.slice(0, show).forEach((w) => console.log("  " + w))
