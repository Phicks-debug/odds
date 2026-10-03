/** How many "Not yet" (failed hard gate) results change if the hand-read facts replace the stored ones. Usage: bun scripts/audit-gates-impact.ts <audit dir> */
import { computeShares, standing } from "../src/lib/engine"
import { fetchPostings, fetchReference } from "../src/lib/jobs"
import { dedupe } from "../src/lib/sources"
import { STUDENTS } from "./students"
import type { Posting } from "../src/lib/types"

const dir = process.argv[2]
const hand = new Map<string, { degree: string; years: number | null; dutch: string; enrollment: string }>()
for (const f of new Bun.Glob("out/*.json").scanSync({ cwd: dir })) for (const r of JSON.parse(await Bun.file(`${dir}/${f}`).text())) hand.set(r.id, r)

const [raw, ref] = await Promise.all([fetchPostings(), fetchReference()])
const posts = dedupe(raw).jobs
const shares = computeShares(posts)
const patched = (p: Posting): Posting => {
  const h = hand.get(p.id)
  if (!h) return p
  return { ...p, degree_asked: h.degree === "none" ? null : (h.degree as Posting["degree_asked"]), years_min: h.years, dutch_required: h.dutch === "required", enrollment: h.enrollment as Posting["enrollment"] }
}
let tot = { n: 0, wrongNow: 0, hiddenNow: 0 }
for (const s of STUDENTS) {
  let both = 0, wrong = 0, missed = 0, now = 0
  const byGate: Record<string, number> = {}
  for (const p of posts) {
    const a = standing(p, s.profile, ref, shares)
    const b = standing(patched(p), s.profile, ref, shares)
    const fa = a.failing > 0, fb = b.failing > 0
    if (fa) now++
    if (fa && !fb) { wrong++; for (const g of a.gates) if (g.status === "fail" && b.gates.find((x) => x.name === g.name)?.status !== "fail") byGate[g.name] = (byGate[g.name] ?? 0) + 1 }
    if (!fa && fb) missed++
    if (fa && fb) both++
  }
  console.log(`${s.name.padEnd(48)} "Not yet" now ${String(now).padStart(4)} | wrongly ${String(wrong).padStart(3)} (${(100 * wrong / Math.max(1, now)).toFixed(0)}%) ${JSON.stringify(byGate)} | gate missed ${missed}`)
  tot.n += now; tot.wrongNow += wrong; tot.hiddenNow += missed
}
console.log(`\nall students: ${tot.n} "Not yet" results, ${tot.wrongNow} wrong (${(100 * tot.wrongNow / tot.n).toFixed(1)}%), ${tot.hiddenNow} jobs shown as open that the hand read says are gated`)
