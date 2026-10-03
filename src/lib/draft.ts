import { type } from "arktype"
import { DRAFT_KEY } from "@/lib/session"

/**
 * Bumped when the shape below changes. A draft from an older build is dropped
 * rather than migrated: it is one unfinished form, not something worth keeping.
 */
const VERSION = 2

export const journeyDraft = type({
  version: "number",
  step: "string",
  form: {
    permit: "'eu' | 'orientation_year' | 'hsm' | 'other_non_eu'",
    origin: "'dutch' | 'eu_non_native' | 'non_eu' | ''",
    birth: "string",
    abroad: "string",
    dutch: "'none' | 'basic' | 'professional' | 'native' | ''",
    studying: "'yes' | 'no' | ''",
    salary: "string",
  },
})

export type JourneyDraft = typeof journeyDraft.infer

/** The unfinished journey from this browser, or null. A lost draft is a re-typed form, not an error worth showing. */
export function loadDraft(): JourneyDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) {
      return null
    }
    const parsed = journeyDraft(JSON.parse(raw))
    if (parsed instanceof type.errors || parsed.version !== VERSION) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveDraft(draft: Omit<JourneyDraft, "version">): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: VERSION, ...draft }))
  } catch {
    return
  }
}
