// What the LinkedIn lookup returns about a person beyond name and picture: their current positions and their About text.
// Kept so "More details" can show everything the search found. Pure, so the tests can run it.
type Json = Record<string, unknown>

export interface PersonPosition {
  title: string
  company: string
  /** "Oct 2026": when they started this position, if given. */
  since?: string
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const text = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")

export function personDetails(p: Json): { about: string; positions: PersonPosition[] } {
  const about = text(p.summary ?? p.about).slice(0, 600)
  const list = Array.isArray(p.currentPositions) ? (p.currentPositions as Json[]) : []
  const positions = list
    .filter((c) => c && typeof c === "object" && text(c.title))
    .slice(0, 3)
    .map((c) => {
      const on = (c.startedOn ?? {}) as Json
      const year = Number(on.year)
      const month = Number(on.month)
      const since = Number.isInteger(year) && year > 1950 && year < 2100 ? `${Number.isInteger(month) && month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ` : ""}${year}` : undefined

      return { title: text(c.title).slice(0, 120), company: text(c.companyName).slice(0, 80), ...(since ? { since } : {}) }
    })

  return { about, positions }
}
