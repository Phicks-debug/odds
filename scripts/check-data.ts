/**
 * Reads every table the app depends on, straight from the database, and runs the
 * app's own calculations over every row. Run it after changing the data:
 *   bun scripts/check-data.ts
 * It lists what would break or show "NaN" on the page: missing or non-numeric
 * figures, categories the app does not know, rows that make a calculation throw.
 */
import { computeShares, derive, levelOf, standing, NO_WHAT_IF } from "../src/lib/engine"
import { EXAMPLE_PROFILE } from "../src/lib/example"
import { industryOf } from "../src/lib/industries"
import { fetchPostings, fetchReference } from "../src/lib/jobs"
import { ladderStats } from "../src/lib/ladder"
import { payOf } from "../src/lib/spec"
import type { Profile } from "../src/lib/types"

const problems = new Map<string, string[]>()
const flag = (kind: string, detail: string): void => {
  const list = problems.get(kind) ?? []
  if (list.length < 5) {
    list.push(detail)
  } else if (list.length === 5) {
    list.push("…")
  }
  problems.set(kind, list)
}
const finite = (x: unknown): boolean => typeof x === "number" && Number.isFinite(x)

const [posts, ref] = await Promise.all([fetchPostings(), fetchReference()])
console.log(`${posts.length} postings, ${Object.keys(ref.bands).length} pay bands, ${Object.keys(ref.transitions).length} career-move tables, ${Object.keys(ref.ageFactors).length} age-factor sectors`)

// Reference tables
for (const b of Object.values(ref.bands)) {
  for (const k of ["p25_hourly", "p50_hourly", "p75_hourly"] as const) {
    if (!finite(Number(b[k])) || Number(b[k]) <= 0) {
      flag("pay band figure missing or not a number", `${b.code} ${k}=${String(b[k])}`)
    }
  }
  if (!(Number(b.p25_hourly) <= Number(b.p50_hourly) && Number(b.p50_hourly) <= Number(b.p75_hourly))) {
    flag("pay band quartiles out of order", b.code)
  }
  if (b.cagr_2019_2024 !== null && !finite(Number(b.cagr_2019_2024))) {
    flag("pay growth not a number", b.code)
  }
}
const tax = ref.tax
for (const [name, ok] of [
  ["tax brackets", Array.isArray(tax?.box1_brackets) && tax.box1_brackets.length > 0],
  ["general tax credit", finite(tax?.general_tax_credit?.max)],
  ["labour tax credit", finite(tax?.labour_tax_credit?.max)],
  ["30% ruling", finite(tax?.ruling_30pct?.min_salary) && finite(tax?.ruling_30pct?.rate_2026)],
  ["IND thresholds", finite(tax?.ind_hsm_thresholds_h2_2026_monthly_excl_holiday?.age_30_plus)],
  ["health insurance premium", finite(tax?.health_insurance_2026?.average_premium_month)],
] as const) {
  if (!ok) {
    flag("tax parameters incomplete", name)
  }
}
for (const t of Object.values(ref.transitions)) {
  if (!finite(t.with_next) || t.with_next <= 0 || !finite(t.tenure_q_median) || !Array.isArray(t.top)) {
    flag("career-move table incomplete", t.title)
  }
}

// Every posting through the app's calculations
const known = new Set(["finance_business", "tech", "other"])
const profile: Profile = { ...(EXAMPLE_PROFILE as Profile) }
const shares = computeShares(posts)
const ids = new Set<string>()
for (const p of posts) {
  if (ids.has(p.id)) {
    flag("duplicate posting id", p.id)
  }
  ids.add(p.id)
  if (!known.has(p.cat)) {
    flag("category the app does not know (shown as Other)", `${p.id}: ${p.cat}`)
  }
  if (!p.title || !p.employer_display) {
    flag("posting without a title or employer", p.id)
  }
  if (p.cbs_group && !ref.bands[p.cbs_group]) {
    flag("posting points at a pay band that is not in the bands table", `${p.id}: ${p.cbs_group}`)
  }
  try {
    levelOf(p)
    industryOf(p)
    const pay = payOf(p, ref)
    if (pay.text && /NaN|undefined|Infinity/.test(pay.text)) {
      flag("pay text broken", `${p.id}: ${pay.text}`)
    }
    const st = standing(p, derive(profile) && profile, ref, shares, NO_WHAT_IF, false)
    if (st.rate && (!finite(st.rate.low) || !finite(st.rate.high) || st.rate.low > st.rate.high)) {
      flag("interview chance broken", `${p.id}: ${st.rate.low}–${st.rate.high}`)
    }
  } catch (e) {
    flag("a calculation throws on this posting", `${p.id}: ${(e as Error).message}`)
  }
}
const ladder = ladderStats(posts)
console.log("ladder:", ladder.map((r) => `${r.level} ${r.years ?? "–"}y ${r.pay ?? "–"} (${r.open})`).join(" · "))

if (problems.size === 0) {
  console.log("OK: nothing that would break the pages.")
} else {
  for (const [kind, list] of problems) {
    console.log(`\n✗ ${kind}`)
    for (const l of list) {
      console.log(`    ${l}`)
    }
  }
  process.exit(1)
}
