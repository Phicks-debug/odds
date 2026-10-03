/**
 * How well a person fits one job, from what the posting asks and what their CV
 * says. Three parts, each 0 to 1, each checkable on the page:
 *   skills: the share of the posting's listed skills and tools the CV has
 *   level:  how close the posting's level is to the level their years of work point to
 *   role:   the share of the words in the job title that appear in their roles, education and CV
 * Where Jev has read the CV for this job, a fourth thing can lift the score: employers, positions, prizes and grades (strength.ts).
 * The weights are our assumption, since no study measures them; they are written here
 * and shown on the job page, not hidden.
 */
export interface FitPart {
  key: "skills" | "level" | "role" | "field" | "strength"
  label: string
  /** 0 to 1 */
  value: number
  /** One short line saying what was compared, in plain words. */
  detail: string
}

export interface Fit {
  /** 0 to 1: the weighted share of the parts that could be judged. */
  score: number
  parts: FitPart[]
}

export const FIT_WEIGHTS = { skills: 0.4, role: 0.4, level: 0.2 } as const

/**
 * The weights once the job's line of work is known and the CV points to one (field.ts). Whether the job is in the CV's
 * line of work is the biggest single thing apart from skills, so it takes the larger share of what "role" was.
 */
export const FIT_WEIGHTS_FIELD = { skills: 0.35, field: 0.3, role: 0.15, level: 0.2 } as const

/**
 * A posting that lists one skill and a CV that has it is not a perfect match: there is too little to go on. The skills score
 * counts as if this many extra must-have lines had been met at an average rate, so it needs real evidence to reach the ends.
 * Our assumption.
 */
export const SKILL_PRIOR = 2

/**
 * How far a strong track record can lift the fit, as a share of how far above average it reads (strength.ts). It is added
 * on top of skills, role and level, never mixed in as a part with a weight, so an ordinary record (exactly average) leaves
 * the fit as it was. Nobody loses for having no famous employer. Our assumption; no study measures it.
 */
export const STRENGTH_PULL = 0.4

/** Where an average applicant sits on the 0 to 1 scale. Our assumption: the base hiring rates are for everyone who applies. */
export const FIT_AVERAGE = 0.4

const LEVEL_RANK: Record<string, number> = { Internship: 1, Entry: 1, Mid: 2, Senior: 3, Manager: 4, Director: 5 }

/** The level a number of years of work points to. A guide with round cut-offs, not a rule. */
export function levelFromYears(years: number): number {
  return years < 2 ? 1 : years < 5 ? 2 : years < 9 ? 3 : 4
}

// Words in a title that say how senior it is, where it is, or who may apply, not what the work is.
const NOT_THE_WORK = new Set([
  "the", "and", "for", "with", "all", "genders", "gender", "senior", "junior", "sr", "jr", "lead", "head", "principal", "intern", "internship", "stage", "stagiair", "graduate", "trainee",
  "traineeship", "entry", "level", "programme", "program", "emea", "europe", "european", "global", "nl", "netherlands", "dutch", "remote", "hybrid", "amsterdam", "rotterdam", "utrecht",
  "eindhoven", "the hague", "months", "month", "year", "full", "part", "time", "fulltime", "parttime", "english", "speaking", "start", "starting", "new", "open",
])

export function words(text: string): string[] {
  return text.toLowerCase().replace(/&amp;/g, "&").split(/[^a-z0-9+#.]+/).map((w) => w.replace(/^[.]+|[.]+$/g, "")).filter((w) => w.length >= 3 && !NOT_THE_WORK.has(w))
}

export const stem = (w: string): string => w.replace(/(ing|ers|er|ies|es|s)$/, "")

export type WantedTier = "must" | "strong" | "optional" | "nice" | "unspecified"

/**
 * How much each kind of requirement counts when the skills are compared. A must-have counts fully, a
 * nice-to-have a fifth. "Unspecified" is a skill the posting names without saying how much it insists
 * (the list read off the text, or a posting with no requirements part). The weights are our assumption.
 */
export const TIER_WEIGHT: Record<WantedTier, number> = { must: 1, strong: 0.7, optional: 0.4, nice: 0.2, unspecified: 0.6 }

export interface FitInput {
  title: string
  /** The posting's level in the app's own words: Internship, Entry, Mid, Senior, Manager, Director or Not stated. */
  level: string
  /** Years of work, including any what-if. */
  years: number
  /** The skills and tools the posting lists, each with how much it insists on it. */
  wanted: Array<{ name: string; tier: WantedTier }>
  /** Which of them the person has. */
  have: (skill: string) => boolean
  /** Everything the person has written about themselves, lower case: roles, education, skills, CV. */
  text: string
  /** 0 to 1: how well the job's line of work matches the CV's (field.ts). Absent when either side is unknown. */
  field?: number | null
  /** The track record for this job, read by Jev (strength.ts). Absent when it has not been read: the fit is then the three parts as before. */
  strength?: { value: number; detail: string } | null
}

export function fitOf(input: FitInput): Fit | null {
  const parts: FitPart[] = []

  if (input.wanted.length > 0) {
    const got = input.wanted.filter((w) => input.have(w.name))
    const total = input.wanted.reduce((sum, w) => sum + TIER_WEIGHT[w.tier], 0)
    const earned = got.reduce((sum, w) => sum + TIER_WEIGHT[w.tier], 0)
    const label: Record<WantedTier, string> = { must: "must-have", strong: "strong plus", optional: "preferred", nice: "nice to have", unspecified: "listed" }
    const detail = (["must", "strong", "optional", "nice", "unspecified"] as const)
      .map((tier) => ({ tier, n: input.wanted.filter((w) => w.tier === tier).length, k: got.filter((w) => w.tier === tier).length }))
      .filter((t) => t.n > 0)
      .map((t) => `${t.k} of ${t.n} ${label[t.tier]}`)
      .join(", ")
    parts.push({ key: "skills", label: "Skills", value: (earned + FIT_AVERAGE * SKILL_PRIOR) / (total + SKILL_PRIOR), detail })
  }

  if (input.field != null) {
    const pct = Math.round(input.field * 100)
    parts.push({ key: "field", label: "Field", value: input.field, detail: input.field >= 0.5 ? `your titles, degree and skills point to this line of work (${pct}%)` : input.field >= 0.15 ? `partly the line of work your CV points to (${pct}%)` : `a different line of work from your CV (${pct}%)` })
  }

  const titleWords = [...new Set(words(input.title).map(stem))]
  if (titleWords.length > 0 && input.text.trim()) {
    const mine = new Set(words(input.text).map(stem))
    const hit = titleWords.filter((w) => mine.has(w))
    parts.push({ key: "role", label: "Role", value: hit.length / titleWords.length, detail: hit.length > 0 ? `${hit.join(", ")} on your profile` : "nothing from the title on your profile" })
  }

  const rank = LEVEL_RANK[input.level]
  if (rank != null) {
    const mine = levelFromYears(input.years)
    const gap = Math.abs(rank - mine)
    parts.push({ key: "level", label: "Level", value: gap === 0 ? 1 : gap === 1 ? 0.5 : 0, detail: gap === 0 ? "the level your years point to" : gap === 1 ? "one step from your years" : "two or more steps from your years" })
  }

  if (parts.length === 0) {
    return null
  }
  const W: Record<string, number> = parts.some((p) => p.key === "field") ? FIT_WEIGHTS_FIELD : FIT_WEIGHTS
  const known = parts.reduce((sum, p) => sum + (W[p.key] ?? 0), 0)
  const raw = parts.reduce((sum, p) => sum + p.value * (W[p.key] ?? 0), 0) / known
  // Strength alone says nothing about the job, so it only counts next to at least one other part. It only lifts, never lowers.
  const lift = input.strength ? STRENGTH_PULL * Math.max(0, Math.min(1, input.strength.value) - FIT_AVERAGE) : 0
  if (input.strength) {
    parts.push({ key: "strength", label: "Track record", value: Math.min(1, Math.max(0, input.strength.value)), detail: input.strength.detail })
  }

  // A fit judged on one part alone says little, so it is pulled back toward the average by the share of the weight we could judge.
  return { score: Math.min(1, FIT_AVERAGE + (raw - FIT_AVERAGE) * known + lift), parts }
}
