import { describe, expect, test } from "bun:test"
import { personDetails } from "../../supabase/functions/_shared/people"
import { migratePeople, migrateProfile } from "@/lib/people-migrate"
import { readPast } from "@/lib/suggest"
import { DEFAULT_PROFILE, RELATIONSHIPS, type Person } from "@/lib/types"

const person = (relationship: string, over: Partial<Person> = {}): Person => ({ id: "1", name: "A", company: "X", jobId: null, relationship: relationship as never, status: "To contact", contact: "", notes: "", ...over })

describe("what the search found about a person", () => {
  test("positions and About text come through, cut to a safe size", () => {
    const d = personDetails({ summary: "  Enjoys creating   business value\nfrom data  ", currentPositions: [{ title: "Senior Data Analyst", companyName: "Adyen", startedOn: { month: 10, year: 2026 } }] })
    expect(d.about).toBe("Enjoys creating business value from data")
    expect(d.positions).toEqual([{ title: "Senior Data Analyst", company: "Adyen", since: "Oct 2026" }])
    expect(personDetails({ summary: "x".repeat(5000) }).about).toHaveLength(600)
  })
  test("only three positions, only ones with a title, a year alone is fine", () => {
    const d = personDetails({ currentPositions: [{ title: "A", companyName: "X", startedOn: { year: 2020 } }, { companyName: "no title" }, { title: "B" }, { title: "C" }, { title: "D" }] })
    expect(d.positions.map((p) => p.title)).toEqual(["A", "B", "C"])
    expect(d.positions[0].since).toBe("2020")
    expect(d.positions[1].since).toBeUndefined()
  })
  test("missing, odd or hostile input gives nothing and never throws", () => {
    for (const bad of [{}, { summary: 5, currentPositions: "no" }, { currentPositions: [null, 3, "x", {}] }, { currentPositions: [{ title: "A", startedOn: { month: 99, year: -1 } }] }]) {
      const d = personDetails(bad as never)
      expect(typeof d.about).toBe("string")
      expect(Array.isArray(d.positions)).toBe(true)
    }
    expect(personDetails({ currentPositions: [{ title: "A", startedOn: { month: 99, year: 2020 } }] }).positions[0].since).toBe("2020")
  })
  test("details survive a trip through a saved search", () => {
    const saved = { at: "2026-10-03T10:00:00Z", pool: [{ name: "A", headline: "Analyst", place: "Utrecht", url: "https://www.linkedin.com/in/a", about: "About me", positions: [{ title: "Analyst", company: "Adyen" }] }], shown: 1, page: 1, more: false, src: "stored" }
    const out = readPast(JSON.parse(JSON.stringify(saved)))!
    expect(out.pool[0].about).toBe("About me")
    expect(out.pool[0].positions).toEqual([{ title: "Analyst", company: "Adyen" }])
  })
})

describe("'Other' is no longer a way to know someone", () => {
  test("it is not offered", () => {
    expect(RELATIONSHIPS).not.toContain("Other" as never)
    expect(RELATIONSHIPS).toContain("Colleague")
  })
  test("people saved as Other become Colleague, everyone else is untouched", () => {
    const out = migratePeople([person("Other"), person("Referral", { id: "2" }), person("Recruiter", { id: "3" })])!
    expect(out.map((p) => p.relationship)).toEqual(["Colleague", "Referral", "Recruiter"])
  })
  test("a Colleague never counts as a referral, so migrating cannot raise an interview chance", () => {
    const profile = migrateProfile({ ...DEFAULT_PROFILE, people: [person("Other", { jobId: "job1" })] })
    expect(profile.people!.filter((p) => p.relationship === "Referral")).toHaveLength(0)
  })
  test("the migration is safe to run again and does not change a profile with no people", () => {
    const once = migrateProfile({ ...DEFAULT_PROFILE, people: [person("Other")] })
    expect(migrateProfile(once)).toEqual(once)
    expect(migrateProfile(DEFAULT_PROFILE)).toEqual(DEFAULT_PROFILE)
  })
})
