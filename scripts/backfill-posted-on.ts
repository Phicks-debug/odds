/**
 * Fills postings.posted_on with the date the employer's own board or page shows:
 *   SUPABASE_ACCESS_TOKEN=... bun scripts/backfill-posted-on.ts          (dry run, prints what it would write)
 *   SUPABASE_ACCESS_TOKEN=... bun scripts/backfill-posted-on.ts --write
 * Sources: the date already read into posted_at (ISO, Dutch "18 aug. 2026", Workday "Posted 5 Days Ago" counted from the crawl day),
 * and for Greenhouse and Ashby postings that had none, the board's first_published / publishedAt, matched as the open check does.
 * Workday "30+ days" and SuccessFactors give no date and stay empty.
 */
import { boardUrl, idFromUrl, norm, type Row } from "../supabase/functions/_shared/ats-check"

const REF = "ukpmpyfcnbhngkgbnkxi"
const token = process.env.SUPABASE_ACCESS_TOKEN
const base = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!token || !base || !key) {
  throw new Error("Set SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY")
}
const write = process.argv.includes("--write")

interface P extends Row {
  posted_at: string | null
  fetched_at: string | null
  posted_on: string | null
}
const rows: P[] = []
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${base}/rest/v1/postings?select=id,ats,employer,title,url,posted_at,fetched_at,posted_on&order=id`, { headers: { apikey: key, "Range-Unit": "items", Range: `${from}-${from + 999}` } })
  const page = (await res.json()) as P[]
  rows.push(...page)
  if (page.length < 1000) {
    break
  }
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mrt: 3, apr: 4, mei: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12 }
const iso = (y: number, m: number, d: number): string | null => {
  const t = new Date(Date.UTC(y, m - 1, d))

  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null
}
const minusDays = (day: string, n: number): string => new Date(Date.parse(day) - n * 86_400_000).toISOString().slice(0, 10)

/** The date a posted_at text states, or null when it states none. */
export function parsePosted(text: string | null, fetched: string | null): string | null {
  if (!text) {
    return null
  }
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    return iso(+m[1], +m[2], +m[3])
  }
  m = text.match(/^(\d{1,2}) ([a-z]{3})\.? (\d{4})$/i)
  if (m && MONTHS[m[2].toLowerCase()]) {
    return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1])
  }
  if (fetched) {
    if (/^Posted Today$/i.test(text)) {
      return fetched
    }
    if (/^Posted Yesterday$/i.test(text)) {
      return minusDays(fetched, 1)
    }
    m = text.match(/^Posted (\d+) Days? Ago$/i)
    if (m) {
      return minusDays(fetched, +m[1])
    }
  }

  return null
}

const found = new Map<string, string>()
for (const r of rows) {
  const d = parsePosted(r.posted_at, r.fetched_at)
  if (d) {
    found.set(r.id, d)
  }
}
console.log(`from the date already read: ${found.size}`)

// Greenhouse and Ashby postings with no date: ask the board.
const wanted = rows.filter((r) => !found.has(r.id) && (r.ats === "greenhouse" || r.ats === "ashby"))
const boards = new Map<string, Promise<{ byId: Map<string, string>; byTitle: Map<string, string> } | null>>()
for (const r of wanted) {
  const url = boardUrl(r)
  if (url && !boards.has(url)) {
    boards.set(
      url,
      fetch(url, { headers: { "user-agent": "odds-job-check/1.0" } })
        .then((res) => (res.ok ? res.text() : null))
        .then((text) => {
          if (!text) {
            return null
          }
          const jobs = (JSON.parse(text).jobs ?? []) as Array<Record<string, string | number>>
          const byId = new Map<string, string>()
          const byTitle = new Map<string, string>()
          for (const j of jobs) {
            const when = String(j.first_published ?? j.publishedAt ?? "").slice(0, 10)
            if (/^\d{4}-\d{2}-\d{2}$/.test(when)) {
              byId.set(String(j.id), when)
              byTitle.set(norm(String(j.title)), when)
            }
          }
          return { byId, byTitle }
        })
        .catch(() => null),
    )
  }
}
let fromBoards = 0
for (const r of wanted) {
  const board = await boards.get(boardUrl(r) ?? "")
  const id = idFromUrl(r.ats, r.url)
  const d = (id ? board?.byId.get(id) : undefined) ?? board?.byTitle.get(norm(r.title))
  if (d) {
    found.set(r.id, d)
    fromBoards++
  }
}
console.log(`from the employer boards: ${fromBoards} (of ${wanted.length} asked)`)

const todo = [...found].filter(([id, d]) => rows.find((r) => r.id === id)?.posted_on !== d)
const left = rows.filter((r) => !found.has(r.id))
console.log(`to write: ${todo.length}; still without a date: ${left.length}`)
const byAts = new Map<string, number>()
for (const r of left) {
  byAts.set(r.ats, (byAts.get(r.ats) ?? 0) + 1)
}
console.log("without a date, by source:", Object.fromEntries(byAts))
if (write) {
  for (let i = 0; i < todo.length; i += 300) {
    const chunk = todo.slice(i, i + 300)
    const query = `update public.postings p set posted_on = v.d::date from (values ${chunk.map(([id, d]) => `('${id}','${d}')`).join(",")}) as v(id, d) where p.id = v.id`
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) })
    if (!res.ok) {
      throw new Error(`write failed ${res.status} ${await res.text()}`)
    }
  }
  console.log("written")
}
