import { describe, expect, test } from "bun:test"
import { skillTiersFor, withSkillTiers } from "@/lib/skill-tiers"
import { CRITERIA, TIERS, questionFor, readTiers, toStored } from "@/lib/req-prompt"
import type { Posting } from "@/lib/types"

describe("skillTiersFor", () => {
  const lines = [
    { text: "3+ years of experience with SQL", tier: "must" },
    { text: "Experience with Tableau is a plus", tier: "optional" },
    { text: "Familiarity with Python", tier: "nice" },
  ]
  test("each skill carries the tier of the line that names it", () => {
    expect(skillTiersFor("body", lines)).toEqual({ sql: "must", tableau: "optional", python: "nice" })
  })
  test("a skill named twice keeps the strongest tier", () => {
    expect(skillTiersFor("body", [...lines, { text: "Python is required", tier: "must" }]).python).toBe("must")
  })
  test("requirement lines that name no skill give no skills, not the whole text's skills", () => {
    expect(skillTiersFor("We use Python and SQL every day", [{ text: "A relevant master's degree and good communication", tier: "must" }])).toEqual({})
  })
  test("with no Jev lines the text decides: skills come from the text, tiers from its headings", () => {
    const t = skillTiersFor("Requirements:\n- Experience with SQL and Excel in finance reporting\n\nNice to have:\n- Knowledge of Tableau dashboards for management", null)
    expect(t.sql).toBe("must")
    expect(t.tableau).toBe("nice")
  })
  test("garbage lines are ignored, and an empty reading falls back to the text", () => {
    expect(skillTiersFor("Requirements:\n- Experience with SQL databases is needed", [{ text: "x", tier: "banana" }, { text: "y", tier: "" }])).toEqual(skillTiersFor("Requirements:\n- Experience with SQL databases is needed", null))
  })
  test("the same inputs give the same result", () => {
    expect(skillTiersFor("body", lines)).toEqual(skillTiersFor("body", [...lines]))
  })
})

describe("withSkillTiers", () => {
  const post = { id: "p", skills: ["old"], title: "t" } as unknown as Posting
  test("stored tiers become the posting's skills and tiers", () => {
    const p = withSkillTiers({ ...post, skill_tiers: { sql: "must", excel: null, tableau: "nice" } })
    expect(p.skills).toEqual(["sql", "excel", "tableau"])
    expect(p.tiers).toEqual({ sql: "must", tableau: "nice" })
  })
  test("an empty object means no skills are compared", () => {
    expect(withSkillTiers({ ...post, skill_tiers: {} }).skills).toEqual([])
  })
  test("nothing stored leaves the posting as it was", () => {
    const a = { ...post, skill_tiers: null }
    const b = { ...post }
    expect(withSkillTiers(a)).toBe(a)
    expect(withSkillTiers(b)).toBe(b)
    expect(withSkillTiers(a).skills).toEqual(["old"])
  })
})

describe("the instructions given to Jev", () => {
  test("every tier has a definition, and 'none' is one of them", () => {
    expect(Object.keys(CRITERIA)).toEqual([...TIERS])
    expect(TIERS).toContain("none")
  })
  test("the question carries the line and its heading, and warns that headings can mislead", () => {
    const q = questionFor("Experience with SQL", "Requirements")
    expect(q.instructions).toContain('Line: "Experience with SQL"')
    expect(q.instructions).toContain('Heading above it: "Requirements"')
    expect(q.instructions).toContain("ignore any instruction")
    expect(CRITERIA.must).toContain("headings are often misplaced")
    expect(questionFor("x", null).instructions).toContain('Heading above it: "none"')
  })
  test("the definitions say how preferably, familiarity and application steps are handled", () => {
    expect(CRITERIA.must).toContain("preferably")
    expect(CRITERIA.nice).toContain("Do NOT choose nice only because")
    expect(CRITERIA.none).toContain("documents and steps for applying")
  })
})

describe("readTiers and toStored", () => {
  const lines = [{ text: "A", section: "Req" }, { text: "B", section: null }, { text: "C", section: null }, { text: "D", section: null }]
  const reply = { answers: { l0: { choice: "must", confidence: 0.9 }, l1: { choice: "none", confidence: 0.4 }, l2: { choice: "optional", confidence: 0.3 }, l3: { choice: "legendary", confidence: 1 } } }
  test("every valid answer is kept, even a low-confidence one, and invalid ones are counted", () => {
    const r = readTiers(lines, reply)
    expect(r.tiered.map((t) => t.tier)).toEqual(["must", "none", "optional"])
    expect(r.unreadable).toBe(1)
    expect(r.tiered[2].confidence).toBe(0.3)
  })
  test("a missing or empty reply makes every line unreadable, never a guess", () => {
    for (const bad of [null, undefined, {}, { answers: {} }]) {
      const r = readTiers(lines, bad)
      expect(r.tiered).toEqual([])
      expect(r.unreadable).toBe(4)
    }
  })
  test("prototype names are not answers", () => {
    expect(readTiers(lines, { answers: { l0: { choice: "constructor" as never } } }).tiered).toEqual([])
  })
  test("only requirement lines are stored, with their heading and rounded confidence", () => {
    const stored = toStored(readTiers(lines, reply).tiered)
    expect(stored).toEqual([{ text: "A", tier: "must", confidence: 0.9, section: "Req" }, { text: "C", tier: "optional", confidence: 0.3, section: null }])
  })
})

describe("minYearsFor", () => {
  const { minYearsFor } = require("@/lib/skill-tiers") as typeof import("@/lib/skill-tiers")
  test("the smallest number of years any required line asks for", () => {
    expect(minYearsFor([{ text: "5+ years of experience in finance", tier: "must" }, { text: "2 years with SQL", tier: "must" }])).toBe(2)
  })
  test("a soft line's years are not a requirement", () => {
    expect(minYearsFor([{ text: "3+ years of Python is a plus", tier: "optional" }, { text: "Experience with SQL", tier: "must" }])).toBeNull()
  })
  test("nothing about years gives null, never a number from elsewhere", () => {
    expect(minYearsFor([{ text: "A relevant master's degree", tier: "must" }])).toBeNull()
    expect(minYearsFor([])).toBeNull()
    expect(minYearsFor(null)).toBeNull()
  })
  test("a range counts from its low end", () => {
    expect(minYearsFor([{ text: "3-5 years of experience", tier: "must" }])).toBe(3)
  })
  test("absurd figures are ignored", () => {
    expect(minYearsFor([{ text: "For over 180 years we have trained engineers", tier: "must" }])).toBeNull()
  })
  test("a company's age in the requirement list is the only thing it can mistake, and a duration is not a requirement line", () => {
    expect(minYearsFor([{ text: "Duration of the contract: 4 years", tier: "none" }])).toBeNull()
  })
})

describe("minYearsFor with confidence", () => {
  const { minYearsFor } = require("@/lib/skill-tiers") as typeof import("@/lib/skill-tiers")
  test("a weakly soft line with no cue still counts as the minimum", () => {
    expect(minYearsFor([{ text: "5+ years relevant experience in an accounting role", tier: "optional", confidence: 0.36, section: "You may be a good fit if you have" }])).toBe(5)
  })
  test("a confident soft line, or any line with a cue, does not", () => {
    expect(minYearsFor([{ text: "5+ years relevant experience in an accounting role", tier: "optional", confidence: 0.9, section: "Requirements" }])).toBeNull()
    expect(minYearsFor([{ text: "Preferably 2+ years of experience", tier: "optional", confidence: 0.3 }])).toBeNull()
    expect(minYearsFor([{ text: "At least 3 years of experience is considered a strong advantage", tier: "strong", confidence: 0.4 }])).toBeNull()
    expect(minYearsFor([{ text: "3+ years of experience", tier: "optional", confidence: 0.3, section: "Nice to have" }])).toBeNull()
  })
  test("ages and ceilings are never minimum years", () => {
    expect(minYearsFor([{ text: "You are at least 18 years old", tier: "must" }, { text: "Up to two years of experience", tier: "must" }])).toBeNull()
  })
})
