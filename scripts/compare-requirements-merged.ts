/**
 * Grades Jev against the merged answer key (postings, their candidate lines, the key's tier for each). Same measures as
 * compare-requirements.ts, split by the two samples (the one the instructions were tuned on and the one held out).
 *   bun scripts/compare-requirements-merged.ts <merged.json> <jev result.json> [--show N]
 */
import { readFileSync } from "node:fs"
const merged = JSON.parse(readFileSync(process.argv[2], "utf8")) as Array<{ id: string; employer: string; set: string; lines: Array<{ text: string; section: string | null }>; tiers: string[]; ambiguous: number[] }>
const jev = new Map((JSON.parse(readFileSync(process.argv[3], "utf8")) as Array<{ id: string; lines: Array<{ text: string; tier: string; confidence: number }> }>).map((r) => [r.id, r.lines]))
const show = Number(process.argv[process.argv.indexOf("--show") + 1] || 0) || 0
const TIERS = ["must", "strong", "optional", "nice", "none"]
const pct = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a")
const soft = (t: string): boolean => ["strong", "optional", "nice"].includes(t)
for (const set of ["gold", "gold2", "all"]) {
  const M: Record<string, Record<string, number>> = Object.fromEntries(TIERS.map((a) => [a, Object.fromEntries(TIERS.map((b) => [b, 0]))]))
  let n = 0, ok = 0, nA = 0, okA = 0, missing = 0; const wrong: string[] = []
  for (const p of merged) {
    if (set !== "all" && p.set !== set) continue
    const by = new Map((jev.get(p.id) ?? []).map((l) => [l.text, l]))
    p.lines.forEach((l, i) => {
      const j = by.get(l.text); if (!j) { missing++; return }
      const g = p.tiers[i]; M[g][j.tier]++; n++; if (g === j.tier) ok++
      if (!p.ambiguous.includes(i)) { nA++; if (g === j.tier) okA++ }
      if (g !== j.tier) wrong.push(`[key ${g} | jev ${j.tier} ${j.confidence.toFixed(2)}] ${p.employer.slice(0, 14)} :: ${(l.section ?? "-").slice(0, 30)} :: ${l.text.slice(0, 100)}`)
    })
  }
  let tp = 0, fp = 0, fn = 0; for (const a of TIERS) for (const b of TIERS) { if (a !== "none" && b !== "none") tp += M[a][b]; if (a === "none" && b !== "none") fp += M[a][b]; if (a !== "none" && b === "none") fn += M[a][b] }
  let sT = 0, sH = 0; for (const a of TIERS.filter(soft)) for (const b of TIERS) { sT += M[a][b]; if (a === b) sH += M[a][b] }
  console.log(`\n== ${set}: ${pct(ok, n)} of ${n} lines agree (${pct(okA, nA)} without the key's ambiguous lines; ${missing} lines Jev did not return)`)
  console.log(`   requirement or not: precision ${pct(tp, tp + fp)}, recall ${pct(tp, tp + fn)} | key's soft lines ${sT}: exact tier ${pct(sH, sT)} | must recall ${pct(M.must.must, TIERS.reduce((s, b) => s + M.must[b], 0))}`)
  if (set === "all") {
    console.log("   rows = key, columns = Jev:   " + TIERS.map((t) => t.padStart(8)).join(""))
    for (const a of TIERS) console.log("   " + a.padEnd(26) + TIERS.map((b) => String(M[a][b]).padStart(8)).join(""))
    wrong.slice(0, show).forEach((w) => console.log("     " + w))
  }
}
