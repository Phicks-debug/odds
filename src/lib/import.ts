import { crosswalk, extractPosting, occupationCategory } from "@/lib/engine"
import type { Posting } from "@/lib/types"

/** The columns a list of jobs is read for. Anything else in the file becomes a property of your own. */
const ALIASES = {
  title: ["title", "job title", "position", "role", "job", "vacature", "functie"],
  company: ["company", "company name", "employer", "organisation", "organization", "bedrijf", "werkgever"],
  place: ["location", "city", "place", "region", "locatie", "plaats"],
  link: ["link", "url", "job url", "job link", "posting", "apply link", "website"],
  pay: ["pay", "salary", "compensation", "salaris"],
  text: ["description", "job description", "about", "requirements"],
} as const

type Field = keyof typeof ALIASES

export interface ImportedJob {
  post: Posting
  /** Columns that were not one of the above, with this job's value. */
  extras: Record<string, string>
}

export interface ImportResult {
  jobs: ImportedJob[]
  /** Property names found in the file, in file order. */
  columns: string[]
  /** Rows skipped for having no title or company. */
  skipped: number
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)

const norm = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "")

/** How to read jobs you bring: rows of a spreadsheet saved as CSV. Columns are matched by name in English or Dutch. */
export function readJobs(rows: ReadonlyArray<Record<string, string>>, known: ReadonlyArray<Posting>): ImportResult {
  const headers = rows.length ? Object.keys(rows[0]) : []
  const pick = (field: Field): string | undefined => headers.find((h) => (ALIASES[field] as ReadonlyArray<string>).includes(h.trim().toLowerCase()))
  const at = Object.fromEntries((Object.keys(ALIASES) as Field[]).map((f) => [f, pick(f)])) as Record<Field, string | undefined>
  const used = new Set(Object.values(at).filter((h): h is string => Boolean(h)))
  const columns = headers.filter((h) => h && !used.has(h))
  const employers = new Map<string, Posting>()
  for (const post of known) {
    employers.set(norm(post.employer_display), post)
    employers.set(norm(post.employer), post)
  }
  const stamp = Date.now().toString(36)
  const jobs: ImportedJob[] = []
  let skipped = 0

  rows.forEach((row, index) => {
    const title = at.title ? row[at.title] : ""
    const company = at.company ? row[at.company] : ""
    if (!title || !company) {
      skipped++

      return
    }
    const text = at.text ? (row[at.text] ?? "") : ""
    const match = employers.get(norm(company))
    const code = crosswalk(title)
    const found = extractPosting(title, text)
    const post: Posting = {
      id: `mine-${stamp}-${index}-${slug(company)}`,
      employer: match?.employer ?? company,
      employer_display: match?.employer_display ?? company,
      ats: "mine",
      source: "mine",
      title,
      region: (at.place ? row[at.place] : "") || null,
      cat: code ? occupationCategory(code) : "other",
      cbs_group: code,
      url: (at.link ? row[at.link] : "") || null,
      ind_sponsor: match?.ind_sponsor ?? false,
      ind_sponsor_name: match?.ind_sponsor_name ?? null,
      years_min: found.years_min ?? null,
      dutch_required: found.dutch_required ?? false,
      visa_mention: found.visa_mention ?? false,
      junior_title: found.junior_title ?? false,
      degree_asked: found.degree_asked ?? null,
      skills: found.skills ?? [],
      pay_posted: (at.pay ? row[at.pay] : "") || null,
      applicants: null,
      applicants_text: null,
      valid_through: null,
      seniority: null,
      posted_at: null,
      days_open: null,
      freshness_state: "unknown",
      fetched_at: null,
      body: text,
      local: true,
    }
    jobs.push({ post, extras: Object.fromEntries(columns.map((c) => [c, row[c] ?? ""]).filter(([, v]) => v !== "")) })
  })

  return { jobs, columns, skipped }
}
