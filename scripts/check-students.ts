/**
 * Realistic international students and awkward inputs through the whole model, with the right answer written down for each.
 * Not a smoke test: every profile states what a careful person would say about it (its degree level, which gates it
 * must pass or fail, which lines of work its best jobs must be in), and the run says where the model disagrees.
 *   set -a; . ./.env.local; set +a; bun scripts/check-students.ts
 * Run it after any change to the engine, the fit or the data. Exits 1 if any check fails.
 */
import { computeShares, derive, levelOf, standing, NO_WHAT_IF } from "../src/lib/engine"
import { fetchPostings, fetchReference } from "../src/lib/jobs"
import { hasLanguage, requiredLanguages } from "../src/lib/languages"
import { dedupe } from "../src/lib/sources"
import { STUDENTS } from "./students"
import type { Posting } from "../src/lib/types"

let failures = 0
const fail = (who: string, what: string): void => {
  failures++
  console.log(`  ✗ ${who}: ${what}`)
}
const finite = (x: unknown): boolean => typeof x === "number" && Number.isFinite(x)

const [raw, ref] = await Promise.all([fetchPostings(), fetchReference()])
const posts = dedupe(raw).jobs
const shares = computeShares(posts)
const ORDER = { unknown: 0, bachelor: 1, master: 2, phd: 3 } as const

console.log(`${posts.length} jobs. ${STUDENTS.length} students.\n`)
for (const s of STUDENTS) {
  console.log(s.name)
  const d = derive(s.profile)

  // 1. Is the degree read the way a careful person would read it?
  if (d.degree !== s.degree) fail(s.name, `degree read as "${d.degree}", should be "${s.degree}"`)
  // 2. Years of work.
  if (!(d.years >= s.years[0] && d.years <= s.years[1])) fail(s.name, `years of work ${d.years.toFixed(2)}, should be ${s.years[0]} to ${s.years[1]}`)

  // 3. Nothing throws or goes non-finite on any job, and the gates agree with the posting.
  const rows: Array<{ p: Posting; st: ReturnType<typeof standing> }> = []
  let bad = 0
  let degreeWrong = 0
  let dutchWrong = 0
  let yearsWrong = 0
  let studentWrong = 0
  for (const p of posts) {
    try {
      const st = standing(p, s.profile, ref, shares)
      rows.push({ p, st })
      if (st.rate && !(finite(st.rate.low) && finite(st.rate.mid) && finite(st.rate.high) && st.rate.low > 0 && st.rate.high <= 0.54 + 1e-9 && st.rate.low <= st.rate.mid && st.rate.mid <= st.rate.high)) bad++
      if (st.fit && !(finite(st.fit.score) && st.fit.score >= 0 && st.fit.score <= 1)) bad++
      const g = (n: string): string | undefined => st.gates.find((x) => x.name === n)?.status
      // Degree gate against what the posting asks, using the CORRECT degree, not the engine's reading of it.
      if (p.degree_asked) {
        const should = ORDER[s.degree] >= ORDER[p.degree_asked] ? "pass" : "fail"
        if (g("Degree") !== should) degreeWrong++
      }
      if (p.dutch_required) {
        const should = s.profile.dutch === "professional" || s.profile.dutch === "native" ? "pass" : "fail"
        if (g("Dutch") !== should) dutchWrong++
      }
      if (p.years_min != null) {
        const should = d.years >= p.years_min ? "pass" : "fail"
        if (g("Minimum years") !== should) yearsWrong++
      }
      if (s.profile.permit === "eu" && g("Permit") !== "pass") bad++
      // A job that needs a student: the gate must follow what the person is, read independently of the engine.
      const want = s.studying ?? null
      if (p.enrollment === "required") {
        const should = want === true ? "pass" : want === false ? "fail" : "unknown"
        if (g("Student") !== should) studentWrong++
      } else if (p.enrollment !== "recent" && g("Student") !== undefined) studentWrong++
      // A job whose title asks for a language: the gate must say what the profile's own list says.
      const need = requiredLanguages(p.title)
      if (need.length > 0 && g("Language") !== hasLanguage(s.profile.languages, need)) bad++
      if (need.length === 0 && g("Language") !== undefined) bad++
    } catch (e) {
      bad++
      fail(s.name, `threw on "${p.title}": ${(e as Error).message}`)
      break
    }
  }
  if (bad) fail(s.name, `${bad} non-finite or out-of-range figures`)
  if (degreeWrong) fail(s.name, `${degreeWrong} postings where the Degree gate disagrees with the person's real degree (${s.degree})`)
  if (dutchWrong) fail(s.name, `${dutchWrong} postings where the Dutch gate is wrong`)
  if (studentWrong) fail(s.name, `${studentWrong} postings where the Student gate is wrong`)
  if (yearsWrong) fail(s.name, `${yearsWrong} postings where the Minimum years gate is wrong`)

  // 4. Are the best jobs in the right line of work?
  const open = rows.filter((r) => r.st.failing === 0 && r.st.rate).sort((a, b) => b.st.rate!.mid - a.st.rate!.mid)
  const top = open.slice(0, 10)
  if (s.topFamilies && top.length > 0) {
    const inLine = top.filter((r) => r.p.family && s.topFamilies!.includes(r.p.family)).length
    console.log(`    ${open.length} jobs open to them; ${inLine}/10 of the best are in ${s.topFamilies.map((f) => f.split(" ")[0]).join("/")}; best ${(top[0].st.rate!.mid * 100).toFixed(1)}%: ${top[0].p.title.slice(0, 50)}`)
    if (inLine < 7) fail(s.name, `only ${inLine} of the 10 best jobs are in the right line of work`)
  } else {
    console.log(`    ${open.length} jobs open to them${top[0] ? `; best ${(top[0].st.rate!.mid * 100).toFixed(1)}%: ${top[0].p.title.slice(0, 50)}` : ""}`)
  }

  // 5. Level sense: a person with years of work should not be pointed at internships first, and a student should not at directors.
  const seniorTop = top.filter((r) => ["Director"].includes(levelOf(r.p))).length
  if (d.years < 1 && seniorTop > 0) fail(s.name, `${seniorTop} of the best jobs for someone with under a year of work are Director level`)
  if (d.years >= 10 && top.filter((r) => levelOf(r.p) === "Internship").length > 2) fail(s.name, "more than 2 internships among the best jobs for someone with 10+ years")

  // 6. Things that can only help never hurt.
  for (const p of top.slice(0, 3)) {
    const base = standing(p.p, s.profile, ref, shares, NO_WHAT_IF).rate?.mid ?? 0
    for (const [label, w] of [["referral", { ...NO_WHAT_IF, referral: true }], ["dutch", { ...NO_WHAT_IF, dutch: true }], ["tailor", { ...NO_WHAT_IF, tailor: true }]] as const) {
      const after = standing(p.p, s.profile, ref, shares, w as never, label === "referral").rate?.mid ?? 0
      if (after < base - 1e-12) fail(s.name, `${label} lowered the chance on "${p.p.title.slice(0, 40)}": ${(base * 100).toFixed(2)}% to ${(after * 100).toFixed(2)}%`)
    }
  }
}

console.log(failures === 0 ? `\nOK: all ${STUDENTS.length} students behave.` : `\n${failures} problem${failures === 1 ? "" : "s"} found.`)
process.exit(failures === 0 ? 0 : 1)
