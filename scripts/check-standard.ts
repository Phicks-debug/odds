/**
 * Runs the standard vocabulary over every live posting and checks it is consistent:
 *   bun scripts/check-standard.ts
 * Every value on every job must come from the fixed vocabulary, and numbers (years, months, hours) must be in a believable range.
 * Prints how much of what the postings ask for is covered, and the commonest values in each row. Exits 1 on any violation.
 */
import { TIERS, fromJev } from "../src/lib/requirements"
import { VOCABULARY, standardTiers, standardise } from "../src/lib/standard"

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY")
}
interface Row {
  id: string
  usable: number | null
  closed_at: string | null
  requirements: Array<{ text: string; tier: "must" | "strong" | "optional" | "nice" }> | null
}
const rows: Row[] = []
for (let from = 0; ; from += 500) {
  const res = await fetch(`${url}/rest/v1/postings?select=id,usable,closed_at,requirements&order=id`, { headers: { apikey: key, "Range-Unit": "items", Range: `${from}-${from + 499}` } })
  const page = (await res.json()) as Row[]
  rows.push(...page)
  if (page.length < 500) {
    break
  }
}
const live = rows.filter((r) => !r.closed_at && (r.usable == null || r.usable >= 0.5))

const problems: string[] = []
const count: Record<string, Map<string, number>> = {}
const bump = (kind: string, value: string): void => {
  const m = (count[kind] ??= new Map())
  m.set(value, (m.get(value) ?? 0) + 1)
}
let withLines = 0
let withItems = 0
let lines = 0
let unread = 0
for (const row of live) {
  const items = (row.requirements ?? []).filter((i) => i.text && TIERS.includes(i.tier))
  if (items.length === 0) {
    continue
  }
  withLines++
  const reqs = fromJev(items)
  lines += reqs.length
  unread += reqs.filter((r) => standardise([r]).unread > 0).length
  const tiers = standardTiers(reqs, TIERS)
  if (tiers.length > 0) {
    withItems++
  }
  const seen = new Set<string>()
  for (const { std } of tiers) {
    for (const kind of ["skills", "experience", "education", "language", "qualities", "conditions"] as const) {
      for (const v of std[kind]) {
        bump(kind, v)
        if (seen.has(`${kind}:${v}`)) {
          problems.push(`${row.id}: ${kind} "${v}" appears under two tiers`)
        }
        seen.add(`${kind}:${v}`)
        if (kind === "experience") {
          const n = Number(v.match(/^(\d+)(\+|–\d+) years$/)?.[1] ?? NaN)
          if (v !== "Relevant experience" && !(n >= 0 && n <= 30)) {
            problems.push(`${row.id}: experience "${v}" out of range`)
          }
        } else if (kind === "conditions") {
          const months = Number(v.match(/^(\d+) months$/)?.[1] ?? NaN)
          const hours = Number(v.match(/^(\d+) hours a week$/)?.[1] ?? NaN)
          if (Number.isFinite(months) ? !(months >= 1 && months <= 24) : Number.isFinite(hours) ? !(hours >= 8 && hours <= 60) : !VOCABULARY.conditions.includes(v)) {
            problems.push(`${row.id}: condition "${v}" outside the vocabulary or range`)
          }
        } else if (!(VOCABULARY[kind] as string[]).includes(v)) {
          problems.push(`${row.id}: ${kind} "${v}" is not in the vocabulary`)
        }
      }
    }
  }
}
console.log(`${live.length} live postings · ${withLines} have requirement lines · ${withItems} show at least one standard item`)
console.log(`${lines} requirement lines · ${lines - unread} fit the vocabulary (${(((lines - unread) / lines) * 100).toFixed(1)}%) · ${unread} left to the description`)
for (const kind of Object.keys(count)) {
  const top = [...count[kind]].sort((a, b) => b[1] - a[1])
  console.log(`\n${kind}: ${top.length} different values, ${top.reduce((n, [, c]) => n + c, 0)} uses. Commonest: ${top.slice(0, 12).map(([v, c]) => `${v} (${c})`).join(", ")}`)
}
if (problems.length > 0) {
  console.log(`\n✗ ${problems.length} problems`)
  for (const p of problems.slice(0, 20)) {
    console.log("  ", p)
  }
  process.exit(1)
}
console.log("\nOK: every value on every live posting is in the vocabulary and in range.")
