/** A row of the `postings` table, without the description body. */
export interface Posting {
  id: string
  /** Read by TypeSafe Jev, null until it has run: the title without noise, the level it judges, how sure it is, and whether the text is a real job. */
  title_clean?: string | null
  level_jev?: string | null
  level_conf?: number | null
  usable?: number | null
  /** Also read by Jev from the text: the employer's industry, where the work is done, the kind of job and how sure it is that Dutch is required. */
  /** The line of work Jev places it in (Finance and accounting, Marketing and communications...), so a career path is read from postings like this one. */
  family?: string | null
  /** From the database view app_jobs: the level the database works out (Jev where sure, else the title and years rules), and which posting this one was merged into. */
  /** What kind of first job, read by Jev from the whole posting: an internship, a working-student job, a traineeship (a paid graduate programme), a regular entry job, or something that is not a first job. Absent where not read. */
  role_kind?: "internship" | "working_student" | "traineeship" | "entry_job" | "other" | null
  level_view?: "Internship" | "Entry" | "Mid" | "Senior" | "Manager" | "Director" | "Not stated" | null
  kept_id?: string | null
  pick_rank?: number | null
  industry?: string | null
  workplace?: string | null
  job_type?: string | null
  dutch_jev?: number | null
  employer: string
  employer_display: string
  ats: string
  source: string
  title: string
  region: string | null
  cat: "finance_business" | "tech" | "other"
  cbs_group: string | null
  url: string | null
  ind_sponsor: boolean
  ind_sponsor_name: string | null
  years_min: number | null
  dutch_required: boolean
  visa_mention: boolean
  junior_title: boolean
  degree_asked: "phd" | "master" | "bachelor" | null
  skills: string[]
  pay_posted: string | null
  applicants: number | null
  applicants_text: string | null
  valid_through: string | null
  seniority: string | null
  posted_at: string | null
  days_open: number | null
  freshness_state: string
  /** The employer's posting date (YYYY-MM-DD), when its board or page shows one. days_open is worked out from it each time the list loads. */
  posted_on?: string | null
  /** Must the applicant be a current student: required, recent (students and recent graduates) or open. Read by Jev from internship-type postings, kept when confident. */
  enrollment?: "required" | "recent" | "open" | null
  /** Set when the employer's own board stopped listing the posting; closed jobs are left out of every list. */
  closed_at?: string | null
  /** When the employer's board last gave a clear answer for this posting. Empty for sources that are not checked. */
  last_checked?: string | null
  fetched_at: string | null
  /** Only loaded on the detail page, or set on a posting the user pasted. */
  body?: string
  /** Every place this job was found, once merged: the platform and the address of each posting. */
  sources?: Array<{ name: string; url: string | null; ats: string }>
  /** How much the posting insists on each skill it names, set on the detail page where the text is read. */
  tiers?: Record<string, "must" | "strong" | "optional" | "nice">
  /** Stored with the posting: the skills its requirement lines name and the tier of each. Becomes skills and tiers when loaded. */
  skill_tiers?: Record<string, "must" | "strong" | "optional" | "nice" | null> | null
  /** True for a posting the user pasted: it lives in this browser only. */
  local?: boolean
}

export interface Band {
  code: string
  label: string
  year: number
  p25_hourly: number
  p50_hourly: number
  p75_hourly: number
  employees_k: number | null
  cagr_2013_2024: number | null
  cagr_2019_2024: number | null
}

export interface Bracket { upto?: number; above?: number; rate: number }
export interface Credit { max: number; phase_out_start: number; phase_out_rate: number; zero_at: number }

export interface TaxParams {
  box1_brackets: Bracket[]
  general_tax_credit: Credit
  labour_tax_credit: Credit
  ruling_30pct: { min_salary: number; min_salary_under30_masters: number; rate_2026: number }
  ind_hsm_thresholds_h2_2026_monthly_excl_holiday: { reduced_orientation_year: number; under_30: number; age_30_plus: number }
  health_insurance_2026: { average_premium_month: number }
}

export interface Transition {
  title: string
  spells: number
  with_next: number
  tenure_q_median: number
  top: Array<[string, number]>
}

export type Row = Record<string, string>

export type Permit = "eu" | "orientation_year" | "hsm" | "other_non_eu"
export type Origin = "dutch" | "eu_non_native" | "non_eu"
export type DutchLevel = "none" | "basic" | "professional" | "native"

export type Relationship = "Referral" | "Recruiter" | "Hiring manager" | "Interviewer" | "Colleague"
/**
 * Where one person is in the outreach, in the order of the "What should I message?" playbook, then the ways it can end. "Contacted",
 * "Replied" and "Met" are the first three of the old list and keep their meaning, so anyone already saved stays valid.
 */
export type ContactStatus = "To contact" | "Contacted" | "Connected" | "Replied" | "Chat booked" | "Met" | "Referral asked" | "Referred" | "No reply" | "Said no" | "Passed me on"
export const RELATIONSHIPS: ReadonlyArray<Relationship> = ["Referral", "Recruiter", "Hiring manager", "Interviewer", "Colleague"]
export const CONTACT_STATUSES: ReadonlyArray<ContactStatus> = ["To contact", "Contacted", "Connected", "Replied", "Chat booked", "Met", "Referral asked", "Referred", "No reply", "Said no", "Passed me on"]

export type MessageKind = "Referral request" | "Follow-up" | "Thank you" | "Introduction" | "Other"
export const MESSAGE_KINDS: ReadonlyArray<MessageKind> = ["Referral request", "Follow-up", "Thank you", "Introduction", "Other"]

/** A message kept on a person: what was said, when, and whether it went out. */
export interface SavedMessage {
  id: string
  date: string
  kind: MessageKind
  direction: "sent" | "draft" | "received"
  body: string
}

/** Wording to start from. {name}, {company}, {job} and {me} are filled in when it is used. */
export interface MessageTemplate {
  id: string
  name: string
  kind: MessageKind
  body: string
}

/** Someone you know at, or through, an employer. Linked to a job it shows under that job and, if a referral, counts in its chance. */
/** What searching one job's company has found and shown so far. See lib/suggest.ts. */
export type PastSearch = import("@/lib/suggest").PastSearch

export interface Person {
  id: string
  name: string
  /** The employer as written on the job it is linked to, or typed in when there is no job yet. */
  company: string
  jobId: string | null
  /** Their position at the company, as the user wrote it. */
  role?: string
  /** Kept only so older saved people still load; nothing asks for it or shows it any more. */
  relationship?: Relationship
  status: ContactStatus
  /** When the stage last changed (ISO date), so a nudge can be due a week later. Absent on people saved before this. */
  statusAt?: string
  contact: string
  notes: string
  /** Their profile picture address, kept when they were added from the suggestions. LinkedIn pictures can expire; where one stops loading, none is shown. */
  photo?: string
  /** Where they are based, and what the search found about them: kept so "More details" can show it. */
  place?: string
  about?: string
  positions?: import("@/lib/suggest").PersonPosition[]
  /** Messages kept on this person. Absent on people added before messages existed. */
  messages?: SavedMessage[]
}

export type ViewName = "table" | "board" | "people" | "peopleBoard"

/** How one view is set up: what is hidden and what it is sorted by. Kept with the profile, so it follows you. */
export interface ViewConfig {
  hidden: string[]
  sortKey: string
  sortDir: "asc" | "desc"
  /** Names you gave to our properties on this view. */
  names?: Record<string, string>
}

export type PropertyType = "text" | "select" | "date" | "checkbox" | "url" | "number"

/** Which visa route the pay figures use. */
export type PermitRoute = "eu" | "orientation_year" | "hsm_under_30" | "hsm_30_plus"

/** What the person ticks when working out what they keep: remembered, so every job counts the same way. */
export interface PayChoices {
  ruling: boolean
  masterFloor: boolean
  route: PermitRoute
}

export interface Profile {
  /** Ticks made on the pay of any job. Absent until the person changes one; then each box starts where their answers put it. */
  payChoices?: PayChoices
  permit: Permit
  birth: number
  abroad: number
  origin: Origin
  dutch: DutchLevel
  /** Studying now, as the person says. Null: not said, so it is read from the dates on the education entries. */
  studying: boolean | null
  salary: string
  /** No longer asked: tailoring is a choice per job (the what-if on the job page), not a fact about the person. Kept so saved profiles still load. */
  tailor: boolean
  cv: string
  /** The file the CV text was read from, when it was uploaded. */
  cvName?: string
  positions: Row[]
  education: Row[]
  skills: Row[]
  languages: Row[]
  occ: string
  /** Who you are, shown on the profile page. None of it is used to rank jobs. */
  name: string
  headline: string
  place: string
  about: string
  /** A small picture as a data URL, made in the browser. Empty for initials. */
  avatar: string
  /** The LinkedIn link this profile was read from, once connected. */
  linkedin?: string
  /** Names of the properties you added to the job tracker, in order. */
  columns: string[]
  /** What each property holds. A property missing here is text. */
  columnTypes: Record<string, PropertyType>
  /** Your values for those properties, by job id then property name. */
  notes: Record<string, Record<string, string>>
  /** The people in your search, each optionally tied to a job. */
  people: Person[]
  /** Past people searches, by job id: what each found and when. Kept with the profile, newest 25 jobs. */
  peopleFound?: Record<string, PastSearch>
  /** Table, board and people each keep their own hidden properties and sort. */
  views: Partial<Record<ViewName, ViewConfig>>
  /** Your message templates. Null until you change them, when the starting set is used. */
  templates: MessageTemplate[] | null
  /** True once the sign-up questions were answered. */
  onboarded: boolean
  /** What you told us you are looking for: the same filters as the job list, kept. Null until you set them. */
  prefs: import("@/lib/filters").JobFilters | null
  /** Whether the list of jobs for you follows those preferences. */
  prefsOn: boolean
}

export const DEFAULT_PROFILE: Profile = {
  permit: "other_non_eu",
  birth: 1998,
  abroad: 0,
  origin: "non_eu",
  dutch: "basic",
  studying: null,
  salary: "",
  tailor: false,
  cv: "",
  positions: [],
  education: [],
  skills: [],
  languages: [],
  occ: "",
  name: "",
  headline: "",
  place: "",
  about: "",
  avatar: "",
  columns: [],
  columnTypes: {},
  notes: {},
  people: [],
  views: {},
  templates: null,
  onboarded: false,
  prefs: null,
  prefsOn: false,
}

export interface Application {
  id: number | string
  posting_id: string
  title: string
  employer: string
  fit_tier: string
  stage: "applied" | "interview" | "offer" | "hired" | "rejected"
  logged_at: string
}
