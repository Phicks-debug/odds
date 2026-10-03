import { describe, expect, test } from "bun:test"
import { FAMILIES, familyPosterior, fieldMatch, guessFamily } from "@/lib/field"
import { DEFAULT_PROFILE, type Profile } from "@/lib/types"

const profile = (titles: string[], degrees: string[] = []): Profile => ({
  ...DEFAULT_PROFILE,
  positions: titles.map((Title) => ({ Title, "Company Name": "X" })),
  education: degrees.map((d) => ({ "Degree Name": d })),
})

describe("familyPosterior", () => {
  test("is a distribution: non-negative, sums to one", () => {
    const p = familyPosterior(["financial", "analyst"])!
    expect(p).toHaveLength(FAMILIES.length)
    expect(p.every((x) => x >= 0 && x <= 1)).toBe(true)
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })
  test("null when no word is known", () => {
    expect(familyPosterior([])).toBeNull()
    expect(familyPosterior(["zzzqqq", "xxyyzz"])).toBeNull()
  })
  test("is deterministic", () => {
    expect(familyPosterior(["software", "engineer"])).toEqual(familyPosterior(["software", "engineer"]))
  })
})

describe("fieldMatch", () => {
  const fin = profile(["Financial Analyst"], ["MSc Finance"])
  const dev = profile(["Software Engineer"], ["BSc Computer Science"])
  test("a finance CV matches a finance job better than an engineering job, and the reverse", () => {
    expect(fieldMatch(fin, [], "Finance & accounting")!).toBeGreaterThan(fieldMatch(fin, [], "Software engineering")!)
    expect(fieldMatch(dev, [], "Software engineering")!).toBeGreaterThan(fieldMatch(dev, [], "Finance & accounting")!)
  })
  test("the best match is clearly in its own line of work", () => {
    expect(fieldMatch(fin, [], "Finance & accounting")!).toBeGreaterThan(0.5)
    expect(fieldMatch(dev, [], "Software engineering")!).toBeGreaterThan(0.5)
  })
  test("skills alone point to a line of work", () => {
    const only = profile([])
    expect(fieldMatch(only, ["ifrs", "excel", "audit"], "Finance & accounting")!).toBeGreaterThan(fieldMatch(only, ["ifrs", "excel", "audit"], "Software engineering")!)
  })
  test("adding a skill never lowers the match, whatever it is", () => {
    const only = profile([])
    const have = ["ifrs", "excel"]
    for (const extra of ["python", "react", "docker", "seo", "recruitment", "tableau", "sap"]) {
      for (const fam of FAMILIES) {
        const before = fieldMatch(only, have, fam)
        const after = fieldMatch(only, [...have, extra], fam)
        if (before !== null) expect(after!).toBeGreaterThanOrEqual(before - 1e-12)
      }
    }
  })
  test("null when the job has no family, an unknown family, or the CV has nothing to read", () => {
    expect(fieldMatch(fin, [], null)).toBeNull()
    expect(fieldMatch(fin, [], undefined)).toBeNull()
    expect(fieldMatch(fin, [], "Underwater basket weaving")).toBeNull()
    expect(fieldMatch(profile([]), [], "Finance & accounting")).toBeNull()
    expect(fieldMatch(profile(["zzzqqq"]), [], "Finance & accounting")).toBeNull()
  })
  test("a seniority word in a title does not change the line of work", () => {
    const a = fieldMatch(profile(["Senior Financial Analyst"]), [], "Finance & accounting")!
    const b = fieldMatch(profile(["Financial Analyst"]), [], "Finance & accounting")!
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })
  test("the order of roles and a missing description make no difference", () => {
    const a = fieldMatch(profile(["Financial Analyst", "Software Engineer"]), [], "Finance & accounting")!
    const b = fieldMatch(profile(["Software Engineer", "Financial Analyst"]), [], "Finance & accounting")!
    expect(a).toBe(b)
  })
  test("a person with two careers matches both", () => {
    const both = profile(["Financial Analyst", "Software Engineer"])
    expect(fieldMatch(both, [], "Finance & accounting")!).toBeGreaterThan(0.5)
    expect(fieldMatch(both, [], "Software engineering")!).toBeGreaterThan(0.5)
  })
})

describe("guessFamily", () => {
  test("a clear finance title and skills point to finance", () => {
    expect(guessFamily("Financial Controller", ["ifrs", "audit"])).toBe("Finance & accounting")
  })
  test("a clear software title points to software", () => {
    expect(guessFamily("Software Engineer", ["react", "typescript"])).toBe("Software engineering")
  })
  test("nothing known, or too unsure, gives no guess rather than a wrong one", () => {
    expect(guessFamily("zzzqqq", [])).toBeNull()
    expect(guessFamily("", [])).toBeNull()
    const g = guessFamily("Intern", [])
    expect(g === null || FAMILIES.includes(g)).toBe(true)
  })
  test("the same job always gets the same guess", () => {
    expect(guessFamily("Data Analyst", ["sql"])).toBe(guessFamily("Data Analyst", ["sql"]))
  })
})
