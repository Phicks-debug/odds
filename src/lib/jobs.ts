import { daysSince } from "@/lib/format"
import { withSkillTiers } from "@/lib/skill-tiers"
import { supabase } from "@/lib/supabase"
import type { Application, Band, Posting, Profile, TaxParams, Transition } from "@/lib/types"

const COLUMNS =
  "id,employer,employer_display,ats,source,title,region,cat,cbs_group,url,ind_sponsor,ind_sponsor_name,years_min,dutch_required,visa_mention,junior_title,degree_asked,skills,pay_posted,applicants,applicants_text,valid_through,seniority,posted_at,days_open,freshness_state,fetched_at,title_clean,level_jev,level_conf,usable,industry,workplace,job_type,dutch_jev,family"
/** Written by the hourly open/closed check. Left out until the columns exist (supabase/migrations/20261002_posting_checks.sql). */
const CHECK_COLUMNS = ",closed_at,last_checked,posted_on,skill_tiers,enrollment"

const PAGE = 1000

/** What only the view app_jobs has: the level the database works out, and which posting each one was merged into. */
const VIEW_COLUMNS = ",level_view,kept_id,pick_rank,role_kind"

/** One table or view, a thousand rows at a time. Null when it does not exist (the view is not there yet). */
async function readAll(table: string, columns: string): Promise<{ rows: Posting[]; columns: string } | null> {
  const rows: Posting[] = []
  let cols = columns
  for (let from = 0; ; from += PAGE) {
    let { data, error } = await supabase.from(table).select(cols).order("id").range(from, from + PAGE - 1)
    if (error?.code === "42703" && cols.includes(CHECK_COLUMNS)) {
      cols = cols.replace(CHECK_COLUMNS, "")
      ;({ data, error } = await supabase.from(table).select(cols).order("id").range(from, from + PAGE - 1))
    }
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") return null
      throw new Error(error.message)
    }
    rows.push(...((data ?? []) as unknown as Posting[]))
    if ((data ?? []).length < PAGE) break
  }

  return { rows, columns: cols }
}

/**
 * The whole pool, a thousand rows at a time, without the descriptions. It is read from the database view app_jobs, so the database
 * decides which jobs are active, which are the same job found twice, and which level each is. Where the view is missing it falls back to
 * the table and the browser works those out as before.
 */
export async function fetchPostings(): Promise<Posting[]> {
  const fromView = await readAll("app_jobs", COLUMNS + VIEW_COLUMNS + CHECK_COLUMNS)
  const all = fromView?.rows ?? (await readAll("postings", COLUMNS + CHECK_COLUMNS))?.rows ?? (await readAll("postings", COLUMNS))?.rows ?? []

  // Posts the reader of the text found to be no real job (an advert, a list of links) stay out of every list.
  const pool = all.filter((p) => (p.usable == null || p.usable >= 0.5) && !p.closed_at).map((p) => withSkillTiers(p))
  // Where the text plainly asks for Dutch and the first reading missed it, Dutch is required.
  for (const p of pool) {
    if (!p.dutch_required && (p.dutch_jev ?? 0) >= 0.8) {
      p.dutch_required = true
    }
  }
  // The age is worked out from the posting date today, not read from the crawl day, so "7 days ago" stays true as days pass.
  for (const p of pool) {
    if (p.posted_on) {
      p.days_open = daysSince(p.posted_on)
      p.freshness_state = p.days_open <= 6 ? "fresh" : p.days_open <= 44 ? "active" : "aging"
    }
  }
  // One industry per employer: the commonest answer across its postings, so one odd reading cannot split an employer in two.
  const votes = new Map<string, Map<string, number>>()
  for (const p of pool) {
    if (p.industry) {
      const v = votes.get(p.employer) ?? new Map<string, number>()
      v.set(p.industry, (v.get(p.industry) ?? 0) + 1)
      votes.set(p.employer, v)
    }
  }
  for (const p of pool) {
    const v = votes.get(p.employer)
    p.industry = v ? [...v.entries()].sort((a, b) => b[1] - a[1])[0][0] : null
  }

  return pool
}

export async function fetchBody(id: string): Promise<string> {
  const { data, error } = await supabase.from("postings").select("body").eq("id", id).maybeSingle()
  if (error) {
    throw new Error(error.message)
  }

  return (data as { body: string | null } | null)?.body ?? ""
}

/**
 * Jev's reading of what a posting asks for: each line with how much it insists. Null when the column or the
 * posting's reading is not there yet, so the page falls back to reading the text itself.
 */
let jevColumn: boolean | null = null

export async function fetchJevRequirements(id: string): Promise<Array<{ text: string; tier: "must" | "strong" | "optional" | "nice" }> | null> {
  if (jevColumn === false) {
    return null
  }
  const { data, error } = await supabase.from("postings").select("requirements").eq("id", id).maybeSingle()
  if (error) {
    // The column is not in the database yet: ask once, then stop asking.
    jevColumn = false

    return null
  }
  jevColumn = true
  if (!data) {
    return null
  }
  const rows = (data as { requirements?: unknown }).requirements

  return Array.isArray(rows) ? (rows as Array<{ text: string; tier: "must" | "strong" | "optional" | "nice" }>) : null
}

export interface Reference {
  bands: Record<string, Band>
  ageFactors: Record<string, Record<string, number>>
  tax: TaxParams
  transitions: Record<string, Transition>
}

export async function fetchReference(): Promise<Reference> {
  const [bands, ages, tax, transitions] = await Promise.all([
    supabase.from("cbs_bands").select("*"),
    supabase.from("cbs_age_factors").select("sector,age_band,factor"),
    supabase.from("tax_params").select("params").eq("year", 2026).single(),
    supabase.from("transitions").select("*"),
  ])
  for (const result of [bands, ages, tax, transitions]) {
    if (result.error) {
      throw new Error(result.error.message)
    }
  }
  const ageFactors: Record<string, Record<string, number>> = {}
  for (const row of ages.data as Array<{ sector: string; age_band: string; factor: number }>) {
    ;(ageFactors[row.sector] ??= {})[row.age_band] = Number(row.factor)
  }

  return {
    bands: Object.fromEntries((bands.data as unknown as Band[]).map((b) => [b.code, b])),
    ageFactors,
    tax: (tax.data as { params: TaxParams }).params,
    transitions: Object.fromEntries((transitions.data as unknown as Transition[]).map((t) => [t.title, t])),
  }
}

// ---- the signed-in user's own rows (row-level security keeps them private) ----

export async function loadProfile(userId: string): Promise<Partial<Profile> | null> {
  const { data, error } = await supabase.from("profiles").select("data").eq("user_id", userId).maybeSingle()
  if (error) {
    throw new Error(error.message)
  }

  return (data as { data: Partial<Profile> } | null)?.data ?? null
}

export async function saveProfile(userId: string, profile: Profile): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, data: profile, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) {
    throw new Error(error.message)
  }
}

interface ApplicationRow {
  id: number
  posting_id: string
  fit_tier: string
  stage: Application["stage"]
  logged_at: string
}

export async function fetchApplications(postings: Map<string, Posting>): Promise<Application[]> {
  const { data, error } = await supabase.from("applications").select("id,posting_id,fit_tier,stage,logged_at").order("id", { ascending: false })
  if (error) {
    throw new Error(error.message)
  }

  return (data as unknown as ApplicationRow[]).map((row) => ({
    ...row,
    title: postings.get(row.posting_id)?.title ?? row.posting_id,
    employer: postings.get(row.posting_id)?.employer_display ?? "",
  }))
}

export async function insertApplication(userId: string, postingId: string, fitTier: string): Promise<void> {
  const { error } = await supabase.from("applications").insert({ user_id: userId, posting_id: postingId, fit_tier: fitTier })
  if (error) {
    throw new Error(error.message)
  }
}

export async function updateStage(id: number | string, stage: Application["stage"]): Promise<void> {
  const { error } = await supabase.from("applications").update({ stage }).eq("id", id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteApplication(id: number | string): Promise<void> {
  const { error } = await supabase.from("applications").delete().eq("id", id)
  if (error) {
    throw new Error(error.message)
  }
}

/** What a posting's own text says about how and where the work is done. Found on the server, so the list need not download every posting. */
export interface Signals {
  hybrid: boolean
  remote: boolean
  partTime: boolean
  fullTime: boolean
  contract: boolean
}

const SIGNAL_TERMS: Record<keyof Signals, string[]> = {
  hybrid: ["hybrid", "hybride", "work from home", "thuiswerken", "partly remote", "remote work"],
  remote: ["fully remote", "100% remote", "remote-first", "remote first", "remote position", "remote role", "work remotely", "volledig remote"],
  partTime: ["part-time", "part time", "parttime", "deeltijd"],
  fullTime: ["full-time", "full time", "fulltime", "voltijd", "40 hours", "38 hours", "36 hours", "40 uur", "38 uur", "36 uur"],
  contract: ["fixed-term", "fixed term", "freelance", "interim", "temporary", "tijdelijk", "bepaalde tijd", "zzp", "detachering", "contractor"],
}

async function idsMentioning(terms: string[]): Promise<Set<string>> {
  const ids = new Set<string>()
  const filter = terms.map((t) => `body.ilike.*${t.replace(/[,()]/g, " ")}*`).join(",")
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("postings").select("id").or(filter).range(from, from + 999)
    if (error) {
      throw new Error(error.message)
    }
    for (const row of data as Array<{ id: string }>) {
      ids.add(row.id)
    }
    if ((data as unknown[]).length < 1000) {
      return ids
    }
  }
}

/** One pass per kind of wording, each asking the server which postings mention it. */
export async function fetchSignals(): Promise<Record<string, Signals>> {
  const kinds = Object.keys(SIGNAL_TERMS) as Array<keyof Signals>
  const found = await Promise.all(kinds.map((k) => idsMentioning(SIGNAL_TERMS[k])))
  const out: Record<string, Signals> = {}
  kinds.forEach((kind, i) => {
    for (const id of found[i]) {
      out[id] ??= { hybrid: false, remote: false, partTime: false, fullTime: false, contract: false }
      out[id][kind] = true
    }
  })

  return out
}
