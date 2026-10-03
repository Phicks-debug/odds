/**
 * Which line of work a CV points to, and whether a job is in it. Counted from the postings themselves: every posting
 * carries the job family Jev read from its whole text, and src/lib/family-model.json holds which title words and listed
 * skills go with which family (scripts/make-family-model.ts). A CV's job titles, degree and skills are scored against it
 * with plain naive Bayes: no model call, the same CV always gives the same answer.
 *
 * What it is: how likely the words on the CV are to come from postings of that family, 0 to 1. What it is not: a measured
 * effect on hiring. The fit uses it as a part with an assumed weight (fit.ts).
 */
import model from "@/lib/family-model.json"
import { stem, words } from "@/lib/fit"
import type { Profile } from "@/lib/types"

interface Model {
  families: string[]
  totals: number[]
  vocab: Record<string, number[]>
}
const M = model as Model
const V = Object.keys(M.vocab).length
/** Smoothing: a word never seen with a family is unlikely there, not impossible. */
const ALPHA = 0.5

/** The share of belonging to each family for one set of words, summing to 1. Null when none of the words is known. */
export function familyPosterior(tokens: ReadonlyArray<string>): number[] | null {
  const known = tokens.filter((t) => M.vocab[t] !== undefined)
  if (known.length === 0) {
    return null
  }
  const logits = M.families.map((_, f) => known.reduce((sum, t) => sum + Math.log((M.vocab[t][f] + ALPHA) / (M.totals[f] + ALPHA * V)), 0))
  // Several words from one title are not independent evidence, so the sum is damped by how many there are, to the power 0.25.
  // Chosen by scripts/eval-family-model.ts on postings held out of the counts (1,908 of them, 16 families): right 75.6% of the
  // time from title words and skills, 72.5% from title words alone. 0.25 had the lowest log loss with skills; 0.5 was
  // too timid (when it said 49% sure it was right 81% of the time) and 1 far too timid.
  const damp = known.length ** 0.25
  const scaled = logits.map((l) => l / damp)
  const top = Math.max(...scaled)
  const exp = scaled.map((l) => Math.exp(l - top))
  const sum = exp.reduce((a, b) => a + b, 0)

  return exp.map((e) => e / sum)
}

const titleTokens = (text: string): string[] => words(text).map(stem)
const skillTokens = (skills: Iterable<string>): string[] => [...skills].map((s) => `skill:${s.toLowerCase()}`)

/** One reading per job title and per degree, kept per profile so the thousands of jobs scored against it do not redo it. */
const cache = new WeakMap<Profile, Array<number[]>>()

function itemsOf(profile: Profile): Array<number[]> {
  const hit = cache.get(profile)
  if (hit) {
    return hit
  }
  const items: Array<number[]> = []
  for (const p of profile.positions) {
    const post = familyPosterior(titleTokens(p.Title ?? ""))
    if (post) items.push(post)
  }
  for (const e of profile.education) {
    const post = familyPosterior(titleTokens(`${e["Degree Name"] ?? ""} ${e["Field Of Study"] ?? ""}`))
    if (post) items.push(post)
  }
  cache.set(profile, items)

  return items
}

/**
 * How well a job's family matches what the CV points to, 0 to 1: the best match among the person's job titles, degree
 * and skills taken together. Null when the job has no family or the CV has nothing to read.
 */
export function fieldMatch(profile: Profile, skills: Iterable<string>, family: string | null | undefined): number | null {
  const f = family ? M.families.indexOf(family) : -1
  if (f < 0) {
    return null
  }
  const items = [...itemsOf(profile)]
  // Each skill points to a line of work on its own and the best one counts, so adding a skill can never lower the match
  // (skills read together would let an extra, unrelated skill dilute the ones that fit).
  for (const t of skillTokens(skills)) {
    const alone = familyPosterior([t])
    if (alone) items.push(alone)
  }
  if (items.length === 0) {
    return null
  }

  return Math.max(...items.map((p) => p[f]))
}

export const FAMILIES: ReadonlyArray<string> = M.families

/**
 * The department a job title belongs to, in the same families the postings use, or null when the title does not say. A title that
 * sits between two families is left unnamed rather than guessed.
 */
export function departmentOf(title: string): string | null {
  const post = familyPosterior(titleTokens(title))
  if (!post) return null
  const top = Math.max(...post)
  const family = M.families[post.indexOf(top)]

  return top >= 0.45 && family !== "Other" ? family : null
}

/**
 * A job's line of work when Jev has not read it yet (a job added after the last reading): the same words-and-skills counting, applied to the job's
 * own title and listed skills, and only used when it is at least 0.6 sure. Where Jev has read the job, Jev's family is used and this is never asked.
 */
export function guessFamily(title: string, skills: ReadonlyArray<string>): string | null {
  const post = familyPosterior([...titleTokens(title), ...skillTokens(skills)])
  if (!post) {
    return null
  }
  const best = Math.max(...post)

  return best >= 0.6 ? M.families[post.indexOf(best)] : null
}
