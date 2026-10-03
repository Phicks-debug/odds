import { describe, expect, test } from "bun:test"
import { candidateLines, isHeading, splitSoft } from "@/lib/req-lines"

const texts = (s: string) => splitSoft(s).map((p) => `${p.soft ?? "hard"}:${p.text}`)

describe("splitSoft", () => {
  test("a line with no soft clause comes back whole, untouched", () => {
    for (const l of ["Bachelor's degree in finance or similar", "5+ years of experience, preferably in fintech", "Strong command of English and Dutch", "Experience with SQL and Python"]) {
      expect(splitSoft(l)).toEqual([{ text: l, soft: null }])
    }
  })
  test("a bracket that is a soft clause comes out", () => {
    expect(texts("Strong command of English (Dutch is a plus)")).toEqual(["hard:Strong command of English", "optional:Dutch is a plus"])
    expect(texts("Support Bazel as the build system (working with Maven is a nice to have)")).toEqual(["hard:Support Bazel as the build system", "nice:working with Maven is a nice to have"])
  })
  test("a bracket that is not a soft clause stays", () => {
    expect(texts("Proficient in a systems language (Rust or C++)")).toEqual(["hard:Proficient in a systems language (Rust or C++)"])
  })
  test("sentences and semicolons are split, and only the soft one is soft", () => {
    expect(texts("Has an excellent command of English; Dutch is a plus.")).toEqual(["hard:Has an excellent command of English", "optional:Dutch is a plus"])
    expect(texts("Proficient in C/C++. Knowledge of Java and/or Kotlin is a plus. Experience with Git.")).toEqual(["hard:Proficient in C/C++", "hard:Experience with Git", "optional:Knowledge of Java and/or Kotlin is a plus"])
  })
  test("a soft clause after the last comma is split off", () => {
    expect(texts("Excellent command of English and Chinese, Dutch would be a plus")).toEqual(["hard:Excellent command of English and Chinese", "optional:Dutch would be a plus"])
    expect(texts("Excellent language skills in English (fluent written and spoken), French or other European languages are a plus")).toEqual(["hard:Excellent language skills in English (fluent written and spoken)", "optional:French or other European languages are a plus"])
  })
  test("a plus that covers a whole list is one soft line, not cut in the middle", () => {
    expect(texts("Knowledge of Python, SQL, Java is a plus")).toEqual(["optional:Knowledge of Python, SQL, Java is a plus"])
  })
  test("nice to have and bonus are the lower tier, a plus and an advantage the middle one", () => {
    expect(texts("Experience with Kubernetes is a nice to have")[0]).toStartWith("nice:")
    expect(texts("Docker experience is a bonus")[0]).toStartWith("nice:")
    expect(texts("German is an advantage")[0]).toStartWith("optional:")
    expect(texts("Dutch would be a plus")[0]).toStartWith("optional:")
  })
  test("preferably and ideally refine a required core and do not make it a plus", () => {
    expect(texts("5+ years of experience, ideally in a global technology organisation")).toEqual(["hard:5+ years of experience, ideally in a global technology organisation"])
    expect(texts("Experience with an ERP system (preferably SAP)")).toEqual(["hard:Experience with an ERP system (preferably SAP)"])
  })
  test("a line made only of a soft clause stays one soft line", () => {
    expect(texts("(Dutch is a plus)")).toEqual(["optional:Dutch is a plus"])
  })
  test("it never returns an empty list, whatever it is given", () => {
    for (const l of ["", "is a plus", "(is a plus)", ";;;", ". is a bonus .", "x"]) expect(splitSoft(l).length).toBeGreaterThan(0)
  })
})

describe("short lines with no bullet are content, not headings", () => {
  const requirement = ["7+ years of ML engineering experience", "5+ years of experience", "Excellent communication skills", "Strong Excel skills", "Master's degree in finance", "Fluent in English and Dutch", "Experience with SQL and Python", "Bachelor degree in computer science", "Proven track record in sales", "Knowledge of IFRS reporting"]
  for (const l of requirement) test(`"${l}" is a line`, () => expect(isHeading(l)).toBe(false))
  const headings = ["Requirements", "REQUIREMENTS", "Nice to have", "Who you are", "What you'll bring", "About you", "Your profile", "Qualifications:", "Experience & skills", "Preferred qualifications", "Minimum requirements", "Responsibilities", "What we offer", "About the role", "NICE TO HAVE", "The things you bring to Acme as a finance intern", "Must have", "Bonus points"]
  for (const h of headings) test(`"${h}" is a heading`, () => expect(isHeading(h)).toBe(true))
  test("a posting with no bullets still yields its requirement lines, under the right heading", () => {
    const body = "Requirements\n7+ years of ML engineering experience\nExcellent communication skills\nNice to have\nExperience with Kubernetes\nWhat we offer\nA great salary and benefits for everyone"
    const c = candidateLines(body)
    expect(c.find((l) => l.text.startsWith("7+ years"))?.section).toBe("Requirements")
    expect(c.find((l) => l.text.startsWith("Excellent"))?.section).toBe("Requirements")
    expect(c.find((l) => l.text.startsWith("Experience with Kubernetes"))?.section).toBe("Nice to have")
    expect(c.some((l) => l.text.startsWith("A great salary"))).toBe(false)
  })
})

describe("isHeading", () => {
  test("short lines without a sentence are headings", () => {
    for (const h of ["Requirements:", "Nice to have", "What you'll bring", "Preferred Qualifications", "About you:"]) expect(isHeading(h)).toBe(true)
  })
  test("bulleted lines and sentences are not", () => {
    for (const l of ["- 3+ years of SQL", "• Python", "You will build data pipelines.", "", "1. Experience with Java"]) expect(isHeading(l)).toBe(false)
  })
})

describe("candidateLines", () => {
  const body = `About us
We are a company that builds things.

Your role:
- Build pipelines for the data team every single day

Requirements:
- 3+ years of experience with SQL
- Strong command of English (Dutch is a plus)

Nice to have:
- Experience with Tableau dashboards

What we offer:
- A great salary and 25 holidays
- You have a great work-life balance here`
  const lines = candidateLines(body)
  test("each line carries the heading it sits under", () => {
    const sql = lines.find((l) => l.text.includes("SQL"))
    expect(sql?.section).toBe("Requirements")
    expect(lines.find((l) => l.text.includes("Tableau"))?.section).toBe("Nice to have")
  })
  test("mixed lines are split, with both pieces under the same heading", () => {
    expect(lines.find((l) => l.text === "Strong command of English")?.section).toBe("Requirements")
    expect(lines.find((l) => l.text === "Dutch is a plus")?.section).toBe("Requirements")
  })
  test("lines about the role, the company and the offer are left out", () => {
    expect(lines.some((l) => l.text.includes("pipelines"))).toBe(false)
    expect(lines.some((l) => l.text.includes("salary"))).toBe(false)
    expect(lines.some((l) => l.text.includes("builds things"))).toBe(false)
  })
  test("but a requirement cue in such a section keeps the line", () => {
    expect(lines.some((l) => l.text.includes("work-life balance"))).toBe(true)
  })
  test("repeated lines appear once, and a posting with no lines gives none", () => {
    expect(candidateLines("Requirements:\n- Python experience needed\n- Python experience needed").filter((l) => l.text.includes("Python"))).toHaveLength(1)
    expect(candidateLines("")).toEqual([])
  })
})
